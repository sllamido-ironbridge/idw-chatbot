// ─────────────────────────────────────────────────────────────
// page-bot — rate limiting (shared by the Vercel handler and the
// local dev server). Zero npm dependencies.
//
// Two modes, chosen automatically:
//   • Distributed (recommended for production): set UPSTASH_REDIS_REST_URL
//     and UPSTASH_REDIS_REST_TOKEN. Uses a fixed window in Redis via the
//     Upstash REST API, so the limit holds across all serverless instances.
//   • In-memory fallback (zero config): a per-instance fixed window. Good
//     enough to blunt casual abuse locally / on a single warm instance, but
//     NOT reliable across Vercel's many cold-started instances — configure
//     Upstash before serious public traffic.
//
// Tunables (env):
//   RATE_LIMIT_MAX         requests per window per IP   (default 20)
//   RATE_LIMIT_WINDOW_SEC  window length in seconds     (default 60)
// ─────────────────────────────────────────────────────────────

const MAX = parseInt(process.env.RATE_LIMIT_MAX || "20", 10);
const WINDOW_SEC = parseInt(process.env.RATE_LIMIT_WINDOW_SEC || "60", 10);

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

// ── In-memory store (fallback) ───────────────────────────────
const buckets = new Map(); // ip -> { count, resetAt }

function checkMemory(ip, now) {
  let b = buckets.get(ip);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_SEC * 1000 };
    buckets.set(ip, b);
  }
  b.count += 1;
  // Opportunistic cleanup so the Map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return { allowed: b.count <= MAX, retryAfter };
}

// ── Redis fixed window via Upstash REST pipeline ─────────────
async function checkRedis(ip, now) {
  const windowStart = Math.floor(now / (WINDOW_SEC * 1000));
  const key = `pb:rl:${ip}:${windowStart}`;
  // SET key 0 EX <win> NX  → creates the counter with a TTL once per window.
  // INCR key                → atomic increment; its result is the running count.
  const resp = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      ["SET", key, "0", "EX", String(WINDOW_SEC), "NX"],
      ["INCR", key],
    ]),
  });
  if (!resp.ok) throw new Error(`Upstash ${resp.status}`);
  const data = await resp.json();
  const count = Number(data?.[1]?.result ?? 0);
  const retryAfter = WINDOW_SEC - Math.floor((now % (WINDOW_SEC * 1000)) / 1000);
  return { allowed: count <= MAX, retryAfter: Math.max(1, retryAfter) };
}

/**
 * Returns { allowed: boolean, retryAfter: seconds, limit, window }.
 * Fails OPEN: if the Redis check errors, the request is allowed (availability
 * over strictness) — the miss is logged, not surfaced to the visitor.
 */
export async function checkRateLimit(ip) {
  const now = Date.now();
  const id = ip || "unknown";
  try {
    const res = useRedis ? await checkRedis(id, now) : checkMemory(id, now);
    return { ...res, limit: MAX, window: WINDOW_SEC };
  } catch (e) {
    console.warn("rate-limit check failed, allowing request:", e.message);
    return { allowed: true, retryAfter: 0, limit: MAX, window: WINDOW_SEC };
  }
}

/** Best-effort client IP from proxy headers, falling back to the socket. */
export function getClientIp(req) {
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  const real = req.headers?.["x-real-ip"];
  if (real) return String(real).trim();
  return req.socket?.remoteAddress || "unknown";
}
