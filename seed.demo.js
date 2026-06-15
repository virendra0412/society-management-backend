/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  EMINITY — DEMO SEED  v5                                                    ║
 * ║  Covers all 151 test cases (98 core + 53 new features)                     ║
 * ║                                                                              ║
 * ║  Run:  node seed.demo.js                                                    ║
 * ║  Env:  MONGODB_URI  (defaults to mongodb://127.0.0.1:27017/society_db)     ║
 * ║                                                                              ║
 * ║  What gets created                                                          ║
 * ║  ──────────────────────────────────────────────────────────────────────── ║
 * ║  SuperAdmin          :  1  (superadmin@societyapp.com / SuperAdmin@123)    ║
 * ║  Societies           :  3  (Sunrise Residency + Green Valley + Blue Horizon)║
 * ║  SocietyApplications :  4  (1 approved, 2 pending, 1 rejected)            ║
 * ║  Subscriptions       :  3  (trial expiring soon + basic + free/suspended)  ║
 * ║  Users               : 30  (admin, committee members, residents, security,  ║
 * ║                             vendor, multi-society investor, pending)        ║
 * ║  Issues              : 16  (all statuses, escalated, anonymous)            ║
 * ║  Notices             :  6  (2 pinned, 1 draft)                             ║
 * ║  Polls               :  3  (1 closed, 2 open)                              ║
 * ║  Help Posts          :  6  (with replies, upvotes, 1 closed)               ║
 * ║  Contacts            : 10  (Emergency / Committee / Vendor)                ║
 * ║  Visitors            : 20  (all statuses, walk-in, trusted, OTP)           ║
 * ║  MaintenanceBills    :  3  (published+payments, draft, overdue)            ║
 * ║  Amenities           :  3  (Gym, Clubhouse, Pool)                          ║
 * ║  AmenityBookings     : 10  (confirmed, pending, cancelled)                 ║
 * ║  Events              :  4  (past, upcoming, draft, cancelled)              ║
 * ║  ParkingSlots        : 20  (4W, 2W, EV, Visitor)                          ║
 * ║  ParkingRequests     :  8  (pending, approved, rejected)                   ║
 * ║  AuditLogs           : 20  (mixed actions for TC-AL-001–004)               ║
 * ║  Notifications       :  8  (various types for TC-PN-002–006)               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const crypto   = require("crypto");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";

// ─── Models ───────────────────────────────────────────────────────────────────
const SuperAdmin        = require("./src/models/superAdmin.model");
const { Society }       = require("./src/models/society.model");
const { SocietyApplication } = require("./src/models/societyApplication.model");
const { Subscription }  = require("./src/models/subscription.model");
const User              = require("./src/models/user.model");
const Issue             = require("./src/models/issue.model");
const Notice            = require("./src/models/notice.model");
const Poll              = require("./src/models/poll.model");
const Help              = require("./src/models/help.model");
const Contact           = require("./src/models/contact.model");
const Visitor           = require("./src/models/visitor.model");
const MaintenanceBill   = require("./src/models/maintenance.model");
const { Amenity, AmenityBooking } = require("./src/models/amenity.model");
const { Event }         = require("./src/models/event.model");
const { ParkingSlot, ParkingRequest } = require("./src/models/parking.model");
const AuditLog          = require("./src/models/auditLog.model");
const Notification      = require("./src/models/notification.model");

// ─── Console helpers ──────────────────────────────────────────────────────────
const c = {
  reset:"\x1b[0m", bold:"\x1b[1m", cyan:"\x1b[36m", green:"\x1b[32m",
  yellow:"\x1b[33m", magenta:"\x1b[35m", red:"\x1b[31m", gray:"\x1b[90m",
};
const log = {
  section: (t) => console.log(`\n${c.bold}${c.magenta}▶  ${t}${c.reset}`),
  ok:      (t) => console.log(`${c.green}   ✔  ${t}${c.reset}`),
  info:    (t) => console.log(`${c.cyan}   ℹ  ${t}${c.reset}`),
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
const daysAgo      = (d) => new Date(Date.now() - d * 86_400_000);
const daysFromNow  = (d) => new Date(Date.now() + d * 86_400_000);
const hoursAgo     = (h) => new Date(Date.now() - h * 3_600_000);
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000);
const minsFromNow  = (m) => new Date(Date.now() + m * 60_000);
const atHour       = (base, h, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║         EMINITY DEMO SEED v5 — All 151 Test Cases        ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════════════════════╝${c.reset}\n`);

  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe ──────────────────────────────────────────────────────────────────
  log.section("Clearing all collections");
  await Promise.all([
    SuperAdmin.deleteMany({}),
    Society.deleteMany({}),
    SocietyApplication.deleteMany({}),
    Subscription.deleteMany({}),
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
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  log.ok("All collections cleared");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUPER ADMIN  (TC-SA-001 to TC-SA-006)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Super Admin");
  const superAdmin = await SuperAdmin.create({
    name:     "Eminity Super Admin",
    email:    "superadmin@societyapp.com",
    password: "SuperAdmin@123",
    isActive: true,
  });
  log.ok(`SuperAdmin → ${superAdmin.email}  /  SuperAdmin@123`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY 1 — Sunrise Residency (full-featured, all modules ON)
  //  Used by: Phase 1 & Phase 2 core tests, SA tests, audit, cron tests
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society 1 — Sunrise Residency");

  // Admin user first (needs _id for society.admin)
  const adminUser = await User.create({
    name:     "Admin Sharma",
    email:    "admin@sunriseresidency.com",
    phone:    "+919876543210",
    password: "Admin@1234",
    isActive: true,
    activeSocietyId: null, // set after society created
    memberships: [],       // set after society created
    familyMembers: [
      { name: "Meena Sharma",  relation: "Spouse", phone: "+919876543211" },
      { name: "Rohan Sharma",  relation: "Son",    phone: null },
    ],
  });

  const sunrise = await Society.create({
    name:       "Sunrise Residency",
    address:    "Plot No. 42, Satellite Road",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      adminUser._id,
    joinMode:   "approval",
    totalUnits: 240,
    isActive:   true,
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true, maintenance: true,
      amenities: true, events: true, parking: true,
      community: true, analytics: true, multilang: false,
    },
  });

  // Patch admin memberships
  await User.findByIdAndUpdate(adminUser._id, {
    activeSocietyId: sunrise._id,
    memberships: [{
      society:      sunrise._id,
      role:         "admin",
      flat:         "A-101",
      wing:         "A",
      isApproved:   true,
      isActive:     true,
      committeeTitle: "Society Chairman",
    }],
  });
  log.ok(`Society "Sunrise Residency" created  joinCode: ${c.bold}${c.yellow}${sunrise.joinCode}${c.reset}`);

  // ── Subscription for Sunrise — trial expiring in 6 days (TC-CJ-001/002) ──
  const sunriseSub = await Subscription.create({
    society:      sunrise._id,
    plan:         "trial",
    status:       "active",
    startDate:    daysAgo(24),
    endDate:      daysFromNow(6),     // within 7-day warning window
    priceMonthly: 0,
    history: [{ action: "created", toPlan: "trial", toStatus: "active",
      note: "Trial created on society approval", performedAt: daysAgo(24) }],
  });
  log.ok("Sunrise subscription — trial, expires in 6 days");

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY 2 — Green Valley (paid modules OFF — TC-MG-001/002)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society 2 — Green Valley");

  const adminGV = await User.create({
    name:     "Admin Green Valley",
    email:    "admin@greenvalley.com",
    phone:    "+919887654321",
    password: "Admin@5678",
    isActive: true,
    memberships: [], activeSocietyId: null,
  });

  const greenValley = await Society.create({
    name:       "Green Valley Society",
    address:    "Sector 12, Bopal",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      adminGV._id,
    joinMode:   "open",
    totalUnits: 120,
    isActive:   true,
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true,
      maintenance: false, amenities: false, events: false,
      parking: false, community: false, analytics: false, multilang: false,
    },
  });

  await User.findByIdAndUpdate(adminGV._id, {
    activeSocietyId: greenValley._id,
    memberships: [{
      society: greenValley._id, role: "admin",
      flat: "G-101", wing: "G", isApproved: true, isActive: true,
    }],
  });

  await Subscription.create({
    society: greenValley._id, plan: "basic", status: "active",
    startDate: daysAgo(60), endDate: daysFromNow(305), priceMonthly: 599,
    history: [{ action: "created", toPlan: "basic", toStatus: "active",
      note: "Basic plan activated", performedAt: daysAgo(60) }],
  });
  log.ok(`Society "Green Valley" created  joinCode: ${c.bold}${c.yellow}${greenValley.joinCode}${c.reset}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY 3 — Blue Horizon (SUSPENDED — TC-MG-003, TC-SA-013/014)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society 3 — Blue Horizon (suspended)");

  const adminBH = await User.create({
    name:     "Admin Blue Horizon",
    email:    "admin@bluehorizon.com",
    phone:    "+919898765432",
    password: "Admin@9012",
    isActive: true,
    memberships: [], activeSocietyId: null,
  });

  const blueHorizon = await Society.create({
    name:       "Blue Horizon Apartments",
    address:    "Tower Block, South Bopal",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      adminBH._id,
    joinMode:   "approval",
    totalUnits: 80,
    isActive:   false,  // SUSPENDED
    enabledModules: {
      notices: true, polls: true, contacts: true,
      issues: true, visitors: true, maintenance: true,
      amenities: false, events: false, parking: false,
      community: false, analytics: false, multilang: false,
    },
  });

  await User.findByIdAndUpdate(adminBH._id, {
    activeSocietyId: blueHorizon._id,
    memberships: [{
      society: blueHorizon._id, role: "admin",
      flat: "BH-01", wing: "BH", isApproved: true, isActive: true,
    }],
  });

  await Subscription.create({
    society: blueHorizon._id, plan: "trial", status: "suspended",
    startDate: daysAgo(35), endDate: daysFromNow(0), priceMonthly: 0,
    history: [
      { action: "created",   toPlan: "trial",   toStatus: "active",    performedAt: daysAgo(35) },
      { action: "suspended", toStatus: "suspended", note: "Society suspended by SA", performedAt: daysAgo(5) },
    ],
  });
  log.ok("Society \"Blue Horizon\" created (isActive: false — suspended)");

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY APPLICATIONS  (TC-SA-007 to TC-SA-010, TC-OB-001 to TC-OB-007)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society Applications");

  // 1 — Approved (linked to Sunrise)
  await SocietyApplication.create({
    societyName: "Sunrise Residency",
    address:     "Plot No. 42, Satellite Road",
    city:        "Ahmedabad",
    state:       "Gujarat",
    totalUnits:  240,
    adminName:   "Admin Sharma",
    adminEmail:  "admin@sunriseresidency.com",
    adminPhone:  "+919876543210",
    status:      "approved",
    reviewedBy:  superAdmin._id,
    reviewedAt:  daysAgo(24),
    reviewNote:  "All documents verified. Society created.",
    society:     sunrise._id,
    adminUser:   adminUser._id,
    applicantIp: "127.0.0.1",
  });

  // 2 — Pending (Palm Grove)
  await SocietyApplication.create({
    societyName: "Palm Grove Society",
    address:     "Ring Road, Maninagar",
    city:        "Ahmedabad",
    state:       "Gujarat",
    totalUnits:  100,
    adminName:   "Rajesh Pandya",
    adminEmail:  "rajesh@palmgrove.com",
    adminPhone:  "+919900112233",
    status:      "pending",
    applicantIp: "192.168.1.10",
  });

  // 3 — Pending (Silver Heights)
  await SocietyApplication.create({
    societyName: "Silver Heights",
    address:     "Thaltej Cross Road",
    city:        "Ahmedabad",
    state:       "Gujarat",
    totalUnits:  160,
    adminName:   "Meena Trivedi",
    adminEmail:  "meena@silverheights.com",
    adminPhone:  "+919911223344",
    status:      "pending",
    applicantIp: "10.0.0.5",
  });

  // 4 — Rejected
  await SocietyApplication.create({
    societyName: "Rejected Society",
    address:     "Unknown Area",
    city:        "Surat",
    state:       "Gujarat",
    totalUnits:  50,
    adminName:   "Test Applicant",
    adminEmail:  "test.rejected@example.com",
    adminPhone:  "+919922334455",
    status:      "rejected",
    reviewedBy:  superAdmin._id,
    reviewedAt:  daysAgo(10),
    reviewNote:  "Incomplete documentation provided.",
    applicantIp: "172.16.0.1",
  });
  log.ok("4 applications: 1 approved, 2 pending, 1 rejected");

  // ══════════════════════════════════════════════════════════════════════════
  //  USERS FOR SUNRISE RESIDENCY
  //
  //  Named users for specific test cases:
  //  - Suresh Trivedi   : committee, notices:write (TC-020, TC-AL-008)
  //  - Rekha Iyer       : committee, maintenance:full (TC-SEC-001)
  //  - Security Guard   : security role, visitors:full (TC-SEC-002)
  //  - Vendor User      : vendor role, issues:read (TC-SEC-003)
  //  - Rohan Mehta      : multi-society resident (TC-MS-001–005)
  //  - Amit Desai       : pending approval (TC-005, TC-006)
  //  - 8 general residents for seeding data
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Users for Sunrise Residency");

  // Committee: Suresh Trivedi — notices:write (TC-020)
  const sureshTrivedi = await User.create({
    name: "Suresh Trivedi", email: "suresh.trivedi@resident.com",
    phone: "+919887654320", password: "Committee@1234",
    isActive: true,
    activeSocietyId: sunrise._id,
    memberships: [{
      society: sunrise._id, role: "committee",
      flat: "B-201", wing: "B", isApproved: true, isActive: true,
      committeeTitle: "Maintenance Head",
      permissions: {
        notices: "write", issues: "read", visitors: "none",
        maintenance: "none", contacts: "none", parking: "none",
        amenities: "none", residents: "none",
      },
    }],
    familyMembers: [{ name: "Hema Trivedi", relation: "Spouse", phone: null }],
  });
  log.ok(`Committee (notices:write) → ${sureshTrivedi.email}`);

  // Committee: Rekha Iyer — maintenance:full (TC-SEC-001)
  const rekhaIyer = await User.create({
    name: "Rekha Iyer", email: "rekha.iyer@resident.com",
    phone: "+919898765431", password: "Committee@5678",
    isActive: true,
    activeSocietyId: sunrise._id,
    memberships: [{
      society: sunrise._id, role: "committee",
      flat: "C-302", wing: "C", isApproved: true, isActive: true,
      committeeTitle: "Treasurer",
      permissions: {
        maintenance: "full", visitors: "none", issues: "read",
        notices: "read", contacts: "none", parking: "none",
        amenities: "none", residents: "none",
      },
    }],
  });
  log.ok(`Committee (maintenance:full) → ${rekhaIyer.email}`);

  // Security Guard (TC-SEC-002, TC-030 to 035)
  const securityGuard = await User.create({
    name: "Ramesh Guard", email: "ramesh.guard@resident.com",
    phone: "+919909876542", password: "Security@1234",
    isActive: true,
    activeSocietyId: sunrise._id,
    memberships: [{
      society: sunrise._id, role: "security",
      flat: null, wing: null, isApproved: true, isActive: true,
      committeeTitle: "Security In-charge",
      permissions: {
        visitors: "full", residents: "read", issues: "none",
        notices: "none", contacts: "none", parking: "none",
        maintenance: "none", amenities: "none",
      },
    }],
  });
  log.ok(`Security → ${securityGuard.email}`);

  // Vendor (TC-SEC-003)
  const vendorUser = await User.create({
    name: "QuickFix Vendor", email: "vendor@quickfix.com",
    phone: "+919920987651", password: "Vendor@1234",
    isActive: true,
    activeSocietyId: sunrise._id,
    memberships: [{
      society: sunrise._id, role: "vendor",
      flat: null, wing: null, isApproved: true, isActive: true,
      permissions: {
        issues: "read", visitors: "none", maintenance: "none",
        notices: "none", contacts: "none", parking: "none",
        amenities: "none", residents: "none",
      },
    }],
  });
  log.ok(`Vendor → ${vendorUser.email}`);

  // Rohan Mehta — multi-society investor (TC-MS-001 to 005)
  // Has membership in BOTH Sunrise (A-401) AND Green Valley (G-102)
  const rohanMehta = await User.create({
    name: "Rohan Mehta", email: "rohan.mehta@investor.com",
    phone: "+919931098760", password: "Investor@1234",
    isActive: true,
    activeSocietyId: sunrise._id,   // active = Sunrise
    memberships: [
      {
        society: sunrise._id, role: "resident",
        flat: "A-401", wing: "A", isApproved: true, isActive: true,
      },
      {
        society: greenValley._id, role: "resident",
        flat: "G-102", wing: "G", isApproved: true, isActive: true,
      },
    ],
    familyMembers: [{ name: "Priya Mehta", relation: "Spouse", phone: null }],
  });
  log.ok(`Multi-society investor → ${rohanMehta.email}  (Sunrise A-401 + Green Valley G-102)`);

  // Pending resident (TC-005, TC-006, TC-MS-004)
  const amitDesai = await User.create({
    name: "Amit Desai", email: "amit.desai@resident.com",
    phone: "+919999000001", password: "Resident@0001",
    isActive: true,
    activeSocietyId: sunrise._id,
    memberships: [{
      society: sunrise._id, role: "resident",
      flat: "E-505", wing: "E", isApproved: false, isActive: true,
    }],
  });
  log.ok(`Pending resident → ${amitDesai.email}`);

  // General residents for Sunrise (used in data seeding)
  const residentData = [
    { name:"Rahul Mehta",  email:"rahul.mehta@resident.com",  phone:"+919812345678", flat:"B-202", wing:"B", pwd:"Resident@1234" },
    { name:"Priya Patel",  email:"priya.patel@resident.com",  phone:"+919823456789", flat:"C-303", wing:"C", pwd:"Resident@5678" },
    { name:"Kiran Joshi",  email:"kiran.joshi@resident.com",  phone:"+919834567890", flat:"D-404", wing:"D", pwd:"Resident@9012" },
    { name:"Deepak Nair",  email:"deepak.nair@resident.com",  phone:"+919845678901", flat:"F-601", wing:"F", pwd:"Resident@1234" },
    { name:"Sneha Reddy",  email:"sneha.reddy@resident.com",  phone:"+919856789012", flat:"E-502", wing:"E", pwd:"Resident@5678" },
    { name:"Arjun Kapoor", email:"arjun.kapoor@resident.com", phone:"+919867890123", flat:"A-205", wing:"A", pwd:"Resident@9012" },
    { name:"Divya Shah",   email:"divya.shah@resident.com",   phone:"+919878901234", flat:"B-305", wing:"B", pwd:"Resident@1234" },
    { name:"Manish Kumar", email:"manish.kumar@resident.com", phone:"+919889012345", flat:"C-401", wing:"C", pwd:"Resident@5678" },
  ];

  const residents = [];
  for (const rd of residentData) {
    const u = await User.create({
      name: rd.name, email: rd.email, phone: rd.phone, password: rd.pwd,
      isActive: true,
      activeSocietyId: sunrise._id,
      memberships: [{
        society: sunrise._id, role: "resident",
        flat: rd.flat, wing: rd.wing, isApproved: true, isActive: true,
      }],
      familyMembers: [
        { name: rd.name.split(" ")[0] + " Spouse", relation: "Spouse", phone: null },
      ],
    });
    residents.push(u);
  }
  log.ok(`${residents.length} residents created for Sunrise`);

  // Resident for Green Valley (TC-MS-002, TC-MG-001/002)
  const gvResident = await User.create({
    name: "Kavya Sharma", email: "kavya.sharma@resident.com",
    phone: "+919890123456", password: "Resident@GV01",
    isActive: true,
    activeSocietyId: greenValley._id,
    memberships: [{
      society: greenValley._id, role: "resident",
      flat: "GV-201", wing: "GV", isApproved: true, isActive: true,
    }],
  });
  log.ok(`Green Valley resident → ${gvResident.email}`);

  // Resident for Blue Horizon (TC-MG-003)
  const bhResident = await User.create({
    name: "Raj Bhatt", email: "raj.bhatt@resident.com",
    phone: "+919901234567", password: "Resident@BH01",
    isActive: true,
    activeSocietyId: blueHorizon._id,
    memberships: [{
      society: blueHorizon._id, role: "resident",
      flat: "BH-201", wing: "BH", isApproved: true, isActive: true,
    }],
  });
  log.ok(`Blue Horizon resident (suspended society) → ${bhResident.email}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  ISSUES — 16  (TC-015 to TC-018, ARCH flag, cross-society isolation)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Issues");

  const ISSUE_CATEGORIES = ["Water","Lift","Security","Garbage","Electricity","Noise","Parking","Other"];
  const ISSUE_TITLES_MAP = {
    Water:       "Water leakage in flat corridor",
    Lift:        "Lift out of order in Tower B",
    Security:    "Gate not closing properly",
    Garbage:     "Garbage bin overflowing near Gate 1",
    Electricity: "Street light not working in parking",
    Noise:       "Loud music after 10 PM",
    Parking:     "Car parked in wrong slot",
    Other:       "Postbox broken in lobby",
  };

  const issuesBulk = [
    // Open issues (TC-015 All filter, TC-016 create)
    { title:"Water leakage in corridor — Wing B",          category:"Water",       priority:"High",   status:"Open",        reporter:residents[0], isAnonymous:false, isEscalated:false, createdAt:daysAgo(5)  },
    { title:"Lift stuck between floors — Tower A",          category:"Lift",        priority:"High",   status:"Open",        reporter:residents[1], isAnonymous:false, isEscalated:true,  createdAt:daysAgo(3),  escalatedAt:daysAgo(1) },
    { title:"CCTV camera not working near parking",         category:"Security",    priority:"Medium", status:"Open",        reporter:residents[2], isAnonymous:false, isEscalated:false, createdAt:daysAgo(7)  },
    { title:"Garbage bin overflowing at Gate 1",           category:"Garbage",     priority:"Low",    status:"Open",        reporter:residents[3], isAnonymous:true,  isEscalated:false, createdAt:daysAgo(2)  },
    // In Progress issues (TC-017 admin comment)
    { title:"Street light not working in basement parking", category:"Electricity", priority:"Medium", status:"In Progress",  reporter:residents[4], isAnonymous:false, isEscalated:false, createdAt:daysAgo(10) },
    { title:"Loud music from flat D-405 after midnight",    category:"Noise",       priority:"High",   status:"In Progress",  reporter:residents[5], isAnonymous:false, isEscalated:false, createdAt:daysAgo(8)  },
    { title:"Visitor car blocking residents' parking",      category:"Parking",     priority:"Low",    status:"In Progress",  reporter:residents[6], isAnonymous:false, isEscalated:false, createdAt:daysAgo(6)  },
    { title:"Common area paint peeling in Wing C stairwell",category:"Other",       priority:"Low",    status:"In Progress",  reporter:residents[7], isAnonymous:false, isEscalated:false, createdAt:daysAgo(4)  },
    // Resolved issues (TC-018 resolvedAt set)
    { title:"Water supply disruption — Wing F",             category:"Water",       priority:"Medium", status:"Resolved",     reporter:residents[0], isAnonymous:false, isEscalated:false, createdAt:daysAgo(30), resolvedAt:daysAgo(25) },
    { title:"Lift door sensor malfunction",                 category:"Lift",        priority:"High",   status:"Resolved",     reporter:residents[1], isAnonymous:false, isEscalated:false, createdAt:daysAgo(20), resolvedAt:daysAgo(15) },
    { title:"Security guard absent during night shift",     category:"Security",    priority:"High",   status:"Resolved",     reporter:residents[2], isAnonymous:true,  isEscalated:false, createdAt:daysAgo(25), resolvedAt:daysAgo(20) },
    { title:"Garbage collection van absent for 3 days",    category:"Garbage",     priority:"Medium", status:"Resolved",     reporter:residents[3], isAnonymous:false, isEscalated:false, createdAt:daysAgo(15), resolvedAt:daysAgo(10) },
    { title:"Power fluctuation in Wing D",                  category:"Electricity", priority:"High",   status:"Resolved",     reporter:residents[4], isAnonymous:false, isEscalated:false, createdAt:daysAgo(22), resolvedAt:daysAgo(18) },
    { title:"Construction noise at odd hours",              category:"Noise",       priority:"Medium", status:"Resolved",     reporter:residents[5], isAnonymous:false, isEscalated:false, createdAt:daysAgo(12), resolvedAt:daysAgo(8)  },
    { title:"Unauthorized vehicle in reserved parking",     category:"Parking",     priority:"Medium", status:"Resolved",     reporter:residents[6], isAnonymous:false, isEscalated:false, createdAt:daysAgo(18), resolvedAt:daysAgo(14) },
    { title:"Gym equipment not maintained",                 category:"Other",       priority:"Low",    status:"Resolved",     reporter:residents[7], isAnonymous:false, isEscalated:false, createdAt:daysAgo(35), resolvedAt:daysAgo(30) },
  ];

  const createdIssues = [];
  for (const iss of issuesBulk) {
    const comments = [];
    if (iss.status !== "Open") {
      comments.push({
        author: adminUser._id,
        body:   "Looking into this. Will update shortly.",
        isAdminReply: true,
        createdAt: new Date(iss.createdAt.getTime() + 86_400_000),
      });
    }
    if (iss.status === "Resolved") {
      comments.push({
        author: adminUser._id,
        body:   "Issue has been resolved. Closing this ticket. Reopen if problem persists.",
        isAdminReply: true,
        createdAt: new Date(iss.resolvedAt.getTime() - 3_600_000),
      });
      comments.push({
        author: iss.reporter._id,
        body:   "Thanks for the quick resolution!",
        isAdminReply: false,
        createdAt: iss.resolvedAt,
      });
    }
    const doc = await Issue.create({
      title:          iss.title,
      description:    `This issue was reported from flat ${iss.reporter.memberships[0]?.flat || "unknown"}. Needs immediate attention from the maintenance team.`,
      category:       iss.category,
      priority:       iss.priority,
      status:         iss.status,
      society:        sunrise._id,
      reporter:       iss.reporter._id,
      flat:           iss.reporter.memberships[0]?.flat || null,
      isAnonymous:    iss.isAnonymous,
      assignedTo:     iss.status !== "Open" ? adminUser._id : null,
      assignedVendor: { name: null, phone: null, note: null },
      resolvedAt:     iss.resolvedAt || null,
      isEscalated:    iss.isEscalated || false,
      escalatedAt:    iss.escalatedAt || null,
      comments,
      commentCount:   comments.length,
      createdAt:      iss.createdAt,
    });
    createdIssues.push(doc);
  }
  log.ok(`${createdIssues.length} issues (4 Open, 4 In Progress, 8 Resolved — incl. 1 escalated, 2 anonymous)`);

  // ══════════════════════════════════════════════════════════════════════════
  //  NOTICES — 6  (TC-019 to TC-021, TC-AL-008)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Notices");

  await Notice.insertMany([
    // 2 Pinned (TC-021)
    { title:"🚨 Water Shutdown Tomorrow 6AM–2PM — Main Line Repair",
      body:  "Dear Residents, the main water line will be shut down tomorrow from 6AM to 2PM for emergency repairs. Please store water in advance. Inconvenience regretted.\n\n— Management Committee",
      tag:"Urgent", society:sunrise._id, postedBy:adminUser._id,
      isPinned:true, isPublished:true, createdAt:daysAgo(1) },
    { title:"💰 May 2025 Maintenance Charges — Due by 31st",
      body:  "Dear Residents, the monthly maintenance charges for May 2025 are due by May 31st. Amount: ₹3,000. Pay via UPI or at the society office. Late penalty of ₹100 applies after the due date.",
      tag:"Finance", society:sunrise._id, postedBy:adminUser._id,
      isPinned:true, isPublished:true, createdAt:daysAgo(5) },
    // 3 Regular published (TC-019 list order)
    { title:"📌 New Parking Rules — Effective From June 1st",
      body:  "New parking rules will be enforced from June 1st. All vehicles must display parking stickers. Violating vehicles will be towed at owner's expense.",
      tag:"Notice", society:sunrise._id, postedBy:sureshTrivedi._id,
      isPinned:false, isPublished:true, createdAt:daysAgo(10) },
    { title:"🎉 Society Foundation Day — August 15 Celebration",
      body:  "Join us for our annual society foundation day celebration on August 15th at 6 PM in the community hall. Cultural programs, prizes, and dinner for all residents!",
      tag:"Event", society:sunrise._id, postedBy:adminUser._id,
      isPinned:false, isPublished:true, createdAt:daysAgo(20) },
    { title:"🔔 REMINDER: AGM This Sunday — All Residents Attend",
      body:  "The Annual General Meeting is scheduled for this Sunday at 10 AM in the community hall. Attendance is mandatory for one member per flat. Agenda: FY 2024-25 accounts, committee election.",
      tag:"Reminder", society:sunrise._id, postedBy:adminUser._id,
      isPinned:false, isPublished:true, createdAt:daysAgo(3) },
    // 1 Draft (invisible to residents — TC-037-equivalent for notices)
    { title:"🏗️ Lift Maintenance Shutdown — DRAFT",
      body:  "Draft notice — not yet published. Lift A will be shut for maintenance next Saturday 8AM–12PM.",
      tag:"Notice", society:sunrise._id, postedBy:adminUser._id,
      isPinned:false, isPublished:false, createdAt:daysAgo(1) },
  ]);
  log.ok("6 notices (2 pinned, 3 published, 1 draft)");

  // ══════════════════════════════════════════════════════════════════════════
  //  POLLS — 3  (TC-022 to TC-025)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Polls");

  // Closed poll with votes (TC-022, TC-024)
  await Poll.create({
    question:  "Which day suits best for the monthly society meeting?",
    options: [
      { label:"First Sunday",   votes:35, voters:residents.slice(0,3).map(r=>r._id) },
      { label:"Last Sunday",    votes:20, voters:residents.slice(3,5).map(r=>r._id) },
      { label:"First Saturday", votes:15, voters:residents.slice(5,7).map(r=>r._id) },
      { label:"Any Weekday",    votes:8,  voters:residents.slice(7,8).map(r=>r._id) },
    ],
    society:    sunrise._id,
    createdBy:  adminUser._id,
    closesAt:   daysAgo(5),
    isClosed:   true,
    isAnonymous:false,
    totalVotes: 78,
    createdAt:  daysAgo(15),
  });

  // Open poll — resident hasn't voted yet (TC-023 vote once)
  await Poll.create({
    question:  "Should the society install EV charging stations in parking?",
    options: [
      { label:"Yes — urgent need",      votes:12, voters:residents.slice(0,4).map(r=>r._id) },
      { label:"Yes — within 6 months",  votes:8,  voters:residents.slice(4,6).map(r=>r._id) },
      { label:"No — too expensive",     votes:5,  voters:residents.slice(6,7).map(r=>r._id) },
      { label:"Need survey first",      votes:3,  voters:residents.slice(7,8).map(r=>r._id) },
    ],
    society:    sunrise._id,
    createdBy:  adminUser._id,
    closesAt:   daysFromNow(10),
    isClosed:   false,
    isAnonymous:true,
    totalVotes: 28,
    createdAt:  daysAgo(3),
  });

  // Open poll — no votes yet (TC-025 admin closes early)
  await Poll.create({
    question:  "What gym opening hours do you prefer?",
    options: [
      { label:"5AM–10PM",  votes:0, voters:[] },
      { label:"6AM–10PM",  votes:0, voters:[] },
      { label:"6AM–11PM",  votes:0, voters:[] },
      { label:"24 hours",  votes:0, voters:[] },
    ],
    society:    sunrise._id,
    createdBy:  sureshTrivedi._id,
    closesAt:   daysFromNow(7),
    isClosed:   false,
    isAnonymous:false,
    totalVotes: 0,
    createdAt:  daysAgo(1),
  });
  log.ok("3 polls (1 closed with votes, 2 open)");

  // ══════════════════════════════════════════════════════════════════════════
  //  HELP POSTS — 6  (TC-026 to TC-027)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Help Posts");

  await Help.insertMany([
    { title:"Need a reliable plumber for bathroom renovation",
      description:"Looking for experienced plumber for full bathroom renovation — tiles, fixtures. Budget ₹15k–₹25k.",
      category:"Plumber", society:sunrise._id, author:residents[0]._id,
      flat:residents[0].memberships[0]?.flat, isClosed:false,
      replies:[{
        author: residents[1]._id,
        body:   "I used the same service last month — very reliable. WhatsApp them directly.",
        isVendorContact: true, vendorPhone:"+919900112200",
        upvotes:[residents[2]._id, residents[3]._id],
        createdAt:daysAgo(1),
      }],
      createdAt:daysAgo(3) },
    { title:"Good electrician needed for modular kitchen wiring",
      description:"New modular kitchen being installed. Need licensed electrician.",
      category:"Electrician", society:sunrise._id, author:residents[1]._id,
      flat:residents[1].memberships[0]?.flat, isClosed:false, replies:[],
      createdAt:daysAgo(5) },
    { title:"Part-time maid available — mornings only",
      description:"We have a reliable maid available mornings 7–9 AM. Honest and hardworking.",
      category:"Maid", society:sunrise._id, author:residents[2]._id,
      flat:residents[2].memberships[0]?.flat, isClosed:false,
      replies:[{
        author: residents[3]._id,
        body:   "Can recommend from personal experience. Quality is good.",
        upvotes:[residents[4]._id],
        createdAt:daysAgo(2),
      }],
      createdAt:daysAgo(7) },
    { title:"Best home-cooked tiffin service near society?",
      description:"Just moved in and looking for a good tiffin service — Gujarati or Punjabi food.",
      category:"Food", society:sunrise._id, author:residents[3]._id,
      flat:residents[3].memberships[0]?.flat, isClosed:true,
      replies:[{
        author: residents[0]._id,
        body:   "Contact the building office — they have empanelled vendor for this.",
        upvotes:[],
        createdAt:daysAgo(6),
      }],
      createdAt:daysAgo(15) },
    { title:"Math & Science tutor needed for Class 10 CBSE",
      description:"Child needs help with Class 10 Math. Preferred: home visits 5–7 PM weekdays.",
      category:"Tutor", society:sunrise._id, author:residents[4]._id,
      flat:residents[4].memberships[0]?.flat, isClosed:false, replies:[],
      createdAt:daysAgo(2) },
    { title:"Carpool to Prahlad Nagar office park?",
      description:"Looking for cab sharing from society to Prahlad Nagar, weekdays 9:30 AM.",
      category:"Transport", society:sunrise._id, author:residents[5]._id,
      flat:residents[5].memberships[0]?.flat, isClosed:false,
      replies:[{
        author: residents[6]._id,
        body:   "I also go that way. Happy to share. Will DM you.",
        upvotes:[residents[7]._id],
        createdAt:daysAgo(1),
      }],
      createdAt:daysAgo(4) },
  ]);
  log.ok("6 help posts (1 Plumber+reply, 1 Electrician, 1 Maid+reply, 1 Food closed, 1 Tutor, 1 Transport+reply)");

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTACTS — 10  (TC-028, TC-029)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Contacts");

  await Contact.insertMany([
    // Emergency (TC-028)
    { name:"Police Control Room",       phone:"+919876543211", group:"Emergency", designation:"Police",            icon:"🚔", sortOrder:1, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Fire Brigade",              phone:"+919876543213", group:"Emergency", designation:"Fire Department",   icon:"🔥", sortOrder:2, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Ambulance / 108",           phone:"+919876543214", group:"Emergency", designation:"Medical Emergency", icon:"🚑", sortOrder:3, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    // Committee
    { name:"Admin Sharma",              phone:"+919876543210", group:"Committee", designation:"Society Chairman",  icon:"👤", sortOrder:1, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Suresh Trivedi",            phone:"+919887654320", group:"Committee", designation:"Maintenance Head",  icon:"📋", sortOrder:2, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Rekha Iyer",                phone:"+919898765431", group:"Committee", designation:"Treasurer",         icon:"💰", sortOrder:3, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Ramesh Guard",              phone:"+919909876542", group:"Committee", designation:"Security In-charge",icon:"🔒", sortOrder:4, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    // Vendor (TC-029 add/edit/delete)
    { name:"QuickFix Electrical",       phone:"+919845678901", group:"Vendor",    designation:"Electrical Repairs",icon:"⚡", sortOrder:1, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"Ramesh Plumbing Services",  phone:"+919988776655", group:"Vendor",    designation:"Plumber",           icon:"🔧", sortOrder:2, society:sunrise._id, addedBy:adminUser._id, isActive:true },
    { name:"SpeedLift Elevator Services",phone:"+919977665544",group:"Vendor",    designation:"Lift Maintenance",  icon:"🛗", sortOrder:3, society:sunrise._id, addedBy:adminUser._id, isActive:true },
  ]);
  log.ok("10 contacts (3 Emergency, 4 Committee, 3 Vendor)");

  // ══════════════════════════════════════════════════════════════════════════
  //  VISITORS — 20  (TC-030 to TC-035, TC-PN-006)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Visitors");

  const visitorDocs = await Visitor.insertMany([
    // TC-030: Resident views only own visitors
    { name:"Ankit Shah",     phone:"+919930001001", purpose:"Guest",    society:sunrise._id, host:residents[0]._id, hostFlat:residents[0].memberships[0]?.flat, status:"approved", isWalkIn:false, expectedAt:hoursFromNow(2), entryTime:hoursAgo(1), approvedAt:hoursAgo(1), createdAt:daysAgo(1) },
    { name:"Priya Visitor",  phone:"+919930001002", purpose:"Guest",    society:sunrise._id, host:residents[0]._id, hostFlat:residents[0].memberships[0]?.flat, status:"invited",  isWalkIn:false, expectedAt:hoursFromNow(5), createdAt:daysAgo(0) },
    { name:"Raj Delivery",   phone:"+919930001003", purpose:"Delivery", society:sunrise._id, host:residents[1]._id, hostFlat:residents[1].memberships[0]?.flat, status:"exited",   isWalkIn:true,  entryTime:hoursAgo(3), exitTime:hoursAgo(2), createdAt:daysAgo(0) },
    // TC-031: Pre-invite with future expectedAt
    { name:"Govind Guest",   phone:"+919930001004", purpose:"Guest",    society:sunrise._id, host:residents[2]._id, hostFlat:residents[2].memberships[0]?.flat, status:"invited",  isWalkIn:false, expectedAt:hoursFromNow(24), createdAt:daysAgo(0) },
    // TC-032: Walk-in needing host notification
    { name:"Swiggy Delivery",phone:"+919930001005", purpose:"Delivery", society:sunrise._id, host:residents[3]._id, hostFlat:residents[3].memberships[0]?.flat, status:"pending",  isWalkIn:true,  loggedBy:securityGuard._id, createdAt:daysAgo(0) },
    // TC-033: OTP invite (isWalkIn:false — can use OTP flow)
    { name:"Mohan Das",      phone:"+919930001006", purpose:"Guest",    society:sunrise._id, host:residents[4]._id, hostFlat:residents[4].memberships[0]?.flat, status:"invited",  isWalkIn:false, expectedAt:hoursFromNow(3), createdAt:daysAgo(0) },
    // TC-033: Walk-in — OTP flow blocked (isWalkIn:true)
    { name:"Walk-in Visitor",phone:"+919930001007", purpose:"Other",    society:sunrise._id, host:residents[4]._id, hostFlat:residents[4].memberships[0]?.flat, status:"pending",  isWalkIn:true,  loggedBy:securityGuard._id, createdAt:daysAgo(0) },
    // TC-034: Trusted visitor
    { name:"Leela Maid",     phone:"+919930001008", purpose:"Service",  society:sunrise._id, host:residents[5]._id, hostFlat:residents[5].memberships[0]?.flat, status:"approved", isWalkIn:false, isTrusted:true, entryCount:12, validUntil:daysFromNow(18), createdAt:daysAgo(12) },
    // TC-034: Trusted visitor expiring in 2 days (TC-CJ-011)
    { name:"Ramesh Cook",    phone:"+919930001009", purpose:"Service",  society:sunrise._id, host:residents[6]._id, hostFlat:residents[6].memberships[0]?.flat, status:"approved", isWalkIn:false, isTrusted:true, entryCount:5,  validUntil:daysFromNow(2), createdAt:daysAgo(28) },
    // TC-035: Admin views all — various statuses
    { name:"Ajit Singh",     phone:"+919930001010", purpose:"Guest",    society:sunrise._id, host:residents[7]._id, hostFlat:residents[7].memberships[0]?.flat, status:"rejected", isWalkIn:true,  loggedBy:securityGuard._id, createdAt:daysAgo(2) },
    { name:"Manasi Shah",    phone:"+919930001011", purpose:"Cab",      society:sunrise._id, host:residents[0]._id, hostFlat:residents[0].memberships[0]?.flat, status:"exited",   isWalkIn:true,  entryTime:daysAgo(1), exitTime:new Date(daysAgo(1).getTime()+3600000), createdAt:daysAgo(1) },
    { name:"Nilam Cleaner",  phone:"+919930001012", purpose:"Service",  society:sunrise._id, host:residents[1]._id, hostFlat:residents[1].memberships[0]?.flat, status:"approved", isWalkIn:false, expectedAt:hoursFromNow(1), entryTime:hoursAgo(0.5), createdAt:daysAgo(0) },
    { name:"Amazon Delivery",phone:"+919930001013", purpose:"Delivery", society:sunrise._id, host:residents[2]._id, hostFlat:residents[2].memberships[0]?.flat, status:"approved", isWalkIn:true,  loggedBy:securityGuard._id, entryTime:hoursAgo(2), approvedBy:residents[2]._id, createdAt:daysAgo(0) },
    { name:"Flipkart Boy",   phone:"+919930001014", purpose:"Delivery", society:sunrise._id, host:residents[3]._id, hostFlat:residents[3].memberships[0]?.flat, status:"exited",   isWalkIn:true,  entryTime:daysAgo(1), exitTime:new Date(daysAgo(1).getTime()+1800000), deliveryAutoExitAt:new Date(daysAgo(1).getTime()+900000), createdAt:daysAgo(1) },
    { name:"Anita Relative", phone:"+919930001015", purpose:"Guest",    society:sunrise._id, host:residents[4]._id, hostFlat:residents[4].memberships[0]?.flat, status:"invited",  isWalkIn:false, expectedAt:daysFromNow(1), createdAt:daysAgo(0) },
    // Expired OTP visitor (TC-CJ-009)
    { name:"Expired OTP Guest",phone:"+919930001016",purpose:"Guest",   society:sunrise._id, host:residents[5]._id, hostFlat:residents[5].memberships[0]?.flat, status:"expired",  isWalkIn:false, expectedAt:daysAgo(1), createdAt:daysAgo(2) },
    // Past visitors (TC-035 range filter)
    { name:"Vikas Gupta",    phone:"+919930001017", purpose:"Guest",    society:sunrise._id, host:residents[6]._id, hostFlat:residents[6].memberships[0]?.flat, status:"exited",   isWalkIn:false, entryTime:daysAgo(5), exitTime:new Date(daysAgo(5).getTime()+7200000), createdAt:daysAgo(6) },
    { name:"Shalini Mehta",  phone:"+919930001018", purpose:"Service",  society:sunrise._id, host:residents[7]._id, hostFlat:residents[7].memberships[0]?.flat, status:"approved", isWalkIn:false, expectedAt:daysAgo(3), entryTime:daysAgo(3), createdAt:daysAgo(4) },
    // Trusted visitor with entries today (TC-CJ-013 digest)
    { name:"Housemaid Daily",phone:"+919930001019", purpose:"Service",  society:sunrise._id, host:residents[0]._id, hostFlat:residents[0].memberships[0]?.flat, status:"approved", isWalkIn:false, isTrusted:true, entryCount:45, entryTime:hoursAgo(4), validUntil:daysFromNow(5), createdAt:daysAgo(45) },
    // Walk-in pending for TC-PN-006 notification test
    { name:"New Walk-in Guest",phone:"+919930001020",purpose:"Guest",   society:sunrise._id, host:residents[1]._id, hostFlat:residents[1].memberships[0]?.flat, status:"pending",  isWalkIn:true,  loggedBy:securityGuard._id, createdAt:new Date() },
  ]);
  log.ok(`${visitorDocs.length} visitors created (all statuses, OTP, trusted, walk-in, delivery)`);

  // ══════════════════════════════════════════════════════════════════════════
  //  MAINTENANCE BILLS — 3  (TC-036 to TC-041, TC-CJ-015 to TC-CJ-018)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Maintenance Bills");

  // Bill 1 — May 2025: Published, 8 payments (TC-036, TC-038, TC-039, TC-041)
  const mayPayments = residents.map((res, i) => {
    const roll = i % 5;
    return {
      resident:      res._id,
      flat:          res.memberships[0]?.flat,
      wing:          res.memberships[0]?.wing,
      amount:        3000,
      penalty:       roll === 0 ? 100 : 0,
      discount:      0,
      totalDue:      roll === 0 ? 3100 : 3000,
      status:        roll < 2 ? "paid" : roll === 2 ? "overdue" : "unpaid",
      paidAmount:    roll < 2 ? 3000 : 0,
      paidAt:        roll < 2 ? daysAgo(10) : null,
      paymentMethod: roll < 2 ? ["upi","neft","cheque","cash"][i % 4] : null,
      transactionId: roll < 2 ? `TXN202505${String(i).padStart(4,"0")}` : null,
      remindersSent: roll === 2 ? 2 : 0,
      lastReminderAt:roll === 2 ? daysAgo(1) : null,
      penaltyAppliedAt: roll === 0 ? daysAgo(5) : null,
    };
  });
  // Also add Rohan Mehta (multi-society — TC-041)
  mayPayments.push({
    resident: rohanMehta._id, flat:"A-401", wing:"A",
    amount:3000, penalty:0, discount:0, totalDue:3000,
    status:"paid", paidAmount:3000, paidAt:daysAgo(8),
    paymentMethod:"upi", transactionId:"TXN20250599",
    remindersSent:0, lastReminderAt:null, penaltyAppliedAt:null,
  });

  const mayBill = await MaintenanceBill.create({
    society:        sunrise._id,
    createdBy:      adminUser._id,
    title:          "May 2025 — Monthly Maintenance",
    description:    "Monthly maintenance for May 2025 covering security, housekeeping, lift AMC, generator fuel, common area electricity.",
    billMonth:      "2025-05",
    baseAmount:     3000,
    dueDate:        daysAgo(1),   // overdue
    penaltyEnabled: true,
    penaltyAmount:  100,
    penaltyAppliedAt: daysAgo(5),
    targetMode:     "all",
    isPublished:    true,
    isClosed:       false,
    payments:       mayPayments,
  });
  log.ok(`May 2025 bill — published, ${mayPayments.length} payments (paid/overdue/unpaid), due date past`);

  // Bill 2 — June 2025 Draft (TC-037 — invisible to residents)
  await MaintenanceBill.create({
    society:     sunrise._id,
    createdBy:   adminUser._id,
    title:       "June 2025 — Monthly Maintenance (Draft)",
    description: "Draft bill for June 2025. Pending committee review before publishing.",
    billMonth:   "2025-06",
    baseAmount:  3500,
    dueDate:     daysFromNow(25),
    penaltyEnabled: true,
    penaltyAmount:  100,
    targetMode:  "all",
    isPublished: false,
    isClosed:    false,
    payments:    [],
  });
  log.ok("June 2025 bill — DRAFT (residents cannot see)");

  // Bill 3 — April 2025: Closed with all statuses (TC-040 defaulter list, TC-CJ-015)
  const aprPayments = residents.map((res, i) => ({
    resident:      res._id,
    flat:          res.memberships[0]?.flat,
    wing:          res.memberships[0]?.wing,
    amount:        2500, penalty: i % 3 === 0 ? 100 : 0, discount:0,
    totalDue:      i % 3 === 0 ? 2600 : 2500,
    status:        i < 5 ? "paid" : i === 5 ? "waived" : "overdue",
    paidAmount:    i < 5 ? 2500 : 0,
    paidAt:        i < 5 ? daysAgo(25) : null,
    paymentMethod: i < 5 ? "upi" : null,
    transactionId: i < 5 ? `TXN202504${String(i).padStart(4,"0")}` : null,
    remindersSent: i >= 6 ? 3 : 0,
    lastReminderAt:i >= 6 ? daysAgo(26) : null,
  }));

  await MaintenanceBill.create({
    society:        sunrise._id,
    createdBy:      adminUser._id,
    title:          "April 2025 — Monthly Maintenance",
    description:    "April 2025 maintenance charges.",
    billMonth:      "2025-04",
    baseAmount:     2500,
    dueDate:        daysAgo(30),
    penaltyEnabled: true,
    penaltyAmount:  100,
    penaltyAppliedAt: daysAgo(28),
    targetMode:     "all",
    isPublished:    true,
    isClosed:       true,
    payments:       aprPayments,
  });
  log.ok("April 2025 bill — closed, mixed statuses (for defaulter list test)");

  // ══════════════════════════════════════════════════════════════════════════
  //  AMENITIES — 3  (TC-042 to TC-045, TC-CJ-020/021)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Amenities");

  const gym = await Amenity.create({
    society:sunrise._id, createdBy:adminUser._id,
    name:"Society Gym", category:"Gym",
    description:"Well-equipped gym — treadmills, cycle, weights, cable machine. 5 concurrent users max.",
    maxConcurrentBookings:5, slotDurationOptions:[60], maxSlotDuration:90,
    advanceBookingDays:3, openTime:"05:30", closeTime:"22:00", closedDays:[],
    requiresApproval:false, depositAmount:0,
    rules:"Wear proper workout attire.\nClean equipment after use.\nNo food inside.",
    isActive:true,
  });

  const clubhouse = await Amenity.create({
    society:sunrise._id, createdBy:adminUser._id,
    name:"Community Clubhouse", category:"Clubhouse",
    description:"Fully furnished clubhouse for gatherings and functions. AC, projector, sound system. 80 pax.",
    maxConcurrentBookings:1, slotDurationOptions:[120,240,480], maxSlotDuration:480,
    advanceBookingDays:14, openTime:"08:00", closeTime:"22:00", closedDays:[],
    requiresApproval:true, depositAmount:2000,
    rules:"No loud music after 9 PM.\nOwner responsible for cleaning.\nAlcohol not permitted.",
    isActive:true,
  });

  const pool = await Amenity.create({
    society:sunrise._id, createdBy:adminUser._id,
    name:"Swimming Pool", category:"Swimming Pool",
    description:"25m lap pool with kids section. Lifeguard on duty during peak hours.",
    maxConcurrentBookings:15, slotDurationOptions:[60,90], maxSlotDuration:90,
    advanceBookingDays:5, openTime:"06:00", closeTime:"20:00", closedDays:[1],
    requiresApproval:false, depositAmount:0,
    rules:"Swimming attire mandatory.\nChildren under 8 must be accompanied.\nNo glass near pool.",
    isActive:true,
  });
  log.ok("3 amenities: Gym (no approval), Clubhouse (requires approval), Pool");

  // ── Bookings — 10  (TC-042 confirmed auto, TC-043 pending→approve, TC-044 conflict, TC-CJ-020)
  log.section("Seeding Amenity Bookings");

  const today = new Date(); today.setHours(0,0,0,0);
  await AmenityBooking.insertMany([
    // TC-042: Gym booking — auto-confirmed (requiresApproval: false)
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[0]._id, startTime:atHour(today,7), endTime:atHour(today,8), durationMinutes:60, purpose:"Morning workout", guestCount:1, status:"confirmed", createdAt:daysAgo(1) },
    // TC-043: Clubhouse booking — pending (requiresApproval: true)
    { amenity:clubhouse._id, society:sunrise._id, bookedBy:residents[1]._id, startTime:atHour(daysFromNow(3),18), endTime:atHour(daysFromNow(3),22), durationMinutes:240, purpose:"Birthday party", guestCount:30, status:"pending", createdAt:daysAgo(0) },
    // TC-043: Another clubhouse — confirmed (admin approved)
    { amenity:clubhouse._id, society:sunrise._id, bookedBy:residents[2]._id, startTime:atHour(daysFromNow(5),10), endTime:atHour(daysFromNow(5),14), durationMinutes:240, purpose:"Family gathering", guestCount:20, status:"confirmed", createdAt:daysAgo(2) },
    // TC-044: Gym fully booked — 5 concurrent slots at same time (maxConcurrent=5)
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[3]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Morning session", status:"confirmed", createdAt:daysAgo(0) },
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[4]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Morning session", status:"confirmed", createdAt:daysAgo(0) },
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[5]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Morning session", status:"confirmed", createdAt:daysAgo(0) },
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[6]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Morning session", status:"confirmed", createdAt:daysAgo(0) },
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[7]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Morning session", status:"confirmed", createdAt:daysAgo(0) },
    // TC-CJ-020: Past confirmed booking — should be auto-completed by cron
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[0]._id, startTime:atHour(daysAgo(1),8), endTime:atHour(daysAgo(1),9), durationMinutes:60, purpose:"Evening session", status:"confirmed", createdAt:daysAgo(2) },
    // TC-044: Cancelled booking (doesn't count toward conflict)
    { amenity:gym._id, society:sunrise._id, bookedBy:residents[1]._id, startTime:atHour(daysFromNow(1),9), endTime:atHour(daysFromNow(1),10), durationMinutes:60, purpose:"Session", status:"cancelled", cancelledBy:residents[1]._id, cancelReason:"Plans changed", createdAt:daysAgo(0) },
  ]);
  log.ok("10 amenity bookings (auto-confirmed gym, pending clubhouse, 5 conflicting gym slots, 1 past, 1 cancelled)");

  // ══════════════════════════════════════════════════════════════════════════
  //  EVENTS — 4  (TC-046 to TC-048, TC-CJ-022/023, TC-PN-003)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Events");

  // Past event (TC-046 filter, TC-CJ-022 reminder already sent)
  const pastEvent = await Event.create({
    society:sunrise._id, createdBy:adminUser._id,
    title:"🏃 Annual Society Sports Day",
    description:"Fun sporting events for all age groups — relay races, badminton, carrom. Prizes for all categories.",
    category:"Sports",
    startTime:daysAgo(10), endTime:new Date(daysAgo(10).getTime()+14_400_000),
    venue:"Society Ground",
    rsvpEnabled:true, rsvpDeadline:daysAgo(12), capacity:150,
    isPublished:true, isCancelled:false, reminderSent:true,
    rsvps:[
      { resident:residents[0]._id, status:"going",   guestCount:2, respondedAt:daysAgo(13) },
      { resident:residents[1]._id, status:"going",   guestCount:1, respondedAt:daysAgo(12) },
      { resident:residents[2]._id, status:"maybe",   guestCount:0, respondedAt:daysAgo(11) },
    ],
    createdAt:daysAgo(30),
  });

  // Upcoming event with RSVPs (TC-047 RSVP, TC-CJ-022 reminder pending, TC-PN-003 deep link)
  await Event.create({
    society:sunrise._id, createdBy:adminUser._id,
    title:"🪔 Diwali Grand Celebration 2025",
    description:"Join us for the annual Diwali night — rangoli competition, puja, sweets distribution, and fireworks display from the terrace. Dress code: Traditional attire.",
    category:"Festival",
    startTime:daysFromNow(25), endTime:new Date(daysFromNow(25).getTime()+18_000_000),
    venue:"Community Hall",
    rsvpEnabled:true, rsvpDeadline:daysFromNow(23), capacity:200,
    isPublished:true, isCancelled:false, reminderSent:false,
    rsvps:[
      { resident:residents[3]._id, status:"going",   guestCount:3, respondedAt:daysAgo(2) },
      { resident:residents[4]._id, status:"going",   guestCount:1, respondedAt:daysAgo(1) },
      { resident:residents[5]._id, status:"not_going", guestCount:0, respondedAt:daysAgo(1) },
    ],
    createdAt:daysAgo(5),
  });

  // Upcoming event with NO RSVPs (TC-CJ-023 — society-wide fallback push)
  await Event.create({
    society:sunrise._id, createdBy:adminUser._id,
    title:"🎭 Cultural Evening — Navratri Special",
    description:"Celebrate Navratri with traditional garba and dandiya! Live folk music, Gujarati farsan stalls. Dress code: Traditional.",
    category:"Cultural",
    startTime:daysFromNow(1), endTime:new Date(daysFromNow(1).getTime()+14_400_000),
    venue:"Society Ground",
    rsvpEnabled:true, rsvpDeadline:daysFromNow(0), capacity:300,
    isPublished:true, isCancelled:false, reminderSent:false,
    rsvps:[],  // No RSVPs — triggers society-wide push
    createdAt:daysAgo(3),
  });

  // Cancelled event (TC-048)
  await Event.create({
    society:sunrise._id, createdBy:adminUser._id,
    title:"🏊 Swimming Competition — Aqua Fiesta",
    description:"Inter-society swimming competition. Categories: under-10, under-16, adults.",
    category:"Sports",
    startTime:daysFromNow(7), endTime:new Date(daysFromNow(7).getTime()+18_000_000),
    venue:"Swimming Pool",
    rsvpEnabled:true, rsvpDeadline:daysFromNow(5), capacity:60,
    isPublished:true, isCancelled:true,
    cancelReason:"Cancelled due to pool maintenance emergency. Will reschedule.",
    reminderSent:false, rsvps:[],
    createdAt:daysAgo(2),
  });

  // Draft event (TC-046 — not visible to residents)
  await Event.create({
    society:sunrise._id, createdBy:adminUser._id,
    title:"🧘 Weekend Yoga Camp — DRAFT",
    description:"Two-day yoga and meditation workshop. Bring your own mat. Sessions: 6AM–7:30AM both days.",
    category:"Workshop",
    startTime:daysFromNow(14), endTime:new Date(daysFromNow(15).getTime()+5_400_000),
    venue:"Terrace Garden",
    rsvpEnabled:true, rsvpDeadline:daysFromNow(12), capacity:40,
    isPublished:false, isCancelled:false, reminderSent:false, rsvps:[],
    createdAt:daysAgo(0),
  });
  log.ok("5 events: 1 past, 1 upcoming+RSVPs, 1 upcoming+no RSVPs, 1 cancelled, 1 draft");

  // ══════════════════════════════════════════════════════════════════════════
  //  PARKING SLOTS — 20  (TC-049 to TC-053)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Parking Slots");

  const slotsBulk = [
    // 4W slots
    { society:sunrise._id, slotNumber:"B-001", zone:"Basement Level 1", type:"4W", status:"assigned", assignedTo:residents[0]._id, assignedFlat:residents[0].memberships[0]?.flat, vehicleNumber:"GJ01AA1001", assignedAt:daysAgo(60), assignedBy:adminUser._id },
    { society:sunrise._id, slotNumber:"B-002", zone:"Basement Level 1", type:"4W", status:"assigned", assignedTo:residents[1]._id, assignedFlat:residents[1].memberships[0]?.flat, vehicleNumber:"GJ01BB2002", assignedAt:daysAgo(45), assignedBy:adminUser._id },
    { society:sunrise._id, slotNumber:"B-003", zone:"Basement Level 1", type:"4W", status:"assigned", assignedTo:residents[2]._id, assignedFlat:residents[2].memberships[0]?.flat, vehicleNumber:"GJ01CC3003", assignedAt:daysAgo(30), assignedBy:adminUser._id },
    { society:sunrise._id, slotNumber:"B-004", zone:"Basement Level 1", type:"4W", status:"available" },
    { society:sunrise._id, slotNumber:"B-005", zone:"Basement Level 1", type:"4W", status:"available" },
    { society:sunrise._id, slotNumber:"B-006", zone:"Basement Level 1", type:"4W", status:"blocked",  note:"Blocked for plumbing work" },
    // 2W slots
    { society:sunrise._id, slotNumber:"TW-001", zone:"Open Parking Area", type:"2W", status:"assigned", assignedTo:residents[3]._id, assignedFlat:residents[3].memberships[0]?.flat, vehicleNumber:"GJ05EE5001", assignedAt:daysAgo(90), assignedBy:adminUser._id },
    { society:sunrise._id, slotNumber:"TW-002", zone:"Open Parking Area", type:"2W", status:"assigned", assignedTo:residents[4]._id, assignedFlat:residents[4].memberships[0]?.flat, vehicleNumber:"GJ05FF6002", assignedAt:daysAgo(80), assignedBy:adminUser._id },
    { society:sunrise._id, slotNumber:"TW-003", zone:"Open Parking Area", type:"2W", status:"available" },
    { society:sunrise._id, slotNumber:"TW-004", zone:"Open Parking Area", type:"2W", status:"available" },
    // EV slots
    { society:sunrise._id, slotNumber:"EV-01", zone:"Basement Level 1 — EV Zone", type:"EV", status:"assigned", assignedTo:residents[5]._id, assignedFlat:residents[5].memberships[0]?.flat, vehicleNumber:"GJ01EV3001", assignedAt:daysAgo(20), assignedBy:adminUser._id, note:"7 kW AC EV Charging Point" },
    { society:sunrise._id, slotNumber:"EV-02", zone:"Basement Level 1 — EV Zone", type:"EV", status:"available", note:"7 kW AC EV Charging Point" },
    // Visitor slots
    { society:sunrise._id, slotNumber:"VIS-01", zone:"Gate Entry — Visitor Parking", type:"Visitor", status:"available" },
    { society:sunrise._id, slotNumber:"VIS-02", zone:"Gate Entry — Visitor Parking", type:"Visitor", status:"available" },
    { society:sunrise._id, slotNumber:"VIS-03", zone:"Gate Entry — Visitor Parking", type:"Visitor", status:"available" },
    // Reserved slots
    { society:sunrise._id, slotNumber:"RES-01", zone:"Basement Level 1 — Reserved", type:"Reserved", status:"assigned", assignedTo:adminUser._id, assignedFlat:"A-101", vehicleNumber:"GJ01AA9001", assignedAt:daysAgo(365), assignedBy:adminUser._id, note:"Chairman reserved slot" },
    { society:sunrise._id, slotNumber:"RES-02", zone:"Basement Level 1 — Reserved", type:"Reserved", status:"assigned", assignedTo:residents[6]._id, assignedFlat:residents[6].memberships[0]?.flat, vehicleNumber:"GJ01BB9002", assignedAt:daysAgo(200), assignedBy:adminUser._id },
    // Additional available for bulk-create test (TC-051)
    { society:sunrise._id, slotNumber:"G-001", zone:"Ground Floor Open", type:"4W", status:"available" },
    { society:sunrise._id, slotNumber:"G-002", zone:"Ground Floor Open", type:"2W", status:"available" },
    { society:sunrise._id, slotNumber:"G-003", zone:"Ground Floor Open", type:"4W", status:"available" },
  ];
  const createdSlots = await ParkingSlot.insertMany(slotsBulk);
  log.ok(`${createdSlots.length} parking slots (4W, 2W, EV, Visitor, Reserved — assigned + available + blocked)`);

  // ── Parking Requests — 8  (TC-050 to TC-053) ─────────────────────────────
  log.section("Seeding Parking Requests");

  await ParkingRequest.insertMany([
    // TC-050: pending request → admin can approve
    { society:sunrise._id, requestedBy:residents[5]._id, flat:residents[5].memberships[0]?.flat, slotType:"4W", vehicleNumber:"GJ01DD4001", vehicleDescription:"White Maruti Swift", status:"pending", createdAt:daysAgo(2) },
    // TC-050: approved request
    { society:sunrise._id, requestedBy:residents[6]._id, flat:residents[6].memberships[0]?.flat, slotType:"2W", vehicleNumber:"GJ05GG7001", vehicleDescription:"Blue Honda Activa", status:"approved", assignedSlot:createdSlots[6]._id, resolvedBy:adminUser._id, resolvedAt:daysAgo(5), adminNote:"Slot TW-001 assigned.", createdAt:daysAgo(10) },
    // TC-051: duplicate slot number request (to test BulkWriteError handling)
    { society:sunrise._id, requestedBy:residents[7]._id, flat:residents[7].memberships[0]?.flat, slotType:"EV",  vehicleNumber:"GJ01EV4001", vehicleDescription:"Red Tata Nexon EV", status:"pending", createdAt:daysAgo(1) },
    // TC-053: resident can only see own requests
    { society:sunrise._id, requestedBy:residents[0]._id, flat:residents[0].memberships[0]?.flat, slotType:"4W", vehicleNumber:"GJ01HH8001", vehicleDescription:"Silver Hyundai Creta", status:"pending", note:"Urgently needed.", createdAt:daysAgo(0) },
    { society:sunrise._id, requestedBy:residents[1]._id, flat:residents[1].memberships[0]?.flat, slotType:"2W", vehicleNumber:"GJ05II9001", vehicleDescription:"Black Bajaj Pulsar", status:"rejected", resolvedBy:adminUser._id, resolvedAt:daysAgo(3), adminNote:"No 2W slots available.", createdAt:daysAgo(7) },
    { society:sunrise._id, requestedBy:residents[2]._id, flat:residents[2].memberships[0]?.flat, slotType:"4W", vehicleNumber:"GJ01JJ0001", vehicleDescription:"Pearl White Honda City", status:"approved", assignedSlot:createdSlots[0]._id, resolvedBy:adminUser._id, resolvedAt:daysAgo(15), createdAt:daysAgo(20) },
    { society:sunrise._id, requestedBy:residents[3]._id, flat:residents[3].memberships[0]?.flat, slotType:"Visitor", vehicleNumber:"GJ01KK1001", vehicleDescription:"Grey Toyota Innova", status:"pending", createdAt:daysAgo(1) },
    { society:sunrise._id, requestedBy:residents[4]._id, flat:residents[4].memberships[0]?.flat, slotType:"2W", vehicleNumber:"GJ05LL2001", vehicleDescription:"Navy Blue Yamaha FZ", status:"rejected", resolvedBy:adminUser._id, resolvedAt:daysAgo(8), adminNote:"Requested type not available.", createdAt:daysAgo(12) },
  ]);
  log.ok("8 parking requests (pending, approved, rejected)");

  // ══════════════════════════════════════════════════════════════════════════
  //  AUDIT LOGS — 20  (TC-AL-001 to TC-AL-004)
  //  Directly inserted (bypassing middleware) to seed existing log history
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Audit Logs");

  const auditEntries = [
    // Maintenance actions
    { userId:adminUser._id, societyId:sunrise._id, action:"maintenance.bill_created",    entity:"MaintenanceBill", entityId:mayBill._id,    changes:{ title:"May 2025 — Monthly Maintenance", amount:3000 },             ip:"127.0.0.1", timestamp:daysAgo(5)  },
    { userId:adminUser._id, societyId:sunrise._id, action:"maintenance.bill_published",  entity:"MaintenanceBill", entityId:mayBill._id,    changes:{ dueDate:"2025-05-31", flatCount:9 },                               ip:"127.0.0.1", timestamp:daysAgo(5)  },
    { userId:rekhaIyer._id, societyId:sunrise._id, action:"maintenance.payment_recorded",entity:"MaintenanceBill", entityId:mayBill._id,    changes:{ amount:3000, method:"upi", flat:"C-302" },                        ip:"127.0.0.1", timestamp:daysAgo(4)  },
    { userId:adminUser._id, societyId:sunrise._id, action:"maintenance.penalty_applied", entity:"MaintenanceBill", entityId:mayBill._id,    changes:{ penaltyAmount:100, appliedBy:"Admin Sharma" },                    ip:"127.0.0.1", timestamp:daysAgo(3)  },
    // Visitor actions
    { userId:residents[0]._id, societyId:sunrise._id, action:"visitor.invite_created",   entity:"Visitor", entityId:visitorDocs[0]._id,   changes:{ visitorName:"Ankit Shah", purpose:"Guest" },                       ip:"127.0.0.1", timestamp:daysAgo(2)  },
    { userId:securityGuard._id, societyId:sunrise._id, action:"visitor.walkin_logged",   entity:"Visitor", entityId:visitorDocs[4]._id,   changes:{ visitorName:"Swiggy Delivery", hostFlat:"D-404" },                 ip:"127.0.0.1", timestamp:daysAgo(0)  },
    { userId:residents[3]._id, societyId:sunrise._id, action:"visitor.walkin_approved",  entity:"Visitor", entityId:visitorDocs[4]._id,   changes:{ approvedBy:residents[3]._id },                                     ip:"127.0.0.1", timestamp:daysAgo(0)  },
    { userId:securityGuard._id, societyId:sunrise._id, action:"visitor.otp_verified",    entity:"Visitor", entityId:visitorDocs[5]._id,   changes:{ method:"OTP", entryTime:new Date() },                              ip:"127.0.0.1", timestamp:daysAgo(0)  },
    { userId:residents[5]._id, societyId:sunrise._id, action:"visitor.trusted_registered",entity:"Visitor",entityId:visitorDocs[7]._id,   changes:{ visitorName:"Leela Maid", phone:"+919930001008" },                 ip:"127.0.0.1", timestamp:daysAgo(12) },
    // Issue actions
    { userId:residents[0]._id, societyId:sunrise._id, action:"issue.created",            entity:"Issue", entityId:createdIssues[0]._id,   changes:{ title:"Water leakage in corridor", category:"Water", priority:"High" }, ip:"127.0.0.1", timestamp:daysAgo(5) },
    { userId:adminUser._id,    societyId:sunrise._id, action:"issue.status_updated",     entity:"Issue", entityId:createdIssues[4]._id,   changes:{ from:"Open", to:"In Progress", assignedTo:"Admin Sharma" },        ip:"127.0.0.1", timestamp:daysAgo(4)  },
    { userId:adminUser._id,    societyId:sunrise._id, action:"issue.comment_added",      entity:"Issue", entityId:createdIssues[4]._id,   changes:{ isAdminReply:true, commentLength:45 },                             ip:"127.0.0.1", timestamp:daysAgo(3)  },
    // Notice actions
    { userId:adminUser._id,    societyId:sunrise._id, action:"notice.published",         entity:"Notice", entityId:null,                  changes:{ title:"Water Shutdown Tomorrow", tag:"Urgent" },                    ip:"127.0.0.1", timestamp:daysAgo(1)  },
    { userId:adminUser._id,    societyId:sunrise._id, action:"notice.pinned",            entity:"Notice", entityId:null,                  changes:{ isPinned:true },                                                    ip:"127.0.0.1", timestamp:daysAgo(1)  },
    { userId:sureshTrivedi._id, societyId:sunrise._id, action:"notice.published",        entity:"Notice", entityId:null,                  changes:{ title:"New Parking Rules", postedBy:"Suresh Trivedi" },             ip:"127.0.0.1", timestamp:daysAgo(10) },
    // Parking actions
    { userId:adminUser._id,    societyId:sunrise._id, action:"parking.slot_created",     entity:"ParkingSlot", entityId:createdSlots[0]._id, changes:{ slotNumber:"B-001", type:"4W", zone:"Basement Level 1" },       ip:"127.0.0.1", timestamp:daysAgo(60) },
    { userId:adminUser._id,    societyId:sunrise._id, action:"parking.request_approved", entity:"ParkingRequest", entityId:null,          changes:{ slotNumber:"TW-001", assignedTo:"D-404" },                         ip:"127.0.0.1", timestamp:daysAgo(5)  },
    // Event actions
    { userId:adminUser._id,    societyId:sunrise._id, action:"event.created",            entity:"Event", entityId:null,                  changes:{ title:"Diwali Grand Celebration 2025", category:"Festival" },        ip:"127.0.0.1", timestamp:daysAgo(5)  },
    { userId:adminUser._id,    societyId:sunrise._id, action:"event.cancelled",          entity:"Event", entityId:null,                  changes:{ title:"Swimming Competition", reason:"Pool maintenance" },           ip:"127.0.0.1", timestamp:daysAgo(2)  },
    // Member action
    { userId:adminUser._id,    societyId:sunrise._id, action:"member.approved",          entity:"User", entityId:residents[0]._id,       changes:{ flat:residents[0].memberships[0]?.flat, approvedBy:"Admin Sharma" }, ip:"127.0.0.1", timestamp:daysAgo(30) },
  ];

  await AuditLog.insertMany(auditEntries.map(e => ({ ...e, createdAt: e.timestamp })));
  log.ok(`${auditEntries.length} audit log entries across maintenance, visitor, issue, notice, parking, event actions`);

  // ══════════════════════════════════════════════════════════════════════════
  //  NOTIFICATIONS — 8  (TC-PN-002 to TC-PN-006)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Notifications");

  await Notification.insertMany([
    // TC-PN-002: Foreground notification (unread)
    { userId:residents[0]._id, societyId:sunrise._id, title:"Issue Update", body:"Your issue 'Water leakage in corridor' has been updated to In Progress.", type:"issue_update", data:{ issueId:createdIssues[0]._id.toString(), status:"In Progress" }, read:false },
    // TC-PN-003: Background tap navigation
    { userId:residents[1]._id, societyId:sunrise._id, title:"Visitor at Gate", body:"Raj Delivery wants entry. Approve or reject.", type:"visitor_walkin", data:{ visitorId:visitorDocs[2]._id.toString(), societyId:sunrise._id.toString() }, read:false },
    // TC-PN-004: Multi-society notification for Rohan
    { userId:rohanMehta._id, societyId:greenValley._id, title:"New Notice — Green Valley", body:"Water supply disruption notice from Green Valley.", type:"notice_published", data:{ societyId:greenValley._id.toString() }, read:false },
    // TC-PN-005: Bill published notification
    { userId:residents[2]._id, societyId:sunrise._id, title:"Bill Published", body:"May 2025 maintenance bill has been published. Due by May 31st.", type:"bill_published", data:{ billId:mayBill._id.toString(), societyId:sunrise._id.toString() }, read:false },
    // TC-PN-006: Walk-in notification
    { userId:residents[1]._id, societyId:sunrise._id, title:"Visitor Arrived", body:"Swiggy Delivery is at the gate for your flat.", type:"visitor_walkin", data:{ visitorId:visitorDocs[4]._id.toString(), societyId:sunrise._id.toString() }, read:false },
    // Read notification
    { userId:residents[0]._id, societyId:sunrise._id, title:"Booking Confirmed", body:"Your gym booking for tomorrow 7AM has been confirmed.", type:"booking_confirmed", data:{ bookingId:"booking_001" }, read:true },
    // Subscription expiry warning (TC-CJ-001)
    { userId:adminUser._id, societyId:sunrise._id, title:"Subscription Expiring Soon", body:"Sunrise Residency's trial plan expires in 6 days. Renew to avoid service interruption.", type:"subscription_expiry_warning", data:{ daysLeft:6, societyId:sunrise._id.toString() }, read:false },
    // Maintenance reminder (TC-CJ-015)
    { userId:residents[0]._id, societyId:sunrise._id, title:"Payment Overdue", body:"Your maintenance payment of ₹3,100 for 'May 2025' is 1 day overdue.", type:"maintenance_reminder", data:{ billId:mayBill._id.toString(), daysOverdue:1 }, read:false },
  ]);
  log.ok("8 notifications (issue_update, visitor_walkin, bill_published, booking_confirmed, sub_expiry, maintenance_reminder)");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const LINE = "─".repeat(80);
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║           ✅  EMINITY DEMO SEED v5 COMPLETE                     ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🛡️  SUPER ADMIN${c.reset}`);
  console.log(`    Email    : superadmin@societyapp.com`);
  console.log(`    Password : SuperAdmin@123\n`);

  console.log(`${c.bold}🏘️  SOCIETIES${c.reset}`);
  console.log(`    Sunrise Residency  — joinCode: ${c.bold}${c.yellow}${sunrise.joinCode}${c.reset}  (all modules ON, trial expires in 6d)`);
  console.log(`    Green Valley       — joinCode: ${c.bold}${c.yellow}${greenValley.joinCode}${c.reset}  (maintenance/amenities/events/parking OFF)`);
  console.log(`    Blue Horizon       — SUSPENDED (isActive: false)\n`);

  console.log(`${c.bold}👤  KEY CREDENTIALS${c.reset}`);
  console.log(LINE);
  console.log(` Role                   │ Email                              │ Password          │ Notes`);
  console.log(LINE);
  console.log(` ${c.yellow}admin${c.reset} (Sunrise)        │ admin@sunriseresidency.com         │ Admin@1234        │ flat A-101`);
  console.log(` ${c.yellow}admin${c.reset} (Green Valley)   │ admin@greenvalley.com              │ Admin@5678        │ flat G-101`);
  console.log(` ${c.yellow}admin${c.reset} (Blue Horizon)   │ admin@bluehorizon.com              │ Admin@9012        │ flat BH-01 (suspended)`);
  console.log(` ${c.cyan}committee${c.reset} notices:write  │ suresh.trivedi@resident.com        │ Committee@1234    │ flat B-201`);
  console.log(` ${c.cyan}committee${c.reset} maint:full     │ rekha.iyer@resident.com            │ Committee@5678    │ flat C-302 (Treasurer)`);
  console.log(` ${c.cyan}security${c.reset}                 │ ramesh.guard@resident.com          │ Security@1234     │ visitors:full`);
  console.log(` ${c.cyan}vendor${c.reset}                   │ vendor@quickfix.com                │ Vendor@1234       │ issues:read`);
  console.log(` ${c.cyan}multi-society${c.reset}            │ rohan.mehta@investor.com           │ Investor@1234     │ Sunrise A-401 + GV G-102`);
  console.log(` ${c.cyan}resident${c.reset}                 │ rahul.mehta@resident.com           │ Resident@1234     │ flat B-202`);
  console.log(` ${c.cyan}resident${c.reset}                 │ priya.patel@resident.com           │ Resident@5678     │ flat C-303`);
  console.log(` ${c.cyan}resident${c.reset}                 │ kiran.joshi@resident.com           │ Resident@9012     │ flat D-404`);
  console.log(` ${c.cyan}resident${c.reset}                 │ deepak.nair@resident.com           │ Resident@1234     │ flat F-601`);
  console.log(` ${c.cyan}resident${c.reset}                 │ sneha.reddy@resident.com           │ Resident@5678     │ flat E-502`);
  console.log(` ${c.cyan}resident${c.reset}                 │ arjun.kapoor@resident.com          │ Resident@9012     │ flat A-205`);
  console.log(` ${c.cyan}resident${c.reset}                 │ divya.shah@resident.com            │ Resident@1234     │ flat B-305`);
  console.log(` ${c.cyan}resident${c.reset}                 │ manish.kumar@resident.com          │ Resident@5678     │ flat C-401`);
  console.log(` ${c.cyan}resident${c.reset} ⏳ pending      │ amit.desai@resident.com            │ Resident@0001     │ flat E-505 (pending)`);
  console.log(` ${c.cyan}resident${c.reset} (GV)            │ kavya.sharma@resident.com          │ Resident@GV01     │ Green Valley GV-201`);
  console.log(` ${c.cyan}resident${c.reset} (BH suspended)  │ raj.bhatt@resident.com             │ Resident@BH01     │ Blue Horizon BH-201`);
  console.log(`${LINE}\n`);

  console.log(`${c.bold}📋  SOCIETY APPLICATIONS${c.reset}  (SA module testing)`);
  console.log(`    1 Approved (Sunrise) · 2 Pending (Palm Grove, Silver Heights) · 1 Rejected\n`);

  console.log(`${c.bold}📦  DATA COUNTS${c.reset}`);
  const rows = [
    ["Issues",             "16",  "4 Open (1 escalated, 1 anon), 4 In Progress, 8 Resolved — TC-015 to TC-018"],
    ["Notices",            "6",   "2 pinned, 3 published, 1 draft — TC-019 to TC-021"],
    ["Polls",              "3",   "1 closed+votes, 2 open — TC-022 to TC-025"],
    ["Help Posts",         "6",   "Plumber/Electrician/Maid/Food/Tutor/Transport — TC-026/027"],
    ["Contacts",           "10",  "3 Emergency, 4 Committee, 3 Vendor — TC-028/029"],
    ["Visitors",           "20",  "All statuses, trusted, OTP, walk-in, delivery — TC-030 to TC-035"],
    ["Maintenance Bills",  "3",   "May (published+overdue), June (draft), April (closed) — TC-036 to TC-041"],
    ["Amenities",          "3",   "Gym (auto), Clubhouse (approval), Pool — TC-042 to TC-045"],
    ["Bookings",           "10",  "Confirmed, pending, 5 conflict slots, past, cancelled — TC-042 to TC-045"],
    ["Events",             "5",   "Past, upcoming+RSVPs, upcoming+no RSVPs, cancelled, draft — TC-046 to TC-048"],
    ["Parking Slots",      "20",  "4W/2W/EV/Visitor/Reserved — TC-049 to TC-053"],
    ["Parking Requests",   "8",   "Pending, approved, rejected — TC-050/053"],
    ["Audit Logs",         "20",  "Maintenance, visitor, issue, notice, parking, event — TC-AL-001 to TC-AL-004"],
    ["Notifications",      "8",   "issue_update, visitor_walkin, bill_published, sub_expiry — TC-PN-002 to TC-PN-006"],
  ];
  rows.forEach(([label, count, detail]) => {
    console.log(`   ${label.padEnd(22)} ${c.bold}${String(count).padStart(3)}${c.reset}  ${c.gray}${detail}${c.reset}`);
  });

  console.log(`\n${c.bold}🧪  TC COVERAGE MAP${c.reset}`);
  console.log(`   TC-SA-001–006   Super Admin auth        → superadmin@societyapp.com`);
  console.log(`   TC-SA-007–010   Applications            → 4 applications seeded`);
  console.log(`   TC-SA-011–016   Society management      → 3 societies (active/disabled/suspended)`);
  console.log(`   TC-SA-017–022   Modules & analytics     → enabledModules per society`);
  console.log(`   TC-MS-001–005   Multi-society           → rohan.mehta@investor.com (2 memberships)`);
  console.log(`   TC-PN-001–006   Push notifications      → 8 notification docs seeded`);
  console.log(`   TC-001–009      Auth & registration     → all credential rows above`);
  console.log(`   TC-010–014      Profile & family        → residents have family members`);
  console.log(`   TC-015–018      Issues                  → 16 issues, all statuses`);
  console.log(`   TC-019–021      Notices                 → 6 notices, 2 pinned, 1 draft`);
  console.log(`   TC-022–025      Polls                   → 3 polls`);
  console.log(`   TC-026–027      Help posts              → 6 posts with replies`);
  console.log(`   TC-028–029      Contacts                → 10 contacts`);
  console.log(`   TC-030–035      Visitors                → 20 visitors all flows`);
  console.log(`   TC-036–041      Maintenance             → 3 bills, mixed payments`);
  console.log(`   TC-042–045      Amenities               → 3 amenities, 10 bookings`);
  console.log(`   TC-046–048      Events                  → 5 events all states`);
  console.log(`   TC-049–053      Parking                 → 20 slots, 8 requests`);
  console.log(`   TC-SEC-001–006  Security & RBAC         → role-specific users seeded`);
  console.log(`   TC-MG-001–004   Module gating           → Green Valley (paid OFF), Blue Horizon (suspended)`);
  console.log(`   TC-OB-001–008   Self-onboarding         → 4 applications seeded`);
  console.log(`   TC-IL-001–005   Invite links            → use admin login to generate`);
  console.log(`   TC-FP-001–006   Free plan / trial       → sunriseSub expires in 6d`);
  console.log(`   TC-AL-001–009   Audit logs              → 20 log entries seeded`);
  console.log(`   TC-CJ-001–025   Cron jobs               → data positioned for each cron scenario`);
  console.log("");

  await mongoose.disconnect();
  log.ok("MongoDB disconnected.  🚀  Happy Testing!\n");
}

seed().catch(err => {
  console.error(`\n\x1b[31m✖ Seed failed: ${err.message}\x1b[0m`);
  if (err.stack) console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});