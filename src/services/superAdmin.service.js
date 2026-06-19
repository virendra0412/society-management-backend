const crypto    = require("crypto");
const bcrypt    = require("bcryptjs");
const repo      = require("../repositories/superAdmin.repository");
const { Society, PAID_MODULES, FREE_MODULES, DEFAULT_MODULE_PRICES, MODULE_BUNDLES } = require("../models/society.model");
const User      = require("../models/user.model");
const { Subscription, PLAN_LIMITS } = require("../models/subscription.model");
const AppError  = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendSocietyApprovedEmail, sendApplicationRejectedEmail } = require("../utils/email");
const logger    = require("../utils/logger");
const {
  signSuperAdminAccessToken,
  signSuperAdminRefreshToken,
  verifySuperAdminRefreshToken,
} = require("../middlewares/superAdmin.middleware");

class SuperAdminService {

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async _issueTokenPair(sa) {
    const payload      = { superAdminId: sa._id.toString(), email: sa.email, role: "superadmin" };
    const accessToken  = signSuperAdminAccessToken(payload);
    const refreshToken = signSuperAdminRefreshToken({ superAdminId: sa._id.toString() });
    await repo.storeSARefreshTokenHash(sa._id, refreshToken);
    return { accessToken, refreshToken };
  }

  async login({ email, password }) {
    const sa = await repo.findSuperAdminByEmail(email);
    if (!sa || !sa.isActive) throw AppError.unauthorized("Invalid credentials.");
    if (sa.isLocked()) throw AppError.tooMany("Account temporarily locked. Try again in 15 minutes.");

    const isMatch = await sa.comparePassword(password);
    if (!isMatch) {
      await sa.incrementLoginAttempts();
      throw AppError.unauthorized("Invalid credentials.");
    }
    if (sa.loginAttempts > 0) await sa.resetLoginAttempts();

    sa.lastLoginAt = new Date();
    await sa.save({ validateBeforeSave: false });

    const tokens = await this._issueTokenPair(sa);
    return { superAdmin: await repo.findSuperAdminById(sa._id), ...tokens };
  }

  async refreshTokens(incomingToken) {
    const decoded = verifySuperAdminRefreshToken(incomingToken);
    const sa = await repo.getSAByRefreshTokenHash(incomingToken);
    if (!sa) {
      // Possible token reuse — clear all sessions
      if (decoded?.superAdminId) await repo.clearSARefreshToken(decoded.superAdminId);
      throw AppError.unauthorized("Invalid session. Please log in again.");
    }
    return this._issueTokenPair(sa);
  }

  async logout(superAdminId) {
    await repo.clearSARefreshToken(superAdminId);
  }

  async changePassword(superAdminId, { currentPassword, newPassword }) {
    const sa = await repo.findSuperAdminById(superAdminId, true);
    const ok = await sa.comparePassword(currentPassword);
    if (!ok) throw AppError.badRequest("Current password is incorrect.");
    sa.password = newPassword;
    sa.refreshTokenHash = null; // invalidate all sessions
    await sa.save();
    return { message: "Password updated. Please log in again." };
  }

  // ─── Society Applications ───────────────────────────────────────────────────

  async applyForSociety(data, applicantIp) {
    // Prevent duplicate pending applications for the same email
    const existing = await repo.findApplications({ adminEmail: data.adminEmail.toLowerCase(), status: "pending" });
    if (existing.total > 0) {
      throw AppError.conflict("A pending application already exists for this email address.", "DUPLICATE_APPLICATION");
    }
    return repo.createApplication({ ...data, applicantIp });
  }

  async listApplications(query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status) filters.status = query.status;
    const { applications, total } = await repo.findApplications(filters, { skip, limit });
    return { applications, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getApplication(id) {
    const app = await repo.findApplicationById(id);
    if (!app) throw AppError.notFound("Application not found.");
    return app;
  }

  /**
   * Approve an application:
   *   1. Create Society document.
   *   2. Create admin User document (temporary password, must change on first login).
   *   3. Create trial Subscription.
   *   4. Link Society → admin User.
   *   5. Update application → approved.
   */
  async approveApplication(applicationId, { note }, reviewingSuperAdmin) {
    const app = await repo.findApplicationById(applicationId);
    if (!app) throw AppError.notFound("Application not found.");
    if (app.status !== "pending") throw AppError.badRequest(`Application is already ${app.status}.`);

    // Check for email collision in User collection
    const emailTaken = await User.findOne({ email: app.adminEmail });
    if (emailTaken) {
      throw AppError.conflict(
        `A user with email ${app.adminEmail} already exists. Use a different admin email.`,
        "EMAIL_TAKEN"
      );
    }

    // 1. Create Society (isActive: true by default)
    // enabledModules defaults: free modules (notices/polls/contacts) are on,
    // paid modules are off. SA can toggle them via the module management wizard.
    const society = await Society.create({
      name:       app.societyName,
      address:    app.address,
      city:       app.city,
      state:      app.state,
      totalUnits: app.totalUnits,
      joinMode:   "approval",
      isActive:   true,
      enabledModules: {
        notices: true, polls: true, contacts: true,
        // all paid modules default to false (from schema defaults)
      },
      // admin will be set after user is created
      admin:      new (require("mongoose").Types.ObjectId)(), // temp placeholder
    });

    // 2. Create admin User
    const tempPassword = _generateTempPassword();
    const adminUser = await User.create({
      name:            app.adminName,
      email:           app.adminEmail,
      phone:           app.adminPhone,
      password:        tempPassword,
      mustChangePassword: true,  // TC-OB-008: Force password change on first login
      isActive:        true,
      activeSocietyId: society._id,
      memberships: [{
        society:    society._id,
        role:       "admin",
        flat:       "ADMIN",
        wing:       null,
        isApproved: true,
        isActive:   true,
      }],
    });

    // 3. Update society with real admin
    society.admin = adminUser._id;
    await society.save();

    // 4. Create trial subscription
    const subData = Subscription.buildTrial(society._id, reviewingSuperAdmin._id);
    await repo.createSubscription(subData);

    // 5. Update application
    await repo.updateApplication(applicationId, {
      status:     "approved",
      reviewedBy: reviewingSuperAdmin._id,
      reviewedAt: new Date(),
      reviewNote: note || null,
      society:    society._id,
      adminUser:  adminUser._id,
    });

    // 6. Email the new admin their login credentials — this is the automated
    // handoff that replaces manually relaying the temp password. If sending
    // fails, we don't roll back the approval (society/admin already exist) —
    // we just surface it so the superadmin can relay the password manually.
    let emailSent = false;
    try {
      await sendSocietyApprovedEmail({
        to:           adminUser.email,
        adminName:    adminUser.name,
        societyName:  society.name,
        tempPassword,
        loginUrl:     process.env.APP_LOGIN_URL,
      });
      emailSent = true;
    } catch (err) {
      logger.error("[SuperAdmin] Failed to send society-approved email", {
        applicationId,
        adminEmail: adminUser.email,
        error: err.message,
      });
    }

    return {
      society,
      adminUser: { _id: adminUser._id, name: adminUser.name, email: adminUser.email },
      // Exposed whenever the email failed to send (any env) so the temp
      // password isn't lost, and also in non-prod for convenience during testing.
      tempPassword: (!emailSent || process.env.NODE_ENV !== "production") ? tempPassword : undefined,
      emailSent,
      message: emailSent
        ? "Application approved. Society created and credentials emailed to the admin."
        : "Application approved. Society created, but the credentials email failed to send — share the temp password manually.",
    };
  }

  async rejectApplication(applicationId, { note }, reviewingSuperAdmin) {
    const app = await repo.findApplicationById(applicationId);
    if (!app) throw AppError.notFound("Application not found.");
    if (app.status !== "pending") throw AppError.badRequest(`Application is already ${app.status}.`);

    const updated = await repo.updateApplication(applicationId, {
      status:     "rejected",
      reviewedBy: reviewingSuperAdmin._id,
      reviewedAt: new Date(),
      reviewNote: note || null,
    });

    // Best-effort notification — rejection already happened, so a failed
    // email shouldn't fail the request, just gets logged.
    try {
      await sendApplicationRejectedEmail({
        to:          app.adminEmail,
        adminName:   app.adminName,
        societyName: app.societyName,
        note,
      });
    } catch (err) {
      logger.error("[SuperAdmin] Failed to send application-rejected email", {
        applicationId,
        adminEmail: app.adminEmail,
        error: err.message,
      });
    }

    return updated;
  }

  // ─── Society Management ─────────────────────────────────────────────────────

  async listSocieties(query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.isActive !== undefined) filters.isActive = query.isActive === "true";
    if (query.city)  filters.city  = new RegExp(query.city,  "i");
    if (query.state) filters.state = new RegExp(query.state, "i");

    const { societies, total } = await repo.findAllSocieties(filters, { skip, limit });

    // Attach subscription to each society. Guard against malformed subscription docs.
    const societyIds = societies.map((s) => s._id).filter((id) => id);
    const subs = await Subscription.find({ society: { $in: societyIds } }).lean();
    const subMap = subs.reduce((m, s) => {
      if (s?.society) {
        m[s.society.toString()] = s;
      }
      return m;
    }, {});

    // Compute per-society user counts via aggregation to provide accurate totals
    // even when the Society document itself doesn't store the derived count.
    const mongoose = require("mongoose");
    const sidObjs = societyIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    let countsMap = {};
    if (sidObjs.length > 0) {
      const userCountsAgg = await User.aggregate([
        { $match: { "memberships.society": { $in: sidObjs } } },
        { $unwind: "$memberships" },
        { $match: { "memberships.society": { $in: sidObjs } } },
        { $group: { _id: "$memberships.society", total: { $sum: 1 } } },
      ]);
      countsMap = userCountsAgg.reduce((m, r) => {
        if (r?._id) m[r._id.toString()] = r.total;
        return m;
      }, {});
    }

    const enriched = societies.map((soc) => ({
      ...soc.toJSON(),
      subscription: subMap[soc._id.toString()] || null,
      totalUsers: countsMap[soc._id.toString()] || 0,
    }));

    return { societies: enriched, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getSocietyDetail(societyId) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    const subscription = await repo.findSubscriptionBySociety(societyId);
    return { society, subscription };
  }

  async updateSubscription(societyId, updates, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const currentSub = await repo.findSubscriptionBySociety(societyId);
    if (!currentSub) throw AppError.notFound("No subscription found for this society.");

    const historyEntry = {
      action:     "updated",
      fromPlan:   currentSub.plan,
      toPlan:     updates.plan   || currentSub.plan,
      fromStatus: currentSub.status,
      toStatus:   updates.status || currentSub.status,
      note:       updates.note   || null,
      performedBy:  superAdmin._id,
      performedAt:  new Date(),
    };

    const { note, ...subFields } = updates;

    const updated = await repo.updateSubscription(societyId, {
      ...subFields,
      $push: { history: historyEntry },
    });
    return updated;
  }

  async suspendSociety(societyId, { reason }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    if (!society.isActive) throw AppError.badRequest("Society is already inactive.");

    await Society.findByIdAndUpdate(societyId, { isActive: false });

    // Suspend subscription
    await repo.updateSubscription(societyId, {
      status: "suspended",
      $push:  {
        history: {
          action: "suspended", fromStatus: "active", toStatus: "suspended",
          note: reason, performedBy: superAdmin._id, performedAt: new Date(),
        },
      },
    });

    return { message: "Society suspended." };
  }

  async reactivateSociety(societyId, { note }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    if (society.isActive) throw AppError.badRequest("Society is already active.");

    await Society.findByIdAndUpdate(societyId, { isActive: true });

    const sub = await repo.findSubscriptionBySociety(societyId);
    if (sub && sub.status === "suspended") {
      await repo.updateSubscription(societyId, {
        status: "active",
        $push:  {
          history: {
            action: "reactivated", fromStatus: "suspended", toStatus: "active",
            note: note || null, performedBy: superAdmin._id, performedAt: new Date(),
          },
        },
      });
    }

    return { message: "Society reactivated." };
  }

  /**
   * Transfer admin ownership to an existing approved resident/admin of the society.
   */
  async transferAdmin(societyId, { newAdminUserId, newAdminEmail, note }, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const newAdmin = newAdminUserId
      ? await User.findById(newAdminUserId)
      : await User.findOne({ email: newAdminEmail });
    if (!newAdmin) throw AppError.notFound("Target user not found.");
    const membership = newAdmin.getMembership(societyId);
    if (!membership) {
      throw AppError.badRequest("Target user does not belong to this society.");
    }
    if (!membership.isApproved || !newAdmin.isActive) {
      throw AppError.badRequest("Target user must be an active, approved member.");
    }

    const prevAdminId = society.admin;

    // Demote old admin → resident in their membership sub-doc
    await User.updateOne(
      { _id: prevAdminId, "memberships.society": societyId },
      { $set: { "memberships.$.role": "resident" } }
    );
    // Promote new admin in their membership sub-doc
    await User.updateOne(
      { _id: newAdmin._id, "memberships.society": societyId },
      { $set: { "memberships.$.role": "admin" } }
    );
    await Society.findByIdAndUpdate(societyId, { admin: newAdmin._id });

    return { message: `Admin ownership transferred to ${newAdmin.name}.` };
  }

  /**
   * Force-reset a society's admin password.
   * Auto-generates a secure temp password — no body required from the SA.
   * In production this should send the new password via email.
   */
  async resetAdminPassword(societyId, superAdmin) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    const adminUser = await User.findById(society.admin).select("+password");
    if (!adminUser) throw AppError.notFound("Society admin user not found.");

    const newPassword = _generateTempPassword();
    adminUser.password = newPassword;
    adminUser.refreshTokenHash = null; // invalidate existing sessions
    await adminUser.save();

    return {
      message: "Admin password reset. All existing sessions have been invalidated.",
      adminEmail: adminUser.email,
      tempPassword: process.env.NODE_ENV !== "production" ? newPassword : undefined,
    };
  }

  // ─── Analytics ──────────────────────────────────────────────────────────────

  async getSocietyAnalytics(societyId) {
    const society = await repo.findSocietyById(societyId);
    if (!society) throw AppError.notFound("Society not found.");
    const [analytics, subscription] = await Promise.all([
      repo.getSocietyAnalytics(society._id),
      repo.findSubscriptionBySociety(society._id),
    ]);
    return { society: { _id: society._id, name: society.name, city: society.city }, subscription, analytics };
  }


  // ─── Module Management (Section 06) ─────────────────────────────────────────

  /**
   * Get module status + monthly total for a society.
   * Includes upgrade requests (pending).
   */
  async getModules(societyId) {
    const society = await Society.findById(societyId, "enabledModules moduleCharges upgradeRequests name").lean();
    if (!society) throw AppError.notFound("Society not found.");

    const modules = {};
    const allKeys = [...FREE_MODULES, ...PAID_MODULES];
    for (const key of allKeys) {
      modules[key] = {
        enabled:  society.enabledModules?.[key] ?? FREE_MODULES.includes(key),
        isFree:   FREE_MODULES.includes(key),
        charge:   FREE_MODULES.includes(key) ? 0 : (society.moduleCharges?.[key] ?? DEFAULT_MODULE_PRICES[key] ?? 0),
      };
    }

    const monthlyTotal = PAID_MODULES.reduce((sum, key) => {
      return sum + (modules[key].enabled ? modules[key].charge : 0);
    }, 0);

    const pendingRequests = (society.upgradeRequests || []).filter(r => r.status === "pending");

    return { societyName: society.name, modules, monthlyTotal, pendingRequests, bundles: MODULE_BUNDLES };
  }

  /**
   * SA: toggle one or more modules for a society.
   * Accepts { modules: { visitors: true, maintenance: false, ... }, charges: { visitors: 350 } }
   */
  async updateModules(societyId, { modules: moduleUpdates, charges: chargeUpdates }, superAdmin) {
    const society = await Society.findById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    // Apply module toggles — validate keys, protect free modules
    if (moduleUpdates && typeof moduleUpdates === "object") {
      for (const [key, value] of Object.entries(moduleUpdates)) {
        if (!PAID_MODULES.includes(key)) {
          throw AppError.badRequest(`Module '${key}' is not a valid paid module or cannot be toggled.`);
        }
        society.enabledModules[key] = Boolean(value);

        // Auto-resolve any pending upgrade request for this module
        if (value === true) {
          const req = society.upgradeRequests?.find(r => r.module === key && r.status === "pending");
          if (req) {
            req.status     = "approved";
            req.resolvedAt = new Date();
            req.resolvedBy = superAdmin._id;
          }
        }
      }
    }

    // Apply custom charge overrides
    if (chargeUpdates && typeof chargeUpdates === "object") {
      for (const [key, value] of Object.entries(chargeUpdates)) {
        if (!PAID_MODULES.includes(key)) {
          throw AppError.badRequest(`Module '${key}' is not a valid paid module.`);
        }
        if (typeof value !== "number" || value < 0) {
          throw AppError.badRequest(`Invalid charge value for '${key}'.`);
        }
        society.moduleCharges[key] = value;
      }
    }

    await society.save();

    return {
      enabledModules: society.enabledModules,
      moduleCharges:  society.moduleCharges,
      monthlyTotal:   society.monthlyModuleTotal,
    };
  }

  /**
   * SA: apply a named bundle to a society (starter / operations / fullstack).
   * Disables modules not in the bundle unless they were already enabled.
   * Set replaceAll=true to reset all paid modules to exactly the bundle.
   */
  async applyBundle(societyId, { bundle, replaceAll = false }, superAdmin) {
    const bundleDef = MODULE_BUNDLES[bundle];
    if (!bundleDef) {
      throw AppError.badRequest(`Unknown bundle '${bundle}'. Valid options: ${Object.keys(MODULE_BUNDLES).join(", ")}.`);
    }

    const society = await Society.findById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    if (replaceAll) {
      // Reset all paid modules to false, then enable bundle modules
      for (const key of PAID_MODULES) {
        society.enabledModules[key] = bundleDef.modules.includes(key);
      }
    } else {
      // Additive: enable bundle modules without touching others
      for (const key of bundleDef.modules) {
        society.enabledModules[key] = true;
      }
    }

    await society.save();

    return {
      bundle:         bundleDef.label,
      enabledModules: society.enabledModules,
      monthlyTotal:   society.monthlyModuleTotal,
    };
  }

  // ─── Upgrade Requests (society-admin side) ───────────────────────────────────

  /**
   * Society admin requests an upgrade for a specific module.
   * Creates a pending upgradeRequest that SA can review.
   */
  async requestModuleUpgrade(societyId, moduleKey) {
    if (!PAID_MODULES.includes(moduleKey)) {
      throw AppError.badRequest(`'${moduleKey}' is not a valid upgradeable module.`);
    }

    const society = await Society.findById(societyId, "enabledModules upgradeRequests name");
    if (!society) throw AppError.notFound("Society not found.");

    if (society.enabledModules?.[moduleKey]) {
      throw AppError.badRequest(`Module '${moduleKey}' is already enabled.`);
    }

    // Check for an existing pending request for the same module
    const alreadyPending = society.upgradeRequests?.some(
      r => r.module === moduleKey && r.status === "pending"
    );
    if (alreadyPending) {
      throw AppError.conflict(`An upgrade request for '${moduleKey}' is already pending.`);
    }

    society.upgradeRequests.push({ module: moduleKey });
    await society.save();

    return { message: `Upgrade request for '${moduleKey}' submitted. Our team will review it shortly.` };
  }

  /**
   * SA: list all pending upgrade requests across all societies.
   */
  async listUpgradeRequests() {
    const societies = await Society.find(
      { "upgradeRequests.status": "pending" },
      "name city upgradeRequests"
    ).lean();

    const results = [];
    for (const soc of societies) {
      const pending = (soc.upgradeRequests || []).filter(r => r.status === "pending");
      for (const req of pending) {
        results.push({
          societyId:   soc._id,
          societyName: soc.name,
          city:        soc.city,
          module:      req.module,
          requestedAt: req.requestedAt,
          _reqId:      req._id,
        });
      }
    }
    return results;
  }

  async getGlobalAnalytics(period) {
    return repo.getGlobalAnalytics(period);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _generateTempPassword() {
  // 12-char alphanumeric + special: e.g. "Xk7#mN2@pLq9"
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${pwd}@1`; // ensure meets minlength + has special char
}

module.exports = new SuperAdminService();