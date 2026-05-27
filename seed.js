/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        SOCIETY APP — DATABASE SEED  (Phase 1 + Phase 2)         ║
 * ║                                                                  ║
 * ║  Run:  node seed.js                                              ║
 * ║  Uses the real app models — every field, every Phase 2 feature. ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Seeds:
 *  Phase 1 ─────────────────────────────────────────────────────────
 *   • 1  Society          "Sunrise Residency"
 *   • 5  Users            admin / 3 residents (block+wing+family) / 1 vendor-security
 *   • 5  Issues           varied status, vendor-assigned, photo URLs
 *   • 4  Notices          one pinned, varied tags
 *   • 3  Polls            open / closed / fresh
 *   • 3  Help posts       with upvoted replies & vendor contacts
 *   • 8  Contacts         Emergency / Committee / Vendor / Other
 *
 *  Phase 2 ─────────────────────────────────────────────────────────
 *   • 3  Visitors         invited (OTP) / walk-in approved / exited
 *   • 2  Maintenance bills published (one with payments recorded)
 *   • 2  Amenities        Clubhouse (approval required) + Gym (auto-confirm)
 *   • 3  Bookings         confirmed / pending / cancelled
 *   • 2  Events           published (with RSVPs) / upcoming draft
 *   • 8  Parking slots    mix of 2W / 4W / EV  (some assigned)
 *   • 2  Parking requests pending / approved
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");

// ─── Connection ───────────────────────────────────────────────────────────────
const MONGO_URI   = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";
const SALT_ROUNDS = 10;

// ─── Import real app models ───────────────────────────────────────────────────
// NOTE: models register themselves with mongoose on require — order matters
// when there are cross-refs, so we require Society before User.
const Society          = require("./src/models/society.model");
const User             = require("./src/models/user.model");
const Issue            = require("./src/models/issue.model");
const Notice           = require("./src/models/notice.model");
const Poll             = require("./src/models/poll.model");
const Help             = require("./src/models/help.model");
const Contact          = require("./src/models/contact.model");
const Visitor          = require("./src/models/visitor.model");
const MaintenanceBill  = require("./src/models/maintenance.model");
const { Amenity, AmenityBooking } = require("./src/models/amenity.model");
const { Event }                   = require("./src/models/event.model");
const { ParkingSlot, ParkingRequest } = require("./src/models/parking.model");

// ─── Colour helpers ───────────────────────────────────────────────────────────
const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  magenta: "\x1b[35m",
  red:     "\x1b[31m",
  blue:    "\x1b[34m",
};

const log = {
  section: (t) => console.log(`\n${c.bold}${c.magenta}▶  ${t}${c.reset}`),
  ok:      (t) => console.log(`${c.green}   ✔  ${t}${c.reset}`),
  info:    (t) => console.log(`${c.cyan}   ℹ  ${t}${c.reset}`),
  warn:    (t) => console.log(`${c.yellow}   ⚠  ${t}${c.reset}`),
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const hash   = (plain)  => bcrypt.hash(plain, SALT_ROUNDS);
const joinCode = ()     => crypto.randomBytes(4).toString("hex").toUpperCase();

/** Return a Date that is `days` days from now (negative = past). */
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);

/** Return a Date for today at a given hour:minute (IST-aware is fine for seed). */
const todayAt = (h, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║   Society App — Full Database Seeder             ║${c.reset}`);
  console.log(`${c.bold}║   Phase 1 + Phase 2  (real app models)           ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════════════╝${c.reset}\n`);

  // ── Connect ─────────────────────────────────────────────────────────────────
  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe ────────────────────────────────────────────────────────────────────
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
  log.ok("All collections cleared");

  // ══════════════════════════════════════════════════════════════════════════
  //  USERS  (passwords are hashed manually — bypasses mongoose pre-save hook
  //          so we don't double-hash, matching the existing seed pattern)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Users");

  // Admin — no society yet (chicken-and-egg; linked after society is created)
  const adminUser = await User.create({
    name:        "Admin Sharma",
    email:       "admin@sunriseresidency.com",
    phone:       "+919876543210",
    password:    await hash("Admin@1234"),
    role:        "admin",
    flat:        "A-101",
    block:       "A",
    avatar:      null,
    familyMembers: [
      { name: "Meena Sharma",  relation: "Spouse",   phone: "+919876543211" },
      { name: "Rohan Sharma",  relation: "Son",       phone: null           },
    ],
    isApproved:  true,
    isActive:    true,
  });
  log.ok(`admin     → ${adminUser.email}  [A-101 / Block A]`);

  // Society (needs admin._id)
  log.section("Creating Society");
  const code = joinCode();
  const society = await Society.create({
    name:       "Sunrise Residency",
    address:    "Plot No. 42, Satellite Road",
    city:       "Ahmedabad",
    state:      "Gujarat",
    admin:      adminUser._id,
    joinCode:   code,
    joinMode:   "approval",
    totalUnits: 120,
    isActive:   true,
  });
  log.ok(`Society "Sunrise Residency"  joinCode: ${c.bold}${c.yellow}${code}${c.reset}`);

  // Link admin → society
  await User.findByIdAndUpdate(adminUser._id, { society: society._id });

  // ── Residents ────────────────────────────────────────────────────────────────
  const resident1 = await User.create({
    name:    "Rahul Mehta",
    email:   "rahul.mehta@resident.com",
    phone:   "+919812345678",
    password: await hash("Resident@1234"),
    role:    "resident",
    flat:    "B-202",
    block:   "B",
    society: society._id,
    avatar:  null,
    familyMembers: [
      { name: "Sneha Mehta",  relation: "Spouse", phone: "+919812345679" },
      { name: "Aryan Mehta",  relation: "Son",    phone: null            },
    ],
    isApproved: true,
    isActive:   true,
  });
  log.ok(`resident  → ${resident1.email}  [B-202 / Block B]`);

  const resident2 = await User.create({
    name:    "Priya Patel",
    email:   "priya.patel@resident.com",
    phone:   "+919823456789",
    password: await hash("Resident@5678"),
    role:    "resident",
    flat:    "C-303",
    block:   "C",
    society: society._id,
    avatar:  null,
    familyMembers: [
      { name: "Vivek Patel",  relation: "Spouse",  phone: "+919823456790" },
      { name: "Diya Patel",   relation: "Daughter", phone: null            },
    ],
    isApproved: true,
    isActive:   true,
  });
  log.ok(`resident  → ${resident2.email}  [C-303 / Block C]`);

  const resident3 = await User.create({
    name:    "Kiran Joshi",
    email:   "kiran.joshi@resident.com",
    phone:   "+919834567890",
    password: await hash("Resident@9012"),
    role:    "resident",
    flat:    "D-404",
    block:   "D",
    society: society._id,
    avatar:  null,
    familyMembers: [],
    isApproved: true,
    isActive:   true,
  });
  log.ok(`resident  → ${resident3.email}  [D-404 / Block D]`);

  // ── Pending resident (to demo the approval panel) ──────────────────────────
  const pendingResident = await User.create({
    name:       "Amit Desai",
    email:      "amit.desai@resident.com",
    phone:      "+919856789012",
    password:   await hash("Resident@0001"),
    role:       "resident",
    flat:       "E-505",
    block:      "E",
    society:    society._id,
    avatar:     null,
    familyMembers: [],
    isApproved: false,   // ← pending approval
    isActive:   true,
  });
  log.ok(`resident  → ${pendingResident.email}  [E-505 / Block E]  ⏳ PENDING APPROVAL`);

  // ── Vendor / Security user ─────────────────────────────────────────────────
  const vendorUser = await User.create({
    name:     "QuickFix Security",
    email:    "security@quickfix.com",
    phone:    "+919845678901",
    password: await hash("Vendor@1234"),
    role:     "vendor",
    flat:     null,
    block:    null,
    society:  society._id,
    avatar:   null,
    familyMembers: [],
    isApproved: true,
    isActive:   true,
  });
  log.ok(`vendor    → ${vendorUser.email}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Issues");

  await Issue.create({
    title:       "Water leakage in basement parking",
    description: "Continuous water leak near Gate B of basement parking. Flooding during rains.",
    category:    "Water",
    priority:    "High",
    status:      "Open",
    photos:      [],
    society:     society._id,
    reporter:    resident1._id,
    flat:        resident1.flat,
    isAnonymous: false,
    comments:    [],
  });
  log.ok("Issue #1 — Water leakage  [Open / High]");

  await Issue.create({
    title:       "Lift frequently breaking down in Tower B",
    description: "Lift in Tower B out of order 3 times in 2 weeks. Elderly residents affected.",
    category:    "Lift",
    priority:    "High",
    status:      "In Progress",
    photos:      [
      "https://res.cloudinary.com/demo/image/upload/v1/society-app/issues/lift-broken.jpg",
    ],
    society:     society._id,
    reporter:    resident2._id,
    flat:        resident2.flat,
    isAnonymous: false,
    assignedTo:  adminUser._id,
    // Vendor assigned for this issue
    assignedVendor: {
      name:  "SpeedLift Services",
      phone: "+919977665544",
      note:  "Technician visit scheduled for Friday 10 AM",
    },
    comments: [
      {
        author:       adminUser._id,
        body:         "Contacted SpeedLift Services. Technician visiting Friday.",
        isAdminReply: true,
      },
    ],
  });
  log.ok("Issue #2 — Lift breakdown  [In Progress / High / vendor assigned]");

  await Issue.create({
    title:       "Garbage not collected for 3 days",
    description: "Garbage collection van absent for 3 days. Bins overflowing.",
    category:    "Garbage",
    priority:    "Medium",
    status:      "Resolved",
    photos:      [],
    society:     society._id,
    reporter:    resident3._id,
    flat:        resident3.flat,
    isAnonymous: false,
    resolvedAt:  daysFromNow(-2),
    comments: [
      {
        author:       adminUser._id,
        body:         "Contacted municipal corporation. Resuming collection tomorrow.",
        isAdminReply: true,
      },
      {
        author:       resident3._id,
        body:         "Confirmed — garbage collected this morning. Thanks!",
        isAdminReply: false,
      },
    ],
  });
  log.ok("Issue #3 — Garbage [Resolved]");

  await Issue.create({
    title:       "Stray dogs near children's play area",
    description: "Multiple stray dogs near play area. Children unsafe.",
    category:    "Security",
    priority:    "Medium",
    status:      "Open",
    photos:      [],
    society:     society._id,
    reporter:    resident1._id,
    flat:        resident1.flat,
    isAnonymous: true,
    comments:    [],
  });
  log.ok("Issue #4 — Stray dogs  [Open / Anonymous]");

  await Issue.create({
    title:       "Street lights not working in Block C",
    description: "All street lights in Block C corridor off for a week.",
    category:    "Electricity",
    priority:    "Low",
    status:      "Open",
    photos:      [],
    society:     society._id,
    reporter:    resident2._id,
    flat:        resident2.flat,
    isAnonymous: false,
    comments:    [],
  });
  log.ok("Issue #5 — Street lights  [Open / Low]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — NOTICES  (one pinned)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Notices");

  await Notice.create({
    title:       "📌 Society Rules & Regulations — Must Read",
    body:        "Dear Residents,\n\nAll residents must adhere to the following rules:\n\n1. No loud music after 10 PM.\n2. Pets must be on leash in common areas.\n3. Parking in designated slots only.\n4. Waste segregation is mandatory.\n5. Guests staying overnight must be registered at security.\n\nNon-compliance may result in a ₹500 fine per incident.\n\nManagement Committee",
    tag:         "Notice",
    society:     society._id,
    postedBy:    adminUser._id,
    isPinned:    true,   // ← always at the top
    isPublished: true,
  });
  log.ok("Notice #1 — Rules & Regulations  [PINNED]");

  await Notice.create({
    title:       "🎉 Annual General Meeting — June 15, 2025",
    body:        "Dear Residents,\n\nAGM will be held on Sunday, June 15, 2025 at 11:00 AM in the Community Hall.\n\nAgenda:\n1. Review of 2024-25 accounts\n2. Election of committee members\n3. Approval of 2025-26 budget\n\nAll residents are requested to attend.",
    tag:         "Event",
    society:     society._id,
    postedBy:    adminUser._id,
    isPinned:    false,
    isPublished: true,
  });
  log.ok("Notice #2 — AGM  [Event]");

  await Notice.create({
    title:       "⚠️ Water Supply Interruption — June 8",
    body:        "Dear Residents,\n\nWater supply will be interrupted on June 8, 2025 (Sunday) from 9:00 AM to 2:00 PM due to overhead tank maintenance.\n\nPlease store adequate water in advance.",
    tag:         "Urgent",
    society:     society._id,
    postedBy:    adminUser._id,
    isPinned:    false,
    isPublished: true,
  });
  log.ok("Notice #3 — Water Interruption  [Urgent]");

  await Notice.create({
    title:       "💰 Q2 2025 Maintenance Charges Due",
    body:        "Maintenance charges of ₹3,500 per flat are due by June 30, 2025.\n\nPay via bank transfer, cheque, or the society portal.\n\nLate payment: ₹100 penalty per month.",
    tag:         "Finance",
    society:     society._id,
    postedBy:    adminUser._id,
    isPinned:    false,
    isPublished: true,
  });
  log.ok("Notice #4 — Maintenance Due  [Finance]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — POLLS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Polls");

  await Poll.create({
    question:  "Which day for the monthly society cleanup drive?",
    options: [
      { label: "First Saturday",  votes: 3, voters: [resident1._id, resident2._id, resident3._id] },
      { label: "First Sunday",    votes: 2, voters: [adminUser._id, vendorUser._id]                },
      { label: "Last Saturday",   votes: 1, voters: [resident1._id]                               },
    ],
    society:     society._id,
    createdBy:   adminUser._id,
    closesAt:    daysFromNow(7),
    isClosed:    false,
    isAnonymous: true,
    totalVotes:  6,
  });
  log.ok("Poll #1 — Cleanup drive day  [open, 6 votes]");

  await Poll.create({
    question:  "Should we install CCTV cameras in the parking area?",
    options: [
      { label: "Yes — strongly agree",                       votes: 4, voters: [resident1._id, resident2._id, resident3._id, adminUser._id] },
      { label: "Yes — only if cost is shared equally",       votes: 2, voters: [resident2._id, vendorUser._id]                             },
      { label: "No — not necessary",                         votes: 0, voters: []                                                          },
    ],
    society:     society._id,
    createdBy:   adminUser._id,
    closesAt:    daysFromNow(-3),
    isClosed:    true,
    isAnonymous: false,
    totalVotes:  6,
  });
  log.ok("Poll #2 — CCTV parking  [closed]");

  await Poll.create({
    question:  "What should the gym operating hours be?",
    options: [
      { label: "5 AM – 10 PM", votes: 0, voters: [] },
      { label: "6 AM – 10 PM", votes: 0, voters: [] },
      { label: "6 AM – 11 PM", votes: 0, voters: [] },
      { label: "24 hours",     votes: 0, voters: [] },
    ],
    society:     society._id,
    createdBy:   adminUser._id,
    closesAt:    daysFromNow(14),
    isClosed:    false,
    isAnonymous: true,
    totalVotes:  0,
  });
  log.ok("Poll #3 — Gym hours  [fresh, 0 votes]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — HELP POSTS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Community Help Posts");

  await Help.create({
    title:       "Looking for a reliable plumber for bathroom renovation",
    description: "Need a plumber for complete bathroom renovation incl. tiles + shower. Budget ₹15k–₹20k.",
    category:    "Plumber",
    society:     society._id,
    author:      resident1._id,
    flat:        resident1.flat,
    isClosed:    false,
    replies: [
      {
        author:          adminUser._id,
        body:            "Recommend Ramesh Plumbing Services — did our office last year. Very professional.",
        isVendorContact: true,
        vendorPhone:     "+919988776655",
        upvotes:         [resident2._id, resident3._id],
      },
      {
        author:          resident2._id,
        body:            "Second that. Ramesh did my bathroom in B-202. Reasonable + clean work.",
        isVendorContact: false,
        vendorPhone:     null,
        upvotes:         [resident1._id],
      },
    ],
  });
  log.ok("Help #1 — Plumber request  [2 replies, upvoted]");

  await Help.create({
    title:       "Anyone know a good maid for part-time cleaning?",
    description: "Need a maid for daily cleaning of 2BHK. Morning hours (7–9 AM). Salary negotiable.",
    category:    "Maid",
    society:     society._id,
    author:      resident3._id,
    flat:        resident3.flat,
    isClosed:    false,
    replies: [
      {
        author:          resident2._id,
        body:            "Sunita ben works in our flat and is free mornings. Can share her number.",
        isVendorContact: false,
        vendorPhone:     null,
        upvotes:         [resident3._id],
      },
    ],
  });
  log.ok("Help #2 — Maid request  [1 reply]");

  await Help.create({
    title:       "Best food delivery inside our society?",
    description: "Which apps/restaurants reliably deliver to Sunrise Residency? Quick weekday lunch options.",
    category:    "Food",
    society:     society._id,
    author:      resident2._id,
    flat:        resident2.flat,
    isClosed:    true,   // ← resolved / closed
    replies: [
      {
        author:          resident1._id,
        body:            "Swiggy + Zomato both deliver well. Aarohi Tiffin is great for homemade food.",
        isVendorContact: false,
        vendorPhone:     null,
        upvotes:         [resident2._id, resident3._id, adminUser._id],
      },
    ],
  });
  log.ok("Help #3 — Food delivery  [closed, 3 upvotes on reply]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — CONTACTS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Contacts");

  await Contact.insertMany([
    { name: "Fire Station — Satellite", phone: "101",            group: "Emergency", designation: "Emergency Response", icon: "🔥", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Police Control Room",      phone: "100",            group: "Emergency", designation: "Police Emergency",  icon: "🚔", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    { name: "Ambulance / EMRI",         phone: "108",            group: "Emergency", designation: "Medical Emergency", icon: "🚑", society: society._id, addedBy: adminUser._id, sortOrder: 3 },
    { name: "Admin Sharma",             phone: "+919876543210",  group: "Committee", designation: "Society Chairman",  icon: "👤", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Suresh Trivedi",           phone: "+919887654321",  group: "Committee", designation: "Secretary",         icon: "📋", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    { name: "QuickFix Electrical",      phone: "+919845678901",  group: "Vendor",    designation: "Electrical Repairs",icon: "⚡", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
    { name: "Ramesh Plumbing Services", phone: "+919988776655",  group: "Vendor",    designation: "Plumber",           icon: "🔧", society: society._id, addedBy: adminUser._id, sortOrder: 2 },
    { name: "Sunrise Residency Office", phone: "+917966554433",  group: "Other",     designation: "Society Office",    icon: "🏢", society: society._id, addedBy: adminUser._id, sortOrder: 1 },
  ]);
  log.ok("8 contacts — Emergency / Committee / Vendor / Other");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — VISITORS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Visitors  (Phase 2)");

  // 1. Pre-approved invite — still "invited" (OTP not yet used)
  const visitorInvite = new Visitor({
    name:       "Ankit Shah",
    phone:      "+919900112233",
    purpose:    "Guest",
    note:       "Old college friend visiting for the weekend",
    society:    society._id,
    host:       resident1._id,
    hostFlat:   resident1.flat,
    status:     "invited",
    isWalkIn:   false,
    expectedAt: daysFromNow(1),
  });
  const rawOTP = visitorInvite.generateOTP(1440); // 24-h OTP
  await visitorInvite.save();
  log.ok(`Visitor #1 — Ankit Shah  [invited / OTP: ${c.bold}${c.yellow}${rawOTP}${c.reset}]`);

  // 2. Walk-in — approved and already inside
  await Visitor.create({
    name:       "Delivery Boy — Amazon",
    phone:      "+919911223344",
    purpose:    "Delivery",
    vehicleNumber: "GJ01AB1234",
    society:    society._id,
    host:       resident2._id,
    hostFlat:   resident2.flat,
    status:     "approved",
    isWalkIn:   true,
    loggedBy:   vendorUser._id,
    approvedBy: resident2._id,
    entryTime:  new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
    approvedAt: new Date(Date.now() - 30 * 60 * 1000),
  });
  log.ok("Visitor #2 — Amazon Delivery  [walk-in / approved / inside]");

  // 3. Already exited
  await Visitor.create({
    name:       "Sunita Ben",
    phone:      "+919922334455",
    purpose:    "Service",
    note:       "Regular maid for flat C-303",
    society:    society._id,
    host:       resident3._id,
    hostFlat:   resident3.flat,
    status:     "exited",
    isWalkIn:   false,
    entryTime:  new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 h ago
    exitTime:   new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 h ago
    approvedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    approvedBy: vendorUser._id,
  });
  log.ok("Visitor #3 — Sunita Ben  [exited]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — MAINTENANCE BILLS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Maintenance Bills  (Phase 2)");

  // Bill 1 — May 2025 — published, with mixed payment records
  const mayBill = await MaintenanceBill.create({
    society:        society._id,
    createdBy:      adminUser._id,
    title:          "May 2025 — Monthly Maintenance",
    description:    "Regular monthly maintenance charges covering common area upkeep, security, and housekeeping.",
    billMonth:      "2025-05",
    baseAmount:     3500,
    dueDate:        daysFromNow(-5),    // already overdue
    penaltyEnabled: true,
    penaltyAmount:  100,
    targetMode:     "all",
    isPublished:    true,
    isClosed:       false,
    payments: [
      {
        resident:      resident1._id,
        flat:          resident1.flat,
        wing:          resident1.block,
        amount:        3500,
        penalty:       0,
        discount:      0,
        totalDue:      3500,
        status:        "paid",
        paidAmount:    3500,
        paidAt:        daysFromNow(-8),
        paymentMethod: "upi",
        transactionId: "UPI20250501RAHUL001",
        receiptNote:   "Paid via Google Pay",
        remindersSent: 0,
      },
      {
        resident:      resident2._id,
        flat:          resident2.flat,
        wing:          resident2.block,
        amount:        3500,
        penalty:       100,
        discount:      0,
        totalDue:      3600,
        status:        "overdue",
        paidAmount:    0,
        remindersSent: 2,
        lastReminderAt: daysFromNow(-1),
      },
      {
        resident:      resident3._id,
        flat:          resident3.flat,
        wing:          resident3.block,
        amount:        3500,
        penalty:       0,
        discount:      500,
        totalDue:      3000,
        status:        "unpaid",
        paidAmount:    0,
        remindersSent: 1,
        lastReminderAt: daysFromNow(-2),
      },
    ],
  });
  log.ok(`Bill #1 — May 2025  [published / overdue / 1 paid, 1 overdue, 1 unpaid]`);

  // Bill 2 — June 2025 — draft (not yet published)
  await MaintenanceBill.create({
    society:        society._id,
    createdBy:      adminUser._id,
    title:          "June 2025 — Monthly Maintenance",
    description:    "Monthly maintenance for June 2025.",
    billMonth:      "2025-06",
    baseAmount:     3500,
    dueDate:        daysFromNow(25),
    penaltyEnabled: true,
    penaltyAmount:  100,
    targetMode:     "all",
    isPublished:    false,   // ← draft
    isClosed:       false,
    payments:       [],
  });
  log.ok("Bill #2 — June 2025  [draft — not yet published]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — AMENITIES + BOOKINGS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Amenities & Bookings  (Phase 2)");

  const clubhouse = await Amenity.create({
    society:               society._id,
    createdBy:             adminUser._id,
    name:                  "Community Clubhouse",
    category:              "Clubhouse",
    description:           "Fully furnished clubhouse for private gatherings, parties, and society functions. Capacity: 80 persons.",
    maxConcurrentBookings: 1,
    slotDurationOptions:   [120, 240, 480],   // 2 h / 4 h / 8 h
    maxSlotDuration:       480,
    advanceBookingDays:    14,
    openTime:              "08:00",
    closeTime:             "22:00",
    closedDays:            [],                // open all week
    requiresApproval:      true,              // admin must confirm each booking
    depositAmount:         2000,
    rules:                 "No loud DJ music after 9 PM.\nOwner responsible for cleaning after event.\nAlcohol is not permitted in common areas.",
    isActive:              true,
  });
  log.ok("Amenity #1 — Community Clubhouse  [requires admin approval]");

  const gym = await Amenity.create({
    society:               society._id,
    createdBy:             adminUser._id,
    name:                  "Society Gym",
    category:              "Gym",
    description:           "Well-equipped gym with treadmills, weights, and yoga space. Open to all approved residents.",
    maxConcurrentBookings: 5,               // up to 5 residents at the same time
    slotDurationOptions:   [60],
    maxSlotDuration:       90,
    advanceBookingDays:    3,
    openTime:              "05:30",
    closeTime:             "22:00",
    closedDays:            [],
    requiresApproval:      false,           // auto-confirmed
    depositAmount:         0,
    rules:                 "Wear proper workout attire.\nClean equipment after use.\nNo food inside the gym.",
    isActive:              true,
  });
  log.ok("Amenity #2 — Society Gym  [auto-confirm, 5 concurrent]");

  // ── Bookings ──────────────────────────────────────────────────────────────
  // Tomorrow's gym slot — confirmed
  const gymStart1 = new Date(daysFromNow(1)); gymStart1.setHours(7, 0, 0, 0);
  const gymEnd1   = new Date(daysFromNow(1)); gymEnd1.setHours(8, 0, 0, 0);
  await AmenityBooking.create({
    amenity:         gym._id,
    society:         society._id,
    bookedBy:        resident1._id,
    startTime:       gymStart1,
    endTime:         gymEnd1,
    durationMinutes: 60,
    purpose:         "Morning workout",
    guestCount:      1,
    status:          "confirmed",
  });
  log.ok("Booking #1 — Gym tomorrow 7–8 AM  [confirmed / Rahul]");

  // Clubhouse next weekend — pending admin approval
  const cbStart = new Date(daysFromNow(5)); cbStart.setHours(14, 0, 0, 0);
  const cbEnd   = new Date(daysFromNow(5)); cbEnd.setHours(18, 0, 0, 0);
  await AmenityBooking.create({
    amenity:         clubhouse._id,
    society:         society._id,
    bookedBy:        resident2._id,
    startTime:       cbStart,
    endTime:         cbEnd,
    durationMinutes: 240,
    purpose:         "Birthday party for daughter",
    guestCount:      30,
    status:          "pending",
  });
  log.ok("Booking #2 — Clubhouse in 5 days 2–6 PM  [pending approval / Priya]");

  // Past gym slot — cancelled
  const gymStart2 = new Date(daysFromNow(-3)); gymStart2.setHours(6, 0, 0, 0);
  const gymEnd2   = new Date(daysFromNow(-3)); gymEnd2.setHours(7, 0, 0, 0);
  await AmenityBooking.create({
    amenity:         gym._id,
    society:         society._id,
    bookedBy:        resident3._id,
    startTime:       gymStart2,
    endTime:         gymEnd2,
    durationMinutes: 60,
    purpose:         "Morning yoga",
    guestCount:      1,
    status:          "cancelled",
    cancelledBy:     resident3._id,
    cancelReason:    "Travel plans changed",
  });
  log.ok("Booking #3 — Gym 3 days ago  [cancelled / Kiran]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — EVENTS + RSVPs
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Events  (Phase 2)");

  // Event 1 — published, with mixed RSVPs
  const event1Start = daysFromNow(10);  event1Start.setHours(18, 30, 0, 0);
  const event1End   = daysFromNow(10);  event1End.setHours(21, 30, 0, 0);

  await Event.create({
    society:     society._id,
    createdBy:   adminUser._id,
    title:       "Diwali Celebration 2025 🪔",
    description: "Annual Diwali celebration in the community hall. Enjoy rangoli competition, puja, sweets distribution, and sparklers in the open ground.\n\nDress code: Traditional attire.",
    category:    "Festival",
    startTime:   event1Start,
    endTime:     event1End,
    venue:       "Community Hall + Open Ground",
    rsvpEnabled: true,
    rsvpDeadline: daysFromNow(8),
    capacity:    150,
    isPublished: true,
    isCancelled: false,
    reminderSent: false,
    rsvps: [
      { resident: resident1._id, status: "going",     guestCount: 2, note: "Bringing family",        respondedAt: daysFromNow(-1) },
      { resident: resident2._id, status: "going",     guestCount: 1, note: "Coming with spouse",     respondedAt: daysFromNow(-2) },
      { resident: resident3._id, status: "maybe",     guestCount: 0, note: "Will confirm by Friday", respondedAt: daysFromNow(-1) },
      { resident: adminUser._id, status: "going",     guestCount: 0, note: null,                     respondedAt: daysFromNow(-3) },
    ],
  });
  log.ok("Event #1 — Diwali Celebration  [published / 3 going, 1 maybe]");

  // Event 2 — upcoming, draft (admin hasn't published yet)
  const event2Start = daysFromNow(20); event2Start.setHours(10, 0, 0, 0);
  const event2End   = daysFromNow(20); event2End.setHours(12, 0, 0, 0);

  await Event.create({
    society:     society._id,
    createdBy:   adminUser._id,
    title:       "Monthly Committee Meeting — June 2025",
    description: "Monthly meeting to discuss society matters, pending issues, and upcoming maintenance schedule.",
    category:    "Meeting",
    startTime:   event2Start,
    endTime:     event2End,
    venue:       "Committee Room, Ground Floor",
    rsvpEnabled: false,
    capacity:    null,
    isPublished: false,   // ← draft
    isCancelled: false,
    reminderSent: false,
    rsvps:       [],
  });
  log.ok("Event #2 — June Committee Meeting  [draft / RSVP disabled]");

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — PARKING SLOTS + REQUESTS
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding Parking  (Phase 2)");

  // 4-Wheeler slots — Block B basement
  const slots4W = await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "B-001", zone: "Basement B", type: "4W", status: "assigned", assignedTo: resident1._id, assignedFlat: resident1.flat, vehicleNumber: "GJ01AB9999", assignedAt: daysFromNow(-30), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "B-002", zone: "Basement B", type: "4W", status: "assigned", assignedTo: resident2._id, assignedFlat: resident2.flat, vehicleNumber: "GJ01CD8888", assignedAt: daysFromNow(-45), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "B-003", zone: "Basement B", type: "4W", status: "available" },
    { society: society._id, slotNumber: "B-004", zone: "Basement B", type: "4W", status: "available" },
    { society: society._id, slotNumber: "B-005", zone: "Basement B", type: "4W", status: "blocked", note: "Reserved for plumbing work until end of month" },
  ]);
  log.ok("5 × 4W slots  (B-001…B-005)  [2 assigned, 2 available, 1 blocked]");

  // 2-Wheeler slots — Open parking
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "TW-01", zone: "Open Parking", type: "2W", status: "assigned", assignedTo: resident3._id, assignedFlat: resident3.flat, vehicleNumber: "GJ01EF7777", assignedAt: daysFromNow(-60), assignedBy: adminUser._id },
    { society: society._id, slotNumber: "TW-02", zone: "Open Parking", type: "2W", status: "available" },
    { society: society._id, slotNumber: "TW-03", zone: "Open Parking", type: "2W", status: "available" },
  ]);
  log.ok("3 × 2W slots  (TW-01…TW-03)  [1 assigned, 2 available]");

  // EV slot
  await ParkingSlot.insertMany([
    { society: society._id, slotNumber: "EV-01", zone: "Basement A", type: "EV", status: "available", note: "Charging point installed" },
  ]);
  log.ok("1 × EV slot   (EV-01)  [available]");

  // ── Parking Requests ──────────────────────────────────────────────────────
  // Request 1 — pending (resident3 wants an additional 4W slot)
  await ParkingRequest.create({
    society:            society._id,
    requestedBy:        resident3._id,
    flat:               resident3.flat,
    slotType:           "4W",
    vehicleNumber:      "GJ01KK5555",
    vehicleDescription: "White Maruti Swift Dzire",
    note:               "Just bought a new car and need a covered 4W slot",
    status:             "pending",
  });
  log.ok("ParkingRequest #1 — Kiran → 4W slot  [pending]");

  // Request 2 — approved (pendingResident got EV slot; slot already assigned above via direct create)
  const evSlot = await ParkingSlot.findOne({ society: society._id, type: "EV" });
  const approvedRequest = await ParkingRequest.create({
    society:            society._id,
    requestedBy:        resident1._id,
    flat:               resident1.flat,
    slotType:           "EV",
    vehicleNumber:      "GJ01ZZ0001",
    vehicleDescription: "Blue Tata Nexon EV",
    note:               "EV owner, need charging slot",
    status:             "approved",
    assignedSlot:       evSlot._id,
    resolvedBy:         adminUser._id,
    resolvedAt:         daysFromNow(-2),
    adminNote:          "EV-01 assigned. Charging access enabled.",
  });
  // Update EV slot to reflect the approved request
  await ParkingSlot.findByIdAndUpdate(evSlot._id, {
    status:        "assigned",
    assignedTo:    resident1._id,
    assignedFlat:  resident1.flat,
    vehicleNumber: "GJ01ZZ0001",
    assignedAt:    daysFromNow(-2),
    assignedBy:    adminUser._id,
  });
  log.ok("ParkingRequest #2 — Rahul → EV slot  [approved / EV-01 assigned]");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY PRINTOUT
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║                   ✅  SEED COMPLETE                          ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🏠 SOCIETY${c.reset}`);
  console.log(`   Name      : Sunrise Residency  (Ahmedabad, Gujarat)`);
  console.log(`   Join Code : ${c.bold}${c.yellow}${code}${c.reset}  — share with new residents`);
  console.log(`   Join Mode : approval\n`);

  console.log(`${c.bold}👤 LOGIN CREDENTIALS${c.reset}`);
  console.log("─────────────────────────────────────────────────────────────────────────────");
  console.log(" Role          Email                             Password        Flat / Block");
  console.log("───────────────┼──────────────────────────────────┼───────────────┼────────────");
  console.log(` ${c.yellow}admin${c.reset}         │ admin@sunriseresidency.com        │ Admin@1234    │ A-101 / Block A`);
  console.log(` ${c.cyan}resident${c.reset}      │ rahul.mehta@resident.com          │ Resident@1234 │ B-202 / Block B`);
  console.log(` ${c.cyan}resident${c.reset}      │ priya.patel@resident.com          │ Resident@5678 │ C-303 / Block C`);
  console.log(` ${c.cyan}resident${c.reset}      │ kiran.joshi@resident.com          │ Resident@9012 │ D-404 / Block D`);
  console.log(` ${c.cyan}resident${c.reset} ⏳   │ amit.desai@resident.com           │ Resident@0001 │ E-505 / Block E  ← pending`);
  console.log(` ${c.magenta}vendor${c.reset}        │ security@quickfix.com             │ Vendor@1234   │ —`);
  console.log("─────────────────────────────────────────────────────────────────────────────\n");

  console.log(`${c.bold}🔑 VISITOR OTP  (for Visitor #1 — Ankit Shah)${c.reset}`);
  console.log(`   OTP : ${c.bold}${c.yellow}${rawOTP}${c.reset}  — use at POST /api/v1/visitors/:id/verify-otp\n`);

  console.log(`${c.bold}📦 DATA SEEDED${c.reset}`);
  const rows = [
    ["Phase 1", "Issues",        "5",  "Open / In Progress / Resolved / Anonymous / Vendor-assigned"],
    ["Phase 1", "Notices",       "4",  "1 pinned, Event / Urgent / Finance"],
    ["Phase 1", "Polls",         "3",  "Active (6 votes) / Closed / Fresh (0 votes)"],
    ["Phase 1", "Help Posts",    "3",  "2 open (with upvoted replies), 1 closed"],
    ["Phase 1", "Contacts",      "8",  "Emergency / Committee / Vendor / Other"],
    ["Phase 2", "Visitors",      "3",  "Invited (OTP above) / Walk-in approved / Exited"],
    ["Phase 2", "Maint. Bills",  "2",  "May 2025 published (1 paid / 1 overdue / 1 unpaid), June draft"],
    ["Phase 2", "Amenities",     "2",  "Clubhouse (approval) + Gym (auto-confirm, 5 concurrent)"],
    ["Phase 2", "Bookings",      "3",  "Gym confirmed / Clubhouse pending / Gym cancelled"],
    ["Phase 2", "Events",        "2",  "Diwali published (3 going, 1 maybe) / Meeting draft"],
    ["Phase 2", "Parking Slots", "9",  "5×4W + 3×2W + 1×EV  (mixed available/assigned/blocked)"],
    ["Phase 2", "Parking Reqs",  "2",  "Pending (4W) / Approved (EV-01)"],
  ];
  rows.forEach(([phase, label, count, detail]) => {
    const phaseTag = phase === "Phase 2" ? `${c.blue}[P2]${c.reset}` : `${c.cyan}[P1]${c.reset}`;
    console.log(`   ${phaseTag} ${label.padEnd(16)} ${c.bold}${String(count).padStart(2)}${c.reset}  ${detail}`);
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
