import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  // Server-only. Used for user provisioning and the notification worker.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  APP_URL: z.url(),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(480).default(30),
  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Fails fast with a clear message if configuration is wrong. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration — ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isDemoMode = () => env().DEMO_MODE === "true";
