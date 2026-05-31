const crypto    = require("crypto");
const bcrypt    = require("bcryptjs");
const repo      = require("../repositories/superAdmin.repository");
const Society   = require("../models/society.model");
const User      = require("../models/user.model");
const { Subscription, PLAN_LIMITS } = require("../models/subscription.model");
const AppError  = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const {
  signSuperAdminAccessToken,
  signSuperAdminRefreshToken,
  verifySuperAdminRefreshToken,
} = require("../middlewares/superAdmin.middleware");

class SuperAdminService {

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async _issueTokenPair(sa) {
    const payload      = { superAdminId: sa._id.toString(), email: sa.email, role: "superadmin" };
    const accessToken  = signSuperAdminAccessToken(payload);
    const refreshToken = signSuperAdminRefreshToken({ superAdminId: sa._id.toString() });
    await repo.storeSARefreshTokenHash(sa._id, refreshToken);
    return { accessToken, refreshToken };
  }

  async login({ email, password }) {
    const sa = await repo.findSuperAdminByEmail(email);
    if (!sa || !sa.isActive) throw AppError.unauthorized("Invalid credentials.");
    if (sa.isLocked()) throw AppError.tooMany("Account temporarily locked. Try again in 15 minutes.");

    const isMatch = await sa.comparePassword(password);
    if (!isMatch) {
      await sa.incrementLoginAttempts();
      throw AppError.unauthorized("Invalid credentials.");
    }
    if (sa.loginAttempts > 0) await sa.resetLoginAttempts();

    sa.lastLoginAt = new Date();
    await sa.save({ validateBeforeSave: false });

    const tokens = await this._issueTokenPair(sa);
    return { superAdmin: await repo.findSuperAdminById(sa._id), ...tokens };
  }

  async refreshTokens(incomingToken) {
    const decoded = verifySuperAdminRefreshToken(incomingToken);
    const sa = await repo.getSAByRefreshTokenHash(incomingToken);
    if (!sa) {
      // Possible token reuse — clear all sessions
      if (decoded?.superAdminId) await repo.clearSARefreshToken(decoded.superAdminId);
      throw AppError.unauthorized("Invalid session. Please log in again.");
    }
    return this._issueTokenPair(sa);
  }

  async logout(superAdminId) {
    await repo.clearSARefreshToken(superAdminId);
  }

  async changePassword(superAdminId, { currentPassword, newPassword }) {
    const sa = await repo.findSuperAdminById(superAdminId, true);
    const ok = await sa.comparePassword(currentPassword);
    if (!ok) throw AppError.badRequest("Current password is incorrect.");
    sa.password = newPassword;
    sa.refreshTokenHash = null; // invalidate all sessions
    await sa.save();
    return { message: "Password updated. Please log in again." };
  }

  // ─── Society Applications ───────────────────────────────────────────────────

  async applyForSociety(data, applicantIp) {
    // Prevent duplicate pending applications for the same email
    const existing = await repo.findApplications({ adminEmail: data.adminEmail.toLowerCase(), status: "pending" });
    if (existing.total > 0) {
      throw AppError.conflict("A pending application already exists for this email address.", "DUPLICATE_APPLICATION");
    }
    return repo.createApplication({ ...data, applicantIp });
  }

  async listApplications(query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status) filters.status = query.status;
    const { applications, total } = await repo.findApplications(filters, { skip, limit });
    return { applications, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getApplication(id) {
    const app = await repo.findApplicationById(id);
    if (!app) throw AppError.notFound("Application not found.");
    return app;
  }

  /**
   * Approve an application:
   *   1. Create Society document.
   *   2. Create admin User document (temporary password, must change on first login).
   *   3. Create trial Subscription.
   *   4. Link Society → admin User.
   *   5. Update application → approved.
   */
  async approveApplication(applicationId, { note }, reviewingSuperAdmin) {
    const app = await repo.findApplicationById(applicationId);
    if (!app) throw AppError.notFound("Application not found.");
    if (app.status !== "pending") throw AppError.badRequest(`Application is already ${app.status}.`);

    // Check for email collision in User collection
    const emailTaken = await User.findOne({ email: app.adminEmail });
    if (emailTaken) {
      throw AppError.conflict(
        `A user with email ${app.adminEmail} already exists. Use a different admin email.`,
        "EMAIL_TAKEN"
      );
    }

    // 1. Create Society (isActive: true by default)
    const society = await Society.create({
      name:       app.societyName,
      address:    app.address,
      city:       app.city,
      state:      app.state,
      totalUnits: app.totalUnits,
      joinMode:   "approval",
      isActive:   true,
      // admin will be set after user is created
      admin:      new (require("mongoose").Types.ObjectId)(), // temp placeholder
    });

    // 2. Create admin User
    const tempPassword = _generateTempPassword();
    const adminUser = await User.create({
      name:       app.adminName,
      email:      app.adminEmail,
      phone:      app.adminPhone,
      password:   tempPassword,
      role:       "admin",
      society:    society._id,
      flat:       "ADMIN",
      wing:       null,
      isApproved: true,
      isActive:   true,
    });

    // 3. Update society with real admin
    society.admin = adminUser._id;
    await society.save();

    // 4. Create trial subscription
    const subData = Subscription.buildTrial(society._id, reviewingSuperAdmin._id);
    await repo.createSubscription(subData);

    // 5. Update application
    await repo.updateApplication(applicationId, {
      status:     "approved",
      reviewedBy: reviewingSuperAdmin._id,
      reviewedAt: new Date(),
      reviewNote: note || null,
      society:    society._id,
      adminUser:  adminUser._id,
    });

    // In production → send email with tempPassword to app.adminEmail
    console.log(`[SUPERADMIN] Society approved: ${society.name} | Admin: ${adminUser.email} | TempPwd: ${tempPassword}`);

    return {
      society,
      adminUser: { _id: adminUser._id, name: adminUser.name, email: adminUser.email },
      tempPassword: process.env.NODE_ENV !== "production" ? tempPassword : undefined,
      message: "Application approved. Society created with trial subscription.",
    };
  }

  async rejectApplication(applicationId, { note }, reviewingSuperAdmin) {
    const app = await repo.findApplicationById(applicationId);
    if (!app) throw AppError.notFound("Application not found.");
    if (app.status !== "pending") throw AppError.badRequest(`Application is already ${app.status}.`);

    return repo.updateApplication(applicationId, {
      status:     "rejected",
      reviewedBy: reviewingSuperAdmin._id,
      reviewedAt: new Date(),
      reviewNote: note || null,
    });
  }

  // ─── Society Management ─────────────────────────────────────────────────────

  async listSocieties(query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.isActive !== undefined) filters.isActive = query.isActive === "true";
    if (query.city)  filters.city  = new RegExp(query.city,  "i");
    if (query.state) filters.state = new RegExp(query.state, "i");

    const { societies, total } = await repo.findAllSocieties(filters, { skip, limit });

    // Attach subscription to each society
    const societyIds = societies.map(s => s._id);
    const subs = await Subscription.find({ society: { $in: societyIds } }).lean();
    const subMap = subs.reduce((m, s) => { m[s.society.toString()] = s; return m; }, {});

    const enriched = societies.map(soc => ({
      ...soc.toJSON(),
      subscription: subMap[soc._id.toString()] || null,
    }));

    return { societies: enriched, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getSocietyDetail(societyId) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    const subscription = await repo.findSubscriptionBySociety(societyId);
    return { society, subscription };
  }

  async updateSubscription(societyId, updates, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const currentSub = await repo.findSubscriptionBySociety(societyId);
    if (!currentSub) throw AppError.notFound("No subscription found for this society.");

    const historyEntry = {
      action:     "updated",
      fromPlan:   currentSub.plan,
      toPlan:     updates.plan   || currentSub.plan,
      fromStatus: currentSub.status,
      toStatus:   updates.status || currentSub.status,
      note:       updates.note   || null,
      performedBy:  superAdmin._id,
      performedAt:  new Date(),
    };

    const { note, ...subFields } = updates;

    const updated = await repo.updateSubscription(societyId, {
      ...subFields,
      $push: { history: historyEntry },
    });
    return updated;
  }

  async suspendSociety(societyId, { reason }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    if (!society.isActive) throw AppError.badRequest("Society is already inactive.");

    await Society.findByIdAndUpdate(societyId, { isActive: false });

    // Suspend subscription
    await repo.updateSubscription(societyId, {
      status: "suspended",
      $push:  {
        history: {
          action: "suspended", fromStatus: "active", toStatus: "suspended",
          note: reason, performedBy: superAdmin._id, performedAt: new Date(),
        },
      },
    });

    return { message: "Society suspended." };
  }

  async reactivateSociety(societyId, { note }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    if (society.isActive) throw AppError.badRequest("Society is already active.");

    await Society.findByIdAndUpdate(societyId, { isActive: true });

    const sub = await repo.findSubscriptionBySociety(societyId);
    if (sub && sub.status === "suspended") {
      await repo.updateSubscription(societyId, {
        status: "active",
        $push:  {
          history: {
            action: "reactivated", fromStatus: "suspended", toStatus: "active",
            note: note || null, performedBy: superAdmin._id, performedAt: new Date(),
          },
        },
      });
    }

    return { message: "Society reactivated." };
  }

  /**
   * Transfer admin ownership to an existing approved resident/admin of the society.
   */
  async transferAdmin(societyId, { newAdminUserId, note }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const newAdmin = await User.findById(newAdminUserId);
    if (!newAdmin) throw AppError.notFound("Target user not found.");
    if (newAdmin.society?.toString() !== societyId.toString()) {
      throw AppError.badRequest("Target user does not belong to this society.");
    }
    if (!newAdmin.isApproved || !newAdmin.isActive) {
      throw AppError.badRequest("Target user must be an active, approved member.");
    }

    const prevAdminId = society.admin;

    // Demote old admin → resident, promote new admin
    await User.findByIdAndUpdate(prevAdminId, { role: "resident" });
    await User.findByIdAndUpdate(newAdminUserId, { role: "admin" });
    await Society.findByIdAndUpdate(societyId, { admin: newAdminUserId });

    console.log(`[SUPERADMIN] Admin transfer: ${society.name} | ${prevAdminId} → ${newAdminUserId} | Note: ${note}`);

    return { message: `Admin ownership transferred to ${newAdmin.name}.` };
  }

  /**
   * Force-reset a society's admin password.
   * In production this should send the new password via email.
   */
  async resetAdminPassword(societyId, { newPassword }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const adminUser = await User.findById(society.admin).select("+password");
    if (!adminUser) throw AppError.notFound("Society admin user not found.");

    adminUser.password = newPassword;
    adminUser.refreshTokenHash = null; // invalidate existing sessions
    await adminUser.save();

    console.log(`[SUPERADMIN] Password reset for admin ${adminUser.email} of society ${society.name}`);

    return {
      message: "Admin password reset. All existing sessions have been invalidated.",
      adminEmail: adminUser.email,
    };
  }

  // ─── Analytics ──────────────────────────────────────────────────────────────

  async getSocietyAnalytics(societyId) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    const [analytics, subscription] = await Promise.all([
      repo.getSocietyAnalytics(society._id),
      repo.findSubscriptionBySociety(society._id),
    ]);
    return { society: { _id: society._id, name: society.name, city: society.city }, subscription, analytics };
  }

  async getGlobalAnalytics() {
    return repo.getGlobalAnalytics();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _generateTempPassword() {
  // 12-char alphanumeric + special: e.g. "Xk7#mN2@pLq9"
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${pwd}@1`; // ensure meets minlength + has special char
}

module.exports = new SuperAdminService();
