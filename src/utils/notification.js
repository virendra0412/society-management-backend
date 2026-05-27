/**
 * Push Notification Utility — Firebase Cloud Messaging (FCM)
 *
 * Setup (one-time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → download JSON
 *   3. Copy the three values below into your .env:
 *        FIREBASE_PROJECT_ID=your-project-id
 *        FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
 *        FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *
 * Frontend (React Native / Web):
 *   1. Initialise Firebase in the app
 *   2. Call messaging().getToken() to get the device FCM token
 *   3. On login or app open, call PATCH /api/v1/users/fcm-token with { fcmToken }
 *   4. The backend stores the token and uses it when sending notifications
 *
 * If FIREBASE_* env vars are missing the module logs a warning and all
 * sendPushNotification() calls become silent no-ops — the app still runs.
 */

const logger = require("./logger");

// ─── Lazy-initialise Firebase Admin SDK ───────────────────────────────────────
let messaging = null;

function getMessaging() {
  if (messaging) return messaging;

  const { firebaseConfig } = require("../config/env");
  const { projectId, clientEmail, privateKey } = firebaseConfig;

  if (!projectId || !clientEmail || !privateKey) {
    // Credentials not configured — notifications are disabled
    return null;
  }

  try {
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          // Env vars escape \n as literal \\n — convert back
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
    }

    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    logger.warn("Firebase Admin init failed — push notifications disabled.", {
      error: err.message,
    });
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a push notification to a list of FCM tokens.
 * Silently skips if Firebase is not configured or token list is empty.
 *
 * @param {string[]} tokens       - Device FCM tokens to target
 * @param {object}   notification - { title: string, body: string }
 * @param {object}   data         - Optional key-value payload for the app (all strings)
 */
const sendPushNotification = async (tokens, notification, data = {}) => {
  const fcm = getMessaging();
  if (!fcm) return; // Firebase not configured — silent no-op

  const validTokens = (tokens || []).filter(Boolean);
  if (validTokens.length === 0) return;

  // Stringify all data values (FCM requirement)
  const stringData = {};
  Object.entries(data).forEach(([k, v]) => {
    stringData[k] = String(v);
  });

  try {
    // sendEachForMulticast handles up to 500 tokens per call
    const chunks = chunkArray(validTokens, 500);
    for (const chunk of chunks) {
      const response = await fcm.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: notification.title,
          body:  notification.body,
        },
        data: stringData,
        android: { priority: "high" },
        apns:    { payload: { aps: { sound: "default" } } },
      });

      if (response.failureCount > 0) {
        logger.warn(`FCM: ${response.failureCount}/${chunk.length} messages failed.`);
      } else {
        logger.info(`FCM: ${response.successCount} notifications sent.`);
      }
    }
  } catch (err) {
    // Never crash the request if notification sending fails
    logger.error("FCM sendEachForMulticast error:", { error: err.message });
  }
};

/**
 * Convenience: notify all members of a society about a new notice.
 *
 * @param {string[]} tokens  - FCM tokens of all society members
 * @param {object}   notice  - { title, body, tag, _id }
 */
const notifyNewNotice = (tokens, notice) =>
  sendPushNotification(
    tokens,
    {
      title: `📢 ${notice.tag}: ${notice.title}`,
      body:  notice.body.substring(0, 120) + (notice.body.length > 120 ? "…" : ""),
    },
    { type: "notice", noticeId: notice._id.toString() }
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

module.exports = { sendPushNotification, notifyNewNotice };
