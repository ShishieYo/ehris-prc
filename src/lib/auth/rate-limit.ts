import "server-only";

/**
 * Small in-memory sliding-window limiter for sign-in / reset attempts.
 * It is per server instance: behind several instances (or serverless) put a
 * shared limiter (Redis/edge) in front — see docs/security.md. Supabase Auth
 * applies its own server-side rate limits as a second layer.
 */
const hits = new Map<string, number[]>();

export function tooManyAttempts(key: string, max = 5, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, recent);
  return recent.length >= max;
}

export function recordAttempt(key: string): void {
  hits.set(key, [...(hits.get(key) ?? []), Date.now()]);
}

export function clearAttempts(key: string): void {
  hits.delete(key);
}
