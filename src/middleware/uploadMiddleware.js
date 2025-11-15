"use strict";

import multer from "multer";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT && path.isAbsolute(process.env.UPLOAD_ROOT)
    ? process.env.UPLOAD_ROOT
    : path.resolve(__dirname, "..", "..", process.env.UPLOAD_ROOT || "uploads");

const ensureDirSync = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
};

ensureDirSync(UPLOAD_ROOT);

const sanitizeSubdir = (subdir) =>
  String(subdir || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.\.+/g, "")
    .trim() || "others";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const imageFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    const error = new Error("Chi ho tro upload tep hinh anh (png, jpg, webp, gif).");
    error.statusCode = 400;
    return cb(error);
  }
  return cb(null, true);
};

const createImageUploader = (subdir, fieldName = "image") => {
  const safeSubdir = sanitizeSubdir(subdir);
  const destination = path.join(UPLOAD_ROOT, safeSubdir);
  ensureDirSync(destination);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      ensureDirSync(destination);
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const randomName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, randomName);
    }
  });

  const uploadInstance = multer({
    storage,
    fileFilter: imageFilter,
    limits: {
      fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE || 5 * 1024 * 1024)
    }
  });

  const singleUpload = uploadInstance.single(fieldName);

  const middleware = (req, res, next) => {
    singleUpload(req, res, (error) => {
      if (!error && req.file) {
        req.file.uploadSubdir = safeSubdir;
      }
      next(error);
    });
  };

  middleware.uploadSubdir = safeSubdir;
  return middleware;
};

const createMemoryImageUploader = (fieldName = "image") =>
  multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFilter,
    limits: {
      fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE || 5 * 1024 * 1024)
    }
  }).single(fieldName);

const resolvePublicPath = (subdir, filename) => {
  const safeSubdir = sanitizeSubdir(subdir);
  const safeFile = String(filename || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.\.+/g, "");
  return path.posix.join("/uploads", safeSubdir, safeFile);
};

const resolveAbsolutePath = (publicPath) => {
  if (!publicPath) return null;
  const normalized = String(publicPath).replace(/\\/g, "/");
  const prefix = "/uploads/";
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const relative = normalized.slice(prefix.length);
  const absolutePath = path.join(UPLOAD_ROOT, relative);
  if (!absolutePath.startsWith(UPLOAD_ROOT)) {
    return null;
  }
  return absolutePath;
};

const removeStoredFile = async (publicPath) => {
  const absolutePath = resolveAbsolutePath(publicPath);
  if (!absolutePath) return;
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Failed to remove uploaded file", { absolutePath, error: error.message });
    }
  }
};

export {
  UPLOAD_ROOT,
  createImageUploader,
  createMemoryImageUploader,
  resolvePublicPath,
  resolveAbsolutePath,
  removeStoredFile
};
