#!/usr/bin/env node
/**
 * Pre-generate the preset documentaries into public/presets/<slug>.json.
 *
 * Presets then load instantly, cost no API quota, and keep working even
 * if every LLM provider is down. Commit the generated files.
 *
 * Usage:
 *   npm run dev                     # in one terminal
 *   npm run presets                 # in another (default http://localhost:3000)
 *   npm run presets -- https://deepscroll.edoedoedo.it
 *   npm run presets -- http://localhost:3000 brexit   # only matching slugs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const only = process.argv[3];

const presetsUrl = new URL("../app/utils/presets.json", import.meta.url);
const outDir = new URL("../public/presets/", import.meta.url);

/** Must stay identical to slugify() in app/utils/arc.ts */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generate(query) {
  const res = await fetch(`${base}/api/documentary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const events = [];
  let data = null;
  let buffer = "";
  const decoder = new TextDecoder();

  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "result") data = event.data;
    else if (event.type === "error") throw new Error(event.message);
    else events.push(event);
    if (event.type === "log") console.log(`   ${event.text}`);
  };

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer);

  if (!data) throw new Error("Stream ended without a result");
  return { events, data };
}

const { items } = JSON.parse(await readFile(presetsUrl, "utf8"));
await mkdir(outDir, { recursive: true });

let failures = 0;
for (const preset of items) {
  const slug = slugify(preset.query);
  if (only && !slug.includes(only)) continue;

  console.log(`\n→ ${preset.label} (${slug})`);
  try {
    const { events, data } = await generate(preset.query);
    const file = {
      version: data.version,
      query: preset.query,
      generatedAt: new Date().toISOString(),
      events,
      data,
    };
    await writeFile(new URL(`${slug}.json`, outDir), JSON.stringify(file));
    console.log(`   ✓ public/presets/${slug}.json`);
  } catch (err) {
    failures++;
    console.error(`   ✗ ${err instanceof Error ? err.message : err}`);
  }
  // Free tiers: ~8K tokens/min on Groq → leave room between documentaries
  await new Promise((r) => setTimeout(r, 20000));
}

process.exit(failures > 0 ? 1 : 0);
