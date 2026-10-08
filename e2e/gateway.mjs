// TEST-ONLY gateway that stands in for the parts of Supabase the app talks to:
//   /rest/v1/*     → real PostgREST (row level security enforced by PostgreSQL)
//   /auth/v1/*     → minimal GoTrue-compatible password login + sessions (HS256 JWTs)
//   /storage/v1/*  → minimal Storage API; access decisions are made by the REAL
//                    storage.objects RLS policies from the migrations.
// It exists so the application and its security model can be exercised end-to-end
// on a machine without Docker. Never deploy it.
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";

const { JWT_SECRET, PGRST_URL, PG_CONN, PORT = "54321", E2E_PASSWORD, STORAGE_DIR = "/tmp/e2e-storage" } = process.env;
if (!JWT_SECRET || !PGRST_URL || !PG_CONN || !E2E_PASSWORD) throw new Error("JWT_SECRET, PGRST_URL, PG_CONN, E2E_PASSWORD are required");

const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (payload) => {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
function verify(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!h || !p || !s) return null;
  if (createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  return payload.exp && payload.exp < Date.now() / 1000 ? null : payload;
}

const pool = new pg.Pool({ connectionString: PG_CONN, max: 5 });
const refreshTokens = new Map();

const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, phone: "", app_metadata: { provider: "email" }, user_metadata: {}, identities: [], created_at: u.created_at, updated_at: u.created_at });
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ aud: "authenticated", role: "authenticated", sub: u.id, email: u.email, iat: now, exp: now + 3600 });
  const refresh = randomUUID();
  refreshTokens.set(refresh, u.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(u) };
}

/** Run SQL as the `authenticated` role with the user's claims — exactly what PostgREST does. */
async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query("set local role authenticated");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const readBody = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (p.startsWith("/rest/v1/")) {
      const target = `${PGRST_URL}/${p.slice("/rest/v1/".length)}${url.search}`;
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
      const r = await fetch(target, { method: req.method, headers, body });
      const h = Object.fromEntries(r.headers); delete h["content-encoding"]; delete h["content-length"]; delete h["transfer-encoding"];
      res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }

    if (p === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      if (grant === "password") {
        const { rows } = await pool.query("select id, email, created_at from auth.users where lower(email) = lower($1)", [body.email ?? ""]);
        if (!rows[0] || body.password !== E2E_PASSWORD) return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return json(res, 200, session(rows[0]));
      }
      if (grant === "refresh_token") {
        const uid = refreshTokens.get(body.refresh_token);
        if (!uid) return json(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        refreshTokens.delete(body.refresh_token);
        const { rows } = await pool.query("select id, email, created_at from auth.users where id = $1", [uid]);
        return json(res, 200, session(rows[0]));
      }
    }
    if (p === "/auth/v1/user") {
      const claims = verify(bearer(req));
      if (!claims || claims.role !== "authenticated") return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const { rows } = await pool.query("select id, email, created_at from auth.users where id = $1", [claims.sub]);
      if (!rows[0]) return json(res, 404, { code: 404, msg: "User not found" });
      if (req.method === "PUT") return json(res, 200, userJson(rows[0]));
      return json(res, 200, userJson(rows[0]));
    }
    if (p === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    if (p === "/auth/v1/recover") return json(res, 200, {});

    const m = /^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(p);
    if (m) {
      const [, bucket, rawPath] = m;
      const name = decodeURIComponent(rawPath);
      const claims = verify(bearer(req));
      if (!claims || claims.role !== "authenticated") return json(res, 401, { statusCode: "401", error: "Unauthorized", message: "invalid JWT" });
      const file = join(STORAGE_DIR, bucket, name);
      if (req.method === "POST") {
        const bytes = await readBody(req);
        try {
          await asUser(claims, (c) => c.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]));
        } catch (e) {
          return json(res, 403, { statusCode: "403", error: "Unauthorized", message: e.message });
        }
        mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
        return json(res, 200, { Id: randomUUID(), Key: `${bucket}/${name}` });
      }
      if (req.method === "GET") {
        const visible = await asUser(claims, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
        if (!visible.rowCount || !existsSync(file)) return json(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
        res.writeHead(200, { "content-type": "application/octet-stream" }); return res.end(readFileSync(file));
      }
    }
    json(res, 404, { message: "not found in e2e gateway", path: p });
  } catch (e) {
    console.error("gateway error", e);
    json(res, 500, { message: String(e) });
  }
}).listen(Number(PORT), "127.0.0.1", () => console.log(`e2e gateway on :${PORT}`));
