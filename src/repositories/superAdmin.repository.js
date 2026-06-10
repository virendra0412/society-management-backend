const SuperAdmin             = require("../models/superAdmin.model");
const { SocietyApplication } = require("../models/societyApplication.model");
const { Subscription }       = require("../models/subscription.model");
const { Society }            = require("../models/society.model");
const User                   = require("../models/user.model");
const Issue                  = require("../models/issue.model");
const MaintenanceBill        = require("../models/maintenance.model");
const AmenityBooking         = require("../models/amenity.model").AmenityBooking;
const Visitor                = require("../models/visitor.model");
const crypto                 = require("crypto");

// ─── Super Admin CRUD ─────────────────────────────────────────────────────────

const findSuperAdminByEmail = (email) =>
  SuperAdmin.findOne({ email: email.toLowerCase() }).select("+password +refreshTokenHash +passwordChangedAt");

const findSuperAdminById = (id, withSensitive = false) => {
  const q = SuperAdmin.findById(id);
  return withSensitive ? q.select("+password +refreshTokenHash +passwordChangedAt") : q;
};

const storeSARefreshTokenHash = (id, token) => {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return SuperAdmin.findByIdAndUpdate(id, { refreshTokenHash: hash });
};

const clearSARefreshToken = (id) =>
  SuperAdmin.findByIdAndUpdate(id, { refreshTokenHash: null });

const getSAByRefreshTokenHash = (token) => {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return SuperAdmin.findOne({ refreshTokenHash: hash }).select("+refreshTokenHash +passwordChangedAt");
};

// ─── Society Applications ─────────────────────────────────────────────────────

const createApplication = (data) => SocietyApplication.create(data);

const findApplicationById = (id) =>
  SocietyApplication.findById(id).populate("reviewedBy", "name email").populate("society").populate("adminUser", "name email");

const findApplications = (filters = {}, { skip = 0, limit = 20 } = {}) =>
  Promise.all([
    SocietyApplication.find(filters)
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SocietyApplication.countDocuments(filters),
  ]).then(([applications, total]) => ({ applications, total }));

const updateApplication = (id, update) =>
  SocietyApplication.findByIdAndUpdate(id, update, { new: true }).populate("reviewedBy", "name email");

// ─── Subscription ─────────────────────────────────────────────────────────────

const createSubscription = (data) => Subscription.create(data);

const findSubscriptionBySociety = (societyId) =>
  Subscription.findOne({ society: societyId }).populate("createdBy", "name email");

const updateSubscription = (societyId, update) =>
  Subscription.findOneAndUpdate({ society: societyId }, update, { new: true });

const findSubscriptions = (filters = {}, { skip = 0, limit = 20 } = {}) =>
  Promise.all([
    Subscription.find(filters)
      .populate("society", "name city state isActive")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Subscription.countDocuments(filters),
  ]).then(([subscriptions, total]) => ({ subscriptions, total }));

// ─── Society queries ──────────────────────────────────────────────────────────

const findAllSocieties = (filters = {}, { skip = 0, limit = 20 } = {}) =>
  Promise.all([
    Society.find(filters)
      .populate("admin", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Society.countDocuments(filters),
  ]).then(([societies, total]) => ({ societies, total }));

const findSocietyById = (id) =>
  Society.findById(id).populate("admin", "name email phone flat wing");

// ─── Analytics queries ────────────────────────────────────────────────────────

/**
 * Per-society analytics — runs 7 lightweight aggregation / count queries
 * in parallel and assembles the result.
 */
const getSocietyAnalytics = async (societyId) => {
  const sid = societyId;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [
    residentStats,
    issueStats,
    maintenanceStats,
    visitorStats,
    bookingStats,
    newResidents30d,
    issues30d,
  ] = await Promise.all([
    // Resident breakdown — query memberships array (role/society/isApproved are not top-level)
    User.aggregate([
      { $match: { "memberships.society": sid, isActive: true } },
      { $unwind: "$memberships" },
      { $match: { "memberships.society": sid, "memberships.role": "resident" } },
      {
        $group: {
          _id:      null,
          total:    { $sum: 1 },
          active:   { $sum: { $cond: ["$isActive", 1, 0] } },
          approved: { $sum: { $cond: ["$memberships.isApproved", 1, 0] } },
          pending:  { $sum: { $cond: [{ $and: [{ $eq: ["$memberships.isApproved", false] }, { $eq: ["$isActive", true] }] }, 1, 0] } },
        },
      },
    ]),

    // Issue breakdown
    Issue.aggregate([
      { $match: { society: sid } },
      {
        $group: {
          _id:        null,
          total:      { $sum: 1 },
          open:       { $sum: { $cond: [{ $eq: ["$status", "Open"] },        1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] } },
          resolved:   { $sum: { $cond: [{ $eq: ["$status", "Resolved"] },    1, 0] } },
        },
      },
    ]),

    // Maintenance collection — latest published bill only
    MaintenanceBill.aggregate([
      { $match: { society: sid, isPublished: true } },
      { $sort:  { createdAt: -1 } },
      { $limit: 1 },
      { $unwind: { path: "$payments", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id:          null,
          totalDue:     { $sum: "$payments.totalDue"   },
          totalPaid:    { $sum: "$payments.paidAmount"  },
          paidCount:    { $sum: { $cond: [{ $in: ["$payments.status", ["paid", "waived"]] }, 1, 0] } },
          overdueCount: { $sum: { $cond: [{ $eq:  ["$payments.status",  "overdue"]        }, 1, 0] } },
          totalRecords: { $sum: 1 },
        },
      },
    ]),

    // Visitor stats (last 30 days)
    Visitor.aggregate([
      { $match: { society: sid, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id:      null,
          total:    { $sum: 1 },
          approved: { $sum: { $cond: [{ $in:  ["$status", ["approved", "exited"]] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq:  ["$status", "rejected"] },            1, 0] } },
        },
      },
    ]),

    // Amenity bookings this month
    AmenityBooking.countDocuments({
      society:   sid,
      status:    { $in: ["confirmed", "completed"] },
      startTime: { $gte: thirtyDaysAgo },
    }),

    // New residents last 30 days
    User.countDocuments({ "memberships.society": sid, "memberships.role": "resident", createdAt: { $gte: thirtyDaysAgo } }),

    // Issues raised last 30 days
    Issue.countDocuments({ society: sid, createdAt: { $gte: thirtyDaysAgo } }),
  ]);

  const r  = residentStats[0]   || { total: 0, active: 0, approved: 0, pending: 0 };
  const i  = issueStats[0]      || { total: 0, open: 0, inProgress: 0, resolved: 0 };
  const m  = maintenanceStats[0]|| { totalDue: 0, totalPaid: 0, paidCount: 0, overdueCount: 0, totalRecords: 0 };
  const v  = visitorStats[0]    || { total: 0, approved: 0, rejected: 0 };

  const collectionPct = m.totalDue > 0
    ? Math.round((m.totalPaid / m.totalDue) * 100)
    : null;

  return {
    residents: {
      total:    r.total,
      active:   r.active,
      approved: r.approved,
      pending:  r.pending,
      inactive: r.total - r.active,
    },
    issues: {
      total:      i.total,
      open:       i.open,
      inProgress: i.inProgress,
      resolved:   i.resolved,
    },
    maintenance: {
      latestBillTotalDue:  m.totalDue,
      latestBillCollected: m.totalPaid,
      collectionPercent:   collectionPct,
      paidCount:           m.paidCount,
      overdueCount:        m.overdueCount,
      totalPaymentRecords: m.totalRecords,
    },
    visitors: {
      last30Days: v.total,
      approved:   v.approved,
      rejected:   v.rejected,
    },
    activity: {
      last30Days: {
        newResidents:    newResidents30d,
        issuesRaised:    issues30d,
        bookingsConfirmed: bookingStats,
        visitorsLogged:  v.total,
      },
    },
  };
};

const periodStartDate = (period = "30d") => {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period] || 30;
  return new Date(Date.now() - days * 86_400_000);
};

/**
 * Global platform overview for super admin dashboard.
 */
const getGlobalAnalytics = async (period = "30d") => {
  const since = periodStartDate(period);
  const createdInPeriod = { createdAt: { $gte: since } };

  const [
    societyStats,
    subscriptionStats,
    totalResidents,
    activeResidents,
    openIssues,
  ] = await Promise.all([
    Society.aggregate([
      { $match: createdInPeriod },
      {
        $group: {
          _id:    null,
          total:  { $sum: 1 },
          active: { $sum: { $cond: ["$isActive",   1, 0] } },
          inactive:{ $sum: { $cond: ["$isActive",  0, 1] } },
        },
      },
    ]),

    Subscription.aggregate([
      { $match: createdInPeriod },
      {
        $group: {
          _id:       "$plan",
          count:     { $sum: 1 },
          active:    { $sum: { $cond: [{ $eq: ["$status", "active"] },    1, 0] } },
          expired:   { $sum: { $cond: [{ $eq: ["$status", "expired"] },   1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] } },
          mrr:       { $sum: { $cond: [{ $eq: ["$status", "active"] }, "$priceMonthly", 0] } },
        },
      },
    ]),

    User.countDocuments({ memberships: { $elemMatch: { role: "resident", isApproved: true } }, ...createdInPeriod }),
    User.countDocuments({ memberships: { $elemMatch: { role: "resident", isApproved: true } }, isActive: true, ...createdInPeriod }),
    Issue.countDocuments({ status: { $in: ["Open", "In Progress"] }, ...createdInPeriod }),
  ]);

  const s   = societyStats[0] || { total: 0, active: 0, inactive: 0 };
  const sub = subscriptionStats.reduce((acc, row) => {
    acc[row._id] = { count: row.count, active: row.active, expired: row.expired, suspended: row.suspended, mrr: row.mrr };
    return acc;
  }, {});

  const totalMRR = subscriptionStats.reduce((sum, row) => sum + row.mrr, 0);

  return {
    societies: {
      total:    s.total,
      active:   s.active,
      inactive: s.inactive,
    },
    subscriptions: {
      trial:   sub.trial   || { count: 0, active: 0, expired: 0, suspended: 0, mrr: 0 },
      basic:   sub.basic   || { count: 0, active: 0, expired: 0, suspended: 0, mrr: 0 },
      premium: sub.premium || { count: 0, active: 0, expired: 0, suspended: 0, mrr: 0 },
      totalMRR,
    },
    residents: {
      total:  totalResidents,
      active: activeResidents,
    },
    issues: {
      open: openIssues,
    },
    period,
  };
};

module.exports = {
  // Super Admin
  findSuperAdminByEmail,
  findSuperAdminById,
  storeSARefreshTokenHash,
  clearSARefreshToken,
  getSAByRefreshTokenHash,
  // Applications
  createApplication,
  findApplicationById,
  findApplications,
  updateApplication,
  // Subscriptions
  createSubscription,
  findSubscriptionBySociety,
  updateSubscription,
  findSubscriptions,
  // Societies
  findAllSocieties,
  findSocietyById,
  // Analytics
  getSocietyAnalytics,
  getGlobalAnalytics,
};
