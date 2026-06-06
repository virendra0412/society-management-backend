/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  SOCIETY APP — DEMO SEED  (small / fast)                                    ║
 * ║                                                                              ║
 * ║  Run:  node seed.demo.js                                                     ║
 * ║  Env:  MONGODB_URI  (defaults to mongodb://127.0.0.1:27017/society_db)      ║
 * ║                                                                              ║
 * ║  Scale                                                                       ║
 * ║  ────────────────────────────────────────────────────────────────────────── ║
 * ║  SuperAdmin           :  1                                                   ║
 * ║  Societies            :  3  (trial / basic / premium — different states)    ║
 * ║  Society Applications :  4  (pending × 2, approved × 1, rejected × 1)      ║
 * ║  Subscriptions        :  3  (one per society)                               ║
 * ║  Users                :  12 (1 admin + 1 vendor + 8 residents + 1 pending)  ║
 * ║  Issues               :  16 (all categories & statuses)                     ║
 * ║  Notices              :  6                                                   ║
 * ║  Polls                :  3  (1 closed, 2 open)                              ║
 * ║  Help Posts           :  6                                                   ║
 * ║  Contacts             :  10                                                  ║
 * ║  Visitors             :  10 (all statuses)                                  ║
 * ║  Maintenance Bills    :  3  (1 published, 1 closed, 1 draft)               ║
 * ║  Amenities            :  3                                                   ║
 * ║  Amenity Bookings     :  8                                                   ║
 * ║  Events               :  4  (1 past, 1 upcoming, 1 draft, 1 cancelled)     ║
 * ║  Parking Slots        :  20                                                  ║
 * ║  Parking Requests     :  8                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";

// ─── Models ───────────────────────────────────────────────────────────────────
const SuperAdmin      = require("./src/models/superAdmin.model");
const { Subscription } = require("./src/models/subscription.model");
const { SocietyApplication } = require("./src/models/societyApplication.model");
const Society         = require("./src/models/society.model");
const User            = require("./src/models/user.model");
const Issue           = require("./src/models/issue.model");
const Notice          = require("./src/models/notice.model");
const Poll            = require("./src/models/poll.model");
const Help            = require("./src/models/help.model");
const Contact         = require("./src/models/contact.model");
const Visitor         = require("./src/models/visitor.model");
const MaintenanceBill = require("./src/models/maintenance.model");
const { Amenity, AmenityBooking } = require("./src/models/amenity.model");
const { Event }                   = require("./src/models/event.model");
const { ParkingSlot, ParkingRequest } = require("./src/models/parking.model");

// ─── Colours ──────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m",
  yellow: "\x1b[33m", magenta: "\x1b[35m", red: "\x1b[31m", blue: "\x1b[34m", gray: "\x1b[90m",
};
const log = {
  section: (t) => console.log(`\n${c.bold}${c.magenta}▶  ${t}${c.reset}`),
  ok:      (t) => console.log(`${c.green}   ✔  ${t}${c.reset}`),
  info:    (t) => console.log(`${c.cyan}   ℹ  ${t}${c.reset}`),
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const daysAgo     = (d) => new Date(Date.now() - d * 86_400_000);
const daysFromNow = (d) => new Date(Date.now() + d * 86_400_000);
const hoursAgo    = (h) => new Date(Date.now() - h * 3_600_000);
const atHour      = (base, h) => { const d = new Date(base); d.setHours(h, 0, 0, 0); return d; };

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║   Society App — Demo Seed  (small/fast)  ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════╝${c.reset}\n`);

  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe ──────────────────────────────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════════════════════
  //  SUPER ADMIN
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Super Admin");
  const superAdmin = await SuperAdmin.create({
    name:     "Super Admin",
    email:    "superadmin@societyapp.com",
    password: "SuperAdmin@123",   // hashed by pre-save hook
    isActive: true,
  });
  log.ok(`superadmin → ${superAdmin.email} / SuperAdmin@123`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY 1 — Primary demo society (used for all features below)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Admin (Society 1)");
  const admin = await User.create({
    name:     "Admin Sharma",
    email:    "admin@sunriseresidency.com",
    phone:    "+919876543210",
    password: "Admin@1234",
    role:     "admin",
    flat:     "A-101",
    wing:     "A",
    familyMembers: [{ name: "Meena Sharma", relation: "Spouse", phone: null }],
    isApproved: true,
    isActive:   true,
  });

  const society1 = await Society.create({
    name:       "Sunrise Residency",
    address:    "Plot No. 42, Satellite Road",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      admin._id,
    joinMode:   "approval",
    totalUnits: 120,
    isActive:   true,
  });
  await User.findByIdAndUpdate(admin._id, { society: society1._id });
  log.ok(`Society 1: "Sunrise Residency"  joinCode: ${c.bold}${c.yellow}${society1.joinCode}${c.reset}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY 2 & 3  (secondary — for superadmin dashboard variety)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society 2 & 3 (for SA dashboard)");
  const admin2 = await User.create({
    name: "Ravi Patel", email: "admin@greenvalley.com",
    phone: "+919765432100", password: "Admin@1234",
    role: "admin", flat: "A-001", wing: "A",
    isApproved: true, isActive: true,
  });
  const society2 = await Society.create({
    name: "Green Valley Apartments", address: "Survey No. 12, SG Highway",
    city: "Ahmedabad", state: "Gujarat",
    admin: admin2._id, joinMode: "open", totalUnits: 80, isActive: true,
  });
  await User.findByIdAndUpdate(admin2._id, { society: society2._id });
  log.ok(`Society 2: "Green Valley Apartments" (basic plan)`);

  const admin3 = await User.create({
    name: "Sunita Mehta", email: "admin@bluehorizon.com",
    phone: "+919654321000", password: "Admin@1234",
    role: "admin", flat: "A-001", wing: "A",
    isApproved: true, isActive: true,
  });
  const society3 = await Society.create({
    name: "Blue Horizon CHS", address: "Prahlad Nagar, Thaltej Road",
    city: "Ahmedabad", state: "Gujarat",
    admin: admin3._id, joinMode: "approval", totalUnits: 200, isActive: false,
  });
  await User.findByIdAndUpdate(admin3._id, { society: society3._id });
  log.ok(`Society 3: "Blue Horizon CHS" (premium / inactive — suspended)`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SUBSCRIPTIONS (one per society)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Subscriptions");

  // Society 1 — trial (active, 18 days remaining)
  await Subscription.create({
    society:      society1._id,
    plan:         "trial",
    status:       "active",
    startDate:    daysAgo(12),
    endDate:      daysFromNow(18),
    priceMonthly: 0,
    autoRenew:    false,
    createdBy:    superAdmin._id,
    adminNotes:   "Demo society — on trial plan.",
    history: [{
      action: "created", toPlan: "trial", toStatus: "active",
      note: "Trial started — 30 days", performedBy: superAdmin._id,
      performedAt: daysAgo(12),
    }],
  });
  log.ok("Society 1 → trial (active, 18 days left)");

  // Society 2 — basic (active)
  await Subscription.create({
    society:      society2._id,
    plan:         "basic",
    status:       "active",
    startDate:    daysAgo(60),
    endDate:      daysFromNow(30),
    priceMonthly: 999,
    autoRenew:    true,
    createdBy:    superAdmin._id,
    history: [
      { action: "created",  toPlan: "trial", toStatus: "active",   note: "Trial started",        performedBy: superAdmin._id, performedAt: daysAgo(90) },
      { action: "upgraded", fromPlan: "trial", toPlan: "basic",    note: "Upgraded after trial",  performedBy: superAdmin._id, performedAt: daysAgo(60) },
    ],
  });
  log.ok("Society 2 → basic (active, auto-renew on)");

  // Society 3 — premium (suspended)
  await Subscription.create({
    society:      society3._id,
    plan:         "premium",
    status:       "suspended",
    startDate:    daysAgo(120),
    endDate:      daysAgo(5),
    priceMonthly: 2499,
    autoRenew:    false,
    createdBy:    superAdmin._id,
    adminNotes:   "Suspended due to payment failure. Awaiting resolution.",
    history: [
      { action: "created",   toPlan: "trial",   toStatus: "active",    note: "Trial started",            performedBy: superAdmin._id, performedAt: daysAgo(150) },
      { action: "upgraded",  fromPlan: "trial",  toPlan: "premium",    note: "Upgraded to premium",      performedBy: superAdmin._id, performedAt: daysAgo(120) },
      { action: "suspended", fromStatus: "active", toStatus: "suspended", note: "Payment failed — auto suspended", performedBy: superAdmin._id, performedAt: daysAgo(5) },
    ],
  });
  log.ok("Society 3 → premium (suspended — expired 5 days ago)");

  // ══════════════════════════════════════════════════════════════════════════
  //  SOCIETY APPLICATIONS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Society Applications (4)");

  await SocietyApplication.create({
    societyName: "Sunrise Residency", address: "Plot No. 42, Satellite Road",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 120,
    description: "Gated residential society with 6 wings.",
    adminName: "Admin Sharma", adminEmail: "admin@sunriseresidency.com", adminPhone: "+919876543210",
    status: "approved", reviewedBy: superAdmin._id, reviewedAt: daysAgo(14),
    reviewNote: "All details verified. Society created.", society: society1._id, adminUser: admin._id,
  });

  await SocietyApplication.create({
    societyName: "Palm Grove Society", address: "Bodakdev, Ahmedabad",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 60,
    description: "Small society near Thaltej metro.",
    adminName: "Girish Joshi", adminEmail: "admin@palmgrove.com", adminPhone: "+919812312312",
    status: "pending",
  });

  await SocietyApplication.create({
    societyName: "Silver Heights CHS", address: "Maninagar, Ahmedabad",
    city: "Ahmedabad", state: "Gujarat", totalUnits: 200,
    description: "High-rise cooperative housing society.",
    adminName: "Dilip Rao", adminEmail: "admin@silverheights.com", adminPhone: "+919823423423",
    status: "pending",
  });

  await SocietyApplication.create({
    societyName: "Fake Society Xyz", address: "Unknown Address",
    city: "Surat", state: "Gujarat", totalUnits: 5,
    adminName: "Test Reject", adminEmail: "reject@fake.com", adminPhone: "+919000000000",
    status: "rejected", reviewedBy: superAdmin._id, reviewedAt: daysAgo(3),
    reviewNote: "Incomplete details and suspicious application.",
  });

  log.ok("4 society applications (1 approved, 2 pending, 1 rejected)");

  // ══════════════════════════════════════════════════════════════════════════
  //  VENDOR
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Vendor");
  const vendor = await User.create({
    name: "QuickFix Services", email: "vendor@quickfix.com",
    phone: "+919845678901", password: "Vendor@1234", role: "vendor",
    flat: null, wing: null, society: society1._id,
    isApproved: true, isActive: true,
  });
  log.ok(`vendor → ${vendor.email} / Vendor@1234`);

  // ══════════════════════════════════════════════════════════════════════════
  //  RESIDENTS (8 active + 1 pending)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating 8 Residents + 1 Pending");

  const residentData = [
    { name: "Rahul Mehta",   email: "rahul.mehta@resident.com",   phone: "+919812345678", wing: "A", flat: "A-201", pwd: "Resident@1234" },
    { name: "Priya Patel",   email: "priya.patel@resident.com",   phone: "+919823456789", wing: "A", flat: "A-202", pwd: "Resident@1234" },
    { name: "Kiran Joshi",   email: "kiran.joshi@resident.com",   phone: "+919834567890", wing: "B", flat: "B-101", pwd: "Resident@1234" },
    { name: "Deepak Nair",   email: "deepak.nair@resident.com",   phone: "+919845678902", wing: "B", flat: "B-102", pwd: "Resident@1234" },
    { name: "Sneha Reddy",   email: "sneha.reddy@resident.com",   phone: "+919856789013", wing: "B", flat: "B-201", pwd: "Resident@1234" },
    { name: "Arjun Kapoor",  email: "arjun.kapoor@resident.com",  phone: "+919867890124", wing: "C", flat: "C-101", pwd: "Resident@1234" },
    { name: "Meera Shah",    email: "meera.shah@resident.com",    phone: "+919878901235", wing: "C", flat: "C-102", pwd: "Resident@1234" },
    { name: "Vivek Trivedi", email: "vivek.trivedi@resident.com", phone: "+919889012346", wing: "C", flat: "C-201", pwd: "Resident@1234" },
  ];

  const residents = [];
  for (const rd of residentData) {
    const u = await User.create({
      name: rd.name, email: rd.email, phone: rd.phone, password: rd.pwd,
      role: "resident", flat: rd.flat, wing: rd.wing, society: society1._id,
      familyMembers: [{ name: `${rd.name.split(" ")[0]} Spouse`, relation: "Spouse", phone: null }],
      isApproved: true, isActive: true,
    });
    residents.push(u);
  }

  const pendingResident = await User.create({
    name: "Amit Desai", email: "amit.desai@resident.com",
    phone: "+919999000001", password: "Resident@0001",
    role: "resident", flat: "C-301", wing: "C", society: society1._id,
    isApproved: false, isActive: true,
  });
  log.ok(`8 residents created + 1 pending (${pendingResident.email})`);

  // ══════════════════════════════════════════════════════════════════════════
  //  ISSUES — 16 (covers all categories and all statuses)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 16 Issues");

  const issueData = [
    // Open issues
    { title: "Water leakage in flat corridor",         category: "Water",       priority: "High",   status: "Open",        reporter: 0 },
    { title: "Lift out of order in Tower B",           category: "Lift",        priority: "High",   status: "Open",        reporter: 1, isEscalated: true },
    { title: "Gate not closing properly",              category: "Security",    priority: "Medium", status: "Open",        reporter: 2, isAnonymous: true },
    { title: "Garbage bin overflowing near Gate 1",   category: "Garbage",     priority: "Low",    status: "Open",        reporter: 3 },
    // In Progress
    { title: "Street light not working in parking",   category: "Electricity", priority: "Medium", status: "In Progress", reporter: 4 },
    { title: "Loud music after 10 PM from flat",      category: "Noise",       priority: "Low",    status: "In Progress", reporter: 5 },
    { title: "Car parked in wrong slot",              category: "Parking",     priority: "Medium", status: "In Progress", reporter: 6 },
    { title: "Gym equipment not maintained",          category: "Other",       priority: "Low",    status: "In Progress", reporter: 7 },
    // Resolved
    { title: "Overhead tank overflow",                category: "Water",       priority: "High",   status: "Resolved",    reporter: 0 },
    { title: "Lift door sensor malfunctioning",       category: "Lift",        priority: "High",   status: "Resolved",    reporter: 2 },
    { title: "CCTV camera not working near parking",  category: "Security",    priority: "Medium", status: "Resolved",    reporter: 1 },
    { title: "Garbage collection van absent for 3 days", category: "Garbage", priority: "Medium", status: "Resolved",    reporter: 3 },
    { title: "Power fluctuation in Wing B",           category: "Electricity", priority: "High",   status: "Resolved",    reporter: 4 },
    { title: "Dog barking all night",                 category: "Noise",       priority: "Low",    status: "Resolved",    reporter: 5 },
    { title: "Double parking in basement",            category: "Parking",     priority: "Medium", status: "Resolved",    reporter: 6 },
    { title: "Common area floor tile broken",         category: "Other",       priority: "Medium", status: "Resolved",    reporter: 7 },
  ];

  const issuesBulk = issueData.map((d, i) => ({
    title:       d.title,
    description: `Issue reported by flat ${residents[d.reporter].flat}. Ongoing for ${i + 1} days. Needs immediate attention.`,
    category:    d.category,
    priority:    d.priority,
    status:      d.status,
    society:     society1._id,
    reporter:    residents[d.reporter]._id,
    flat:        residents[d.reporter].flat,
    isAnonymous: d.isAnonymous || false,
    assignedTo:  d.status !== "Open" ? admin._id : null,
    assignedVendor: d.status === "In Progress" && i % 2 === 0
      ? { name: "QuickFix Services", phone: "+919845678901", note: "Assigned for inspection" }
      : { name: null, phone: null, note: null },
    resolvedAt:  d.status === "Resolved" ? daysAgo(i % 5 + 1) : null,
    isEscalated: d.isEscalated || false,
    escalatedAt: d.isEscalated ? daysAgo(1) : null,
    comments: d.status !== "Open" ? [{
      author: admin._id,
      body: "Acknowledged. Maintenance team notified.",
      isAdminReply: true,
      createdAt: daysAgo(i % 3 + 1),
    }] : [],
    createdAt: daysAgo(i + 1),
  }));
  await Issue.insertMany(issuesBulk);
  log.ok("16 issues (Open × 4, In Progress × 4, Resolved × 8)");

  // ══════════════════════════════════════════════════════════════════════════
  //  NOTICES — 6
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 6 Notices");

  await Notice.insertMany([
    {
      title: "🚨 Emergency: Water Supply Shutdown Tomorrow 6AM–2PM",
      body:  "Dear Residents,\n\nDue to pipeline maintenance, water supply will be suspended tomorrow from 6 AM to 2 PM. Please store water in advance.\n\nThank you,\nManagement Committee",
      tag: "Urgent", society: society1._id, postedBy: admin._id,
      isPinned: true, isPublished: true, createdAt: daysAgo(1),
    },
    {
      title: "💰 May 2025 Maintenance Charges Due — Pay Before 31st",
      body:  "Dear Residents,\n\nMonthly maintenance charges of ₹2,500 are due by May 31st. Late payments attract a penalty of ₹100. Pay via UPI or the society portal.\n\nThank you,\nTreasurer",
      tag: "Finance", society: society1._id, postedBy: admin._id,
      isPinned: true, isPublished: true, createdAt: daysAgo(5),
    },
    {
      title: "🎉 Republic Day Celebration — January 26 at 9 AM",
      body:  "All residents are invited to the Republic Day flag hoisting ceremony at the society ground. Children's events to follow. Refreshments will be served.",
      tag: "Event", society: society1._id, postedBy: admin._id,
      isPinned: false, isPublished: true, createdAt: daysAgo(20),
    },
    {
      title: "📌 New Parking Rules — Effective From June 1st",
      body:  "Please note updated parking rules: visitors must register at gate, max 12-hour visitor parking. Violating vehicles will be towed. Refer to bye-laws for details.",
      tag: "Notice", society: society1._id, postedBy: admin._id,
      isPinned: false, isPublished: true, createdAt: daysAgo(10),
    },
    {
      title: "🔔 REMINDER: AGM This Sunday — Attendance Mandatory",
      body:  "The Annual General Meeting is scheduled this Sunday at 11 AM in the Community Hall. All residents are requested to attend. Agenda: FY accounts, committee elections, terrace proposal.",
      tag: "Reminder", society: society1._id, postedBy: admin._id,
      isPinned: false, isPublished: true, createdAt: daysAgo(3),
    },
    {
      title: "🔧 Lift Maintenance Shutdown — Saturday 8AM–12PM (DRAFT)",
      body:  "Lift maintenance shutdown scheduled for Saturday morning. Residents on upper floors please plan accordingly. Emergency lift will remain operational.",
      tag: "Notice", society: society1._id, postedBy: admin._id,
      isPinned: false, isPublished: false, createdAt: daysAgo(0),
    },
  ]);
  log.ok("6 notices (2 pinned, 1 draft)");

  // ══════════════════════════════════════════════════════════════════════════
  //  POLLS — 3
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Polls");

  const voter4 = residents.slice(0, 4).map(r => r._id);
  const voter6 = residents.slice(0, 6).map(r => r._id);

  await Poll.insertMany([
    {
      question: "Which day suits best for the monthly society meeting?",
      options: [
        { label: "First Sunday",   votes: 4, voters: voter4 },
        { label: "Last Sunday",    votes: 2, voters: residents.slice(4,6).map(r=>r._id) },
        { label: "First Saturday", votes: 1, voters: [residents[6]._id] },
        { label: "Any Weekday Evening", votes: 1, voters: [residents[7]._id] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysAgo(5), isClosed: true, isAnonymous: false, totalVotes: 8,
      createdAt: daysAgo(20),
    },
    {
      question: "Should we install EV charging stations in parking?",
      options: [
        { label: "Yes — urgent need",           votes: 3, voters: residents.slice(0,3).map(r=>r._id) },
        { label: "Yes — within 6 months",       votes: 2, voters: residents.slice(3,5).map(r=>r._id) },
        { label: "No — too expensive",          votes: 0, voters: [] },
        { label: "Need resident survey first",  votes: 1, voters: [residents[5]._id] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysFromNow(7), isClosed: false, isAnonymous: true, totalVotes: 6,
      createdAt: daysAgo(3),
    },
    {
      question: "Should the clubhouse be available for rent to outsiders?",
      options: [
        { label: "Yes — helps fund maintenance",   votes: 0, voters: [] },
        { label: "No — residents only",            votes: 0, voters: [] },
        { label: "Conditional — committee approval", votes: 0, voters: [] },
        { label: "Weekend only",                   votes: 0, voters: [] },
      ],
      society: society1._id, createdBy: admin._id,
      closesAt: daysFromNow(14), isClosed: false, isAnonymous: true, totalVotes: 0,
      createdAt: daysAgo(1),
    },
  ]);
  log.ok("3 polls (1 closed with votes, 1 open with votes, 1 fresh)");

  // ══════════════════════════════════════════════════════════════════════════
  //  HELP POSTS — 6
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 6 Help Posts");

  await Help.insertMany([
    {
      title: "Need a reliable plumber for bathroom renovation",
      description: "Looking for an experienced plumber for bathroom reno. Budget ₹15k–₹25k.",
      category: "Plumber", society: society1._id, author: residents[0]._id, flat: residents[0].flat,
      isClosed: false,
      replies: [{
        author: residents[2]._id, body: "I used Ramesh Plumbing last month — very reliable.",
        isVendorContact: true, vendorPhone: "+919988776655",
        upvotes: [residents[1]._id, residents[3]._id], createdAt: daysAgo(1),
      }],
      createdAt: daysAgo(3),
    },
    {
      title: "Good electrician needed for modular kitchen wiring",
      description: "New modular kitchen being installed. Need licensed electrician.",
      category: "Electrician", society: society1._id, author: residents[1]._id, flat: residents[1].flat,
      isClosed: false, replies: [], createdAt: daysAgo(2),
    },
    {
      title: "Part-time maid available — morning hours only",
      description: "Our maid is available mornings 7–9 AM. Honest, 3 references from Wing A.",
      category: "Maid", society: society1._id, author: residents[2]._id, flat: residents[2].flat,
      isClosed: false,
      replies: [
        { author: residents[4]._id, body: "Can you share her contact? Very interested.", upvotes: [residents[5]._id], createdAt: daysAgo(0) },
      ],
      createdAt: daysAgo(5),
    },
    {
      title: "Best home-cooked tiffin service near our society?",
      description: "Just moved in, looking for Gujarati or Punjabi tiffin. Daily lunch + dinner.",
      category: "Food", society: society1._id, author: residents[3]._id, flat: residents[3].flat,
      isClosed: true,
      replies: [
        { author: residents[5]._id, body: "Meena Tiffin on Satellite Road is excellent. Very affordable.", upvotes: [residents[0]._id, residents[1]._id, residents[2]._id], createdAt: daysAgo(10) },
      ],
      createdAt: daysAgo(15),
    },
    {
      title: "Math tutor needed for Class 10 CBSE",
      description: "Need tutor for Class 10 Math. Home visits 5–7 PM weekdays preferred.",
      category: "Tutor", society: society1._id, author: residents[4]._id, flat: residents[4].flat,
      isClosed: false, replies: [], createdAt: daysAgo(1),
    },
    {
      title: "Carpool to Prahlad Nagar office park?",
      description: "Looking for cab sharing from society to Prahlad Nagar, weekdays 9:30 AM.",
      category: "Transport", society: society1._id, author: residents[5]._id, flat: residents[5].flat,
      isClosed: false,
      replies: [
        { author: residents[7]._id, body: "I go the same way! Let's connect on WhatsApp.", upvotes: [], createdAt: daysAgo(0) },
      ],
      createdAt: daysAgo(2),
    },
  ]);
  log.ok("6 help posts (1 closed, 5 open — with replies)");

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTACTS — 10
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 10 Contacts");

  await Contact.insertMany([
    { name: "Police Control Room",        phone: "+919876543211", group: "Emergency", designation: "Police",             icon: "🚔", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Fire Brigade",               phone: "+919876543213", group: "Emergency", designation: "Fire Department",    icon: "🔥", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Ambulance",                  phone: "+919876543214", group: "Emergency", designation: "Medical Emergency",  icon: "🚑", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Admin Sharma",               phone: "+919876543210", group: "Committee", designation: "Society Chairman",   icon: "👤", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Suresh Trivedi",             phone: "+919887654321", group: "Committee", designation: "Secretary",          icon: "📋", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Rekha Iyer",                 phone: "+919898765432", group: "Committee", designation: "Treasurer",          icon: "💰", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "QuickFix Electrical",        phone: "+919845678901", group: "Vendor",    designation: "Electrical Repairs", icon: "⚡", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Ramesh Plumbing Services",   phone: "+919988776655", group: "Vendor",    designation: "Plumber",            icon: "🔧", sortOrder: 2, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "SpeedLift Elevator Services",phone: "+919977665544", group: "Vendor",    designation: "Lift Maintenance",   icon: "🛗", sortOrder: 3, society: society1._id, addedBy: admin._id, isActive: true },
    { name: "Sunrise Residency Office",   phone: "+917966554433", group: "Other",     designation: "Society Office",     icon: "🏢", sortOrder: 1, society: society1._id, addedBy: admin._id, isActive: true },
  ]);
  log.ok("10 contacts (Emergency / Committee / Vendor / Other)");

  // ══════════════════════════════════════════════════════════════════════════
  //  VISITORS — 10 (all statuses covered)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 10 Visitors");

  const entryTime = hoursAgo(2);
  await Visitor.insertMany([
    {
      name: "Ankit Shah",       phone: "+919991000001", purpose: "Guest",
      society: society1._id, host: residents[0]._id, hostFlat: residents[0].flat,
      status: "invited", isWalkIn: false, expectedAt: daysFromNow(1), createdAt: daysAgo(1),
    },
    {
      name: "Swiggy Delivery",  phone: "+919991000002", purpose: "Delivery",
      vehicleNumber: "GJ01AB1234",
      society: society1._id, host: residents[1]._id, hostFlat: residents[1].flat,
      status: "pending", isWalkIn: true, loggedBy: vendor._id, createdAt: daysAgo(0),
    },
    {
      name: "Raj Kumar",        phone: "+919991000003", purpose: "Guest",
      society: society1._id, host: residents[2]._id, hostFlat: residents[2].flat,
      status: "approved", isWalkIn: false,
      entryTime, approvedAt: entryTime, approvedBy: residents[2]._id, createdAt: daysAgo(1),
    },
    {
      name: "Priya Visitor",    phone: "+919991000004", purpose: "Service",
      society: society1._id, host: residents[3]._id, hostFlat: residents[3].flat,
      status: "rejected", isWalkIn: true, loggedBy: vendor._id, createdAt: daysAgo(2),
    },
    {
      name: "Mohan Das",        phone: "+919991000005", purpose: "Guest",
      society: society1._id, host: residents[4]._id, hostFlat: residents[4].flat,
      status: "exited", isWalkIn: false,
      entryTime: hoursAgo(5), exitTime: hoursAgo(1),
      approvedAt: hoursAgo(5), approvedBy: residents[4]._id, createdAt: daysAgo(1),
    },
    {
      name: "Amazon Delivery",  phone: "+919991000006", purpose: "Delivery",
      vehicleNumber: "GJ05CD5678",
      society: society1._id, host: residents[5]._id, hostFlat: residents[5].flat,
      status: "exited", isWalkIn: true, loggedBy: vendor._id,
      entryTime: hoursAgo(3), exitTime: hoursAgo(2),
      approvedAt: hoursAgo(3), approvedBy: vendor._id, createdAt: daysAgo(0),
    },
    {
      name: "Leela Maid",       phone: "+919991000007", purpose: "Service",
      society: society1._id, host: residents[6]._id, hostFlat: residents[6].flat,
      status: "expired", isWalkIn: false, expectedAt: daysAgo(2), createdAt: daysAgo(5),
    },
    {
      name: "Bharat Gas Delivery", phone: "+919991000008", purpose: "Delivery",
      society: society1._id, host: residents[7]._id, hostFlat: residents[7].flat,
      status: "approved", isWalkIn: true, loggedBy: vendor._id,
      entryTime: hoursAgo(1), approvedAt: hoursAgo(1), approvedBy: vendor._id, createdAt: daysAgo(0),
    },
    {
      name: "Raju Electrician", phone: "+919991000009", purpose: "Service",
      note: "Verified service person — allow entry.",
      society: society1._id, host: residents[0]._id, hostFlat: residents[0].flat,
      status: "invited", isWalkIn: false, expectedAt: daysFromNow(0), createdAt: daysAgo(0),
    },
    {
      name: "Komal Friend",     phone: "+919991000010", purpose: "Guest",
      society: society1._id, host: residents[2]._id, hostFlat: residents[2].flat,
      status: "pending", isWalkIn: true, loggedBy: vendor._id, createdAt: daysAgo(0),
    },
  ]);
  log.ok("10 visitors (invited × 2, pending × 2, approved × 2, rejected × 1, exited × 2, expired × 1)");

  // ══════════════════════════════════════════════════════════════════════════
  //  MAINTENANCE BILLS — 3
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Maintenance Bills");

  const makePayments = (baseAmt, scenario) =>
    residents.map((res, i) => {
      const roll = (i * 3 + scenario) % 10;
      if (roll < 6)      return { resident: res._id, flat: res.flat, wing: res.wing, amount: baseAmt, penalty: 0, discount: 0, totalDue: baseAmt, status: "paid",    paidAmount: baseAmt, paidAt: daysAgo(10 - i), paymentMethod: ["upi","neft","cash"][i%3], transactionId: `TXN20250${scenario}${String(i).padStart(3,"0")}`, remindersSent: 0 };
      else if (roll < 8) return { resident: res._id, flat: res.flat, wing: res.wing, amount: baseAmt, penalty: 100, discount: 0, totalDue: baseAmt + 100, status: "overdue",  paidAmount: 0, remindersSent: 1, lastReminderAt: daysAgo(2) };
      else if (roll < 9) return { resident: res._id, flat: res.flat, wing: res.wing, amount: baseAmt, penalty: 0, discount: baseAmt, totalDue: 0, status: "waived",  paidAmount: 0, remindersSent: 0 };
      else               return { resident: res._id, flat: res.flat, wing: res.wing, amount: baseAmt, penalty: 0, discount: 0, totalDue: baseAmt, status: "unpaid",  paidAmount: 0, remindersSent: 0 };
    });

  // Closed past bill
  await MaintenanceBill.create({
    society: society1._id, createdBy: admin._id,
    title: "March 2025 — Monthly Maintenance",
    description: "Monthly maintenance charges for March 2025.",
    billMonth: "2025-03", baseAmount: 2500, dueDate: daysAgo(45),
    penaltyEnabled: true, penaltyAmount: 100,
    targetMode: "all", isPublished: true, isClosed: true,
    payments: makePayments(2500, 1),
  });
  log.ok("Bill: March 2025 (closed)");

  // Published active bill
  await MaintenanceBill.create({
    society: society1._id, createdBy: admin._id,
    title: "May 2025 — Monthly Maintenance",
    description: "Monthly maintenance charges for May 2025.",
    billMonth: "2025-05", baseAmount: 3000, dueDate: daysFromNow(10),
    penaltyEnabled: true, penaltyAmount: 100,
    targetMode: "all", isPublished: true, isClosed: false,
    payments: makePayments(3000, 2),
  });
  log.ok("Bill: May 2025 (published / active — due in 10 days)");

  // Draft bill
  await MaintenanceBill.create({
    society: society1._id, createdBy: admin._id,
    title: "June 2025 — Monthly Maintenance (Draft)",
    description: "Draft bill for June 2025. Awaiting committee review.",
    billMonth: "2025-06", baseAmount: 3000, dueDate: daysFromNow(40),
    penaltyEnabled: true, penaltyAmount: 100,
    targetMode: "all", isPublished: false, isClosed: false,
    payments: [],
  });
  log.ok("Bill: June 2025 (draft)");

  // ══════════════════════════════════════════════════════════════════════════
  //  AMENITIES — 3
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 3 Amenities");

  const gym = await Amenity.create({
    society: society1._id, createdBy: admin._id,
    name: "Society Gym", category: "Gym",
    description: "Well-equipped gym — treadmills, cycle, weights. 5 concurrent users max.",
    maxConcurrentBookings: 5, slotDurationOptions: [60], maxSlotDuration: 90,
    advanceBookingDays: 3, openTime: "05:30", closeTime: "22:00", closedDays: [],
    requiresApproval: false, depositAmount: 0,
    rules: "Wear proper workout attire.\nClean equipment after use.\nNo food inside.",
    isActive: true,
  });

  const clubhouse = await Amenity.create({
    society: society1._id, createdBy: admin._id,
    name: "Community Clubhouse", category: "Clubhouse",
    description: "Fully furnished clubhouse. AC, projector, sound system. Capacity: 80 pax.",
    maxConcurrentBookings: 1, slotDurationOptions: [120, 240, 480], maxSlotDuration: 480,
    advanceBookingDays: 14, openTime: "08:00", closeTime: "22:00", closedDays: [],
    requiresApproval: true, depositAmount: 2000,
    rules: "No loud DJ music after 9 PM.\nOwner responsible for cleaning.",
    isActive: true,
  });

  const badminton = await Amenity.create({
    society: society1._id, createdBy: admin._id,
    name: "Badminton Court", category: "Badminton Court",
    description: "Indoor synthetic-floored badminton court. Shuttlecocks at office.",
    maxConcurrentBookings: 2, slotDurationOptions: [60], maxSlotDuration: 60,
    advanceBookingDays: 7, openTime: "06:00", closeTime: "21:00", closedDays: [],
    requiresApproval: false, depositAmount: 0,
    rules: "Sports shoes mandatory.\nBring your own rackets.",
    isActive: true,
  });
  log.ok("3 amenities (Gym, Clubhouse, Badminton Court)");

  // ── Bookings — 8 ─────────────────────────────────────────────────────────
  log.section("Seeding 8 Amenity Bookings");

  const tomorrow = daysFromNow(1);
  const yesterday = daysAgo(1);

  await AmenityBooking.insertMany([
    { amenity: gym._id,       society: society1._id, bookedBy: residents[0]._id, startTime: atHour(tomorrow, 6),   endTime: atHour(tomorrow, 7),   durationMinutes: 60,  purpose: "Morning workout",    guestCount: 1, status: "confirmed", createdAt: daysAgo(1) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[1]._id, startTime: atHour(tomorrow, 7),   endTime: atHour(tomorrow, 8),   durationMinutes: 60,  purpose: "Evening session",    guestCount: 1, status: "confirmed", createdAt: daysAgo(1) },
    { amenity: badminton._id, society: society1._id, bookedBy: residents[2]._id, startTime: atHour(tomorrow, 8),   endTime: atHour(tomorrow, 9),   durationMinutes: 60,  purpose: "Sports practice",    guestCount: 2, status: "pending",   createdAt: daysAgo(0) },
    { amenity: clubhouse._id, society: society1._id, bookedBy: residents[3]._id, startTime: atHour(daysFromNow(5), 10), endTime: atHour(daysFromNow(5), 14), durationMinutes: 240, purpose: "Birthday party", guestCount: 30, status: "pending", createdAt: daysAgo(1) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[4]._id, startTime: atHour(yesterday, 6),  endTime: atHour(yesterday, 7),  durationMinutes: 60,  purpose: "Morning workout",    guestCount: 1, status: "completed", createdAt: daysAgo(3) },
    { amenity: badminton._id, society: society1._id, bookedBy: residents[5]._id, startTime: atHour(yesterday, 8),  endTime: atHour(yesterday, 9),  durationMinutes: 60,  purpose: "Sports practice",    guestCount: 2, status: "completed", createdAt: daysAgo(2) },
    { amenity: clubhouse._id, society: society1._id, bookedBy: residents[6]._id, startTime: atHour(daysAgo(3), 10), endTime: atHour(daysAgo(3), 14), durationMinutes: 240, purpose: "Kitty party",      guestCount: 20, status: "cancelled", cancelledBy: residents[6]._id, cancelReason: "Plans changed", createdAt: daysAgo(7) },
    { amenity: gym._id,       society: society1._id, bookedBy: residents[7]._id, startTime: atHour(daysAgo(5), 17), endTime: atHour(daysAgo(5), 18), durationMinutes: 60, purpose: "Regular exercise",  guestCount: 1, status: "rejected",  adminNote: "Slot overlap with society event", createdAt: daysAgo(6) },
  ]);
  log.ok("8 amenity bookings (confirmed × 2, pending × 2, completed × 2, cancelled × 1, rejected × 1)");

  // ══════════════════════════════════════════════════════════════════════════
  //  EVENTS — 4
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 4 Events");

  await Event.insertMany([
    {
      society: society1._id, createdBy: admin._id,
      title: "🏃 Annual Society Sports Day",
      description: "Fun sporting events for all age groups — relay races, badminton, carrom, chess, and tug-of-war.\n\nPrizes for all categories. Registration mandatory for outdoor events.",
      category: "Sports",
      startTime: daysAgo(10), endTime: new Date(daysAgo(10).getTime() + 4 * 3_600_000),
      venue: "Society Ground", rsvpEnabled: true,
      rsvpDeadline: daysAgo(12), capacity: 150, isPublished: true, isCancelled: false,
      reminderSent: true,
      rsvps: residents.slice(0,5).map((r, i) => ({
        resident: r._id, status: ["going","going","going","maybe","not_going"][i],
        guestCount: i < 3 ? 1 : 0, respondedAt: daysAgo(15),
      })),
      createdAt: daysAgo(30),
    },
    {
      society: society1._id, createdBy: admin._id,
      title: "🪔 Diwali Grand Celebration 2025",
      description: "Annual Diwali night — rangoli competition, puja, sweets distribution.\n\nDress code: Traditional. Children's competitions start at 6 PM.",
      category: "Festival",
      startTime: daysFromNow(20), endTime: new Date(daysFromNow(20).getTime() + 5 * 3_600_000),
      venue: "Society Ground", rsvpEnabled: true,
      rsvpDeadline: daysFromNow(18), capacity: 200, isPublished: true, isCancelled: false,
      rsvps: residents.slice(0,3).map((r) => ({
        resident: r._id, status: "going", guestCount: 2, respondedAt: daysAgo(1),
      })),
      createdAt: daysAgo(5),
    },
    {
      society: society1._id, createdBy: admin._id,
      title: "🧘 Weekend Yoga & Meditation Camp (DRAFT)",
      description: "Two-day yoga and meditation workshop by a certified instructor. Open to all age groups. Bring your own mat.",
      category: "Workshop",
      startTime: daysFromNow(14), endTime: new Date(daysFromNow(14).getTime() + 2 * 3_600_000),
      venue: "Terrace Garden", rsvpEnabled: true,
      rsvpDeadline: daysFromNow(12), capacity: 40, isPublished: false, isCancelled: false,
      rsvps: [], createdAt: daysAgo(1),
    },
    {
      society: society1._id, createdBy: admin._id,
      title: "🎭 Cultural Evening — Navratri Special (CANCELLED)",
      description: "Navratri garba night — traditional folk music, Gujarati farsan stalls.",
      category: "Cultural",
      startTime: daysFromNow(8), endTime: new Date(daysFromNow(8).getTime() + 5 * 3_600_000),
      venue: "Community Hall", rsvpEnabled: true,
      rsvpDeadline: daysFromNow(6), capacity: 300, isPublished: true,
      isCancelled: true, cancelReason: "Venue unavailable due to unexpected repair work. Will reschedule.",
      rsvps: [], createdAt: daysAgo(7),
    },
  ]);
  log.ok("4 events (1 past with RSVPs, 1 upcoming with RSVPs, 1 draft, 1 cancelled)");

  // ══════════════════════════════════════════════════════════════════════════
  //  PARKING — 20 slots + 8 requests
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 20 Parking Slots + 8 Requests");

  await ParkingSlot.insertMany([
    // 4W slots (B-001 to B-008)
    { society: society1._id, slotNumber: "B-001", zone: "Basement Level 1", type: "4W", status: "assigned", assignedTo: residents[0]._id, assignedFlat: residents[0].flat, vehicleNumber: "GJ01AA1001", assignedAt: daysAgo(60), assignedBy: admin._id },
    { society: society1._id, slotNumber: "B-002", zone: "Basement Level 1", type: "4W", status: "assigned", assignedTo: residents[1]._id, assignedFlat: residents[1].flat, vehicleNumber: "GJ01BB1002", assignedAt: daysAgo(90), assignedBy: admin._id },
    { society: society1._id, slotNumber: "B-003", zone: "Basement Level 1", type: "4W", status: "assigned", assignedTo: residents[2]._id, assignedFlat: residents[2].flat, vehicleNumber: "GJ01CC1003", assignedAt: daysAgo(30), assignedBy: admin._id },
    { society: society1._id, slotNumber: "B-004", zone: "Basement Level 1", type: "4W", status: "available" },
    { society: society1._id, slotNumber: "B-005", zone: "Basement Level 1", type: "4W", status: "blocked", note: "Blocked for waterproofing work" },
    // 2W slots (TW-001 to TW-007)
    { society: society1._id, slotNumber: "TW-001", zone: "Open Parking Area", type: "2W", status: "assigned", assignedTo: residents[3]._id, assignedFlat: residents[3].flat, vehicleNumber: "GJ05DD2001", assignedAt: daysAgo(45), assignedBy: admin._id },
    { society: society1._id, slotNumber: "TW-002", zone: "Open Parking Area", type: "2W", status: "assigned", assignedTo: residents[4]._id, assignedFlat: residents[4].flat, vehicleNumber: "GJ05EE2002", assignedAt: daysAgo(20), assignedBy: admin._id },
    { society: society1._id, slotNumber: "TW-003", zone: "Open Parking Area", type: "2W", status: "available" },
    { society: society1._id, slotNumber: "TW-004", zone: "Open Parking Area", type: "2W", status: "available" },
    // EV slots (EV-01 to EV-03)
    { society: society1._id, slotNumber: "EV-01", zone: "Basement Level 1 — EV Zone", type: "EV", status: "assigned", assignedTo: residents[5]._id, assignedFlat: residents[5].flat, vehicleNumber: "GJ01EV0001", assignedAt: daysAgo(15), assignedBy: admin._id, note: "7 kW AC EV Charging Point" },
    { society: society1._id, slotNumber: "EV-02", zone: "Basement Level 1 — EV Zone", type: "EV", status: "available", note: "7 kW AC EV Charging Point" },
    { society: society1._id, slotNumber: "EV-03", zone: "Basement Level 1 — EV Zone", type: "EV", status: "available", note: "7 kW AC EV Charging Point" },
    // Visitor slots (VIS-01 to VIS-05)
    { society: society1._id, slotNumber: "VIS-01", zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-02", zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-03", zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-04", zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available" },
    { society: society1._id, slotNumber: "VIS-05", zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available" },
    // Reserved
    { society: society1._id, slotNumber: "RES-01", zone: "Basement Level 1 — Reserved", type: "Reserved", status: "assigned", assignedTo: admin._id, assignedFlat: "A-101", vehicleNumber: "GJ01AA0001", assignedAt: daysAgo(200), assignedBy: admin._id, note: "Chairman reserved slot" },
    { society: society1._id, slotNumber: "RES-02", zone: "Basement Level 1 — Reserved", type: "Reserved", status: "assigned", assignedTo: residents[6]._id, assignedFlat: residents[6].flat, vehicleNumber: "GJ01AA0002", assignedAt: daysAgo(100), assignedBy: admin._id },
    { society: society1._id, slotNumber: "RES-03", zone: "Basement Level 1 — Reserved", type: "Reserved", status: "available" },
  ]);
  log.ok("20 parking slots (4W × 5, 2W × 4, EV × 3, Visitor × 5, Reserved × 3)");

  await ParkingRequest.insertMany([
    { society: society1._id, requestedBy: residents[5]._id, flat: residents[5].flat, slotType: "4W", vehicleNumber: "GJ01ZZ9001", vehicleDescription: "White Maruti Swift", status: "pending", createdAt: daysAgo(2) },
    { society: society1._id, requestedBy: residents[6]._id, flat: residents[6].flat, slotType: "2W", vehicleNumber: "GJ05YY9002", vehicleDescription: "Black Honda Activa",  status: "pending", createdAt: daysAgo(1) },
    { society: society1._id, requestedBy: residents[7]._id, flat: residents[7].flat, slotType: "EV", vehicleNumber: "GJ01EV9003", vehicleDescription: "Blue Tata Nexon EV",   status: "pending", note: "Urgently needed — vehicle parked on road.", createdAt: daysAgo(0) },
    { society: society1._id, requestedBy: residents[0]._id, flat: residents[0].flat, slotType: "4W", vehicleNumber: "GJ01AA8001", vehicleDescription: "Silver Hyundai Creta", status: "approved", resolvedBy: admin._id, resolvedAt: daysAgo(5), adminNote: "Slot B-004 assigned.", createdAt: daysAgo(10) },
    { society: society1._id, requestedBy: residents[1]._id, flat: residents[1].flat, slotType: "4W", vehicleNumber: "GJ01BB8002", vehicleDescription: "Grey Honda City",      status: "approved", resolvedBy: admin._id, resolvedAt: daysAgo(7), adminNote: "Slot assigned. Check All Slots.", createdAt: daysAgo(12) },
    { society: society1._id, requestedBy: residents[2]._id, flat: residents[2].flat, slotType: "EV", vehicleNumber: "GJ01EV8003", vehicleDescription: "White Ola S1 Pro",     status: "rejected", resolvedBy: admin._id, resolvedAt: daysAgo(3), adminNote: "No EV slots currently available.", createdAt: daysAgo(8) },
    { society: society1._id, requestedBy: residents[3]._id, flat: residents[3].flat, slotType: "2W", vehicleNumber: "GJ05CC8004", vehicleDescription: "Red Bajaj Pulsar",     status: "rejected", resolvedBy: admin._id, resolvedAt: daysAgo(2), adminNote: "All 2W slots occupied.", createdAt: daysAgo(6) },
    { society: society1._id, requestedBy: residents[4]._id, flat: residents[4].flat, slotType: "4W", vehicleNumber: "GJ01DD8005", vehicleDescription: "Black Toyota Innova",  status: "cancelled", resolvedBy: admin._id, resolvedAt: daysAgo(1), createdAt: daysAgo(4) },
  ]);
  log.ok("8 parking requests (pending × 3, approved × 2, rejected × 2, cancelled × 1)");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const LINE = "─".repeat(80);
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║               ✅  DEMO SEED COMPLETE                        ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🔐  SUPER ADMIN${c.reset}`);
  console.log(LINE);
  console.log(` Email    : superadmin@societyapp.com`);
  console.log(` Password : SuperAdmin@123`);
  console.log(`${LINE}\n`);

  console.log(`${c.bold}🏠  SOCIETIES${c.reset}`);
  console.log(LINE);
  console.log(` Society 1  "Sunrise Residency"       → trial (active, 18 days left)   joinCode: ${c.bold}${c.yellow}${society1.joinCode}${c.reset}`);
  console.log(` Society 2  "Green Valley Apartments" → basic (active, auto-renew on)`);
  console.log(` Society 3  "Blue Horizon CHS"        → premium (suspended — expired)`);
  console.log(`${LINE}\n`);

  console.log(`${c.bold}👤  CREDENTIALS — Society 1 (Sunrise Residency)${c.reset}`);
  console.log(LINE);
  console.log(` Role        │ Email                              │ Password         │ Flat`);
  console.log(LINE);
  console.log(` ${c.yellow}admin${c.reset}       │ admin@sunriseresidency.com          │ Admin@1234       │ A-101`);
  console.log(` ${c.cyan}resident${c.reset}    │ rahul.mehta@resident.com           │ Resident@1234    │ A-201`);
  console.log(` ${c.cyan}resident${c.reset}    │ priya.patel@resident.com           │ Resident@1234    │ A-202`);
  console.log(` ${c.cyan}resident${c.reset}    │ kiran.joshi@resident.com           │ Resident@1234    │ B-101`);
  console.log(` ${c.cyan}resident${c.reset}    │ deepak.nair@resident.com           │ Resident@1234    │ B-102`);
  console.log(` ${c.cyan}resident${c.reset}    │ sneha.reddy@resident.com           │ Resident@1234    │ B-201`);
  console.log(` ${c.cyan}resident${c.reset}    │ arjun.kapoor@resident.com          │ Resident@1234    │ C-101`);
  console.log(` ${c.cyan}resident${c.reset}    │ meera.shah@resident.com            │ Resident@1234    │ C-102`);
  console.log(` ${c.cyan}resident${c.reset}    │ vivek.trivedi@resident.com         │ Resident@1234    │ C-201`);
  console.log(` ${c.cyan}resident${c.reset} ⏳  │ amit.desai@resident.com            │ Resident@0001    │ C-301 (pending approval)`);
  console.log(` ${c.magenta}vendor${c.reset}      │ vendor@quickfix.com                │ Vendor@1234      │ —`);
  console.log(`${LINE}\n`);

  console.log(`${c.bold}📦  COUNTS${c.reset}`);
  const rows = [
    ["SuperAdmin",           "1",   "superadmin@societyapp.com"],
    ["Societies",            "3",   "trial / basic / premium-suspended"],
    ["Society Applications", "4",   "approved × 1, pending × 2, rejected × 1"],
    ["Subscriptions",        "3",   "active(trial) / active(basic) / suspended(premium)"],
    ["Users (Society 1)",    "12",  "1 admin + 1 vendor + 8 residents + 1 pending"],
    ["Issues",               "16",  "All 8 categories — Open × 4, In Progress × 4, Resolved × 8"],
    ["Notices",              "6",   "2 pinned, 1 draft, tags: Urgent/Finance/Event/Notice/Reminder"],
    ["Polls",                "3",   "1 closed (votes), 1 open (votes), 1 fresh"],
    ["Help Posts",           "6",   "1 closed, 5 open — with replies & vendor contacts"],
    ["Contacts",             "10",  "Emergency / Committee / Vendor / Other"],
    ["Visitors",             "10",  "All 6 statuses: invited/pending/approved/rejected/exited/expired"],
    ["Maintenance Bills",    "3",   "1 closed + 1 published active + 1 draft (payment records inside)"],
    ["Amenities",            "3",   "Gym / Clubhouse / Badminton Court"],
    ["Amenity Bookings",     "8",   "confirmed/pending/completed/cancelled/rejected"],
    ["Events",               "4",   "1 past + 1 upcoming + 1 draft + 1 cancelled"],
    ["Parking Slots",        "20",  "4W × 5, 2W × 4, EV × 3, Visitor × 5, Reserved × 3"],
    ["Parking Requests",     "8",   "pending × 3, approved × 2, rejected × 2, cancelled × 1"],
  ];
  rows.forEach(([label, count, detail]) => {
    console.log(`   ${label.padEnd(24)} ${c.bold}${String(count).padStart(3)}${c.reset}  ${c.gray}${detail}${c.reset}`);
  });

  console.log("");
  await mongoose.disconnect();
  log.ok("MongoDB disconnected.  🚀  Demo data ready!\n");
}

seed().catch(err => {
  console.error(`\n\x1b[31m✖ Seed failed: ${err.message}\x1b[0m`);
  if (err.stack) console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});