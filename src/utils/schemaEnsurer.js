"use strict";

import db from "../models/index.js";
import { isMissingColumnError, isMissingTableError, isPermissionError } from "./dbErrors.js";

const { sequelize, Sequelize } = db;

const ensureStates = new Map();

const DUPLICATE_COLUMN_CODES = new Set(["ER_DUP_FIELDNAME", "42701", "SQLITE_ERROR"]);
const DUPLICATE_ERRNOS = new Set([1060, 23505]);

const isDuplicateColumnError = (error) => {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  if (code && DUPLICATE_COLUMN_CODES.has(code)) {
    return true;
  }
  const errno = error?.original?.errno || error?.parent?.errno || error?.errno;
  if (typeof errno === "number" && DUPLICATE_ERRNOS.has(errno)) {
    return true;
  }
  const message = error?.message || error?.original?.message || error?.parent?.message;
  return typeof message === "string" && /duplicate column/i.test(message);
};

const ENSURE_UNSUPPORTED = Symbol("ensureUnsupported");

const ensureColumns = async (tableName, definitions, stateKey) => {
  const currentState = ensureStates.get(stateKey);
  if (currentState === true || currentState === false) {
    return currentState;
  }
  if (currentState instanceof Promise) {
    return currentState;
  }

  const ensurePromise = (async () => {
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDefinition = await queryInterface.describeTable(tableName);
      const operations = Object.entries(definitions)
        .filter(([columnName]) => !tableDefinition[columnName])
        .map(([columnName, definition]) =>
          queryInterface.addColumn(tableName, columnName, definition).catch((error) => {
            if (isDuplicateColumnError(error)) {
              return null;
            }
            throw error;
          })
        );

      if (operations.length) {
        await Promise.all(operations);
        console.info(`Ensured media columns on table "${tableName}".`);
      }

      ensureStates.set(stateKey, true);
      return true;
    } catch (error) {
      if (isPermissionError(error) || isMissingColumnError(error) || isMissingTableError(error)) {
        console.warn(
          `Unable to ensure columns for table "${tableName}" due to limited permissions:`,
          error?.message || error
        );
        ensureStates.set(stateKey, false);
        return false;
      }
      ensureStates.delete(stateKey);
      console.error(`Failed to ensure columns for table "${tableName}":`, error?.message || error);
      throw error;
    }
  })();

  ensureStates.set(stateKey, ensurePromise);
  return ensurePromise;
};

const ensureProductImageColumns = () =>
  ensureColumns(
    "products",
    {
      image_data: { type: Sequelize.BLOB("long"), allowNull: true },
      image_mime: { type: Sequelize.STRING(100), allowNull: true }
    },
    "products:image"
  );

const ensureNewsImageColumns = () =>
  ensureColumns(
    "news",
    {
      image_url: { type: Sequelize.STRING(500), allowNull: true },
      image_data: { type: Sequelize.BLOB("long"), allowNull: true },
      image_mime: { type: Sequelize.STRING(100), allowNull: true }
    },
    "news:image"
  );

export { ENSURE_UNSUPPORTED, ensureProductImageColumns, ensureNewsImageColumns };
