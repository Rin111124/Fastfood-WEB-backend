import express from "express";
import { loginHandler, signupHandler } from "./auth.controller.js";
import loginRateLimiter from "../../middleware/loginRateLimiter.js";

const router = express.Router();

router.post("/login", loginRateLimiter, loginHandler);
router.post("/signup", signupHandler);

export default router;
