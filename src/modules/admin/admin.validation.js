import { z } from "zod";

const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

const optionIdParamSchema = z.object({
  optionId: z.coerce.number().int().positive()
});

const productIdParamSchema = z.object({
  productId: z.coerce.number().int().positive()
});

const categoryIdParamSchema = z.object({
  categoryId: z.coerce.number().int().positive()
});

const orderIdParamSchema = z.object({
  orderId: z.coerce.number().int().positive()
});

const paymentIdParamSchema = z.object({
  paymentId: z.coerce.number().int().positive()
});

const promoIdParamSchema = z.object({
  promoId: z.coerce.number().int().positive()
});

const newsIdParamSchema = z.object({
  newsId: z.coerce.number().int().positive()
});

const roleEnum = z.enum(["customer", "admin", "staff", "shipper"]);
const statusEnum = z.enum(["active", "locked", "suspended"]);
const genderEnum = z.enum(["male", "female", "other", "unknown"]);
const foodTypeEnum = z.enum(["burger", "pizza", "drink", "snack", "combo", "dessert", "other"]);

const nullToUndefined = (value) => (value === null ? undefined : value);

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100),
  email: z.string().trim().email().max(150),
  password: z.string().trim().min(8).max(255).optional(),
  role: roleEnum.optional(),
  status: statusEnum.optional(),
  full_name: z.preprocess(
    nullToUndefined,
    z.string().trim().min(2).max(120).optional()
  ),
  phone_number: z.preprocess(
    nullToUndefined,
    z
      .string()
      .trim()
      .regex(/^[0-9+()\-\s]{8,20}$/i, "Phone number must be 8-20 digits")
      .optional()
  ),
  gender: genderEnum.optional(),
  address: z.preprocess(
    nullToUndefined,
    z.string().trim().max(255).optional()
  )
});

const updateUserSchema = createUserSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" }
);

const userStatusSchema = z.object({
  status: statusEnum
});

const productBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  food_type: foodTypeEnum.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  price: z.coerce.number().nonnegative(),
  is_active: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  prep_station_code: z.string().trim().max(50).optional(),
  prepStationCode: z.string().trim().max(50).optional(),
  stationCode: z.string().trim().max(50).optional(),
  removeImage: z.coerce.boolean().optional()
});

const productUpdateSchema = productBaseSchema.partial();

const toggleProductSchema = z.object({
  is_active: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  pause_reason: z.string().trim().max(255).optional(),
  reason: z.string().trim().max(255).optional(),
  resume_at: z.string().trim().optional(),
  paused_at: z.string().trim().optional()
});

const orderStatusSchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "paid",
    "preparing",
    "delivering",
    "shipping",
    "completed",
    "canceled",
    "refunded"
  ])
});

const assignOrderSchema = z.object({
  staffId: z.coerce.number().int().positive().optional(),
  shipperId: z.coerce.number().int().positive().optional(),
  expectedDeliveryTime: z.string().trim().optional()
});

const paymentStatusSchema = z.object({
  status: z.enum(["initiated", "success", "failed", "refunded"])
});

const promotionBaseSchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().nonnegative(),
  max_discount_value: z.coerce.number().nonnegative().optional().nullable(),
  min_order_amount: z.coerce.number().nonnegative().optional().nullable(),
  max_usage: z.coerce.number().int().nonnegative().optional().nullable(),
  start_date: z.string().trim(),
  end_date: z.string().trim(),
  applicable_roles: z.union([z.string(), z.array(z.string())]).optional(),
  applicable_categories: z.union([z.string(), z.array(z.string())]).optional(),
  is_active: z.coerce.boolean().optional()
});

const promotionUpdateSchema = promotionBaseSchema.partial();

const inventoryUpsertSchema = z
  .object({
    inventory_id: z.coerce.number().int().positive().optional(),
    product_id: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int(),
    threshold: z.coerce.number().int().optional()
  })
  .refine(
    (data) => Boolean(data.inventory_id) || Boolean(data.product_id),
    { message: "product_id is required when creating", path: ["product_id"] }
  );

export {
  assignOrderSchema,
  categoryIdParamSchema,
  createUserSchema,
  newsIdParamSchema,
  optionIdParamSchema,
  orderIdParamSchema,
  paymentIdParamSchema,
  productBaseSchema,
  productIdParamSchema,
  productUpdateSchema,
  promoIdParamSchema,
  promotionBaseSchema,
  promotionUpdateSchema,
  toggleProductSchema,
  updateUserSchema,
  userIdParamSchema,
  userStatusSchema,
  orderStatusSchema,
  paymentStatusSchema,
  inventoryUpsertSchema
};
