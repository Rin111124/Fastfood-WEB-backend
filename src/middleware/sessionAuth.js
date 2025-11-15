"use strict";

const ensureLoggedIn = (redirectPath = "/login") => (req, res, next) => {
  if (req.session?.user) {
    return next();
  }
  return res.redirect(redirectPath);
};

const ensureRole = (role, redirectPath = "/login") => (req, res, next) => {
  const user = req.session?.user;
  if (user && user.role === role) {
    return next();
  }
  return res.redirect(redirectPath);
};

const ensureAdmin = ensureRole("admin");
const ensureStaff = ensureRole("staff");

export {
  ensureLoggedIn,
  ensureAdmin,
  ensureStaff
};
