import express from "express";
import { loginHandler, signupHandler, forgotPasswordHandler, resetPasswordHandler } from "./auth.controller.js";
import loginRateLimiter from "../../middleware/loginRateLimiter.js";

const router = express.Router();

router.post("/login", loginRateLimiter, loginHandler);
router.post("/signup", signupHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);

export default router;
