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

/* Accepts the whole service-account JSON pasted as an env value: raw
   (single line or pretty), wrapped in quotes, or base64. Returns null when
   the value is not a credential (e.g. it is actually a file path). */
function tryParseCredential(value: string): ServiceAccount | null {
  const v = value.trim().replace(/^["']|["']$/g, "").trim();
  if (!v) return null;
  if (v.startsWith("{")) {
    try {
      return JSON.parse(v) as ServiceAccount;
    } catch {
      return null;
    }
  }
  // Base64 of a service-account JSON is long and has no path punctuation.
  if (v.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(v)) {
    try {
      return JSON.parse(Buffer.from(v, "base64").toString("utf8")) as ServiceAccount;
    } catch {
      return null;
    }
  }
  return null;
}

function loadServiceAccount(): ServiceAccount | null {
  // Priority: explicit JSON env (hosted deploys) → path env (local dev).
  // PATH is parsed forgivingly: paste JSON into it by mistake and it still
  // works, because a credential obviously is not a path.
  for (const candidate of [
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  ]) {
    const raw = candidate?.trim();
    if (!raw) continue;
    const parsed = tryParseCredential(raw);
    if (parsed) return parsed;
    try {
      const abs = resolve(process.cwd(), raw);
      // turbopackIgnore keeps the credential file out of deploy-time tracing
      // (the path only exists at runtime; nothing here should be bundled).
      return JSON.parse(
        readFileSync(/* turbopackIgnore: true */ abs, "utf8"),
      ) as ServiceAccount;
    } catch {
      // Try the next candidate; report at the end.
    }
  }
  return null;
}

function app(): App {
  if (adminApp) return adminApp;

  const serviceAccount = loadServiceAccount();

  if (serviceAccount) {
    adminApp = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  } else if (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ) {
    // A credential variable was set but unusable — fail loudly with the fix.
    throw new Error(
      "Firebase Admin credential env var is set but unreadable. Paste the WHOLE service-account JSON (one line) into FIREBASE_SERVICE_ACCOUNT_JSON, or point FIREBASE_SERVICE_ACCOUNT_PATH at the file.",
    );
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
