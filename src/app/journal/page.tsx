"use client";

// Journal surface. Logic is unchanged from the working harness; this file's
// presentation follows docs/design-philosophy.md (LAMPLIGHT): ink surfaces,
// one apricot accent where action lives, violet for focus and the user's own
// voice, flame-behavior motion, one radius law throughout.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneTilt, SignOut, Sparkle, Warning } from "@phosphor-icons/react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { firebaseClient } from "@/lib/firebase.client";

type ChatMessage = { role: "user" | "model"; text: string };

const SESSION_KEY = "gj.sessionId";
const MAX_INPUT_CHARS = 8_000;

const SUGGESTIONS = [
  "Talk through my day",
  "Untangle a decision",
  "Brainstorm an idea",
];

export default function JournalPage() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  const sidRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Route guard (client-side convenience only; /api/chat re-verifies).
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Restore the open thread: session id from localStorage, history read
  // straight from Firestore under our own subtree, permitted by the rules.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = window.localStorage.getItem(SESSION_KEY);
        if (!stored) return;
        const { db } = firebaseClient();
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "sessions", stored, "messages"),
            orderBy("createdAt", "asc"),
            limit(200),
          ),
        );
        if (cancelled) return;
        const restored: ChatMessage[] = [];
        snap.forEach((d) => {
          const v = d.data() as { role?: unknown; text?: unknown };
          if ((v.role === "user" || v.role === "model") && typeof v.text === "string") {
            restored.push({ role: v.role, text: v.text });
          }
        });
        if (restored.length > 0) {
          sidRef.current = stored;
          setMessages(restored);
        } else {
          window.localStorage.removeItem(SESSION_KEY);
        }
      } catch (err) {
        // Rules deny cross-user reads, so any failure here means start fresh.
        console.error("history restore skipped:", err);
        sidRef.current = null;
        window.localStorage.removeItem(SESSION_KEY);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !user || text.length > MAX_INPUT_CHARS) return;

    setError(null);
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", text }]); // optimistic

    try {
      const { auth } = firebaseClient();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You were signed out. Please sign in again.");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: sidRef.current ?? undefined, message: text }),
      });
      const data = (await res.json()) as { reply?: string; sessionId?: string; error?: string };
      if (!res.ok || !data.reply || !data.sessionId) {
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }
      sidRef.current = data.sessionId;
      window.localStorage.setItem(SESSION_KEY, data.sessionId);
      setMessages((prev) => [...prev, { role: "model", text: data.reply as string }]);
    } catch (err) {
      // Roll back the optimistic bubble so the UI never lies about state.
      setMessages((prev) =>
        prev.filter((m, i) => !(i === prev.length - 1 && m.role === "user")),
      );
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }, [input, sending, user]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function handleSignOut() {
    window.localStorage.removeItem(SESSION_KEY);
    await signOutUser();
    router.replace("/login");
  }

  function useSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  if (loading || restoring || !user) {
    return <JournalSkeleton />;
  }

  const nearLimit = input.length > MAX_INPUT_CHARS - 400;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[52rem] items-center justify-between px-5">
          <p className="font-display text-base font-semibold tracking-tight text-ink">
            Personal Gemini Journal
          </p>
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element -- static Google avatar URL
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full ring-1 ring-line"
              />
            ) : null}
            <span className="hidden max-w-[18ch] truncate font-mono text-xs text-ink-muted sm:inline">
              {user.email}
            </span>
            <button
              onClick={() => void handleSignOut()}
              className="flex h-9 items-center gap-2 rounded-full border border-line px-4 text-xs font-medium text-ink transition hover:bg-surface-2 active:scale-[0.98]"
            >
              <SignOut size={14} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[46rem] px-5 py-10">
          {messages.length === 0 ? (
            <div className="rise-in flex min-h-[50dvh] flex-col items-center justify-center text-center">
              <h1 className="max-w-[16ch] font-display text-[2rem] font-semibold leading-[1.08] tracking-tight text-balance text-ink md:text-[2.75rem]">
                What’s on your mind?
              </h1>
              <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-ink-muted md:text-base">
                Write freely. Gemini will reflect, ask a good question, or help
                you think it through.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => useSuggestion(suggestion)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-muted transition hover:border-accent hover:text-ink active:scale-[0.98]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div role="log" aria-live="polite" className="flex flex-col gap-5">
              {messages.map((message, i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  className={
                    message.role === "user"
                      ? "rise-in ml-auto max-w-[82%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-user px-4 py-3 text-sm leading-6 text-white"
                      : "rise-in mr-auto max-w-[82%] whitespace-pre-wrap rounded-[18px] rounded-bl-[6px] border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink"
                  }
                >
                  {message.role === "model" ? (
                    <Sparkle
                      weight="fill"
                      size={12}
                      className="mb-1 mr-1.5 inline-block text-accent"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="break-words">{message.text}</span>
                </div>
              ))}
              {sending ? (
                <div className="mr-auto flex items-center gap-1.5 rounded-[18px] rounded-bl-[6px] border border-line bg-surface px-4 py-3.5">
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-ink-muted" />
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-ink-muted" />
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-ink-muted" />
                  <span className="sr-only">Gemini is thinking</span>
                </div>
              ) : null}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {error ? (
        <div className="mx-auto w-full max-w-[46rem] px-5 pb-2">
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/40 bg-[var(--danger-bg)] px-4 py-3 text-sm text-danger"
          >
            <Warning weight="fill" size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="border-t border-line">
        <div className="mx-auto w-full max-w-[46rem] px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2 rounded-[22px] border border-line bg-surface p-2 pl-4 transition-colors focus-within:border-accent">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(4, Math.max(1, input.split("\n").length))}
              maxLength={MAX_INPUT_CHARS + 100}
              name="entry"
              autoComplete="off"
              aria-label="Journal entry"
              placeholder="Start writing…"
              className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send entry"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:bg-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PaperPlaneTilt weight="fill" size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="font-mono text-xs text-ink-muted">
              Enter to send · Shift+Enter for a new line
            </p>
            {nearLimit ? (
              <p className="font-mono text-xs tabular-nums text-ink-muted">
                {input.length}/{MAX_INPUT_CHARS}
              </p>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}

/* Bubble-shaped placeholders matching the thread layout while history
   restores; sheen sweeps instead of a spinner. */
function JournalSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-background" aria-busy="true" aria-label="Loading your journal">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-[52rem] items-center px-5">
          <p className="font-display text-base font-semibold tracking-tight text-ink">
            Personal Gemini Journal
          </p>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-5 py-10">
          {[["ml-auto", "w-2/3"], ["mr-auto", "w-3/4"], ["ml-auto", "w-1/2"]].map(
            ([align, width], i) => (
              <div
                key={i}
                className={`relative h-12 overflow-hidden rounded-[18px] bg-surface ${align} ${width} ${
                  align === "ml-auto" ? "rounded-br-[6px]" : "rounded-bl-[6px]"
                }`}
              >
                <span className="sheen absolute inset-0 block" />
              </div>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
