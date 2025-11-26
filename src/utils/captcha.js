"use strict";

import fetch from "node-fetch";

const PROVIDER = (process.env.LOGIN_CAPTCHA_PROVIDER || process.env.CAPTCHA_PROVIDER || "recaptcha").toLowerCase();
const SECRET =
  process.env.LOGIN_CAPTCHA_SECRET ||
  process.env.RECAPTCHA_SECRET ||
  process.env.HCAPTCHA_SECRET ||
  "";
const MIN_SCORE = Number(process.env.LOGIN_CAPTCHA_MIN_SCORE || 0);
const BYPASS_CODE = process.env.LOGIN_CAPTCHA_BYPASS_CODE || "";

const buildVerificationBody = (token, ip) => {
  const params = new URLSearchParams();
  params.append("secret", SECRET);
  params.append("response", token);
  if (ip) {
    params.append("remoteip", ip);
  }
  return params;
};

const getVerifyEndpoint = () =>
  PROVIDER === "hcaptcha"
    ? "https://hcaptcha.com/siteverify"
    : "https://www.google.com/recaptcha/api/siteverify";

const verifyCaptchaToken = async (token, { ip } = {}) => {
  if (BYPASS_CODE && token === BYPASS_CODE) {
    return { ok: true, provider: "bypass", code: "CAPTCHA_BYPASS", message: "Captcha bypassed via configured code" };
  }

  if (!token || typeof token !== "string") {
    return { ok: false, code: "CAPTCHA_REQUIRED", message: "Vui long hoan thanh CAPTCHA." };
  }

  if (!SECRET) {
    return {
      ok: false,
      code: "CAPTCHA_NOT_CONFIGURED",
      message: "Captcha is required but server is missing LOGIN_CAPTCHA_SECRET"
    };
  }

  try {
    const endpoint = getVerifyEndpoint();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildVerificationBody(token, ip)
    });
    const data = await response.json().catch(() => ({}));
    const score = typeof data.score === "number" ? data.score : null;
    const passedScore = score === null || Number.isNaN(score) ? true : score >= MIN_SCORE;
    const ok = Boolean(data.success) && passedScore;

    return {
      ok,
      provider: PROVIDER,
      code: ok ? "CAPTCHA_VERIFIED" : "CAPTCHA_FAILED",
      message: ok ? undefined : "Xac thuc CAPTCHA that bai",
      raw: data,
      score
    };
  } catch (error) {
    console.error("Captcha verification failed:", error?.message || error);
    return { ok: false, code: "CAPTCHA_ERROR", message: "Khong the xac thuc CAPTCHA, vui long thu lai" };
  }
};

export { verifyCaptchaToken };
