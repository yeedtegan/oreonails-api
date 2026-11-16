const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? "postgres://oreonails:oreonails@localhost:5433/oreonails",
  databasePoolSize: Number(env.DATABASE_POOL_SIZE ?? 10),
  /** Where admin-uploaded images are stored; served at /uploads/*. */
  uploadsDir: env.UPLOADS_DIR ?? "./data/uploads",
  /** Comma-separated list of allowed browser origins for CORS. */
  corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  /** Bearer token for /api/admin routes. Admin routes are disabled when unset. */
  adminToken: env.ADMIN_TOKEN ?? "",
  /** Public URL of the storefront, used for payment redirects (PayPal, Stripe redirect methods). */
  webUrl: (env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY ?? "",
    publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
  },
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? "",
    /** "sandbox" or "live". */
    env: env.PAYPAL_ENV === "live" ? "live" : "sandbox",
  },
  /** Built-in test gateway (like Shopify's Bogus Gateway). On by default only while no real card gateway is configured. */
  testPayments: env.TEST_PAYMENTS ? env.TEST_PAYMENTS === "true" : !env.STRIPE_SECRET_KEY && env.NODE_ENV !== "production",
  currency: "USD",
  sessionDays: 30,
  signupBonusPoints: 100,
  pointsPerDollar: 5,
};
