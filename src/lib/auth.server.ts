// Constitution Article 3 — identity comes from the verified ID token,
// nowhere else. Every API route authenticates through this module.
import "server-only";

import { adminAuth } from "./firebase.admin";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Verifies the caller's Firebase ID token and returns their uid.
 * Throws HttpError(401) for anything short of a valid, unrevoked token.
 * The returned uid is the only identity this API ever trusts — request
 * bodies, query params, and headers are treated as attacker-controlled.
 */
export async function requireUid(req: Request): Promise<string> {
  const match = BEARER.exec(req.headers.get("authorization") ?? "");
  if (!match) {
    throw new HttpError(401, "Sign-in required.");
  }
  try {
    const decoded = await adminAuth().verifyIdToken(match[1], /* checkRevoked */ true);
    if (!decoded.uid) throw new Error("verified token carried no uid");
    return decoded.uid;
  } catch (err) {
    // Reason codes only — never the token itself, never user content (Article 7).
    console.error("auth.verifyIdToken failed:", err instanceof Error ? err.message : err);
    throw new HttpError(401, "Invalid or expired session. Please sign in again.");
  }
}
