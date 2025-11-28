"use strict";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Op } from "sequelize";
import db from "../../models/index.js";
import * as authService from "./auth.service.js";
import { sendMail } from "../../utils/email.js";

const { User, PasswordResetToken, sequelize } = db;

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 15);
const REQUEST_LIMIT_WINDOW_MS = Number(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS || 10 * 60_000);
const REQUEST_LIMIT_MAX = Number(process.env.PASSWORD_RESET_REQUEST_LIMIT || 3);

const requestBuckets = new Map();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const cleanupExpiredRequests = (now) => {
  for (const [key, entry] of requestBuckets.entries()) {
    if (now - entry.firstRequestAt > REQUEST_LIMIT_WINDOW_MS) {
      requestBuckets.delete(key);
    }
  }
};

const checkRequestLimit = (key, now = Date.now()) => {
  cleanupExpiredRequests(now);
  let bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.firstRequestAt > REQUEST_LIMIT_WINDOW_MS) {
    bucket = { count: 0, firstRequestAt: now };
    requestBuckets.set(key, bucket);
  }
  bucket.count += 1;

  if (bucket.count > REQUEST_LIMIT_MAX) {
    const retryAfterMs = Math.max(0, REQUEST_LIMIT_WINDOW_MS - (now - bucket.firstRequestAt));
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
};

const buildResetUrl = (token) => {
  const base =
    process.env.PASSWORD_RESET_URL ||
    (process.env.CLIENT_ORIGIN ? `${process.env.CLIENT_ORIGIN.replace(/\/$/, "")}/reset-password` : "");

  if (!base) return null;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}token=${token}`;
};

const sendResetEmail = async ({ user, token, resetUrl, expiresAt }) => {
  const subject = "Khoi phuc mat khau";
  const expirationText = expiresAt ? `trong ${TOKEN_TTL_MINUTES} phut` : "sau mot thoi gian ngan";
  const text = [
    `Xin chao ${user.full_name || user.username},`,
    "",
    "Chung toi nhan duoc yeu cau thay doi mat khau cho tai khoan cua ban.",
    resetUrl
      ? `Hay su dung lien ket sau de dat lai mat khau (${expirationText}): ${resetUrl}`
      : `Hay su dung ma token sau de dat lai mat khau (${expirationText}): ${token}`,
    "",
    "Neu ban khong yeu cau, co the bo qua email nay."
  ].join("\n");

  const html = `
    <p>Xin chao ${user.full_name || user.username},</p>
    <p>Chung toi nhan duoc yeu cau thay doi mat khau cho tai khoan cua ban.</p>
    <p>${resetUrl
      ? `Hay nhan vao <a href="${resetUrl}">lien ket nay</a> de dat lai mat khau (${expirationText}).`
      : `Hay su dung ma token sau de dat lai mat khau (${expirationText}): <strong>${token}</strong>.`
    }</p>
    <p>Neu ban khong yeu cau, hay bo qua email nay.</p>
  `;

  await sendMail({
    to: user.email,
    subject,
    text,
    html
  });
};

const purgeExpiredTokens = async () => {
  const now = new Date();
  await PasswordResetToken.destroy({ where: { expires_at: { [Op.lt]: now } } });
};

const requestPasswordReset = async ({ identifier, ip, userAgent }) => {
  const rawIdentifier = typeof identifier === "string" ? identifier.trim() : "";
  if (!rawIdentifier) {
    throw new authService.AuthError("Vui long nhap email hoac ten dang nhap", 422, "IDENTIFIER_REQUIRED");
  }

  const throttleKey = `${ip || "unknown"}:${rawIdentifier.toLowerCase()}`;
  const limitState = checkRequestLimit(throttleKey);
  if (limitState.blocked) {
    throw new authService.AuthError(
      `Ban da yeu cau qua nhieu lan. Vui long thu lai sau ${limitState.retryAfterSeconds} giay`,
      429,
      "RESET_RATE_LIMITED",
      { retryAfterSeconds: limitState.retryAfterSeconds }
    );
  }

  const { whereClause } = authService.resolveIdentifierQuery(rawIdentifier);
  const user = await User.unscoped().findOne({ where: whereClause });

  // Do not leak user existence
  if (!user) {
    return { requested: true };
  }

  await purgeExpiredTokens();

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await PasswordResetToken.update(
      { used_at: new Date() },
      {
        where: { user_id: user.user_id, used_at: null },
        transaction
      }
    );

    await PasswordResetToken.create(
      {
        user_id: user.user_id,
        token_hash: hashedToken,
        expires_at: expiresAt,
        ip_address: ip || null,
        user_agent: userAgent ? userAgent.slice(0, 255) : null
      },
      { transaction }
    );
  });

  const resetUrl = buildResetUrl(token);
  await sendResetEmail({ user, token, resetUrl, expiresAt });

  const response = {
    requested: true,
    expiresAt,
    ...(process.env.NODE_ENV === "development" ? { token, resetUrl } : {})
  };

  return response;
};

const resetPasswordWithToken = async ({ token, password, ip, userAgent }) => {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) {
    throw new authService.AuthError("Token khoi phuc khong hop le", 422, "TOKEN_REQUIRED");
  }

  const hashedToken = hashToken(normalizedToken);
  const now = new Date();

  const resetRecord = await PasswordResetToken.findOne({
    where: { token_hash: hashedToken },
    order: [["created_at", "DESC"]]
  });

  if (!resetRecord) {
    throw new authService.AuthError("Token khoi phuc khong hop le", 400, "TOKEN_INVALID");
  }

  if (resetRecord.used_at) {
    throw new authService.AuthError("Token khoi phuc da duoc su dung", 400, "TOKEN_USED");
  }

  if (resetRecord.expires_at && resetRecord.expires_at < now) {
    throw new authService.AuthError("Token khoi phuc da het han", 400, "TOKEN_EXPIRED");
  }

  const user = await User.unscoped().findByPk(resetRecord.user_id);
  if (!user) {
    throw new authService.AuthError("Khong tim thay nguoi dung", 404, "USER_NOT_FOUND");
  }

  const sanitizedPassword = authService.ensurePassword(password);
  const hashedPassword = await bcrypt.hash(sanitizedPassword, SALT_ROUNDS);

  await sequelize.transaction(async (transaction) => {
    await user.update({ password: hashedPassword }, { transaction });
    await resetRecord.update(
      {
        used_at: now,
        ip_address: ip || resetRecord.ip_address,
        user_agent: userAgent ? userAgent.slice(0, 255) : resetRecord.user_agent
      },
      { transaction }
    );

    // Invalidate other active tokens for this user
    await PasswordResetToken.update(
      { used_at: now },
      {
        where: {
          user_id: user.user_id,
          token_hash: { [Op.ne]: hashedToken },
          used_at: null
        },
        transaction
      }
    );
  });

  return { success: true, user: authService.sanitizeUser(user) };
};

export { requestPasswordReset, resetPasswordWithToken };
