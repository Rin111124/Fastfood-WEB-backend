import * as authService from './auth.service.js';
import { requestPasswordReset, resetPasswordWithToken } from "./passwordReset.service.js";
import { requestEmailVerification, verifyEmailWithToken } from "./emailVerification.service.js";

const respondIfRateLimited = (res, limiterState) => {
  if (!limiterState || !limiterState.blocked) return false;

  const retryAfter = limiterState.retryAfterSeconds || 0;
  if (retryAfter) {
    res.set("Retry-After", retryAfter.toString());
  }

  res.status(429).json({
    success: false,
    code: "LOGIN_RATE_LIMITED",
    message:
      retryAfter > 0
        ? `Ban da nhap sai qua nhieu lan. Vui long thu lai sau ${retryAfter} giay.`
        : "Ban da nhap sai qua nhieu lan. Vui long thu lai sau mot khoang thoi gian.",
    retryAfterSeconds: retryAfter,
    requireCaptcha: Boolean(limiterState.requiresCaptcha)
  });

  return true;
};

const loginHandler = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const data = await authService.login({ identifier, username, email, password });

    if (res.locals?.loginSecurity?.markSuccess) {
      res.locals.loginSecurity.markSuccess();
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;
    const isInvalidCredentials =
      error instanceof authService.AuthError &&
      (error.code === "INVALID_CREDENTIALS" || statusCode === 401);
    let limiterState = null;

    if (isInvalidCredentials && res.locals?.loginSecurity?.markFailure) {
      limiterState = res.locals.loginSecurity.markFailure();
      if (respondIfRateLimited(res, limiterState)) {
        return;
      }
    }

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error instanceof authService.AuthError ? error.message : 'Dang nhap that bai',
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(limiterState?.requiresCaptcha ? { requireCaptcha: true } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? { detail: error.message }
        : {})
    });
  }
};

const signupHandler = async (req, res) => {
  try {
    console.log('[signupHandler] Processing signup request');

    const data = await authService.register({
      ...req.body,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    console.log('[signupHandler] Registration successful, returning 201');

    return res.status(201).json({
      success: true,
      message: "Dang ky thanh cong. Vui long kiem tra email de xac thuc tai khoan.",
      data
    });
  } catch (error) {
    console.error('[signupHandler] Error caught:', {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      requiresVerification: error.requiresVerification,
      hasUser: !!error.user,
      hasEmailVerification: !!error.emailVerification
    });

    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;

    // ✅ XỬ LÝ ĐẶC BIỆT: User tồn tại nhưng chưa verify
    if (error.code === 'EMAIL_NOT_VERIFIED' && error.requiresVerification) {
      console.log('[signupHandler] Returning 409 with verification data');

      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        requiresVerification: true,
        // ✅ TRẢ VỀ THÔNG TIN CẦN THIẾT CHO FRONTEND
        data: {
          user: error.user,
          requiresEmailVerification: true,
          emailVerification: error.emailVerification
        },
        ...(error?.errors ? { errors: error.errors } : {})
      });
    }

    // ✅ Xử lý các lỗi khác
    console.log('[signupHandler] Returning error response:', statusCode);

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error instanceof authService.AuthError ? error.message : 'Dang ky that bai',
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? { detail: error.message }
        : {})
    });
  }
};

const forgotPasswordHandler = async (req, res) => {
  try {
    const { identifier, email, username } = req.body || {};
    const rawIdentifier = identifier || email || username;
    const result = await requestPasswordReset({
      identifier: rawIdentifier,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "Neu thong tin hop le, email khoi phuc da duoc gui",
      requested: true,
      ...(process.env.NODE_ENV === "development" ? { token: result.token, resetUrl: result.resetUrl } : {})
    });
  } catch (error) {
    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;
    if (statusCode === 429 && error?.errors?.retryAfterSeconds) {
      res.set("Retry-After", String(error.errors.retryAfterSeconds));
    }
    return res.status(statusCode).json({
      success: false,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error instanceof authService.AuthError ? error.message : "Khong the gui email khoi phuc",
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode === 429 && error?.errors?.retryAfterSeconds
        ? { retryAfterSeconds: error.errors.retryAfterSeconds }
        : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === "development"
        ? { detail: error.message }
        : {})
    });
  }
};

const resetPasswordHandler = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    await resetPasswordWithToken({
      token,
      password,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "Dat lai mat khau thanh cong"
    });
  } catch (error) {
    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error instanceof authService.AuthError ? error.message : "Khong the dat lai mat khau",
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === "development"
        ? { detail: error.message }
        : {})
    });
  }
};

const resendVerificationHandler = async (req, res) => {
  try {
    const { identifier, email, username } = req.body || {};
    const rawIdentifier = identifier || email || username;
    const result = await requestEmailVerification({
      identifier: rawIdentifier,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyVerified
        ? "Email da duoc xac thuc"
        : "Neu thong tin hop le, email xac thuc da duoc gui",
      data: result
    });
  } catch (error) {
    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;
    if (statusCode === 429 && error?.errors?.retryAfterSeconds) {
      res.set("Retry-After", String(error.errors.retryAfterSeconds));
    }
    return res.status(statusCode).json({
      success: false,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error instanceof authService.AuthError ? error.message : "Khong the gui email xac thuc",
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode === 429 && error?.errors?.retryAfterSeconds
        ? { retryAfterSeconds: error.errors.retryAfterSeconds }
        : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === "development"
        ? { detail: error.message }
        : {})
    });
  }
};

const verifyEmailHandler = async (req, res) => {
  try {
    const token = req.body?.token || req.query?.token;
    const result = await verifyEmailWithToken({
      token,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "Xac thuc email thanh cong",
      data: result
    });
  } catch (error) {
    const statusCode = error instanceof authService.AuthError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error instanceof authService.AuthError ? error.message : "Khong the xac thuc email",
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === "development"
        ? { detail: error.message }
        : {})
    });
  }
};

export {
  loginHandler,
  signupHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  resendVerificationHandler,
  verifyEmailHandler
};
