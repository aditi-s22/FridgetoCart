/**
 * Runs the fast and strong vision models on every photo in eval/images/ and prints
 * what each detected, with latency and cost, side by side.
 *
 *   pnpm compare:vision
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DetectionResult, type DetectedItem } from "@ftc/shared";
import { detectionMessages } from "../apps/api/src/graph/nodes/detectItems";
import { type CallUsage, type ModelRole, modelOf, structuredWithUsage } from "../apps/api/src/services/llm";

const IMAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../eval/images");
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const ROLES: ModelRole[] = ["visionFast", "visionStrong"];
const COL = 44;

type Run = { items: DetectedItem[]; usage: CallUsage } | { error: string };

async function detect(role: ModelRole, dataUrl: string): Promise<Run> {
  // llm.ts logs one JSON line per call; keep this report readable.
  const log = console.log;
  console.log = () => {};
  try {
    const { data, usage } = await structuredWithUsage({
      role,
      node: `compare:${role}`,
      schema: DetectionResult,
      messages: detectionMessages(dataUrl),
    });
    return { items: [...data.items].sort((a, b) => a.rawName.localeCompare(b.rawName)), usage };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    console.log = log;
  }
}

const fit = (s: string) => (s.length > COL ? `${s.slice(0, COL - 1)}…` : s.padEnd(COL));
const itemLine = (i: DetectedItem) => `${i.rawName} · ${i.qty ?? "?"} (${i.confidence.toFixed(2)})`;
const usageLine = (u: CallUsage) =>
  `${(u.latencyMs / 1000).toFixed(1)}s · ${u.inputTokens}→${u.outputTokens} tok · ₹${u.costInr.toFixed(4)}`;

function printSideBySide(runs: Run[]): void {
  const columns = runs.map((r) => ("error" in r ? [`ERROR: ${r.error}`] : r.items.map(itemLine)));
  const rows = Math.max(...columns.map((c) => c.length));
  for (let i = 0; i < rows; i++) console.log(`  ${columns.map((c) => fit(c[i] ?? "")).join(" │ ")}`);
  console.log(`  ${runs.map(() => "─".repeat(COL)).join("─┼─")}`);
  const footers = runs.map((r) => ("error" in r ? "failed" : `${r.items.length} items · ${usageLine(r.usage)}`));
  console.log(`  ${footers.map(fit).join(" │ ")}`);
}

function printSummary(all: Run[][]): void {
  console.log("\nSummary");
  ROLES.forEach((role, col) => {
    const ok = all.map((runs) => runs[col]).filter((r): r is Exclude<Run, { error: string }> => !!r && !("error" in r));
    const avg = (f: (r: (typeof ok)[number]) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0);
    const maxMs = Math.max(0, ...ok.map((r) => r.usage.latencyMs));
    console.log(
      `  ${role.padEnd(13)} ${modelOf(role).padEnd(24)} ok ${ok.length}/${all.length} · ` +
        `avg ${avg((r) => r.items.length).toFixed(1)} items · avg ${(avg((r) => r.usage.latencyMs) / 1000).toFixed(1)}s ` +
        `(max ${(maxMs / 1000).toFixed(1)}s) · avg ₹${avg((r) => r.usage.costInr).toFixed(4)}/image`,
    );
  });
}

async function main(): Promise<void> {
  const files = (await readdir(IMAGES_DIR).catch(() => [])).filter((f) => MIME[extname(f).toLowerCase()]).sort();
  if (files.length === 0) {
    console.log(`No .jpg/.png/.webp photos in ${IMAGES_DIR}. Add some and rerun.`);
    process.exit(1);
  }
  console.log(`Comparing ${modelOf("visionFast")} (fast) vs ${modelOf("visionStrong")} (strong) on ${files.length} photos`);
  console.log("Note: the app sends JPEGs downscaled to ≤1280px; larger originals cost more tokens here.\n");

  const all: Run[][] = [];
  for (const file of files) {
    const bytes = await readFile(join(IMAGES_DIR, file));
    const dataUrl = `data:${MIME[extname(file).toLowerCase()]};base64,${bytes.toString("base64")}`;
    console.log(`${file} (${Math.round(bytes.length / 1024)} KB)`);
    console.log(`  ${ROLES.map((r) => fit(`${r === "visionFast" ? "fast" : "strong"}: ${modelOf(r)}`)).join(" │ ")}`);
    const runs: Run[] = [];
    for (const role of ROLES) runs.push(await detect(role, dataUrl)); // sequential, so latencies don't interfere
    printSideBySide(runs);
    console.log();
    all.push(runs);
  }
  printSummary(all);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
