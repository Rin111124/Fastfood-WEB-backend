"use strict";

import { login } from "./auth.service.js";

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

const postLogin = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const { user, accessToken } = await login({ identifier, username, email, password });

    if (req.session) {
      req.session.user = user;
      req.session.token = accessToken;
    }

    return res.redirect(redirectByRole(user.role));
  } catch (error) {
    if (req.session) {
      req.session.authError = error?.message || "Dang nhap that bai";
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
