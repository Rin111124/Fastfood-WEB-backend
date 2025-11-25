# Kong (local)

This folder keeps the Kong assets used for local API gateway testing on top of the Express backend.

- kong.yml: declarative config with key-auth + rate limits for /api (consumer local-tester, key local-demo-key), ACL allowlist `trusted-clients`, payload cap (1 MB), bot detection, security headers, and upstream gateway secret injection. Target points to https://fastfood-web-backend-production.up.railway.app; change if your backend runs elsewhere.
- deck.yml: deck profile pointing at http://localhost:8001 (install deck separately; the binary is not checked in).
- docker-compose.yml: spins up Postgres + Kong for development.

## Usage

```
cd backend/kong
docker compose up -d

# once Kong is up and deck is installed
cd backend/kong
deck sync --config deck.yml kong.yml

# hit the gateway (backend must be running on http://localhost:3000)
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'apikey: local-demo-key' \
  -d '{"identifier":"admin@fastfood.local","password":"wrong"}'
```

Stop the stack with `docker compose down`. Adjust rate limits and authentication in kong.yml as needed.

## Railway deploy (production)

The repo now ships a DB-less Kong image tailored for Railway (`backend/kong/Dockerfile`). Quick path to run it in front of your deployed backend:

- Update `backend/kong/kong.yml` so `services[0].url` points to your backend domain or (preferred) private/internal hostname via env `KONG_BACKEND_URL` (templated at runtime; default `http://backend:3000`).
- In Railway, create a **new service** -> **Deploy from repo**, set **Root Directory** to `backend/kong`, and let Railway build from `backend/kong/Dockerfile`.
- Add env vars: `PORT=8000` (or any), `KONG_CONSUMER_KEY=<your-prod-key>`, `KONG_BACKEND_URL=<private-backend-url>`, `GATEWAY_SHARED_SECRET=<shared-secret>`. The Dockerfile renders kong.yml at runtime so keys/URLs are not baked into git/image. `backend/kong/.env.example` has placeholders.
- Deploy. Once healthy, call the gateway at `https://<your-kong-service>.up.railway.app/api/...` (no apikey needed; rate limit by IP + payload limit apply).
- Admin API is disabled (`KONG_ADMIN_LISTEN=off`); change the config and redeploy whenever you adjust plugins/routes.

### Frontend + backend routing through Kong
- Set your frontend `VITE_API_BASE_URL` to the Kong domain (or custom domain on that service). All browser/API calls flow through Kong.
- Backend now checks a shared header (`x-gateway-secret`) when `GATEWAY_SHARED_SECRET` is set. Kong injects this header with the same secret (`request-transformer` plugin). Calls that bypass Kong and lack this header get `401`.
- Add the Kong domain to backend `CLIENT_ORIGINS` for CORS.
