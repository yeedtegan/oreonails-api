import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { all, one } from "../db/index.js";
import { config } from "../config.js";
import { createSession, deleteSession, hashPassword, publicUser, requireUser, tokenFrom, verifyPassword, type AuthEnv, type User } from "../lib/auth.js";
import { body } from "../lib/validate.js";
import { ordersJson, type OrderRow } from "./orders.js";

export const account = new Hono<AuthEnv>();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});

account.post("/auth/register", async (c) => {
  const input = await body(c, registerSchema);
  // ON CONFLICT covers the race where two sign-ups with the same email arrive together.
  const user = await one<User>(
    `INSERT INTO users (name, email, password_hash, points) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING RETURNING id, name, email, points, created_at`,
    [input.name, input.email, hashPassword(input.password), config.signupBonusPoints],
  );
  if (!user) throw new HTTPException(409, { message: "An account with this email already exists" });
  return c.json({ token: await createSession(user.id), user: publicUser(user) }, 201);
});

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

account.post("/auth/login", async (c) => {
  const input = await body(c, loginSchema);
  const row = await one<User & { password_hash: string }>("SELECT * FROM users WHERE lower(email) = lower($1)", [input.email]);
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw new HTTPException(401, { message: "Incorrect email or password" });
  }
  return c.json({ token: await createSession(row.id), user: publicUser(row) });
});

account.post("/auth/logout", async (c) => {
  const token = tokenFrom(c);
  if (token) await deleteSession(token);
  return c.json({ ok: true });
});

account.get("/me", requireUser, async (c) => {
  const user = c.get("user")!;
  const rows = await all<OrderRow>("SELECT * FROM orders WHERE (user_id = $1 OR lower(email) = lower($2)) AND payment_status != 'pending' ORDER BY created_at DESC", [user.id, user.email]);
  return c.json({ user: publicUser(user), orders: await ordersJson(rows) });
});
