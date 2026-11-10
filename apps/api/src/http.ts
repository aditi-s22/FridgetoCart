import type { ErrorRequestHandler } from "express";
import type { z } from "zod";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new AppError(400, "bad_request", msg);
  }
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    // Expected errors (4xx) are the client's problem; 5xx ones (store or LLM down) must be visible in the logs.
    if (err.status >= 500) console.error(`[error] ${err.status} ${err.code}: ${err.message}`);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // express.json() rejects malformed bodies with a 400-class error; don't report that as a server fault.
  if ((err as { type?: string } | null)?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_request", message: "Request body is not valid JSON" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
};
