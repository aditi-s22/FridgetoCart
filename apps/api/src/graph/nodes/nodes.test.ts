import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLexicon } from "../../services/normalizer";
import type { ScanStateT } from "../state";

vi.mock("../../services/llm", () => ({ structured: vi.fn(), embed: vi.fn() }));
vi.mock("../../services/storage", () => ({
  readImageAsDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));
vi.mock("../../services/normalizer", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../services/normalizer")>();
  return { ...real, loadLexicon: vi.fn(), nearestByEmbedding: vi.fn() };
});

const { structured } = await import("../../services/llm");
const normalizer = await import("../../services/normalizer");
const { detectItems } = await import("./detectItems");
const { normalize } = await import("./normalize");

const base: ScanStateT = { scanId: "s1", userId: "u1", imageUrl: "x", detected: [], items: [], attempts: 0 };

beforeEach(() => vi.clearAllMocks());

describe("detectItems", () => {
  it("returns validated detections and bumps attempts", async () => {
    const items = [{ rawName: "tamatar", qty: "3", confidence: 0.9 }];
    vi.mocked(structured).mockResolvedValue({ items });

    const out = await detectItems(base);

    expect(out).toEqual({ detected: items, attempts: 1 });
    const call = vi.mocked(structured).mock.calls[0]?.[0];
    expect(call?.role).toBe("visionFast");
  });
});

describe("normalize", () => {
  beforeEach(() => {
    vi.mocked(normalizer.loadLexicon).mockResolvedValue(
      buildLexicon([
        { canonicalId: "tomato", name: "Tomato", synonyms: ["tamatar"] },
        { canonicalId: "paneer", name: "Paneer", synonyms: [] },
      ]),
    );
  });

  it("maps synonyms, falls back to embeddings, then unknown, and dedupes", async () => {
    vi.mocked(normalizer.nearestByEmbedding).mockResolvedValue([
      { canonicalId: "paneer", name: "Paneer" },
      null,
    ]);
    const out = await normalize({
      ...base,
      detected: [
        { rawName: "Tamatar", qty: "3", confidence: 0.5 },
        { rawName: "tomatoes", qty: "2", confidence: 0.9 },
        { rawName: "panir block", qty: "1 packet", confidence: 0.8 },
        { rawName: "Dragon Fruit", qty: null, confidence: 0.4 },
      ],
    });

    expect(normalizer.nearestByEmbedding).toHaveBeenCalledWith(["panir block", "Dragon Fruit"]);
    expect(out.items).toEqual([
      { canonicalId: "tomato", name: "Tomato", qty: 2, unit: null, confidence: 0.9 },
      { canonicalId: "paneer", name: "Paneer", qty: 1, unit: "packet", confidence: 0.8 },
      { canonicalId: "unknown:dragon fruit", name: "Dragon Fruit", qty: null, unit: null, confidence: 0.4 },
    ]);
  });
});
