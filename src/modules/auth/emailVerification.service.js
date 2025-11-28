"use strict";

import crypto from "crypto";
import { Op } from "sequelize";
import db from "../../models/index.js";
import * as authService from "./auth.service.js";
import { sendMail } from "../../utils/email.js";

const { User, EmailVerificationToken, sequelize } = db;

const TOKEN_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES || 60);
const REQUEST_LIMIT_WINDOW_MS = Number(process.env.EMAIL_VERIFICATION_REQUEST_WINDOW_MINUTES || 15 * 60_000);
const REQUEST_LIMIT_MAX = Number(process.env.EMAIL_VERIFICATION_REQUEST_LIMIT || 3);

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

const buildVerificationUrl = (token) => {
  const base =
    process.env.EMAIL_VERIFICATION_URL ||
    (process.env.CLIENT_ORIGIN ? `${process.env.CLIENT_ORIGIN.replace(/\/$/, "")}/verify-email` : "");

  if (!base) return null;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}token=${token}`;
};

const sendVerificationEmail = async ({ user, token, verifyUrl, expiresAt }) => {
  const subject = "Xac thuc dia chi email";
  const expirationText = expiresAt ? `trong ${TOKEN_TTL_MINUTES} phut` : "sau mot thoi gian ngan";
  const text = [
    `Xin chao ${user.full_name || user.username},`,
    "",
    "Cam on ban da dang ky tai Fastfood. Vui long xac thuc email de kich hoat tai khoan.",
    verifyUrl
      ? `Nhan vao lien ket sau de xac thuc (${expirationText}): ${verifyUrl}`
      : `Su dung ma sau de xac thuc (${expirationText}): ${token}`,
    "",
    "Neu ban khong tao tai khoan, hay bo qua email nay."
  ].join("\n");

  const html = `
    <p>Xin chao ${user.full_name || user.username},</p>
    <p>Cam on ban da dang ky tai Fastfood. Vui long xac thuc email de kich hoat tai khoan.</p>
    <p>${verifyUrl
      ? `Hay nhan vao <a href="${verifyUrl}">lien ket nay</a> de xac thuc (${expirationText}).`
      : `Su dung ma sau de xac thuc (${expirationText}): <strong>${token}</strong>.`
    }</p>
    <p>Neu ban khong tao tai khoan, hay bo qua email nay.</p>
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
  await EmailVerificationToken.destroy({ where: { expires_at: { [Op.lt]: now } } });
};

const findTargetUser = async ({ identifier, userId }) => {
  if (userId) {
    const found = await User.unscoped().findByPk(userId);
    if (found) return found;
  }

  const rawIdentifier = typeof identifier === "string" ? identifier.trim() : "";
  if (!rawIdentifier) {
    throw new authService.AuthError("Vui long nhap email hoac ten dang nhap", 422, "IDENTIFIER_REQUIRED");
  }

  const { whereClause } = authService.resolveIdentifierQuery(rawIdentifier);
  return User.unscoped().findOne({ where: whereClause });
};

const requestEmailVerification = async ({ identifier, userId, ip, userAgent }) => {
  const targetUser = await findTargetUser({ identifier, userId });

  // Avoid leaking whether the account exists
  if (!targetUser) {
    return { requested: true, sent: true };
  }

  if (targetUser.email_verified_at) {
    return { requested: false, alreadyVerified: true, user: authService.sanitizeUser(targetUser) };
  }

  const throttleKey = `${ip || "unknown"}:${(targetUser.email || "").toLowerCase()}`;
  const limitState = checkRequestLimit(throttleKey);
  if (limitState.blocked) {
    throw new authService.AuthError(
      `Ban da yeu cau qua nhieu lan. Vui long thu lai sau ${limitState.retryAfterSeconds} giay`,
      429,
      "VERIFY_RATE_LIMITED",
      { retryAfterSeconds: limitState.retryAfterSeconds }
    );
  }

  await purgeExpiredTokens();

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await EmailVerificationToken.update(
      { used_at: new Date() },
      {
        where: { user_id: targetUser.user_id, used_at: null },
        transaction
      }
    );

    await EmailVerificationToken.create(
      {
        user_id: targetUser.user_id,
        token_hash: hashedToken,
        expires_at: expiresAt,
        ip_address: ip || null,
        user_agent: userAgent ? userAgent.slice(0, 255) : null
      },
      { transaction }
    );
  });

  const verifyUrl = buildVerificationUrl(token);
  await sendVerificationEmail({ user: targetUser, token, verifyUrl, expiresAt });

  return {
    requested: true,
    sent: true,
    expiresAt,
    ...(process.env.NODE_ENV === "development" ? { token, verifyUrl } : {})
  };
};

const verifyEmailWithToken = async ({ token, ip, userAgent }) => {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) {
    throw new authService.AuthError("Token xac thuc khong hop le", 422, "TOKEN_REQUIRED");
  }

  const hashedToken = hashToken(normalizedToken);
  const now = new Date();

  const verificationRecord = await EmailVerificationToken.findOne({
    where: { token_hash: hashedToken },
    order: [["created_at", "DESC"]]
  });

  if (!verificationRecord) {
    throw new authService.AuthError("Ma xac thuc khong hop le", 400, "VERIFICATION_TOKEN_INVALID");
  }

  if (verificationRecord.used_at) {
    throw new authService.AuthError("Ma xac thuc da duoc su dung", 400, "VERIFICATION_TOKEN_USED");
  }

  if (verificationRecord.expires_at && verificationRecord.expires_at < now) {
    throw new authService.AuthError("Ma xac thuc da het han", 400, "VERIFICATION_TOKEN_EXPIRED");
  }

  const user = await User.unscoped().findByPk(verificationRecord.user_id);
  if (!user) {
    throw new authService.AuthError("Khong tim thay nguoi dung", 404, "USER_NOT_FOUND");
  }

  await sequelize.transaction(async (transaction) => {
    if (!user.email_verified_at) {
      await user.update({ email_verified_at: now }, { transaction });
    }

    await verificationRecord.update(
      {
        used_at: now,
        ip_address: ip || verificationRecord.ip_address,
        user_agent: userAgent ? userAgent.slice(0, 255) : verificationRecord.user_agent
      },
      { transaction }
    );

    await EmailVerificationToken.update(
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

  return { verified: true, user: authService.sanitizeUser(user) };
};

export { requestEmailVerification, verifyEmailWithToken };
