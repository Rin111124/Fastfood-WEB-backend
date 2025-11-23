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
