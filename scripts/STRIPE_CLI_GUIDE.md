# 🎯 HƯỚNG DẪN SETUP STRIPE CLI - CÁCH 2

## 📋 TỔNG QUAN

Stripe CLI cho phép bạn test webhook như production:
- ✅ Nhận webhook realtime từ Stripe
- ✅ Test payment flow đầy đủ
- ✅ Debug webhook payload
- ✅ Không cần deploy lên server

---

## 🔧 BƯỚC 1: CÀI ĐẶT STRIPE CLI

### Option A: Download trực tiếp (Khuyến nghị)

1. **Tải về:**
   ```
   https://github.com/stripe/stripe-cli/releases/latest
   ```
   - Windows 64-bit: `stripe_X.X.X_windows_x86_64.zip`

2. **Giải nén:**
   ```
   Giải nén vào: C:\stripe-cli
   ```

3. **Thêm vào PATH:**
   
   **Cách 1 - Qua GUI:**
   - Windows Search → "Environment Variables"
   - System Properties → Environment Variables
   - Edit "Path" → Add: `C:\stripe-cli`

   **Cách 2 - PowerShell (Run as Admin):**
   ```powershell
   $oldPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
   $newPath = "$oldPath;C:\stripe-cli"
   [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
   ```

4. **Mở terminal mới và kiểm tra:**
   ```cmd
   stripe --version
   ```

### Option B: Chocolatey
```powershell
choco install stripe-cli
```

### Option C: Scoop
```powershell
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

---

## 🔐 BƯỚC 2: LOGIN VÀO STRIPE

### Từ terminal:
```cmd
stripe login
```

**Những gì sẽ xảy ra:**
1. Browser tự động mở
2. Đăng nhập Stripe account
3. Authorize Stripe CLI
4. Terminal nhận token

**Output mẫu:**
```
Your pairing code is: word-word-word
Press Enter to open the browser (^C to quit)

> Success! You're authenticated.
```

---

## 🚀 BƯỚC 3: FORWARD WEBHOOK

### Terminal 1: Chạy backend (nếu chưa chạy)
```cmd
cd E:\NodeJS\backend
npm run dev
```

### Terminal 2: Forward webhook
```cmd
cd E:\NodeJS\backend
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
```

**Output quan trọng:**
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx
```

**⚠️ QUAN TRỌNG:** Copy `whsec_xxxxx` này!

---

## 🔑 BƯỚC 4: CẬP NHẬT .ENV

Thêm vào file `E:\NodeJS\backend\.env`:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

**Lấy STRIPE_SECRET_KEY từ:**
- https://dashboard.stripe.com/test/apikeys
- Copy "Secret key" (bắt đầu bằng `sk_test_`)

**STRIPE_WEBHOOK_SECRET:**
- Lấy từ output của `stripe listen` ở trên

---

## ✅ BƯỚC 5: RESTART BACKEND

**Sau khi cập nhật .env, restart backend:**

```cmd
# Ctrl+C để stop
# Chạy lại:
npm run dev
```

---

## 🧪 BƯỚC 6: TEST

### Test 1: Từ Frontend (Khuyến nghị)

1. **Mở frontend:**
   ```
   http://localhost:5173
   ```

2. **Tạo đơn hàng:**
   - Login customer
   - Add to cart
   - Checkout → Chọn **Stripe/Credit Card**

3. **Nhập thẻ test:**
   ```
   Card Number: 4242 4242 4242 4242
   Expiry: 12/34
   CVC: 123
   ZIP: 12345
   ```

4. **Thanh toán:**
   - Click "Pay"
   - Stripe xử lý thanh toán
   - **Webhook tự động gửi về backend**

5. **Kiểm tra:**
   
   **Terminal 2 (stripe listen):**
   ```
   [200] POST /api/payments/stripe/webhook
   payment_intent.succeeded [evt_xxxxx]
   ```

   **Terminal 1 (backend):**
   ```
   ✅ Stripe webhook processed: payment_intent.succeeded
   [OrderAssignment] Order 89 assigned to staff linhcao (Linh)
   ```

   **Staff Dashboard:**
   - 🔔 Notification: "Don hang #89 moi duoc giao cho ban!"
   - Order list tự động refresh

### Test 2: Trigger thủ công
```cmd
# Terminal 3
stripe trigger payment_intent.succeeded
```

---

## 📊 KIỂM TRA KẾT QUẢ

### Database:
```sql
SELECT 
    o.order_id,
    o.status,
    o.assigned_staff_id,
    p.provider,
    p.status as payment_status,
    u.username as staff_name
FROM orders o
LEFT JOIN payments p ON o.order_id = p.order_id
LEFT JOIN users u ON o.assigned_staff_id = u.user_id
ORDER BY o.created_at DESC
LIMIT 5;
```

### Expected output:
| order_id | status    | staff_id | provider | payment_status | staff_name |
|----------|-----------|----------|----------|----------------|------------|
| 89       | preparing | 4        | stripe   | success        | linhcao    |

### Backend logs:
```
✅ Stripe webhook processed: payment_intent.succeeded
[OrderAssignment] Order 89 assigned to staff linhcao (Linh)
```

### Staff Dashboard:
- Status: 🟢 **Trực tuyến**
- Notification: **"Don hang #89 moi duoc giao cho ban!"**
- Order #89 hiển thị trong list

---

## 🔍 DEBUG

### Problem: "webhook signing secret" error
```
❌ Stripe webhook error: No signatures found matching the expected signature
```

**Solution:**
1. Check `.env` có `STRIPE_WEBHOOK_SECRET`
2. Restart backend sau khi update .env
3. Kiểm tra `stripe listen` vẫn đang chạy

### Problem: "Ready!" không hiện
```
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
```

**Solution:**
1. Check backend có chạy không: `curl localhost:3000/api/health`
2. Check Stripe CLI đã login: `stripe config --list`

### Problem: Staff không nhận đơn

**Solution:**
```cmd
# Kiểm tra có staff shift
node test-order-assignment.js

# Hoặc tạo shift mới
INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, status)
VALUES (4, CURDATE(), '08:00:00', '22:00:00', 'scheduled');
```

---

## 📝 QUICK REFERENCE

### Commands thường dùng:

```bash
# Login
stripe login

# Forward webhook
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook

# Test trigger
stripe trigger payment_intent.succeeded

# List webhooks
stripe webhook endpoints list

# Config
stripe config --list

# Logout
stripe logout
```

### Test Cards:

| Card Number         | Brand      | Result  |
|---------------------|------------|---------|
| 4242 4242 4242 4242 | Visa       | Success |
| 4000 0000 0000 0002 | Visa       | Declined|
| 4000 0000 0000 9995 | Visa       | Insufficient|
| 5555 5555 5555 4444 | Mastercard | Success |

---

## 🎯 WORKFLOW HOÀN CHỈNH

```
Customer                Frontend              Backend               Stripe             Staff
   |                       |                     |                     |                  |
   |-- Add to cart ------->|                     |                     |                  |
   |                       |                     |                     |                  |
   |-- Checkout (Stripe)->|                     |                     |                  |
   |                       |                     |                     |                  |
   |                       |-- Create order ---->|                     |                  |
   |                       |   (status=pending)  |                     |                  |
   |                       |                     |                     |                  |
   |                       |-- Create intent --->|                     |                  |
   |                       |<-- clientSecret ----|                     |                  |
   |                       |                     |                     |                  |
   |<-- Show Stripe form --|                     |                     |                  |
   |                       |                     |                     |                  |
   |-- Enter card -------->|-- Submit to Stripe->|                     |                  |
   |                       |                     |                     |                  |
   |                       |                     |<-- Payment confirm--|                  |
   |                       |                     |                     |                  |
   |                       |                     |<-- Webhook (CLI)----| payment_intent   |
   |                       |                     |                     | .succeeded       |
   |                       |                     |                     |                  |
   |                       |                     |-- Update payment -->|                  |
   |                       |                     |   (success)         |                  |
   |                       |                     |                     |                  |
   |                       |                     |-- Update order ---->|                  |
   |                       |                     |   (preparing)       |                  |
   |                       |                     |                     |                  |
   |                       |                     |-- Assign staff ---->|                  |
   |                       |                     |                     |                  |
   |                       |                     |-- Create tasks ---->|                  |
   |                       |                     |                     |                  |
   |                       |                     |-- Socket emit ------|----------------->|
   |                       |                     |   order:assigned    |                  |
   |                       |                     |                     |                  |
   |                       |<-- Success ---------|                     |                  |
   |<-- Redirect to success|                     |                     |                  |
   |                       |                     |                     |     🔔 Notification
   |                       |                     |                     |     "New order!"
```

---

## 🎓 TÓM TẮT

1. ✅ **Cài Stripe CLI** → Giải nén → Add to PATH
2. ✅ **Login** → `stripe login`
3. ✅ **Forward webhook** → `stripe listen --forward-to ...`
4. ✅ **Copy secret** → Add to `.env`
5. ✅ **Restart backend**
6. ✅ **Test từ frontend** → Use test card
7. ✅ **Check staff dashboard** → Nhận notification

**LƯU Ý:** Keep terminal `stripe listen` chạy suốt khi test!

---

Need help? Check:
- Stripe Docs: https://stripe.com/docs/stripe-cli
- Test Cards: https://stripe.com/docs/testing
