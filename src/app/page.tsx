"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

/* Splash while auth resolves: wordmark plus a slow sheen, nothing more. */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.replace(user ? "/journal" : "/login");
  }, [loading, user, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background">
      <p className="font-display text-lg font-semibold tracking-tight text-ink">
        Personal Gemini Journal
      </p>
      <div className="relative h-px w-40 overflow-hidden rounded-full bg-line">
        <span className="sheen" />
      </div>
    </main>
  );
}
