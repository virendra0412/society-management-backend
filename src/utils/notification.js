const logger = require("./logger");

// Mask a push token for safe log output — shows prefix and last 6 chars only
// e.g. "ExponentPushToken[abc123]" → "ExponentPushToken[…3]" so you can
// cross-reference with Expo's dashboard without leaking the full token.
const _maskToken = (t) => {
  if (!t) return "(null)";
  if (t.length <= 10) return t;
  return t.slice(0, 20) + "…" + t.slice(-6);
};

/**
 * Send push notifications via Expo Push API.
 *
 * @param {string[]} tokens        - Array of Expo push tokens
 * @param {object}   notification  - { title, body }
 * @param {object}   data          - Custom payload — always include societyId
 */
const sendPushNotification = async (tokens, notification, data = {}) => {
  const validTokens = (tokens || []).filter(Boolean);

  // ── STEP 1: Token gate ───────────────────────────────────────────────────
  // If this fires for a visitor/notice/bill event but logs "0 valid tokens"
  // it means the user's fcmToken was never saved (registration failed on login,
  // or the field was not SELECTed with +fcmToken in the DB query).
  logger.info("[Push] sendPushNotification called", {
    totalTokensReceived: (tokens || []).length,
    validTokens:         validTokens.length,
    maskedTokens:        validTokens.map(_maskToken),
    notificationType:    data?.type || "(none)",
    title:               notification?.title,
  });

  if (validTokens.length === 0) {
    logger.warn("[Push] Aborted — no valid tokens. Check: (1) user logged in after NotificationProvider mounted, (2) +fcmToken selected in DB query, (3) permissions granted on device.");
    return;
  }

  const messages = validTokens.map(to => ({
    to,
    title:    notification.title,
    body:     notification.body,
    data,
    sound:    "default",
    priority: "high",
  }));

  // Split into ≤100-token batches (Expo API limit)
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100)
    chunks.push(messages.slice(i, i + 100));

  logger.info(`[Push] Sending ${messages.length} message(s) in ${chunks.length} batch(es) to Expo`);

  // ── STEP 2: Fire all batches ─────────────────────────────────────────────
  const results = await Promise.allSettled(
    chunks.map((chunk, idx) => {
      logger.info(`[Push] Batch ${idx + 1}/${chunks.length} — dispatching ${chunk.length} message(s)`);
      return fetch("https://exp.host/--/api/v2/push/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(chunk),
      })
        .then((res) => {
          // ── STEP 3: Raw HTTP response ──────────────────────────────────
          // Non-2xx here means Expo rejected the whole batch (bad auth, rate
          // limit, malformed JSON). Individual-token errors come in res.data[].
          logger.info(`[Push] Batch ${idx + 1} HTTP status: ${res.status}`);
          return res.json();
        })
        .then((result) => {
          // ── STEP 4: Per-token results from Expo ────────────────────────
          // result.data is an array — one entry per message in the batch.
          // status "ok" = delivered to FCM/APNs. status "error" = Expo
          // rejected the token (common: DeviceNotRegistered, InvalidCredentials).
          if (!result?.data) {
            logger.error("[Push] Unexpected Expo response — no .data field", { result });
            return;
          }
          const ok     = result.data.filter(r => r.status === "ok");
          const failed = result.data.filter(r => r.status === "error");
          logger.info(`[Push] Batch ${idx + 1} results — ok: ${ok.length}, failed: ${failed.length}`);
          if (failed.length > 0) {
            // Each failed entry has .details.error with a machine-readable code.
            // Most common codes and what they mean:
            //   DeviceNotRegistered  → token stale; user uninstalled app or revoked permission
            //   InvalidCredentials   → FCM server key wrong or google-services.json mismatch
            //   MessageTooBig        → payload > 4KB (unlikely here)
            logger.warn("[Push] Failed messages:", failed.map(f => ({
              token:   _maskToken(f.to),
              error:   f.details?.error,
              message: f.message,
            })));
          }
        });
    })
  );

  // ── STEP 5: Network / parse failures ──────────────────────────────────────
  // These fire when fetch() itself throws (no internet, DNS failure, etc.)
  results.forEach((r, idx) => {
    if (r.status === "rejected") {
      logger.error(`[Push] Batch ${idx + 1} network/parse failure`, { error: r.reason?.message });
    }
  });

  logger.info("[Push] sendPushNotification complete");
};

// ── Named helpers — each logs its own entry point so you can tell which
//    feature triggered the notification in logs ─────────────────────────────

const notifyNewNotice = (tokens, notice, societyId) => {
  logger.info("[Push] notifyNewNotice triggered", { societyId, noticeId: notice?._id?.toString() });
  return sendPushNotification(
    tokens,
    {
      title: `📢 ${notice.tag}: ${notice.title}`,
      body:  notice.body.substring(0, 120) + (notice.body.length > 120 ? "…" : ""),
    },
    { type: "notice", noticeId: notice._id.toString(), societyId: societyId?.toString() ?? null }
  );
};

const notifyVisitorArrival = (tokens, visitor, societyId) => {
  logger.info("[Push] notifyVisitorArrival triggered", {
    societyId,
    visitorId:   visitor?._id?.toString(),
    visitorName: visitor?.name,
    tokenCount:  (tokens || []).filter(Boolean).length,
  });
  return sendPushNotification(
    tokens,
    { title: "🔔 Visitor Arrived", body: `${visitor.name} is at the gate.` },
    { type: "visitor_walkin", visitorId: visitor._id.toString(), societyId: societyId?.toString() ?? null }
  );
};

const notifySociety = (tokens, { title, body, type, payload = {}, societyId }) => {
  logger.info("[Push] notifySociety triggered", { type, societyId, tokenCount: (tokens || []).filter(Boolean).length });
  return sendPushNotification(
    tokens,
    { title, body },
    { type, societyId: societyId?.toString() ?? null, ...payload }
  );
};

module.exports = {
  sendPushNotification,
  notifyNewNotice,
  notifyVisitorArrival,
  notifySociety,
};