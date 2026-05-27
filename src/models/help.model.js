const mongoose = require("mongoose");

const HELP_CATEGORIES = ["Plumber", "Electrician", "Maid", "Carpenter", "Food", "Transport", "Tutor", "Other"];

const replySchema = new mongoose.Schema(
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
      maxlength: [1000, "Reply too long"],
    },
    // Residents can upvote helpful replies
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Mark as vendor recommendation
    isVendorContact: {
      type: Boolean,
      default: false,
    },
    vendorPhone: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true, _id: true }
);

const helpSchema = new mongoose.Schema(
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
      maxlength: [1500, "Description too long"],
    },
    category: {
      type: String,
      enum: { values: HELP_CATEGORIES, message: "Invalid category" },
      required: [true, "Category is required"],
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    flat: {
      type: String,
      trim: true,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    replies: [replySchema],
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

helpSchema.index({ society: 1, category: 1, createdAt: -1 });
helpSchema.index({ society: 1, isClosed: 1 });

helpSchema.virtual("replyCount").get(function () {
  return this.replies?.length ?? 0;
});

const Help = mongoose.model("Help", helpSchema);
module.exports = Help;
module.exports.HELP_CATEGORIES = HELP_CATEGORIES;
  