// Server-side Firebase Admin bootstrap — route handlers only.
//
// Importing "server-only" turns any accidental import from client code
// into a build error instead of a credential leak (Articles 1–2).
import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;

function app(): App {
  if (adminApp) return adminApp;

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (keyPath) {
    // Local development: explicit service-account JSON (gitignored).
    const abs = resolve(process.cwd(), keyPath);
    let serviceAccount: ServiceAccount;
    try {
      // turbopackIgnore keeps the credential file out of deploy-time tracing
      // (the path only exists at runtime; nothing here should be bundled).
      serviceAccount = JSON.parse(
        readFileSync(/* turbopackIgnore: true */ abs, "utf8"),
      ) as ServiceAccount;
    } catch {
      throw new Error(
        `Firebase Admin credentials unreadable at ${abs} — save your service-account JSON there or set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local.`,
      );
    }
    adminApp = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Deployed (Cloud Run, etc.): Application Default Credentials from the
    // runtime service account. No key file ever ships with the container —
    // the platform injects identity, Article 2 holds by construction.
    adminApp = getApps()[0] ?? initializeApp();
  }
  return adminApp;
}

/** Auth namespace — server-side code only. */
export function adminAuth(): Auth {
  return getAuth(app());
}

/** Firestore instance — server-side code only. */
export function adminDb(): Firestore {
  return getFirestore(app());
}
