"use strict";

const MISSING_COLUMN_CODES = new Set(["ER_BAD_FIELD_ERROR", "SQLITE_ERROR"]);
const MISSING_COLUMN_ERRNOS = new Set([1054, 1]);
const MISSING_TABLE_CODES = new Set(["ER_NO_SUCH_TABLE", "SQLITE_ERROR"]);
const MISSING_TABLE_ERRNOS = new Set([1146, 1]);
const PERMISSION_DENIED_CODES = new Set([
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_COLUMNACCESS_DENIED_ERROR",
  "EACCES"
]);
const PERMISSION_DENIED_ERRNOS = new Set([1142, 1143, 1227]);

const readErrorProperty = (error, property) =>
  error?.[property] ?? error?.original?.[property] ?? error?.parent?.[property];

const normalizeMessage = (error) => {
  const message = readErrorProperty(error, "message");
  return typeof message === "string" ? message.toLowerCase() : "";
};

const isMissingColumnError = (error) => {
  const code = readErrorProperty(error, "code");
  if (code && MISSING_COLUMN_CODES.has(code)) {
    return true;
  }

  const errno = readErrorProperty(error, "errno");
  if (typeof errno === "number" && MISSING_COLUMN_ERRNOS.has(errno)) {
    return true;
  }

  const message = normalizeMessage(error);
  return message.includes("unknown column") || message.includes("no such column");
};

const isMissingTableError = (error) => {
  const code = readErrorProperty(error, "code");
  if (code && MISSING_TABLE_CODES.has(code)) {
    return true;
  }

  const errno = readErrorProperty(error, "errno");
  if (typeof errno === "number" && MISSING_TABLE_ERRNOS.has(errno)) {
    return true;
  }

  const message = normalizeMessage(error);
  return message.includes("doesn't exist") || message.includes("no such table");
};

const isPermissionError = (error) => {
  const code = readErrorProperty(error, "code");
  if (code && PERMISSION_DENIED_CODES.has(code)) {
    return true;
  }

  const errno = readErrorProperty(error, "errno");
  if (typeof errno === "number" && PERMISSION_DENIED_ERRNOS.has(errno)) {
    return true;
  }

  const message = normalizeMessage(error);
  return message.includes("access denied") || message.includes("permission denied");
};

export { isMissingColumnError, isMissingTableError, isPermissionError };
