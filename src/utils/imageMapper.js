"use strict";

import { Buffer } from "buffer";

const FALLBACK_IMAGE_MIME = "image/jpeg";

const normalizeMime = (mime) =>
  typeof mime === "string" && mime.trim().length ? mime.trim() : FALLBACK_IMAGE_MIME;

const encodeBlobToDataUri = (binary, mime) => {
  if (!binary) {
    return { uri: null, mime: null };
  }

  try {
    const buffer = Buffer.isBuffer(binary) ? binary : Buffer.from(binary);
    const resolvedMime = normalizeMime(mime);
    return {
      uri: `data:${resolvedMime};base64,${buffer.toString("base64")}`,
      mime: resolvedMime
    };
  } catch (error) {
    console.warn("Failed to encode binary image", error?.message || error);
    return { uri: null, mime: null };
  }
};

const resolveImageSource = (plain) => {
  if (!plain) {
    return { uri: null, mime: null };
  }

  if (plain.image_data) {
    const encoded = encodeBlobToDataUri(plain.image_data, plain.image_mime);
    if (encoded?.uri) {
      return encoded;
    }
  }

  const url =
    typeof plain.image_url === "string" && plain.image_url.trim().length
      ? plain.image_url.trim()
      : null;

  return { uri: url, mime: null };
};

const normalizeAuditFields = (payload) => {
  if (!payload) {
    return;
  }

  const mappings = [
    ["createdAt", "created_at"],
    ["updatedAt", "updated_at"],
    ["deletedAt", "deleted_at"]
  ];

  mappings.forEach(([sourceKey, targetKey]) => {
    if (Object.prototype.hasOwnProperty.call(payload, sourceKey)) {
      if (!Object.prototype.hasOwnProperty.call(payload, targetKey) || payload[targetKey] === undefined) {
        payload[targetKey] = payload[sourceKey];
      }
      delete payload[sourceKey];
    }
  });
};

const mapImageFields = (plain, { includeMime = false } = {}) => {
  if (!plain) {
    return plain;
  }

  const mapped = { ...plain };
  normalizeAuditFields(mapped);

  const { uri, mime } = resolveImageSource(plain);

  mapped.image = uri;
  if (uri) {
    mapped.image_url = uri;
  } else {
    delete mapped.image_url;
  }

  if (includeMime && uri && mime) {
    mapped.image_mime = mime;
  } else {
    delete mapped.image_mime;
  }

  delete mapped.image_data;
  return mapped;
};

export { FALLBACK_IMAGE_MIME, normalizeMime, encodeBlobToDataUri, resolveImageSource, mapImageFields };
