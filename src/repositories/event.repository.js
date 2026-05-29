const { Event } = require("../models/event.model");

const CREATOR_SELECT = "name role";
const RESIDENT_SELECT = "name flat wing";

class EventRepository {
  async create(data) {
    return Event.create(data);
  }

  async findById(id) {
    return Event.findById(id)
      .populate("createdBy", CREATOR_SELECT)
      .exec();
  }

  /**
   * findById but also populates the full rsvps.resident sub-docs.
   * Used by admin when viewing the full attendee list.
   */
  async findByIdWithRsvps(id) {
    return Event.findById(id)
      .populate("createdBy", CREATOR_SELECT)
      .populate("rsvps.resident", RESIDENT_SELECT)
      .exec();
  }

  async findBySociety(societyId, filters = {}, { skip, limit, sortField = "startTime", sortOrder = 1 }) {
    const query = { society: societyId, ...filters };
    const [events, total] = await Promise.all([
      Event.find(query)
        .populate("createdBy", CREATOR_SELECT)
        // BUG FIX: removed .select("-rsvps").
        // The event model has toJSON: { virtuals: true } and three virtuals
        // (goingCount, rsvpCounts, isRsvpOpen) that iterate this.rsvps.
        // When rsvps is excluded via projection, Mongoose leaves the field as
        // undefined (not []), causing TypeError → 500 on every non-empty result.
        // Including rsvps is safe — the list is paginated and we strip the full
        // array from the JSON response via the toJSON transform below if needed.
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit),
      Event.countDocuments(query),
    ]);
    return { events, total };
  }

  async updateById(id, updates) {
    return Event.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", CREATOR_SELECT)
      .exec();
  }

  // ─── RSVP ─────────────────────────────────────────────────────────────────

  /**
   * Upsert an RSVP for a resident.
   * If they already RSVPed → update their existing entry.
   * If not → push a new entry.
   */
  async upsertRsvp(eventId, residentId, rsvpData) {
    // Try to update existing RSVP entry first
    const updated = await Event.findOneAndUpdate(
      { _id: eventId, "rsvps.resident": residentId },
      {
        $set: {
          "rsvps.$.status":      rsvpData.status,
          "rsvps.$.guestCount":  rsvpData.guestCount ?? 0,
          "rsvps.$.note":        rsvpData.note ?? null,
          "rsvps.$.respondedAt": new Date(),
        },
      },
      { new: true }
    ).exec();

    if (updated) return updated;

    // No existing entry → push a new one
    return Event.findByIdAndUpdate(
      eventId,
      {
        $push: {
          rsvps: {
            resident:    residentId,
            status:      rsvpData.status,
            guestCount:  rsvpData.guestCount ?? 0,
            note:        rsvpData.note ?? null,
            respondedAt: new Date(),
          },
        },
      },
      { new: true }
    ).exec();
  }

  /**
   * Remove a resident's RSVP entry entirely.
   */
  async removeRsvp(eventId, residentId) {
    return Event.findByIdAndUpdate(
      eventId,
      { $pull: { rsvps: { resident: residentId } } },
      { new: true }
    ).exec();
  }

  /**
   * Count total "going" headcount (resident + their guests).
   * Used to enforce capacity limits.
   */
  async getGoingHeadcount(eventId) {
    const result = await Event.aggregate([
      { $match: { _id: eventId } },
      { $unwind: "$rsvps" },
      { $match: { "rsvps.status": "going" } },
      {
        $group: {
          _id: null,
          headcount: { $sum: { $add: [1, "$rsvps.guestCount"] } },
        },
      },
    ]);
    return result[0]?.headcount ?? 0;
  }

  // ─── Cron Job Queries ──────────────────────────────────────────────────────

  /**
   * Find upcoming events starting within the next 24–25 hours
   * for which a reminder has not yet been sent.
   */
  async findEventsNeedingReminder() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    return Event.find({
      isPublished:   true,
      isCancelled:   false,
      reminderSent:  false,
      startTime:     { $gte: in24h, $lte: in25h },
    })
      .select("title startTime venue society rsvps")
      .populate("society", "name")
      .lean()
      .exec();
  }

  async markReminderSent(eventIds) {
    return Event.updateMany(
      { _id: { $in: eventIds } },
      { $set: { reminderSent: true } }
    ).exec();
  }
}

module.exports = new EventRepository();
