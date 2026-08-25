// POST /api/chat — one authenticated turn of the journaling conversation,
// streamed token-by-token to the client as NDJSON.
//
// Threat model (Article 0):
//   asset      — users' journal entries; Gemini quota/money
//   adversary  — unauthenticated callers; signed-in users reaching another
//                uid's data; identity spoofing via request bodies
//   vectors    — forged/absent/stale bearer tokens; oversized payloads;
//                hammering the endpoint to burn free-tier quota
//   mitigation — Bearer ID token verified server-side → uid (never taken
//                from the body); every Firestore path derived from that uid;
//                payload shape + size validation; per-uid rate limit;
//                generic errors with content-free logs (Articles 3–7)
//
// Wire format (application/x-ndjson, one JSON object per line):
//   {"sid":"…"}        session id, sent immediately
//   {"t":"delta"}      one streamed text delta from Gemini
//   {"error":"msg"}    failure (client keeps any partial reply it received)
//   {"done":true}      terminal marker after persistence
//
// Persistence stays all-or-nothing per turn: both messages and the session
// update commit in one batch AFTER generation finishes. If the stream dies
// mid-reply, whatever Gemini produced is persisted — the record never shows
// a user entry without its (possibly partial) assistant reply.
import { FieldValue } from "firebase-admin/firestore";

import { HttpError, requireUid } from "@/lib/auth.server";
import { adminDb } from "@/lib/firebase.admin";
import { JOURNAL_SYSTEM_PROMPT, geminiClient, geminiModel } from "@/lib/gemini.server";
import { allowRequest } from "@/lib/rate-limit.server";

// firebase-admin requires Node APIs — never run this route on the edge runtime.
export const runtime = "nodejs";

// The route verifies a token, reads history, and streams a Gemini
// generation. Hosted platforms default to ~10s function limits, which a
// cold start plus model latency can exceed; claim the headroom explicitly.
export const maxDuration = 60;

const MAX_INPUT_CHARS = 8_000;
const MAX_REPLY_CHARS = 20_000;
const HISTORY_TURNS = 24;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

type Turn = { role: "user" | "model"; text: string };

function fail(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  // ---- Article 3: authenticate before touching anything ------------------
  let uid: string;
  try {
    uid = await requireUid(req);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message);
    return fail(401, "Sign-in required.");
  }

  if (!allowRequest(uid)) {
    return fail(429, "Taking a breather. Try again in a minute.");
  }

  // ---- Article 5: validate shape and size at the boundary ----------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid request body.");
  }
  if (body === null || typeof body !== "object") {
    return fail(400, "Invalid request body.");
  }
  const { sessionId, message } = body as Record<string, unknown>;

  if (typeof message !== "string" || !message.trim()) {
    return fail(400, "Write something first.");
  }
  const text = message.trim();
  if (text.length > MAX_INPUT_CHARS) {
    return fail(400, `Entry too long — keep it under ${MAX_INPUT_CHARS} characters.`);
  }
  if (
    sessionId !== undefined &&
    (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId))
  ) {
    return fail(400, "Malformed session id.");
  }
  const sid = sessionId ?? crypto.randomUUID();

  try {
    // ---- Article 4: every path below is scoped by the VERIFIED uid -------
    // (The Admin SDK skips firestore.rules, so isolation lives right here.)
    const sessionRef = adminDb().doc(`users/${uid}/sessions/${sid}`);
    const messagesRef = sessionRef.collection("messages");

    const historySnap = await messagesRef
      .orderBy("createdAt", "asc")
      .limitToLast(HISTORY_TURNS)
      .get();
    const history: Turn[] = [];
    historySnap.forEach((doc) => {
      const value = doc.data();
      if (
        (value.role === "user" || value.role === "model") &&
        typeof value.text === "string" &&
        value.text.length > 0
      ) {
        history.push({ role: value.role, text: value.text });
      }
    });

    // ---- Multi-turn Gemini call, streamed --------------------------------
    const contents = [
      ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: "user", parts: [{ text }] },
    ];

    const ai = geminiClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        send({ sid });
        let full = "";

        try {
          const geminiStream = await ai.models.generateContentStream({
            model: geminiModel(),
            contents,
            config: {
              systemInstruction: JOURNAL_SYSTEM_PROMPT,
              temperature: 0.8,
              maxOutputTokens: 2048,
            },
          });
          for await (const chunk of geminiStream) {
            const delta = chunk.text;
            if (delta) {
              full += delta;
              send({ t: delta });
            }
          }
        } catch (err) {
          // Content-free log only (Article 7).
          console.error("gemini stream failed:", err instanceof Error ? err.message : err);
          if (!full.trim()) {
            send({ error: "The journaling assistant is unavailable right now. Try again shortly." });
            controller.close();
            return;
          }
          send({ error: "The assistant stopped mid-reply. What you see is saved." });
        }

        if (full.trim() && full.length <= MAX_REPLY_CHARS) {
          try {
            const sessionDoc = await sessionRef.get();
            const isNewSession = !sessionDoc.exists;

            const batch = adminDb().batch();
            batch.set(messagesRef.doc(), {
              role: "user",
              text,
              createdAt: FieldValue.serverTimestamp(),
            });
            batch.set(messagesRef.doc(), {
              role: "model",
              text: full,
              createdAt: FieldValue.serverTimestamp(),
            });
            batch.set(
              sessionRef,
              {
                ...(isNewSession
                  ? { title: text.slice(0, 80), summary: "", createdAt: FieldValue.serverTimestamp() }
                  : {}),
                updatedAt: FieldValue.serverTimestamp(),
                messageCount: FieldValue.increment(2),
              },
              { merge: true },
            );
            await batch.commit();
          } catch (err) {
            console.error("/api/chat persist failed:", err instanceof Error ? err.message : err);
            send({ error: "The reply was generated but saving failed. Please retry later." });
          }
        }

        send({ done: true });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Defeat proxy buffering so deltas arrive the moment they are generated.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    // Article 7: generic message out, content-free details to server logs only.
    console.error("/api/chat failed:", err instanceof Error ? err.message : err);
    return fail(500, "Something went wrong. Please try again.");
  }
}
