import express from 'express';
import { handleStripeWebhook } from '../payment/stripe.service.js';

const router = express.Router();

// Webhook endpoint - Stripe gọi khi thanh toán thành công
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    try {
        const event = await handleStripeWebhook(signature, req.body);
        console.log('✅ Stripe webhook processed:', event.type);
        res.json({ received: true, type: event.type });
    } catch (error) {
        console.error('❌ Stripe webhook error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Test endpoint - Manually trigger payment success (for development)
router.post('/test-payment-success', express.json(), async (req, res) => {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'paymentIntentId required' });
    }

    try {
        const { handleStripePaymentSuccess } = await import('../payment/stripe.service.js');
        await handleStripePaymentSuccess(paymentIntentId, {
            type: 'payment_intent.succeeded',
            data: { object: { id: paymentIntentId } }
        });

        console.log('✅ Test payment success triggered for:', paymentIntentId);
        res.json({
            success: true,
            message: 'Payment success triggered',
            paymentIntentId
        });
    } catch (error) {
        console.error('❌ Test payment error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
