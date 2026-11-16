import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { NOW, one, run } from "../db/index.js";
import { config } from "../config.js";

export interface User {
  id: number;
  name: string;
  email: string;
  points: number;
  created_at: string;
}

export type AuthEnv = { Variables: { user: User | null } };

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [token, userId, expires]);
  return token;
}

export async function deleteSession(token: string) {
  await run("DELETE FROM sessions WHERE token = $1", [token]);
}

const bearer = (c: Context) => c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

/** Attaches `user` (or null) from a Bearer session token. Never rejects. */
export const loadUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = bearer(c);
  let user: User | null = null;
  if (token) {
    user =
      (await one<User>(
        `SELECT u.id, u.name, u.email, u.points, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = $1 AND s.expires_at > ${NOW}`,
        [token],
      )) ?? null;
  }
  c.set("user", user);
  await next();
};

export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.get("user")) throw new HTTPException(401, { message: "Sign in required" });
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const token = bearer(c);
  if (!config.adminToken) throw new HTTPException(404, { message: "Not found" });
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(config.adminToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HTTPException(401, { message: "Invalid admin token" });
  await next();
};

export const tokenFrom = bearer;
export const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, points: u.points, createdAt: u.created_at });
