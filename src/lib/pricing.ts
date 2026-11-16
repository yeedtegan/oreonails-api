import { z } from "zod";
import { getSetting, one } from "../db/index.js";
import { getProductsByHandles } from "./catalog.js";
import type { Product } from "./mappers.js";

export const cartItemSchema = z.object({
  handle: z.string().min(1).max(100),
  qty: z.number().int().min(1).max(50),
  size: z.string().max(20).optional(),
  shape: z.string().max(20).optional(),
  customSizes: z.string().max(60).optional(),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export interface PromoTier {
  buy: number;
  get: number;
}

export const SHIPPING_RATES = ["standard", "express"] as const;
export type ShippingRateId = (typeof SHIPPING_RATES)[number];

const round = (n: number) => Math.round(n * 100) / 100;

export const lineKey = (i: CartItemInput) => [i.handle, i.size ?? "", i.shape ?? "", i.customSizes ?? ""].join("|");

export function freeSetsFor(count: number, tiers: PromoTier[]) {
  let free = 0;
  for (const t of tiers) if (count >= t.buy + t.get) free = t.get;
  return free;
}

/** Why a cart line can't be bought, or null when it's valid. */
function lineProblem(item: CartItemInput, product: Product | undefined, sizes: string[], shapes: string[]) {
  if (!product) return "Product is no longer available";
  if (product.type !== "set") return null;
  if (!item.size || !sizes.includes(item.size)) return "Choose a valid size";
  if (!item.shape || !shapes.includes(item.shape)) return "Choose a valid shape";
  if (item.size === "Custom") {
    const parts = item.customSizes?.replace(/mm$/, "").split("-").map(Number) ?? [];
    if (parts.length !== 5 || parts.some((n) => !(n >= 6 && n <= 20))) return "Custom size needs 5 measurements between 6 and 20 mm";
  }
  return null;
}

/**
 * Server-authoritative cart pricing. Prices always come from the DB, never from the client.
 * Invalid lines are returned in `problems` and excluded from totals.
 */
export async function quote(items: CartItemInput[], code?: string, shippingRate: ShippingRateId = "standard") {
  const [tiers, freeShippingThreshold, shippingFee, expressShippingFee, sizes, shapes] = await Promise.all([
    getSetting<PromoTier[]>("promoTiers", []),
    getSetting("freeShippingThreshold", 69),
    getSetting("shippingFee", 5.99),
    getSetting("expressShippingFee", 14.99),
    getSetting<string[]>("sizes", []),
    getSetting<string[]>("shapes", []),
  ]);

  // Merge duplicate lines.
  const merged = new Map<string, CartItemInput>();
  for (const i of items) {
    const k = lineKey(i);
    const cur = merged.get(k);
    merged.set(k, cur ? { ...cur, qty: cur.qty + i.qty } : { ...i });
  }

  const products = await getProductsByHandles([...merged.values()].map((i) => i.handle));
  const problems: { key: string; handle: string; error: string }[] = [];
  const lines = [];
  for (const [key, item] of merged) {
    const product = products.get(item.handle);
    const error = lineProblem(item, product, sizes, shapes);
    if (error || !product) {
      problems.push({ key, handle: item.handle, error: error ?? "Unavailable" });
      continue;
    }
    const isSet = product.type === "set";
    lines.push({
      key,
      handle: item.handle,
      qty: item.qty,
      ...(isSet && { size: item.size, shape: item.shape }),
      ...(isSet && item.size === "Custom" && { customSizes: item.customSizes }),
      product,
      lineTotal: round(product.price * item.qty),
    });
  }

  const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0));

  // Mix & match: the cheapest eligible sets are free.
  const unitPrices = lines
    .filter((l) => l.product.type === "set")
    .flatMap((l) => Array<number>(l.qty).fill(l.product.price))
    .sort((a, b) => a - b);
  const setCount = unitPrices.length;
  const freeCount = freeSetsFor(setCount, tiers);
  const promoDiscount = round(unitPrices.slice(0, freeCount).reduce((s, p) => s + p, 0));

  const normalized = code?.trim().toUpperCase() || undefined;
  const codeRow = normalized
    ? await one<{ code: string; percent: number }>("SELECT code, percent FROM discount_codes WHERE code = $1 AND active", [normalized])
    : undefined;
  const codeDiscount = codeRow ? round(((subtotal - promoDiscount) * codeRow.percent) / 100) : 0;

  const afterDiscounts = round(subtotal - promoDiscount - codeDiscount);
  const freeStandard = afterDiscounts >= freeShippingThreshold;
  const shippingRates = [
    { id: "standard" as const, title: "Standard Shipping", detail: "Crafted in 2–3 business days, then 5–8 business days", price: freeStandard ? 0 : shippingFee },
    { id: "express" as const, title: "Express Shipping", detail: "Crafted in 2–3 business days, then 2–4 business days", price: expressShippingFee },
  ];
  const rate = shippingRates.find((r) => r.id === shippingRate) ?? shippingRates[0];
  const shipping = lines.length === 0 ? 0 : rate.price;
  const next = tiers.find((t) => setCount < t.buy + t.get);

  return {
    lines,
    problems,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
    setCount,
    freeCount,
    promoDiscount,
    code: codeRow?.code ?? null,
    codeValid: !!codeRow,
    codePercent: codeRow?.percent ?? 0,
    codeDiscount,
    shipping,
    shippingRate: rate.id,
    shippingRates,
    total: round(Math.max(0, afterDiscounts + shipping)),
    freeShippingThreshold,
    toFreeShipping: round(Math.max(0, freeShippingThreshold - afterDiscounts)),
    nextTier: next ? { ...next, setsNeeded: next.buy + next.get - setCount } : null,
  };
}
export type Quote = Awaited<ReturnType<typeof quote>>;
