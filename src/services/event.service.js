const eventRepository = require("../repositories/event.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification } = require("../utils/notification");
const User = require("../models/user.model");

class EventService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ─── Admin: Event CRUD ─────────────────────────────────────────────────────

  /**
   * Normalize frontend field names → backend model fields.
   * The EventsScreen sends: eventDate, endDate, maxAttendees, isAllDay.
   * The model stores:       startTime, endTime, capacity, isAllDay.
   */
  _normalizePayload(data) {
    const out = { ...data };
    // eventDate → startTime
    if (out.eventDate !== undefined) {
      out.startTime = out.eventDate;
      delete out.eventDate;
    }
    // endDate → endTime
    if (out.endDate !== undefined) {
      out.endTime = out.endDate;
      delete out.endDate;
    }
    // maxAttendees → capacity
    if (out.maxAttendees !== undefined) {
      out.capacity = out.maxAttendees;
      delete out.maxAttendees;
    }
    // strip unknown fields the frontend may send that the model doesn't have
    delete out.rules;        // frontend sends rules; model uses description
    return out;
  }

  async createEvent(data, adminUser) {
    return eventRepository.create({
      ...this._normalizePayload(data),
      society:   this._getSocietyId(adminUser),
      createdBy: adminUser._id,
    });
  }

  async updateEvent(eventId, updates, adminUser) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw AppError.notFound("Event not found.");
    if (event.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    if (event.isCancelled) throw AppError.badRequest("Cannot edit a cancelled event.");

    const normalized = this._normalizePayload(updates);

    // Prevent changing startTime to the past
    if (normalized.startTime && new Date(normalized.startTime) <= new Date()) {
      throw AppError.badRequest("Event start time cannot be in the past.");
    }

    return eventRepository.updateById(eventId, normalized);
  }

  // ─── Admin: Publish event → notify all residents ───────────────────────────

  async publishEvent(eventId, adminUser) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw AppError.notFound("Event not found.");
    if (event.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    if (event.isPublished) throw AppError.badRequest("Event is already published.");
    if (event.isCancelled) throw AppError.badRequest("Cannot publish a cancelled event.");

    const updated = await eventRepository.updateById(eventId, { isPublished: true });

    // Push notification to all society members
    const societyId = this._getSocietyId(adminUser);
    const residents = await User.find({
      society:    societyId,
      isApproved: true,
      isActive:   true,
      fcmToken:   { $ne: null },
    }).select("fcmToken").lean();

    const tokens = residents.map(r => r.fcmToken).filter(Boolean);
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        {
          title: `🎉 New Event: ${event.title}`,
          body:  `${event.startTime.toLocaleDateString("en-IN")} · ${event.venue || "Society premises"}`,
        },
        { type: "new_event", eventId: event._id.toString() }
      );
    }

    return updated;
  }

  // ─── Admin: Cancel event ───────────────────────────────────────────────────

  async cancelEvent(eventId, adminUser, reason) {
    const event = await eventRepository.findByIdWithRsvps(eventId);
    if (!event) throw AppError.notFound("Event not found.");
    if (event.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    if (event.isCancelled) throw AppError.badRequest("Event is already cancelled.");

    const updated = await eventRepository.updateById(eventId, {
      isCancelled:  true,
      cancelReason: reason || null,
    });

    // Notify everyone who RSVPed "going" or "maybe"
    const interestedResidents = event.rsvps.filter(
      r => r.status === "going" || r.status === "maybe"
    );

    if (interestedResidents.length > 0) {
      const residentIds = interestedResidents.map(r => r.resident);
      const users = await User.find({
        _id:     { $in: residentIds },
        fcmToken: { $ne: null },
      }).select("fcmToken").lean();

      const tokens = users.map(u => u.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          {
            title: `❌ Event Cancelled: ${event.title}`,
            body:  reason || "The event has been cancelled.",
          },
          { type: "event_cancelled", eventId: event._id.toString() }
        );
      }
    }

    return updated;
  }

  // ─── Resident: RSVP ────────────────────────────────────────────────────────

  async rsvp(eventId, rsvpData, residentUser) {
    const societyId = this._getSocietyId(residentUser);
    const event     = await eventRepository.findById(eventId);

    if (!event) throw AppError.notFound("Event not found.");
    if (event.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (!event.isPublished) throw AppError.notFound("Event not found.");
    if (event.isCancelled) throw AppError.badRequest("Cannot RSVP to a cancelled event.");
    if (!event.rsvpEnabled) throw AppError.badRequest("RSVP is not enabled for this event.");

    if (event.rsvpDeadline && new Date() > event.rsvpDeadline) {
      throw AppError.badRequest("RSVP deadline has passed.");
    }
    if (new Date() > event.startTime) {
      throw AppError.badRequest("The event has already started.");
    }

    // ── Capacity check (only for "going" RSVPs) ──────────────────────────
    if (rsvpData.status === "going" && event.capacity !== null) {
      const currentHeadcount = await eventRepository.getGoingHeadcount(eventId);
      const existingRsvp = event.rsvps.find(
        r => r.resident.toString() === residentUser._id.toString()
      );
      // Credit back their current "going" slot if they're changing their RSVP
      const currentlyGoingSlots = (existingRsvp?.status === "going")
        ? 1 + (existingRsvp.guestCount || 0)
        : 0;

      const newHeadcount = currentHeadcount - currentlyGoingSlots
        + 1 + (rsvpData.guestCount || 0);

      if (newHeadcount > event.capacity) {
        throw AppError.conflict(
          `Event is at full capacity (${event.capacity} people). Cannot RSVP as going.`,
          "EVENT_FULL"
        );
      }
    }

    const updated = await eventRepository.upsertRsvp(
      eventId,
      residentUser._id,
      rsvpData
    );
    return updated;
  }

  async removeRsvp(eventId, residentUser) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw AppError.notFound("Event not found.");

    const societyId = this._getSocietyId(residentUser);
    if (event.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (new Date() > event.startTime) {
      throw AppError.badRequest("Cannot withdraw RSVP after the event has started.");
    }

    return eventRepository.removeRsvp(eventId, residentUser._id);
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  async getAllEvents(societyId, query, isAdmin = false) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};

    // Residents only see published, non-cancelled events by default
    if (!isAdmin) {
      filters.isPublished = true;
      filters.isCancelled = false;
    }
    if (query.category)               filters.category    = query.category;
    if (query.isCancelled !== undefined) filters.isCancelled = query.isCancelled === "true";
    if (query.upcoming === "true")    filters.startTime   = { $gte: new Date() };
    if (query.past     === "true")    filters.startTime   = { $lt:  new Date() };

    // Sort: the frontend sends sort=eventDate; map to the actual field startTime.
    // Support "-" prefix for descending (e.g. sort=-eventDate or sort=-startTime).
    const rawSort   = query.sort || "startTime";
    const descending = rawSort.startsWith("-");
    const sortKey    = rawSort.replace(/^-/, "");
    // Map frontend alias → real model field
    const SORT_MAP  = { eventDate: "startTime", endDate: "endTime", maxAttendees: "capacity" };
    const sortField = SORT_MAP[sortKey] || sortKey;
    const sortOrder = descending ? -1 : 1;

    const { events, total } = await eventRepository.findBySociety(
      societyId, filters, { skip, limit, sortField, sortOrder }
    );
    return { events, meta: buildPaginationMeta({ total, page, limit }) };
  }

  /**
   * Get single event.
   * Residents: see rsvpCounts virtual only.
   * Admin: sees full rsvp array with resident details.
   */
  async getEventById(eventId, requestingUser) {
    const isAdmin   = requestingUser.role === "admin";
    const societyId = this._getSocietyId(requestingUser);

    const event = isAdmin
      ? await eventRepository.findByIdWithRsvps(eventId)
      : await eventRepository.findById(eventId);

    if (!event) throw AppError.notFound("Event not found.");
    if (event.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (!isAdmin && (!event.isPublished || event.isCancelled)) {
      throw AppError.notFound("Event not found.");
    }

    if (!isAdmin) {
      // Residents: show their own RSVP entry + aggregate counts, not full list
      const myRsvp = event.rsvps.find(
        r => r.resident.toString() === requestingUser._id.toString()
      );
      const obj = event.toJSON();
      obj.myRsvp = myRsvp || null;
      obj.rsvps  = undefined; // strip full list
      return obj;
    }

    return event;
  }
}

module.exports = new EventService();
