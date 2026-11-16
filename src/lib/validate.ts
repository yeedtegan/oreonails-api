import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { z } from "zod";

/** Parse a JSON body with a zod schema; responds 400 with field errors on failure. */
export async function body<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    throw new HTTPException(400, {
      res: Response.json({ error: "Validation failed", fields }, { status: 400 }),
    });
  }
  return result.data;
}

export const num = (v: string | undefined) => (v == null || v === "" || isNaN(Number(v)) ? undefined : Number(v));
