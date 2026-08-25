// Browser-side Firebase bootstrap.
//
// Only NEXT_PUBLIC_ values are referenced here — those are public by
// design (Constitution Article 1/2); real protection comes from
// firestore.rules and authorized domains, never from config secrecy.
//
// GOTCHA (cost us a debugging session): env vars must be read as static
// member expressions (`process.env.NEXT_PUBLIC_X`). Destructuring
// `const { NEXT_PUBLIC_X } = process.env` defeats compile-time inlining
// and silently leaves every value undefined in the browser bundle —
// which surfaces downstream as `auth/invalid-api-key`.
import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

let cached: { auth: Auth; db: Firestore } | null = null;

export function firebaseClient(): { auth: Auth; db: Firestore } {
  if (cached) return cached;

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Firebase web config missing — copy .env.local.example to .env.local, fill in the NEXT_PUBLIC_* values, and restart the dev server.",
    );
  }

  const app = getApps()[0] ?? initializeApp(config);
  cached = { auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
