/**
 * Image provider bake-off: runs the app's real photo prompts through several
 * image models on the same photos and writes a side-by-side HTML report with
 * speed, estimated cost, output size and print resolution.
 *
 *   node --env-file=.env.local --import ./scripts/image-bakeoff/alias-loader.mjs \
 *     scripts/image-bakeoff/run.mts [--photos DIR] [--providers a,b] [--tasks portrait,coloring] [--upscale] [--repeat N]
 *
 * Photos default to .local/bakeoff/photos (gitignored). Providers without a key
 * are skipped. Prices are list-price estimates set in PROVIDERS below.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildPhotoColoringPrompt, buildPhotoPortraitPrompt } from "@/lib/ai/prompts";
import { inferPhotoLayout, type PhotoLayout } from "@/lib/photo/orientation";
import { toPhotoLineArtPng } from "@/lib/print/lineArt";
import { defaultPrintPrefs } from "@/lib/print/settings";

type Task = "portrait" | "coloring";
type GenInput = { prompt: string; photo: Buffer; target: PhotoLayout };
type GenOutput = { image: Buffer; costUsd: number | null; note?: string };
type Provider = {
  id: string;
  label: string;
  envKey: string;
  generate(input: GenInput): Promise<GenOutput>;
};

// ---------- args ----------
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const ROOT = process.cwd();
const PHOTOS_DIR = path.resolve(arg("photos") ?? ".local/bakeoff/photos");
const TASKS = (arg("tasks") ?? "portrait,coloring").split(",") as Task[];
const UPSCALE = args.includes("--upscale");
const REPEAT = Math.max(1, Number(arg("repeat") ?? 1));
const ONLY = arg("providers")?.split(",");

// Print target: US Letter at 300 DPI.
const PRINT_LONG_EDGE_PX = 3300;

// ---------- helpers ----------
const env = (k: string) => process.env[k]?.trim() || "";

async function fetchJson(url: string, init: RequestInit, timeoutMs = 180_000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function download(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1], "base64");
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Pixel size near `megapixels` for a layout's aspect ratio, rounded to 16px. */
function sizeFor(layout: PhotoLayout, megapixels: number) {
  const [w, h] = layout.aspectRatio.split(":").map(Number);
  const scale = Math.sqrt((megapixels * 1_000_000) / (w * h));
  const r = (n: number) => Math.floor((n * scale) / 16) * 16;
  return { width: r(w), height: r(h) };
}

// ---------- providers ----------
function geminiProvider(id: string, label: string, model: string, imageSize: string | null,
  rates: { inPerM: number; outPerM: number }): Provider {
  return {
    id, label, envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    async generate({ prompt, photo, target }) {
      const imageConfig: Record<string, string> = { aspectRatio: target.aspectRatio };
      if (imageSize) imageConfig.imageSize = imageSize;
      const json = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env("GOOGLE_GENERATIVE_AI_API_KEY") },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { inlineData: { mimeType: "image/jpeg", data: photo.toString("base64") } },
              { text: prompt },
            ] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig },
          }),
        },
      );
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const img = parts.find((p: { inlineData?: { data: string } }) => p.inlineData?.data);
      if (!img) throw new Error(`No image (finish: ${json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason ?? "?"})`);
      const u = json.usageMetadata ?? {};
      const costUsd = ((u.promptTokenCount ?? 0) * rates.inPerM + (u.candidatesTokenCount ?? 0) * rates.outPerM) / 1e6;
      return { image: Buffer.from(img.inlineData.data, "base64"), costUsd };
    },
  };
}

const OPENAI_QUALITY = env("BAKEOFF_OPENAI_QUALITY") || "medium";
function openaiProvider(id: string, model: string): Provider {
  return {
  id,
  label: `OpenAI ${model} (${OPENAI_QUALITY})`,
  envKey: "OPENAI_API_KEY",
  async generate({ prompt, photo, target }) {
    const size = target.orientation === "landscape" ? "1536x1024"
      : target.aspectRatio === "1:1" ? "1024x1024" : "1024x1536";
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", OPENAI_QUALITY);
    form.append("n", "1");
    form.append("image[]", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "photo.jpg");
    const json = await fetchJson("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${env("OPENAI_API_KEY")}` },
      body: form,
    });
    const b64 = json.data?.[0]?.b64_json;
    const image = b64 ? Buffer.from(b64, "base64") : await download(json.data?.[0]?.url);
    // Token rates (USD per 1M): text in, image in, image out. Override via env.
    const tIn = Number(env("BAKEOFF_OPENAI_TEXT_IN") || 5);
    const iIn = Number(env("BAKEOFF_OPENAI_IMAGE_IN") || 8);
    const out = Number(env("BAKEOFF_OPENAI_IMAGE_OUT") || 30);
    const u = json.usage;
    const costUsd = u
      ? ((u.input_tokens_details?.text_tokens ?? 0) * tIn +
          (u.input_tokens_details?.image_tokens ?? 0) * iIn +
          (u.output_tokens ?? 0) * out) / 1e6
      : null;
    return { image, costUsd, note: size };
  },
  };
}

function falSeedreamProvider(id: string, label: string, endpoint: string, megapixels: number,
  priceUsd: number): Provider {
  return {
    id, label, envKey: "FAL_KEY",
    async generate({ prompt, photo, target }) {
      const size = sizeFor(target, megapixels);
      const json = await fetchJson(`https://fal.run/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Key ${env("FAL_KEY")}` },
        body: JSON.stringify({
          prompt,
          image_urls: [`data:image/jpeg;base64,${photo.toString("base64")}`],
          image_size: size,
          num_images: 1,
          output_format: "png",
          sync_mode: true,
        }),
      });
      const url = json.images?.[0]?.url;
      if (!url) throw new Error("No image in fal response");
      return { image: await download(url), costUsd: priceUsd, note: `${size.width}x${size.height}` };
    },
  };
}

const PROVIDERS: Provider[] = [
  geminiProvider("gemini", "Gemini 3.1 Flash Image 2K (current)",
    env("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image", "2K", { inPerM: 0.5, outPerM: 60 }),
  geminiProvider("gemini-lite", "Gemini 3.1 Flash-Lite Image 1K",
    "gemini-3.1-flash-lite-image", null, { inPerM: 0.25, outPerM: 30 }),
  openaiProvider("openai", env("BAKEOFF_OPENAI_MODEL") || "gpt-image-2.5-flare"),
  openaiProvider("openai-sunburst", env("BAKEOFF_OPENAI_SUNBURST_MODEL") || "gpt-image-2.5-sunburst"),
  falSeedreamProvider("seedream-pro", "Seedream 5.0 Pro (fal)",
    "bytedance/seedream/v5/pro/edit", 2.3, 0.0675),
  falSeedreamProvider("seedream-lite", "Seedream 5.0 Lite (fal)",
    "fal-ai/bytedance/seedream/v5/lite/edit", 2.3, 0.035),
];

// ---------- upscale (portrait photos only) ----------
async function falCrispUpscale(image: Buffer): Promise<Buffer> {
  const png = await sharp(image).png().toBuffer();
  const json = await fetchJson("https://fal.run/fal-ai/recraft/upscale/crisp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Key ${env("FAL_KEY")}` },
    body: JSON.stringify({ image_url: `data:image/png;base64,${png.toString("base64")}`, sync_mode: true }),
  });
  return download(json.image.url);
}

// ---------- run ----------
type Result = {
  photo: string; task: Task; provider: string; run: number;
  ok: boolean; error?: string; ms?: number; costUsd?: number | null;
  width?: number; height?: number; printDpi?: number; file?: string;
  upscaledFile?: string; upscaledDpi?: number; upscaleMs?: number; note?: string;
};

function dpi(w: number, h: number) {
  // Letter is 8.5x11in; DPI is limited by whichever edge is shorter relative to the page.
  const [short, long] = w < h ? [w, h] : [h, w];
  return Math.round(Math.min(short / 8.5, long / 11));
}

async function main() {
  const photos = (await readdir(PHOTOS_DIR).catch(() => []))
    .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f)).sort();
  if (photos.length === 0) {
    console.error(`No photos in ${PHOTOS_DIR}. Add a few landscape family photos there (jpg/png).`);
    process.exit(1);
  }

  const providers = PROVIDERS.filter((p) => (!ONLY || ONLY.includes(p.id)));
  const active = providers.filter((p) => env(p.envKey));
  for (const p of providers) if (!env(p.envKey)) console.warn(`skip ${p.id}: ${p.envKey} not set`);
  if (active.length === 0) process.exit(1);
  if (UPSCALE && !env("FAL_KEY")) console.warn("skip --upscale: FAL_KEY not set");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(ROOT, ".local/bakeoff/runs", stamp);
  await mkdir(outDir, { recursive: true });
  const results: Result[] = [];

  for (const photoName of photos) {
    // Same input for every provider: upright, ≤2048px long edge, JPEG q90.
    const photo = await sharp(await readFile(path.join(PHOTOS_DIR, photoName)))
      .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(photo).metadata();
    const source = inferPhotoLayout(meta.width!, meta.height!);
    const base = path.parse(photoName).name;
    await writeFile(path.join(outDir, `${base}__input.jpg`), photo);

    for (const task of TASKS) {
      let target: PhotoLayout;
      let prompt: string;
      if (task === "portrait") {
        if (source.orientation !== "landscape") {
          console.warn(`skip portrait for ${photoName}: not a landscape photo`);
          continue;
        }
        const longEdge = Math.max(source.width, source.height);
        target = { orientation: "portrait", aspectRatio: "3:4", width: Math.round(longEdge * 0.75), height: longEdge };
        prompt = buildPhotoPortraitPrompt(source, target);
      } else {
        target = source;
        prompt = buildPhotoColoringPrompt(defaultPrintPrefs, source);
      }

      // Providers run in parallel per photo+task; repeats run in sequence.
      for (let run = 1; run <= REPEAT; run++) {
        await Promise.all(active.map(async (p) => {
          const r: Result = { photo: photoName, task, provider: p.id, run, ok: false };
          const t0 = performance.now();
          try {
            const out = await p.generate({ prompt, photo, target });
            r.ms = Math.round(performance.now() - t0);
            r.costUsd = out.costUsd;
            r.note = out.note;
            let finalImage = out.image;
            if (task === "coloring") {
              // Same post-processing the app applies before print.
              finalImage = Buffer.from(await toPhotoLineArtPng(out.image.toString("base64")), "base64");
              await writeFile(path.join(outDir, `${base}__${task}__${p.id}__r${run}__raw.png`), out.image);
            }
            const m = await sharp(out.image).metadata();
            r.width = m.width; r.height = m.height;
            r.printDpi = dpi(m.width!, m.height!);
            r.file = `${base}__${task}__${p.id}__r${run}.png`;
            await writeFile(path.join(outDir, r.file), await sharp(finalImage).png().toBuffer());
            r.ok = true;

            if (UPSCALE && task === "portrait" && env("FAL_KEY")) {
              const u0 = performance.now();
              try {
                const up = await falCrispUpscale(out.image);
                r.upscaleMs = Math.round(performance.now() - u0);
                const um = await sharp(up).metadata();
                r.upscaledDpi = dpi(um.width!, um.height!);
                r.upscaledFile = `${base}__${task}__${p.id}__r${run}__upscaled.png`;
                await writeFile(path.join(outDir, r.upscaledFile), up);
                if (r.costUsd != null) r.costUsd += 0.004;
              } catch (e) {
                r.note = `${r.note ?? ""} upscale failed: ${(e as Error).message}`.trim();
              }
            }
          } catch (e) {
            r.ms = Math.round(performance.now() - t0);
            r.error = (e as Error).message;
          }
          results.push(r);
          console.log(`${r.ok ? "ok  " : "FAIL"} ${photoName} ${task} ${p.id} ${r.ms}ms` +
            (r.costUsd != null ? ` $${r.costUsd.toFixed(4)}` : "") + (r.error ? ` — ${r.error}` : ""));
        }));
      }
    }
  }

  await writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(path.join(outDir, "report.html"), renderReport(results, active, photos));
  console.log(`\nReport: ${path.join(outDir, "report.html")}`);
}

// ---------- report ----------
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function renderReport(results: Result[], providers: Provider[], photos: string[]) {
  const rows = providers.map((p) => {
    const rs = results.filter((r) => r.provider === p.id);
    const ok = rs.filter((r) => r.ok);
    const ms = median(ok.map((r) => r.ms!));
    const costs = ok.map((r) => r.costUsd).filter((c): c is number => c != null);
    const cost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
    const dpis = median(ok.map((r) => r.printDpi!));
    return `<tr><td>${esc(p.label)}</td><td>${ok.length}/${rs.length}</td>
      <td>${ms != null ? (ms / 1000).toFixed(1) + "s" : "—"}</td>
      <td>${cost != null ? "$" + cost.toFixed(4) : "—"}</td>
      <td>${dpis ?? "—"}</td></tr>`;
  }).join("");

  const sections = photos.flatMap((photo) => {
    const base = path.parse(photo).name;
    return TASKS.map((task) => {
      const cells = results.filter((r) => r.photo === photo && r.task === task)
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.run - b.run);
      if (!cells.length) return "";
      const cards = cells.map((r) => {
        const label = providers.find((p) => p.id === r.provider)?.label ?? r.provider;
        const meta = r.ok
          ? `${(r.ms! / 1000).toFixed(1)}s · ${r.costUsd != null ? "$" + r.costUsd.toFixed(4) : "cost n/a"} · ${r.width}×${r.height} · ${r.printDpi} DPI on Letter`
            + (r.upscaledFile ? ` · upscaled ${r.upscaledDpi} DPI (${(r.upscaleMs! / 1000).toFixed(1)}s)` : "")
          : `<span class="err">${esc(r.error ?? "failed")}</span>`;
        const img = r.ok ? `<a href="${r.upscaledFile ?? r.file}" target="_blank"><img src="${r.file}" loading="lazy"></a>` : `<div class="missing">no image</div>`;
        return `<figure>${img}<figcaption><b>${esc(label)}</b>${REPEAT > 1 ? ` (run ${r.run})` : ""}<br>${meta}</figcaption></figure>`;
      }).join("");
      return `<section><h2>${esc(photo)} — ${task === "portrait" ? "landscape → portrait" : "photo → coloring sheet"}</h2>
        <div class="grid"><figure><img src="${base}__input.jpg"><figcaption><b>Input photo</b></figcaption></figure>${cards}</div></section>`;
    });
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image Provider Bake-off</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--err:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--card:#292524;--line:#44403c;--err:#f87171}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
h1{margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px}
table{border-collapse:collapse;margin-bottom:32px;background:var(--card)}td,th{border:1px solid var(--line);padding:6px 10px;text-align:left}
section{margin-bottom:40px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}
img{width:100%;height:auto;display:block;background:#fff;border-radius:4px}
figcaption{font-size:12px;color:var(--muted);margin-top:6px}figcaption b{color:var(--fg)}
.err{color:var(--err)}.missing{aspect-ratio:3/4;display:grid;place-items:center;color:var(--muted)}
</style></head><body>
<h1>Image provider bake-off</h1>
<p class="sub">${new Date().toLocaleString()} · ${photos.length} photo(s) · tasks: ${TASKS.join(", ")} · costs are list-price estimates · DPI assumes a full US Letter page (300 DPI needs 2550×3300). Coloring sheets show the app's line-art post-processing; click any image for full size.</p>
<table><tr><th>Provider</th><th>Succeeded</th><th>Median time</th><th>Avg cost / image</th><th>Median DPI</th></tr>${rows}</table>
${sections}</body></html>`;
}

main().catch((e) => { console.error(e); process.exit(1); });
