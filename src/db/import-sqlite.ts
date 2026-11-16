// One-off: copy everything from the old SQLite file into Postgres.
// Usage: npm run import:sqlite -- [path/to/oreonails.db]   (default ./data/oreonails.db)
// Replaces ALL data in the Postgres database.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { migrate, pool, run, tx, type Param } from "./index.js";

// Parents before children so foreign keys are satisfied.
const TABLES = [
  "collections", "products", "product_collections", "users", "reviews", "articles", "faqs", "settings",
  "discount_codes", "sessions", "orders", "order_items", "subscribers", "contact_messages",
];
const BOOLEANS: Record<string, string[]> = { products: ["active"], discount_codes: ["active"] };
const IDENTITY = ["users", "faqs", "order_items", "contact_messages"];

const file = process.argv[2] ?? "./data/oreonails.db";
if (!existsSync(file)) {
  console.error(`SQLite file not found: ${file}`);
  process.exit(1);
}
const lite = new DatabaseSync(file, { readOnly: true });

await migrate();
await tx(async () => {
  await run(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  for (const table of TABLES) {
    // rowid keeps discount codes in creation order (the newsletter hands out the oldest active one).
    const rows = lite.prepare(`SELECT ${table === "discount_codes" ? "rowid AS _rowid, " : ""}* FROM ${table}`).all() as Record<string, Param>[];
    const base = Date.now() - rows.length;
    for (const row of rows) {
      if (table === "discount_codes") row.created_at = new Date(base + Number(row._rowid)).toISOString();
      delete row._rowid;
      for (const col of BOOLEANS[table] ?? []) row[col] = row[col] !== 0;
      const cols = Object.keys(row);
      await run(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
        cols.map((c) => row[c]),
      );
    }
    console.log(`${table.padEnd(20)} ${rows.length}`);
  }
  // Explicit ids were copied, so move each identity sequence past the highest one.
  for (const t of IDENTITY) {
    await run(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  }
});

console.log("Import finished.");
lite.close();
await pool.end();
