import { Hono } from "hono";
import { z } from "zod";
import { one, run } from "../db/index.js";
import { body } from "../lib/validate.js";

export const forms = new Hono();

forms.post("/newsletter", async (c) => {
  const { email } = await body(c, z.object({ email: z.string().trim().email().max(200) }));
  await run("INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT DO NOTHING", [email]);
  const code = await one<{ code: string }>("SELECT code FROM discount_codes WHERE active ORDER BY created_at, code LIMIT 1");
  return c.json({ ok: true, code: code?.code ?? null });
});

const contactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    topic: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(5000),
  })
  .passthrough(); // extra fields (custom-design form) are stored in `meta`

forms.post("/contact", async (c) => {
  const { name, email, phone, topic, message, ...rest } = await body(c, contactSchema);
  const meta = Object.keys(rest).length ? JSON.stringify(rest).slice(0, 4000) : null;
  await run("INSERT INTO contact_messages (name, email, phone, topic, message, meta) VALUES ($1, $2, $3, $4, $5, $6)", [
    name,
    email,
    phone || null,
    topic,
    message,
    meta,
  ]);
  return c.json({ ok: true }, 201);
});
