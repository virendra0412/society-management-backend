const parkingService = require("../services/parking.service");
const { sendSuccess } = require("../utils/response");

class ParkingController {
  // ── Admin: Slot management ────────────────────────────────────────────────
  async createSlot(req, res) {
    const slot = await parkingService.createSlot(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Parking slot created.",
      data: { slot },
    });
  }

  async bulkCreateSlots(req, res) {
    const slots = await parkingService.bulkCreateSlots(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: `${slots.length} slot(s) created.`,
      data: { count: slots.length },
    });
  }

  async updateSlot(req, res) {
    const slot = await parkingService.updateSlot(req.params.slotId, req.body, req.user);
    return sendSuccess(res, { message: "Slot updated.", data: { slot } });
  }

  async releaseSlot(req, res) {
    const slot = await parkingService.releaseSlot(req.params.slotId, req.user, req.query.confirm);
    return sendSuccess(res, { message: "Slot released and is now available.", data: { slot } });
  }

  // ── Listing: Slots ────────────────────────────────────────────────────────
  async getAllSlots(req, res) {
    const slots = await parkingService.getAllSlots(req.societyId, req.query);
    return sendSuccess(res, { data: { slots } });
  }

  async getAvailabilitySummary(req, res) {
    const summary = await parkingService.getAvailabilitySummary(req.societyId);
    return sendSuccess(res, { data: { summary } });
  }

  async getSlotById(req, res) {
    const slot = await parkingService.getSlotById(req.params.slotId, req.societyId);
    return sendSuccess(res, { data: { slot } });
  }

  // ── Resident: Requests ────────────────────────────────────────────────────
  async submitRequest(req, res) {
    const request = await parkingService.submitRequest(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Parking request submitted. Admin will review it shortly.",
      data: { request },
    });
  }

  async cancelRequest(req, res) {
    const request = await parkingService.cancelRequest(req.params.requestId, req.user);
    return sendSuccess(res, { message: "Request cancelled.", data: { request } });
  }

  async getMyRequests(req, res) {
    const { requests, meta } = await parkingService.getMyRequests(req.user, req.query);
    return sendSuccess(res, { data: { requests }, meta });
  }

  // ── Admin: Manage requests ────────────────────────────────────────────────
  async getAllRequests(req, res) {
    const { requests, meta } = await parkingService.getAllRequests(req.societyId, req.query);
    return sendSuccess(res, { data: { requests }, meta });
  }

  async approveRequest(req, res) {
    const request = await parkingService.approveRequest(
      req.params.requestId,
      req.user,
      req.body.slotId || null
    );
    return sendSuccess(res, { message: "Request approved and slot assigned.", data: { request } });
  }

  async rejectRequest(req, res) {
    const request = await parkingService.rejectRequest(
      req.params.requestId,
      req.user,
      req.body.adminNote
    );
    return sendSuccess(res, { message: "Request rejected.", data: { request } });
  }

  async getRequestById(req, res) {
    const request = await parkingService.getRequestById(req.params.requestId, req.user);
    return sendSuccess(res, { data: { request } });
  }
}

module.exports = new ParkingController();
