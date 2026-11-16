import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { mkdirSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.js";
import { isEmpty, migrate, pool } from "./db/index.js";
import { seed } from "./db/seed.js";
import { loadUser, type AuthEnv } from "./lib/auth.js";
import { catalog } from "./routes/catalog.js";
import { reviews } from "./routes/reviews.js";
import { orders } from "./routes/orders.js";
import { account } from "./routes/account.js";
import { forms } from "./routes/forms.js";
import { admin } from "./routes/admin.js";
import { checkout } from "./routes/checkout.js";

await migrate();
if (await isEmpty()) {
  await seed();
  console.log("Empty database — loaded seed data.");
}

const app = new Hono<AuthEnv>();

app.use("*", logger());
app.use("/api/*", cors({ origin: config.corsOrigins, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
app.use("/api/*", loadUser);

mkdirSync(config.uploadsDir, { recursive: true });
app.use(
  "/uploads/*",
  serveStatic({ root: config.uploadsDir, rewriteRequestPath: (p) => p.replace(/^\/uploads/, "") }),
);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api", catalog);
app.route("/api", reviews);
app.route("/api", orders);
app.route("/api", checkout);
app.route("/api", account);
app.route("/api", forms);
app.route("/api", admin);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.res ?? c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Oreo Nails API listening on http://localhost:${info.port}`);
});

// Let in-flight requests finish and close DB connections cleanly on deploy/restart.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    server.close(() => void pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

export default app;
