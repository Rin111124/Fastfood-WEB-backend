"use strict";

import authPkg from "./auth.service.js";
const { login } = authPkg;

const redirectByRole = (role) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "staff":
      return "/staff";
    default:
      return "/";
  }
};

const getLoginPage = (req, res) => {
  if (req.session?.user) {
    return res.redirect(redirectByRole(req.session.user.role));
  }

  const error = req.session?.authError || null;
  if (req.session && typeof req.session.authError !== "undefined") {
    delete req.session.authError;
  }

  return res.render("auth/login", { error });
};

const handleRateLimitRedirect = (req, limiterState) => {
  if (!limiterState || !limiterState.blocked) return false;
  const retryAfter = limiterState.retryAfterSeconds || 0;
  const message =
    retryAfter > 0
      ? `Ban da nhap sai qua nhieu lan. Vui long thu lai sau ${retryAfter} giay.`
      : "Ban da nhap sai qua nhieu lan. Vui long thu lai sau mot khoang thoi gian.";
  if (req.session) {
    req.session.authError = message;
  }
  return true;
};

const postLogin = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const { user, accessToken } = await login({ identifier, username, email, password });

    if (req.session) {
      req.session.user = user;
      req.session.token = accessToken;
    }

    if (res.locals?.loginSecurity?.markSuccess) {
      res.locals.loginSecurity.markSuccess();
    }

    return res.redirect(redirectByRole(user.role));
  } catch (error) {
    const isInvalidCredentials = error?.code === "INVALID_CREDENTIALS" || error?.statusCode === 401;
    let limiterState = null;
    if (isInvalidCredentials && res.locals?.loginSecurity?.markFailure) {
      limiterState = res.locals.loginSecurity.markFailure();
      if (handleRateLimitRedirect(req, limiterState)) {
        return res.redirect("/login");
      }
    }

    if (req.session) {
      req.session.authError =
        limiterState?.requiresCaptcha
          ? "Ban da nhap sai nhieu lan. Vui long hoan thanh CAPTCHA roi thu lai."
          : error?.message || "Dang nhap that bai";
    }
    return res.redirect("/login");
  }
};

const logout = (req, res) => {
  if (!req.session) {
    return res.redirect("/login");
  }
  req.session.destroy(() => {
    res.redirect("/login");
  });
};

export {
  getLoginPage,
  postLogin,
  logout
};
