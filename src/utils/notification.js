const logger = require("./logger");

/**
 * Send push notifications via Expo Push API.
 *
 * @param {string[]} tokens  - Array of Expo push tokens
 * @param {object}   notification - { title, body }
 * @param {object}   data    - Custom data payload. Always include societyId so the
 *                             client can auto-switch society context on tap.
 */
const sendPushNotification = async (tokens, notification, data = {}) => {
  const validTokens = (tokens || []).filter(Boolean);
  if (validTokens.length === 0) return;

  const messages = validTokens.map(to => ({
    to,
    title: notification.title,
    body:  notification.body,
    data,           // societyId must be included by callers for multi-society routing
    sound: "default",
    priority: "high",
  }));

  // Split into ≤100-token batches (Expo API limit)
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100)
    chunks.push(messages.slice(i, i + 100));

  // EDGE-03: run all batches in parallel with Promise.allSettled so:
  //   • every batch is attempted regardless of whether another fails
  //   • a single invalid token in one chunk doesn't swallow the rest
  const results = await Promise.allSettled(
    chunks.map((chunk, idx) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result?.data) {
            const failed = result.data.filter(r => r.status === "error");
            if (failed.length > 0) {
              logger.warn(`Expo push batch ${idx + 1}/${chunks.length}: ${failed.length} message(s) failed`, { failed });
            } else {
              logger.info(`Expo push batch ${idx + 1}/${chunks.length}: ${result.data.length} sent`);
            }
          }
        })
    )
  );

  // Log any batches that rejected at the network/parse level
  results.forEach((r, idx) => {
    if (r.status === "rejected") {
      logger.error(`Expo push batch ${idx + 1}/${chunks.length} failed:`, { error: r.reason?.message });
    }
  });
};

/**
 * Notify residents about a new notice.
 * Includes societyId in data payload so clients can auto-switch context on tap.
 */
const notifyNewNotice = (tokens, notice, societyId) =>
  sendPushNotification(
    tokens,
    {
      title: `📢 ${notice.tag}: ${notice.title}`,
      body:  notice.body.substring(0, 120) + (notice.body.length > 120 ? "…" : ""),
    },
    {
      type:      "notice",
      noticeId:  notice._id.toString(),
      societyId: societyId ? societyId.toString() : null,
    }
  );

/**
 * Notify about a visitor arrival.
 * societyId lets the client route the user to the correct society's visitor screen.
 */
const notifyVisitorArrival = (tokens, visitor, societyId) =>
  sendPushNotification(
    tokens,
    {
      title: "🔔 Visitor Arrived",
      body:  `${visitor.name} is at the gate.`,
    },
    {
      type:      "visitor_walkin",
      visitorId: visitor._id.toString(),
      societyId: societyId ? societyId.toString() : null,
    }
  );

/**
 * Generic society-scoped notification helper.
 * Use this for any new notification type — always pass societyId.
 */
const notifySociety = (tokens, { title, body, type, payload = {}, societyId }) =>
  sendPushNotification(
    tokens,
    { title, body },
    { type, societyId: societyId ? societyId.toString() : null, ...payload }
  );

module.exports = {
  sendPushNotification,
  notifyNewNotice,
  notifyVisitorArrival,
  notifySociety,
};