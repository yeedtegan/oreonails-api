import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { all, one } from "../db/index.js";
import { cartItemSchema, quote, SHIPPING_RATES } from "../lib/pricing.js";
import { body } from "../lib/validate.js";
import type { AuthEnv } from "../lib/auth.js";

export const orders = new Hono<AuthEnv>();

export const quoteSchema = z.object({
  items: z.array(cartItemSchema).max(100),
  code: z.string().max(40).optional(),
  shippingRate: z.enum(SHIPPING_RATES).optional(),
});

/** Price a cart. The client sends handles + options only; prices come from the DB. */
orders.post("/cart/quote", async (c) => {
  const { items, code, shippingRate } = await body(c, quoteSchema);
  return c.json(await quote(items, code, shippingRate));
});

export interface OrderRow {
  number: string;
  user_id: number | null;
  email: string;
  name: string;
  address: string;
  subtotal: number;
  promo_discount: number;
  code: string | null;
  code_discount: number;
  shipping: number;
  total: number;
  status: string;
  created_at: string;
  phone: string | null;
  shipping_address: Address | null;
  billing_address: Address | null;
  shipping_method: string | null;
  payment_method: string;
  payment_status: string;
  payment_provider: string;
  payment_ref: string | null;
  payment_detail: string | null;
  paid_at: string | null;
  access_key: string | null;
  accepts_marketing: boolean;
  points_awarded: number;
}

export interface Address {
  firstName?: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  country: string;
  countryCode: string;
  phone?: string;
}

interface ItemRow {
  product_handle: string;
  title: string;
  unit_price: number;
  qty: number;
  size: string | null;
  shape: string | null;
  custom_sizes: string | null;
}

type ItemRowWithOrder = ItemRow & { order_number: string };

/** Serialises orders, loading all their items in one query. */
export async function ordersJson(rows: OrderRow[]) {
  if (!rows.length) return [];
  const items = await all<ItemRowWithOrder>("SELECT * FROM order_items WHERE order_number = ANY($1::text[]) ORDER BY id", [rows.map((o) => o.number)]);
  const byOrder = new Map<string, ItemRow[]>();
  for (const i of items) byOrder.set(i.order_number, [...(byOrder.get(i.order_number) ?? []), i]);
  return rows.map((o) => orderJsonWith(o, byOrder.get(o.number) ?? []));
}

export async function orderJson(o: OrderRow) {
  return (await ordersJson([o]))[0];
}

function orderJsonWith(o: OrderRow, items: ItemRow[]) {
  return {
    number: o.number,
    email: o.email,
    name: o.name,
    address: o.address,
    subtotal: o.subtotal,
    promoDiscount: o.promo_discount,
    code: o.code,
    codeDiscount: o.code_discount,
    shipping: o.shipping,
    total: o.total,
    status: o.status,
    createdAt: o.created_at,
    phone: o.phone,
    shippingAddress: o.shipping_address,
    billingAddress: o.billing_address,
    shippingMethod: o.shipping_method,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    paymentDetail: o.payment_detail,
    paidAt: o.paid_at,
    acceptsMarketing: o.accepts_marketing,
    pointsAwarded: o.points_awarded,
    items: items.map((i) => ({
      handle: i.product_handle,
      title: i.title,
      unitPrice: i.unit_price,
      qty: i.qty,
      size: i.size,
      shape: i.shape,
      customSizes: i.custom_sizes,
    })),
  };
}

/** Public order lookup: requires both order number and the checkout email. */
orders.get("/orders/track", async (c) => {
  const number = (c.req.query("number") ?? "").trim().replace(/^#/, "").toUpperCase();
  const email = (c.req.query("email") ?? "").trim();
  if (!number || !email) throw new HTTPException(400, { message: "Order number and email are required" });
  const row = await one<OrderRow>("SELECT * FROM orders WHERE number = $1 AND lower(email) = lower($2) AND payment_status != 'pending'", [number, email]);
  if (!row) throw new HTTPException(404, { message: "Order not found" });
  return c.json({ order: await orderJson(row) });
});
