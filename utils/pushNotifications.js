const User = require("../models/userCreate");
const { getFirebaseAdmin } = require("./firebaseAdmin");

const toStringValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const buildDataPayload = (data = {}) => {
  const payload = {};

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    payload[key] = toStringValue(value);
  });

  return payload;
};

const getRecipientPushTokens = (user) => {
  const tokens = user?.pushTokens || [];
  return [...new Set(tokens.map((entry) => entry?.token).filter(Boolean))];
};

const removeInvalidTokens = async (userId, invalidTokens) => {
  if (!invalidTokens.length) {
    return;
  }

  await User.updateOne(
    { _id: userId },
    {
      $pull: {
        pushTokens: {
          token: { $in: invalidTokens },
        },
      },
    },
  );
};

const sendPushToUser = async (userOrId, notification = {}) => {
  const admin = getFirebaseAdmin();
  if (!admin) {
    return {
      success: false,
      skipped: true,
      reason: "firebase-admin-not-ready",
    };
  }

  const hasPushFields =
    typeof userOrId === "object" &&
    userOrId?._id &&
    Array.isArray(userOrId.pushTokens) &&
    userOrId.pushNotification !== undefined;

  const user = hasPushFields
    ? userOrId
    : await User.findById(
        typeof userOrId === "object" ? userOrId._id : userOrId,
      ).select("userName pushTokens pushNotification");

  if (!user) {
    return { success: false, skipped: true, reason: "user-not-found" };
  }

  if (user.pushNotification?.enabled === false) {
    return { success: false, skipped: true, reason: "push-disabled" };
  }

  const tokens = getRecipientPushTokens(user);
  if (!tokens.length) {
    return { success: false, skipped: true, reason: "no-tokens" };
  }

  const title = notification.title || "New notification";
  const body = notification.body || "";
  const data = buildDataPayload(notification.data);

  const messaging = admin.messaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body,
    },
    data,
    webpush: {
      headers: {
        TTL: notification.ttl ? String(notification.ttl) : "2419200",
      },
      fcmOptions: notification.link
        ? {
            link: notification.link,
          }
        : undefined,
    },
  });



  response.responses.forEach((item, index) => {
    if (!item.success) {
      console.log("Failed Token:", tokens[index]);
      console.log("Error Code:", item.error?.code);
      console.log("Error Message:", item.error?.message);
    }
  });

  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (invalidTokens.length) {
    await removeInvalidTokens(user._id, invalidTokens);
  }

  return {
    success: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
};

module.exports = {
  sendPushToUser,
};
