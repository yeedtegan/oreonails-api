import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { all, one, Params, run, tx } from "../db/index.js";
import { toReview, type ReviewRow } from "../lib/mappers.js";
import { body, num } from "../lib/validate.js";
import type { AuthEnv } from "../lib/auth.js";

export const reviews = new Hono<AuthEnv>();

/** GET /reviews?product=handle&rating=5&limit=&offset= — returns list plus summary stats. */
reviews.get("/reviews", async (c) => {
  const product = c.req.query("product");
  const rating = num(c.req.query("rating"));

  const distArgs = new Params();
  const distWhere = product ? `WHERE r.product_handle = ${distArgs.add(product)}` : "";
  const dist = await all<{ rating: number; n: number }>(`SELECT rating, COUNT(*) AS n FROM reviews r ${distWhere} GROUP BY rating`, distArgs.values);
  const count = dist.reduce((s, d) => s + d.n, 0);
  const average = count ? dist.reduce((s, d) => s + d.rating * d.n, 0) / count : 0;

  const p = new Params();
  const where: string[] = [];
  if (product) where.push(`r.product_handle = ${p.add(product)}`);
  if (rating) where.push(`r.rating = ${p.add(rating)}`);
  const rows = await all<ReviewRow>(
    `SELECT r.*, p.title AS product_title FROM reviews r LEFT JOIN products p ON p.handle = r.product_handle
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC
     LIMIT ${p.add(Math.min(num(c.req.query("limit")) ?? 50, 100))} OFFSET ${p.add(num(c.req.query("offset")) ?? 0)}`,
    p.values,
  );

  return c.json({
    summary: {
      count,
      average: Math.round(average * 100) / 100,
      distribution: Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, dist.find((d) => d.rating === n)?.n ?? 0])),
    },
    reviews: rows.map(toReview),
  });
});

const reviewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
  product: z.string().max(100).optional(),
  variant: z.string().max(60).optional(),
});

reviews.post("/reviews", async (c) => {
  const input = await body(c, reviewSchema);
  if (input.product) {
    const exists = await one("SELECT 1 FROM products WHERE handle = $1", [input.product]);
    if (!exists) throw new HTTPException(400, { message: "Unknown product" });
  }
  const user = c.get("user");
  const id = randomUUID();

  await tx(async () => {
    await run("INSERT INTO reviews (id, product_handle, user_id, name, rating, title, body, variant) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
      id,
      input.product ?? null,
      user?.id ?? null,
      input.name,
      input.rating,
      input.title || "Review",
      input.body,
      input.variant ?? null,
    ]);
    // Fold the new rating into the product's running average.
    if (input.product) {
      await run(
        "UPDATE products SET rating = ROUND((rating * review_count + $1) / (review_count + 1), 2), review_count = review_count + 1 WHERE handle = $2",
        [input.rating, input.product],
      );
    }
  });

  const row = (await one<ReviewRow>("SELECT r.*, p.title AS product_title FROM reviews r LEFT JOIN products p ON p.handle = r.product_handle WHERE r.id = $1", [id]))!;
  return c.json({ review: toReview(row) }, 201);
});
