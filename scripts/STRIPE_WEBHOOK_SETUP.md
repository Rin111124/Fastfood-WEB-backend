# 🔧 STRIPE WEBHOOK SETUP GUIDE

## 📋 TÓM TẮT

Khi customer thanh toán bằng Stripe:
1. Frontend tạo order với `payment_method: "stripe"` → Status = `pending`
2. Frontend call API tạo PaymentIntent → Nhận `clientSecret`
3. Customer nhập thẻ và thanh toán
4. **Stripe gửi webhook** → Backend nhận event `payment_intent.succeeded`
5. Backend trigger `handleStripePaymentSuccess` → Assign staff + Create tasks
6. Staff nhận realtime notification

---

## 🚀 CÁCH SỬ DỤNG

### **Option 1: Test Local (Không cần Stripe CLI)**

#### Bước 1: Tạo order Stripe từ frontend
```
1. Customer login
2. Add to cart
3. Checkout → Chọn Stripe
4. Nhập test card: 4242 4242 4242 4242, exp: 12/34, CVC: 123
5. Thanh toán → Order tạo với status "pending"
```

#### Bước 2: Manually trigger webhook (Development only)
```bash
# Terminal 1: Backend đang chạy
npm run dev

# Terminal 2: Trigger payment success
node test-stripe-webhook.js
```

Script sẽ:
- ✅ Tìm payment pending mới nhất
- ✅ Call test endpoint để trigger payment success
- ✅ Assign staff cho order
- ✅ Hiển thị kết quả

---

### **Option 2: Test với Stripe CLI (Production-like)**

#### Bước 1: Cài Stripe CLI

**Windows (winget):**
```bash
winget install stripe.stripe-cli
```

**Hoặc download từ:** https://stripe.com/docs/stripe-cli

#### Bước 2: Login Stripe CLI
```bash
stripe login
```

#### Bước 3: Forward webhooks to local
```bash
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
```

Output sẽ cho webhook signing secret:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

#### Bước 4: Thêm vào .env
```env
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

#### Bước 5: Test thật
```
1. Frontend checkout với Stripe
2. Nhập test card
3. Stripe CLI sẽ tự động forward webhook
4. Backend xử lý và assign staff
```

---

### **Option 3: Production (Stripe Dashboard)**

#### Bước 1: Thêm webhook endpoint
1. Truy cập https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://yourdomain.com/api/payments/stripe/webhook`
4. Events: Chọn `payment_intent.succeeded`
5. Copy "Signing secret"

#### Bước 2: Cập nhật .env production
```env
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

---

## 🧪 TESTING

### Test 1: Pending Payment → Success
```bash
node test-stripe-webhook.js
```

Expected output:
```
✅ Connected to database
📋 Found pending payment:
   Payment ID: 123
   Order ID: 88
   Txn Ref (PI): pi_xxxxx
   Amount: 20000 VND
   Status: initiated

🔄 Triggering payment success...
✅ Payment success triggered!
📊 Updated payment status: success
📦 Order #88:
   Status: preparing
   Assigned Staff: 4
   Staff: linhcao (Linh)
```

### Test 2: Check Staff Dashboard
1. Login as staff
2. Xem góc trên: **🟢 Trực tuyến**
3. Notification sẽ hiện: "Don hang #88 moi duoc giao cho ban!"
4. Order list tự động refresh

---

## 📝 API ENDPOINTS

### Create Payment Intent
```http
POST /api/payments/stripe/create-intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": 123
}
```

Response:
```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_xxx_secret_yyy",
    "paymentIntentId": "pi_xxxxx",
    "amount": 20000,
    "currency": "VND"
  }
}
```

### Webhook (Called by Stripe)
```http
POST /api/payments/stripe/webhook
Content-Type: application/json
Stripe-Signature: t=xxx,v1=yyy

{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_xxxxx",
      ...
    }
  }
}
```

### Test Payment Success (DEV ONLY)
```http
POST /api/payments/stripe/test-payment-success
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "paymentIntentId": "pi_xxxxx"
}
```

---

## 🔐 SECURITY NOTES

1. **NEVER expose** `STRIPE_SECRET_KEY` in frontend
2. **ALWAYS verify** webhook signature in production
3. **Disable** test endpoint in production:
   ```javascript
   if (process.env.NODE_ENV !== 'production') {
     router.post("/stripe/test-payment-success", ...);
   }
   ```
4. **Use environment variables** for all secrets

---

## 🐛 TROUBLESHOOTING

### Problem: "No pending payment found"
**Solution:** Tạo order từ frontend trước

### Problem: "Webhook signature invalid"
**Solution:** Kiểm tra `STRIPE_WEBHOOK_SECRET` đúng

### Problem: "Staff not assigned"
**Solution:** 
1. Kiểm tra có staff shift/timeclock entry
2. Run: `node test-order-assignment.js`

### Problem: Socket not connected
**Solution:**
1. Check backend log: "Socket connected"
2. Frontend: Xem badge "🟢 Trực tuyến"
3. F12 Console: "✅ Socket connected: xxx"

---

## 📚 REFERENCES

- Stripe CLI: https://stripe.com/docs/stripe-cli
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Test Cards: https://stripe.com/docs/testing
- Stripe API: https://stripe.com/docs/api

---

## ✅ CHECKLIST

Setup hoàn chỉnh:
- [ ] Cài Stripe CLI (optional)
- [ ] Có `STRIPE_SECRET_KEY` trong .env
- [ ] Có `STRIPE_WEBHOOK_SECRET` (production)
- [ ] Backend đang chạy
- [ ] Staff có shift hoặc timeclock entry
- [ ] Frontend Socket.IO connected
- [ ] Test với test card

---

💡 **TIP:** Dùng Option 1 (test-stripe-webhook.js) để test nhanh nhất!
