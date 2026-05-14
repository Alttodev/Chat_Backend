# Firebase Web Push Setup

This repo now supports Firebase Cloud Messaging tokens on the backend.

## Backend

- Install `firebase-admin`
- Set one of these credential options:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - or `GOOGLE_APPLICATION_CREDENTIALS`
- Register a browser token with:
  - `POST /profile/push-tokens`
- Remove a token with:
  - `DELETE /profile/push-tokens`

## React app

Create `public/firebase-messaging-sw.js` with the template from the repo root.

Client-side flow:

1. Initialize Firebase using the same config used in the app.
2. Request notification permission.
3. Get an FCM token with the Web Push certificate key from Firebase.
4. Send that token to `POST /profile/push-tokens`.

Example client flow:

```js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyANwOW-5vk_yvMWKLa15CUCHV346VGW8FQ",
  authDomain: "chat-app-bc969.firebaseapp.com",
  projectId: "chat-app-bc969",
  storageBucket: "chat-app-bc969.firebasestorage.app",
  messagingSenderId: "437527172776",
  appId: "1:437527172776:web:99934872ffed1ef123949d",
  measurementId: "G-VDMGVJK3PR",
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export async function registerPushToken(authToken) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const token = await getToken(messaging, {
    vapidKey: "YOUR_FIREBASE_VAPID_KEY",
    serviceWorkerRegistration: await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    ),
  });

  if (!token) return null;

  await fetch("/profile/push-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token }),
  });

  return token;
}
```
