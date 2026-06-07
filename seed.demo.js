/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  SOCIETY APP — DEMO SEED  v2  (multi-society schema)                        ║
 * ║                                                                              ║
 * ║  Run:  node seed.demo.js                                                     ║
 * ║  Env:  MONGODB_URI  (defaults to mongodb://127.0.0.1:27017/society_db)      ║
 * ║                                                                              ║
 * ║  Scale                                                                       ║
 * ║  ─────────────────────────────────────────────────────────────────────────  ║
 * ║  SuperAdmin           :  1                                                   ║
 * ║  Societies            :  3  (trial/basic/premium-suspended)                 ║
 * ║  Society Applications :  4  (pending×2, approved×1, rejected×1)            ║
 * ║  Subscriptions        :  3  (one per society)                               ║
 * ║  Users                :  16                                                  ║
 * ║    • 3 society admins  (one per society)                                    ║
 * ║    • 3 committee members  (Treasurer / Maintenance Head / Parking Head)     ║
 * ║    • 1 security guard                                                        ║
 * ║    • 1 vendor                                                                ║
 * ║    • 8 residents  (approved)                                                 ║
 * ║    • 1 pending resident                                                      ║
 * ║    • 1 multi-society investor  (Society 1 + Society 2)                      ║
 * ║  Issues               :  16  (all categories & statuses)                   ║
 * ║  Notices              :  6                                                   ║
 * ║  Polls                :  3   (1 closed, 2 open)                            ║
 * ║  Help Posts           :  6                                                   ║
 * ║  Contacts             :  10                                                  ║
 * ║  Visitors             :  18  (OTP×4 / walk-in×3 / trusted×5 / delivery×2) ║
 * ║  Maintenance Bills    :  3   (published / closed / draft)                  ║
 * ║  Amenities            :  3                                                   ║
 * ║  Amenity Bookings     :  8                                                   ║
 * ║  Events               :  4   (past / upcoming / draft / cancelled)         ║
 * ║  Parking Slots        :  20                                                  ║
 * ║  Parking Requests     :  8                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";

// ─── Models ──────────────────────────────────────────────────────────────────
// NOTE: Use correct destructuring for named exports — MUST match module.exports
const SuperAdmin              = require("./src/models/superAdmin.model");
const { Subscription }        = require("./src/models/subscription.model");
const { SocietyApplication }  = require("./src/models/societyApplication.model");
const { Society }             = require("./src/models/society.model");       // named export
const User                    = require("./src/models/user.model");
const Issue                   = require("./src/models/issue.model");
const Notice                  = require("./src/models/notice.model");
const Poll                    = require("./src/models/poll.model");
const Help                    = require("./src/models/help.model");
const Contact                 = require("./src/models/contact.model");
const Visitor                 = require("./src/models/visitor.model");
const MaintenanceBill         = require("./src/models/maintenance.model");   // default export
const { Amenity, AmenityBooking } = require("./src/models/amenity.model");
const { Event }               = require("./src/models/event.model");
const { ParkingSlot, ParkingRequest } = require("./src/models/parking.model");

// ─── Console colours ─────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  magenta: "\x1b[35m", red: "\x1b[31m", blue: "\x1b[34m", gray: "\x1b[90m",
};
const log = {
  section: (t) => console.log(`\n${c.bold}${c.magenta}▶  ${t}${c.reset}`),
  ok:      (t) => console.log(`${c.green}   ✔  ${t}${c.reset}`),
  info:    (t) => console.log(`${c.cyan}   ℹ  ${t}${c.reset}`),
  warn:    (t) => console.log(`${c.yellow}   ⚠  ${t}${c.reset}`),
};

// ─── Time helpers ─────────────────────────────────────────────────────────────
const daysAgo     = (d) => new Date(Date.now() - d * 86_400_000);
const daysFromNow = (d) => new Date(Date.now() + d * 86_400_000);
const hoursAgo    = (h) => new Date(Date.now() - h * 3_600_000);
const atHour      = (base, h) => { const d = new Date(base); d.setHours(h, 0, 0, 0); return d; };

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║   Society App — Demo Seed v2 (new schema)  ║${c.reset}`);
  console.log(`${c.bold}╚════════════════════════════════════════════╝${c.reset}\n`);

  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe ────────────────────────────────────────────────────────────────
  log.section("Clearing all collections");
  await Promise.all([
    SuperAdmin.deleteMany({}),
    Subscription.deleteMany({}),
    SocietyApplication.deleteMany({}),
    Society.deleteMany({}),
    User.deleteMany({}),
    Issue.deleteMany({}),
    Notice.deleteMany({}),
    Poll.deleteMany({}),
    Help.deleteMany({}),
    Contact.deleteMany({}),
    Visitor.deleteMany({}),
    MaintenanceBill.deleteMany({}),
    Amenity.deleteMany({}),
    AmenityBooking.deleteMany({}),
    Event.deleteMany({}),
    ParkingSlot.deleteMany({}),
    ParkingRequest.deleteMany({}),
  ]);
  log.ok("All collections cleared");

  // ════════════════════════════════════════════════════════════════════════
  //  SUPER ADMIN
  // ════════════════════════════════════════════════════════════════════════
  log.section("Creating Super Admin");
  const superAdmin = await SuperAdmin.create({
    name:     "Super Admin",
    email:    "superadmin@societyapp.com",
    password: "SuperAdmin@123",
    isActive: true,
  });
  log.ok(`${superAdmin.email}  /  SuperAdmin@123`);

  // ════════════════════════════════════════════════════════════════════════
  //  SOCIETIES  (create shells first — admin ref linked after user creation)
  // ════════════════════════════════════════════════════════════════════════
  log.section("Creating 3 Societies");

  const placeholder = new mongoose.Types.ObjectId();

  const society1 = await Society.create({
    name: "Sunrise Residency",
    address: "Plot No. 42, Satellite Road",
    city: "Ahmedabad", state: "Gujarat",
    admin: placeholder,
    joinMode: "approval", totalUnits: 120,
    isActive: true, approvalStatus: "approved",
    registeredBy: superAdmin._id,
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true, maintenance: true, amenities: true,
      events: false, parking: false, community: false, analytics: false, multilang: false,
    },
    moduleCharges: {
      issues: 199, visitors: 350, maintenance: 499, amenities: 249,
      events: 199, parking: 249, community: 299, analytics: 399, multilang: 199,
    },
    upgradeRequests: [
      { module: "analytics", requestedAt: daysAgo(3), status: "pending" },
      { module: "parking",   requestedAt: daysAgo(1), status: "pending" },
    ],
  });

  const society2 = await Society.create({
    name: "Green Valley Apartments", address: "Survey No. 12, SG Highway",
    city: "Ahmedabad", state: "Gujarat",
    admin: placeholder, joinMode: "open", totalUnits: 80,
    isActive: true, approvalStatus: "approved",
    registeredBy: superAdmin._id,
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true, maintenance: false, amenities: false,
      events: false, parking: false, community: false, analytics: false, multilang: false,
    },
    moduleCharges: { issues: 199, visitors: 399, maintenance: 499, amenities: 249, events: 199, parking: 249, community: 299, analytics: 399, multilang: 199 },
  });

  const society3 = await Society.create({
    name: "Blue Horizon CHS", address: "Prahlad Nagar, Thaltej Road",
    city: "Ahmedabad", state: "Gujarat",
    admin: placeholder, joinMode: "approval", totalUnits: 200,
    isActive: false, approvalStatus: "approved",
    registeredBy: superAdmin._id,
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true, maintenance: true, amenities: true,
      events: true, parking: true, community: true, analytics: true, multilang: true,
    },
    moduleCharges: { issues: 199, visitors: 399, maintenance: 499, amenities: 249, events: 199, parking: 249, community: 299, analytics: 399, multilang: 199 },
  });

  log.ok(`"Sunrise Residency"       joinCode: ${c.bold}${c.yellow}${society1.joinCode}${c.reset}  [Operations Bundle]`);
  log.ok(`"Green Valley Apartments" joinCode: ${c.bold}${c.yellow}${society2.joinCode}${c.reset}  [Starter Bundle]`);
  log.ok(`"Blue Horizon CHS"        joinCode: ${c.bold}${c.yellow}${society3.joinCode}${c.reset}  [Full Stack — suspended]`);

  // ════════════════════════════════════════════════════════════════════════
  //  USERS — NEW SCHEMA: memberships[] + activeSocietyId
  //
  //  ⚠️  IMPORTANT: top-level society/role/flat/isApproved are GONE.
  //      All membership data lives inside memberships[].
  // ════════════════════════════════════════════════════════════════════════

  // Helper: build a default permission object by role
  const permsByRole = (role) => ({
    admin:     { visitors:"full",  maintenance:"full",  issues:"full",  notices:"full",  parking:"full",  amenities:"full",  residents:"write" },
    committee: { visitors:"none",  maintenance:"none",  issues:"none",  notices:"none",  parking:"none",  amenities:"none",  residents:"none"  },
    security:  { visitors:"full",  maintenance:"none",  issues:"none",  notices:"none",  parking:"none",  amenities:"none",  residents:"read"  },
    vendor:    { visitors:"none",  maintenance:"none",  issues:"read",  notices:"none",  parking:"none",  amenities:"none",  residents:"none"  },
    resident:  { visitors:"none",  maintenance:"none",  issues:"none",  notices:"none",  parking:"none",  amenities:"none",  residents:"none"  },
  })[role];

  // ── Society 1 Admin ────────────────────────────────────────────────────
  log.section("Creating Society 1 — Admin");
  const admin = await User.create({
    name: "Admin Sharma", email: "admin@sunriseresidency.com",
    phone: "+919876543210", password: "Admin@1234",
    memberships: [{
      society: society1._id, flat: "A-101", wing: "A",
      role: "admin", isApproved: true, isActive: true,
      permissions: permsByRole("admin"),
    }],
    activeSocietyId: society1._id,
    familyMembers: [{ name: "Meena Sharma", relation: "Spouse" }],
    isActive: true,
  });
  await Society.findByIdAndUpdate(society1._id, { admin: admin._id });
  log.ok(`admin → ${admin.email}  /  Admin@1234  (Flat A-101)`);

  // ── Society 1 Committee Members ────────────────────────────────────────
  log.section("Creating 3 Committee Members");

  const treasurer = await User.create({
    name: "Rekha Iyer", email: "rekha.iyer@sunriseresidency.com",
    phone: "+919898765432", password: "Committee@1234",
    memberships: [{
      society: society1._id, flat: "B-301", wing: "B",
      role: "committee", isApproved: true, isActive: true,
      committeeTitle: "Treasurer",
      permissions: { visitors:"none", maintenance:"full", issues:"read", notices:"read", parking:"none", amenities:"none", residents:"read" },
    }],
    activeSocietyId: society1._id, isActive: true,
  });

  const maintHead = await User.create({
    name: "Suresh Trivedi", email: "suresh.trivedi@sunriseresidency.com",
    phone: "+919887654321", password: "Committee@1234",
    memberships: [{
      society: society1._id, flat: "A-301", wing: "A",
      role: "committee", isApproved: true, isActive: true,
      committeeTitle: "Maintenance Head",
      permissions: { visitors:"none", maintenance:"none", issues:"full", notices:"write", parking:"none", amenities:"none", residents:"none" },
    }],
    activeSocietyId: society1._id, isActive: true,
  });

  const parkingHead = await User.create({
    name: "Vijay Rao", email: "vijay.rao@sunriseresidency.com",
    phone: "+919876501234", password: "Committee@1234",
    memberships: [{
      society: society1._id, flat: "C-401", wing: "C",
      role: "committee", isApproved: true, isActive: true,
      committeeTitle: "Parking In-charge",
      permissions: { visitors:"none", maintenance:"none", issues:"none", notices:"none", parking:"full", amenities:"none", residents:"read" },
    }],
    activeSocietyId: society1._id, isActive: true,
  });
  log.ok("Treasurer (Rekha) · Maintenance Head (Suresh) · Parking (Vijay)  /  Committee@1234");

  // ── Security Guard ────────────────────────────────────────────────────
  log.section("Creating Security Guard");
  const security = await User.create({
    name: "Ramesh Guard", email: "guard@sunriseresidency.com",
    phone: "+919845000001", password: "Guard@1234",
    memberships: [{
      society: society1._id, flat: null, wing: null,
      role: "security", isApproved: true, isActive: true,
      committeeTitle: "Security Guard",
      permissions: permsByRole("security"),
    }],
    activeSocietyId: society1._id, isActive: true,
  });
  log.ok(`${security.email}  /  Guard@1234`);

  // ── Vendor ──────────────────────────────────────────────────────────────
  log.section("Creating Vendor");
  const vendor = await User.create({
    name: "QuickFix Services", email: "vendor@quickfix.com",
    phone: "+919845678901", password: "Vendor@1234",
    memberships: [{
      society: society1._id, flat: null, wing: null,
      role: "vendor", isApproved: true, isActive: true,
      permissions: permsByRole("vendor"),
    }],
    activeSocietyId: society1._id, isActive: true,
  });
  log.ok(`${vendor.email}  /  Vendor@1234`);

  // ── 8 Residents (approved) ────────────────────────────────────────────
  log.section("Creating 8 Residents + 1 Pending");
  const residentData = [
    { name: "Rahul Mehta",   email: "rahul.mehta@resident.com",   phone: "+919812345678", wing: "A", flat: "A-201" },
    { name: "Priya Patel",   email: "priya.patel@resident.com",   phone: "+919823456789", wing: "A", flat: "A-202" },
    { name: "Kiran Joshi",   email: "kiran.joshi@resident.com",   phone: "+919834567890", wing: "B", flat: "B-101" },
    { name: "Deepak Nair",   email: "deepak.nair@resident.com",   phone: "+919845678902", wing: "B", flat: "B-102" },
    { name: "Sneha Reddy",   email: "sneha.reddy@resident.com",   phone: "+919856789013", wing: "B", flat: "B-201" },
    { name: "Arjun Kapoor",  email: "arjun.kapoor@resident.com",  phone: "+919867890124", wing: "C", flat: "C-101" },
    { name: "Meera Shah",    email: "meera.shah@resident.com",    phone: "+919878901235", wing: "C", flat: "C-102" },
    { name: "Vivek Trivedi", email: "vivek.trivedi@resident.com", phone: "+919889012346", wing: "C", flat: "C-201" },
  ];

  const residents = [];
  for (const rd of residentData) {
    const u = await User.create({
      name: rd.name, email: rd.email, phone: rd.phone, password: "Resident@1234",
      memberships: [{
        society: society1._id, flat: rd.flat, wing: rd.wing,
        role: "resident", isApproved: true, isActive: true,
        permissions: permsByRole("resident"),
      }],
      activeSocietyId: society1._id,
      familyMembers: [{ name: `${rd.name.split(" ")[0]} Jr.`, relation: "Child" }],
      isActive: true,
    });
    residents.push(u);
  }

  // Pending resident
  const pendingResident = await User.create({
    name: "Amit Desai", email: "amit.desai@resident.com",
    phone: "+919999000001", password: "Resident@0001",
    memberships: [{
      society: society1._id, flat: "C-301", wing: "C",
      role: "resident", isApproved: false, isActive: true,
      permissions: permsByRole("resident"),
    }],
    activeSocietyId: society1._id, isActive: true,
  });
  log.ok(`8 residents (Resident@1234)  +  pending: ${pendingResident.email}  /  Resident@0001`);

  // ── Multi-Society Investor ─────────────────────────────────────────────
  log.section("Creating Multi-Society User (Investor)");
  const multiUser = await User.create({
    name: "Rohan Investor", email: "rohan.investor@gmail.com",
    phone: "+919900112233", password: "Investor@1234",
    memberships: [
      {
        society: society1._id, flat: "A-401", wing: "A",
        role: "resident", isApproved: true, isActive: true,
        permissions: permsByRole("resident"),
      },
      {
        society: society2._id, flat: "G-102", wing: "G",
        role: "resident", isApproved: true, isActive: true,
        permissions: permsByRole("resident"),
      },
    ],
    activeSocietyId: society1._id,  // currently active in Society 1
    isActive: true,
  });
  log.ok(`${multiUser.email}  /  Investor@1234  (A-401 in Sunrise + G-102 in Green Valley)`);

  // ── Society 2 + 3 Admins ─────────────────────────────────────────────
  log.section("Creating Society 2 & 3 Admins");
  const admin2 = await User.create({
    name: "Ravi Patel", email: "admin@greenvalley.com",
    phone: "+919765432100", password: "Admin@1234",
    memberships: [{
      society: society2._id, flat: "A-001", wing: "A",
      role: "admin", isApproved: true, isActive: true,
      permissions: permsByRole("admin"),
    }],
    activeSocietyId: society2._id, isActive: true,
  });
  await Society.findByIdAndUpdate(society2._id, { admin: admin2._id });

  const admin3 = await User.create({
    name: "Sunita Mehta", email: "admin@bluehorizon.com",
    phone: "+919654321000", password: "Admin@1234",
    memberships: [{
      society: society3._id, flat: "A-001", wing: "A",
      role: "admin", isApproved: true, isActive: true,
      permissions: permsByRole("admin"),
    }],
    activeSocietyId: society3._id, isActive: true,
  });
  await Society.findByIdAndUpdate(society3._id, { admin: admin3._id });
  log.ok("Society 2: Ravi Patel  ·  Society 3: Sunita Mehta  /  Admin@1234");

  // ════════════════════════════════════════════════════════════════════════
  //  SUBSCRIPTIONS
  // ════════════════════════════════════════════════════════════════════════
  log.section("Creating Subscriptions");

  await Subscription.create({
    society: society1._id, plan: "trial", status: "active",
    startDate: daysAgo(12), endDate: daysFromNow(18),
    priceMonthly: 0, autoRenew: false, createdBy: superAdmin._id,
    adminNotes: "Demo society — on trial (Operations Bundle unlocked manually).",
    history: [{ action: "created", toPlan: "trial", toStatus: "active", note: "Trial started", performedBy: superAdmin._id, performedAt: daysAgo(12) }],
  });
  await Subscription.create({
    society: society2._id, plan: "basic", status: "active",
    startDate: daysAgo(60), endDate: daysFromNow(30),
    priceMonthly: 999, autoRenew: true, createdBy: superAdmin._id,
    history: [
      { action: "created",  toPlan: "trial", toStatus: "active", note: "Trial started",        performedBy: superAdmin._id, performedAt: daysAgo(90) },
      { action: "upgraded", fromPlan: "trial", toPlan: "basic",  note: "Upgraded after trial", performedBy: superAdmin._id, performedAt: daysAgo(60) },
    ],
  });
  await Subscription.create({
    society: society3._id, plan: "premium", status: "suspended",
    startDate: daysAgo(120), endDate: daysAgo(5),
    priceMonthly: 2499, autoRenew: false, createdBy: superAdmin._id,
    adminNotes: "Suspended — payment failure.",
    history: [
      { action: "created",   toPlan: "trial",   toStatus: "active",    note: "Trial started",        performedBy: superAdmin._id, performedAt: daysAgo(150) },
      { action: "upgraded",  fromPlan: "trial",  toPlan: "premium",    note: "Upgraded to premium",  performedBy: superAdmin._id, performedAt: daysAgo(120) },
      { action: "suspended", fromStatus: "active", toStatus: "suspended", note: "Payment failed",    performedBy: superAdmin._id, performedAt: daysAgo(5) },
    ],
  });
  log.ok("Society 1 → trial  ·  Society 2 → basic  ·  Society 3 → premium (suspended)");

  // ════════════════════════════════════════════════════════════════════════
  //  SOCIETY APPLICATIONS
  // ════════════════════════════════════════════════════════════════════════
  log.section("Creating 4 Society Applications");
  await SocietyApplication.create({
    societyName: "Sunrise Residency", address: "Plot No. 42, Satellite Road",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 120,
    adminName: "Admin Sharma", adminEmail: "admin@sunriseresidency.com", adminPhone: "+919876543210",
    status: "approved", reviewedBy: superAdmin._id, reviewedAt: daysAgo(14),
    reviewNote: "All details verified.", society: society1._id, adminUser: admin._id,
  });
  await SocietyApplication.create({
    societyName: "Palm Grove Society", address: "Bodakdev, Ahmedabad",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 60,
    adminName: "Girish Joshi", adminEmail: "admin@palmgrove.com", adminPhone: "+919812312312", status: "pending",
  });
  await SocietyApplication.create({
    societyName: "Silver Heights CHS", address: "Maninagar, Ahmedabad",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 200,
    adminName: "Dilip Rao", adminEmail: "admin@silverheights.com", adminPhone: "+919823423423", status: "pending",
  });
  await SocietyApplication.create({
    societyName: "Fake Society Xyz", address: "Unknown",
    city: "Surat", state: "Gujarat", totalUnits: 5,
    adminName: "Test Reject", adminEmail: "reject@fake.com", adminPhone: "+919000000000",
    status: "rejected", reviewedBy: superAdmin._id, reviewedAt: daysAgo(3),
    reviewNote: "Incomplete details.",
  });
  log.ok("4 applications (approved×1, pending×2, rejected×1)");

  // ════════════════════════════════════════════════════════════════════════
  //  ISSUES — 16
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 16 Issues");

  const issueRows = [
    { title: "Water leakage in flat corridor",        category: "Water",       priority: "High",   status: "Open",        ri: 0 },
    { title: "Lift out of order in Tower B",          category: "Lift",        priority: "High",   status: "Open",        ri: 1, isEscalated: true },
    { title: "Gate not closing properly",             category: "Security",    priority: "Medium", status: "Open",        ri: 2, isAnonymous: true },
    { title: "Garbage bin overflowing near Gate 1",   category: "Garbage",     priority: "Low",    status: "Open",        ri: 3 },
    { title: "Street light not working in parking",   category: "Electricity", priority: "Medium", status: "In Progress", ri: 4 },
    { title: "Loud music after 10 PM",                category: "Noise",       priority: "Low",    status: "In Progress", ri: 5 },
    { title: "Car parked in wrong slot",              category: "Parking",     priority: "Medium", status: "In Progress", ri: 6 },
    { title: "Gym equipment not maintained",          category: "Other",       priority: "Low",    status: "In Progress", ri: 7 },
    { title: "Overhead tank overflow",                category: "Water",       priority: "High",   status: "Resolved",    ri: 0 },
    { title: "Lift door sensor malfunctioning",       category: "Lift",        priority: "High",   status: "Resolved",    ri: 2 },
    { title: "CCTV camera not working",               category: "Security",    priority: "Medium", status: "Resolved",    ri: 1 },
    { title: "Garbage collection absent 3 days",      category: "Garbage",     priority: "Medium", status: "Resolved",    ri: 3 },
    { title: "Power fluctuation in Wing B",           category: "Electricity", priority: "High",   status: "Resolved",    ri: 4 },
    { title: "Dog barking all night",                 category: "Noise",       priority: "Low",    status: "Resolved",    ri: 5 },
    { title: "Double parking in basement",            category: "Parking",     priority: "Medium", status: "Resolved",    ri: 6 },
    { title: "Common area floor tile broken",         category: "Other",       priority: "Medium", status: "Resolved",    ri: 7 },
  ];

  await Issue.insertMany(issueRows.map((d, i) => ({
    title: d.title,
    description: `Reported by flat ${residents[d.ri].memberships[0].flat}. Ongoing for ${i + 1} days.`,
    category: d.category, priority: d.priority, status: d.status,
    society: society1._id,
    reporter: residents[d.ri]._id,
    flat: residents[d.ri].memberships[0].flat,
    isAnonymous: d.isAnonymous || false,
    assignedTo: d.status !== "Open" ? admin._id : null,
    resolvedAt: d.status === "Resolved" ? daysAgo(i % 5 + 1) : null,
    isEscalated: d.isEscalated || false,
    escalatedAt: d.isEscalated ? daysAgo(1) : null,
    comments: d.status !== "Open" ? [{
      author: admin._id, body: "Acknowledged. Maintenance team notified.",
      isAdminReply: true, createdAt: daysAgo(i % 3 + 1),
    }] : [],
    createdAt: daysAgo(i + 1),
  })));
  log.ok("16 issues (Open×4, In Progress×4, Resolved×8)");

  // ════════════════════════════════════════════════════════════════════════
  //  NOTICES — 6
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 6 Notices");
  await Notice.insertMany([
    { title: "🚨 Emergency: Water Supply Shutdown Tomorrow 6AM–2PM", body: "Due to pipeline maintenance, water supply suspended tomorrow 6 AM–2 PM. Please store water.\n\n— Management Committee",                                               tag: "Urgent",   society: society1._id, postedBy: admin._id,       isPinned: true,  isPublished: true,  createdAt: daysAgo(1) },
    { title: "💰 May 2025 Maintenance Charges Due — Pay Before 31st",  body: "Monthly maintenance charges of ₹2,500 due by May 31st. Late payments attract ₹100 penalty.\n\n— Treasurer",                                                        tag: "Finance",  society: society1._id, postedBy: treasurer._id,  isPinned: true,  isPublished: true,  createdAt: daysAgo(5) },
    { title: "🎉 Republic Day Celebration — January 26 at 9 AM",       body: "All residents invited to Republic Day flag hoisting at the society ground.",                                                                                          tag: "Event",    society: society1._id, postedBy: admin._id,       isPinned: false, isPublished: true,  createdAt: daysAgo(20) },
    { title: "📌 New Parking Rules — Effective June 1st",               body: "Visitor parking max 12 hours. Violating vehicles will be towed. — Parking In-charge",                                                                              tag: "Notice",   society: society1._id, postedBy: parkingHead._id, isPinned: false, isPublished: true,  createdAt: daysAgo(10) },
    { title: "🔔 REMINDER: AGM This Sunday — Attendance Mandatory",    body: "Annual General Meeting this Sunday 11 AM in Community Hall. Agenda: FY accounts, elections, terrace proposal.",                                                      tag: "Reminder", society: society1._id, postedBy: admin._id,       isPinned: false, isPublished: true,  createdAt: daysAgo(3) },
    { title: "🔧 Lift Maintenance Shutdown — Saturday 8AM–12PM (DRAFT)", body: "Lift maintenance Saturday morning. Emergency lift operational. — Maintenance Head",                                                                              tag: "Notice",   society: society1._id, postedBy: maintHead._id,  isPinned: false, isPublished: false, createdAt: daysAgo(0) },
  ]);
  log.ok("6 notices (2 pinned, 1 draft, posted by admin + committee roles)");

  // ════════════════════════════════════════════════════════════════════════
  //  POLLS — 3
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Polls");
  await Poll.insertMany([
    {
      question: "Which day suits best for the monthly society meeting?",
      options: [
        { label: "First Sunday",   votes: 4, voters: residents.slice(0,4).map(r=>r._id) },
        { label: "Last Sunday",    votes: 2, voters: residents.slice(4,6).map(r=>r._id) },
        { label: "First Saturday", votes: 1, voters: [residents[6]._id] },
        { label: "Any Weekday",    votes: 1, voters: [residents[7]._id] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysAgo(5), isClosed: true, isAnonymous: false, totalVotes: 8, createdAt: daysAgo(20),
    },
    {
      question: "Should we install EV charging stations in parking?",
      options: [
        { label: "Yes — urgent need",          votes: 3, voters: residents.slice(0,3).map(r=>r._id) },
        { label: "Yes — within 6 months",      votes: 2, voters: residents.slice(3,5).map(r=>r._id) },
        { label: "No — too expensive",         votes: 0, voters: [] },
        { label: "Need survey first",          votes: 1, voters: [residents[5]._id] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysFromNow(7), isClosed: false, isAnonymous: true, totalVotes: 6, createdAt: daysAgo(3),
    },
    {
      question: "Should the clubhouse be rented to outsiders?",
      options: [
        { label: "Yes — funds maintenance", votes: 0, voters: [] },
        { label: "No — residents only",     votes: 0, voters: [] },
        { label: "Conditional",             votes: 0, voters: [] },
        { label: "Weekend only",            votes: 0, voters: [] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysFromNow(14), isClosed: false, isAnonymous: true, totalVotes: 0, createdAt: daysAgo(1),
    },
  ]);
  log.ok("3 polls (1 closed+votes, 1 open+votes, 1 fresh)");

  // ════════════════════════════════════════════════════════════════════════
  //  HELP POSTS — 6
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 6 Help Posts");
  await Help.insertMany([
    { title: "Need reliable plumber for bathroom reno", description: "Budget ₹15k–₹25k.", category: "Plumber", society: society1._id, author: residents[0]._id, flat: residents[0].memberships[0].flat, isClosed: false, replies: [{ author: residents[2]._id, body: "Ramesh Plumbing — very reliable.", isVendorContact: true, vendorPhone: "+919988776655", upvotes: [residents[1]._id], createdAt: daysAgo(1) }], createdAt: daysAgo(3) },
    { title: "Good electrician for modular kitchen wiring", description: "Licensed electrician needed.", category: "Electrician", society: society1._id, author: residents[1]._id, flat: residents[1].memberships[0].flat, isClosed: false, replies: [], createdAt: daysAgo(2) },
    { title: "Part-time maid available — morning hours", description: "Mornings 7–9 AM. 3 references from Wing A.", category: "Maid", society: society1._id, author: residents[2]._id, flat: residents[2].memberships[0].flat, isClosed: false, replies: [{ author: residents[4]._id, body: "Can you share contact?", upvotes: [], createdAt: daysAgo(0) }], createdAt: daysAgo(5) },
    { title: "Best home-cooked tiffin near society?", description: "Gujarati/Punjabi. Daily lunch + dinner.", category: "Food", society: society1._id, author: residents[3]._id, flat: residents[3].memberships[0].flat, isClosed: true, replies: [{ author: residents[5]._id, body: "Meena Tiffin on Satellite Road.", upvotes: [residents[0]._id, residents[1]._id], createdAt: daysAgo(10) }], createdAt: daysAgo(15) },
    { title: "Math tutor for Class 10 CBSE", description: "Home visits 5–7 PM weekdays.", category: "Tutor", society: society1._id, author: residents[4]._id, flat: residents[4].memberships[0].flat, isClosed: false, replies: [], createdAt: daysAgo(1) },
    { title: "Carpool to Prahlad Nagar office?", description: "Weekdays 9:30 AM.", category: "Transport", society: society1._id, author: residents[5]._id, flat: residents[5].memberships[0].flat, isClosed: false, replies: [{ author: residents[7]._id, body: "I go same way!", upvotes: [], createdAt: daysAgo(0) }], createdAt: daysAgo(2) },
  ]);
  log.ok("6 help posts");

  // ════════════════════════════════════════════════════════════════════════
  //  CONTACTS — 10
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 10 Contacts");
  await Contact.insertMany([
    { name: "Police Control Room",         phone: "+919876543211", group: "Emergency", designation: "Police",             icon: "🚔", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Fire Brigade",                phone: "+919876543213", group: "Emergency", designation: "Fire Department",    icon: "🔥", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Ambulance",                   phone: "+919876543214", group: "Emergency", designation: "Medical Emergency",  icon: "🚑", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Admin Sharma",                phone: "+919876543210", group: "Committee", designation: "Society Chairman",   icon: "👑", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Suresh Trivedi",              phone: "+919887654321", group: "Committee", designation: "Maintenance Head",   icon: "🔧", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Rekha Iyer",                  phone: "+919898765432", group: "Committee", designation: "Treasurer",          icon: "💰", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Vijay Rao",                   phone: "+919876501234", group: "Committee", designation: "Parking In-charge",  icon: "🅿️", sortOrder: 4, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "QuickFix Electrical",         phone: "+919845678901", group: "Vendor",    designation: "Electrical Repairs", icon: "⚡", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Ramesh Plumbing Services",    phone: "+919988776655", group: "Vendor",    designation: "Plumber",            icon: "🔧", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "SpeedLift Elevator Services", phone: "+919977665544", group: "Vendor",    designation: "Lift Maintenance",   icon: "🛗", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
  ]);
  log.ok("10 contacts (3 Emergency, 4 Committee, 3 Vendor)");

  // ════════════════════════════════════════════════════════════════════════
  //  VISITORS — 18 (all 4 flows)
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 18 Visitors (all 4 flows)");

  // Flow A: OTP Invites
  await Visitor.insertMany([
    { name: "Ankit Shah",    phone: "+919991000001", purpose: "Guest",   society: society1._id, host: residents[0]._id, hostFlat: residents[0].memberships[0].flat, status: "invited",  isWalkIn: false, expectedAt: daysFromNow(1), createdAt: daysAgo(1) },
    { name: "Raj Kumar",     phone: "+919991000003", purpose: "Guest",   society: society1._id, host: residents[2]._id, hostFlat: residents[2].memberships[0].flat, status: "approved", isWalkIn: false, entryTime: hoursAgo(2), approvedAt: hoursAgo(2), approvedBy: residents[2]._id, createdAt: daysAgo(1) },
    { name: "Komal Friend",  phone: "+919991000010", purpose: "Guest",   society: society1._id, host: residents[2]._id, hostFlat: residents[2].memberships[0].flat, status: "exited",   isWalkIn: false, entryTime: hoursAgo(5), exitTime: hoursAgo(1), approvedAt: hoursAgo(5), approvedBy: residents[2]._id, createdAt: daysAgo(1) },
    { name: "Raju Elec",     phone: "+919991000009", purpose: "Service", society: society1._id, host: residents[0]._id, hostFlat: residents[0].memberships[0].flat, status: "expired",  isWalkIn: false, expectedAt: daysAgo(2), createdAt: daysAgo(5) },
  ]);

  // Flow B: Walk-ins
  await Visitor.insertMany([
    { name: "Priya Visitor", phone: "+919991000004", purpose: "Service",  society: society1._id, host: residents[3]._id, hostFlat: residents[3].memberships[0].flat, status: "pending",  isWalkIn: true, loggedBy: security._id, createdAt: daysAgo(0) },
    { name: "Mohan Das",     phone: "+919991000005", purpose: "Guest",    society: society1._id, host: residents[4]._id, hostFlat: residents[4].memberships[0].flat, status: "pending",  isWalkIn: true, loggedBy: security._id, createdAt: daysAgo(0) },
    { name: "Swiggy Rider",  phone: "+919991000002", purpose: "Delivery", society: society1._id, host: residents[1]._id, hostFlat: residents[1].memberships[0].flat, status: "rejected", isWalkIn: true, loggedBy: security._id, createdAt: daysAgo(2) },
  ]);

  // Flow C: Trusted / Frequent Visitors
  await Visitor.insertMany([
    { name: "Sunita Maid",       phone: "+919992000001", purpose: "Service",  society: society1._id, host: residents[0]._id, hostFlat: residents[0].memberships[0].flat, status: "invited", isTrusted: true, category: "Maid",     passType: "monthly",   validUntil: daysFromNow(22), accessSchedule: { days: [1,2,3,4,5,6], fromTime: "07:00", toTime: "10:00" }, entryCount: 18, createdAt: daysAgo(8) },
    { name: "Bhavna Cook",       phone: "+919992000002", purpose: "Service",  society: society1._id, host: residents[1]._id, hostFlat: residents[1].memberships[0].flat, status: "invited", isTrusted: true, category: "Cook",     passType: "permanent", validUntil: null,            accessSchedule: { days: [0,1,2,3,4,5,6], fromTime: "07:00", toTime: "11:00" }, entryCount: 45, createdAt: daysAgo(40) },
    { name: "Zepto Delivery",    phone: "+919992000003", purpose: "Delivery", society: society1._id, host: residents[3]._id, hostFlat: residents[3].memberships[0].flat, status: "invited", isTrusted: true, category: "Delivery", passType: "daily",     validUntil: new Date(new Date().setHours(23,59,59,999)), accessSchedule: { days: [0,1,2,3,4,5,6], fromTime: "08:00", toTime: "21:00" }, entryCount: 1,  createdAt: daysAgo(0) },
    { name: "Old Driver Ramji",  phone: "+919992000004", purpose: "Service",  society: society1._id, host: residents[4]._id, hostFlat: residents[4].memberships[0].flat, status: "expired", isTrusted: true, category: "Driver",   passType: "monthly",   validUntil: daysAgo(3),       accessSchedule: { days: [1,2,3,4,5], fromTime: "08:00", toTime: "09:00" },    entryCount: 20, createdAt: daysAgo(33) },
    { name: "Suspicious Vendor", phone: "+919992000005", purpose: "Service",  society: society1._id, host: residents[5]._id, hostFlat: residents[5].memberships[0].flat, status: "rejected",isTrusted: true, category: "Vendor",   passType: "monthly",   validUntil: daysFromNow(15),  accessSchedule: { days: [1,2,3,4,5], fromTime: "10:00", toTime: "18:00" },    entryCount: 3,  createdAt: daysAgo(5) },
  ]);

  // Flow D: Delivery (auto-exit)
  await Visitor.insertMany([
    { name: "Amazon Delivery",    phone: "+919991000006", purpose: "Delivery", vehicleNumber: "GJ05CD5678", society: society1._id, host: residents[5]._id, hostFlat: residents[5].memberships[0].flat, status: "approved", isWalkIn: true, loggedBy: security._id, entryTime: hoursAgo(0.08), approvedAt: hoursAgo(0.08), approvedBy: security._id, deliveryAutoExitAt: new Date(Date.now() + 10*60*1000), createdAt: daysAgo(0) },
    { name: "Bharat Gas Delivery",phone: "+919991000008", purpose: "Delivery", society: society1._id,                               host: residents[7]._id, hostFlat: residents[7].memberships[0].flat, status: "exited",   isWalkIn: true, loggedBy: security._id, entryTime: hoursAgo(2),    exitTime: hoursAgo(1.75), approvedAt: hoursAgo(2), approvedBy: security._id, deliveryAutoExitAt: hoursAgo(1.75), createdAt: daysAgo(0) },
  ]);
  log.ok("18 visitors — OTP×4  walk-in×3  trusted×5  delivery×2");

  // ════════════════════════════════════════════════════════════════════════
  //  MAINTENANCE BILLS — 3
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Maintenance Bills");

  const makePayments = (baseAmt, scenario) =>
    residents.map((res, i) => {
      const roll = (i * 3 + scenario) % 10;
      if (roll < 6) return { resident: res._id, flat: res.memberships[0].flat, wing: res.memberships[0].wing, amount: baseAmt, penalty: 0, discount: 0, totalDue: baseAmt, status: "paid",    paidAmount: baseAmt, paidAt: daysAgo(10-i), paymentMethod: ["upi","neft","cash"][i%3], transactionId: `TXN${scenario}${String(i).padStart(3,"0")}`, remindersSent: 0 };
      if (roll < 8) return { resident: res._id, flat: res.memberships[0].flat, wing: res.memberships[0].wing, amount: baseAmt, penalty: 100, discount: 0, totalDue: baseAmt+100, status: "overdue", paidAmount: 0, remindersSent: 1, lastReminderAt: daysAgo(2) };
      if (roll < 9) return { resident: res._id, flat: res.memberships[0].flat, wing: res.memberships[0].wing, amount: baseAmt, penalty: 0, discount: baseAmt, totalDue: 0, status: "waived", paidAmount: 0 };
      return       { resident: res._id, flat: res.memberships[0].flat, wing: res.memberships[0].wing, amount: baseAmt, penalty: 0, discount: 0, totalDue: baseAmt, status: "unpaid", paidAmount: 0 };
    });

  await MaintenanceBill.create({ society: society1._id, createdBy: admin._id,     title: "March 2025 — Monthly Maintenance", billMonth: "2025-03", baseAmount: 2500, dueDate: daysAgo(45),     penaltyEnabled: true, penaltyAmount: 100, targetMode: "all", isPublished: true,  isClosed: true,  payments: makePayments(2500, 1) });
  await MaintenanceBill.create({ society: society1._id, createdBy: admin._id,     title: "May 2025 — Monthly Maintenance",   billMonth: "2025-05", baseAmount: 3000, dueDate: daysFromNow(10), penaltyEnabled: true, penaltyAmount: 100, targetMode: "all", isPublished: true,  isClosed: false, payments: makePayments(3000, 2) });
  await MaintenanceBill.create({ society: society1._id, createdBy: treasurer._id, title: "June 2025 — Draft",                billMonth: "2025-06", baseAmount: 3000, dueDate: daysFromNow(40), penaltyEnabled: true, penaltyAmount: 100, targetMode: "all", isPublished: false, isClosed: false, payments: [] });
  log.ok("3 bills (closed / active / draft by Treasurer)");

  // ════════════════════════════════════════════════════════════════════════
  //  AMENITIES — 3 + 8 BOOKINGS
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Amenities + 8 Bookings");

  const gym = await Amenity.create({
    society: society1._id, createdBy: admin._id, name: "Society Gym", category: "Gym",
    description: "Treadmills, cycle, weights. 5 concurrent users.", maxConcurrentBookings: 5,
    slotDurationOptions: [60], maxSlotDuration: 90, advanceBookingDays: 3,
    openTime: "05:30", closeTime: "22:00", closedDays: [], requiresApproval: false, depositAmount: 0,
    rules: "Wear proper attire.\nClean equipment after use.", isActive: true,
  });
  const clubhouse = await Amenity.create({
    society: society1._id, createdBy: admin._id, name: "Community Clubhouse", category: "Clubhouse",
    description: "AC, projector, sound system. Capacity 80.", maxConcurrentBookings: 1,
    slotDurationOptions: [120, 240, 480], maxSlotDuration: 480, advanceBookingDays: 14,
    openTime: "08:00", closeTime: "22:00", closedDays: [], requiresApproval: true, depositAmount: 2000,
    rules: "No loud music after 9 PM.", isActive: true,
  });
  const badminton = await Amenity.create({
    society: society1._id, createdBy: admin._id, name: "Badminton Court", category: "Badminton Court",
    description: "Indoor synthetic court.", maxConcurrentBookings: 2,
    slotDurationOptions: [60], maxSlotDuration: 60, advanceBookingDays: 7,
    openTime: "06:00", closeTime: "21:00", closedDays: [], requiresApproval: false, depositAmount: 0,
    rules: "Sports shoes mandatory.", isActive: true,
  });

  const tom = daysFromNow(1), yes = daysAgo(1);
  await AmenityBooking.insertMany([
    { amenity: gym._id,       society: society1._id, bookedBy: residents[0]._id, startTime: atHour(tom, 6),              endTime: atHour(tom, 7),              durationMinutes: 60,  purpose: "Morning workout",  guestCount: 1,  status: "confirmed",  createdAt: daysAgo(1) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[1]._id, startTime: atHour(tom, 7),              endTime: atHour(tom, 8),              durationMinutes: 60,  purpose: "Evening session",  guestCount: 1,  status: "confirmed",  createdAt: daysAgo(1) },
    { amenity: badminton._id, society: society1._id, bookedBy: residents[2]._id, startTime: atHour(tom, 8),              endTime: atHour(tom, 9),              durationMinutes: 60,  purpose: "Sports practice",  guestCount: 2,  status: "pending",    createdAt: daysAgo(0) },
    { amenity: clubhouse._id, society: society1._id, bookedBy: residents[3]._id, startTime: atHour(daysFromNow(5), 10), endTime: atHour(daysFromNow(5), 14), durationMinutes: 240, purpose: "Birthday party",   guestCount: 30, status: "pending",    createdAt: daysAgo(1) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[4]._id, startTime: atHour(yes, 6),              endTime: atHour(yes, 7),              durationMinutes: 60,  purpose: "Morning workout",  guestCount: 1,  status: "completed",  createdAt: daysAgo(3) },
    { amenity: badminton._id, society: society1._id, bookedBy: residents[5]._id, startTime: atHour(yes, 8),              endTime: atHour(yes, 9),              durationMinutes: 60,  purpose: "Sports practice",  guestCount: 2,  status: "completed",  createdAt: daysAgo(2) },
    { amenity: clubhouse._id, society: society1._id, bookedBy: residents[6]._id, startTime: atHour(daysAgo(3), 10),     endTime: atHour(daysAgo(3), 14),     durationMinutes: 240, purpose: "Kitty party",      guestCount: 20, status: "cancelled",  cancelledBy: residents[6]._id, cancelReason: "Plans changed", createdAt: daysAgo(7) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[7]._id, startTime: atHour(daysAgo(5), 17),     endTime: atHour(daysAgo(5), 18),     durationMinutes: 60,  purpose: "Regular exercise", guestCount: 1,  status: "rejected",   adminNote: "Slot overlap", createdAt: daysAgo(6) },
  ]);
  log.ok("3 amenities + 8 bookings");

  // ════════════════════════════════════════════════════════════════════════
  //  EVENTS — 4
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 4 Events");
  await Event.insertMany([
    { society: society1._id, createdBy: admin._id, title: "🏃 Annual Society Sports Day",         description: "Relay, badminton, carrom, chess, tug-of-war. Prizes for all age groups.", category: "Sports",   startTime: daysAgo(10),      endTime: new Date(daysAgo(10).getTime()+4*3_600_000),      venue: "Society Ground",    rsvpEnabled: true,  rsvpDeadline: daysAgo(12),     capacity: 150, isPublished: true,  isCancelled: false, reminderSent: true, rsvps: residents.slice(0,5).map((r,i)=>({ resident: r._id, status: ["going","going","going","maybe","not_going"][i], guestCount: i<3?1:0, respondedAt: daysAgo(15) })), createdAt: daysAgo(30) },
    { society: society1._id, createdBy: admin._id, title: "🪔 Diwali Grand Celebration 2025",     description: "Rangoli competition, puja, sweets. Dress code: Traditional.",              category: "Festival", startTime: daysFromNow(20),  endTime: new Date(daysFromNow(20).getTime()+5*3_600_000),  venue: "Society Ground",    rsvpEnabled: true,  rsvpDeadline: daysFromNow(18), capacity: 200, isPublished: true,  isCancelled: false, rsvps: residents.slice(0,3).map(r=>({ resident: r._id, status: "going", guestCount: 2, respondedAt: daysAgo(1) })), createdAt: daysAgo(5) },
    { society: society1._id, createdBy: admin._id, title: "🧘 Weekend Yoga Camp (DRAFT)",         description: "Two-day yoga workshop. Bring your mat.",                                   category: "Other",    startTime: daysFromNow(14),  endTime: new Date(daysFromNow(14).getTime()+2*3_600_000),  venue: "Terrace Garden",    rsvpEnabled: true,  rsvpDeadline: daysFromNow(12), capacity: 40,  isPublished: false, isCancelled: false, rsvps: [], createdAt: daysAgo(1) },
    { society: society1._id, createdBy: admin._id, title: "🎭 Navratri Garba Night (CANCELLED)",  description: "Navratri garba night — folk music, Gujarati farsan.",                      category: "Cultural", startTime: daysFromNow(8),   endTime: new Date(daysFromNow(8).getTime()+5*3_600_000),   venue: "Community Hall",    rsvpEnabled: true,  rsvpDeadline: daysFromNow(6),  capacity: 300, isPublished: true,  isCancelled: true, cancelReason: "Venue unavailable.", rsvps: [], createdAt: daysAgo(7) },
  ]);
  log.ok("4 events (1 past+RSVPs, 1 upcoming, 1 draft, 1 cancelled)");

  // ════════════════════════════════════════════════════════════════════════
  //  PARKING — 20 SLOTS + 8 REQUESTS
  // ════════════════════════════════════════════════════════════════════════
  log.section("Seeding 20 Parking Slots + 8 Requests");

  await ParkingSlot.insertMany([
    { society: society1._id, slotNumber: "B-001", zone: "Basement Level 1",          type: "4W",      status: "assigned",  assignedTo: residents[0]._id, assignedFlat: residents[0].memberships[0].flat, vehicleNumber: "GJ01AA1001", assignedAt: daysAgo(60), assignedBy: admin._id },
    { society: society1._id, slotNumber: "B-002", zone: "Basement Level 1",          type: "4W",      status: "assigned",  assignedTo: residents[1]._id, assignedFlat: residents[1].memberships[0].flat, vehicleNumber: "GJ01BB1002", assignedAt: daysAgo(90), assignedBy: admin._id },
    { society: society1._id, slotNumber: "B-003", zone: "Basement Level 1",          type: "4W",      status: "assigned",  assignedTo: residents[2]._id, assignedFlat: residents[2].memberships[0].flat, vehicleNumber: "GJ01CC1003", assignedAt: daysAgo(30), assignedBy: parkingHead._id },
    { society: society1._id, slotNumber: "B-004", zone: "Basement Level 1",          type: "4W",      status: "available" },
    { society: society1._id, slotNumber: "B-005", zone: "Basement Level 1",          type: "4W",      status: "blocked",   note: "Blocked for waterproofing work" },
    { society: society1._id, slotNumber: "TW-001",zone: "Open Parking Area",          type: "2W",      status: "assigned",  assignedTo: residents[3]._id, assignedFlat: residents[3].memberships[0].flat, vehicleNumber: "GJ05DD2001", assignedAt: daysAgo(45), assignedBy: admin._id },
    { society: society1._id, slotNumber: "TW-002",zone: "Open Parking Area",          type: "2W",      status: "assigned",  assignedTo: residents[4]._id, assignedFlat: residents[4].memberships[0].flat, vehicleNumber: "GJ05EE2002", assignedAt: daysAgo(20), assignedBy: admin._id },
    { society: society1._id, slotNumber: "TW-003",zone: "Open Parking Area",          type: "2W",      status: "available" },
    { society: society1._id, slotNumber: "TW-004",zone: "Open Parking Area",          type: "2W",      status: "available" },
    { society: society1._id, slotNumber: "EV-01", zone: "Basement — EV Zone",        type: "EV",      status: "assigned",  assignedTo: residents[5]._id, assignedFlat: residents[5].memberships[0].flat, vehicleNumber: "GJ01EV0001", assignedAt: daysAgo(15), assignedBy: admin._id, note: "7 kW AC EV Charging" },
    { society: society1._id, slotNumber: "EV-02", zone: "Basement — EV Zone",        type: "EV",      status: "available", note: "7 kW AC EV Charging" },
    { society: society1._id, slotNumber: "EV-03", zone: "Basement — EV Zone",        type: "EV",      status: "available", note: "7 kW AC EV Charging" },
    { society: society1._id, slotNumber: "VIS-01",zone: "Gate Entry — Visitor",       type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-02",zone: "Gate Entry — Visitor",       type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-03",zone: "Gate Entry — Visitor",       type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-04",zone: "Gate Entry — Visitor",       type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-05",zone: "Gate Entry — Visitor",       type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "RES-01",zone: "Basement — Reserved",        type: "Reserved",status: "assigned",  assignedTo: admin._id,        assignedFlat: "A-101",                           vehicleNumber: "GJ01AA0001", assignedAt: daysAgo(200),assignedBy: admin._id, note: "Chairman reserved slot" },
    { society: society1._id, slotNumber: "RES-02",zone: "Basement — Reserved",        type: "Reserved",status: "assigned",  assignedTo: residents[6]._id, assignedFlat: residents[6].memberships[0].flat, vehicleNumber: "GJ01AA0002", assignedAt: daysAgo(100),assignedBy: parkingHead._id },
    { society: society1._id, slotNumber: "RES-03",zone: "Basement — Reserved",        type: "Reserved",status: "available" },
  ]);

  await ParkingRequest.insertMany([
    { society: society1._id, requestedBy: residents[5]._id, flat: residents[5].memberships[0].flat, slotType: "4W", vehicleNumber: "GJ01ZZ9001", vehicleDescription: "White Maruti Swift",   status: "pending",   createdAt: daysAgo(2) },
    { society: society1._id, requestedBy: residents[6]._id, flat: residents[6].memberships[0].flat, slotType: "2W", vehicleNumber: "GJ05YY9002", vehicleDescription: "Black Honda Activa",   status: "pending",   createdAt: daysAgo(1) },
    { society: society1._id, requestedBy: residents[7]._id, flat: residents[7].memberships[0].flat, slotType: "EV", vehicleNumber: "GJ01EV9003", vehicleDescription: "Blue Tata Nexon EV",   status: "pending",   note: "Urgently needed.", createdAt: daysAgo(0) },
    { society: society1._id, requestedBy: residents[0]._id, flat: residents[0].memberships[0].flat, slotType: "4W", vehicleNumber: "GJ01AA8001", vehicleDescription: "Silver Hyundai Creta", status: "approved",  resolvedBy: parkingHead._id, resolvedAt: daysAgo(5),  adminNote: "Slot B-004 assigned.", createdAt: daysAgo(10) },
    { society: society1._id, requestedBy: residents[1]._id, flat: residents[1].memberships[0].flat, slotType: "4W", vehicleNumber: "GJ01BB8002", vehicleDescription: "Grey Honda City",       status: "approved",  resolvedBy: parkingHead._id, resolvedAt: daysAgo(7),  adminNote: "Slot assigned.", createdAt: daysAgo(12) },
    { society: society1._id, requestedBy: residents[2]._id, flat: residents[2].memberships[0].flat, slotType: "EV", vehicleNumber: "GJ01EV8003", vehicleDescription: "White Ola S1 Pro",      status: "rejected",  resolvedBy: parkingHead._id, resolvedAt: daysAgo(3),  adminNote: "No EV slots.", createdAt: daysAgo(8) },
    { society: society1._id, requestedBy: residents[3]._id, flat: residents[3].memberships[0].flat, slotType: "2W", vehicleNumber: "GJ05CC8004", vehicleDescription: "Red Bajaj Pulsar",      status: "rejected",  resolvedBy: parkingHead._id, resolvedAt: daysAgo(2),  adminNote: "All 2W occupied.", createdAt: daysAgo(6) },
    { society: society1._id, requestedBy: residents[4]._id, flat: residents[4].memberships[0].flat, slotType: "4W", vehicleNumber: "GJ01DD8005", vehicleDescription: "Black Toyota Innova",   status: "cancelled", resolvedBy: parkingHead._id, resolvedAt: daysAgo(1),  createdAt: daysAgo(4) },
  ]);
  log.ok("20 slots + 8 requests");

  // ════════════════════════════════════════════════════════════════════════
  //  FINAL SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  const LINE = "─".repeat(78);
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║         ✅  DEMO SEED v2 COMPLETE                ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🔐  SUPER ADMIN${c.reset}`);
  console.log(` Email: superadmin@societyapp.com  /  SuperAdmin@123\n`);

  console.log(`${c.bold}🏠  SOCIETIES${c.reset}`);
  console.log(` 1. "Sunrise Residency"       trial(active 18d)   joinCode: ${c.bold}${c.yellow}${society1.joinCode}${c.reset}  [Operations Bundle]`);
  console.log(` 2. "Green Valley Apartments" basic(active)        joinCode: ${c.bold}${c.yellow}${society2.joinCode}${c.reset}  [Starter Bundle]`);
  console.log(` 3. "Blue Horizon CHS"        premium(SUSPENDED)   joinCode: ${c.bold}${c.yellow}${society3.joinCode}${c.reset}  [Full Stack]\n`);

  console.log(`${c.bold}👤  SOCIETY 1 CREDENTIALS${c.reset}`);
  console.log(LINE);
  console.log(` Role                  │ Email                                │ Password        │ Detail`);
  console.log(LINE);
  console.log(` admin                 │ admin@sunriseresidency.com            │ Admin@1234      │ A-101, full access`);
  console.log(` committee (Treasurer) │ rekha.iyer@sunriseresidency.com       │ Committee@1234  │ B-301, maintenance:full`);
  console.log(` committee (Maint Head)│ suresh.trivedi@sunriseresidency.com   │ Committee@1234  │ A-301, issues:full`);
  console.log(` committee (Parking)   │ vijay.rao@sunriseresidency.com        │ Committee@1234  │ C-401, parking:full`);
  console.log(` security              │ guard@sunriseresidency.com            │ Guard@1234      │ visitors:full`);
  console.log(` resident              │ rahul.mehta@resident.com              │ Resident@1234   │ A-201`);
  console.log(` resident              │ priya.patel@resident.com              │ Resident@1234   │ A-202`);
  console.log(` resident              │ kiran.joshi@resident.com              │ Resident@1234   │ B-101`);
  console.log(` resident              │ deepak.nair@resident.com              │ Resident@1234   │ B-102`);
  console.log(` resident              │ sneha.reddy@resident.com              │ Resident@1234   │ B-201`);
  console.log(` resident              │ arjun.kapoor@resident.com             │ Resident@1234   │ C-101`);
  console.log(` resident              │ meera.shah@resident.com               │ Resident@1234   │ C-102`);
  console.log(` resident              │ vivek.trivedi@resident.com            │ Resident@1234   │ C-201`);
  console.log(` resident (PENDING)    │ amit.desai@resident.com               │ Resident@0001   │ C-301, awaiting approval`);
  console.log(` multi-society         │ rohan.investor@gmail.com              │ Investor@1234   │ A-401(S1) + G-102(S2)`);
  console.log(` vendor                │ vendor@quickfix.com                   │ Vendor@1234     │ issues:read`);
  console.log(LINE + "\n");

  console.log(`${c.bold}📦  RECORD COUNTS${c.reset}`);
  const counts = [
    ["SuperAdmin", "1"], ["Societies", "3"], ["Applications", "4"], ["Subscriptions", "3"],
    ["Users total", "16"], ["Multi-society user", "1  (2 memberships)"],
    ["Issues", "16  (Open×4, InProgress×4, Resolved×8)"],
    ["Notices", "6  (2 pinned, 1 draft)"], ["Polls", "3  (closed×1, open×2)"],
    ["Help Posts", "6"], ["Contacts", "10"],
    ["Visitors", "18  (OTP×4, walk-in×3, trusted×5, delivery×2)"],
    ["Maintenance Bills", "3  (closed/active/draft)"],
    ["Amenities", "3"], ["Amenity Bookings", "8"],
    ["Events", "4  (past/upcoming/draft/cancelled)"],
    ["Parking Slots", "20"], ["Parking Requests", "8"],
  ];
  counts.forEach(([l, v]) => console.log(`   ${l.padEnd(22)} ${c.bold}${v}${c.reset}`));
  console.log("");

  await mongoose.disconnect();
  log.ok("MongoDB disconnected.  🚀  Ready to test!\n");
}

seed().catch(err => {
  console.error(`\n${c.red}✖ Seed failed: ${err.message}${c.reset}`);
  if (err.stack) console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});