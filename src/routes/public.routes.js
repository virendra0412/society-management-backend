// routes/public.routes.js
//
// Unauthenticated endpoints called directly by the marketing website
// (society-management-website), not the mobile app. Kept in their own
// router/prefix so it's obvious at a glance which endpoints are reachable
// with no login and no society context.

const express = require("express");
const router = express.Router();

const { validate } = require("../middlewares/validate.middleware");
const { publicLimiter } = require("../middlewares/rateLimiter.middleware");
const { contactUs: contactUsValidator, demoRequest: demoRequestValidator } = require("../validators/public.validator");
const publicController = require("../controllers/public.controller");

// Extra rate limiting on top of the general API limiter — this route has
// no auth/session behind it, so it's the most spam-exposed endpoint in the app.
router.use(publicLimiter);

// POST /api/v1/public/contact — website "Contact Us" form
router.post("/contact", validate(contactUsValidator.submit), publicController.contactUs);

// POST /api/v1/public/demo — website "Request a Demo" form
router.post("/demo", validate(demoRequestValidator.submit), publicController.demoRequest);

module.exports = router;