const Notice = require("../models/notice.model");

class NoticeRepository {
  async create(data) {
    return Notice.create(data);
  }

  /**
   * List notices for a society.
   * Pinned notices always sort to the top, then by createdAt desc.
   */
  async findBySociety(societyId, { skip, limit }, filters = {}) {
    const query = { society: societyId, isPublished: true, ...filters };
    const [notices, total] = await Promise.all([
      Notice.find(query)
        .populate("postedBy", "name role")
        .sort({ isPinned: -1, createdAt: -1 }) // pinned first
        .skip(skip)
        .limit(limit),
      Notice.countDocuments(query),
    ]);
    return { notices, total };
  }

  async findById(id) {
    return Notice.findById(id).populate("postedBy", "name role").exec();
  }

  // ── NEW: Edit notice fields ────────────────────────────────────────────────
  async updateById(noticeId, updates) {
    return Notice.findByIdAndUpdate(
      noticeId,
      updates,
      { new: true, runValidators: true }
    ).populate("postedBy", "name role").exec();
  }

  // ── NEW: Toggle pin status ─────────────────────────────────────────────────
  async setPinned(noticeId, isPinned) {
    return Notice.findByIdAndUpdate(
      noticeId,
      { isPinned },
      { new: true }
    ).exec();
  }

  // ── NEW: Soft-delete ───────────────────────────────────────────────────────
  async softDelete(noticeId) {
    return Notice.findByIdAndUpdate(
      noticeId,
      { isDeleted: true },
      { new: true }
    ).exec();
  }
}

module.exports = new NoticeRepository();