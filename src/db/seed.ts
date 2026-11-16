import { config } from "../config.js";
import { migrate, pool, run, tx } from "./index.js";
import { COLLECTIONS, FAQS, PRODUCTS, PROMO_TIERS, REVIEWS, SHAPES, SITE, SIZES, ARTICLES } from "./seed-data.js";

const TABLES = [
  "order_items", "orders", "sessions", "reviews", "product_collections", "products", "collections",
  "articles", "faqs", "settings", "discount_codes", "users", "subscribers", "contact_messages",
];

/** Wipes every table and loads the seed data. Runs automatically when the DB is empty. */
export async function seed() {
  await tx(async () => {
    await run(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const [i, c] of COLLECTIONS.entries()) {
      await run("INSERT INTO collections (handle, title, description, grp, palette, pattern, position) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
        c.handle, c.title, c.description, c.group, JSON.stringify(c.palette), c.pattern, i,
      ]);
    }

    for (const p of PRODUCTS) {
      await run(
        `INSERT INTO products (handle, title, type, price, compare_at, palette, pattern, shape, rating, review_count, description, sets_included, rank, added)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [p.handle, p.title, p.type, p.price, p.compareAt ?? null, JSON.stringify(p.palette), p.pattern, p.shape, Math.round(p.rating * 100) / 100,
          p.reviewCount, p.description, p.setsIncluded ?? null, p.rank, p.added],
      );
      for (const c of p.collections) await run("INSERT INTO product_collections (product_handle, collection_handle) VALUES ($1, $2)", [p.handle, c]);
    }

    for (const r of REVIEWS) {
      await run("INSERT INTO reviews (id, product_handle, name, rating, title, body, variant, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
        r.id, r.product ?? null, r.name, r.rating, r.title, r.body, r.variant ?? null, new Date(r.date).toISOString(),
      ]);
    }

    for (const a of ARTICLES) {
      await run("INSERT INTO articles (slug, tags, title, excerpt, date, palette, pattern, body) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
        a.slug, JSON.stringify(a.tags), a.title, a.excerpt, a.date, JSON.stringify(a.palette), a.pattern, JSON.stringify(a.body),
      ]);
    }

    for (const [i, f] of FAQS.entries()) {
      await run("INSERT INTO faqs (q, a, category, position) VALUES ($1, $2, $3, $4)", [f.q, f.a, f.category, i]);
    }

    const settings: [string, unknown][] = [
      ["promoTiers", PROMO_TIERS],
      ["freeShippingThreshold", SITE.freeShippingThreshold],
      ["shippingFee", SITE.shippingFee],
      ["expressShippingFee", 14.99],
      ["sizes", SIZES],
      ["shapes", SHAPES],
    ];
    for (const [k, v] of settings) await run("INSERT INTO settings (key, value) VALUES ($1, $2)", [k, JSON.stringify(v)]);

    await run("INSERT INTO discount_codes (code, percent) VALUES ($1, $2)", [SITE.welcomeCode, SITE.welcomePercent]);
  });
}

// CLI: `npm run seed` — full reset (wipes users and orders too).
if (process.argv[1]?.endsWith("seed.ts")) {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to wipe a production database. Re-run with --force if you really mean it.");
    process.exit(1);
  }
  await migrate();
  await seed();
  console.log(`Database reset and seeded (${new URL(config.databaseUrl).pathname.slice(1)}).`);
  await pool.end();
}
