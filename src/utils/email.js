"use strict";

import nodemailer from "nodemailer";

let cachedTransporter = null;

const buildTransporter = () => {
  const host = process.env.MAIL_HOST || process.env.SMTP_HOST || "";
  const port = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
  if (!host) return null;

  const secure =
    String(process.env.MAIL_SECURE || process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const authUser = process.env.MAIL_USER || process.env.SMTP_USER;
  const authPass = process.env.MAIL_PASS || process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: authUser && authPass ? { user: authUser, pass: authPass } : undefined
  });
};

const sendMail = async ({ to, subject, text, html }) => {
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM || "no-reply@fastfood.local";
  const mode = (process.env.MAIL_MODE || "").toLowerCase();

  if (mode === "console") {
    console.info("[mail:console]", { to, subject, text, html });
    return { accepted: [to], rejected: [], messageId: "console-preview" };
  }

  if (!cachedTransporter) {
    cachedTransporter = buildTransporter();
  }

  if (!cachedTransporter) {
    console.warn("Email transport is not configured. Falling back to console logging.");
    console.info("[mail:fallback]", { to, subject, text, html });
    return { accepted: [], rejected: [to], messageId: "mail-not-configured" };
  }

  return cachedTransporter.sendMail({ from, to, subject, text, html });
};

export { sendMail };
