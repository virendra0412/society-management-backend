const Contact = require("../models/contact.model");

class ContactRepository {
  async findBySociety(societyId) {
    return Contact.find({ society: societyId, isActive: true })
      .sort({ group: 1, sortOrder: 1, name: 1 })
      .exec();
  }

  async findById(id) {
    return Contact.findById(id).exec();
  }

  async create(data) {
    return Contact.create(data);
  }

  // ── NEW: Update contact fields ─────────────────────────────────────────────
  async updateById(id, updates) {
    return Contact.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).exec();
  }

  // ── NEW: Soft-delete (set isActive = false) ────────────────────────────────
  async deleteById(id) {
    return Contact.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).exec();
  }
}

module.exports = new ContactRepository();
