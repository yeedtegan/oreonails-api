import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { all, getSetting, one, Params, run, tx } from "../db/index.js";
import { config } from "../config.js";
import { requireAdmin } from "../lib/auth.js";
import { getProduct, listProducts } from "../lib/catalog.js";
import { toArticle, toCollection, toReview, type ArticleRow, type CollectionRow, type ReviewRow } from "../lib/mappers.js";
import { body, num } from "../lib/validate.js";
import { orderJson, ordersJson, type OrderRow } from "./orders.js";

/** Back-office API used by the web /admin pages. Requires `Authorization: Bearer $ADMIN_TOKEN`. */
export const admin = new Hono();
admin.use("/admin/*", requireAdmin);

const notFound = (what: string) => new HTTPException(404, { message: `${what} not found` });
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const checkHandle = (h: string) => {
  if (!HANDLE.test(h) || h.length > 100) throw new HTTPException(400, { message: "Handle must be lowercase letters, digits and dashes" });
  return h;
};
/** Integer path ids; anything else becomes a 404 instead of a Postgres type error. */
const intParam = (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2_147_483_647) throw new HTTPException(404, { message: "Not found" });
  return n;
};
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb colour");
const palette = z.tuple([color, color, color, color]);
const PATTERNS = ["solid", "french", "dots", "stripes", "stars", "plaid", "ombre", "hearts", "flowers", "leopard", "chrome", "lights"] as const;
// Only our own uploads or https URLs may be stored as images.
const imageUrl = z.string().max(500).regex(/^(\/uploads\/[\w.-]+|https:\/\/\S+)$/, "Image must be an uploaded file or an https URL");

/* ---------------- dashboard ---------------- */

admin.get("/admin/stats", async (c) => {
  const [s, recent] = await Promise.all([
    one<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM orders WHERE payment_status != 'pending') AS orders,
      (SELECT COUNT(*) FROM orders WHERE payment_status != 'pending' AND created_at >= now() - interval '30 days') AS orders30d,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status != 'pending' AND status != 'Cancelled') AS revenue,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status != 'pending' AND status != 'Cancelled' AND created_at >= now() - interval '30 days') AS revenue30d,
      (SELECT COUNT(*) FROM orders WHERE payment_status != 'pending' AND status IN ('Processing','In production')) AS "toFulfil",
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'pending' AND created_at >= now() - interval '30 days') AS "abandoned30d",
      (SELECT COUNT(*) FROM products WHERE active) AS products,
      (SELECT COUNT(*) FROM products WHERE NOT active) AS "hiddenProducts",
      (SELECT COUNT(*) FROM users) AS customers,
      (SELECT COUNT(*) FROM subscribers) AS subscribers,
      (SELECT COUNT(*) FROM contact_messages) AS messages,
      (SELECT COUNT(*) FROM reviews) AS reviews`),
    all<OrderRow>("SELECT * FROM orders WHERE payment_status != 'pending' ORDER BY created_at DESC LIMIT 5"),
  ]);
  return c.json({ ...s, recentOrders: await ordersJson(recent) });
});

/* ---------------- uploads ---------------- */

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" };
const MAX_UPLOAD = 8 * 1024 * 1024;

admin.post("/admin/uploads", async (c) => {
  const form = await c.req.parseBody().catch(() => {
    throw new HTTPException(400, { message: "Expected multipart form data" });
  });
  const file = form.file;
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Missing file" });
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new HTTPException(400, { message: "Only JPG, PNG, WebP, GIF or AVIF images are allowed" });
  if (file.size > MAX_UPLOAD) throw new HTTPException(413, { message: "Image must be 8 MB or smaller" });
  await mkdir(config.uploadsDir, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(join(config.uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  return c.json({ url: `/uploads/${name}` }, 201);
});

/* ---------------- products ---------------- */

admin.get("/admin/products", async (c) => {
  const q = c.req.query();
  return c.json(
    await listProducts({
      includeInactive: true,
      q: q.q,
      type: q.type || undefined,
      collection: q.collection || undefined,
      sort: q.sort ?? "newest",
      limit: num(q.limit) ?? 200,
      offset: num(q.offset),
    }),
  );
});

admin.get("/admin/products/:handle", async (c) => {
  const p = await getProduct(c.req.param("handle"), true);
  if (!p) throw notFound("Product");
  return c.json({ product: p });
});

const productSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(["set", "bundle", "tool"]),
  price: z.number().positive().max(100000),
  compareAt: z.number().positive().max(100000).nullable().optional(),
  palette,
  pattern: z.enum(PATTERNS),
  shape: z.string().min(1).max(20),
  description: z.string().max(5000).default(""),
  setsIncluded: z.number().int().positive().nullable().optional(),
  rank: z.number().int().default(1000),
  active: z.boolean().default(true),
  collections: z.array(z.string()).default([]),
  images: z.array(imageUrl).max(12).default([]),
});

/** Create or update a product (upsert by handle). */
admin.put("/admin/products/:handle", async (c) => {
  const handle = checkHandle(c.req.param("handle"));
  const p = await body(c, productSchema);
  if (p.compareAt != null && p.compareAt <= p.price) throw new HTTPException(400, { message: "Compare-at price must be higher than the price" });
  const known = new Set((await all<{ handle: string }>("SELECT handle FROM collections")).map((r) => r.handle));
  const unknown = p.collections.filter((h) => !known.has(h));
  if (unknown.length) throw new HTTPException(400, { message: `Unknown collections: ${unknown.join(", ")}` });

  await tx(async () => {
    await run(
      `INSERT INTO products (handle, title, type, price, compare_at, palette, pattern, shape, description, sets_included, rank, images, added, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT COALESCE(MAX(added), 0) + 1 FROM products), $13)
       ON CONFLICT(handle) DO UPDATE SET title = excluded.title, type = excluded.type, price = excluded.price,
         compare_at = excluded.compare_at, palette = excluded.palette, pattern = excluded.pattern, shape = excluded.shape,
         description = excluded.description, sets_included = excluded.sets_included, rank = excluded.rank,
         images = excluded.images, active = excluded.active`,
      [handle, p.title, p.type, p.price, p.compareAt ?? null, JSON.stringify(p.palette), p.pattern, p.shape, p.description,
        p.type === "bundle" ? (p.setsIncluded ?? null) : null, p.rank, JSON.stringify(p.images), p.active],
    );
    await run("DELETE FROM product_collections WHERE product_handle = $1", [handle]);
    const cols = new Set(p.type === "tool" ? p.collections : ["shop-all", ...p.collections]);
    for (const col of cols) {
      if (known.has(col)) await run("INSERT INTO product_collections (product_handle, collection_handle) VALUES ($1, $2)", [handle, col]);
    }
  });
  return c.json({ product: await getProduct(handle, true) });
});

admin.delete("/admin/products/:handle", async (c) => {
  const changed = await run("DELETE FROM products WHERE handle = $1", [c.req.param("handle")]);
  if (changed === 0) throw notFound("Product");
  return c.json({ ok: true });
});

/* ---------------- collections ---------------- */

admin.get("/admin/collections", async (c) => {
  const rows = await all<CollectionRow & { product_count: number; position: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_handle = c.handle) AS product_count
     FROM collections c ORDER BY c.position`,
  );
  return c.json({ collections: rows.map((r) => ({ ...toCollection(r), position: r.position, productCount: r.product_count })) });
});

const collectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  group: z.enum(["shop", "collection", "season", "other"]),
  palette,
  pattern: z.enum(PATTERNS),
  image: imageUrl.nullable().optional(),
  position: z.number().int().optional(),
});

admin.put("/admin/collections/:handle", async (c) => {
  const handle = checkHandle(c.req.param("handle"));
  const v = await body(c, collectionSchema);
  const row = (await one<CollectionRow>(
    `INSERT INTO collections (handle, title, description, grp, palette, pattern, image, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::int, (SELECT COALESCE(MAX(position), 0) + 1 FROM collections)))
     ON CONFLICT(handle) DO UPDATE SET title = excluded.title, description = excluded.description, grp = excluded.grp,
       palette = excluded.palette, pattern = excluded.pattern, image = excluded.image,
       position = COALESCE($8::int, collections.position)
     RETURNING *`,
    [handle, v.title, v.description, v.group, JSON.stringify(v.palette), v.pattern, v.image ?? null, v.position ?? null],
  ))!;
  return c.json({ collection: toCollection(row) });
});

admin.delete("/admin/collections/:handle", async (c) => {
  const handle = c.req.param("handle");
  if (handle === "shop-all") throw new HTTPException(400, { message: "The shop-all collection is required and can't be deleted" });
  const changed = await run("DELETE FROM collections WHERE handle = $1", [handle]);
  if (changed === 0) throw notFound("Collection");
  return c.json({ ok: true });
});

/* ---------------- articles ---------------- */

admin.get("/admin/articles", async (c) => {
  const rows = await all<ArticleRow>("SELECT * FROM articles ORDER BY date DESC");
  return c.json({ articles: rows.map((r) => toArticle(r)) });
});

const articleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().max(500).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  palette,
  pattern: z.enum(PATTERNS),
  image: imageUrl.nullable().optional(),
  body: z.array(z.string().max(5000)).max(200),
});

admin.put("/admin/articles/:slug", async (c) => {
  const slug = checkHandle(c.req.param("slug"));
  const a = await body(c, articleSchema);
  const row = (await one<ArticleRow>(
    `INSERT INTO articles (slug, tags, title, excerpt, date, palette, pattern, image, body) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(slug) DO UPDATE SET tags = excluded.tags, title = excluded.title, excerpt = excluded.excerpt, date = excluded.date,
       palette = excluded.palette, pattern = excluded.pattern, image = excluded.image, body = excluded.body
     RETURNING *`,
    [slug, JSON.stringify(a.tags), a.title, a.excerpt, a.date, JSON.stringify(a.palette), a.pattern, a.image ?? null, JSON.stringify(a.body.filter((p) => p.trim()))],
  ))!;
  return c.json({ article: toArticle(row) });
});

admin.delete("/admin/articles/:slug", async (c) => {
  const changed = await run("DELETE FROM articles WHERE slug = $1", [c.req.param("slug")]);
  if (changed === 0) throw notFound("Article");
  return c.json({ ok: true });
});

/* ---------------- FAQs ---------------- */

admin.get("/admin/faqs", async (c) => c.json({ faqs: await all("SELECT id, q, a, category, position FROM faqs ORDER BY position, id") }));

const faqSchema = z.object({
  q: z.string().trim().min(1).max(300),
  a: z.string().trim().min(1).max(3000),
  category: z.string().trim().min(1).max(80),
  position: z.number().int().optional(),
});

admin.post("/admin/faqs", async (c) => {
  const f = await body(c, faqSchema);
  const faq = await one(
    `INSERT INTO faqs (q, a, category, position) VALUES ($1, $2, $3, COALESCE($4::int, (SELECT COALESCE(MAX(position), 0) + 1 FROM faqs)))
     RETURNING id, q, a, category, position`,
    [f.q, f.a, f.category, f.position ?? null],
  );
  return c.json({ faq }, 201);
});

admin.put("/admin/faqs/:id", async (c) => {
  const f = await body(c, faqSchema);
  const faq = await one(
    "UPDATE faqs SET q = $1, a = $2, category = $3, position = COALESCE($4::int, position) WHERE id = $5 RETURNING id, q, a, category, position",
    [f.q, f.a, f.category, f.position ?? null, intParam(c.req.param("id"))],
  );
  if (!faq) throw notFound("FAQ");
  return c.json({ faq });
});

admin.delete("/admin/faqs/:id", async (c) => {
  const changed = await run("DELETE FROM faqs WHERE id = $1", [intParam(c.req.param("id"))]);
  if (changed === 0) throw notFound("FAQ");
  return c.json({ ok: true });
});

/* ---------------- reviews ---------------- */

admin.get("/admin/reviews", async (c) => {
  const [count, rows] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(*) n FROM reviews"),
    all<ReviewRow>(
      "SELECT r.*, p.title AS product_title FROM reviews r LEFT JOIN products p ON p.handle = r.product_handle ORDER BY r.created_at DESC LIMIT $1 OFFSET $2",
      [Math.min(num(c.req.query("limit")) ?? 100, 200), num(c.req.query("offset")) ?? 0],
    ),
  ]);
  return c.json({ total: count!.n, reviews: rows.map(toReview) });
});

/** Delete a review and take its rating back out of the product's running average. */
admin.delete("/admin/reviews/:id", async (c) => {
  await tx(async () => {
    // DELETE … RETURNING makes the lookup and delete one step, so concurrent deletes can't double-subtract.
    const r = await one<{ product_handle: string | null; rating: number }>("DELETE FROM reviews WHERE id = $1 RETURNING product_handle, rating", [c.req.param("id")]);
    if (!r) throw notFound("Review");
    if (r.product_handle) {
      await run(
        `UPDATE products SET rating = CASE WHEN review_count > 1 THEN ROUND((rating * review_count - $1) / (review_count - 1), 2) ELSE 0 END,
           review_count = GREATEST(review_count - 1, 0) WHERE handle = $2`,
        [r.rating, r.product_handle],
      );
    }
  });
  return c.json({ ok: true });
});

/* ---------------- orders ---------------- */

const STATUSES = ["Processing", "In production", "Shipped", "Delivered", "Cancelled"] as const;

admin.get("/admin/orders", async (c) => {
  const status = c.req.query("status");
  const q = c.req.query("q")?.trim();
  const where: string[] = [];
  const p = new Params();
  if (status) where.push(`status = ${p.add(status)}`);
  // Unpaid checkouts are listed separately (?payment=pending), like Shopify's "Abandoned checkouts".
  where.push(c.req.query("payment") === "pending" ? "payment_status = 'pending'" : "payment_status != 'pending'");
  if (q) {
    const like = p.add(`%${q.replace(/[%_\\]/g, "")}%`);
    where.push(`(number ILIKE ${like} OR email ILIKE ${like} OR name ILIKE ${like})`);
  }
  const rows = await all<OrderRow>(
    `SELECT * FROM orders ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ${p.add(Math.min(num(c.req.query("limit")) ?? 200, 500))}`,
    p.values,
  );
  return c.json({ orders: await ordersJson(rows) });
});

admin.patch("/admin/orders/:number", async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(STATUSES) }));
  const row = await one<OrderRow>("UPDATE orders SET status = $1 WHERE number = $2 RETURNING *", [status, c.req.param("number")]);
  if (!row) throw notFound("Order");
  return c.json({ order: await orderJson(row) });
});

/* ---------------- discounts & settings ---------------- */

admin.get("/admin/discounts", async (c) => c.json({ discounts: await all("SELECT code, percent, active FROM discount_codes ORDER BY code") }));

admin.put("/admin/discounts/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HTTPException(400, { message: "Code must be 3–30 letters, digits, - or _" });
  const v = await body(c, z.object({ percent: z.number().min(1).max(100), active: z.boolean().default(true) }));
  await run(
    "INSERT INTO discount_codes (code, percent, active) VALUES ($1, $2, $3) ON CONFLICT(code) DO UPDATE SET percent = excluded.percent, active = excluded.active",
    [code, v.percent, v.active],
  );
  return c.json({ discount: { code, ...v } });
});

admin.delete("/admin/discounts/:code", async (c) => {
  const changed = await run("DELETE FROM discount_codes WHERE code = $1", [c.req.param("code").toUpperCase()]);
  if (changed === 0) throw notFound("Discount code");
  return c.json({ ok: true });
});

const settingsSchema = z.object({
  freeShippingThreshold: z.number().min(0).max(10000).optional(),
  shippingFee: z.number().min(0).max(1000).optional(),
  expressShippingFee: z.number().min(0).max(1000).optional(),
  promoTiers: z
    .array(z.object({ buy: z.number().int().min(1).max(50), get: z.number().int().min(1).max(50) }))
    .max(6)
    .optional(),
});

const readSettings = async () => ({
  freeShippingThreshold: await getSetting("freeShippingThreshold", 69),
  shippingFee: await getSetting("shippingFee", 5.99),
  expressShippingFee: await getSetting("expressShippingFee", 14.99),
  promoTiers: await getSetting<{ buy: number; get: number }[]>("promoTiers", []),
});

admin.get("/admin/settings", async (c) => c.json({ settings: await readSettings() }));

admin.put("/admin/settings", async (c) => {
  const v = await body(c, settingsSchema);
  if (v.promoTiers) v.promoTiers.sort((a, b) => a.buy + a.get - (b.buy + b.get));
  await tx(async () => {
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) {
        await run("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, JSON.stringify(val)]);
      }
    }
  });
  return c.json({ settings: await readSettings() });
});

/* ---------------- inbox ---------------- */

admin.get("/admin/messages", async (c) => c.json({ messages: await all("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 500") }));
admin.delete("/admin/messages/:id", async (c) => {
  const changed = await run("DELETE FROM contact_messages WHERE id = $1", [intParam(c.req.param("id"))]);
  if (changed === 0) throw notFound("Message");
  return c.json({ ok: true });
});
admin.get("/admin/subscribers", async (c) => c.json({ subscribers: await all("SELECT * FROM subscribers ORDER BY created_at DESC") }));
