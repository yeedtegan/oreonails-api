import { createHmac, timingSafeEqual } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.js";

/**
 * Payment gateways. Each one talks to the provider's REST API directly (no SDKs), and the amount
 * is always the server-computed order total — never a number sent by the browser.
 */

export type PaymentMethod = "card" | "paypal";

export const cardGateway = (): "stripe" | "test" | null =>
  config.stripe.secretKey ? "stripe" : config.testPayments ? "test" : null;
export const paypalEnabled = () => !!(config.paypal.clientId && config.paypal.clientSecret);

/** What the checkout page needs to render the payment options. */
export function publicPaymentConfig() {
  return {
    currency: config.currency,
    card: cardGateway(),
    stripePublishableKey: cardGateway() === "stripe" ? config.stripe.publishableKey : null,
    paypal: paypalEnabled(),
  };
}

const cents = (amount: number) => Math.round(amount * 100);

const declined = (message: string) => new HTTPException(402, { message });

/* ------------------------------------------------------------------ */
/* Test gateway — like Shopify's Bogus Gateway. No money moves.        */
/* ------------------------------------------------------------------ */

export const testCardSchemaHint = "4242 4242 4242 4242 succeeds; 4000 0000 0000 0002 is declined; 4000 0000 0000 9995 has insufficient funds.";

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(digits: string) {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^6(011|5)/.test(digits)) return "Discover";
  if (/^35/.test(digits)) return "JCB";
  if (/^3(0[0-5]|[68])/.test(digits)) return "Diners Club";
  if (/^62/.test(digits)) return "UnionPay";
  return "Card";
}

export interface TestCard {
  number: string;
  exp: string;
  cvc: string;
  name: string;
}

/** Validates and "charges" a test card. Returns the card label shown on the order, e.g. "Visa •••• 4242". */
export function chargeTestCard(card: TestCard) {
  const digits = card.number.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || !luhn(digits)) throw declined("Enter a valid card number");
  const [mm, yy] = card.exp.split("/").map((s) => Number(s.trim()));
  const now = new Date();
  const expEnd = new Date(2000 + yy, mm, 1); // first day of the month after expiry
  if (!(mm >= 1 && mm <= 12) || expEnd <= now) throw declined("Enter a valid expiration date");
  const brand = cardBrand(digits);
  if (!new RegExp(brand === "American Express" ? "^\\d{4}$" : "^\\d{3}$").test(card.cvc)) throw declined("Enter a valid security code");
  if (digits === "4000000000000002") throw declined("Your card was declined. Try a different card.");
  if (digits === "4000000000009995") throw declined("Your card has insufficient funds. Try a different card.");
  return `${brand} •••• ${digits.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Stripe — Payment Element (cards, Apple Pay, Google Pay, Link, BNPL) */
/* ------------------------------------------------------------------ */

async function stripe<T>(path: string, params?: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      ...(params && { "Content-Type": "application/x-www-form-urlencoded" }),
      ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error("Stripe error", res.status, data.error?.message);
    throw new HTTPException(502, { message: data.error?.message ?? "Payment provider error" });
  }
  return data;
}

export interface StripeIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  payment_method?: string | null;
  latest_charge?: string | { payment_method_details?: StripePmDetails } | null;
}
interface StripePmDetails {
  type: string;
  card?: { brand: string; last4: string; wallet?: { type: string } | null };
}

export function createStripeIntent(orderNumber: string, total: number, email: string) {
  return stripe<StripeIntent>(
    "/payment_intents",
    {
      amount: String(cents(total)),
      currency: config.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      "metadata[order]": orderNumber,
      receipt_email: email,
      description: `Order #${orderNumber}`,
    },
    `order-${orderNumber}`,
  );
}

export async function getStripeIntent(id: string) {
  return stripe<StripeIntent>(`/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`);
}

/** "Visa •••• 4242", "Apple Pay", "Klarna"… from a succeeded intent. */
export function stripeDetail(pi: StripeIntent) {
  const d = typeof pi.latest_charge === "object" ? pi.latest_charge?.payment_method_details : undefined;
  if (!d) return "Card";
  if (d.card) {
    const wallet = d.card.wallet?.type;
    const brand = d.card.brand.replace(/^amex$/, "American Express").replace(/^\w/, (c) => c.toUpperCase());
    const label = `${brand} •••• ${d.card.last4}`;
    return wallet ? `${wallet.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (${label})` : label;
  }
  return d.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Verifies the Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | undefined) {
  if (!config.stripe.webhookSecret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", config.stripe.webhookSecret).update(`${t}.${payload}`).digest();
  return header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .some((kv) => {
      const sig = Buffer.from(kv.slice(3), "hex");
      return sig.length === expected.length && timingSafeEqual(sig, expected);
    });
}

/* ------------------------------------------------------------------ */
/* PayPal — Orders v2, redirect flow                                   */
/* ------------------------------------------------------------------ */

const paypalBase = () => (config.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let paypalToken: { value: string; expires: number } | null = null;

async function paypalAccessToken() {
  if (paypalToken && paypalToken.expires > Date.now() + 60_000) return paypalToken.value;
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) {
    console.error("PayPal auth failed", res.status);
    throw new HTTPException(502, { message: "PayPal is unavailable right now" });
  }
  paypalToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 300) * 1000 };
  return paypalToken.value;
}

async function paypal<T>(path: string, body?: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${paypalBase()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${await paypalAccessToken()}`,
      "Content-Type": "application/json",
      ...(requestId && { "PayPal-Request-Id": requestId }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; details?: { issue?: string; description?: string }[] };
  if (!res.ok) {
    console.error("PayPal error", res.status, data.details?.[0]?.issue ?? data.message);
    // The buyer's funding source failed: send them back to PayPal to pick another.
    if (data.details?.[0]?.issue === "INSTRUMENT_DECLINED") throw declined("PayPal declined the payment. Try another payment method.");
    throw new HTTPException(502, { message: "PayPal is unavailable right now" });
  }
  return data;
}

export interface PaypalAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  countryCode: string;
}

export async function createPaypalOrder(orderNumber: string, total: number, ship: PaypalAddress, returnUrl: string, cancelUrl: string) {
  const res = await paypal<{ id: string; links: { rel: string; href: string }[] }>(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: orderNumber,
          invoice_id: orderNumber,
          description: `Oreo Nails order #${orderNumber}`,
          amount: { currency_code: config.currency, value: total.toFixed(2) },
          shipping: {
            name: { full_name: `${ship.firstName} ${ship.lastName}`.trim() },
            address: {
              address_line_1: ship.address1,
              ...(ship.address2 && { address_line_2: ship.address2 }),
              admin_area_2: ship.city,
              ...(ship.province && { admin_area_1: ship.province }),
              postal_code: ship.zip,
              country_code: ship.countryCode,
            },
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Oreo Nails",
            user_action: "PAY_NOW",
            shipping_preference: "SET_PROVIDED_ADDRESS",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
    `order-${orderNumber}`,
  );
  const approve = res.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approve) throw new HTTPException(502, { message: "PayPal is unavailable right now" });
  return { id: res.id, approveUrl: approve };
}

interface PaypalCapture {
  id: string;
  status: string;
  payer?: { email_address?: string };
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string } }[] } }[];
}

/** Captures an approved PayPal order. Returns the capture when it completed, otherwise null. */
export async function capturePaypalOrder(paypalOrderId: string, expectedTotal: number) {
  let order = await paypal<PaypalCapture>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  if (order.status === "APPROVED") {
    order = await paypal<PaypalCapture>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {}, `capture-${paypalOrderId}`);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") return null;
  if (Math.abs(Number(capture.amount.value) - expectedTotal) > 0.001) {
    console.error(`PayPal amount mismatch for ${paypalOrderId}: ${capture.amount.value} vs ${expectedTotal}`);
    return null;
  }
  return { captureId: capture.id, detail: order.payer?.email_address ? `PayPal (${order.payer.email_address})` : "PayPal" };
}
