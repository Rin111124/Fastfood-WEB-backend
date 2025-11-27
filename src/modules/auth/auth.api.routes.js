import express from "express";
import { loginHandler, signupHandler, forgotPasswordHandler, resetPasswordHandler } from "./auth.controller.js";
import loginRateLimiter from "../../middleware/loginRateLimiter.js";
import { verifyCaptchaToken } from "../../utils/captcha.js";

const router = express.Router();

const requireCaptcha = async (req, res, next) => {
  const disabled = String(process.env.DISABLE_LOGIN_CAPTCHA || "").toLowerCase() === "true";
  if (disabled) return next();

  const token =
    req.body?.captchaToken ||
    req.body?.captcha ||
    req.body?.hcaptchaToken ||
    req.body?.recaptchaToken ||
    req.body?.captcha_response ||
    "";

  const result = await verifyCaptchaToken(token, { ip: req.ip });
  if (result.ok) return next();

  return res.status(400).json({
    success: false,
    code: result.code || "CAPTCHA_REQUIRED",
    message: result.message || "Vui long hoan thanh CAPTCHA.",
    requireCaptcha: true
  });
};

router.post("/signup", requireCaptcha, signupHandler);
router.post("/login", requireCaptcha, loginRateLimiter, loginHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);

export default router;
