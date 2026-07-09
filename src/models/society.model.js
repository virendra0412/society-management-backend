const mongoose = require("mongoose");
const crypto   = require("crypto");

// ─── Module catalogue (single source of truth) ────────────────────────────────
// Keys must match across: model, middleware, validator, frontend.
const MODULE_KEYS = Object.freeze([
  "notices",      // FREE — always on
  "polls",        // FREE — always on
  "contacts",     // FREE — always on
  "issues",       // ₹199/mo
  "visitors",     // ₹399/mo
  "maintenance",  // ₹499/mo
  "amenities",    // ₹249/mo
  "events",       // ₹199/mo
  "parking",      // ₹249/mo
  "community",    // ₹299/mo
  "analytics",    // ₹399/mo
  "multilang",    // ₹199/mo
]);

const FREE_MODULES  = Object.freeze(["notices", "polls", "contacts"]);
const PAID_MODULES  = Object.freeze(MODULE_KEYS.filter(k => !FREE_MODULES.includes(k)));

// Default prices — SA can negotiate custom amounts per society via moduleCharges
const DEFAULT_MODULE_PRICES = Object.freeze({
  issues:      199,
  visitors:    399,
  maintenance: 499,
  amenities:   249,
  events:      199,
  parking:     249,
  community:   299,
  analytics:   399,
  multilang:   199,
});

// Pre-defined bundles for reference (SA uses these during onboarding wizard)
const MODULE_BUNDLES = Object.freeze({
  starter: {
    label: "Starter Bundle",
    price: 599,
    modules: ["issues", "visitors"],
  },
  operations: {
    label: "Operations Bundle",
    price: 999,
    modules: ["issues", "visitors", "maintenance", "amenities"],
  },
  fullstack: {
    label: "Full Stack Bundle",
    price: 1799,
    modules: PAID_MODULES,
  },
});

// ─── enabledModules sub-schema ────────────────────────────────────────────────
const enabledModulesSchema = new mongoose.Schema(
  {
    // Free modules — always true, never charged
    notices:     { type: Boolean, default: true  },
    polls:       { type: Boolean, default: true  },
    contacts:    { type: Boolean, default: true  },
    // Paid modules — off by default, SA toggles on
    issues:      { type: Boolean, default: false },
    visitors:    { type: Boolean, default: false },
    maintenance: { type: Boolean, default: false },
    amenities:   { type: Boolean, default: false },
    events:      { type: Boolean, default: false },
    parking:     { type: Boolean, default: false },
    community:   { type: Boolean, default: false },
    analytics:   { type: Boolean, default: false },
    multilang:   { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── moduleCharges sub-schema (SA-negotiated prices) ─────────────────────────
const moduleChargesSchema = new mongoose.Schema(
  {
    issues:      { type: Number, default: DEFAULT_MODULE_PRICES.issues      },
    visitors:    { type: Number, default: DEFAULT_MODULE_PRICES.visitors    },
    maintenance: { type: Number, default: DEFAULT_MODULE_PRICES.maintenance },
    amenities:   { type: Number, default: DEFAULT_MODULE_PRICES.amenities   },
    events:      { type: Number, default: DEFAULT_MODULE_PRICES.events      },
    parking:     { type: Number, default: DEFAULT_MODULE_PRICES.parking     },
    community:   { type: Number, default: DEFAULT_MODULE_PRICES.community   },
    analytics:   { type: Number, default: DEFAULT_MODULE_PRICES.analytics   },
    multilang:   { type: Number, default: DEFAULT_MODULE_PRICES.multilang   },
  },
  { _id: false }
);

// ─── Payment Settings sub-schema (manual + gateway collection methods) ────────
// Lets each society choose which maintenance payment methods it accepts.
// Razorpay is intentionally left out of this sub-schema — that integration
// already lives in the separate subscription/payment module; this covers the
// "offline" methods most Indian societies actually use today.
const PAYMENT_METHOD_KEYS = Object.freeze(["cash", "bank_transfer", "upi_qr", "cheque"]);

const bankTransferDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, trim: true, maxlength: 150, default: null },
    accountNumber:     { type: String, trim: true, maxlength: 30,  default: null },
    ifscCode:          { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    bankName:          { type: String, trim: true, maxlength: 150, default: null },
    branchName:        { type: String, trim: true, maxlength: 150, default: null },
  },
  { _id: false }
);

const upiQrDetailsSchema = new mongoose.Schema(
  {
    upiId:           { type: String, trim: true, maxlength: 100, default: null }, // e.g. abcgreens@oksbi
    qrImageUrl:      { type: String, trim: true, default: null },
    qrImagePublicId: { type: String, trim: true, default: null }, // Cloudinary public_id, for cleanup on replace
  },
  { _id: false }
);

const paymentSettingsSchema = new mongoose.Schema(
  {
    // Which methods residents are offered when they open a bill to pay.
    // Admin toggles these on/off; UI should always keep at least one enabled.
    acceptedMethods: {
      type: [String],
      enum: PAYMENT_METHOD_KEYS,
      default: ["cash", "bank_transfer"],
    },
    bankTransfer:       { type: bankTransferDetailsSchema, default: () => ({}) },
    upiQr:              { type: upiQrDetailsSchema,        default: () => ({}) },
    chequeInstructions: { type: String, trim: true, maxlength: 500, default: null },
    cashInstructions:   { type: String, trim: true, maxlength: 500, default: null },
  },
  { _id: false }
);

// ─── Society Schema ───────────────────────────────────────────────────────────
const societySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Society name is required"],
      trim: true,
      maxlength: [120, "Society name too long"],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [300, "Address too long"],
    },
    city:  { type: String, trim: true },
    state: { type: String, trim: true },

    // Admin (chairman/secretary) who manages the society
    admin: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // Unique 8-char alphanumeric join code
    joinCode: {
      type:    String,
      unique:  true,
      uppercase: true,
    },
    joinMode: {
      type:    String,
      enum:    ["open", "approval"],
      default: "approval",
    },
    totalUnits: { type: Number, default: 0 },
    isActive:   { type: Boolean, default: true },

    // ── Maintenance payment collection settings ──────────────────────────────
    paymentSettings: {
      type:    paymentSettingsSchema,
      default: () => ({}),
    },

    // ── Super Admin fields ────────────────────────────────────────────────────
    approvalStatus: {
      type:    String,
      enum:    ["pending", "approved", "rejected"],
      default: "approved",
      index:   true,
    },
    application: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "SocietyApplication",
      default: null,
    },
    registeredBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "SuperAdmin",
      default: null,
    },

    // ── Module Management (Section 06) ────────────────────────────────────────
    // Which features this society has access to
    enabledModules: {
      type:    enabledModulesSchema,
      default: () => ({}),
    },
    // Negotiated per-module pricing (may differ from defaults)
    moduleCharges: {
      type:    moduleChargesSchema,
      default: () => ({}),
    },

    // ── Maintenance payment-verification sub-flag ────────────────────────────
    // Independent of enabledModules.maintenance. When maintenance is enabled,
    // residents/admins can always create, publish, and view bills. This flag
    // additionally gates only the payment-verification flow (submit proof,
    // admin verify/reject, pending-verifications queue) so SA can pause
    // verification without hiding bills. Meaningless while maintenance itself
    // is disabled, since the whole /maintenance router is blocked first.
    paymentVerificationEnabled: {
      type:    Boolean,
      default: true,
    },
    // Upgrade requests submitted by society admin, pending SA review
    upgradeRequests: [
      {
        module:      { type: String, enum: PAID_MODULES },
        requestedAt: { type: Date, default: () => new Date() },
        status:      { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        resolvedAt:  { type: Date, default: null },
        resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
        note:        { type: String, maxlength: 300, default: null },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Virtual: calculated monthly total for enabled paid modules ───────────────
societySchema.virtual("monthlyModuleTotal").get(function () {
  if (!this.enabledModules || !this.moduleCharges) return 0;
  return PAID_MODULES.reduce((sum, key) => {
    return sum + (this.enabledModules[key] ? (this.moduleCharges[key] || 0) : 0);
  }, 0);
});

// ─── Generate join code before first save ────────────────────────────────────
// crypto.randomBytes(4).toString("hex") always yields exactly 8 hex characters.
// This matches the UI's hard-coded maxLength={8} and length !== 8 guard in
// JoinSocietyModal (ProfileScreen.jsx). Keep both in sync if this ever changes.
societySchema.pre("validate", function (next) {
  if (this.isNew && !this.joinCode) {
    this.joinCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  next();
});

const Society = mongoose.model("Society", societySchema);
module.exports = {
  Society, MODULE_KEYS, FREE_MODULES, PAID_MODULES, DEFAULT_MODULE_PRICES, MODULE_BUNDLES,
  PAYMENT_METHOD_KEYS,
};