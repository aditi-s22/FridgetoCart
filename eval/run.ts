/**
 * FridgeToCart evaluation. Free by default: it reads recorded data from the database and runs
 * deterministic checks. Anything that calls a paid model needs --allow-llm.
 *
 *   pnpm eval                 grounding, cart coverage, latency, cost  -> eval/REPORT.md
 *   pnpm eval --allow-llm     also runs detection on eval/labels.json images (calls Gemini, costs money)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DetectionResult, type Ingredient, deepLinksFor } from "@ftc/shared";
import { PrismaClient } from "@prisma/client";
import { detectionMessages } from "../apps/api/src/graph/nodes/detectItems";
import { getGraph } from "../apps/api/src/graph/build";
import { progressOf } from "../apps/api/src/graph/progress";
import { structured } from "../apps/api/src/services/llm";
import { keyOf, loadCanonTags, loadLexicon, matchName } from "../apps/api/src/services/normalizer";
import { mean, percentile, pool, scoreSets } from "./lib/metrics";

const DIR = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const allowLlm = process.argv.includes("--allow-llm");
const f = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : "n/a");

// A1 detection
async function detection(): Promise<string> {
  const labels = JSON.parse(await readFile(join(DIR, "labels.json"), "utf8")) as Record<string, string[]>;
  const files = Object.keys(labels);
  if (files.length === 0) return "**Not yet measured.** `eval/labels.json` has no labelled images (see Labelling below).";
  if (!allowLlm) return `**Not run.** ${files.length} labelled images found, but detection calls a paid model; rerun with \`--allow-llm\`.`;
  const lex = await loadLexicon();
  const rows: { file: string; s: ReturnType<typeof scoreSets> }[] = [];
  for (const file of files) {
    const buf = await readFile(join(DIR, "images", file));
    const url = `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${buf.toString("base64")}`;
    const out = await structured({ role: "visionFast", node: `eval:${file}`, schema: DetectionResult, messages: detectionMessages(url) });
    const ids = out.items.map((i) => matchName(lex, i.rawName)?.canonicalId ?? `unknown:${keyOf(i.rawName)}`);
    rows.push({ file, s: scoreSets(ids, labels[file] ?? []) });
  }
  const all = pool(rows.map((r) => r.s));
  return [
    `Images: ${rows.length}. Micro-averaged: precision ${f(all.precision)}, recall ${f(all.recall)}, F1 ${f(all.f1)} (TP ${all.tp}, FP ${all.fp}, FN ${all.fn}).`,
    "",
    "| Image | TP | FP | FN | P | R |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.file} | ${r.s.tp} | ${r.s.fp} | ${r.s.fn} | ${f(r.s.precision)} | ${f(r.s.recall)} |`),
  ].join("\n");
}

// A1b offline proxy: the model's stored detections vs what the user confirmed on the review screen.
// No inference. This is NOT a ground-truth image evaluation: it measures agreement with the user's edits.
async function detectionProxy(): Promise<string> {
  const graph = await getGraph();
  const scans = await prisma.scan.findMany({ select: { id: true } });
  const rows: { id: string; by: string; s: ReturnType<typeof scoreSets> }[] = [];
  for (const { id } of scans) {
    const { values } = await progressOf(graph, id);
    const items = values.items ?? [];
    const confirmed = values.confirmed ?? [];
    if (items.length === 0 || confirmed.length === 0) continue;
    rows.push({
      id,
      by: values.detectedBy ?? "unknown",
      s: scoreSets(items.map((i) => i.canonicalId), confirmed.map((i) => i.canonicalId)),
    });
  }
  if (rows.length === 0) return "No recorded scans with both detections and confirmed items.";
  const all = pool(rows.map((r) => r.s));
  const perScan = rows.map((r) => r.s);
  return [
    "**User-confirmation agreement proxy (not a ground-truth image evaluation).**",
    `Reference = the ingredient list the user confirmed after editing the model's detections, compared by canonical id. Scans used: ${rows.length} (all with both lists; all are development scans by the project author).`,
    `Micro-averaged: precision ${f(all.precision)}, recall ${f(all.recall)}, F1 ${f(all.f1)} (TP ${all.tp}, FP ${all.fp}, FN ${all.fn}). Per-scan mean precision ${f(mean(perScan.map((x) => x.precision)))}, recall ${f(mean(perScan.map((x) => x.recall)))}.`,
    `Scans where the user changed nothing: ${rows.filter((r) => r.s.fp === 0 && r.s.fn === 0).length}/${rows.length}. Scans with at most 1 matching ingredient: ${rows.filter((r) => r.s.tp <= 1).length}/${rows.length}.`,
    "The distribution is bimodal (near-perfect agreement or almost none). Near-zero overlap means the confirmed list barely resembles the detections; this could be a poor detection, but it could equally be a development or test run where the list was replaced wholesale. The data cannot tell these apart, so the pooled numbers should not be read as detector quality.",
    "",
    "Caveats: a user who does not correct a miss or a false item inflates the score; users may also add items that are not visible in the photo, lowering recall. Detections from the strong-model fallback are included as stored. Names that fail to map to the ingredient canon appear as `unknown:` ids and are compared as-is.",
    "",
    "| Scan | Detected by | TP | FP | FN | P | R |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id.slice(0, 8)} | ${r.by} | ${r.s.tp} | ${r.s.fp} | ${r.s.fn} | ${f(r.s.precision)} | ${f(r.s.recall)} |`),
  ].join("\n");
}

// A2 grounding, from the stored checkpoints of real scans
async function grounding(tags: Map<string, string[]>): Promise<{ text: string; ok: number; total: number }> {
  const graph = await getGraph();
  const scans = await prisma.scan.findMany({ select: { id: true } });
  const docs = new Map((await prisma.recipeDoc.findMany({ select: { id: true, ingredientIds: true } })).map((d) => [d.id, new Set(d.ingredientIds)]));
  let total = 0;
  let ok = 0;
  let scansWithRecipes = 0;
  const failures: string[] = [];
  for (const { id } of scans) {
    const { values } = await progressOf(graph, id);
    const recipes = values.recipes ?? [];
    if (recipes.length) scansWithRecipes++;
    const userIds = new Set((values.confirmed ?? []).map((i: Ingredient) => i.canonicalId));
    for (const r of recipes) {
      total++;
      const doc = r.sourceDocId ? docs.get(r.sourceDocId) : undefined;
      const main = r.ingredients.map((i) => i.canonicalId).filter((c) => !tags.get(c)?.includes("staple"));
      const foreign = main.filter((c) => !doc?.has(c) && !userIds.has(c));
      if (doc && foreign.length === 0) ok++;
      else failures.push(`scan ${id} "${r.title}": ${doc ? `ingredients not in doc or fridge: ${foreign.join(", ")}` : "sourceDocId not found in recipe docs"}`);
    }
  }
  const text = [
    `Checked ${total} recipes from ${scansWithRecipes} recorded scans. A recipe counts as grounded only if its \`sourceDocId\` exists in the recipe table **and** every non-staple ingredient is in that document or in the user's confirmed fridge items (a swap).`,
    `Grounded: **${pct(ok, total)}**.`,
    "Caveat: the app already rejects ungrounded picks (`validatePicks`) and falls back to unadapted docs, so a high score is expected; this confirms the stored results and is not an independent test. It checks provenance and ingredient support, not whether a swap is culinarily sensible (needs human review).",
    ...(failures.length ? ["", "Failures:", ...failures.slice(0, 20).map((x) => `- ${x}`)] : []),
  ].join("\n");
  return { text, ok, total };
}

// A3 cart coverage: the whole recipe corpus against the mock store
async function cartCoverage(tags: Map<string, string[]>): Promise<string> {
  const docs = await prisma.recipeDoc.findMany({ select: { ingredientIds: true } });
  const ids = new Set(docs.flatMap((d) => d.ingredientIds).filter((c) => !tags.get(c)?.includes("staple")));
  const products = await prisma.product.findMany({ select: { canonicalId: true, stock: true } });
  const inStock = new Set(products.filter((p) => p.stock > 0).map((p) => p.canonicalId));
  const withProduct = [...ids].filter((c) => inStock.has(c)).length;
  const linkOk = [...ids].every((c) => deepLinksFor(c).blinkit.startsWith("https://") && deepLinksFor(c).zepto.startsWith("https://"));
  return [
    `Across all ${docs.length} seeded recipes there are ${ids.size} distinct non-staple ingredients.`,
    `- With an in-stock store product: **${pct(withProduct, ids.size)}**.`,
    `- The remaining ${ids.size - withProduct} fall back to Blinkit/Zepto search links (\`finalizeCart\`); links can be generated for every ingredient: **${linkOk ? "yes" : "NO"}**.`,
    "- So every missing ingredient maps to a product or a deep link by construction; this measures how many get a real product.",
    "- Cart invariants (off-list removal, no duplicates, every missing item in the cart or the unavailable list, accepted substitutions excluded, bought substitutes included) are covered by `apps/api/src/graph/cart.test.ts` and `services/substitutions.test.ts`, not re-measured here.",
  ].join("\n");
}

// A4/A5 latency and cost, from recorded LlmCall rows
async function latencyAndCost(): Promise<{ text: string; avgCost: number; n: number }> {
  const rows = await prisma.llmCall.findMany({ where: { ok: true } });
  const byScan = new Map<string, typeof rows>();
  for (const r of rows) byScan.set(r.scanId, [...(byScan.get(r.scanId) ?? []), r]);
  const stageMs = (calls: typeof rows, nodes: string[]) => calls.filter((c) => nodes.includes(c.node)).reduce((s, c) => s + c.latencyMs, 0);
  const costs: number[] = [];
  const toRecipes: number[] = [];
  const missCosts: number[] = [];
  const hitCosts: number[] = [];
  const cart: number[] = [];
  for (const calls of byScan.values()) {
    const c = calls.reduce((s, x) => s + x.costInr, 0);
    costs.push(c);
    const hasDetect = calls.some((x) => x.node === "detectItems");
    const gen = calls.some((x) => x.node === "generateRecipes");
    if (hasDetect && gen) toRecipes.push(stageMs(calls, ["detectItems", "detectStrong", "normalize", "retrieveRecipes", "generateRecipes"]) / 1000);
    if (gen) missCosts.push(c);
    else if (calls.some((x) => x.node === "retrieveRecipes")) hitCosts.push(c);
    if (calls.some((x) => x.node === "cartAgent")) cart.push(stageMs(calls, ["cartAgent"]) / 1000);
  }
  const models = new Map<string, { n: number; inT: number; outT: number; cost: number }>();
  for (const r of rows) {
    const key = `${r.model} / ${r.node}`;
    const m = models.get(key) ?? { n: 0, inT: 0, outT: 0, cost: 0 };
    models.set(key, { n: m.n + 1, inT: m.inT + r.inputTokens, outT: m.outT + r.outputTokens, cost: m.cost + r.costInr });
  }
  const text = [
    `Source: ${rows.length} recorded LLM/embedding calls over ${byScan.size} scans in the \`LlmCall\` table (real usage from development runs; this run made no new calls).`,
    "",
    "### Cost (A5)",
    `- Average cost per scan: **₹${f(mean(costs), 3)}** (n=${costs.length}; max ₹${f(Math.max(...costs), 3)}). Includes partial scans abandoned before recipes or the cart.`,
    `- Recipes generated (cache miss): mean ₹${f(mean(missCosts), 3)} (n=${missCosts.length}). Recipes from cache (hit): mean ₹${f(mean(hitCosts), 3)} (n=${hitCosts.length}).`,
    "- Costs use the price table in `apps/api/src/services/llm.ts`. Those prices were **not re-verified** against current Google pricing for this report; unlisted models (and embeddings) log ₹0.",
    "",
    "| Model / node | Calls | Input tok | Output tok | ₹ total |",
    "|---|---|---|---|---|",
    ...[...models].map(([k, m]) => `| ${k} | ${m.n} | ${m.inT} | ${m.outT} | ${f(m.cost, 4)} |`),
    "",
    "### Latency (A4)",
    "End-to-end wall-clock time (upload to recipes) is **not recorded** by the app. What is recorded is model time per call, so the numbers below are a **lower bound**: they exclude upload, database, Redis and network round trips.",
    `- Model time, detect + normalize + retrieve + generate (cache miss, n=${toRecipes.length}): p50 ${f(percentile(toRecipes, 50), 1)} s, p95 ${f(percentile(toRecipes, 95), 1)} s.`,
    `- Model time, cart agent (n=${cart.length}): p50 ${f(percentile(cart, 50), 1)} s, p95 ${f(percentile(cart, 95), 1)} s.`,
    "- Cache hit vs miss wall-clock: only the README's informal figure (review about 0.8 s on a hit); not measured systematically.",
  ].join("\n");
  return { text, avgCost: mean(costs), n: costs.length };
}

async function main() {
  const tags = await loadCanonTags();
  const det = await detection();
  const proxy = await detectionProxy();
  const g = await grounding(tags);
  const cart = await cartCoverage(tags);
  const lc = await latencyAndCost();
  const g2 = g.total === 0 ? "Not yet measured" : g.ok / g.total >= 0.9 ? `Met (${pct(g.ok, g.total)})` : `Not met (${pct(g.ok, g.total)})`;
  const g5 = lc.n === 0 ? "Not yet measured" : `${lc.avgCost < 2 ? "Met" : "Not met"} (avg ₹${f(lc.avgCost, 3)}, n=${lc.n}; prices unverified)`;
  const report = `# FridgeToCart evaluation report

Generated by \`pnpm eval\` on ${new Date().toISOString().slice(0, 10)}. Every number below comes from that run; sections that could not be measured say so.

## Goals

| Goal | Target | Status |
|---|---|---|
| G1 Detection | precision >= 0.80, recall >= 0.70 | **Not yet measured** (no ground-truth labels; a user-confirmation proxy is reported in A1b, not a substitute) |
| G2 Grounding | >= 90% grounded | **${g2}** |
| G3 Cart mapping | 100% missing items map to a product or link | **Met by construction; real-product coverage in A3** |
| G4 Latency | p95 photo to recipes < 12 s | **Not yet measured** (end-to-end time not recorded; model-time lower bound in A4) |
| G5 Cost | avg < ₹2 per scan | **${g5}** |

## Environment
Node ${process.version}, Neon PostgreSQL (recorded development data), mock store, models \`gemini-3.5-flash-lite\` (fast vision, text) and \`gemini-3.5-flash\` (strong vision). This run made no paid model calls${allowLlm ? " except detection (--allow-llm)" : ""}.

## A1 Ingredient detection
${det}

**Labelling:** put fridge photos in \`eval/images/\` and add \`"photo.jpg": ["tomato","onion"]\` (canonical ids from \`prisma/seed/ingredients.csv\`) to \`eval/labels.json\`, checked by eye. Only 2 unlabelled photos exist today; about 30 are needed for a meaningful number. Detection compares canonical-id sets, so synonyms are not double counted.

### A1b Offline proxy
${proxy}

## A2 Recipe grounding
${g.text}

## A3 Cart
${cart}

## A4 / A5 Latency and cost
${lc.text}

## A6 Substitution
- Deterministic validation (unit tests in \`services/substitutions.test.ts\`): unknown ids, ids already in the recipe, diet violations, avoid-list, Jain, non-missing originals and tampered client names are rejected; pantry-first ordering and availability are derived server-side; \`applySubstitutions\` leaves the original recipe unchanged; \`diffMissing\` excludes an accepted in-fridge substitute from the cart list and keeps a substitute that must be bought.
- Relevance and culinary quality of LLM suggestions: **not yet measured** (needs paid model calls plus human judgement).

## Known limitations
- No labelled detection set, so G1 is open and true G4 is open.
- Grounding checks provenance, not the culinary quality of swaps.
- Cost and latency come from development runs, not a controlled benchmark; sample sizes are small.
`;
  await writeFile(resolve(DIR, "REPORT.md"), report);
  console.log("wrote eval/REPORT.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
