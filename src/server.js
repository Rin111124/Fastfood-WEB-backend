import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http from "http";
import cors from "cors";
import session from "express-session";
import path from "path";
import fs from "fs";
import net from "net";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import connectDB from "./config/connectDB.js";
import initApiRoutes from "./routes/api/index.js";
import initWebRoutes from "./routes/web/index.js";
import { UPLOAD_ROOT } from "./middleware/uploadMiddleware.js";
import { initSocket } from "./realtime/io.js";

const app = express();
// Trust the first proxy (Railway/Render/Heroku) so rate limiting keys use the real client IP
app.set("trust proxy", 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWS_ROOT = path.join(__dirname, "views");
const STRIPE_WEBHOOK_PATH = "/api/payments/stripe/webhook";
const hasViewsDir = fs.existsSync(VIEWS_ROOT);
const isRenderPlatform = Boolean(
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.RENDER_SERVICE_ID
);

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const isProdLikeEnv =
  (process.env.NODE_ENV || "development") === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  isRenderPlatform;

const apiOnlyMode = toBoolean(process.env.API_ONLY, isProdLikeEnv || !hasViewsDir);

const resolvePort = (value, defaultPort = 3000) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return defaultPort;
};

const preferredPort = resolvePort(process.env.PORT, 3000);

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const attemptListen = (host) => {
      const tester = net.createServer();
      tester.once("error", (error) => {
        if (host === "::" && error.code === "EADDRNOTAVAIL") {
          attemptListen("0.0.0.0");
          return;
        }
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          resolve(false);
        } else {
          console.error(`Unexpected error while checking port ${port} on host ${host}:`, error);
          resolve(false);
        }
      });
      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, host);
    };
    attemptListen("::");
  });

const findAvailablePort = async (startPort, attempts = 5) => {
  for (let i = 0; i < attempts; i += 1) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
};

// Configure CORS allow list from environment
const buildAllowedOrigins = () => {
  const raw = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const variants = new Set();
  raw.forEach((origin) => {
    try {
      const url = new URL(origin);
      const base = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
      variants.add(base);

      if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
        ["localhost", "127.0.0.1", "::1"].forEach((host) => {
          variants.add(`${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`);
        });
      }
    } catch {
      variants.add(origin);
    }
  });

  return variants;
};

const normalizeOrigin = (origin) => {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return origin;
  }
};

const allowedOrigins = buildAllowedOrigins();
const allowAllInDev = !isProdLikeEnv;

const corsOptions = {
  origin: (origin, callback) => {
    // Allow all if CLIENT_ORIGINS contains '*'
    const clientOrigins = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "";
    if (clientOrigins.includes('*')) {
      return callback(null, true);
    }

    if (
      !origin ||
      allowAllInDev ||
      !allowedOrigins.size ||
      allowedOrigins.has(normalizeOrigin(origin))
    ) {
      return callback(null, true);
    }
    console.warn(`Blocked CORS request from origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Native rate limiting (backend-only, replaces local Kong limiter)
const rateLimitMessage = {
  success: false,
  code: "RATE_LIMITED",
  message: "Too many requests. Please try again later."
};

const rateLimitEnabled = toBoolean(process.env.RATE_LIMIT_ENABLED, !allowAllInDev);

const perMinuteLimiter = rateLimit({
  windowMs: toPositiveInt(process.env.RATE_LIMIT_WINDOW_MINUTE_MS, 60_000),
  max: toPositiveInt(process.env.RATE_LIMIT_MAX_PER_MINUTE, allowAllInDev ? 500 : 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage
});

const perHourLimiter = rateLimit({
  windowMs: toPositiveInt(process.env.RATE_LIMIT_WINDOW_HOUR_MS, 60 * 60 * 1000),
  max: toPositiveInt(process.env.RATE_LIMIT_MAX_PER_HOUR, allowAllInDev ? 5000 : 3000),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage
});

if (rateLimitEnabled) {
  // Skip rate limiting for Stripe webhook
  app.use((req, res, next) => {
    if (req.path === STRIPE_WEBHOOK_PATH) return next();
    return perMinuteLimiter(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.path === STRIPE_WEBHOOK_PATH) return next();
    return perHourLimiter(req, res, next);
  });
} else {
  console.log("Rate limiting is disabled (set RATE_LIMIT_ENABLED=true to enable).");
}

// Body parsing
// Keep raw body for Stripe webhook signature verification
const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });

app.use(
  STRIPE_WEBHOOK_PATH,
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);
app.use((req, res, next) => {
  if (req.originalUrl === STRIPE_WEBHOOK_PATH) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === STRIPE_WEBHOOK_PATH) return next();
  return urlencodedParser(req, res, next);
});

// Static uploads serving
app.use("/uploads", express.static(UPLOAD_ROOT));

// Session configuration (in-memory store for development)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fatfood-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: Number(process.env.SESSION_MAX_AGE || 1000 * 60 * 60 * 4)
    }
  })
);

if (!apiOnlyMode) {
  app.set("view engine", "ejs");
  app.set("views", VIEWS_ROOT);
  initWebRoutes(app);
} else {
  console.log("API-only mode enabled: skipping server-rendered web routes.");
}

initApiRoutes(app);

app.get("/healthz", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root endpoint for API-only deployment
app.get("/", (req, res) => {
  res.json({
    message: "Fastfood API Server",
    version: "1.0.0",
    endpoints: {
      health: "/healthz",
      api: "/api"
    }
  });
});

const maybeServeFrontend = () => {
  // Skip frontend serving in production/Railway environment
  if (isProdLikeEnv) {
    console.log('Skipping frontend serving in production environment');
    return;
  }

  const candidates = [];

  if (process.env.FRONTEND_STATIC_ROOT) {
    candidates.push(process.env.FRONTEND_STATIC_ROOT);
  }

  candidates.push(path.join(__dirname, "..", "..", "FE", "dist"));
  candidates.push(path.join(__dirname, "public"));

  const targetRoot = candidates.find((candidate) => {
    if (!candidate) return false;
    const indexPath = path.join(candidate, "index.html");
    return fs.existsSync(candidate) && fs.existsSync(indexPath);
  });

  if (!targetRoot) {
    console.warn(
      "No frontend build found. Run `npm run build` inside the FE project and set FRONTEND_STATIC_ROOT if needed."
    );
    return;
  }

  const indexFile = path.join(targetRoot, "index.html");
  console.log("Serving static frontend from:", targetRoot);

  app.use(express.static(targetRoot));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/healthz")) {
      return next();
    }
    return res.sendFile(indexFile);
  });
};

maybeServeFrontend();

const startServer = async () => {
  try {
    await connectDB();
    const portToUse = await findAvailablePort(preferredPort);
    if (portToUse !== preferredPort) {
      console.warn(
        `Port ${preferredPort} is busy. Server is starting on fallback port ${portToUse}.`
      );
    }
    process.env.PORT = String(portToUse);
    const server = http.createServer(app);
    // Init Socket.IO once HTTP server is created
    initSocket(server, { allowedOrigins, allowAllInDev });

    server.listen(portToUse, () => {
      console.log(`Backend Node.js is running on port ${portToUse}`);
    });
    server.on("error", (error) => {
      console.error("Unhandled server error:", error?.message || error);
    });
  } catch (error) {
    console.error("Failed to start server:", error?.message || error);
    process.exit(1);
  }
};

startServer();
