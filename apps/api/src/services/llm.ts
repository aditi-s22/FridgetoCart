import { ChatAnthropic } from "@langchain/anthropic";
import type { Embeddings } from "@langchain/core/embeddings";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type { z } from "zod";
import { env } from "../env";
import { AppError } from "../http";

/** Every LLM call in the API goes through this module: model routing + cost logging. */
export type ModelRole = "visionFast" | "visionStrong" | "text";

const ROLE_SPEC: Record<ModelRole, string> = {
  visionFast: env.VISION_MODEL_FAST,
  visionStrong: env.VISION_MODEL_STRONG,
  text: env.TEXT_MODEL,
};

// USD per 1M tokens [input, output]. Unlisted models are logged with cost 0.
const PRICES: Record<string, [number, number]> = {
  "gemini-3.5-flash": [1.5, 9],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gemini-2.0-flash": [0.1, 0.4],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1": [2, 8],
  "text-embedding-3-small": [0.02, 0],
};
// structured() retries once itself, so SDK retries are off and each call is capped.
const CALL_TIMEOUT_MS = 25_000;

export type CallUsage = { model: string; inputTokens: number; outputTokens: number; latencyMs: number; costInr: number };

function splitSpec(spec: string): { provider: string; model: string } {
  const i = spec.indexOf(":");
  if (i < 0) throw new Error(`Model spec "${spec}" must look like "<provider>:<model>"`);
  return { provider: spec.slice(0, i), model: spec.slice(i + 1) };
}

export function modelOf(role: ModelRole): string {
  return splitSpec(ROLE_SPEC[role]).model;
}

const chatCache = new Map<string, BaseChatModel>();

export function chatModel(role: ModelRole): BaseChatModel {
  const spec = ROLE_SPEC[role];
  const cached = chatCache.get(spec);
  if (cached) return cached;
  const { provider, model } = splitSpec(spec);
  let llm: BaseChatModel;
  const opts = { model, temperature: 0, maxRetries: 0 };
  if (provider === "openai") llm = new ChatOpenAI(opts);
  else if (provider === "google") llm = new ChatGoogleGenerativeAI(opts);
  else if (provider === "anthropic") llm = new ChatAnthropic(opts);
  else throw new Error(`Unknown LLM provider "${provider}"`);
  chatCache.set(spec, llm);
  return llm;
}

export function costInr(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) return 0;
  return ((inputTokens * price[0] + outputTokens * price[1]) / 1e6) * env.USD_INR;
}

function logUsage(entry: Omit<CallUsage, "costInr"> & { node: string; ok: boolean }): number {
  const cost = costInr(entry.model, entry.inputTokens, entry.outputTokens);
  console.log(JSON.stringify({ evt: "llm", ...entry, costInr: Number(cost.toFixed(4)) }));
  return cost;
}

/**
 * Gemini's responseSchema rejects JSON Schema type lists like ["string","null"];
 * it wants { type: "string", nullable: true } instead.
 */
export function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k !== "$schema") out[k] = geminiSchema(v);
  }
  if (Array.isArray(out.type)) {
    const types = out.type.filter((t) => t !== "null");
    if (types.length < out.type.length) out.nullable = true;
    out.type = types.length === 1 ? types[0] : types;
  }
  return out;
}

type StructuredOpts<T extends z.ZodTypeAny> = { role: ModelRole; node: string; schema: T; messages: BaseMessage[] };

/**
 * Structured call validated with Zod. Retries once on invalid output, then throws a
 * graceful AppError. Usage is summed over both attempts.
 */
export async function structuredWithUsage<T extends z.ZodTypeAny>(
  opts: StructuredOpts<T>,
): Promise<{ data: z.infer<T>; usage: CallUsage }> {
  const { provider, model } = splitSpec(ROLE_SPEC[opts.role]);
  // The Zod schema still validates the answer below; Gemini just gets a schema it accepts.
  const outputSchema =
    provider === "google" ? (geminiSchema(toJsonSchema(opts.schema)) as Record<string, unknown>) : opts.schema;
  const runnable = chatModel(opts.role).withStructuredOutput(outputSchema, { includeRaw: true });
  const total: CallUsage = { model, inputTokens: 0, outputTokens: 0, latencyMs: 0, costInr: 0 };

  let providerFailed = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let parsed: unknown;
    let usage = { input_tokens: 0, output_tokens: 0 };
    providerFailed = false;
    try {
      const out = await runnable.invoke(opts.messages, { timeout: CALL_TIMEOUT_MS });
      parsed = out.parsed;
      if (AIMessage.isInstance(out.raw) && out.raw.usage_metadata) usage = out.raw.usage_metadata;
    } catch (err) {
      providerFailed = true;
      console.warn(`[llm] ${opts.node} attempt ${attempt} failed:`, (err as Error).message);
    }
    const result = opts.schema.safeParse(parsed);
    const latencyMs = Date.now() - started;
    const call = { model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, latencyMs };
    total.costInr += logUsage({ ...call, node: opts.node, ok: result.success });
    total.inputTokens += call.inputTokens;
    total.outputTokens += call.outputTokens;
    total.latencyMs += latencyMs;
    if (result.success) return { data: result.data, usage: total };
  }
  if (providerFailed) throw new AppError(502, "llm_unavailable", "The AI service failed. Please try again.");
  throw new AppError(502, "llm_invalid_output", "The model returned an unusable answer. Please try again.");
}

export async function structured<T extends z.ZodTypeAny>(opts: StructuredOpts<T>): Promise<z.infer<T>> {
  return (await structuredWithUsage(opts)).data;
}

let embedder: Embeddings | null = null;

function embeddingModel(): Embeddings {
  const { provider, model } = splitSpec(env.EMBED_MODEL);
  if (provider === "google") return new GoogleGenerativeAIEmbeddings({ model, outputDimensionality: env.EMBED_DIM });
  if (provider === "openai") return new OpenAIEmbeddings({ model, dimensions: env.EMBED_DIM });
  throw new Error(`EMBED_MODEL provider "${provider}" is not supported`);
}

/** Embeds texts; every vector must have EMBED_DIM dimensions to fit the vector(N) columns. */
export async function embed(node: string, texts: string[]): Promise<number[][]> {
  embedder ??= embeddingModel();
  const started = Date.now();
  const vectors = await embedder.embedDocuments(texts);
  const bad = vectors.find((v) => v.length !== env.EMBED_DIM);
  if (bad) throw new Error(`${env.EMBED_MODEL} returned ${bad.length}-dim vectors but EMBED_DIM=${env.EMBED_DIM}`);
  // LangChain doesn't surface embedding usage; estimate ~4 chars per token.
  const approxTokens = Math.ceil(texts.join(" ").length / 4);
  const { model } = splitSpec(env.EMBED_MODEL);
  logUsage({ node, model, inputTokens: approxTokens, outputTokens: 0, latencyMs: Date.now() - started, ok: true });
  return vectors;
}
