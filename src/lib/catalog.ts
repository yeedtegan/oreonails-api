import { all, Params } from "../db/index.js";
import { toProduct, type ProductRow } from "./mappers.js";

const BASE = `
  SELECT p.*, (SELECT array_agg(collection_handle) FROM product_collections pc WHERE pc.product_handle = p.handle) AS collections
  FROM products p`;

export const SORTS: Record<string, string> = {
  featured: "p.rank ASC, p.added DESC",
  newest: "p.added DESC",
  "price-asc": "p.price ASC",
  "price-desc": "p.price DESC",
  rating: "p.rating DESC",
};

export interface ProductQuery {
  collection?: string;
  q?: string;
  type?: string;
  handles?: string[];
  onSale?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  limit?: number;
  offset?: number;
  /** Admin only: include hidden (inactive) products. */
  includeInactive?: boolean;
}

/** Filterable product listing. All values are bound as parameters. */
export async function listProducts(f: ProductQuery = {}) {
  const where = f.includeInactive ? ["TRUE"] : ["p.active"];
  const p = new Params();

  if (f.collection) {
    where.push(`EXISTS (SELECT 1 FROM product_collections pc WHERE pc.product_handle = p.handle AND pc.collection_handle = ${p.add(f.collection)})`);
  }
  if (f.type) where.push(`p.type = ${p.add(f.type)}`);
  if (f.handles?.length) where.push(`p.handle IN (${f.handles.map((h) => p.add(h)).join(",")})`);
  if (f.onSale) where.push("p.compare_at IS NOT NULL");
  if (f.minPrice != null) where.push(`p.price >= ${p.add(f.minPrice)}`);
  if (f.maxPrice != null) where.push(`p.price <= ${p.add(f.maxPrice)}`);
  if (f.q?.trim()) {
    const like = p.add(`%${f.q.trim().replace(/[%_\\]/g, "")}%`);
    where.push(`(p.title ILIKE ${like} OR p.description ILIKE ${like} OR p.pattern ILIKE ${like}
      OR EXISTS (SELECT 1 FROM product_collections pc JOIN collections c ON c.handle = pc.collection_handle
                 WHERE pc.product_handle = p.handle AND (c.title ILIKE ${like} OR c.handle ILIKE ${like})))`);
  }

  const order = SORTS[f.sort ?? "featured"] ?? SORTS.featured;
  const whereSql = where.join(" AND ");
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
  const filterArgs = [...p.values];
  const [count, rows] = await Promise.all([
    all<{ n: number }>(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`, filterArgs),
    all<ProductRow>(`${BASE} WHERE ${whereSql} ORDER BY ${order}, p.handle LIMIT ${p.add(limit)} OFFSET ${p.add(f.offset ?? 0)}`, p.values),
  ]);

  return { total: count[0].n, products: rows.map(toProduct) };
}

export async function getProduct(handle: string, includeInactive = false) {
  const rows = await all<ProductRow>(`${BASE} WHERE p.handle = $1${includeInactive ? "" : " AND p.active"}`, [handle]);
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function getProductsByHandles(handles: string[]) {
  const { products } = await listProducts({ handles: [...new Set(handles)], limit: 200 });
  return new Map(products.map((p) => [p.handle, p]));
}
