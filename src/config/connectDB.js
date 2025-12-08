import dotenv from "dotenv";
dotenv.config();
import db from "../models/index.js";

let isConnected = false;

const buildMetadataQuery = () => {
  const dialect = db.sequelize.getDialect();

  if (dialect === "postgres" || dialect === "postgresql") {
    return 'SELECT current_timestamp AS "currentTime", version() AS "serverVersion", current_database() AS "databaseName"';
  }

  if (dialect === "mariadb" || dialect === "mysql") {
    return "SELECT NOW() AS currentTime, VERSION() AS serverVersion, DATABASE() AS databaseName";
  }

  return 'SELECT CURRENT_TIMESTAMP AS "currentTime"';
};

const logConnectionDetails = async () => {
  try {
    const [results] = await db.sequelize.query(buildMetadataQuery());
    const info = Array.isArray(results) ? results[0] : results;
    console.log("Database connected.");
    console.log("Database name :", info?.databaseName || process.env.DB_NAME || "(undefined)");
    console.log("Server version:", info?.serverVersion || "(unknown)");
    console.log("Current time  :", info?.currentTime || "(unknown)");
  } catch (error) {
    console.warn("Connected, but failed to fetch connection metadata:", error?.message || error);
  }
};

export default async function connectDB() {
  if (isConnected) {
    return db.sequelize;
  }

  try {
    await db.sequelize.authenticate();
    await logConnectionDetails();
    isConnected = true;
    return db.sequelize;
  } catch (error) {
    console.error("Database connection failed:", error?.message || error);
    throw error;
  }
}
