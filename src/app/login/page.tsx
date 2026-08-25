"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { Warning } from "@phosphor-icons/react";
import { useAuth } from "@/components/AuthProvider";

/* LAMPLIGHT login: an editorial manifesto panel (light pool on ink) beside
   one honest action. Radius law: the card is a soft plane, the button a pill. */
export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/journal");
  }, [loading, user, router]);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
      // onAuthStateChanged flips context state; the effect above redirects.
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : "";
      setError(
        code === "auth/popup-closed-by-user"
          ? "The sign-in window closed before finishing."
          : code === "auth/popup-blocked"
            ? "Your browser blocked the sign-in popup. Allow popups for this site and try again."
            : code === "auth/unauthorized-domain"
              ? "This domain is not authorized for sign-in yet. Add it in Firebase console, Authentication, Settings, Authorized domains."
              : code === "auth/operation-not-allowed" || code === "auth/configuration-not-found"
                ? "The Google provider is not enabled yet. Turn it on in Firebase console, Authentication, Sign-in method."
                : code
                  ? `Sign-in failed (${code}). Please try again.`
                  : "Sign-in failed. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid flex-1 lg:grid-cols-2">
      {/* Manifesto panel: editorial hero, typographic by design */}
      <section className="relative hidden overflow-hidden bg-surface lg:flex lg:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(42rem 30rem at 18% 8%, color-mix(in oklab, var(--accent) 13%, transparent), transparent 60%), radial-gradient(36rem 28rem at 85% 92%, color-mix(in oklab, var(--violet) 16%, transparent), transparent 62%)",
          }}
        />
        <div className="relative z-10 max-w-lg px-14 xl:px-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">
            Personal Gemini Journal
          </p>
          <h1 className="rise-in mt-6 font-display text-5xl font-semibold leading-[1.06] tracking-tight text-balance text-ink xl:text-6xl">
            Ten quiet minutes with your own mind.
          </h1>
          <p className="mt-6 max-w-[38ch] text-base leading-relaxed text-ink-muted">
            Journal and brainstorm with Gemini in a private vault. Entries stay
            isolated to your account, by design.
          </p>
        </div>
      </section>

      {/* Action panel */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Compact brand for mobile, where the manifesto panel is hidden */}
          <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted lg:hidden">
            Personal Gemini Journal
          </p>

          <div className="rounded-2xl border border-line bg-surface p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              Welcome in.
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Sign in to open your journal. Nobody else can reach it.
            </p>

            <button
              onClick={handleSignIn}
              disabled={busy || loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-sm font-medium text-[#1f1f1f] transition hover:bg-[#ececec] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleGlyph />
              {busy ? "Opening Google" : "Continue with Google"}
            </button>

            {error ? (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-[var(--danger-bg)] px-4 py-3 text-sm text-danger"
              >
                <Warning weight="fill" size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
