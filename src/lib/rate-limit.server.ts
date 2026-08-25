// Best-effort per-user rate limiting (Article 5). In-memory, so it resets
// on restart and doesn't span multiple server instances — enough to blunt
// runaway client loops on the free tier; distributed limiting is a
// documented production concern, not an oversight here.
import "server-only";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const hits = new Map<string, number[]>();

export function allowRequest(uid: string): boolean {
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(uid, recent);
    return false;
  }
  recent.push(now);
  hits.set(uid, recent);

  // Opportunistic cleanup so idle users can't grow the map without bound.
  if (hits.size > 10_000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return true;
}
