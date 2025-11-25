/**
 * Quick brute-force demo to prove rate limiting and gateway key enforcement.
 * Usage:
 * DEMO_API_URL=http://localhost:8000/api/auth/login \
 * DEMO_API_KEY=local-demo-key \
 * DEMO_ATTEMPTS=8 node backend/scripts/bruteforce-login-demo.js
 */
const fetch = require("node-fetch");

const API_URL = process.env.DEMO_API_URL || "http://localhost:8000/api/auth/login";
const API_KEY = process.env.DEMO_API_KEY || process.env.KONG_CONSUMER_KEY || "";
const ATTEMPTS = Number(process.env.DEMO_ATTEMPTS || 8);

const payload = {
  identifier: "demo@example.com",
  password: "wrong-password"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const redact = (value) => {
  if (!value) return "not-set";
  const str = String(value);
  if (str.length <= 4) return "***";
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
};

const main = async () => {
  console.log(`Target: ${API_URL}`);
  console.log(`Attempts: ${ATTEMPTS}`);
  console.log(`API key: ${API_KEY ? redact(API_KEY) : "none (skip if gateway disabled)"}`);
  console.log("-----");

  for (let i = 1; i <= ATTEMPTS; i += 1) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { apikey: API_KEY } : {})
      },
      body: JSON.stringify(payload)
    });

    const retryAfter = response.headers.get("retry-after");
    console.log(
      `#${i} -> ${response.status} ${response.statusText}${retryAfter ? ` (Retry-After: ${retryAfter}s)` : ""}`
    );

    if (response.status === 429) {
      console.log("Rate limit hit. Further attempts will continue to be throttled within the window.");
      break;
    }

    await sleep(250);
  }
};

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
