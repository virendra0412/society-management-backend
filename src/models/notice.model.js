const mongoose = require("mongoose");

const NOTICE_TAGS = ["Urgent", "Finance", "Event", "Notice", "Reminder"];

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [150, "Title too long"],
    },
    body: {
      type: String,
      required: [true, "Body is required"],
      trim: true,
      maxlength: [3000, "Notice body too long"],
    },
    tag: {
      type: String,
      enum: { values: NOTICE_TAGS, message: "Invalid tag" },
      default: "Notice",
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    publishAt: {
      type: Date,
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    // ── NEW: Pinned notices appear at the top for all residents ───────────────
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.isDeleted;
        return ret;
      },
    },
  }
);

noticeSchema.index({ society: 1, isPublished: 1, isPinned: -1, createdAt: -1 });

noticeSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

const Notice = mongoose.model("Notice", noticeSchema);
module.exports = Notice;
module.exports.NOTICE_TAGS = NOTICE_TAGS;
