# Oreo Nails API

Node + [Hono](https://hono.dev) + PostgreSQL (via [`pg`](https://node-postgres.com)).

```bash
npm install
cp .env.example .env      # set DATABASE_URL if you don't use the bundled Docker Postgres
npm run db:up             # local Postgres 17 in Docker on port 5433 (docker-compose.yml)
npm run dev               # http://localhost:4000 — creates tables and seeds on first run
npm run seed              # FULL RESET: wipes all tables (incl. users & orders) and reloads seed data
                          #   refuses when NODE_ENV=production unless you pass `-- --force`
```

Seed data lives in `src/db/seed-data.ts`. Tables and indexes are created on startup (`CREATE … IF NOT EXISTS`
in `src/db/index.ts`).

### Moving from the old SQLite file

```bash
npm run import:sqlite -- ./data/oreonails.db   # replaces ALL Postgres data with the SQLite contents
```

### Production

Point `DATABASE_URL` at any managed Postgres (Neon, Supabase, RDS, Railway…). Append `?sslmode=require` if the
provider needs TLS. `DATABASE_POOL_SIZE` (default 10) is per app instance.

## Endpoints (all under `/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/site` | promo tiers, shipping threshold/fee, sizes, shapes |
| GET | `/collections` · `/collections/:handle` | `?sort=&onSale=1&minPrice=&maxPrice=` |
| GET | `/products` | `?collection=&q=&type=&handles=a,b&sort=&limit=&offset=` |
| GET | `/products/:handle` | product + related |
| GET/POST | `/reviews` | `?product=&rating=`; returns summary + list |
| GET | `/articles` · `/articles/:slug` · `/faqs` | |
| POST | `/cart/quote` | `{ items, code }` → server-computed totals (prices never trusted from client) |
| POST | `/orders` | checkout; awards loyalty points when signed in |
| GET | `/orders/track` | `?number=&email=` |
| POST | `/auth/register` · `/auth/login` · `/auth/logout` | returns a Bearer session token |
| GET | `/me` | user + their orders (Bearer token) |
| POST | `/newsletter` · `/contact` | stored in `subscribers` / `contact_messages` |
| GET/PATCH/PUT | `/admin/orders[/:number]` · `/admin/products/:handle` · `/admin/messages` · `/admin/subscribers` | `Authorization: Bearer $ADMIN_TOKEN` |

Example — mark an order shipped:

```bash
curl -X PATCH localhost:4000/api/admin/orders/ON123456 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"Shipped"}'
```

## Admin

The web app has a back office at **/admin** (http://localhost:3000/admin). Sign in with `ADMIN_TOKEN` from `.env`.
It manages products (with image uploads), collections, Nail Guide articles, FAQs, reviews, discount codes,
shipping / promotion settings, orders (status updates) and the inbox (contact messages, subscribers).

Uploaded images are stored in `UPLOADS_DIR` (default `./data/uploads`) and served at `/uploads/*`.
They live on local disk, so running more than one app instance needs shared storage (S3/R2) first.

## Not production-ready yet
- Payment is validated for shape only — integrate a real PSP (Stripe, etc.) in `src/routes/orders.ts`.
- No emails are sent (order confirmation, contact form) and no rate limiting on auth.

## Payments

Checkout (`/checkout` on the web) is a one-page, Shopify-style flow: contact → delivery → shipping method → payment.
Orders are created as `payment_status = 'pending'` and become `paid` only after the gateway confirms the charge
(unpaid ones appear in Admin → Orders → "Abandoned checkouts").

| Gateway | Enable with | Notes |
|---|---|---|
| Test cards | default while `STRIPE_SECRET_KEY` is empty (and not `NODE_ENV=production`) | 4242 4242 4242 4242 succeeds, 4000 0000 0000 0002 is declined. No money moves. |
| Stripe (cards, Apple Pay, Google Pay, Link, Klarna…) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Webhook URL: `<API>/api/webhooks/stripe`, event `payment_intent.succeeded`. Turn methods on in the Stripe Dashboard. |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox\|live` | Redirect flow; captured when the customer returns to the thank-you page. |

Set `WEB_URL` to the public storefront URL so PayPal/Stripe redirects come back to the right site.
