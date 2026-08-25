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

  const keyPath = resolve(
    process.cwd(),
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "service-key.json",
  );

  let serviceAccount: ServiceAccount;
  try {
    // turbopackIgnore keeps the credential file out of deploy-time tracing
    // (the path only exists at runtime; nothing here should be bundled).
    serviceAccount = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ keyPath, "utf8"),
    ) as ServiceAccount;
  } catch {
    throw new Error(
      `Firebase Admin credentials unreadable at ${keyPath} — save your service-account JSON there or set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local.`,
    );
  }

  adminApp = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
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
