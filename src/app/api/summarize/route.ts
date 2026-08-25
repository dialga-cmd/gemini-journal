// POST /api/summarize — refresh the rolling summary of one conversation.
//
// Threat model (Article 0):
//   asset      — users' journal entries; Gemini quota
//   adversary  — unauthenticated, cross-uid, or quota-abusing callers
//   mitigation — Bearer ID token verified server-side → uid; the session
//                path is derived from that uid; payload validated; shares
//                the per-uid rate limiter with /api/chat; generic errors
//                with content-free logs (Articles 3–7)
import { FieldValue } from "firebase-admin/firestore";

import { HttpError, requireUid } from "@/lib/auth.server";
import { adminDb } from "@/lib/firebase.admin";
import { geminiClient, geminiModel } from "@/lib/gemini.server";
import { allowRequest } from "@/lib/rate-limit.server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_TRANSCRIPT_CHARS = 12_000;

const SUMMARY_SYSTEM_PROMPT = `You maintain the rolling memory of a private journaling conversation.

- Write a compact summary of at most 120 words.
- Capture: recurring themes, decisions made, open questions, and emotional tone.
- Third person, plain prose, no greetings, no lists unless essential.
- Return ONLY the summary text.`;

function fail(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  // ---- Article 3: authenticate -------------------------------------------
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

  // ---- Article 5: validate ------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid request body.");
  }
  if (body === null || typeof body !== "object") {
    return fail(400, "Invalid request body.");
  }
  const { sessionId } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    return fail(400, "Malformed session id.");
  }
  const sid = sessionId;

  try {
    // ---- Article 4: uid-scoped paths only ---------------------------------
    const sessionRef = adminDb().doc(`users/${uid}/sessions/${sid}`);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return fail(404, "Conversation not found.");
    }

    const messagesSnap = await sessionRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(12)
      .get();

    const transcript: string[] = [];
    messagesSnap.forEach((doc) => {
      const v = doc.data();
      if (
        (v.role === "user" || v.role === "model") &&
        typeof v.text === "string" &&
        v.text.length > 0
      ) {
        transcript.push(`${v.role === "user" ? "user" : "assistant"}: ${v.text}`);
      }
    });
    if (transcript.length < 2) {
      // Nothing meaningful to summarize yet.
      return Response.json({ ok: true, summary: String(sessionDoc.data()?.summary ?? "") });
    }

    const transcriptText = transcript.join("\n\n").slice(0, MAX_TRANSCRIPT_CHARS);
    const prevSummary = String(sessionDoc.data()?.summary ?? "");

    const summary = await summarizeConversation(prevSummary, transcriptText);
    if (!summary.trim()) {
      return fail(502, "The summarizer returned an empty response.");
    }

    await sessionRef.update({ summary, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true, summary });
  } catch (err) {
    // Article 7: generic message out, content-free details to server logs.
    console.error("/api/summarize failed:", err instanceof Error ? err.message : err);
    return fail(500, "Something went wrong. Please try again.");
  }
}

async function summarizeConversation(
  prevSummary: string,
  transcript: string,
): Promise<string> {
  try {
    const response = await geminiClient().models.generateContent({
      model: geminiModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Previous summary:\n${prevSummary || "(none)"}\n\nRecent transcript:\n${transcript}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SUMMARY_SYSTEM_PROMPT,
        temperature: 0.4,
        maxOutputTokens: 512,
      },
    });
    return (response.text ?? "").trim().slice(0, 2_000);
  } catch (err) {
    console.error("summarizer model call failed:", err instanceof Error ? err.message : err);
    return "";
  }
}
