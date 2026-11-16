import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { NOW, one, run, tx } from "../db/index.js";
import { quote } from "../lib/pricing.js";
import { body } from "../lib/validate.js";
import { config } from "../config.js";
import type { AuthEnv } from "../lib/auth.js";
import {
  capturePaypalOrder,
  cardGateway,
  chargeTestCard,
  createPaypalOrder,
  createStripeIntent,
  getStripeIntent,
  paypalEnabled,
  publicPaymentConfig,
  stripeDetail,
  verifyStripeSignature,
  type StripeIntent,
} from "../lib/payments.js";
import { orderJson, quoteSchema, type Address, type OrderRow } from "./orders.js";

/**
 * One-page checkout, modelled on Shopify's: contact → delivery → shipping method → payment.
 *
 * Orders are created before payment as `payment_status = 'pending'` (Shopify's "abandoned checkout")
 * and flip to `paid` only after the gateway confirms the charge. Each order gets a random access key
 * so its thank-you page can be opened without an account.
 */
export const checkout = new Hono<AuthEnv>();

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const addressSchema = z.object({
  firstName: opt(60),
  lastName: z.string().trim().min(1).max(60),
  company: opt(120),
  address1: z.string().trim().min(1).max(200),
  address2: opt(200),
  city: z.string().trim().min(1).max(100),
  province: opt(100),
  zip: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(80),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  phone: opt(40),
});

const checkoutSchema = quoteSchema.extend({
  email: z.string().trim().email().max(200),
  acceptsMarketing: z.boolean().default(false),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(), // omitted = same as shipping
  method: z.enum(["card", "paypal"]),
  // Only for the built-in test gateway. Real card numbers go straight from the browser to Stripe.
  card: z
    .object({
      number: z.string().max(30),
      exp: z.string().max(10),
      cvc: z.string().max(4),
      name: z.string().trim().min(1).max(120),
    })
    .optional(),
});

const fullName = (a: Address) => [a.firstName, a.lastName].filter(Boolean).join(" ");
const formatAddress = (a: Address) =>
  [a.company, a.address1, a.address2, [a.city, a.province, a.zip].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");

async function newOrderNumber() {
  for (;;) {
    const n = "ON" + randomInt(100000, 1000000);
    if (!(await one("SELECT 1 FROM orders WHERE number = $1", [n]))) return n;
  }
}

checkout.get("/checkout/config", (c) => c.json(publicPaymentConfig()));

checkout.post("/checkout", async (c) => {
  const input = await body(c, checkoutSchema);
  const q = await quote(input.items, input.code, input.shippingRate);
  if (q.problems.length) {
    throw new HTTPException(400, { res: Response.json({ error: "Some cart items are no longer available", problems: q.problems }, { status: 400 }) });
  }
  if (q.lines.length === 0) throw new HTTPException(400, { message: "Your cart is empty" });
  if (input.code && !q.codeValid) throw new HTTPException(400, { message: "Enter a valid discount code" });

  const gateway = input.method === "paypal" ? (paypalEnabled() ? "paypal" : null) : cardGateway();
  if (!gateway) throw new HTTPException(400, { message: "This payment method isn't available" });

  // The test gateway "charges" before the order exists, so a declined card leaves nothing behind.
  let testDetail: string | undefined;
  if (gateway === "test") {
    if (!input.card) throw new HTTPException(400, { message: "Enter your card details" });
    testDetail = chargeTestCard(input.card);
  }

  const user = c.get("user");
  const number = await newOrderNumber();
  const key = randomBytes(24).toString("base64url");
  const ship = input.shippingAddress;
  const bill = input.billingAddress ?? ship;
  const rate = q.shippingRates.find((r) => r.id === q.shippingRate)!;

  await tx(async () => {
    await run(
      `INSERT INTO orders (number, user_id, email, name, address, phone, subtotal, promo_discount, code, code_discount, shipping, total,
         shipping_address, billing_address, shipping_method, payment_method, payment_status, payment_provider, access_key, accepts_marketing)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', $17, $18, $19)`,
      [
        number,
        user?.id ?? null,
        input.email,
        fullName(ship),
        formatAddress(ship),
        ship.phone ?? null,
        q.subtotal,
        q.promoDiscount,
        q.code,
        q.codeDiscount,
        q.shipping,
        q.total,
        JSON.stringify(ship),
        JSON.stringify(bill),
        rate.title,
        input.method,
        gateway,
        key,
        input.acceptsMarketing,
      ],
    );
    for (const l of q.lines) {
      await run(
        "INSERT INTO order_items (order_number, product_handle, title, unit_price, qty, size, shape, custom_sizes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [number, l.handle, l.product.title, l.product.price, l.qty, l.size ?? null, l.shape ?? null, l.customSizes ?? null],
      );
    }
    if (input.acceptsMarketing) await run("INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT DO NOTHING", [input.email]);
  });

  if (gateway === "test") {
    await markPaid(number, null, testDetail!);
    return c.json({ number, key, next: { type: "done" } }, 201);
  }

  if (gateway === "stripe") {
    const pi = await createStripeIntent(number, q.total, input.email);
    await run("UPDATE orders SET payment_ref = $1 WHERE number = $2", [pi.id, number]);
    return c.json({ number, key, next: { type: "stripe", clientSecret: pi.client_secret } }, 201);
  }

  const thanks = `${config.webUrl}/checkout/thank-you?order=${number}&key=${key}`;
  const pp = await createPaypalOrder(number, q.total, { ...ship, firstName: ship.firstName ?? "" }, thanks, `${config.webUrl}/checkout?cancelled=1`);
  await run("UPDATE orders SET payment_ref = $1 WHERE number = $2", [pp.id, number]);
  return c.json({ number, key, next: { type: "redirect", url: pp.approveUrl } }, 201);
});

/** Marks a pending order paid (idempotent) and awards loyalty points once. */
async function markPaid(number: string, ref: string | null, detail: string) {
  await tx(async () => {
    const row = await one<{ user_id: number | null; total: number }>(
      `UPDATE orders SET payment_status = 'paid', paid_at = ${NOW}, payment_detail = $2, payment_ref = COALESCE($3, payment_ref)
       WHERE number = $1 AND payment_status = 'pending' RETURNING user_id, total`,
      [number, detail, ref],
    );
    if (row?.user_id) {
      const points = Math.floor(row.total * config.pointsPerDollar);
      await run("UPDATE users SET points = points + $1 WHERE id = $2", [points, row.user_id]);
      await run("UPDATE orders SET points_awarded = $1 WHERE number = $2", [points, number]);
    }
  });
}

/** A Stripe intent only pays an order when it belongs to it and covers the full total. */
const stripeIntentPays = (pi: StripeIntent, o: OrderRow) =>
  pi.status === "succeeded" && pi.metadata.order === o.number && pi.amount === Math.round(o.total * 100) && pi.currency === config.currency.toLowerCase();

async function orderByKey(number: string, key: string | undefined) {
  if (!key) throw new HTTPException(404, { message: "Order not found" });
  const o = await one<OrderRow>("SELECT * FROM orders WHERE number = $1 AND access_key = $2", [number, key]);
  if (!o) throw new HTTPException(404, { message: "Order not found" });
  return o;
}

const publicOrder = async (o: OrderRow) => ({ order: await orderJson(o) });

/** Thank-you page data. */
checkout.get("/checkout/orders/:number", async (c) => c.json(await publicOrder(await orderByKey(c.req.param("number"), c.req.query("key")))));

/**
 * Called by the thank-you page after the customer returns from the gateway. Confirms the payment with
 * the provider (never trusting the browser) and marks the order paid.
 */
checkout.post("/checkout/orders/:number/complete", async (c) => {
  const { key } = await body(c, z.object({ key: z.string().max(100) }));
  let o = await orderByKey(c.req.param("number"), key);

  if (o.payment_status === "pending" && o.payment_ref) {
    if (o.payment_provider === "stripe") {
      const pi = await getStripeIntent(o.payment_ref);
      if (stripeIntentPays(pi, o)) await markPaid(o.number, pi.id, stripeDetail(pi));
    } else if (o.payment_provider === "paypal") {
      const captured = await capturePaypalOrder(o.payment_ref, o.total);
      if (captured) await markPaid(o.number, null, captured.detail);
    }
    o = (await one<OrderRow>("SELECT * FROM orders WHERE number = $1", [o.number]))!;
  }
  return c.json(await publicOrder(o));
});

/** Stripe webhook — the source of truth if the customer closes the tab before returning. */
checkout.post("/webhooks/stripe", async (c) => {
  const payload = await c.req.text();
  if (!verifyStripeSignature(payload, c.req.header("Stripe-Signature"))) throw new HTTPException(400, { message: "Invalid signature" });
  const event = JSON.parse(payload) as { type: string; data: { object: StripeIntent } };
  if (event.type === "payment_intent.succeeded") {
    const number = event.data.object.metadata?.order;
    const o = number ? await one<OrderRow>("SELECT * FROM orders WHERE number = $1 AND payment_ref = $2", [number, event.data.object.id]) : undefined;
    if (o && o.payment_status === "pending") {
      const pi = await getStripeIntent(event.data.object.id); // re-fetch with the charge expanded
      if (stripeIntentPays(pi, o)) await markPaid(o.number, pi.id, stripeDetail(pi));
    }
  }
  return c.json({ received: true });
});
