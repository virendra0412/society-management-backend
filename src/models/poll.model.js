const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Option label too long"],
    },
    votes: {
      type: Number,
      default: 0,
      min: 0,
    },
    // IDs of users who voted for this option — used for integrity checks
    voters: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      select: false, // Hidden from general responses; expose only to admin
    },
  },
  { _id: true }
);

const pollSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
      maxlength: [300, "Question too long"],
    },
    options: {
      type: [optionSchema],
      validate: [
        { validator: (v) => v.length >= 2, message: "At least 2 options required" },
        { validator: (v) => v.length <= 6, message: "Maximum 6 options allowed" },
      ],
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Automatic close date
    closesAt: {
      type: Date,
      default: null,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    // Allow residents to see who else voted (optional transparency)
    isAnonymous: {
      type: Boolean,
      default: true,
    },
    totalVotes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        // Strip voter arrays from response by default
        if (ret.options) {
          ret.options = ret.options.map(({ voters, ...rest }) => rest);
        }
        delete ret.__v;
        return ret;
      },
    },
  }
);

pollSchema.index({ society: 1, isClosed: 1, createdAt: -1 });

// Check if a user has already voted in this poll
pollSchema.methods.hasUserVoted = function (userId) {
  return this.options.some((opt) =>
    opt.voters.some((v) => v.toString() === userId.toString())
  );
};

// Close poll automatically if closesAt has passed
pollSchema.methods.checkAndClose = function () {
  if (this.closesAt && new Date() > this.closesAt && !this.isClosed) {
    this.isClosed = true;
    return this.save({ validateBeforeSave: false });
  }
};

const Poll = mongoose.model("Poll", pollSchema);
module.exports = Poll;
