import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Registers the PRINT_JOB_STATUS_CHANGED webhook with Lulu if it is not already registered.
 *   node scripts/lulu-register-webhook.mjs https://your-domain.com/api/webhooks/lulu
 * Reads LULU_* from .env.local (LULU_API_BASE decides sandbox vs production). Secrets are never printed.
 * Lulu signs deliveries with the API client secret; no separate webhook secret is issued.
 */
const ROOT = path.resolve(import.meta.dirname, "..");

async function loadEnv() {
  const env = {};
  for (const line of (await readFile(path.join(ROOT, ".env.local"), "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const url = process.argv[2];
if (!url || !/^https:\/\//.test(url)) {
  console.error("Usage: node scripts/lulu-register-webhook.mjs https://<domain>/api/webhooks/lulu");
  process.exit(1);
}

const env = await loadEnv();
const base = (env.LULU_API_BASE || "https://api.sandbox.lulu.com").replace(/\/$/, "");
if (!env.LULU_CLIENT_KEY || !env.LULU_CLIENT_SECRET) {
  console.error("LULU_CLIENT_KEY and LULU_CLIENT_SECRET must be set in .env.local");
  process.exit(1);
}
console.log(`Lulu API: ${base}`);

const basic = Buffer.from(`${env.LULU_CLIENT_KEY}:${env.LULU_CLIENT_SECRET}`).toString("base64");
const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
  body: new URLSearchParams({ grant_type: "client_credentials" }),
});
if (!tokenRes.ok) {
  console.error(`Token request failed (${tokenRes.status})`);
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const listRes = await fetch(`${base}/webhooks/`, { headers });
if (!listRes.ok) {
  console.error(`List webhooks failed (${listRes.status}): ${(await listRes.text()).slice(0, 300)}`);
  process.exit(1);
}
const listed = await listRes.json();
const hooks = Array.isArray(listed) ? listed : (listed.results ?? []);
for (const h of hooks) console.log(`existing: id=${h.id} active=${h.is_active} url=${h.url} topics=${(h.topics ?? []).join(",")}`);

const existing = hooks.find((h) => h.url === url && (h.topics ?? []).includes("PRINT_JOB_STATUS_CHANGED"));
if (existing) {
  console.log(`Already registered (id ${existing.id}${existing.is_active === false ? ", INACTIVE - reactivate via PATCH /webhooks/{id}/" : ""}). Nothing to do.`);
  process.exit(0);
}

const createRes = await fetch(`${base}/webhooks/`, {
  method: "POST",
  headers,
  body: JSON.stringify({ url, topics: ["PRINT_JOB_STATUS_CHANGED"] }),
});
const body = await createRes.text();
if (!createRes.ok) {
  console.error(`Create webhook failed (${createRes.status}): ${body.slice(0, 300)}`);
  process.exit(1);
}
const created = JSON.parse(body);
console.log(`Created webhook id=${created.id} url=${created.url}`);
