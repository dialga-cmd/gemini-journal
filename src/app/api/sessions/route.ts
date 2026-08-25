// DELETE /api/sessions?sid=… — permanently remove one conversation.
//
// Threat model (Article 0):
//   asset      — users' journal entries
//   adversary  — unauthenticated callers; deleting another uid's sessions
//   mitigation — Bearer ID token verified server-side → uid; the session
//                path is derived from that uid; the id is validated against
//                the session-id grammar; generic errors with content-free
//                logs (Articles 3–7)
import { HttpError, requireUid } from "@/lib/auth.server";
import { adminDb } from "@/lib/firebase.admin";
import { allowRequest } from "@/lib/rate-limit.server";

export const runtime = "nodejs";

const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export async function DELETE(req: Request): Promise<Response> {
  // ---- Article 3: authenticate -------------------------------------------
  let uid: string;
  try {
    uid = await requireUid(req);
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Sign-in required." }, { status: 401 });
  }

  if (!allowRequest(uid)) {
    return Response.json(
      { error: "Taking a breather. Try again in a minute." },
      { status: 429 },
    );
  }

  // ---- Article 5: validate ------------------------------------------------
  const sid = new URL(req.url).searchParams.get("sid") ?? "";
  if (!SESSION_ID_RE.test(sid)) {
    return Response.json({ error: "Malformed session id." }, { status: 400 });
  }

  try {
    // ---- Article 4: path derived from the verified uid only ---------------
    const sessionRef = adminDb().doc(`users/${uid}/sessions/${sid}`);
    const messagesRef = sessionRef.collection("messages");

    // Firestore document deletes do not cascade into subcollections, so the
    // messages go first. Bounded rounds so nothing can loop forever.
    for (let round = 0; round < 20; round++) {
      const snap = await messagesRef.limit(300).get();
      if (snap.empty) break;
      const batch = adminDb().batch();
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await sessionRef.delete();
    return Response.json({ ok: true });
  } catch (err) {
    // Article 7: generic message out, content-free details to server logs.
    console.error("DELETE /api/sessions failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
