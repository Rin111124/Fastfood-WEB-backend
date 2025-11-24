# Kong (local)

This folder keeps the Kong assets used for local API gateway testing on top of the Express backend.

- kong.yml: declarative config with key-auth + rate limits for /api (consumer local-tester, key local-demo-key), ACL allowlist `trusted-clients`, and payload cap (1 MB). Target points to https://fastfood-web-backend-production.up.railway.app; change if your backend runs elsewhere.
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

- Update `backend/kong/kong.yml` so `services[0].url` points to your Railway backend domain or custom domain.
- In Railway, create a **new service** -> **Deploy from repo**, set **Root Directory** to `backend/kong`, and let Railway build from `backend/kong/Dockerfile`.
- Add an environment variable `PORT=8000` (or any port you prefer); the container binds Kong's proxy to `$PORT`.
- Set `KONG_CONSUMER_KEY=<your-prod-key>` in Railway env vars (the Dockerfile templates `kong.yml` at runtime so the key isn't baked into git/image; default is `local-demo-key` for local testing). A placeholder lives in `backend/kong/.env.example`; copy to `.env` locally if needed.
- Deploy. Once healthy, call the gateway at `https://<your-kong-service>.up.railway.app/api/...` with header `apikey: local-demo-key` (ACL `trusted-clients` is already wired).
- Admin API is disabled (`KONG_ADMIN_LISTEN=off`); change the config and redeploy whenever you adjust plugins/routes.
