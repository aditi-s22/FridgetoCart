import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const embed = vi.fn();
const embedDocuments = vi.fn();
const fakeEnv = { EMBED_DIM: 1536, EMBED_MODEL: "google:gemini-embedding-2" };

vi.mock("./db", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("./env", () => ({ env: fakeEnv }));
// Any LLM access during startup validation would hit one of these and fail the test.
vi.mock("./services/llm", () => ({ embed, structured: vi.fn(), agentStep: vi.fn(), chatModel: vi.fn() }));
vi.mock("@langchain/google-genai", () => ({
  GoogleGenerativeAIEmbeddings: vi.fn(() => ({ embedDocuments })),
  ChatGoogleGenerativeAI: vi.fn(),
}));

const { checkEmbeddingDims } = await import("./startupChecks");

const ok = (dims = 1536) => [{ table: "IngredientCanon", dims }, { table: "RecipeDoc", dims }];
const pgvector = [{ extname: "vector" }];

beforeEach(() => {
  vi.clearAllMocks();
  fakeEnv.EMBED_DIM = 1536;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("checkEmbeddingDims", () => {
  it("passes for pgvector and 1536-dim columns, with zero LLM calls", async () => {
    queryRaw.mockResolvedValueOnce(pgvector).mockResolvedValueOnce(ok());
    await expect(checkEmbeddingDims()).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(embed).not.toHaveBeenCalled();
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it("rejects a missing pgvector extension and stops before the column check", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(checkEmbeddingDims()).rejects.toThrow(/pgvector extension is not installed/);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(embed).not.toHaveBeenCalled();
  });

  it("rejects columns whose dimension differs from EMBED_DIM", async () => {
    queryRaw.mockResolvedValueOnce(pgvector).mockResolvedValueOnce(ok(768));
    await expect(checkEmbeddingDims()).rejects.toThrow(/EMBED_DIM=1536 but IngredientCanon\.embedding is vector\(768\), RecipeDoc\.embedding is vector\(768\)/);
    expect(embed).not.toHaveBeenCalled();
  });

  it("rejects when EMBED_DIM is configured differently from a 1536-dim database", async () => {
    fakeEnv.EMBED_DIM = 1024;
    queryRaw.mockResolvedValueOnce(pgvector).mockResolvedValueOnce(ok(1536));
    await expect(checkEmbeddingDims()).rejects.toThrow(/EMBED_DIM=1024 but .*vector\(1536\)/);
  });

  it("rejects a missing embedding column", async () => {
    queryRaw.mockResolvedValueOnce(pgvector).mockResolvedValueOnce([{ table: "IngredientCanon", dims: 1536 }]);
    await expect(checkEmbeddingDims()).rejects.toThrow(/No embedding column on RecipeDoc/);
  });
});
