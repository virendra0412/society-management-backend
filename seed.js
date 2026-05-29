/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║     SOCIETY APP — DATABASE SEED  v3  (Phase 1 + Phase 2 + Gap Fixes)       ║
 * ║                                                                              ║
 * ║  Run:  node seed.js                                                          ║
 * ║  Env:  MONGODB_URI  (defaults to mongodb://127.0.0.1:27017/society_db)      ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  v3 FIXES                                                                   ║
 * ║  ─────────────────────────────────────────────────────────────────────────  ║
 * ║  BUG FIX (LOGIN): Removed manual bcrypt.hash() calls from User.create().   ║
 * ║    User.create() fires the Mongoose pre-save hook which hashes the          ║
 * ║    password automatically. Calling hash() before create() caused a          ║
 * ║    double-hash — the DB stored hash(hash(password)), making bcrypt.compare  ║
 * ║    always return false and login permanently broken.                        ║
 * ║    Plain-text passwords are now passed directly; the hook handles hashing. ║
 * ║                                                                              ║
 * ║  BUG FIX (CONTACTS): Previous seed logged "8 contacts" but only inserted   ║
 * ║    5. Emergency group (Fire Station, Police, Ambulance) was missing.        ║
 * ║    Now inserts 8 contacts as documented.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const crypto   = require("crypto");

// ─── Connection ───────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";

// ─── Models ───────────────────────────────────────────────────────────────────
const Society             = require("./src/models/society.model");
const User                = require("./src/models/user.model");
const Issue               = require("./src/models/issue.model");
const Notice              = require("./src/models/notice.model");
const Poll                = require("./src/models/poll.model");
const Help                = require("./src/models/help.model");
const Contact             = require("./src/models/contact.model");
const Visitor             = require("./src/models/visitor.model");
const MaintenanceBill     = require("./src/models/maintenance.model");
const { Amenity, AmenityBooking } = require("./src/models/amenity.model");
const { Event }                   = require("./src/models/event.model");
const { ParkingSlot, ParkingRequest } = require("./src/models/parking.model");

// ─── Colour helpers ───────────────────────────────────────────────────────────
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

// ─── Utilities ────────────────────────────────────────────────────────────────
const daysFromNow  = (d) => new Date(Date.now() + d * 86_400_000);
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000);

const atHour = (baseDate, h, m = 0) => {
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║   Society App — Full Database Seeder  v3         ║${c.reset}`);
  console.log(`${c.bold}║   Phase 1 + Phase 2  —  LOGIN BUG FIXED          ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════════════╝${c.reset}\n`);

  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe all collections ─────────────────────────────────────────────────
  log.section("Clearing all collections");
  await Promise.all([
    User.deleteMany({}),
    Society.deleteMany({}),
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
  log.ok("All collections cleared — starting fresh");

  // ══════════════════════════════════════════════════════════════════════════
  //  USERS
  //
  //  ⚠️  IMPORTANT — WHY PLAIN TEXT PASSWORDS:
  //  User.create() triggers the Mongoose pre-save hook on user.model.js which
  //  calls bcrypt.hash(this.password, saltRounds) automatically.
  //  If you pass an already-hashed password, the hook hashes it again → the
  //  stored value becomes hash(hash(password)) → bcrypt.compare always fails
  //  → login never works.
  //  Solution: always pass plain-text passwords to User.create(). The hook
  //  hashes them exactly once before writing to MongoDB.
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Users  ⚠  plain passwords — pre-save hook hashes them");

  // Admin (linked to society after Society is created)
  const adminUser = await User.create({
    name:     "Admin Sharma",
    email:    "admin@sunriseresidency.com",
    phone:    "+919876543210",
    password: "Admin@1234",          // ← plain text; hook hashes this
    role:     "admin",
    flat:     "A-101",
    wing:     "A",
    avatar:   null,
    familyMembers: [
      { name: "Meena Sharma", relation: "Spouse", phone: "+919876543211" },
      { name: "Rohan Sharma", relation: "Son",    phone: null            },
    ],
    isApproved: true,
    isActive:   true,
  });
  log.ok(`admin    → ${adminUser.email}  [A-101 / Wing A]  password: Admin@1234`);

  // ── Society ──────────────────────────────────────────────────────────────
  log.section("Creating Society");
  const society = await Society.create({
    name:       "Sunrise Residency",
    address:    "Plot No. 42, Satellite Road",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      adminUser._id,
    joinMode:   "approval",
    totalUnits: 120,
    isActive:   true,
    // joinCode is auto-generated by the model's pre-validate hook
  });
  log.ok(`Society "Sunrise Residency"  joinCode: ${c.bold}${c.yellow}${society.joinCode}${c.reset}`);

  // Link admin → society (had to create society first to get its _id)
  await User.findByIdAndUpdate(adminUser._id, { society: society._id });

  // ── Residents ────────────────────────────────────────────────────────────
  const resident1 = await User.create({
    name:     "Rahul Mehta",
    email:    "rahul.mehta@resident.com",
    phone:    "+919812345678",
    password: "Resident@1234",       // ← plain text
    role:     "resident",
    flat:     "B-202", wing: "B",
    society:  society._id,
    familyMembers: [
      { name: "Sneha Mehta", relation: "Spouse", phone: "+919812345679" },
      { name: "Aryan Mehta", relation: "Son",    phone: null            },
    ],
    isApproved: true, isActive: true,
  });
  log.ok(`resident → ${resident1.email}  [B-202 / Wing B]  password: Resident@1234`);

  const resident2 = await User.create({
    name:     "Priya Patel",
    email:    "priya.patel@resident.com",
    phone:    "+919823456789",
    password: "Resident@5678",       // ← plain text
    role:     "resident",
    flat:     "C-303", wing: "C",
    society:  society._id,
    familyMembers: [
      { name: "Vivek Patel", relation: "Spouse",   phone: "+919823456790" },
      { name: "Diya Patel",  relation: "Daughter", phone: null            },
    ],
    isApproved: true, isActive: true,
  });
  log.ok(`resident → ${resident2.email}  [C-303 / Wing C]  password: Resident@5678`);

  const resident3 = await User.create({
    name:     "Kiran Joshi",
    email:    "kiran.joshi@resident.com",
    phone:    "+919834567890",
    password: "Resident@9012",       // ← plain text
    role:     "resident",
    flat:     "D-404", wing: "D",
    society:  society._id,
    familyMembers: [],
    isApproved: true, isActive: true,
  });
  log.ok(`resident → ${resident3.email}  [D-404 / Wing D]  password: Resident@9012`);

  const resident4 = await User.create({
    name:     "Deepak Nair",
    email:    "deepak.nair@resident.com",
    phone:    "+919845678902",
    password: "Resident@3456",       // ← plain text
    role:     "resident",
    flat:     "F-601", wing: "F",
    society:  society._id,
    familyMembers: [
      { name: "Anita Nair", relation: "Spouse", phone: "+919845678903" },
    ],
    isApproved: true, isActive: true,
  });
  log.ok(`resident → ${resident4.email}  [F-601 / Wing F]  password: Resident@3456`);

  // Pending approval — can login but sees "pending" screen
  const pendingResident = await User.create({
    name:       "Amit Desai",
    email:      "amit.desai@resident.com",
    phone:      "+919856789012",
    password:   "Resident@0001",     // ← plain text
    role:       "resident",
    flat:       "E-505", wing: "E",
    society:    society._id,
    familyMembers: [],
    isApproved: false,               // ← pending — admin must approve
    isActive:   true,
  });
  log.ok(`resident → ${pendingResident.email}  [E-505 / Wing E]  ⏳ PENDING APPROVAL  password: Resident@0001`);

  // Vendor / Security
  const vendorUser = await User.create({
    name:     "QuickFix Security",
    email:    "security@quickfix.com",
    phone:    "+919845678901",
    password: "Vendor@1234",         // ← plain text
    role:     "vendor",
    flat:     null, wing: null,
    society:  society._id,
    familyMembers: [],
    isApproved: true, isActive: true,
  });
  log.ok(`vendor   → ${vendorUser.email}  password: Vendor@1234`);

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Issues");

  await Issue.create({
    title: "Water leakage in basement parking",
    description: "Continuous water leak near Gate B of basement parking. Flooding during rains.",
    category: "Water", priority: "High", status: "Open",
    photos: [], society: society._id,
    reporter: resident1._id, flat: resident1.flat,
    isAnonymous: false, comments: [],
  });
  log.ok("Issue #1 — Water leakage  [Open / High]");

  await Issue.create({
    title: "Lift frequently breaking down in Tower B",
    description: "Lift in Tower B out of order 3 times in 2 weeks. Elderly residents affected.",
    category: "Lift", priority: "High", status: "In Progress",
    photos: ["https://res.cloudinary.com/demo/image/upload/v1/society-app/issues/lift-broken.jpg"],
    society: society._id,
    reporter: resident2._id, flat: resident2.flat,
    isAnonymous: false,
    assignedTo: adminUser._id,
    assignedVendor: { name: "SpeedLift Services", phone: "+919977665544", note: "Technician visit scheduled for Friday 10 AM" },
    comments: [
      { author: adminUser._id, body: "Contacted SpeedLift Services. Technician visiting Friday.", isAdminReply: true },
    ],
  });
  log.ok("Issue #2 — Lift breakdown  [In Progress / High / vendor assigned]");

  await Issue.create({
    title: "Garbage not collected for 3 days",
    description: "Garbage collection van absent for 3 days. Bins overflowing.",
    category: "Garbage", priority: "Medium", status: "Resolved",
    photos: [], society: society._id,
    reporter: resident3._id, flat: resident3.flat,
    isAnonymous: false, resolvedAt: daysFromNow(-2),
    comments: [
      { author: adminUser._id, body: "Contacted municipal corporation. Resuming collection tomorrow.", isAdminReply: true },
      { author: resident3._id, body: "Confirmed — garbage collected this morning. Thanks!", isAdminReply: false },
    ],
  });
  log.ok("Issue #3 — Garbage  [Resolved]");

  await Issue.create({
    title: "Stray dogs near children's play area",
    description: "Multiple stray dogs near play area. Children unsafe.",
    category: "Security", priority: "Medium", status: "Open",
    photos: [], society: society._id,
    reporter: resident1._id, flat: resident1.flat,
    isAnonymous: true, comments: [],
  });
  log.ok("Issue #4 — Stray dogs  [Open / Anonymous]");

  await Issue.create({
    title: "Street lights not working in Wing C",
    description: "All street lights in Wing C corridor off for a week.",
    category: "Electricity", priority: "Low", status: "Open",
    photos: [], society: society._id,
    reporter: resident2._id, flat: resident2.flat,
    isAnonymous: false, comments: [],
  });
  log.ok("Issue #5 — Street lights  [Open / Low]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — NOTICES
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Notices");

  await Notice.create({
    title: "📌 Society Rules & Regulations — Must Read",
    body: "Dear Residents,\n\nAll residents must adhere to the following rules:\n\n1. No loud music after 10 PM.\n2. Pets must be on leash in common areas.\n3. Parking in designated slots only.\n4. Waste segregation is mandatory.\n5. Guests staying overnight must be registered at security.\n\nNon-compliance may result in a ₹500 fine per incident.\n\nManagement Committee",
    tag: "Notice", society: society._id, postedBy: adminUser._id,
    isPinned: true, isPublished: true,
  });
  log.ok("Notice #1 — Rules & Regulations  [PINNED]");

  await Notice.create({
    title: "🎉 Annual General Meeting — June 15, 2025",
    body: "Dear Residents,\n\nAGM will be held on Sunday, June 15, 2025 at 11:00 AM in the Community Hall.\n\nAgenda:\n1. Review of 2024-25 accounts\n2. Election of committee members\n3. Approval of 2025-26 budget\n\nAll residents are requested to attend.",
    tag: "Event", society: society._id, postedBy: adminUser._id,
    isPinned: false, isPublished: true,
  });
  log.ok("Notice #2 — AGM  [Event]");

  await Notice.create({
    title: "⚠️ Water Supply Interruption — June 8",
    body: "Dear Residents,\n\nWater supply will be interrupted on June 8, 2025 (Sunday) from 9:00 AM to 2:00 PM due to overhead tank maintenance.\n\nPlease store adequate water in advance.",
    tag: "Urgent", society: society._id, postedBy: adminUser._id,
    isPinned: false, isPublished: true,
  });
  log.ok("Notice #3 — Water Interruption  [Urgent]");

  await Notice.create({
    title: "💰 Q2 2025 Maintenance Charges Due",
    body: "Maintenance charges of ₹3,500 per flat are due by June 30, 2025.\n\nPay via bank transfer, cheque, or the society portal.\n\nLate payment: ₹100 penalty per month.",
    tag: "Finance", society: society._id, postedBy: adminUser._id,
    isPinned: false, isPublished: true,
  });
  log.ok("Notice #4 — Maintenance Due  [Finance]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — POLLS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Polls");

  await Poll.create({
    question: "Which day for the monthly society cleanup drive?",
    options: [
      { label: "First Saturday", votes: 3, voters: [resident1._id, resident2._id, resident3._id] },
      { label: "First Sunday",   votes: 2, voters: [adminUser._id, vendorUser._id]               },
      { label: "Last Saturday",  votes: 1, voters: [resident4._id]                              },
    ],
    society: society._id, createdBy: adminUser._id,
    closesAt: daysFromNow(7), isClosed: false, isAnonymous: true, totalVotes: 6,
  });
  log.ok("Poll #1 — Cleanup drive day  [open, 6 votes]");

  await Poll.create({
    question: "Should we install CCTV cameras in the parking area?",
    options: [
      { label: "Yes — strongly agree",                 votes: 3, voters: [resident1._id, resident3._id, adminUser._id] },
      { label: "Yes — only if cost is shared equally", votes: 2, voters: [resident2._id, vendorUser._id]              },
      { label: "No — not necessary",                   votes: 1, voters: [resident4._id]                              },
    ],
    society: society._id, createdBy: adminUser._id,
    closesAt: daysFromNow(-3), isClosed: true, isAnonymous: false, totalVotes: 6,
  });
  log.ok("Poll #2 — CCTV parking  [closed, 6 votes]");

  await Poll.create({
    question: "What should the gym operating hours be?",
    options: [
      { label: "5 AM – 10 PM", votes: 0, voters: [] },
      { label: "6 AM – 10 PM", votes: 0, voters: [] },
      { label: "6 AM – 11 PM", votes: 0, voters: [] },
      { label: "24 hours",     votes: 0, voters: [] },
    ],
    society: society._id, createdBy: adminUser._id,
    closesAt: daysFromNow(14), isClosed: false, isAnonymous: true, totalVotes: 0,
  });
  log.ok("Poll #3 — Gym hours  [fresh, 0 votes — resident4 can vote here]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — HELP POSTS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Community Help Posts");

  await Help.create({
    title: "Looking for a reliable plumber for bathroom renovation",
    description: "Need a plumber for complete bathroom renovation incl. tiles + shower. Budget ₹15k–₹20k.",
    category: "Plumber", society: society._id,
    author: resident1._id, flat: resident1.flat, isClosed: false,
    replies: [
      { author: adminUser._id, body: "Recommend Ramesh Plumbing Services — did our office last year. Very professional.", isVendorContact: true, vendorPhone: "+919988776655", upvotes: [resident2._id, resident3._id] },
      { author: resident2._id, body: "Second that. Ramesh did my bathroom in C-303. Reasonable + clean work.", isVendorContact: false, vendorPhone: null, upvotes: [resident1._id] },
    ],
  });
  log.ok("Help #1 — Plumber request  [2 replies, upvoted]");

  await Help.create({
    title: "Anyone know a good maid for part-time cleaning?",
    description: "Need a maid for daily cleaning of 2BHK. Morning hours (7–9 AM). Salary negotiable.",
    category: "Maid", society: society._id,
    author: resident3._id, flat: resident3.flat, isClosed: false,
    replies: [
      { author: resident2._id, body: "Sunita ben works in our flat and is free mornings. Can share her number.", isVendorContact: false, vendorPhone: null, upvotes: [resident3._id] },
    ],
  });
  log.ok("Help #2 — Maid request  [1 reply]");

  await Help.create({
    title: "Best food delivery inside our society?",
    description: "Which apps/restaurants reliably deliver to Sunrise Residency? Quick weekday lunch options.",
    category: "Food", society: society._id,
    author: resident2._id, flat: resident2.flat, isClosed: true,
    replies: [
      { author: resident1._id, body: "Swiggy + Zomato both deliver well. Aarohi Tiffin is great for homemade food.", isVendorContact: false, vendorPhone: null, upvotes: [resident2._id, resident3._id, adminUser._id] },
    ],
  });
  log.ok("Help #3 — Food delivery  [closed, 3 upvotes]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — CONTACTS  (8 total: 3 Emergency + 2 Committee + 2 Vendor + 1 Other)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Contacts  (8 total)");

  await Contact.insertMany([
    // Emergency (3)
    { name: "Fire Station — Satellite",  phone: "+919876543214",            group: "Emergency", designation: "Fire Emergency",    icon: "🔥", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Police Control Room",       phone: "+919876543230",            group: "Emergency", designation: "Police Emergency",  icon: "🚔", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    { name: "Ambulance / EMRI",          phone: "+919876543218",            group: "Emergency", designation: "Medical Emergency", icon: "🚑", society: society._id, addedBy: adminUser._id, sortOrder: 3 },
    // Committee (2)
    { name: "Admin Sharma",              phone: "+919876543210",  group: "Committee", designation: "Society Chairman",  icon: "👤", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Suresh Trivedi",            phone: "+919887654321",  group: "Committee", designation: "Secretary",         icon: "📋", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    // Vendor (2)
    { name: "QuickFix Electrical",       phone: "+919845678901",  group: "Vendor",    designation: "Electrical Repairs",icon: "⚡", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Ramesh Plumbing Services",  phone: "+919988776655",  group: "Vendor",    designation: "Plumber",           icon: "🔧", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    // Other (1)
    { name: "Sunrise Residency Office",  phone: "+917966554433",  group: "Other",     designation: "Society Office",    icon: "🏢", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
  ]);
  log.ok("8 contacts — Emergency (3) / Committee (2) / Vendor (2) / Other (1)");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — VISITORS  (7 covering all statuses)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Visitors  (Phase 2)");

  // 1. Active pre-approved invite — 24-h OTP, share with security
  const visitorInvite = new Visitor({
    name: "Ankit Shah", phone: "+919900112233", purpose: "Guest",
    note: "Old college friend visiting for the weekend",
    society: society._id, host: resident1._id, hostFlat: resident1.flat,
    status: "invited", isWalkIn: false, expectedAt: daysFromNow(1),
  });
  const rawOTP = visitorInvite.generateOTP(1440); // 24-hour expiry
  await visitorInvite.save();
  log.ok(`Visitor #1 — Ankit Shah       [invited / OTP: ${c.bold}${c.yellow}${rawOTP}${c.reset} / 24h]`);

  // 2. Invite expiring soon (~3h) — demos countdown badge in UI
  const nearExpiryInvite = new Visitor({
    name: "Raj Kumar", phone: "+919901234567", purpose: "Guest",
    note: "Cousin visiting briefly",
    society: society._id, host: resident2._id, hostFlat: resident2.flat,
    status: "invited", isWalkIn: false, expectedAt: hoursFromNow(3),
  });
  const nearExpiryOTP = nearExpiryInvite.generateOTP(180); // 3-hour expiry → shows countdown
  await nearExpiryInvite.save();
  log.ok(`Visitor #2 — Raj Kumar        [invited / OTP: ${c.bold}${c.yellow}${nearExpiryOTP}${c.reset} / ~3h — shows countdown]`);

  // 3. Expired / cancelled invite
  await Visitor.create({
    name: "Cancelled Guest", phone: "+919902345678", purpose: "Guest",
    note: "Plans changed, invite cancelled by resident",
    society: society._id, host: resident1._id, hostFlat: resident1.flat,
    status: "expired", isWalkIn: false,
    entryOTPHash: null, entryOTPExpires: null, expectedAt: daysFromNow(-1),
  });
  log.ok("Visitor #3 — Cancelled Guest  [expired — invite cancelled]");

  // 4. Walk-in PENDING — awaiting resident approval
  await Visitor.create({
    name: "Flipkart Delivery", phone: "+919903456789", purpose: "Delivery",
    vehicleNumber: "GJ05XY3456",
    society: society._id, host: resident3._id, hostFlat: resident3.flat,
    status: "pending", isWalkIn: true, loggedBy: vendorUser._id,
  });
  log.ok("Visitor #4 — Flipkart Delivery [walk-in / pending resident approval]");

  // 5. Walk-in APPROVED — currently inside
  await Visitor.create({
    name: "Amazon Delivery Boy", phone: "+919911223344", purpose: "Delivery",
    vehicleNumber: "GJ01AB1234",
    society: society._id, host: resident2._id, hostFlat: resident2.flat,
    status: "approved", isWalkIn: true, loggedBy: vendorUser._id,
    approvedBy: resident2._id,
    entryTime: hoursFromNow(-0.5), approvedAt: hoursFromNow(-0.5),
  });
  log.ok("Visitor #5 — Amazon Delivery  [walk-in / approved / inside]");

  // 6. Walk-in REJECTED
  await Visitor.create({
    name: "Unknown Caller", phone: "+919912345678", purpose: "Other",
    note: "Resident did not recognise the visitor",
    society: society._id, host: resident4._id, hostFlat: resident4.flat,
    status: "rejected", isWalkIn: true, loggedBy: vendorUser._id,
  });
  log.ok("Visitor #6 — Unknown Caller   [walk-in / rejected by resident]");

  // 7. Exited visitor
  await Visitor.create({
    name: "Sunita Ben", phone: "+919922334455", purpose: "Service",
    note: "Regular maid for flat D-404",
    society: society._id, host: resident3._id, hostFlat: resident3.flat,
    status: "exited", isWalkIn: false,
    entryTime: hoursFromNow(-4), exitTime: hoursFromNow(-1),
    approvedAt: hoursFromNow(-4), approvedBy: vendorUser._id,
  });
  log.ok("Visitor #7 — Sunita Ben       [exited]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — MAINTENANCE BILLS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Maintenance Bills  (Phase 2)");

  // Bill 1 — May 2025 — published, mixed payment statuses
  await MaintenanceBill.create({
    society: society._id, createdBy: adminUser._id,
    title: "May 2025 — Monthly Maintenance",
    description: "Regular monthly maintenance charges covering common area upkeep, security, and housekeeping.",
    billMonth: "2025-05", baseAmount: 3500,
    dueDate: daysFromNow(-5),        // already overdue
    penaltyEnabled: true, penaltyAmount: 100,
    targetMode: "all", isPublished: true, isClosed: false,
    payments: [
      { resident: resident1._id, flat: resident1.flat, wing: resident1.wing, amount: 3500, penalty: 0, discount: 0, totalDue: 3500, status: "paid",    paidAmount: 3500, paidAt: daysFromNow(-8), paymentMethod: "upi",    transactionId: "UPI20250501RAHUL001", receiptNote: "Paid via Google Pay", remindersSent: 0 },
      { resident: resident2._id, flat: resident2.flat, wing: resident2.wing, amount: 3500, penalty: 100, discount: 0, totalDue: 3600, status: "overdue", paidAmount: 0, remindersSent: 2, lastReminderAt: daysFromNow(-1) },
      { resident: resident3._id, flat: resident3.flat, wing: resident3.wing, amount: 3500, penalty: 0, discount: 500, totalDue: 3000, status: "unpaid",  paidAmount: 0, remindersSent: 1, lastReminderAt: daysFromNow(-2) },
      { resident: resident4._id, flat: resident4.flat, wing: resident4.wing, amount: 3500, penalty: 0, discount: 3500, totalDue: 0, status: "waived",   paidAmount: 0, receiptNote: "Waived — new resident joining mid-month", remindersSent: 0 },
    ],
  });
  log.ok("Bill #1 — May 2025  [published / 1 paid, 1 overdue, 1 unpaid, 1 waived]");

  // Bill 2 — June 2025 — draft (not published)
  await MaintenanceBill.create({
    society: society._id, createdBy: adminUser._id,
    title: "June 2025 — Monthly Maintenance",
    description: "Monthly maintenance for June 2025.",
    billMonth: "2025-06", baseAmount: 3500,
    dueDate: daysFromNow(25),
    penaltyEnabled: true, penaltyAmount: 100,
    targetMode: "all", isPublished: false, isClosed: false, payments: [],
  });
  log.ok("Bill #2 — June 2025  [DRAFT — not yet published]");

  // Bill 3 — Specific-flat levy (Wing B & C only)
  await MaintenanceBill.create({
    society: society._id, createdBy: adminUser._id,
    title: "Wing B & C — Corridor Tile Replacement Levy",
    description: "One-time special levy for corridor flooring replacement in Wings B and C.",
    billMonth: "2025-06", baseAmount: 1500,
    dueDate: daysFromNow(20),
    penaltyEnabled: false, penaltyAmount: 0,
    targetMode: "specific", targetFlats: [resident1.flat, resident2.flat],
    isPublished: true, isClosed: false,
    payments: [
      { resident: resident1._id, flat: resident1.flat, wing: resident1.wing, amount: 1500, penalty: 0, discount: 0, totalDue: 1500, status: "unpaid", paidAmount: 0, remindersSent: 0 },
      { resident: resident2._id, flat: resident2.flat, wing: resident2.wing, amount: 1500, penalty: 0, discount: 0, totalDue: 1500, status: "unpaid", paidAmount: 0, remindersSent: 0 },
    ],
  });
  log.ok("Bill #3 — Wing B & C Levy  [specific-flat targeted / 2 flats / published]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — AMENITIES + BOOKINGS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Amenities & Bookings  (Phase 2)");

  const clubhouse = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Community Clubhouse", category: "Clubhouse",
    description: "Fully furnished clubhouse for private gatherings, parties, and society functions. Capacity: 80 persons.",
    maxConcurrentBookings: 1, slotDurationOptions: [120, 240, 480], maxSlotDuration: 480,
    advanceBookingDays: 14, openTime: "08:00", closeTime: "22:00",
    closedDays: [], requiresApproval: true, depositAmount: 2000,
    rules: "No loud DJ music after 9 PM.\nOwner responsible for cleaning after event.\nAlcohol is not permitted in common areas.",
    isActive: true,
  });
  log.ok("Amenity #1 — Community Clubhouse  [requires admin approval]");

  const gym = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Society Gym", category: "Gym",
    description: "Well-equipped gym with treadmills, weights, and yoga space. Open to all approved residents.",
    maxConcurrentBookings: 5, slotDurationOptions: [60], maxSlotDuration: 90,
    advanceBookingDays: 3, openTime: "05:30", closeTime: "22:00",
    closedDays: [], requiresApproval: false, depositAmount: 0,
    rules: "Wear proper workout attire.\nClean equipment after use.\nNo food inside the gym.",
    isActive: true,
  });
  log.ok("Amenity #2 — Society Gym  [auto-confirm, 5 concurrent]");

  // Booking 1 — Gym tomorrow 7–8 AM — confirmed
  await AmenityBooking.create({ amenity: gym._id, society: society._id, bookedBy: resident1._id, startTime: atHour(daysFromNow(1), 7), endTime: atHour(daysFromNow(1), 8), durationMinutes: 60, purpose: "Morning workout", guestCount: 1, status: "confirmed" });
  log.ok("Booking #1 — Gym tomorrow 7–8 AM  [confirmed / Rahul]");

  // Booking 2 — Clubhouse in 5 days — pending approval
  await AmenityBooking.create({ amenity: clubhouse._id, society: society._id, bookedBy: resident2._id, startTime: atHour(daysFromNow(5), 14), endTime: atHour(daysFromNow(5), 18), durationMinutes: 240, purpose: "Birthday party for daughter", guestCount: 30, status: "pending" });
  log.ok("Booking #2 — Clubhouse in 5 days  [pending approval / Priya]");

  // Booking 3 — Gym 3 days ago — cancelled
  await AmenityBooking.create({ amenity: gym._id, society: society._id, bookedBy: resident3._id, startTime: atHour(daysFromNow(-3), 6), endTime: atHour(daysFromNow(-3), 7), durationMinutes: 60, purpose: "Morning yoga", guestCount: 1, status: "cancelled", cancelledBy: resident3._id, cancelReason: "Travel plans changed" });
  log.ok("Booking #3 — Gym 3 days ago  [cancelled / Kiran]");

  // Booking 4 — Clubhouse 2 weeks ago — rejected by admin
  await AmenityBooking.create({ amenity: clubhouse._id, society: society._id, bookedBy: resident4._id, startTime: atHour(daysFromNow(-14), 10), endTime: atHour(daysFromNow(-14), 14), durationMinutes: 240, purpose: "Corporate team outing", guestCount: 40, status: "rejected", adminNote: "External corporate bookings are not permitted per society rules." });
  log.ok("Booking #4 — Clubhouse 2 weeks ago  [rejected / Deepak]");

  // Booking 5 — Gym yesterday — completed
  await AmenityBooking.create({ amenity: gym._id, society: society._id, bookedBy: resident4._id, startTime: atHour(daysFromNow(-1), 7), endTime: atHour(daysFromNow(-1), 8), durationMinutes: 60, purpose: "Evening workout", guestCount: 1, status: "completed" });
  log.ok("Booking #5 — Gym yesterday  [completed / Deepak]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — EVENTS + RSVPs
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Events  (Phase 2)");

  await Event.create({
    society: society._id, createdBy: adminUser._id,
    title: "Diwali Celebration 2025 🪔",
    description: "Annual Diwali celebration in the community hall. Enjoy rangoli competition, puja, sweets distribution, and sparklers in the open ground.\n\nDress code: Traditional attire.",
    category: "Festival",
    startTime: atHour(daysFromNow(10), 18, 30),
    endTime:   atHour(daysFromNow(10), 21, 30),
    venue: "Community Hall + Open Ground",
    rsvpEnabled: true, rsvpDeadline: daysFromNow(8), capacity: 150,
    isPublished: true, isCancelled: false, reminderSent: false,
    rsvps: [
      { resident: resident1._id, status: "going",     guestCount: 2, note: "Bringing family",        respondedAt: daysFromNow(-1) },
      { resident: resident2._id, status: "going",     guestCount: 1, note: "Coming with spouse",     respondedAt: daysFromNow(-2) },
      { resident: resident3._id, status: "maybe",     guestCount: 0, note: "Will confirm by Friday", respondedAt: daysFromNow(-1) },
      { resident: adminUser._id, status: "going",     guestCount: 0, note: null,                     respondedAt: daysFromNow(-3) },
      { resident: resident4._id, status: "not_going", guestCount: 0, note: "Out of town",            respondedAt: daysFromNow(-1) },
    ],
  });
  log.ok("Event #1 — Diwali Celebration  [published / 3 going, 1 maybe, 1 not going]");

  await Event.create({
    society: society._id, createdBy: adminUser._id,
    title: "Monthly Committee Meeting — June 2025",
    description: "Monthly meeting to discuss society matters, pending issues, and upcoming maintenance schedule.",
    category: "Meeting",
    startTime: atHour(daysFromNow(20), 10),
    endTime:   atHour(daysFromNow(20), 12),
    venue: "Committee Room, Ground Floor",
    rsvpEnabled: false, capacity: null,
    isPublished: false, isCancelled: false, reminderSent: false, rsvps: [],
  });
  log.ok("Event #2 — June Committee Meeting  [DRAFT / RSVP disabled]");

  await Event.create({
    society: society._id, createdBy: adminUser._id,
    title: "Kids Sports Day 🏅",
    description: "Annual sports day for children aged 4–14 in the society ground.",
    category: "Sports",
    startTime: atHour(daysFromNow(-3), 16),
    endTime:   atHour(daysFromNow(-3), 18),
    venue: "Society Ground",
    rsvpEnabled: true, capacity: 80,
    isPublished: true, isCancelled: true,
    cancelReason: "Cancelled due to heavy rain forecast.",
    reminderSent: false,
    rsvps: [
      { resident: resident1._id, status: "going", guestCount: 1, respondedAt: daysFromNow(-5) },
      { resident: resident2._id, status: "going", guestCount: 0, respondedAt: daysFromNow(-4) },
    ],
  });
  log.ok("Event #3 — Kids Sports Day  [cancelled — rain forecast]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — PARKING
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Parking  (Phase 2)");

  // 4-Wheeler slots
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "B-001", zone: "Basement B", type: "4W", status: "assigned", assignedTo: resident1._id, assignedFlat: resident1.flat, vehicleNumber: "GJ01AB9999", assignedAt: daysFromNow(-30), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "B-002", zone: "Basement B", type: "4W", status: "assigned", assignedTo: resident2._id, assignedFlat: resident2.flat, vehicleNumber: "GJ01CD8888", assignedAt: daysFromNow(-45), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "B-003", zone: "Basement B", type: "4W", status: "available" },
    { society: society._id, slotNumber: "B-004", zone: "Basement B", type: "4W", status: "available" },
    { society: society._id, slotNumber: "B-005", zone: "Basement B", type: "4W", status: "blocked", note: "Reserved for plumbing work until end of month" },
  ]);
  log.ok("5 × 4W slots  (B-001…B-005)  [2 assigned, 2 available, 1 blocked]");

  // 2-Wheeler slots
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "TW-01", zone: "Open Parking", type: "2W", status: "assigned", assignedTo: resident3._id, assignedFlat: resident3.flat, vehicleNumber: "GJ01EF7777", assignedAt: daysFromNow(-60), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "TW-02", zone: "Open Parking", type: "2W", status: "available" },
    { society: society._id, slotNumber: "TW-03", zone: "Open Parking", type: "2W", status: "available" },
  ]);
  log.ok("3 × 2W slots  (TW-01…TW-03)  [1 assigned, 2 available]");

  // EV slot
  const [evSlot] = await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "EV-01", zone: "Basement A", type: "EV", status: "available", note: "Charging point installed — 7 kW AC charger" },
  ]);
  log.ok("1 × EV slot   (EV-01)  [available]");

  // Visitor slots
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "VIS-01", zone: "Gate Entry", type: "Visitor", status: "available" },
    { society: society._id, slotNumber: "VIS-02", zone: "Gate Entry", type: "Visitor", status: "available" },
  ]);
  log.ok("2 × Visitor slots  (VIS-01, VIS-02)  [near gate]");

  // Reserved slot
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "RES-01", zone: "Basement A", type: "Reserved", status: "assigned", assignedTo: adminUser._id, assignedFlat: adminUser.flat, vehicleNumber: "GJ01AA0001", assignedAt: daysFromNow(-90), assignedBy: adminUser._id, note: "Chairman reserved slot" },
  ]);
  log.ok("1 × Reserved slot (RES-01)  [assigned to admin / Chairman slot]");

  // Parking Requests
  await ParkingRequest.create({ society: society._id, requestedBy: resident3._id, flat: resident3.flat, slotType: "4W", vehicleNumber: "GJ01KK5555", vehicleDescription: "White Maruti Swift Dzire", note: "Just bought a new car and need a covered 4W slot", status: "pending" });
  log.ok("ParkingRequest #1 — Kiran → 4W slot  [pending]");

  await ParkingRequest.create({ society: society._id, requestedBy: resident1._id, flat: resident1.flat, slotType: "EV", vehicleNumber: "GJ01ZZ0001", vehicleDescription: "Blue Tata Nexon EV", note: "EV owner, need charging slot", status: "approved", assignedSlot: evSlot._id, resolvedBy: adminUser._id, resolvedAt: daysFromNow(-2), adminNote: "EV-01 assigned. Charging access enabled." });
  await ParkingSlot.findByIdAndUpdate(evSlot._id, { status: "assigned", assignedTo: resident1._id, assignedFlat: resident1.flat, vehicleNumber: "GJ01ZZ0001", assignedAt: daysFromNow(-2), assignedBy: adminUser._id });
  log.ok("ParkingRequest #2 — Rahul → EV slot  [approved / EV-01 assigned]");

  await ParkingRequest.create({ society: society._id, requestedBy: resident4._id, flat: resident4.flat, slotType: "4W", vehicleNumber: "GJ01NN3456", vehicleDescription: "Silver Honda City", note: "Need a second 4W slot for my second car", status: "rejected", resolvedBy: adminUser._id, resolvedAt: daysFromNow(-4), adminNote: "Only one 4W slot per flat. Existing slot B-002 is already assigned." });
  log.ok("ParkingRequest #3 — Deepak → 4W slot  [rejected — one slot per flat]");

  await ParkingRequest.create({ society: society._id, requestedBy: resident2._id, flat: resident2.flat, slotType: "2W", vehicleNumber: "GJ01PP8888", vehicleDescription: "Black Honda Activa", note: "Need a 2W slot for second scooter", status: "cancelled" });
  log.ok("ParkingRequest #4 — Priya → 2W slot  [cancelled by resident]");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║                ✅  SEED v3 COMPLETE                          ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🏠 SOCIETY${c.reset}`);
  console.log(`   Name      : Sunrise Residency  (Ahmedabad, Gujarat)`);
  console.log(`   Join Code : ${c.bold}${c.yellow}${society.joinCode}${c.reset}  — share with new residents\n`);

  const L = "─────────────────────────────────────────────────────────────────────────────";
  console.log(`${c.bold}👤 LOGIN CREDENTIALS${c.reset}`);
  console.log(L);
  console.log(" Role         │ Email                            │ Password        │ Flat / Wing");
  console.log(L);
  console.log(` ${c.yellow}admin${c.reset}        │ admin@sunriseresidency.com       │ Admin@1234      │ A-101 / Wing A`);
  console.log(` ${c.cyan}resident${c.reset}     │ rahul.mehta@resident.com         │ Resident@1234   │ B-202 / Wing B`);
  console.log(` ${c.cyan}resident${c.reset}     │ priya.patel@resident.com         │ Resident@5678   │ C-303 / Wing C`);
  console.log(` ${c.cyan}resident${c.reset}     │ kiran.joshi@resident.com         │ Resident@9012   │ D-404 / Wing D`);
  console.log(` ${c.cyan}resident${c.reset}     │ deepak.nair@resident.com         │ Resident@3456   │ F-601 / Wing F`);
  console.log(` ${c.cyan}resident${c.reset} ⏳  │ amit.desai@resident.com          │ Resident@0001   │ E-505 / Wing E  ← pending approval`);
  console.log(` ${c.magenta}vendor${c.reset}       │ security@quickfix.com            │ Vendor@1234     │ —`);
  console.log(L + "\n");

  console.log(`${c.bold}🔑 VISITOR OTPs${c.reset}`);
  console.log(`   Visitor #1 (Ankit Shah)  OTP: ${c.bold}${c.yellow}${rawOTP}${c.reset}  [24-h validity]`);
  console.log(`   Visitor #2 (Raj Kumar)   OTP: ${c.bold}${c.yellow}${nearExpiryOTP}${c.reset}  [~3-h validity — shows countdown]\n`);

  const rows = [
    ["P1", "Issues",         "5",  "Open×3 / In-Progress / Resolved / Anonymous / Vendor-assigned"],
    ["P1", "Notices",        "4",  "1 pinned / Event / Urgent / Finance"],
    ["P1", "Polls",          "3",  "Active (6 votes) / Closed / Fresh (resident4 can vote)"],
    ["P1", "Help Posts",     "3",  "2 open (upvoted replies) / 1 closed"],
    ["P1", "Contacts",       "8",  "Emergency (3) / Committee (2) / Vendor (2) / Other (1)"],
    ["P2", "Visitors",       "7",  "invited×2 / pending / approved / rejected / exited / expired"],
    ["P2", "Maint. Bills",   "3",  "May published (paid/overdue/unpaid/waived) · June draft · Wing B&C levy"],
    ["P2", "Amenities",      "2",  "Clubhouse (approval) + Gym (auto-confirm, 5 concurrent)"],
    ["P2", "Bookings",       "5",  "confirmed / pending / cancelled / rejected / completed"],
    ["P2", "Events",         "3",  "Diwali published (RSVPs) · Meeting draft · Kids Sports Day cancelled"],
    ["P2", "Parking Slots", "12",  "5×4W + 3×2W + 1×EV + 2×Visitor + 1×Reserved"],
    ["P2", "Parking Reqs",   "4",  "pending / approved / rejected / cancelled"],
  ];

  console.log(`${c.bold}📦 DATA SEEDED${c.reset}`);
  rows.forEach(([phase, label, count, detail]) => {
    const tag = phase === "P2" ? `${c.blue}[P2]${c.reset}` : `${c.cyan}[P1]${c.reset}`;
    console.log(`   ${tag} ${label.padEnd(16)} ${c.bold}${String(count).padStart(2)}${c.reset}  ${c.gray}${detail}${c.reset}`);
  });

  console.log("");
  await mongoose.disconnect();
  log.ok("MongoDB disconnected. Happy testing! 🚀\n");
}

seed().catch((err) => {
  console.error(`\n${c.red}✖ Seed failed: ${err.message}${c.reset}`);
  if (err.stack) console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});