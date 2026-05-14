let firebaseAdmin = null;
let firebaseAdminInitAttempted = false;
let firebaseAdminUnavailableLogged = false;

const hasServiceAccountEnv = () => {
  return (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
};

const normalizePrivateKey = (privateKey) => {
  return privateKey
    .replace(/\\n/g, "\n")
    .replace(/^"|"$/g, "")
    .trim();
};

const getFirebaseAdmin = () => {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  if (firebaseAdminInitAttempted) {
    return null;
  }

  firebaseAdminInitAttempted = true;

  try {
    // firebase-admin is optional during local development, so the server can boot
    // even before the dependency and env vars are configured.
    // eslint-disable-next-line global-require
    firebaseAdmin = require("firebase-admin");
  } catch (err) {
    if (!firebaseAdminUnavailableLogged) {
      firebaseAdminUnavailableLogged = true;
      console.warn(
        "firebase-admin is not installed. Push notifications will be disabled until the dependency is added.",
      );
    }
    return null;
  }

  if (firebaseAdmin.apps?.length) {
    return firebaseAdmin;
  }

  try {
    if (hasServiceAccountEnv()) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        }),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault(),
      });
    } else {
      if (!firebaseAdminUnavailableLogged) {
        firebaseAdminUnavailableLogged = true;
        console.warn(
          "Firebase Admin credentials are missing. Push notifications will be disabled until FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set or GOOGLE_APPLICATION_CREDENTIALS is configured.",
        );
      }
      return null;
    }

    return firebaseAdmin;
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err.message);
    return null;
  }
};

module.exports = {
  getFirebaseAdmin,
};
