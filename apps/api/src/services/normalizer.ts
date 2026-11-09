import { prisma } from "../db";
import { embed } from "./llm";

export type Canon = { canonicalId: string; name: string };
export type Lexicon = Map<string, Canon>;

const EMBED_MIN_SIMILARITY = 0.85;
const DESCRIPTORS = /\b(fresh|chopped|sliced|diced|whole|raw|ripe|packet of|pack of|bottle of|box of|bowl of|some)\b/g;

export function keyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(word: string): string {
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function buildLexicon(rows: { canonicalId: string; name: string; synonyms: string[] }[]): Lexicon {
  const lex: Lexicon = new Map();
  for (const row of rows) {
    const canon = { canonicalId: row.canonicalId, name: row.name };
    for (const term of [row.name, row.canonicalId.replace(/_/g, " "), ...row.synonyms]) {
      lex.set(keyOf(term), canon);
    }
  }
  return lex;
}

/** Exact synonym match, tolerating plurals and descriptors like "fresh" or "packet of". */
export function matchName(lex: Lexicon, rawName: string): Canon | null {
  const key = keyOf(rawName);
  const stripped = key.replace(DESCRIPTORS, " ").replace(/\s+/g, " ").trim();
  for (const candidate of [key, stripped]) {
    const hit = lex.get(candidate) ?? lex.get(candidate.split(" ").map(singular).join(" "));
    if (hit) return hit;
  }
  return null;
}

const WORD_QTY: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, quarter: 0.25, dozen: 12,
};
const VAGUE = new Set(["few", "some", "several", "many", "little", "bit"]);

/** "3" → 3; "half bowl" → 0.5 bowl; "500g" → 500 g; "2 packets" → 2 packet; "a few" → null. */
export function parseQty(raw: string | null): { qty: number | null; unit: string | null } {
  const text = (raw ?? "").toLowerCase().trim();
  if (!text) return { qty: null, unit: null };

  let qty: number | null = null;
  let rest = text;
  const num = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(.*)$/.exec(text);
  if (num?.[1]) {
    qty = Number(num[1]) / (num[2] ? Number(num[2]) : 1);
    rest = num[3] ?? "";
  } else {
    const [first = "", ...others] = text.split(/\s+/);
    if (first in WORD_QTY) {
      qty = WORD_QTY[first] ?? null;
      rest = others.join(" ");
    }
  }
  rest = rest.replace(/^of\s+/, "").trim();
  if (VAGUE.has(rest.split(" ")[0] ?? "")) return { qty: null, unit: null };
  if (rest === "dozen" && qty !== null) return { qty: qty * 12, unit: null };
  return { qty, unit: rest ? singular(rest) : null };
}

let lexicon: Lexicon | null = null;

export async function loadLexicon(): Promise<Lexicon> {
  lexicon ??= buildLexicon(await prisma.ingredientCanon.findMany());
  return lexicon;
}

let embeddingsSeeded = false;

async function hasEmbeddings(): Promise<boolean> {
  if (embeddingsSeeded) return true;
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "IngredientCanon" WHERE embedding IS NOT NULL`;
  embeddingsSeeded = (rows[0]?.n ?? 0n) > 0n;
  return embeddingsSeeded;
}

/** Nearest canonical ingredient by cosine similarity; null below the threshold. */
export async function nearestByEmbedding(names: string[]): Promise<(Canon | null)[]> {
  if (names.length === 0 || !(await hasEmbeddings())) return names.map(() => null);
  const vectors = await embed("normalize", names);
  return Promise.all(
    vectors.map(async (v) => {
      const vec = `[${v.join(",")}]`;
      const rows = await prisma.$queryRaw<(Canon & { similarity: number })[]>`
        SELECT "canonicalId", name, 1 - (embedding <=> ${vec}::vector) AS similarity
        FROM "IngredientCanon" WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
      const top = rows[0];
      return top && top.similarity >= EMBED_MIN_SIMILARITY ? { canonicalId: top.canonicalId, name: top.name } : null;
    }),
  );
}
