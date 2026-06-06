const logger = require("./logger");

const sendPushNotification = async (tokens, notification, data = {}) => {
  const validTokens = (tokens || []).filter(Boolean);
  if (validTokens.length === 0) return;

  const messages = validTokens.map(to => ({
    to,
    title: notification.title,
    body:  notification.body,
    data,
    sound: "default",
    priority: "high",
  }));

  const chunks = [];
  for (let i = 0; i < messages.length; i += 100)
    chunks.push(messages.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      const result = await res.json();
      // Expo returns per-message status — log any failures
      if (result?.data) {
        const failed = result.data.filter(r => r.status === "error");
        if (failed.length > 0) {
          logger.warn(`Expo push: ${failed.length} message(s) failed`, { failed });
        } else {
          logger.info(`Expo push: ${result.data.length} notification(s) sent`);
        }
      }
    } catch (err) {
      logger.error("Expo push send failed:", { error: err.message });
    }
  }
};

const notifyNewNotice = (tokens, notice) =>
  sendPushNotification(
    tokens,
    {
      title: `📢 ${notice.tag}: ${notice.title}`,
      body:  notice.body.substring(0, 120) + (notice.body.length > 120 ? "…" : ""),
    },
    { type: "notice", noticeId: notice._id.toString() }
  );

module.exports = { sendPushNotification, notifyNewNotice };