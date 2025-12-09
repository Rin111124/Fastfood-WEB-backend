import { z } from "zod";

const orderIdOnlySchema = z.object({
  orderId: z.coerce.number().int().positive()
});

const orderIdOrPayloadSchema = z
  .object({
    orderId: z.coerce.number().int().positive().optional(),
    orderPayload: z.record(z.any()).optional(),
    pendingOrder: z.record(z.any()).optional(),
    bankCode: z.string().trim().max(20).optional(),
    locale: z.string().trim().max(10).optional()
  })
  .refine(
    (data) => Boolean(data.orderId) || Boolean(data.orderPayload) || Boolean(data.pendingOrder),
    { message: "orderId hoac orderPayload bat buoc" }
  );

const vnpayStatusQuerySchema = z
  .object({
    orderId: z.coerce.number().int().positive().optional(),
    txnRef: z.string().trim().min(1).optional()
  })
  .refine((data) => Boolean(data.orderId) || Boolean(data.txnRef), {
    message: "orderId hoac txnRef bat buoc"
  });

const stripeFinalizeSchema = z
  .object({
    paymentIntentId: z.string().trim().optional(),
    txnRef: z.string().trim().optional()
  })
  .refine((data) => Boolean(data.paymentIntentId) || Boolean(data.txnRef), {
    message: "paymentIntentId hoac txnRef bat buoc"
  });

const stripeTestSchema = stripeFinalizeSchema;

export {
  orderIdOnlySchema,
  orderIdOrPayloadSchema,
  vnpayStatusQuerySchema,
  stripeTestSchema,
  stripeFinalizeSchema
};
