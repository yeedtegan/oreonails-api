// Row → API JSON shapes (camelCase, parsed JSON columns, 0/1 → boolean).

export interface ProductRow {
  handle: string;
  title: string;
  type: "set" | "bundle" | "tool";
  price: number;
  compare_at: number | null;
  palette: string;
  pattern: string;
  shape: string;
  rating: number;
  review_count: number;
  description: string;
  sets_included: number | null;
  rank: number;
  added: number;
  images: string;
  active: number;
  collections: string | null; // GROUP_CONCAT
}

export function toProduct(r: ProductRow) {
  return {
    handle: r.handle,
    title: r.title,
    type: r.type,
    price: r.price,
    ...(r.compare_at != null && { compareAt: r.compare_at }),
    palette: JSON.parse(r.palette) as [string, string, string, string],
    pattern: r.pattern,
    shape: r.shape,
    rating: r.rating,
    reviewCount: r.review_count,
    description: r.description,
    ...(r.sets_included != null && { setsIncluded: r.sets_included }),
    rank: r.rank,
    added: r.added,
    collections: r.collections ? r.collections.split(",") : [],
    images: JSON.parse(r.images || "[]") as string[],
    active: r.active !== 0,
  };
}
export type Product = ReturnType<typeof toProduct>;

export interface CollectionRow {
  handle: string;
  title: string;
  description: string;
  grp: string;
  palette: string;
  pattern: string;
  image: string | null;
  position?: number;
}
export const toCollection = (r: CollectionRow) => ({
  handle: r.handle,
  title: r.title,
  description: r.description,
  group: r.grp,
  palette: JSON.parse(r.palette) as string[],
  pattern: r.pattern,
  image: r.image ?? null,
});

export interface ReviewRow {
  id: string;
  product_handle: string | null;
  name: string;
  rating: number;
  title: string;
  body: string;
  variant: string | null;
  created_at: string;
  product_title?: string | null;
}
export const toReview = (r: ReviewRow) => ({
  id: r.id,
  name: r.name,
  rating: r.rating,
  title: r.title,
  body: r.body,
  ...(r.product_handle && { product: r.product_handle }),
  ...(r.product_title && { productTitle: r.product_title }),
  ...(r.variant && { variant: r.variant }),
  date: r.created_at,
});

export interface ArticleRow {
  slug: string;
  tags: string;
  title: string;
  excerpt: string;
  date: string;
  palette: string;
  pattern: string;
  image: string | null;
  body: string;
}
export const toArticle = (r: ArticleRow, withBody = true) => ({
  slug: r.slug,
  tags: JSON.parse(r.tags || "[]") as string[],
  title: r.title,
  excerpt: r.excerpt,
  date: r.date,
  palette: JSON.parse(r.palette) as string[],
  pattern: r.pattern,
  image: r.image ?? null,
  ...(withBody && { body: JSON.parse(r.body) as string[] }),
});
