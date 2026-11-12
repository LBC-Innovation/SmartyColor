import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildLuluPrintJobPayload, validateLuluPayload } from "../src/lib/print/luluPayload.ts";
import { bindingIdForProduct, getBookBinding } from "../src/lib/print/bookBindings.ts";

/**
 * Prints the Lulu print-job payload for an existing order (dry run, default) or POSTs it (--send).
 *   node scripts/lulu-smoke.mjs <orderId>           # dry run, no Lulu call
 *   node scripts/lulu-smoke.mjs <orderId> --send    # creates a REAL print job at LULU_API_BASE
 * --send does not update the order row; point LULU_API_BASE at the sandbox before using it.
 * File URLs are signed for 7 days. Secrets are never printed.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const orderId = process.argv[2];
const send = process.argv.includes("--send");
if (!orderId || orderId.startsWith("--")) {
  console.error("Usage: node scripts/lulu-smoke.mjs <orderId> [--send]");
  process.exit(1);
}

const env = {};
for (const line of (await readFile(path.join(ROOT, ".env.local"), "utf8")).split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: order, error } = await supabase.from("book_orders").select("*").eq("id", orderId).maybeSingle();
if (error || !order) {
  console.error(error?.message ?? "Order not found");
  process.exit(1);
}
const bindingId = bindingIdForProduct(order.product_id);
if (!bindingId) throw new Error(`Unknown product ${order.product_id}`);
if (!order.interior_pdf_path || !order.cover_pdf_path) throw new Error("Order has no print files");

const bucket = env.SUPABASE_LIBRARY_BUCKET || "library";
const { data: signed, error: signError } = await supabase.storage
  .from(bucket)
  .createSignedUrls([order.interior_pdf_path, order.cover_pdf_path], 7 * 24 * 60 * 60);
if (signError) throw new Error(signError.message);
const urlFor = (p) => signed.find((s) => s.path === p)?.signedUrl;

const payload = buildLuluPrintJobPayload({
  orderId: order.lulu_external_id ?? order.id,
  title: order.project_title || "Coloring book",
  contactEmail: (order.contact_email || order.shipping_address?.email || "").trim(),
  shippingLevel: order.shipping_level,
  shippingAddress: order.shipping_address ?? {},
  podPackageId: getBookBinding(bindingId).podPackageId,
  interiorUrl: urlFor(order.interior_pdf_path),
  coverUrl: urlFor(order.cover_pdf_path),
});

// Redact the signed tokens when printing.
const redact = (u) => u.replace(/token=[^&]+/, "token=<redacted>");
const printable = structuredClone(payload);
const pn = printable.line_items[0].printable_normalization;
pn.interior.source_url = redact(pn.interior.source_url);
pn.cover.source_url = redact(pn.cover.source_url);
console.log(`Order ${order.id} (status ${order.status}) -> ${(env.LULU_API_BASE || "https://api.sandbox.lulu.com")}`);
console.log(JSON.stringify(printable, null, 2));
const invalid = validateLuluPayload(payload);
if (invalid) console.warn(`VALIDATION: ${invalid}`);

if (!send) {
  console.log("\nDry run only. Re-run with --send to POST /print-jobs/.");
  process.exit(invalid ? 1 : 0);
}
if (invalid) process.exit(1);

const base = (env.LULU_API_BASE || "https://api.sandbox.lulu.com").replace(/\/$/, "");
const basic = Buffer.from(`${env.LULU_CLIENT_KEY}:${env.LULU_CLIENT_SECRET}`).toString("base64");
const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
  body: new URLSearchParams({ grant_type: "client_credentials" }),
});
if (!tokenRes.ok) throw new Error(`Token request failed (${tokenRes.status})`);
const { access_token } = await tokenRes.json();
const res = await fetch(`${base}/print-jobs/`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log(`\nLulu responded ${res.status}`);
console.log(text.slice(0, 2000));
