const parkingRepository = require("../repositories/parking.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification } = require("../utils/notification");
const userRepository = require("../repositories/user.repository");

class ParkingService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ─── Admin: Slot CRUD ──────────────────────────────────────────────────────

  async createSlot(data, adminUser) {
    return parkingRepository.createSlot({
      ...data,
      society: this._getSocietyId(adminUser),
    });
  }

  /**
   * Bulk-create slots — admin can create many slots at once
   * e.g. { zone: "Basement", type: "4W", count: 20, prefix: "B" }
   * generates B-001 … B-020.
   */
  async bulkCreateSlots(data, adminUser) {
    const societyId = this._getSocietyId(adminUser);

    // ── Format 1 (mobile): { slots: [{slotNumber, type, zone?}] } ─────────────
    // The mobile app pre-generates slot numbers client-side and sends the full
    // array. Accept this format directly.
    if (Array.isArray(data.slots)) {
      const incoming = data.slots;
      if (!incoming.length) throw AppError.badRequest("Slots array is empty.");
      if (incoming.length > 200) throw AppError.badRequest("Maximum 200 slots per bulk operation.");

      const toInsert = incoming.map((s) => {
        if (!s.slotNumber || !s.type) {
          throw AppError.badRequest("Each slot must have slotNumber and type.");
        }
        return {
          society:    societyId,
          slotNumber: String(s.slotNumber).toUpperCase().trim(),
          zone:       s.zone || null,
          type:       s.type,
          status:     "available",
        };
      });

      try {
        const created = await parkingRepository.createManySlots(toInsert);
        const skipped = incoming.length - created.length;
        return { slots: created, skipped };
      } catch (err) {
        if (err.code === 11000 || err.name === "BulkWriteError" || err.name === "MongoBulkWriteError") {
          const inserted = err.result?.nInserted ?? err.insertedDocs?.length ?? 0;
          const skipped  = incoming.length - inserted;
          return {
            slots:   err.insertedDocs || [],
            skipped,
            message: `${inserted} slot(s) created, ${skipped} duplicate(s) skipped.`,
          };
        }
        throw err;
      }
    }

    // ── Format 2 (legacy web): { type, count, prefix?, startNumber?, zone? } ──
    const { zone, type, count, prefix, startNumber = 1 } = data;

    if (count < 1 || count > 200) {
      throw AppError.badRequest("Count must be between 1 and 200.");
    }

    const slots = Array.from({ length: count }, (_, i) => {
      const num = String(startNumber + i).padStart(3, "0");
      return {
        society:    societyId,
        slotNumber: prefix ? `${prefix.toUpperCase()}-${num}` : num,
        zone:       zone || null,
        type,
        status:     "available",
      };
    });

    try {
      return await parkingRepository.createManySlots(slots);
    } catch (err) {
      if (err.code === 11000 || err.name === "BulkWriteError" || err.name === "MongoBulkWriteError") {
        const inserted = err.result?.nInserted ?? err.insertedDocs?.length ?? 0;
        const skipped  = slots.length - inserted;
        return {
          slots:   err.insertedDocs || [],
          skipped,
          message: `${inserted} slot(s) created, ${skipped} duplicate(s) skipped.`,
        };
      }
      throw err;
    }
  }

  async updateSlot(slotId, updates, adminUser) {
    const slot = await parkingRepository.findSlotById(slotId);
    if (!slot) throw AppError.notFound("Parking slot not found.");
    if (slot.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    // Prevent changing type of an assigned slot without releasing first
    if (updates.type && slot.status === "assigned" && updates.type !== slot.type) {
      throw AppError.badRequest("Cannot change slot type while it is assigned. Release the slot first.");
    }
    return parkingRepository.updateSlot(slotId, updates);
  }

  async releaseSlot(slotId, adminUser) {
    const slot = await parkingRepository.findSlotById(slotId);
    if (!slot) throw AppError.notFound("Parking slot not found.");
    if (slot.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    if (slot.status !== "assigned") {
      throw AppError.badRequest("Slot is not currently assigned.");
    }
    return parkingRepository.releaseSlot(slotId);
  }

  // ─── Listing: Slots ────────────────────────────────────────────────────────

  async getAllSlots(societyId, query) {
    const filters = {};
    if (query.type)   filters.type   = query.type;
    if (query.status) filters.status = query.status;
    if (query.zone)   filters.zone   = query.zone;

    const slots = await parkingRepository.findSlotsBySociety(societyId, filters);
    return slots;
  }

  async getAvailabilitySummary(societyId) {
    return parkingRepository.getAvailabilityByType(societyId);
  }

  async getSlotById(slotId, societyId) {
    const slot = await parkingRepository.findSlotById(slotId);
    if (!slot || !slot.isActive) throw AppError.notFound("Slot not found.");
    if (slot.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    return slot;
  }

  // ─── Resident: Submit Parking Request ────────────────────────────────────

  async submitRequest(data, residentUser) {
    const societyId = this._getSocietyId(residentUser);

    // One pending request per type per resident
    const hasPending = await parkingRepository.hasPendingRequest(
      residentUser._id,
      data.slotType
    );
    if (hasPending) {
      throw AppError.conflict(
        `You already have a pending request for a ${data.slotType} slot.`,
        "DUPLICATE_REQUEST"
      );
    }

    return parkingRepository.createRequest({
      ...data,
      society:      societyId,
      requestedBy:  residentUser._id,
      flat:         residentUser.flat,
    });
  }

  async cancelRequest(requestId, residentUser) {
    const request = await parkingRepository.findRequestById(requestId);
    if (!request) throw AppError.notFound("Request not found.");
    if (request.requestedBy._id.toString() !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only cancel your own requests.");
    }
    if (request.status !== "pending") {
      throw AppError.badRequest(`Cannot cancel — request is already '${request.status}'.`);
    }
    return parkingRepository.updateRequest(requestId, { status: "cancelled" });
  }

  // ─── Admin: Approve Request → Assign Slot ─────────────────────────────────

  /**
   * Admin approves a parking request.
   * Two modes:
   *   a) slotId provided → assign that specific slot
   *   b) no slotId → auto-assign the first available slot of the right type
   *
   * Uses atomic findOneAndUpdate to prevent race conditions.
   */
  async approveRequest(requestId, adminUser, slotId = null) {
    const societyId = this._getSocietyId(adminUser);
    const request   = await parkingRepository.findRequestById(requestId);
    if (!request) throw AppError.notFound("Request not found.");
    if (request.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (request.status !== "pending") {
      throw AppError.badRequest(`Cannot approve — request is '${request.status}'.`);
    }

    let slot;

    if (slotId) {
      // Admin specified a slot — verify it's available
      slot = await parkingRepository.findSlotById(slotId);
      if (!slot) throw AppError.notFound("Parking slot not found.");
      if (slot.society.toString() !== societyId?.toString()) throw AppError.forbidden();
      if (slot.status !== "available") {
        throw AppError.conflict(
          `Slot ${slot.slotNumber} is not available (status: ${slot.status}).`,
          "SLOT_NOT_AVAILABLE"
        );
      }
      // Atomically mark as assigned to prevent double-assign
      slot = await parkingRepository.updateSlot(slotId, { status: "assigned" });
    } else {
      // Auto-assign: atomically grab the first available slot of requested type
      slot = await parkingRepository.findAndLockAvailableSlot(societyId, request.slotType);
      if (!slot) {
        throw AppError.conflict(
          `No ${request.slotType} slots are currently available.`,
          "NO_SLOT_AVAILABLE"
        );
      }
    }

    // Finalize slot assignment with full details
    await parkingRepository.updateSlot(slot._id, {
      assignedTo:    request.requestedBy._id,
      assignedFlat:  request.flat,
      vehicleNumber: request.vehicleNumber,
      assignedAt:    new Date(),
      assignedBy:    adminUser._id,
      note:          null,
    });

    // Update request to approved
    const updatedRequest = await parkingRepository.updateRequest(requestId, {
      status:      "approved",
      assignedSlot: slot._id,
      resolvedBy:  adminUser._id,
      resolvedAt:  new Date(),
    });

    // Notify resident
    const resident = await userRepository.findById(request.requestedBy._id);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "🚗 Parking Slot Assigned",
          body:  `Slot ${slot.slotNumber}${slot.zone ? ` (${slot.zone})` : ""} has been assigned to you.`,
        },
        { type: "parking_approved", requestId: request._id.toString(), slotNumber: slot.slotNumber }
      );
    }

    return updatedRequest;
  }

  async rejectRequest(requestId, adminUser, adminNote) {
    const societyId = this._getSocietyId(adminUser);
    const request   = await parkingRepository.findRequestById(requestId);
    if (!request) throw AppError.notFound("Request not found.");
    if (request.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (request.status !== "pending") {
      throw AppError.badRequest(`Cannot reject — request is '${request.status}'.`);
    }

    const updated = await parkingRepository.updateRequest(requestId, {
      status:     "rejected",
      resolvedBy: adminUser._id,
      resolvedAt: new Date(),
      adminNote:  adminNote || null,
    });

    // Notify resident
    const resident = await userRepository.findById(request.requestedBy._id);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "❌ Parking Request Rejected",
          body:  adminNote || "Your parking request could not be approved at this time.",
        },
        { type: "parking_rejected", requestId: request._id.toString() }
      );
    }

    return updated;
  }

  // ─── Listing: Requests ─────────────────────────────────────────────────────

  async getRequestById(requestId, requestingUser) {
    const societyId = this._getSocietyId(requestingUser);
    const request   = await parkingRepository.findRequestById(requestId);
    if (!request) throw AppError.notFound("Parking request not found.");
    if (request.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    // Residents may only view their own requests
    const isAdmin = requestingUser.role === "admin" ||
                    requestingUser.permissions?.parking === "full" ||
                    requestingUser.permissions?.parking === "read";
    if (!isAdmin && request.requestedBy.toString() !== requestingUser._id.toString()) {
      throw AppError.forbidden("Access denied.");
    }
    return request;
  }

  async getAllRequests(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status)   filters.status   = query.status;
    if (query.slotType) filters.slotType = query.slotType;

    const { requests, total } = await parkingRepository.findRequestsBySociety(
      societyId, filters, { skip, limit }
    );
    return { requests, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getMyRequests(residentUser, query) {
    const { page, limit, skip } = parsePagination(query);
    const { requests, total } = await parkingRepository.findRequestsByResident(
      residentUser._id, { skip, limit }
    );
    return { requests, meta: buildPaginationMeta({ total, page, limit }) };
  }
}

module.exports = new ParkingService();