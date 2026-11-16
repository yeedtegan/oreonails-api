import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { all, getSetting, one } from "../db/index.js";
import { getProduct, listProducts } from "../lib/catalog.js";
import { toArticle, toCollection, type ArticleRow, type CollectionRow } from "../lib/mappers.js";
import { num } from "../lib/validate.js";

export const catalog = new Hono();

/** Store-wide settings the storefront needs. */
catalog.get("/site", async (c) => {
  const [promoTiers, freeShippingThreshold, shippingFee, sizes, shapes] = await Promise.all([
    getSetting("promoTiers", []),
    getSetting("freeShippingThreshold", 69),
    getSetting("shippingFee", 5.99),
    getSetting("sizes", []),
    getSetting("shapes", []),
  ]);
  return c.json({ promoTiers, freeShippingThreshold, shippingFee, sizes, shapes });
});

catalog.get("/collections", async (c) => {
  const group = c.req.query("group");
  const rows = group
    ? await all<CollectionRow>("SELECT * FROM collections WHERE grp = $1 ORDER BY position", [group])
    : await all<CollectionRow>("SELECT * FROM collections ORDER BY position");
  return c.json({ collections: rows.map(toCollection) });
});

catalog.get("/collections/:handle", async (c) => {
  const row = await one<CollectionRow>("SELECT * FROM collections WHERE handle = $1", [c.req.param("handle")]);
  if (!row) throw new HTTPException(404, { message: "Collection not found" });
  const q = c.req.query();
  const sort = q.sort ?? (row.handle === "new-arrivals" ? "newest" : "featured");
  const { products, total } = await listProducts({
    collection: row.handle,
    sort,
    onSale: q.onSale === "1",
    minPrice: num(q.minPrice),
    maxPrice: num(q.maxPrice),
    limit: num(q.limit),
    offset: num(q.offset),
  });
  return c.json({ collection: toCollection(row), total, products });
});

/**
 * GET /products?collection=&q=&type=&handles=a,b&sort=&onSale=1&minPrice=&maxPrice=&limit=&offset=
 */
catalog.get("/products", async (c) => {
  const q = c.req.query();
  return c.json(
    await listProducts({
      collection: q.collection,
      q: q.q,
      type: q.type,
      handles: q.handles ? q.handles.split(",").filter(Boolean).slice(0, 200) : undefined,
      sort: q.sort,
      onSale: q.onSale === "1",
      minPrice: num(q.minPrice),
      maxPrice: num(q.maxPrice),
      limit: num(q.limit),
      offset: num(q.offset),
    }),
  );
});

catalog.get("/products/:handle", async (c) => {
  const product = await getProduct(c.req.param("handle"));
  if (!product) throw new HTTPException(404, { message: "Product not found" });

  // Related: same type, sharing a non-"shop-all" collection, best-ranked first.
  const shared = product.collections.filter((h) => h !== "shop-all");
  const related = shared.length
    ? (await listProducts({ type: product.type, sort: "featured", limit: 50 })).products
        .filter((p) => p.handle !== product.handle && p.collections.some((h) => shared.includes(h)))
        .slice(0, 8)
    : [];
  return c.json({ product, related });
});

catalog.get("/articles", async (c) => {
  const rows = await all<ArticleRow>("SELECT * FROM articles ORDER BY date DESC LIMIT $1", [Math.min(num(c.req.query("limit")) ?? 50, 200)]);
  return c.json({ articles: rows.map((r) => toArticle(r, false)) });
});

catalog.get("/articles/:slug", async (c) => {
  const row = await one<ArticleRow>("SELECT * FROM articles WHERE slug = $1", [c.req.param("slug")]);
  if (!row) throw new HTTPException(404, { message: "Article not found" });
  return c.json({ article: toArticle(row) });
});

catalog.get("/faqs", async (c) => {
  const faqs = await all("SELECT q, a, category FROM faqs ORDER BY position");
  return c.json({ faqs });
});
