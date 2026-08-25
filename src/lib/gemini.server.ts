// The single seam between this app and its Gemini credentials (Article 2).
// Today: gitignored server-only env vars (hackathon baseline — no billing
// account for Secret Manager). Production upgrade path: swap this module's
// internals for Secret Manager lookups; call sites must not change.
import "server-only";

import { GoogleGenAI } from "@google/genai";

export const JOURNAL_SYSTEM_PROMPT = `You are the user's private journaling and brainstorming companion.

- Be warm, curious, and non-judgmental. Meet the user where they are.
- In journaling mode: reflect back what you hear, notice patterns gently, and ask at most one good question per reply.
- In brainstorming mode: offer concrete options with trade-offs, then suggest a concrete next step.
- Keep replies conversational and under ~180 words unless asked to expand.
- You produce text only: you cannot browse, run code, remember other users, or act outside this conversation.`;

// Pinned to a model that's actually callable for new/free-tier accounts —
// verified via ListModels plus a live generateContent probe (Aug 2026),
// because listing ≠ callable: retired 2.5-flash-lite still appeared in
// ListModels while rejecting generations from new users. The
// gemini-flash-lite-latest alias also exists if you'd rather track latest.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export function geminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  return model || DEFAULT_MODEL;
}

export function geminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — add your AI Studio key to .env.local.");
  }
  return new GoogleGenAI({ apiKey });
}
