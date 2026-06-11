const eventService = require("../services/event.service");
const { sendSuccess } = require("../utils/response");

class EventController {
  // ── Admin: Event management ───────────────────────────────────────────────
  async create(req, res) {
    const event = await eventService.createEvent(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Event created as draft. Publish it when ready.",
      data: { event },
    });
  }

  async update(req, res) {
    const event = await eventService.updateEvent(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Event updated.", data: { event } });
  }

  async publish(req, res) {
    const event = await eventService.publishEvent(req.params.id, req.user);
    return sendSuccess(res, { message: "Event published and residents notified.", data: { event } });
  }

  async cancel(req, res) {
    const event = await eventService.cancelEvent(req.params.id, req.user, req.body.reason);
    return sendSuccess(res, { message: "Event cancelled.", data: { event } });
  }

  // ── Listing ───────────────────────────────────────────────────────────────
  async getAll(req, res) {
    const isAdmin = req.role === "admin";
    const { events, meta } = await eventService.getAllEvents(req.societyId, req.query, isAdmin);
    return sendSuccess(res, { data: { events }, meta });
  }

  async getOne(req, res) {
    const event = await eventService.getEventById(req.params.id, req.user);
    return sendSuccess(res, { data: { event } });
  }

  // ── RSVP ──────────────────────────────────────────────────────────────────
  async rsvp(req, res) {
    const event = await eventService.rsvp(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "RSVP recorded.", data: { rsvpCounts: event.rsvpCounts } });
  }

  async removeRsvp(req, res) {
    await eventService.removeRsvp(req.params.id, req.user);
    return sendSuccess(res, { message: "RSVP removed." });
  }
}

module.exports = new EventController();