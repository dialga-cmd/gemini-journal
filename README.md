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
4. **The Gemini API key lives in Google Cloud Secret Manager** and is fetched
   at runtime by the server (cached in memory). It is never hardcoded,
   committed, or shipped to the client bundle.

Extra rule that makes #3 hold end-to-end: **the Admin SDK bypasses Firestore
rules**, so the server re-enforces isolation in code — the uid used for every
query comes from the *verified* ID token, never from a request body.

## Architecture

```
Browser (Next.js client components)
 ├─ Firebase Auth JS SDK        → Google sign-in, ID token
 ├─ Firestore JS SDK            → reads/writes ONLY users/{my-uid}/…
 └─ POST /api/chat              → Authorization: Bearer <ID token>
      ↓
Server (route handler)
 ├─ verifyIdToken()             → uid (identity source of truth)
 ├─ Secret Manager (cached)     → Gemini API key
 ├─ Gemini multi-turn call      → reply text + rolling summary
 └─ Admin SDK writes            → users/{uid}/sessions/{sid}/messages/*
```

## Data model

```
users/{uid}                              profile (displayName, email, createdAt)
users/{uid}/sessions/{sessionId}         title, summary, messageCount, timestamps
users/{uid}/sessions/{sid}/messages/{id} role ('user' | 'model'), text, createdAt
```

## Setup

1. **Firebase console**: create a project, enable Auth (Google provider) and
   Firestore. Register a web app and copy its config into `.env.local`.
2. **Local env**: `cp .env.local.example .env.local` and fill in the values.
3. **Service account** (for `firebase-admin` locally): create one with
   *Firebase Admin SDK* access, save the JSON under `secrets/` (gitignored),
   and point `GOOGLE_APPLICATION_CREDENTIALS` at it. On deployed infra,
   Application Default Credentials handle this.
4. **Gemini key in Secret Manager** (requires billing enabled on the GCP
   project — usage stays inside the free allotment):

```bash
gcloud services enable secretmanager.googleapis.com
printf '%s' 'YOUR_GEMINI_API_KEY' | gcloud secrets create gemini-api-key --data-file=-
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:APP-SA@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

5. **Deploy rules**: `npx firebase deploy --only firestore:rules`
   (or test locally first with the emulator suite).
6. **Run**: `npm run dev`

## Free-tier notes

- `GEMINI_MODEL` defaults to `gemini-2.5-flash-lite` (cheapest); switch to
  `gemini-2.5-flash` where quality matters. Avoid Pro on the free tier.
- The rolling per-session `summary` keeps prompts small so long journals
  stay within free-tier context/rate limits.
