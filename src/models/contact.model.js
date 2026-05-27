const mongoose = require("mongoose");

const CONTACT_GROUPS = ["Emergency", "Committee", "Vendor", "Other"];

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name too long"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
      match: [/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number format"],
    },
    group: {
      type: String,
      enum: { values: CONTACT_GROUPS, message: "Invalid group" },
      required: [true, "Group is required"],
    },
    designation: {
      type: String,
      trim: true,
      maxlength: [80, "Designation too long"],
      default: null,
    },
    icon: {
      type: String,
      default: "📞",
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Display order within its group
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

contactSchema.index({ society: 1, group: 1, sortOrder: 1 });

const Contact = mongoose.model("Contact", contactSchema);
module.exports = Contact;
module.exports.CONTACT_GROUPS = CONTACT_GROUPS;
