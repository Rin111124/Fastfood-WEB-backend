import { verifyCaptchaToken } from "../utils/captcha.js";

// Login security guard: rate limit failed attempts and enforce CAPTCHA after repeated failures.
const DEFAULT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60_000); // 15 minutes
const DEFAULT_MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS || process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 5);
const CAPTCHA_THRESHOLD = Number(process.env.LOGIN_CAPTCHA_THRESHOLD || 3);
const CAPTCHA_DISABLED = String(process.env.DISABLE_LOGIN_CAPTCHA || "").toLowerCase() === "true";
const DISABLED = String(process.env.DISABLE_LOGIN_RATE_LIMIT || "").toLowerCase() === "true";

const buckets = new Map();

const cleanupStaleBuckets = () => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    const firstFailureAt = entry.firstFailureAt || entry.firstAttempt || 0;
    if (!firstFailureAt || now - firstFailureAt > DEFAULT_WINDOW_MS * 2) {
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

const extractCaptchaToken = (req) =>
  req.body?.captchaToken ||
  req.body?.captcha ||
  req.body?.hcaptchaToken ||
  req.body?.recaptchaToken ||
  req.body?.captcha_response ||
  "";

const formatBlockMessage = (retryAfterSeconds) =>
  retryAfterSeconds > 0
    ? `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`
    : "Too many failed login attempts. Please try again soon.";

const resetBucket = (key) => buckets.delete(key);

const computeState = (bucket, now, windowMs) => {
  if (!bucket) {
    return { blocked: false, requiresCaptcha: false, retryAfterSeconds: 0, failCount: 0 };
  }

  const firstFailureAt = bucket.firstFailureAt || bucket.firstAttempt || now;
  const failCount = Number.isFinite(bucket.failCount)
    ? bucket.failCount
    : Number.isFinite(bucket.count)
      ? bucket.count
      : 0;

  if (now - firstFailureAt > windowMs) {
    buckets.delete(bucket.key);
    return { blocked: false, requiresCaptcha: false, retryAfterSeconds: 0, failCount: 0 };
  }

  const requiresCaptcha = !CAPTCHA_DISABLED && (CAPTCHA_THRESHOLD <= 0 || failCount >= CAPTCHA_THRESHOLD);
  const blocked = failCount >= DEFAULT_MAX_FAILED_ATTEMPTS;
  const retryAfterMs = Math.max(0, windowMs - (now - firstFailureAt));

  return {
    blocked,
    requiresCaptcha,
    retryAfterSeconds: blocked ? Math.ceil(retryAfterMs / 1000) : 0,
    failCount,
    firstFailureAt
  };
};

const recordFailure = (key, now, windowMs) => {
  let bucket = buckets.get(key);
  const baseFirstFailureAt = bucket?.firstFailureAt || bucket?.firstAttempt || now;
  if (bucket && !bucket.key) {
    bucket.key = key;
  }
  if (!bucket || now - baseFirstFailureAt > windowMs) {
    bucket = { key, failCount: 0, firstFailureAt: now };
    buckets.set(key, bucket);
  }
  if (!Number.isFinite(bucket.failCount)) {
    bucket.failCount = Number.isFinite(bucket.count) ? bucket.count : 0;
  }
  if (!bucket.firstFailureAt) {
    bucket.firstFailureAt = now;
  }
  bucket.failCount += 1;
  bucket.lastFailureAt = now;
  return computeState(bucket, now, windowMs);
};

const buildContext = (key, windowMs) => {
  if (DISABLED) {
    return {
      key,
      windowMs,
      maxFailedAttempts: DEFAULT_MAX_FAILED_ATTEMPTS,
      markSuccess: () => {},
      markFailure: () => ({ blocked: false, requiresCaptcha: false, retryAfterSeconds: 0 })
    };
  }
  return {
    key,
    windowMs,
    maxFailedAttempts: DEFAULT_MAX_FAILED_ATTEMPTS,
    markSuccess: () => resetBucket(key),
    markFailure: () => recordFailure(key, Date.now(), windowMs)
  };
};

export default async function loginRateLimiter(req, res, next) {
  const windowMs = DEFAULT_WINDOW_MS;
  const key = buildKey(req);
  const now = Date.now();
  const bucket = buckets.get(key);
  const state = computeState(bucket, now, windowMs);

  res.locals.loginSecurity = buildContext(key, windowMs);

  if (DISABLED) {
    return next();
  }

  if (state.blocked) {
    if (state.retryAfterSeconds) {
      res.set("Retry-After", state.retryAfterSeconds.toString());
    }
    return res.status(429).json({
      success: false,
      code: "LOGIN_RATE_LIMITED",
      message: formatBlockMessage(state.retryAfterSeconds),
      retryAfterSeconds: state.retryAfterSeconds,
      requireCaptcha: !CAPTCHA_DISABLED
    });
  }

  if (state.requiresCaptcha) {
    const captchaToken = extractCaptchaToken(req);
    const captchaResult = await verifyCaptchaToken(captchaToken, { ip: req.ip });
    if (!captchaResult.ok) {
      return res.status(400).json({
        success: false,
        code: captchaResult.code || "CAPTCHA_REQUIRED",
        message: captchaResult.message || "Xac thuc CAPTCHA that bai",
        requireCaptcha: true
      });
    }
  }

  return next();
}
