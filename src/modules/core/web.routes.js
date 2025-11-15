import express from "express";
import { getHomePage } from "./home.controller.js";
import { loginHandler, signupHandler } from "../auth/auth.controller.js";
import { getLoginPage, postLogin, logout } from "../auth/session.controller.js";
import { ensureLoggedIn } from "../../middleware/sessionAuth.js";

const router = express.Router();

const initWebRoutes = (app) => {
  router.get("/", getHomePage);
  router.get("/login", getLoginPage);
  router.post("/login", postLogin);
  router.post("/logout", ensureLoggedIn(), logout);
  router.get("/logout", ensureLoggedIn(), logout);
  router.post("/api/auth/login", loginHandler);
  router.post("/api/auth/signup", signupHandler);
  return app.use("/", router);
};

export default initWebRoutes;
