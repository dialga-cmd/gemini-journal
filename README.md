# Personal Gemini Journal

Sign in, journal / brainstorm with Gemini in a multi-turn chat, and every
conversation is summarized and saved. Built hackathon-first but with a
security posture that isn't a prototype.

## Security model (the four non-negotiables)

1. **Firebase Authentication** gates everything. No session, no data.
2. **Multi-turn Gemini chat** happens through a server route — the browser
   never talks to Gemini directly.
3. **Strict per-user isolation**: all private data lives under
   `users/{uid}/…`. Firestore rules are deny-by-default and grant access only
   where `request.auth.uid == uid` ([firestore.rules](./firestore.rules)).
   Zero cross-user reads or writes are expressible.
4. **Secrets are server-only.** The Gemini API key and the Firebase Admin
   service-account path are loaded from a gitignored `.env.local` via
   `process.env`, read exclusively inside server-side code. Neither value is
   hardcoded, committed, logged, or shipped in the client bundle — and
   neither ever appears in a `NEXT_PUBLIC_*` variable.

Extra rule that makes #3 hold end-to-end: **the Admin SDK bypasses Firestore
rules**, so the server re-enforces isolation in code — the uid used for every
query comes from the *verified* ID token, never from a request body.

Full engineering rules: [SECURITY_CONSTITUTION.md](./SECURITY_CONSTITUTION.md).

### Secrets tradeoff (deliberate, not an oversight)

This project stores secrets in gitignored server-only env vars instead of
Google Cloud Secret Manager because the GCP project has no billing account
attached (Secret Manager requires one even for its free allotment). The
tradeoff we accept for the hackathon: no centralized rotation and no access
audit logs. **Production upgrade path:** move the two values into Secret
Manager and swap the loader module ([src/lib/gemini.server.ts](./src/lib/gemini.server.ts))
to fetch at runtime — call sites don't change.

## Architecture

```
Browser (Next.js client components)
 ├─ Firebase Auth JS SDK        → Google sign-in, ID token
 ├─ Firestore JS SDK            → reads/writes ONLY users/{my-uid}/…
 └─ POST /api/chat              → Authorization: Bearer <ID token>
      ↓
Server (route handler)
 ├─ verifyIdToken()             → uid (identity source of truth)
 ├─ process.env (server-only)   → Gemini API key
 ├─ Gemini multi-turn call      → reply text (+ rolling summary later)
 └─ Admin SDK writes            → users/{uid}/sessions/{sid}/messages/*
```

## Data model

```
users/{uid}                              profile (displayName, email, createdAt)
users/{uid}/sessions/{sessionId}         title, summary, messageCount, timestamps
users/{uid}/sessions/{sid}/messages/{id} role ('user' | 'model'), text, createdAt
```

## Setup

1. **Firebase console**: enable Auth (Google provider) and Firestore.
2. **Local env**: `cp .env.local.example .env.local`, then fill in:
   - the six Firebase web-config values (Project settings → General → Your apps),
   - download the **service account key** (Project settings → Service accounts
     → Generate new private key), save it as `service-key.json` in the project
     root (already gitignored),
   - your Gemini API key from Google AI Studio.
3. **Deploy rules** (required — without them Firestore blocks all clients):
   `npx firebase deploy --only firestore:rules`
4. **Run**: `npm run dev` → sign in with Google → journal.

## Free-tier notes

- `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` (cheapest tier callable
  by new accounts); switch to `gemini-3.5-flash` where quality matters. Avoid
  Pro models on the free tier. If a pinned model ever 404s with "no longer
  available to new users," bump the generation or use the
  `gemini-flash-lite-latest` alias.
- The rolling per-session `summary` keeps prompts small so long journals
  stay within free-tier context/rate limits.
