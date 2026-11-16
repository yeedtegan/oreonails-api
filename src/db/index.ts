import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "../config.js";

/** Current time as an ISO-8601 string (same format as `Date#toISOString`), for SQL defaults and comparisons. */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const TS = `TEXT NOT NULL DEFAULT (${NOW})`;

// JSON columns are stored as TEXT and parsed in lib/mappers.ts. Booleans are INTEGER 0/1.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS collections (
  handle      TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  grp         TEXT NOT NULL,
  palette     TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  image       TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  handle        TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('set','bundle','tool')),
  price         REAL NOT NULL,
  compare_at    REAL,
  palette       TEXT NOT NULL,
  pattern       TEXT NOT NULL,
  shape         TEXT NOT NULL,
  rating        REAL NOT NULL DEFAULT 0,
  review_count  INTEGER NOT NULL DEFAULT 0,
  description   TEXT NOT NULL DEFAULT '',
  sets_included INTEGER,
  rank          INTEGER NOT NULL DEFAULT 1000,
  images        TEXT NOT NULL DEFAULT '[]',
  added         INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS products_listing ON products(active, rank, added DESC);

CREATE TABLE IF NOT EXISTS product_collections (
  product_handle    TEXT NOT NULL REFERENCES products(handle) ON DELETE CASCADE ON UPDATE CASCADE,
  collection_handle TEXT NOT NULL REFERENCES collections(handle) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (product_handle, collection_handle)
);
CREATE INDEX IF NOT EXISTS product_collections_coll ON product_collections(collection_handle, product_handle);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  created_at    ${TS}
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(lower(email));

CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY,
  product_handle TEXT REFERENCES products(handle) ON DELETE SET NULL ON UPDATE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  variant        TEXT,
  created_at     ${TS}
);
CREATE INDEX IF NOT EXISTS reviews_product ON reviews(product_handle, created_at DESC);

CREATE TABLE IF NOT EXISTS articles (
  slug    TEXT PRIMARY KEY,
  tags    TEXT NOT NULL DEFAULT '[]',
  title   TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  date    TEXT NOT NULL,
  palette TEXT NOT NULL,
  pattern TEXT NOT NULL,
  image   TEXT,
  body    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faqs (
  id       INTEGER PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'General',
  q        TEXT NOT NULL,
  a        TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discount_codes (
  code       TEXT PRIMARY KEY,
  percent    REAL NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at ${TS}
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  number            TEXT PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email             TEXT NOT NULL,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  subtotal          REAL NOT NULL,
  promo_discount    REAL NOT NULL,
  code              TEXT,
  code_discount     REAL NOT NULL,
  shipping          REAL NOT NULL,
  total             REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Processing',
  created_at        ${TS},
  phone             TEXT,
  shipping_address  TEXT,
  billing_address   TEXT,
  shipping_method   TEXT,
  payment_method    TEXT NOT NULL DEFAULT 'card',
  payment_status    TEXT NOT NULL DEFAULT 'paid',
  payment_provider  TEXT NOT NULL DEFAULT 'test',
  payment_ref       TEXT,
  payment_detail    TEXT,
  paid_at           TEXT,
  access_key        TEXT,
  accepts_marketing INTEGER NOT NULL DEFAULT 0,
  points_awarded    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_payment ON orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_email ON orders(lower(email));
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id             INTEGER PRIMARY KEY,
  order_number   TEXT NOT NULL REFERENCES orders(number) ON DELETE CASCADE,
  product_handle TEXT NOT NULL,
  title          TEXT NOT NULL,
  unit_price     REAL NOT NULL,
  qty            INTEGER NOT NULL,
  size           TEXT,
  shape          TEXT,
  custom_sizes   TEXT
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_number);

CREATE TABLE IF NOT EXISTS subscribers (
  email      TEXT PRIMARY KEY,
  created_at ${TS}
);
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email ON subscribers(lower(email));

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  topic      TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       TEXT,
  created_at ${TS}
);
`;

const file = config.databasePath === ":memory:" ? ":memory:" : resolve(config.databasePath);
if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

export type Param = string | number | boolean | null | undefined | string[] | number[];

// Queries use Postgres-style $1, $2… placeholders; SQLite's ?1, ?2… are the same thing (reusable, 1-based).
const sqlCache = new Map<string, string>();
const toSqlite = (sql: string) => {
  let out = sqlCache.get(sql);
  if (!out) {
    out = sql.replace(/\$(\d+)/g, "?$1");
    if (sqlCache.size < 1000) sqlCache.set(sql, out);
  }
  return out;
};
const bind = (params: Param[]): SQLInputValue[] =>
  params.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : Array.isArray(v) ? JSON.stringify(v) : v));

/*
 * One connection is shared by every request. A transaction yields between its awaits, so while one is open,
 * queries from other requests wait for it to finish instead of running inside it.
 */
const inTx = new AsyncLocalStorage<true>();
let txDone: Promise<void> | null = null;
// Each caller re-checks right after waking (no extra await in between), so nothing can slip into a new transaction.
const blocked = () => txDone !== null && !inTx.getStore();

const prepare = (sql: string) => db.prepare(toSqlite(sql));

export async function all<T>(sql: string, params: Param[] = []): Promise<T[]> {
  while (blocked()) await txDone;
  return prepare(sql).all(...bind(params)) as T[];
}
export async function one<T>(sql: string, params: Param[] = []): Promise<T | undefined> {
  while (blocked()) await txDone;
  return prepare(sql).get(...bind(params)) as T | undefined;
}
/** Number of rows changed by an INSERT/UPDATE/DELETE. */
export async function run(sql: string, params: Param[] = []): Promise<number> {
  while (blocked()) await txDone;
  return Number(prepare(sql).run(...bind(params)).changes);
}

/** Collects positional parameters for dynamically built SQL: `where.push(\`x = ${p.add(v)}\`)`. */
export class Params {
  readonly values: Param[] = [];
  add(v: Param) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** Run `fn` inside a transaction; rolls back on throw. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (inTx.getStore()) return fn();
  while (txDone) await txDone;
  let release!: () => void;
  txDone = new Promise((r) => (release = r));
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = await inTx.run(true, fn);
    db.exec("COMMIT");
    return out;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  } finally {
    txDone = null;
    release();
  }
}

/** Creates tables and indexes if missing. Safe to run on every start. */
export async function migrate() {
  db.exec(SCHEMA);
}

export async function close() {
  while (txDone) await txDone;
  db.close();
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export async function isEmpty() {
  const row = await one<{ n: number }>("SELECT COUNT(*) AS n FROM products");
  return row!.n === 0;
}
