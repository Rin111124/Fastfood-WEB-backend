## FatFood API

This folder contains the Node.js/Express REST API that powers the standalone frontend in `../frontend`.

### Getting started

```bash
cd backend
npm install
npm run dev
```

The server listens on `http://localhost:3000` by default. Adjust the port via the `PORT` entry in `.env`.

### Realtime chat + chatbot

- Realtime Socket.IO is enabled. The backend creates rooms for `staff` and `user:<id>`.
- Customer endpoints:
  - `GET /api/customer/support/conversation/messages`
  - `POST /api/customer/support/conversation/messages` (auto-reply bot + optional LLM fallback)
- Staff endpoints:
  - `GET /api/staff/support/messages`
  - `GET /api/staff/support/metrics` (unreplied count)
  - `POST /api/staff/support/:messageId/reply` (pushes realtime to the customer)

To enable LLM fallback (optional), set these in `.env`:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=15000
```

If `OPENAI_API_KEY` is not set, the bot uses rule-based replies only.

### Configuration

- `CLIENT_ORIGIN` or `CLIENT_ORIGINS` lists the allowed frontend origins (comma separated).
- `JWT_SECRET`, `JWT_EXPIRES_IN`, and `JWT_ISSUER` secure access tokens issued during authentication.

### Health check

```
GET http://localhost:3000/health
```

Use the `/api` namespace (for example `/api/auth/login`) to connect your frontend.

### API overview

- `GET /api/health` — service heartbeat.
- Auth: `POST /api/auth/login`, `POST /api/auth/signup`.
- Admin (token required): `GET /api/admin/dashboard`, CRUD endpoints under `/api/admin/users`, `GET /api/admin/staff`.
- Staff workspace (token required): `GET /api/staff/dashboard`.

Extend these endpoints or add new ones under `src/routes/api` as the React frontend evolves.

### Payment integrations

The backend exposes several payment options. Configure the environment variables in `.env`:

- **VNPAY**: `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_URL`, `VNP_RETURN_URL`, `VNP_IPN_URL`.
- **VietQR / Dynamic bank transfer**: `VIETQR_BANK`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME`, `VIETQR_GATEWAY_URL`, `VIETQR_GATEWAY_METHOD`, `VIETQR_GATEWAY_STATUS_URL`, `VIETQR_GATEWAY_STATUS_METHOD`, `VIETQR_GATEWAY_API_KEY`, `VIETQR_GATEWAY_API_KEY_HEADER`, `VIETQR_GATEWAY_TIMEOUT_MS`, `VIETQR_TIMEOUT_SECONDS`, `VIETQR_WEBHOOK_SECRET`, `VIETQR_WEBHOOK_SIGNATURE_HEADER`.
  - Without a gateway URL the backend falls back to `https://img.vietqr.io` and generates a static QR using a unique `FF_<order>_<random>` description. With a gateway URL the service posts `{ description, amount, accountNo, accountName, orderId }`, stores the returned QR payload, and keeps the gateway transaction ID in the payment metadata.
  - Set `VIETQR_GATEWAY_STATUS_URL` (and `VIETQR_GATEWAY_STATUS_METHOD`) so the POS/backend can poll the provider when a webhook is delayed. The API key header defaults to `x-api-key`, the HTTP timeout defaults to 10 seconds (`VIETQR_GATEWAY_TIMEOUT_MS`), and `VIETQR_TIMEOUT_SECONDS` controls how long a QR remains valid.
  - Webhooks sent to `/api/payments/vietqr/webhook` are signed using `VIETQR_WEBHOOK_SECRET` (the expected signature is `SHA256(description|amount|status|transaction_id)`); customize the header name with `VIETQR_WEBHOOK_SIGNATURE_HEADER` (default `x-vietqr-signature`).
- **PayPal**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, optional `PAYPAL_*_REDIRECT` URLs, and `PAYPAL_CURRENCY`.
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` (default `vnd`). The frontend also needs `VITE_STRIPE_PUBLISHABLE_KEY`.

Routes:

- `/api/payments/vnpay/*` -> VNPay create/return/IPN helpers.
- `/api/payments/paypal/create|return|cancel|webhook`.
- `/api/payments/stripe/create-intent` (customer token required) and `/api/payments/stripe/webhook`.
- `/api/payments/vietqr/create`, `/api/payments/vietqr/confirm`, `/api/payments/vietqr/cancel`, `/api/payments/vietqr/query`, `/api/payments/vietqr/webhook`.
- `/api/payments/cod/create` for manual/COD records.

#### VietQR dynamic flow

1. POS/kiosk asks `/api/payments/vietqr/create` for an `orderId`. The backend verifies permissions, builds a unique `FF_<order>_<random>` description, optionally calls the gateway to mint the QR, stores the metadata (expires_at, gateway response, etc.) and returns the QR image plus the description.
2. The POS shows the QR with a countdown timer and the customer scans it via any banking app. The app pre-fills the amount/uneditable description; if the merchant doesn't have a gateway set, the static VietQR still contains the description for reconciliation.
3. After the customer taps 'I already paid' the POS hits `/api/payments/vietqr/confirm`. The backend marks the payment as user-confirmed and (if `VIETQR_GATEWAY_STATUS_URL` exists) polls the gateway to see if the transfer already succeeded.
4. The merchant's gateway calls `/api/payments/vietqr/webhook` with JSON like `{"transaction_id":"BANK_XYZ987","amount":125000,"description":"FF_123","status":"SUCCESS"}`. The backend verifies the HMAC, matches the description, ensures the amount equals the order total, updates the payment to `success`, moves the order to `paid`, assigns on-duty staff, clears the cart, and emits Socket.IO events (`order:payment-updated` / `orders:payment-updated`) so POS/KDS know they can cook the food.
5. If a webhook never arrives the POS can call `/api/payments/vietqr/query` after ~10 seconds; the backend reuses the gateway status endpoint to confirm success or marks the payment failed when there's a mismatch. `/api/payments/vietqr/cancel` expires the QR when the timer runs out or the customer cancels. Any amount mismatch automatically flags the payment as failed and alerts staff for manual review before fulfillment continues.
6. `/api/payments/vietqr/create` also accepts an `orderPayload` (with `userId`, `items` array of `{ productId, quantity, price }`, `paymentMethod`, `note`, and optional `expectedDeliveryTime`); if you send that instead of an existing `orderId`, the backend retains the details so that once the webhook confirms payment it automatically creates the order, marks it `paid`, assigns the on-duty staff, and notifies the POS/KDS. The service will also reuse the most recent initiated payment for the same order so duplicate `create` calls (e.g., React Strict Mode) do not spawn multiple transactions while the QR is still valid.

Admin users can reconcile transactions through `GET /api/admin/payments` and update statuses via `PATCH /api/admin/payments/:paymentId/status`.

### Station-based fulfillment & workforce

The backend now keeps track of who is on-duty (and at which station) so orders can be fan-out to the right KDS screens.

- Staff members check in/out through `/api/staff/timeclock/check-in|check-out` and may pause their shift with `/api/staff/timeclock/break`. When a station still has pending tickets and no backup staff, the API blocks checkout/break until tickets are transferred.
- Every paid/confirmed order automatically creates `station_tasks` for each `order_item`. Products can be tagged with a `prep_station_code` (see `/api/admin/products` payload). If unspecified, the service infers the station by `food_type` (burgers -> `grill`, snacks -> `fryer`, drinks -> `drink`, otherwise `pack`).
- Station dashboards consume `/api/staff/kds/stations/:stationCode/tasks` (optional `includeCompletedMinutes`, `limit` query params) and can monitor overload through `/api/staff/kds/stations/:stationCode/load`. Packer/expo screens use `/api/staff/kds/packing-board`.
- Touching a ticket (acknowledge / start / complete / cancel) is done via `POST /api/staff/kds/stations/:stationCode/tasks/:taskId/status` with body `{ "status": "in_progress" }`, etc. WebSocket events (`kds:tasks:created`, `kds:tasks:updated`) keep every KDS screen in sync in realtime.
- Load balancing: when `pending` tickets for a station exceed the defined `capacity_per_batch * 2` (default `6` if unset), the `/load` endpoint returns `overloaded: true` so the supervisor UI can flash the station and re-route staff.
