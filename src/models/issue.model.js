const mongoose = require("mongoose");

const CATEGORIES = ["Water", "Lift", "Security", "Garbage", "Electricity", "Noise", "Parking", "Other"];
const PRIORITIES  = ["Low", "Medium", "High"];
const STATUSES    = ["Open", "In Progress", "Resolved"];

const commentSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, "Comment too long"],
    },
    isAdminReply: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, _id: true }
);

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [5, "Title too short"],
      maxlength: [150, "Title too long"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description too long"],
    },
    category: {
      type: String,
      enum: { values: CATEGORIES, message: "Invalid category" },
      required: [true, "Category is required"],
    },
    priority: {
      type: String,
      enum: { values: PRIORITIES, message: "Invalid priority" },
      default: "Medium",
    },
    status: {
      type: String,
      enum: { values: STATUSES, message: "Invalid status" },
      default: "Open",
    },
    // URLs of uploaded photos (Cloudinary URLs set by upload endpoint)
    photos: {
      type: [String],
      validate: [arr => arr.length <= 5, "Maximum 5 photos allowed"],
      default: [],
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    flat: {
      type: String,
      trim: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    // Assign to a society member (admin / committee)
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ── NEW: Assign to an external vendor (name + phone, no User account needed)
    assignedVendor: {
      name: { type: String, trim: true, maxlength: [100, "Vendor name too long"], default: null },
      phone: { type: String, trim: true, match: [/^\+?[0-9\s\-()]{7,20}$/, "Invalid vendor phone"], default: null },
      note: { type: String, trim: true, maxlength: [500, "Note too long"], default: null },
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    isEscalated: {
      type: Boolean,
      default: false,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    comments: [commentSchema],
    // Stored counter — incremented by addComment so list queries never need to load all comments
    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
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

// ─── Indexes ──────────────────────────────────────────────────────────────────
issueSchema.index({ society: 1, status: 1, createdAt: -1 });
issueSchema.index({ society: 1, category: 1 });
issueSchema.index({ society: 1, isEscalated: 1 });

// ─── Middleware: Set resolvedAt timestamp ──────────────────────────────────────
issueSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === "Resolved" && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  next();
});

const Issue = mongoose.model("Issue", issueSchema);

module.exports = Issue;
module.exports.CATEGORIES = CATEGORIES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.STATUSES = STATUSES;