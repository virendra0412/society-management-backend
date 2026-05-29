/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  SOCIETY APP — LARGE DATABASE SEED  v3                                      ║
 * ║                                                                              ║
 * ║  Run:  node seed.js                                                          ║
 * ║  Env:  MONGODB_URI  (defaults to mongodb://127.0.0.1:27017/society_db)      ║
 * ║                                                                              ║
 * ║  Scale (approximate)                                                         ║
 * ║  ────────────────────────────────────────────────────────────────────────── ║
 * ║  Users            :  122   (1 admin + 1 vendor + 120 residents)             ║
 * ║  Issues           :  420   (with comments & vendor assignments)             ║
 * ║  Notices          :   72                                                     ║
 * ║  Polls            :   24   (with votes)                                     ║
 * ║  Help Posts       :  180   (with replies + upvotes)                         ║
 * ║  Contacts         :   40                                                     ║
 * ║  Visitors         :  360   (all statuses covered)                           ║
 * ║  Maintenance Bills:   18   (18 months, 120 payment records each = 2,160)    ║
 * ║  Amenities        :    6                                                     ║
 * ║  Amenity Bookings :  480                                                     ║
 * ║  Events           :   30   (with RSVPs)                                     ║
 * ║  Parking Slots    :  240                                                     ║
 * ║  Parking Requests :  320                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const crypto   = require("crypto");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/society_db";

// ─── Models ───────────────────────────────────────────────────────────────────
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
const daysAgo      = (d)     => new Date(Date.now() - d * 86_400_000);
const daysFromNow  = (d)     => new Date(Date.now() + d * 86_400_000);
const hoursAgo     = (h)     => new Date(Date.now() - h * 3_600_000);
const hoursFromNow = (h)     => new Date(Date.now() + h * 3_600_000);
const pick         = (arr)   => arr[Math.floor(Math.random() * arr.length)];
const pickN        = (arr,n) => [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
const rand         = (min,max) => Math.floor(Math.random() * (max - min + 1)) + min;
const atHour       = (base, h, m = 0) => { const d = new Date(base); d.setHours(h,m,0,0); return d; };

// ─── Realistic Data Pools ─────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Aarav","Arjun","Rahul","Vikram","Suresh","Rajesh","Amit","Deepak","Nikhil","Ravi",
  "Kiran","Manish","Pradeep","Sanjay","Ashok","Mahesh","Dinesh","Ramesh","Rohit","Ajay",
  "Priya","Sneha","Pooja","Divya","Anita","Meera","Kavita","Sunita","Geeta","Rekha",
  "Neha","Ritu","Sonia","Anjali","Shweta","Pallavi","Preeti","Jyoti","Nisha","Asha",
  "Gaurav","Hardik","Vivek","Mayank","Piyush","Tejas","Yash","Harsh","Dev","Keval",
  "Shreya","Komal","Hetal","Foram","Drashti","Riddhi","Siddhi","Bhavna","Monal","Pinki",
  "Satish","Bharat","Naresh","Paresh","Jignesh","Haresh","Nilesh","Hitesh","Umesh","Rakesh",
  "Hina","Mita","Nita","Rita","Lata","Usha","Indu","Leela","Varsha","Chhaya",
  "Dhruv","Parth","Ayush","Rishabh","Kabir","Aryan","Vedant","Shrey","Neel","Veer",
  "Disha","Riya","Tiya","Mia","Ria","Sia","Zara","Isha","Krisha","Navya",
  "Jayesh","Nimesh","Lokesh","Yogesh","Mukesh","Suresh","Dinesh","Kishore","Pramod","Vinod",
  "Saroj","Beena","Heena","Falguni","Kalpana","Vandana","Archana","Sushma","Pushpa","Radha",
];

const LAST_NAMES = [
  "Sharma","Patel","Shah","Mehta","Joshi","Desai","Trivedi","Pandya","Modi","Shukla",
  "Nair","Pillai","Iyer","Menon","Kumar","Singh","Gupta","Agrawal","Verma","Mishra",
  "Rao","Reddy","Naidu","Murthy","Shetty","Bhat","Kulkarni","Joshi","Deshpande","Patil",
  "Kapoor","Malhotra","Chopra","Arora","Bhatia","Walia","Grover","Mehra","Sethi","Anand",
  "Chauhan","Rajput","Thakur","Saxena","Srivastava","Tiwari","Dubey","Yadav","Maurya","Pandey",
];

const VEHICLE_COLORS  = ["White","Silver","Grey","Black","Red","Blue","Pearl White","Navy Blue","Maroon","Golden"];
const VEHICLE_4W      = ["Maruti Swift","Hyundai Creta","Honda City","Toyota Innova","Tata Nexon",
                          "Maruti Ertiga","Kia Seltos","Renault Duster","Ford EcoSport","Hyundai Verna",
                          "Mahindra XUV700","Honda WR-V","Skoda Rapid","VW Polo","Maruti Baleno",
                          "Tata Altroz","Hyundai i20","Maruti Dzire","Toyota Fortuner","Jeep Compass"];
const VEHICLE_2W      = ["Honda Activa","Honda Shine","Bajaj Pulsar","Royal Enfield Bullet","TVS Jupiter",
                          "Suzuki Access","Yamaha FZ","Hero Splendor","Bajaj Dominar","TVS Apache"];
const VEHICLE_EV      = ["Tata Nexon EV","Ola S1 Pro","Ather 450X","MG ZS EV","Hyundai Kona EV",
                          "Tata Tiago EV","Bajaj Chetak","TVS iQube","Hero Vida V1","BMW i3"];

const ISSUE_TITLES = {
  Water:       ["Water leakage in flat corridor","Overhead tank overflow","Low water pressure in morning",
                 "Dirty water supply in Wing C","No water supply in basement flats","Pipe burst near Gate 2",
                 "Water logging in parking area","Sewage smell from water tank","Hot water not working in gym",
                 "Dripping tap in common toilet"],
  Lift:        ["Lift out of order in Tower B","Lift door sensor malfunctioning","Lift making noise during operation",
                 "Emergency button not working in Lift 2","Lift stuck between floors again","Lift light not working",
                 "Lift overload alarm triggered frequently","Lift rope needs replacement","Lift capacity sign damaged",
                 "Lift button panel damaged"],
  Security:    ["Gate not closing properly","CCTV camera not working near parking","Security guard absent at night",
                 "Unknown vehicle in resident parking","Unauthorized person found in lobby","Entry gate lock broken",
                 "Intercom not working in A-wing","Security booth light not working","Visitor log not being maintained",
                 "Stray dogs entering society"],
  Garbage:     ["Garbage bin overflowing near Gate 1","Garbage collection van absent for 3 days",
                 "Garbage dumped in open area","Garbage bin broken in B-wing lobby","Foul smell from garbage area",
                 "Recycling bins not segregated","Wet garbage not collected","Construction waste dumped in society",
                 "Garbage area requires disinfection","Plastic waste not being collected"],
  Electricity: ["Street light not working in parking","Power fluctuation in Wing D","Common area lights off for 2 days",
                 "Short circuit in stairwell","Generator not starting during outage","Electricity meter room locked",
                 "Solar panel not generating power","Electric socket damaged in lobby","Wiring exposed near mailbox area",
                 "Circuit breaker tripping frequently"],
  Noise:       ["Loud music after 10 PM from flat","Construction work at odd hours","Dog barking all night",
                 "Heavy vehicle noise inside society","Renovation noise from upper floor","DJ music during weekdays",
                 "Kids playing cricket in corridor","Loud TV from corner flat","Generator noise during outage",
                 "Argument between residents disturbing others"],
  Parking:     ["Car parked in wrong slot","Bike blocking walkway","Double parking in basement",
                 "Visitor car parked overnight","Unauthorized parking in reserved slot","Parking line painting faded",
                 "Parking barrier broken","Speed bump damaged in parking","Parking entry height bar missing",
                 "Oil spillage in parking from vehicle"],
  Other:       ["Postbox broken in lobby","Terrace door lock broken","Common area paint peeling",
                 "Gym equipment not maintained","Kids play area needs repair","Society notice board damaged",
                 "Common area floor tile broken","Garden area needs maintenance","Society boundary wall cracked",
                 "Suggestion box not emptied"],
};

const NOTICE_TITLES_POOL = [
  { tag:"Urgent",  title:"🚨 Emergency: Main Water Line Repair — No Supply Tomorrow 6AM-2PM" },
  { tag:"Urgent",  title:"⚠️ Power Shutdown Scheduled — Sunday 9AM to 1PM (Transformer Work)" },
  { tag:"Urgent",  title:"🔴 NOTICE: COVID Sanitization Drive Tomorrow — All Common Areas" },
  { tag:"Finance", title:"💰 Q1 Maintenance Charges Due — Pay Before 31st to Avoid Penalty" },
  { tag:"Finance", title:"📊 Annual Society Accounts — FY 2024-25 Summary Published" },
  { tag:"Finance", title:"💳 Online Payment Now Active — Use UPI/NEFT via Society Portal" },
  { tag:"Finance", title:"📋 Special Levy: Terrace Waterproofing — ₹2,000 Per Flat" },
  { tag:"Finance", title:"🏦 New Bank Account for Society Fees — Updated Details Inside" },
  { tag:"Event",   title:"🎉 Republic Day Celebration — January 26 at 9 AM" },
  { tag:"Event",   title:"🌸 Holi Celebration — March 25 at Society Ground" },
  { tag:"Event",   title:"🪔 Diwali Decoration Competition — October 28" },
  { tag:"Event",   title:"🎄 Christmas & New Year Party — December 31 at Clubhouse" },
  { tag:"Event",   title:"🧹 Monthly Cleanliness Drive — First Saturday of Every Month" },
  { tag:"Event",   title:"🎊 Society Foundation Day Celebration — August 15" },
  { tag:"Notice",  title:"📌 New Parking Rules — Effective From 1st Next Month" },
  { tag:"Notice",  title:"📋 Society Bye-laws Updated — All Residents Please Read" },
  { tag:"Notice",  title:"🐕 Pet Policy Reminder — Register Your Pets Before July 31" },
  { tag:"Notice",  title:"🔧 Lift Maintenance Shutdown — Saturday 8AM-12PM" },
  { tag:"Notice",  title:"📦 New Courier Locker Installed at Main Gate" },
  { tag:"Notice",  title:"🏗️ Terrace Access Restricted — Waterproofing Work in Progress" },
  { tag:"Notice",  title:"🚗 Guest Parking Policy — Max 12 Hours, Prior Registration Required" },
  { tag:"Notice",  title:"📵 WhatsApp Group Rules — Admin Announcements Only" },
  { tag:"Reminder",title:"🔔 REMINDER: AGM This Sunday — Attendance Mandatory" },
  { tag:"Reminder",title:"⏰ REMINDER: Common Area Keys Submission Due by End of Week" },
  { tag:"Reminder",title:"📝 REMINDER: Flat Registration Form Submission Deadline Tomorrow" },
  { tag:"Reminder",title:"💡 REMINDER: Switch Off Common Lights When Not in Use" },
  { tag:"Reminder",title:"🚿 REMINDER: Water Conservation — Reduce Usage During Shortage" },
  { tag:"Reminder",title:"🗳️ REMINDER: Committee Election — Vote Before Sunday 6PM" },
  { tag:"Notice",  title:"👷 Basement Waterproofing Work — Parking Partially Unavailable" },
  { tag:"Notice",  title:"🌳 Tree Trimming Scheduled — Please Move Vehicles" },
  { tag:"Notice",  title:"📸 CCTV Upgrade Complete — All Areas Now Covered" },
  { tag:"Urgent",  title:"🚑 Medical Emergency Protocol — Emergency Contact Numbers Updated" },
  { tag:"Finance", title:"💰 Q2 Maintenance Charges — Due Date: September 30" },
  { tag:"Finance", title:"📉 Surplus Funds Usage Proposal — Vote Before Month End" },
  { tag:"Event",   title:"🏃 Society Sports Day — Sunday, July 20 at 6 AM" },
  { tag:"Event",   title:"🎭 Cultural Evening — Navratri Special — All Residents Welcome" },
  { tag:"Notice",  title:"🔒 Security Protocol Update — All Guests Must Carry ID" },
  { tag:"Notice",  title:"🏊 Pool Maintenance: Closed for 3 Days — Starting Monday" },
  { tag:"Reminder",title:"⚡ REMINDER: EV Charging Queue System Starts Next Week" },
  { tag:"Urgent",  title:"🌧️ Monsoon Preparedness — Drainage Cleaning This Weekend" },
  { tag:"Finance", title:"💰 Q3 Maintenance Charges — Due by December 31" },
  { tag:"Notice",  title:"🎓 Tuition Classes Available at Community Room — Book a Slot" },
  { tag:"Event",   title:"🌺 Tree Plantation Drive — World Environment Day, June 5" },
  { tag:"Notice",  title:"🏋️ Gym Timings Updated — Now Open 5AM-11PM Daily" },
  { tag:"Reminder",title:"🔔 REMINDER: Submit Electricity Sub-meter Readings by 25th" },
  { tag:"Urgent",  title:"⚡ Urgent: Generator Servicing Tomorrow — No Backup Power 10AM-2PM" },
  { tag:"Finance", title:"💰 Q4 Maintenance Charges — Annual Summary + Balance Due" },
  { tag:"Event",   title:"👶 Children's Day Special Event — November 14 at 4PM" },
  { tag:"Notice",  title:"📬 New Address for Society Correspondence — Updated Below" },
  { tag:"Notice",  title:"🛁 Common Washroom Renovation Complete — Now Open for Use" },
];

const POLL_POOL = [
  { question:"Which day suits best for the monthly society meeting?",
    options:["First Sunday", "Last Sunday", "First Saturday", "Any Weekday Evening"] },
  { question:"Should the society install more CCTV cameras?",
    options:["Yes — strongly", "Yes — only in parking", "No — not needed", "Need more info first"] },
  { question:"What gym opening hours do you prefer?",
    options:["5AM–10PM", "6AM–10PM", "6AM–11PM", "24 hours"] },
  { question:"Should pets be allowed in lifts?",
    options:["Yes, allowed anytime", "Yes, only off-peak hours", "No — not allowed", "Only small pets"] },
  { question:"Preferred mode for maintenance payment?",
    options:["UPI / Online", "Cheque", "Cash to office", "Bank transfer"] },
  { question:"Should we install EV charging stations in parking?",
    options:["Yes — urgent need", "Yes — within 6 months", "No — too expensive", "Need resident survey first"] },
  { question:"How often should the society garden be maintained?",
    options:["Daily", "Alternate days", "Weekly", "Bi-weekly"] },
  { question:"Should the clubhouse be available for rent to outsiders?",
    options:["Yes — helps fund maintenance", "No — residents only", "Conditional — committee approval", "Weekend only"] },
  { question:"Which amenity should we add next?",
    options:["Swimming Pool", "Basketball Court", "Indoor Games Room", "Meditation Hall"] },
  { question:"Preferred time for water supply (if restricted)?",
    options:["6AM–8AM and 6PM–8PM", "7AM–9AM and 5PM–7PM", "Morning only", "Evening only"] },
  { question:"Should society WhatsApp group be moderated?",
    options:["Yes — admins only post", "Yes — but residents can reply", "No — open group", "Separate groups by wing"] },
  { question:"Preferred contractor for upcoming painting work?",
    options:["Current vendor", "New tender from multiple vendors", "Resident vote on 3 shortlisted", "Committee decides"] },
  { question:"Should we have a resident-only car pool initiative?",
    options:["Yes — great idea", "Maybe — needs more planning", "No — too complicated", "Need more details"] },
  { question:"When should the annual general meeting be held?",
    options:["January", "March", "June", "October"] },
  { question:"Should the society hire a dedicated cleaning staff?",
    options:["Yes — full time", "Yes — part time", "Current vendor is fine", "No — unnecessary cost"] },
  { question:"How should we handle parking violations?",
    options:["Fine ₹200 per incident", "Warning first, then fine", "Towing after 3 violations", "Only for outsiders"] },
  { question:"Should we start a society vegetable garden?",
    options:["Yes — residents can contribute", "Yes — hire a vendor", "No — not practical", "Only if terrace is available"] },
  { question:"Preferred platform for society communication?",
    options:["WhatsApp", "Telegram", "Society App only", "Email newsletter"] },
  { question:"Should children under 10 be allowed in the gym?",
    options:["No — safety risk", "Yes — supervised only", "Yes — dedicated time slot", "Parent's discretion"] },
  { question:"When should society office hours be?",
    options:["9AM–5PM weekdays", "10AM–6PM weekdays", "9AM–1PM weekdays + Saturday", "Open daily 8AM–8PM"] },
  { question:"How often should fire drills be conducted?",
    options:["Every month", "Every 3 months", "Every 6 months", "Annually"] },
  { question:"Should we install solar panels for common area electricity?",
    options:["Yes — good long-term investment", "Yes — if 50%+ residents agree", "No — upfront cost too high", "Need detailed proposal first"] },
  { question:"Who should decide on major expenditures above ₹50,000?",
    options:["Admin committee alone", "Simple majority vote", "2/3 majority vote", "Special general meeting"] },
  { question:"Should children be allowed to play in lobby/corridors?",
    options:["No — designated play areas only", "Yes — during daytime only", "No restriction needed", "Society ground only"] },
];

const HELP_POOL = [
  { cat:"Plumber",     title:"Need a reliable plumber for complete bathroom renovation",
    desc:"Looking for an experienced plumber for bathroom renovation — tiles, fixtures, shower installation. Budget ₹15k–₹25k." },
  { cat:"Electrician", title:"Good electrician needed for modular kitchen wiring",
    desc:"New modular kitchen being installed. Need licensed electrician for wiring, additional sockets, and safety setup." },
  { cat:"Maid",        title:"Part-time maid available for 2BHK — morning hours only",
    desc:"We have a reliable maid available mornings 7–9 AM. She is thorough, honest, and has 3 references from our wing." },
  { cat:"Carpenter",   title:"Need carpenter for custom wardrobe and kitchen shelves",
    desc:"Looking for a carpenter with experience in laminated modular work. Full wardrobe + kitchen loft storage needed." },
  { cat:"Food",        title:"Best home-cooked tiffin service near our society?",
    desc:"Just moved in and looking for a good tiffin service — Gujarati or Punjabi food. Daily lunch + dinner preferred." },
  { cat:"Transport",   title:"Anyone sharing cab to Prahlad Nagar office park?",
    desc:"Looking for cab sharing from society to Prahlad Nagar office area, weekdays 9:30 AM. Happy to share cost." },
  { cat:"Tutor",       title:"Math and Science tutor needed for Class 10 CBSE",
    desc:"Our child needs help with Class 10 Math (CBSE). Preferred: experienced tutor, home visits 5–7 PM weekdays." },
  { cat:"Other",       title:"AC service recommendation — trust issues with online platforms",
    desc:"My 2-ton split AC needs annual servicing. Wary of Urbanclap guys — anyone have a trusted local technician?" },
  { cat:"Plumber",     title:"Leaking pipe under kitchen sink — urgent help needed",
    desc:"Water dripping under my kitchen sink since yesterday. Need a plumber today or tomorrow. Willing to pay extra for urgency." },
  { cat:"Maid",        title:"Looking for full-time live-in helper — family of 4",
    desc:"We are a family of 4 with elderly parents. Looking for a live-in helper experienced with elder care and cooking." },
  { cat:"Electrician", title:"Inverter installation — which electrician did the others use?",
    desc:"Planning to install a 1.5kVA inverter. Need someone who has done this in the society before for safety compliance." },
  { cat:"Carpenter",   title:"Old furniture polishing and repair — anyone done this recently?",
    desc:"Have some old teak wood furniture that needs polishing and minor repairs. Looking for a craftsman, not a factory." },
  { cat:"Food",        title:"Any good caterer for a small home function (25 people)?",
    desc:"Planning a small puja function with lunch for ~25 people. Need traditional Gujarati thali catering with setup." },
  { cat:"Transport",   title:"Reliable cab driver contact for airport drops?",
    desc:"My regular cab driver left. Need someone reliable for early morning airport drops — any recommendations?" },
  { cat:"Tutor",       title:"Piano teacher for 8-year-old — beginner level",
    desc:"My daughter wants to learn piano. Looking for a teacher who can come to our flat or teach nearby. Beginner level." },
  { cat:"Other",       title:"Pest control — ants and cockroaches in kitchen",
    desc:"Suddenly have a big ant problem in kitchen and bathroom. Looking for a reliable pest control service, preferably herbal." },
  { cat:"Plumber",     title:"Bathroom geyser not working — need electrician or plumber?",
    desc:"My electric geyser stopped working suddenly. Hot water comes out cold. Need to know if electrician or plumber is needed." },
  { cat:"Maid",        title:"Weekend cleaning help needed — 3 hours on Saturdays",
    desc:"Working couple needing deep cleaning help every Saturday morning. Any recommendations from residents who use weekend help?" },
  { cat:"Carpenter",   title:"Baby-proofing the house — need carpenter for cabinet locks",
    desc:"Our baby has started walking. Need a carpenter to install safety locks on all lower cabinets. Urgent, please recommend." },
  { cat:"Tutor",       title:"English speaking class for my parents — any suggestions?",
    desc:"My parents (senior citizens) want to improve English conversation skills. Looking for a patient teacher for home visits." },
  { cat:"Other",       title:"Interior designer reference — redoing living room on budget",
    desc:"Redoing our living room on ₹80k budget. Looking for an interior designer who has done other flats in our wing/society." },
  { cat:"Food",        title:"Good bakery/cake shop near our society for custom cakes?",
    desc:"Kids birthday next week. Looking for a reliable baker who does custom fondant cakes and delivers to our society." },
  { cat:"Transport",   title:"Carpool to airport this Friday — anyone going early morning?",
    desc:"Flying out Friday 6 AM from SVPI. Anyone driving to the airport and willing to take a co-passenger? Happy to share cost." },
  { cat:"Electrician", title:"CCTV camera installation inside flat — any trusted vendor?",
    desc:"Want to install 2 indoor cameras for security. Looking for someone reliable who has done this in society before." },
  { cat:"Plumber",     title:"Water pressure booster pump installation — who to contact?",
    desc:"Top floor flat here. Very low water pressure. Want to install a booster pump. Need a plumber + electrician both." },
  { cat:"Maid",        title:"Cook needed for dinner only — South Indian food preferred",
    desc:"Working late hours. Need a cook for dinner (6–7 PM). South Indian cuisine preferred. Transparent background required." },
  { cat:"Other",       title:"Vastu consultant recommendation for new flat",
    desc:"Moving into new flat next month. Want a Vastu consultant to review before doing any drilling or furniture placement." },
  { cat:"Carpenter",   title:"Mosquito mesh / window net installation urgently needed",
    desc:"Monsoon is here and mosquitos are unbearable. Need someone to install proper mesh on all windows. Please recommend." },
  { cat:"Tutor",       title:"Abacus / mental math class for 6-year-old",
    desc:"Looking for a certified abacus teacher near our area. Okay with online too if teacher is patient with young kids." },
  { cat:"Food",        title:"Home-made pickle and papads for Diwali gifting — anyone selling?",
    desc:"Looking to buy home-made pickles, papads, and mathri for Diwali gifts. Prefer buying from society residents only." },
];

const EVENT_POOL = [
  { cat:"Festival",  title:"🪔 Diwali Grand Celebration 2025",
    desc:"Join us for the annual Diwali night — rangoli competition, puja, sweets distribution, and a spectacular fireworks display from the terrace.\n\nDress code: Traditional attire. Children's competitions start at 6 PM.", capacity:200, rsvp:true  },
  { cat:"Festival",  title:"🎨 Holi Festival — Colors & Fun",
    desc:"Celebrate the festival of colors with your society family! Organic colors only. DJ and folk music. Complimentary bhang thandai and snacks for all residents.", capacity:180, rsvp:true  },
  { cat:"Cultural",  title:"🎭 Independence Day Cultural Program — August 15",
    desc:"Annual Independence Day celebration with patriotic songs, skit performances by children, and flag hoisting at 9 AM sharp. All residents requested to attend.", capacity:250, rsvp:false },
  { cat:"Sports",    title:"🏃 Annual Society Sports Day",
    desc:"Fun sporting events for all age groups — relay races, badminton, carrom, chess, and tug-of-war.\n\nPrizes for all categories. Registration mandatory for outdoor events.", capacity:150, rsvp:true  },
  { cat:"Meeting",   title:"📋 Annual General Meeting — FY 2025-26",
    desc:"AGM to review the year's accounts, elect committee members for the next term, and discuss the maintenance budget for 2025-26.\n\nProxy voting forms available at the society office.", capacity:null, rsvp:false },
  { cat:"Workshop",  title:"🧘 Weekend Yoga & Meditation Camp",
    desc:"Two-day yoga and meditation workshop conducted by a certified instructor. Open to all age groups. Bring your own mat.\n\nSessions: 6AM–7:30AM both days.", capacity:40, rsvp:true  },
  { cat:"Health",    title:"🩺 Health Check-up Camp — Free for All Residents",
    desc:"Free health check-up by certified doctors — BP, diabetes, eye check, BMI, and basic blood tests.\n\nBring your Aadhaar card. Open 9AM–3PM.", capacity:null, rsvp:false },
  { cat:"Cultural",  title:"🎵 Musical Evening — Antakshari Night",
    desc:"A fun community antakshari night for families. Team up with your neighbors and compete for the Sunrise Residency Music Trophy!", capacity:120, rsvp:true  },
  { cat:"Festival",  title:"🌸 Navratri Garba Night — 9 Nights of Celebration",
    desc:"Celebrate Navratri with traditional garba and dandiya! Decorated venue, live folk music, and Gujarati farsan stalls.\n\nDress code: Traditional. Passes required — collect from society office.", capacity:300, rsvp:true  },
  { cat:"Sports",    title:"🏏 Cricket Tournament — Inter-Wing Cup",
    desc:"Annual inter-wing cricket tournament. Wings A, B, C, D, E, F to each send one team of 11.\n\nMatches on 3 consecutive Sundays. Trophies and medals for winners.", capacity:100, rsvp:true  },
  { cat:"Workshop",  title:"🌱 Urban Gardening Workshop — Grow Your Own",
    desc:"Learn to grow vegetables on your balcony! Expert horticulturist will demonstrate techniques, composting, and irrigation hacks.\n\nFree seed kits for all attendees.", capacity:50, rsvp:true  },
  { cat:"Health",    title:"🦷 Dental Check-up Camp — Smile for Sunrise Residency",
    desc:"Free dental consultation and basic check-up by a visiting dental team. Fluoride treatment for children under 12 at no cost.", capacity:null, rsvp:false },
  { cat:"Cultural",  title:"🎬 Movie Night Under the Stars",
    desc:"Open-air movie screening on the society terrace! Family-friendly Bollywood comedy.\n\nPopcorn and cold drinks available. Bring your own chairs/mats.", capacity:100, rsvp:true  },
  { cat:"Festival",  title:"👶 Children's Day Celebration — November 14",
    desc:"Special day for all kids in our society — magic show, face painting, treasure hunt, and a yummy cake-cutting ceremony!\n\nAll children aged 2–14 are welcome.", capacity:80, rsvp:true  },
  { cat:"Meeting",   title:"📊 Quarterly Budget Review — All Residents Welcome",
    desc:"The finance committee will present the Q2 income and expenditure report. Residents can ask questions and vote on pending proposals.", capacity:null, rsvp:false },
  { cat:"Sports",    title:"♟️ Chess & Carrom Tournament — Family Edition",
    desc:"Friendly chess and carrom competition for residents of all ages. Individual and pair categories.\n\nPrizes for top 3 in each category. Register by Friday.", capacity:60, rsvp:true  },
  { cat:"Workshop",  title:"📱 Smart Home & IoT Workshop for Residents",
    desc:"Learn how to set up smart lights, locks, cameras, and voice assistants in your flat without rewiring.\n\nFree demo devices to try. Session by a certified smart-home consultant.", capacity:40, rsvp:true  },
  { cat:"Health",    title:"🩸 Blood Donation Camp — Every Drop Counts",
    desc:"Voluntary blood donation camp organized in association with a city hospital.\n\nEligibility: Age 18–65, weight above 50 kg. Certificate of donation provided.", capacity:null, rsvp:false },
  { cat:"Cultural",  title:"🎤 Talent Show — Sunrise's Got Talent!",
    desc:"Show off your skills — singing, dancing, poetry, stand-up, or any hidden talent!\n\nAll age groups welcome. Registration required. Winner gets ₹5,000 prize.", capacity:120, rsvp:true  },
  { cat:"Festival",  title:"🌺 Ganesh Chaturthi Celebration",
    desc:"Four-day Ganesh Chaturthi celebration with daily aarti, prasad distribution, and cultural programs.\n\nAll residents are requested to participate in visarjan procession on Day 4.", capacity:null, rsvp:false },
  { cat:"Workshop",  title:"🔥 Fire Safety Training — Know What to Do",
    desc:"Practical fire safety workshop with live demonstrations. Topics: extinguisher types, evacuation, gas leak protocol.\n\nMandatory for one member per flat.", capacity:null, rsvp:true  },
  { cat:"Sports",    title:"🤸 Kids Fitness Boot Camp — School Holiday Special",
    desc:"5-day fitness boot camp for children aged 8–15 during school holidays. Activities include yoga, relay, obstacle course, and meditation.", capacity:40, rsvp:true  },
  { cat:"Cultural",  title:"👴 Senior Citizens' Day — Celebrations for Our Elders",
    desc:"A special day to honor the elderly residents of Sunrise Residency — felicitation ceremony, blessings from elders, and a special lunch in the clubhouse.", capacity:80, rsvp:false },
  { cat:"Meeting",   title:"🔧 Special Meeting: Terrace Renovation Proposal",
    desc:"Discussion on the proposed terrace garden and solar panel installation. Three contractor bids will be presented. Resident vote will decide.", capacity:null, rsvp:false },
  { cat:"Health",    title:"💉 Vaccine Awareness & Flu Shot Drive",
    desc:"Free flu vaccination for senior citizens above 60. Typhoid and other vaccine advisory for all. A doctor will be on-site from 10AM-1PM.", capacity:null, rsvp:false },
  { cat:"Cultural",  title:"🎊 New Year Countdown Celebration",
    desc:"Ring in the New Year together! DJ night at the society ground. Midnight countdown, fireworks, and dinner spread.\n\nPasses required — ₹500 per family, proceeds go to society fund.", capacity:200, rsvp:true  },
  { cat:"Sports",    title:"🏊 Swimming Competition — Aqua Fiesta",
    desc:"Inter-society swimming competition at our pool. Categories: under-10, under-16, adults.\n\nExternal coaches welcome for Sunrise Residency teams.", capacity:60, rsvp:true  },
  { cat:"Workshop",  title:"🧸 Parenting Workshop — Raising Happy Children",
    desc:"Talk by a child psychologist on positive parenting, screen time management, and building emotional resilience in children.", capacity:40, rsvp:true  },
  { cat:"Festival",  title:"🎊 Makar Sankranti Kite Festival",
    desc:"Fly kites from the society terrace! Traditional folk music, til-gul distribution, and undhiyu lunch for all residents.\n\nBest kite contest with prizes for 3 categories.", capacity:null, rsvp:false },
  { cat:"Meeting",   title:"🗳️ Committee Election — Cast Your Vote",
    desc:"Election of society committee members for 2025-27 term. 6 committee positions open. Ballots at the society office 8AM–8PM on election day.", capacity:null, rsvp:false },
];

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}╔══════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║   Society App — Large Seed  v3  (~120 residents) ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════════════╝${c.reset}\n`);

  log.section("Connecting to MongoDB");
  await mongoose.connect(MONGO_URI);
  log.ok(`Connected → ${MONGO_URI}`);

  // ── Wipe ──────────────────────────────────────────────────────────────────
  log.section("Clearing all collections");
  await Promise.all([
    User.deleteMany({}), Society.deleteMany({}), Issue.deleteMany({}),
    Notice.deleteMany({}), Poll.deleteMany({}), Help.deleteMany({}),
    Contact.deleteMany({}), Visitor.deleteMany({}), MaintenanceBill.deleteMany({}),
    Amenity.deleteMany({}), AmenityBooking.deleteMany({}),
    Event.deleteMany({}), ParkingSlot.deleteMany({}), ParkingRequest.deleteMany({}),
  ]);
  log.ok("All collections cleared");

  // ══════════════════════════════════════════════════════════════════════════
  //  ADMIN
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating Admin");
  const adminPassword = "Admin@1234";
  const adminUser = await User.create({
    name: "Admin Sharma", email: "admin@sunriseresidency.com",
    phone: "+919876543210", password: adminPassword, role: "admin",
    flat: "A-101", wing: "A",
    familyMembers: [
      { name: "Meena Sharma",  relation: "Spouse", phone: "+919876543211" },
      { name: "Rohan Sharma",  relation: "Son",    phone: null },
    ],
    isApproved: true, isActive: true,
  });
  log.ok(`admin → ${adminUser.email}`);

  // ── Society ───────────────────────────────────────────────────────────────
  log.section("Creating Society");
  const society = await Society.create({
    name: "Sunrise Residency", address: "Plot No. 42, Satellite Road",
    city: "Ahmedabad", state: "Gujarat", admin: adminUser._id,
    joinMode: "approval", totalUnits: 240, isActive: true,
  });
  await User.findByIdAndUpdate(adminUser._id, { society: society._id });
  log.ok(`Society "Sunrise Residency"  joinCode: ${c.bold}${c.yellow}${society.joinCode}${c.reset}`);

  // ── Vendor ────────────────────────────────────────────────────────────────
  const vendorUser = await User.create({
    name: "QuickFix Security", email: "security@quickfix.com",
    phone: "+919845678901", password: "Vendor@1234", role: "vendor",
    flat: null, wing: null, society: society._id,
    isApproved: true, isActive: true,
  });
  log.ok(`vendor → ${vendorUser.email}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  120 RESIDENTS — 20 per wing (A–F)
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Creating 120 Residents (Wings A-F, 20 each)");

  const resPwdHash  = "Resident@1234";
  const resPwdHash2 = "Resident@5678";
  const resPwdHash3 = "Resident@9012";

  const WINGS = ["A","B","C","D","E","F"];
  const residents = [];

  // Pre-defined key residents (first 6) for use in complex scenarios
  const KEY_RESIDENTS = [
    { name:"Rahul Mehta",   email:"rahul.mehta@resident.com",   phone:"+919812345678", wing:"B", flat:"B-202", pwd:resPwdHash  },
    { name:"Priya Patel",   email:"priya.patel@resident.com",   phone:"+919823456789", wing:"C", flat:"C-303", pwd:resPwdHash2 },
    { name:"Kiran Joshi",   email:"kiran.joshi@resident.com",   phone:"+919834567890", wing:"D", flat:"D-404", pwd:resPwdHash3 },
    { name:"Deepak Nair",   email:"deepak.nair@resident.com",   phone:"+919845678902", wing:"F", flat:"F-601", pwd:resPwdHash  },
    { name:"Sneha Reddy",   email:"sneha.reddy@resident.com",   phone:"+919856789013", wing:"E", flat:"E-502", pwd:resPwdHash2 },
    { name:"Arjun Kapoor",  email:"arjun.kapoor@resident.com",  phone:"+919867890124", wing:"A", flat:"A-205", pwd:resPwdHash3 },
  ];

  // Create key residents first
  for (const kr of KEY_RESIDENTS) {
    const u = await User.create({
      name: kr.name, email: kr.email, phone: kr.phone, password: kr.pwd,
      role: "resident", flat: kr.flat, wing: kr.wing, society: society._id,
      familyMembers: [
        { name: kr.name.split(" ")[0] + " Spouse", relation: "Spouse", phone: null },
        { name: kr.name.split(" ")[0] + " Jr.",    relation: "Child",  phone: null },
      ],
      isApproved: true, isActive: true,
    });
    residents.push(u);
  }
  log.ok(`6 key residents created (B-202, C-303, D-404, F-601, E-502, A-205)`);

  // Generate remaining residents
  const usedEmails = new Set(KEY_RESIDENTS.map(k => k.email));
  let resCount = 6;
  const pwdHashes = [resPwdHash, resPwdHash2, resPwdHash3];
  const RELATIONS = ["Spouse","Son","Daughter","Father","Mother"];

  for (const wing of WINGS) {
    const floorStart = wing.charCodeAt(0) - 65 + 1; // A=1, B=2, ...
    for (let unit = 1; unit <= 20; unit++) {
      const flat = `${wing}-${String(floorStart * 100 + unit).padStart(3,"0")}`;
      // Skip flats already used by key residents
      if (KEY_RESIDENTS.some(kr => kr.flat === flat)) continue;
      if (resCount >= 120) break;

      const fn = FIRST_NAMES[(resCount * 7)   % FIRST_NAMES.length];
      const ln = LAST_NAMES [(resCount * 3 + 1) % LAST_NAMES.length];
      const fullName = `${fn} ${ln}`;
      let email = `${fn.toLowerCase()}.${ln.toLowerCase()}${resCount}@resident.com`;
      while (usedEmails.has(email)) email = `${fn.toLowerCase()}.${ln.toLowerCase()}${resCount + 1000}@resident.com`;
      usedEmails.add(email);

      const phone = `+91${String(9000000000 + resCount).slice(0, 10)}`;
      const fm = [];
      const fmCount = rand(0, 3);
      for (let f = 0; f < fmCount; f++) {
        fm.push({
          name:     `${FIRST_NAMES[(resCount + f + 10) % FIRST_NAMES.length]} ${ln}`,
          relation: RELATIONS[f % RELATIONS.length],
          phone:    null,
        });
      }

      const u = await User.create({
        name: fullName, email, phone,
        password: pwdHashes[resCount % 3],
        role: "resident", flat, wing, society: society._id,
        familyMembers: fm,
        isApproved: true, isActive: true,
      });
      residents.push(u);
      resCount++;
    }
    if (resCount >= 120) break;
  }

  // Pending resident
  const pendingResident = await User.create({
    name: "Amit Desai", email: "amit.desai@resident.com",
    phone: "+919999000001", password: "Resident@0001",
    role: "resident", flat: "E-505", wing: "E", society: society._id,
    isApproved: false, isActive: true,
  });
  log.ok(`${residents.length} residents created + 1 pending (${pendingResident.email})`);

  // ══════════════════════════════════════════════════════════════════════════
  //  ISSUES — 420 across all categories, statuses, priorities
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 420 Issues");

  const CATEGORIES  = ["Water","Lift","Security","Garbage","Electricity","Noise","Parking","Other"];
  const PRIORITIES  = ["Low","Medium","High"];
  const STATUSES    = ["Open","In Progress","Resolved"];
  const VENDOR_NAMES = ["SpeedLift Services","QuickPlumb Co.","ElectroPro","CleanCity Services",
                         "SecureHome Systems","NoiseStop Pvt Ltd","ParkSafe Solutions","TechFix India"];
  const ADMIN_COMMENTS = [
    "Looking into this. Will update shortly.",
    "Contacted the vendor. Visit scheduled for Friday.",
    "Maintenance team notified. Work in progress.",
    "Temporary fix applied. Permanent repair scheduled.",
    "Escalating to building management committee.",
    "Vendor quotation received. Awaiting committee approval.",
    "Issue resolved. Please confirm if it recurs.",
    "Third-party inspection arranged for next week.",
  ];

  const issuesBulk = [];
  for (let i = 0; i < 420; i++) {
    const cat      = CATEGORIES[i % CATEGORIES.length];
    const priority = PRIORITIES[i % PRIORITIES.length];
    const status   = STATUSES[i % STATUSES.length];
    const reporter = residents[i % residents.length];
    const titleArr = ISSUE_TITLES[cat];
    const title    = titleArr[i % titleArr.length] + (i >= titleArr.length ? ` (#${Math.ceil(i/titleArr.length)+1})` : "");
    const isAnon   = i % 7 === 0;
    const hasVendor= status === "In Progress" && i % 4 === 0;
    const comments = [];

    // Admin reply on ~50% of issues
    if (i % 2 === 0) {
      comments.push({
        author: adminUser._id,
        body: ADMIN_COMMENTS[i % ADMIN_COMMENTS.length],
        isAdminReply: true,
        createdAt: daysAgo(rand(1, 10)),
      });
    }
    // Resident follow-up on ~25%
    if (i % 4 === 0 && status !== "Open") {
      comments.push({
        author: reporter._id,
        body: "Thanks for the update. Will wait for the permanent fix.",
        isAdminReply: false,
        createdAt: daysAgo(rand(0, 5)),
      });
    }
    // Second admin reply
    if (i % 6 === 0 && status === "Resolved") {
      comments.push({
        author: adminUser._id,
        body: "Issue has been resolved. Closing this ticket. Reopen if the problem persists.",
        isAdminReply: true,
        createdAt: daysAgo(rand(0, 2)),
      });
    }

    issuesBulk.push({
      title: title.slice(0, 149),
      description: `Detailed description of the issue reported by flat ${reporter.flat}. This has been ongoing for ${rand(1,14)} days. Priority: ${priority}. Residents in the nearby area are also affected. Immediate attention requested.`,
      category: cat, priority, status,
      society: society._id,
      reporter: reporter._id,
      flat: reporter.flat,
      isAnonymous: isAnon,
      assignedTo: status !== "Open" ? adminUser._id : null,
      assignedVendor: hasVendor ? {
        name:  VENDOR_NAMES[i % VENDOR_NAMES.length],
        phone: `+9199${String(10000000 + i).slice(0, 8)}`,
        note:  `Vendor assigned on ${new Date(daysAgo(rand(1,5))).toDateString()}`,
      } : { name: null, phone: null, note: null },
      resolvedAt: status === "Resolved" ? daysAgo(rand(1, 20)) : null,
      isEscalated: i % 15 === 0 && status === "Open",
      escalatedAt: i % 15 === 0 && status === "Open" ? daysAgo(rand(1, 5)) : null,
      comments,
      createdAt: daysAgo(rand(1, 180)),
    });
  }
  await Issue.insertMany(issuesBulk);
  log.ok(`420 issues created across ${CATEGORIES.length} categories`);

  // ══════════════════════════════════════════════════════════════════════════
  //  NOTICES — 72
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 72 Notices");

  const noticesBulk = [];
  for (let i = 0; i < 72; i++) {
    const tmpl  = NOTICE_TITLES_POOL[i % NOTICE_TITLES_POOL.length];
    const isPinned = i < 3; // First 3 are pinned
    noticesBulk.push({
      title: tmpl.title + (i >= NOTICE_TITLES_POOL.length ? ` — Update ${Math.ceil(i / NOTICE_TITLES_POOL.length)}` : ""),
      body:  `Dear Residents,\n\nThis is an official notice from the Sunrise Residency Management Committee.\n\n${tmpl.title.replace(/^[^\w\s]+\s*/, "")}\n\nThis is applicable to all residents of all wings. Please cooperate and ensure compliance. For queries, contact the society office at +917966554433 or email admin@sunriseresidency.com.\n\nNote: Non-compliance may attract a fine of ₹${pick([200,500,1000,1500])} per incident as per society bye-laws.\n\nThank you for your cooperation.\n\nManagement Committee\nSunrise Residency`,
      tag:   tmpl.tag,
      society: society._id,
      postedBy: adminUser._id,
      isPinned,
      isPublished: true,
      createdAt: daysAgo(rand(1, 365)),
    });
  }
  await Notice.insertMany(noticesBulk);
  log.ok("72 notices created (3 pinned)");

  // ══════════════════════════════════════════════════════════════════════════
  //  POLLS — 24
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 24 Polls");

  const pollsBulk = [];
  for (let i = 0; i < 24; i++) {
    const tmpl   = POLL_POOL[i % POLL_POOL.length];
    const isClosed = i < 8;
    const numVoters = isClosed ? rand(40, 90) : rand(5, 40);
    const voterPool = residents.slice(0, numVoters);
    const optionCount = tmpl.options.length;
    // Distribute votes across options realistically
    const voteWeights = tmpl.options.map((_, j) => (optionCount - j) * 2 + rand(0, 5));
    const totalWeight = voteWeights.reduce((a, b) => a + b, 0);
    let assigned = 0;
    const optionVoters = tmpl.options.map((_, j) => {
      const count = j === optionCount - 1
        ? numVoters - assigned
        : Math.round((voteWeights[j] / totalWeight) * numVoters);
      assigned += count;
      return voterPool.slice(assigned - count, assigned);
    });

    pollsBulk.push({
      question: tmpl.question,
      options: tmpl.options.map((label, j) => ({
        label,
        votes:  optionVoters[j].length,
        voters: optionVoters[j].map(u => u._id),
      })),
      society: society._id,
      createdBy: adminUser._id,
      closesAt: isClosed ? daysAgo(rand(1, 60)) : daysFromNow(rand(3, 30)),
      isClosed,
      isAnonymous: i % 3 !== 0,
      totalVotes: numVoters,
      createdAt: daysAgo(rand(1, 120)),
    });
  }
  await Poll.insertMany(pollsBulk);
  log.ok("24 polls created (8 closed, 16 open)");

  // ══════════════════════════════════════════════════════════════════════════
  //  HELP POSTS — 180
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 180 Help Posts");

  const helpBulk = [];
  const HELP_REPLY_BODIES = [
    "I used the same service last month — very reliable. WhatsApp them directly.",
    "Can recommend from personal experience. Quality is good, price is reasonable.",
    "We also faced this issue. The person I contacted resolved it same day.",
    "Contact the building office — they have an empanelled vendor for exactly this.",
    "Happy to share contact details over WhatsApp. Will DM you in the group.",
    "I have tried three options and this one was clearly the best for our building type.",
    "This vendor has been serving our wing for 2 years. Very trustworthy.",
    "Please check the society noticeboard — there are approved vendor contacts listed.",
    "We faced the same problem 3 months ago. Resolved via the AMC package, highly recommended.",
    "Seconded! This option is the best value for money in our area.",
  ];

  for (let i = 0; i < 180; i++) {
    const tmpl    = HELP_POOL[i % HELP_POOL.length];
    const author  = residents[i % residents.length];
    const isClosed= i < 40;
    const replies = [];
    const replyCount = rand(0, 5);
    for (let r = 0; r < replyCount; r++) {
      const replyAuthor = residents[(i + r + 1) % residents.length];
      const upvoters = pickN(residents, rand(0, 6)).map(u => u._id);
      replies.push({
        author: replyAuthor._id,
        body:   HELP_REPLY_BODIES[(i + r) % HELP_REPLY_BODIES.length],
        isVendorContact: r === 0 && i % 5 === 0,
        vendorPhone:     r === 0 && i % 5 === 0 ? `+9199${String(20000000 + i).slice(0,8)}` : null,
        upvotes: upvoters,
        createdAt: daysAgo(rand(0, 30)),
      });
    }
    helpBulk.push({
      title:    (tmpl.title + (i >= HELP_POOL.length ? ` (${Math.ceil(i / HELP_POOL.length) + 1})` : "")).slice(0, 149),
      description: tmpl.desc,
      category: tmpl.cat,
      society:  society._id,
      author:   author._id,
      flat:     author.flat,
      isClosed,
      replies,
      createdAt: daysAgo(rand(1, 180)),
    });
  }
  await Help.insertMany(helpBulk);
  log.ok("180 help posts created (40 closed, 140 open)");

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTACTS — 40
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 40 Contacts");

  const contactsBulk = [
    // Emergency
    { name:"Police Control Room",          phone:"+919876543211",             group:"Emergency", designation:"Police",                icon:"🚔", sortOrder:1 },
    { name:"Fire Brigade",                  phone:"+919876543213",             group:"Emergency", designation:"Fire Department",        icon:"🔥", sortOrder:2 },
    { name:"Ambulance",                     phone:"+919876543214",             group:"Emergency", designation:"Medical Emergency",      icon:"🚑", sortOrder:3 },
    { name:"Electricity Emergency",         phone:"+919876543310",           group:"Emergency", designation:"DGVCL Emergency",       icon:"⚡", sortOrder:4 },
    { name:"Gas Leak Emergency",            phone:"+919876543310",   group:"Emergency", designation:"Gas Authority",         icon:"⚠️", sortOrder:5 },
    // Committee
    { name:"Admin Sharma",                  phone:"+919876543210",   group:"Committee", designation:"Society Chairman",      icon:"👤", sortOrder:1 },
    { name:"Suresh Trivedi",                phone:"+919887654321",   group:"Committee", designation:"Secretary",             icon:"📋", sortOrder:2 },
    { name:"Rekha Iyer",                    phone:"+919898765432",   group:"Committee", designation:"Treasurer",             icon:"💰", sortOrder:3 },
    { name:"Dilip Chauhan",                 phone:"+919909876543",   group:"Committee", designation:"Joint Secretary",       icon:"📝", sortOrder:4 },
    { name:"Varsha Modi",                   phone:"+919910987654",   group:"Committee", designation:"Committee Member",      icon:"🤝", sortOrder:5 },
    { name:"Anand Parikh",                  phone:"+919921098765",   group:"Committee", designation:"Technical Head",        icon:"🔧", sortOrder:6 },
    { name:"Mona Kapoor",                   phone:"+919932109876",   group:"Committee", designation:"Events Coordinator",    icon:"🎭", sortOrder:7 },
    // Vendors
    { name:"QuickFix Electrical",           phone:"+919845678901",   group:"Vendor",    designation:"Electrical Repairs",    icon:"⚡", sortOrder:1 },
    { name:"Ramesh Plumbing Services",      phone:"+919988776655",   group:"Vendor",    designation:"Plumber",               icon:"🔧", sortOrder:2 },
    { name:"SpeedLift Elevator Services",   phone:"+919977665544",   group:"Vendor",    designation:"Lift Maintenance",      icon:"🛗", sortOrder:3 },
    { name:"CleanCo Housekeeping",          phone:"+919966554433",   group:"Vendor",    designation:"Housekeeping",          icon:"🧹", sortOrder:4 },
    { name:"SecureHome CCTV",               phone:"+919955443322",   group:"Vendor",    designation:"CCTV & Security",       icon:"📹", sortOrder:5 },
    { name:"GreenThumb Landscaping",        phone:"+919944332211",   group:"Vendor",    designation:"Gardening",             icon:"🌿", sortOrder:6 },
    { name:"AquaCare Water Treatment",      phone:"+919933221100",   group:"Vendor",    designation:"Water Purification",    icon:"💧", sortOrder:7 },
    { name:"Pest Away Services",            phone:"+919922110099",   group:"Vendor",    designation:"Pest Control",          icon:"🐛", sortOrder:8 },
    { name:"SolarMax Energy",               phone:"+919911009988",   group:"Vendor",    designation:"Solar & EV Charging",   icon:"☀️", sortOrder:9 },
    { name:"CarpentryPlus",                 phone:"+919900998877",   group:"Vendor",    designation:"Carpentry & Furniture", icon:"🪑", sortOrder:10 },
    { name:"QuickPaint Solutions",          phone:"+919889887766",   group:"Vendor",    designation:"Painting",              icon:"🎨", sortOrder:11 },
    { name:"AC Coolzone Services",          phone:"+919878776655",   group:"Vendor",    designation:"AC Service & Repair",   icon:"❄️", sortOrder:12 },
    // Other
    { name:"Sunrise Residency Office",      phone:"+917966554433",   group:"Other",     designation:"Society Office",        icon:"🏢", sortOrder:1 },
    { name:"AMTS Bus Helpline",             phone:"+917923285430",   group:"Other",     designation:"City Bus Service",      icon:"🚌", sortOrder:2 },
    { name:"AMC Water Supply",              phone:"+9198765432123",  group:"Other",     designation:"Municipal Water",        icon:"💧", sortOrder:3 },
    { name:"DGVCL Power Complaint",         phone:"+9198765433210",  group:"Other",     designation:"Electricity Complaint", icon:"⚡", sortOrder:4 },
    { name:"Courier Pickup (Society Gate)", phone:"+919860001234",   group:"Other",     designation:"Logistics Coordinator", icon:"📦", sortOrder:5 },
    { name:"Ahmedabad Municipal Corporation", phone:"+917927562805", group:"Other",     designation:"AMC Office",            icon:"🏛️", sortOrder:6 },
    { name:"SVPI Airport Info",             phone:"+917922866333",   group:"Other",     designation:"Airport Helpline",      icon:"✈️", sortOrder:7 },
    { name:"Satellite Police Station",      phone:"+917926743700",   group:"Other",     designation:"Local Police",          icon:"🚔", sortOrder:8 },
    { name:"Sterling Hospital Helpline",    phone:"+917926740055",   group:"Other",     designation:"Nearby Hospital",       icon:"🏥", sortOrder:9 },
    { name:"Society Accountant",            phone:"+919871234567",   group:"Other",     designation:"CA for Society Audit",  icon:"📊", sortOrder:10 },
    { name:"Insurance Advisor",             phone:"+919862345678",   group:"Other",     designation:"Society Insurance",     icon:"🛡️", sortOrder:11 },
    { name:"Legal Advisor",                 phone:"+919853456789",   group:"Other",     designation:"Society Lawyer",        icon:"⚖️", sortOrder:12 },
    { name:"Resident Welfare Association",  phone:"+919844567890",   group:"Other",     designation:"RWA Liaison",           icon:"🤝", sortOrder:13 },
    { name:"Common Area WiFi Support",      phone:"+919835678901",   group:"Other",     designation:"Internet Helpdesk",     icon:"📶", sortOrder:14 },
    { name:"Temple / Community Hall Booking", phone:"+917966554434", group:"Other",     designation:"Booking Office",        icon:"🛕", sortOrder:15 },
  ].map(c => ({ ...c, society: society._id, addedBy: adminUser._id, isActive: true }));

  await Contact.insertMany(contactsBulk);
  log.ok(`${contactsBulk.length} contacts created (Emergency / Committee / Vendor / Other)`);

  // ══════════════════════════════════════════════════════════════════════════
  //  VISITORS — 360
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 360 Visitors");

  const PURPOSES  = ["Guest","Delivery","Cab","Service","Other"];
  const VIS_NAMES = [
    "Ankit Shah","Raj Kumar","Sunita Ben","Priya Visitor","Mohan Das","Vikas Gupta","Raju Delivery",
    "Swiggy Delivery","Zomato Delivery","Amazon Delivery","Flipkart Delivery","Ajit Singh","Manasi Shah",
    "Govind Patel","Shalini Mehta","Rakesh Carpenter","Leela Maid","Ritesh Courier","Yusuf Electrician",
    "Nilam Cleaner","Bharat Gas Delivery","UPS Courier","Delhivery Boy","Meena Guest","Ashok Visitor",
    "Suraj Cab Driver","Hemant Service","Komal Friend","Ravi Plumber","Anita Relative",
  ];
  const VIS_STATUSES  = ["invited","pending","approved","rejected","exited","expired"];
  const statusWeights = [   15,       15,      30,        10,        25,       5    ]; // roughly proportional

  const visitorsBulk = [];
  let statusIdx = 0;
  let weightLeft = [...statusWeights];

  for (let i = 0; i < 360; i++) {
    // Cycle through status pool according to weights
    while (weightLeft[statusIdx] === 0) { statusIdx = (statusIdx + 1) % VIS_STATUSES.length; }
    const status  = VIS_STATUSES[statusIdx];
    weightLeft[statusIdx]--;
    if (weightLeft.every(w => w === 0)) weightLeft = [...statusWeights]; // refill
    statusIdx = (statusIdx + 1) % VIS_STATUSES.length;

    const host    = residents[i % residents.length];
    const isWalkIn = ["pending","approved","rejected"].includes(status) && (i % 3 !== 0);
    const purpose = pick(PURPOSES);
    const hasVehicle = purpose === "Delivery" || purpose === "Cab";
    const entryTime   = status === "approved" || status === "exited" ? hoursAgo(rand(1, 48)) : null;
    const exitTime    = status === "exited" ? new Date((entryTime?.getTime() || 0) + rand(30, 240) * 60000) : null;

    visitorsBulk.push({
      name:          VIS_NAMES[i % VIS_NAMES.length] + (i >= VIS_NAMES.length ? ` #${Math.floor(i / VIS_NAMES.length) + 1}` : ""),
      phone:         `+9199${String(30000000 + i).slice(0,8)}`,
      vehicleNumber: hasVehicle ? `GJ0${rand(1,9)}${String.fromCharCode(65+rand(0,25))}${String.fromCharCode(65+rand(0,25))}${String(1000+i).slice(0,4)}` : null,
      purpose,
      note:          i % 5 === 0 ? "Verified resident guest. Please allow entry." : null,
      society:       society._id,
      host:          host._id,
      hostFlat:      host.flat,
      status,
      isWalkIn,
      loggedBy:      isWalkIn ? vendorUser._id : null,
      expectedAt:    !isWalkIn && status === "invited" ? hoursFromNow(rand(1, 48)) : null,
      entryTime,
      exitTime,
      approvedAt:    entryTime,
      approvedBy:    entryTime ? (isWalkIn ? host._id : vendorUser._id) : null,
      entryOTPHash:  null,
      entryOTPExpires: null,
      createdAt:     daysAgo(rand(0, 60)),
    });
  }
  await Visitor.insertMany(visitorsBulk);
  log.ok("360 visitors created across all statuses");

  // ══════════════════════════════════════════════════════════════════════════
  //  MAINTENANCE BILLS — 18 months (Jan 2024 – Jun 2025)
  //  Each bill targets all 120 residents → 120 payment records per bill = 2,160 total
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 18 Maintenance Bills (Jan 2024 – Jun 2025, 120 payments each)");

  const PAYMENT_METHODS = ["upi","neft","cheque","cash","other"];
  const months = [];
  for (let y = 2024; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2025 && m > 6) break;
      months.push({ year: y, month: m, str: `${y}-${String(m).padStart(2,"0")}` });
    }
  }

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month, str } = months[mi];
    const isCurrentOrFuture = year === 2025 && month >= 5;
    const isClosed  = !isCurrentOrFuture && mi < 14;
    const isPublished = true;
    const daysUntilDue = isCurrentOrFuture ? rand(10, 30) : -rand(1, 60);
    const dueDate  = daysFromNow(daysUntilDue);
    const baseAmt  = [2500, 3000, 3500][mi % 3];

    const payments = residents.map((res, ri) => {
      let status = "unpaid";
      let paidAmount = 0;
      let paidAt = null;
      let paymentMethod = null;
      let transactionId = null;
      let penaltyAmt = 0;
      let discountAmt = 0;
      let remindersSent = 0;

      if (isClosed || mi < months.length - 3) {
        // Older bills: ~70% paid, ~15% overdue, ~10% waived, ~5% unpaid
        const roll = (ri * 7 + mi * 3) % 20;
        if (roll < 14) {
          status = "paid";
          paidAmount = baseAmt;
          paidAt = daysAgo(rand(1, 60));
          paymentMethod = PAYMENT_METHODS[ri % PAYMENT_METHODS.length];
          transactionId = `TXN${year}${String(month).padStart(2,"0")}${String(ri).padStart(4,"0")}`;
        } else if (roll < 17) {
          status = "overdue";
          penaltyAmt = 100;
          remindersSent = rand(1, 3);
        } else if (roll < 19) {
          status = "waived";
          discountAmt = baseAmt;
        } else {
          status = "unpaid";
          remindersSent = rand(0, 2);
        }
      } else {
        // Recent bills: ~40% paid, rest unpaid/overdue
        const roll = (ri * 5 + mi * 2) % 10;
        if (roll < 4) {
          status = "paid";
          paidAmount = baseAmt;
          paidAt = daysAgo(rand(1, 15));
          paymentMethod = PAYMENT_METHODS[ri % PAYMENT_METHODS.length];
          transactionId = `TXN${year}${String(month).padStart(2,"0")}${String(ri).padStart(4,"0")}`;
        } else {
          status = daysUntilDue < 0 ? "overdue" : "unpaid";
          penaltyAmt = status === "overdue" ? 100 : 0;
          remindersSent = status === "overdue" ? rand(1, 2) : 0;
        }
      }

      return {
        resident:      res._id,
        flat:          res.flat,
        wing:          res.wing,
        amount:        baseAmt,
        penalty:       penaltyAmt,
        discount:      discountAmt,
        totalDue:      Math.max(0, baseAmt + penaltyAmt - discountAmt),
        status,
        paidAmount,
        paidAt,
        paymentMethod,
        transactionId,
        receiptNote:   status === "paid" ? `Payment received for ${str}` : null,
        remindersSent,
        lastReminderAt: remindersSent > 0 ? daysAgo(rand(1, 7)) : null,
      };
    });

    await MaintenanceBill.create({
      society:        society._id,
      createdBy:      adminUser._id,
      title:          `${new Date(year, month - 1).toLocaleString("en-IN", { month: "long" })} ${year} — Monthly Maintenance`,
      description:    `Monthly maintenance charges for ${str} covering security, housekeeping, lift AMC, generator fuel, common area electricity, and garden upkeep.`,
      billMonth:      str,
      baseAmount:     baseAmt,
      dueDate,
      penaltyEnabled: true,
      penaltyAmount:  100,
      targetMode:     "all",
      isPublished,
      isClosed,
      payments,
    });
    log.ok(`Bill ${str}  [${isPublished?"published":"draft"} / ${isClosed?"closed":"open"} / ${baseAmt} base / ${payments.length} records]`);
  }

  // One special levy targeting a specific wing
  await MaintenanceBill.create({
    society:        society._id,
    createdBy:      adminUser._id,
    title:          "Wing B & C — Corridor Tile Replacement Levy",
    description:    "One-time special levy for corridor flooring replacement in Wings B and C. Work to be completed by July 2025.",
    billMonth:      "2025-06",
    baseAmount:     1500,
    dueDate:        daysFromNow(20),
    penaltyEnabled: false,
    penaltyAmount:  0,
    targetMode:     "specific",
    targetFlats:    residents.filter(r => r.wing === "B" || r.wing === "C").map(r => r.flat),
    isPublished:    true,
    isClosed:       false,
    payments:       residents
      .filter(r => r.wing === "B" || r.wing === "C")
      .map(res => ({
        resident: res._id, flat: res.flat, wing: res.wing,
        amount: 1500, penalty: 0, discount: 0, totalDue: 1500,
        status: "unpaid", paidAmount: 0, remindersSent: 0,
      })),
  });
  log.ok("Special levy bill created (Wings B & C only)");

  // One draft bill
  await MaintenanceBill.create({
    society:        society._id,
    createdBy:      adminUser._id,
    title:          "July 2025 — Monthly Maintenance (Draft)",
    description:    "Draft bill for July 2025. Will be published after committee review.",
    billMonth:      "2025-07",
    baseAmount:     3500,
    dueDate:        daysFromNow(35),
    penaltyEnabled: true,
    penaltyAmount:  100,
    targetMode:     "all",
    isPublished:    false,
    isClosed:       false,
    payments:       [],
  });
  log.ok("Draft bill created (July 2025)");

  // ══════════════════════════════════════════════════════════════════════════
  //  AMENITIES — 6
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 6 Amenities");

  const clubhouse = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Community Clubhouse", category: "Clubhouse",
    description: "Fully furnished clubhouse for gatherings, parties, and society functions. AC, projector, sound system, dining setup for 80 pax.",
    maxConcurrentBookings: 1, slotDurationOptions: [120, 240, 480], maxSlotDuration: 480,
    advanceBookingDays: 14, openTime: "08:00", closeTime: "22:00", closedDays: [],
    requiresApproval: true, depositAmount: 2000,
    rules: "No loud DJ music after 9 PM.\nOwner responsible for cleaning post-event.\nAlcohol not permitted in common areas.",
    isActive: true,
  });
  const gym = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Society Gym", category: "Gym",
    description: "Well-equipped gym — treadmills, cycle, weights, cable machine, yoga space. 5 concurrent users max.",
    maxConcurrentBookings: 5, slotDurationOptions: [60], maxSlotDuration: 90,
    advanceBookingDays: 3, openTime: "05:30", closeTime: "22:00", closedDays: [],
    requiresApproval: false, depositAmount: 0,
    rules: "Wear proper workout attire.\nClean equipment after use.\nNo food inside.",
    isActive: true,
  });
  const pool = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Swimming Pool", category: "Swimming Pool",
    description: "25m lap pool with separate kids section. Lifeguard on duty during peak hours.",
    maxConcurrentBookings: 15, slotDurationOptions: [60, 90], maxSlotDuration: 90,
    advanceBookingDays: 5, openTime: "06:00", closeTime: "20:00", closedDays: [1], // closed Mondays
    requiresApproval: false, depositAmount: 0,
    rules: "Swimming attire mandatory.\nChildren under 8 must be accompanied.\nNo glass items near pool.",
    isActive: true,
  });
  const badminton = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Badminton Court", category: "Badminton Court",
    description: "Synthetic-floored indoor badminton court. Shuttlecocks available at office.",
    maxConcurrentBookings: 2, slotDurationOptions: [60], maxSlotDuration: 60,
    advanceBookingDays: 7, openTime: "06:00", closeTime: "21:00", closedDays: [],
    requiresApproval: false, depositAmount: 0,
    rules: "Sports shoes mandatory.\nBring your own rackets.\nMax 2 sessions per resident per day.",
    isActive: true,
  });
  const partyHall = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Party Hall", category: "Party Hall",
    description: "Smaller indoor hall for birthday parties, kitty parties, and family functions. Capacity: 40 pax.",
    maxConcurrentBookings: 1, slotDurationOptions: [120, 180, 240], maxSlotDuration: 240,
    advanceBookingDays: 10, openTime: "09:00", closeTime: "21:00", closedDays: [],
    requiresApproval: true, depositAmount: 1000,
    rules: "Catering allowed with prior permission.\nDecorations to be removed by booker.\nNo outdoor music.",
    isActive: true,
  });
  const terrace = await Amenity.create({
    society: society._id, createdBy: adminUser._id,
    name: "Terrace Garden", category: "Terrace",
    description: "Rooftop garden with seating, lush plants, and city view. Perfect for morning yoga, small gatherings, evening walks.",
    maxConcurrentBookings: 10, slotDurationOptions: [60, 120], maxSlotDuration: 120,
    advanceBookingDays: 3, openTime: "05:00", closeTime: "21:00", closedDays: [],
    requiresApproval: false, depositAmount: 0,
    rules: "No littering.\nNo private decoration without permission.\nChildren must be supervised.",
    isActive: true,
  });
  const amenities = [clubhouse, gym, pool, badminton, partyHall, terrace];
  log.ok("6 amenities created (Clubhouse, Gym, Pool, Badminton, Party Hall, Terrace)");

  // ── Bookings — 480 ────────────────────────────────────────────────────────
  log.section("Seeding 480 Amenity Bookings");

  const BOOKING_STATUSES = ["confirmed","pending","cancelled","rejected","completed"];
  const BK_WEIGHTS       = [          40,       15,          20,        10,         15];
  const PURPOSES_BOOK = ["Morning workout","Evening session","Birthday party","Kitty party",
                          "Family gathering","Sports practice","Yoga session","Corporate event",
                          "Kids party","Anniversary dinner","Team meeting","Regular exercise"];
  const bookingsBulk = [];
  const amenityList  = [gym, gym, gym, pool, badminton, terrace, partyHall, clubhouse]; // weighted toward gym

  let bkStatusPool = [];
  BOOKING_STATUSES.forEach((s, idx) => { for (let w = 0; w < BK_WEIGHTS[idx]; w++) bkStatusPool.push(s); });

  for (let i = 0; i < 480; i++) {
    const amenity  = amenityList[i % amenityList.length];
    const resident = residents[i % residents.length];
    const status   = bkStatusPool[i % bkStatusPool.length];
    const isPast   = status === "completed" || status === "cancelled" || (status === "rejected");
    const daysOffset = isPast ? -rand(1, 90) : rand(1, 14);
    const base     = daysFromNow(daysOffset);
    const startH   = rand(6, 20);
    const startTime = atHour(base, startH);
    const dur      = pick(amenity.slotDurationOptions || [60]);
    const endTime  = new Date(startTime.getTime() + dur * 60000);

    bookingsBulk.push({
      amenity:         amenity._id,
      society:         society._id,
      bookedBy:        resident._id,
      startTime,
      endTime,
      durationMinutes: dur,
      purpose:         PURPOSES_BOOK[i % PURPOSES_BOOK.length],
      guestCount:      rand(1, 4),
      status,
      cancelledBy:     status === "cancelled" ? resident._id : undefined,
      cancelReason:    status === "cancelled" ? "Plans changed" : undefined,
      adminNote:       status === "rejected"  ? "Slot unavailable due to society event" : undefined,
      createdAt:       daysAgo(rand(0, 120)),
    });
  }
  await AmenityBooking.insertMany(bookingsBulk);
  log.ok("480 amenity bookings created");

  // ══════════════════════════════════════════════════════════════════════════
  //  EVENTS — 30 with RSVPs
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 30 Events");

  const eventsBulk = [];
  for (let i = 0; i < 30; i++) {
    const tmpl = EVENT_POOL[i % EVENT_POOL.length];
    const isPast  = i < 10;
    const isDraft = i >= 26;
    const isCancelled = i === 8 || i === 9;
    const baseDate = isPast ? daysAgo(rand(10, 180)) : daysFromNow(rand(5, 90));
    const startTime = atHour(baseDate, rand(9, 19));
    const endTime   = new Date(startTime.getTime() + rand(2, 6) * 3_600_000);

    const rsvpCount = tmpl.rsvp && !isDraft ? rand(10, Math.min(60, residents.length)) : 0;
    const rsvpers   = pickN(residents, rsvpCount);
    const RSVP_S    = ["going","going","going","maybe","not_going"]; // weighted going
    const rsvps     = rsvpers.map((r, ri) => ({
      resident: r._id,
      status:   RSVP_S[ri % RSVP_S.length],
      guestCount: rand(0, 2),
      note:     ri % 5 === 0 ? "Looking forward to it!" : null,
      respondedAt: daysAgo(rand(0, 7)),
    }));

    eventsBulk.push({
      society:      society._id,
      createdBy:    adminUser._id,
      title:        tmpl.title + (i >= EVENT_POOL.length ? ` (${Math.ceil(i / EVENT_POOL.length) + 1})` : ""),
      description:  tmpl.desc,
      category:     tmpl.cat,
      startTime,
      endTime,
      venue:        pick(["Community Hall","Society Ground","Clubhouse","Terrace Garden","Committee Room","Badminton Court","Society Entrance","Open Amphitheatre"]),
      rsvpEnabled:  tmpl.rsvp,
      rsvpDeadline: tmpl.rsvp ? new Date(startTime.getTime() - 2 * 86_400_000) : null,
      capacity:     tmpl.capacity,
      isPublished:  !isDraft,
      isCancelled,
      cancelReason: isCancelled ? "Cancelled due to unforeseen circumstances. Rescheduling soon." : null,
      reminderSent: isPast,
      rsvps,
      createdAt:    daysAgo(rand(5, 200)),
    });
  }
  await Event.insertMany(eventsBulk);
  log.ok("30 events created (10 past, 4 draft/cancelled, 16 upcoming)");

  // ══════════════════════════════════════════════════════════════════════════
  //  PARKING SLOTS — 240
  //  4W:60 + 2W:80 + EV:20 + Visitor:40 + Reserved:10 = 210 + extras = 240
  // ══════════════════════════════════════════════════════════════════════════
  log.section("Seeding 240 Parking Slots");

  const slotsBulk = [];
  const assignedResidents4W = residents.filter(r => r.wing !== "E" && r.wing !== "F").slice(0, 40);
  const assignedResidents2W = residents.slice(0, 50);

  // 4W slots (B-001 to B-060)
  for (let i = 1; i <= 60; i++) {
    const num = `B-${String(i).padStart(3,"0")}`;
    const zone = i <= 30 ? "Basement Level 1" : "Basement Level 2";
    const isAssigned = i <= 40;
    const res = isAssigned ? assignedResidents4W[i - 1] : null;
    slotsBulk.push({
      society: society._id, slotNumber: num, zone, type: "4W",
      status: isAssigned ? "assigned" : (i === 55 || i === 56 ? "blocked" : "available"),
      assignedTo:   res?._id   || null,
      assignedFlat: res?.flat  || null,
      vehicleNumber:res ? `GJ01${String.fromCharCode(65 + (i%26))}${String.fromCharCode(65 + ((i+3)%26))}${String(1000+i).slice(0,4)}` : null,
      assignedAt:   res ? daysAgo(rand(30, 365)) : null,
      assignedBy:   res ? adminUser._id : null,
      note:         (i === 55 || i === 56) ? "Blocked for plumbing work" : null,
    });
  }
  log.ok("60 × 4W slots (B-001…B-060)");

  // 2W slots (TW-001 to TW-080)
  for (let i = 1; i <= 80; i++) {
    const num = `TW-${String(i).padStart(3,"0")}`;
    const isAssigned = i <= 50;
    const res = isAssigned ? assignedResidents2W[i - 1] : null;
    slotsBulk.push({
      society: society._id, slotNumber: num, zone: "Open Parking Area",
      type: "2W", status: isAssigned ? "assigned" : "available",
      assignedTo:   res?._id   || null,
      assignedFlat: res?.flat  || null,
      vehicleNumber:res ? `GJ05${String.fromCharCode(65 + (i%26))}${String.fromCharCode(65 + ((i+2)%26))}${String(1000+i).slice(0,4)}` : null,
      assignedAt:   res ? daysAgo(rand(30, 365)) : null,
      assignedBy:   res ? adminUser._id : null,
    });
  }
  log.ok("80 × 2W slots (TW-001…TW-080)");

  // EV slots (EV-01 to EV-20)
  const evSlots = [];
  for (let i = 1; i <= 20; i++) {
    const num = `EV-${String(i).padStart(2,"0")}`;
    const isAssigned = i <= 10;
    const res = isAssigned ? residents[80 + i - 1] : null;
    const slotDoc = {
      society: society._id, slotNumber: num, zone: "Basement Level 1 — EV Zone",
      type: "EV", status: isAssigned ? "assigned" : "available",
      assignedTo:   res?._id   || null,
      assignedFlat: res?.flat  || null,
      vehicleNumber:res ? `GJ01EV${String(1000+i).slice(0,4)}` : null,
      assignedAt:   res ? daysAgo(rand(30, 200)) : null,
      assignedBy:   res ? adminUser._id : null,
      note: "7 kW AC EV Charging Point installed",
    };
    slotsBulk.push(slotDoc);
    evSlots.push(slotDoc);
  }
  log.ok("20 × EV slots (EV-01…EV-20)");

  // Visitor slots (VIS-01 to VIS-040)
  for (let i = 1; i <= 40; i++) {
    slotsBulk.push({
      society: society._id, slotNumber: `VIS-${String(i).padStart(2,"0")}`,
      zone: "Gate Entry — Visitor Parking", type: "Visitor", status: "available",
    });
  }
  log.ok("40 × Visitor slots (VIS-01…VIS-040)");

  // Reserved slots (RES-01 to RES-10)
  for (let i = 1; i <= 10; i++) {
    const res = residents[i - 1];
    slotsBulk.push({
      society: society._id, slotNumber: `RES-0${i}`,
      zone: "Basement Level 1 — Reserved",
      type: "Reserved", status: "assigned",
      assignedTo: i === 1 ? adminUser._id : res._id,
      assignedFlat: i === 1 ? adminUser.flat : res.flat,
      vehicleNumber: `GJ01AA${String(1000+i).slice(0,4)}`,
      assignedAt: daysAgo(rand(90, 365)),
      assignedBy: adminUser._id,
      note: i === 1 ? "Chairman reserved slot" : `Reserved for ${res.flat}`,
    });
  }
  log.ok("10 × Reserved slots (RES-01…RES-10)");

  // Additional 30 general slots
  for (let i = 1; i <= 30; i++) {
    slotsBulk.push({
      society: society._id, slotNumber: `G-${String(i).padStart(3,"0")}`,
      zone: "Ground Floor Open", type: i % 2 === 0 ? "4W" : "2W", status: "available",
    });
  }
  log.ok("30 × general open slots (G-001…G-030)");

  await ParkingSlot.insertMany(slotsBulk);
  log.ok(`Total ${slotsBulk.length} parking slots inserted`);

  // ── Parking Requests — 320 ────────────────────────────────────────────────
  log.section("Seeding 320 Parking Requests");

  const REQ_STATUSES = ["pending","approved","rejected","cancelled"];
  const REQ_WEIGHTS  = [30, 40, 15, 15];
  let reqStatusPool = [];
  REQ_STATUSES.forEach((s,i) => { for (let w=0; w < REQ_WEIGHTS[i]; w++) reqStatusPool.push(s); });

  const REQ_TYPES = ["4W","4W","4W","2W","2W","EV","Visitor"];
  const VEHICLE_DESCS = [
    ...VEHICLE_COLORS.flatMap(col => VEHICLE_4W.map(v => `${col} ${v}`)),
    ...VEHICLE_COLORS.flatMap(col => VEHICLE_2W.map(v => `${col} ${v}`)),
    ...VEHICLE_COLORS.slice(0,5).flatMap(col => VEHICLE_EV.map(v => `${col} ${v}`)),
  ];
  const requestsBulk = [];

  for (let i = 0; i < 320; i++) {
    const resident = residents[i % residents.length];
    const status   = reqStatusPool[i % reqStatusPool.length];
    const slotType = REQ_TYPES[i % REQ_TYPES.length];
    const vDesc    = VEHICLE_DESCS[(i * 7) % VEHICLE_DESCS.length];
    const vNum     = `GJ0${rand(1,9)}${String.fromCharCode(65+rand(0,25))}${String.fromCharCode(65+rand(0,25))}${String(1000+i).slice(0,4)}`;

    requestsBulk.push({
      society:            society._id,
      requestedBy:        resident._id,
      flat:               resident.flat,
      slotType,
      vehicleNumber:      vNum,
      vehicleDescription: vDesc,
      note:               i % 4 === 0 ? "Urgently needed — vehicle parked on road." : null,
      status,
      assignedSlot:       null,
      resolvedBy:         status !== "pending" ? adminUser._id : null,
      resolvedAt:         status !== "pending" ? daysAgo(rand(1, 60)) : null,
      adminNote: status === "rejected" ? "No slots of requested type currently available." :
                 status === "approved" ? "Slot assigned. Check All Slots for details." : null,
      createdAt: daysAgo(rand(1, 180)),
    });
  }
  await ParkingRequest.insertMany(requestsBulk);
  log.ok("320 parking requests created");

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const LINE = "─".repeat(78);
  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.green}║               ✅  LARGE SEED v3 COMPLETE                    ║${c.reset}`);
  console.log(`${c.bold}${c.green}╚══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}🏠  SOCIETY${c.reset}`);
  console.log(`    Name      : Sunrise Residency  (Ahmedabad, Gujarat)`);
  console.log(`    Join Code : ${c.bold}${c.yellow}${society.joinCode}${c.reset}  — share with new residents`);
  console.log(`    Join Mode : approval\n`);

  console.log(`${c.bold}👤  KEY CREDENTIALS${c.reset}`);
  console.log(LINE);
  console.log(` Role        │ Email                            │ Password        │ Flat`);
  console.log(LINE);
  console.log(` ${c.yellow}admin${c.reset}       │ admin@sunriseresidency.com       │ Admin@1234      │ A-101`);
  console.log(` ${c.cyan}resident${c.reset}    │ rahul.mehta@resident.com         │ Resident@1234   │ B-202`);
  console.log(` ${c.cyan}resident${c.reset}    │ priya.patel@resident.com         │ Resident@5678   │ C-303`);
  console.log(` ${c.cyan}resident${c.reset}    │ kiran.joshi@resident.com         │ Resident@9012   │ D-404`);
  console.log(` ${c.cyan}resident${c.reset}    │ deepak.nair@resident.com         │ Resident@1234   │ F-601`);
  console.log(` ${c.cyan}resident${c.reset}    │ sneha.reddy@resident.com         │ Resident@5678   │ E-502`);
  console.log(` ${c.cyan}resident${c.reset}    │ arjun.kapoor@resident.com        │ Resident@9012   │ A-205`);
  console.log(` ${c.cyan}resident${c.reset} ⏳  │ amit.desai@resident.com          │ Resident@0001   │ E-505 (pending)`);
  console.log(` ${c.magenta}vendor${c.reset}      │ security@quickfix.com            │ Vendor@1234     │ —`);
  console.log(`${LINE}\n`);

  console.log(`${c.bold}📦  FINAL COUNTS${c.reset}`);
  const rows = [
    ["Users",             "122",   "1 admin + 1 vendor + 120 residents + 1 pending"],
    ["Issues",            "420",   "All 8 categories × 3 statuses × 3 priorities"],
    ["Notices",           "72",    "3 pinned, 5 tags (Urgent/Finance/Event/Notice/Reminder)"],
    ["Polls",             "24",    "8 closed (with votes), 16 open"],
    ["Help Posts",        "180",   "40 closed, 140 open — replies with vendor contacts & upvotes"],
    ["Contacts",          "40",    "5 Emergency / 7 Committee / 13 Vendor / 15 Other"],
    ["Visitors",          "360",   "All 6 statuses: invited/pending/approved/rejected/exited/expired"],
    ["Maintenance Bills", "21",    "18 monthly (Jan 2024–Jun 2025) + wing levy + draft + 2160 payment records"],
    ["Amenities",         "6",     "Clubhouse, Gym, Pool, Badminton, Party Hall, Terrace Garden"],
    ["Bookings",          "480",   "All 5 statuses: confirmed/pending/cancelled/rejected/completed"],
    ["Events",            "30",    "10 past, 4 draft/cancelled, 16 upcoming — RSVPs from residents"],
    ["Parking Slots",     "240",   "60×4W + 80×2W + 20×EV + 40×Visitor + 10×Reserved + 30×General"],
    ["Parking Requests",  "320",   "All 4 statuses: pending/approved/rejected/cancelled"],
  ];
  rows.forEach(([label, count, detail]) => {
    console.log(`   ${label.padEnd(20)} ${c.bold}${String(count).padStart(4)}${c.reset}  ${c.gray}${detail}${c.reset}`);
  });

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