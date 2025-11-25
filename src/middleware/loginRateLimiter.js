// Lightweight in-memory rate limiter for login attempts.
// This protects dev/local deployments even when Kong or another gateway is absent.
const DEFAULT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 60_000); // 1 minute
const DEFAULT_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 5);
const DISABLED = String(process.env.DISABLE_LOGIN_RATE_LIMIT || "").toLowerCase() === "true";

const buckets = new Map();

const cleanupStaleBuckets = () => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.firstAttempt > DEFAULT_WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
};

// Prevent the interval from keeping Node running in tests/scripts
const cleanupTimer = setInterval(cleanupStaleBuckets, DEFAULT_WINDOW_MS);
if (cleanupTimer && typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

const buildKey = (req) => {
  const userIdentifier =
    req.body?.identifier ||
    req.body?.username ||
    req.body?.email ||
    req.body?.phoneNumber ||
    "";

  return `${req.ip || "unknown"}:${String(userIdentifier).toLowerCase()}`;
};

const formatMessage = (retryAfterSeconds) =>
  retryAfterSeconds > 0
    ? `Too many login attempts. Try again in ${retryAfterSeconds} seconds.`
    : "Too many login attempts. Please try again soon.";

export default function loginRateLimiter(req, res, next) {
  if (DISABLED) return next();

  const windowMs = DEFAULT_WINDOW_MS;
  const maxAttempts = DEFAULT_MAX_ATTEMPTS;
  const key = buildKey(req);
  const now = Date.now();

  const entry = buckets.get(key);
  if (!entry || now - entry.firstAttempt > windowMs) {
    buckets.set(key, { count: 1, firstAttempt: now });
    return next();
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const retryAfterMs = Math.max(0, windowMs - (now - entry.firstAttempt));
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    res.set("Retry-After", retryAfterSeconds.toString());
    return res.status(429).json({ message: formatMessage(retryAfterSeconds) });
  }

  return next();
}
