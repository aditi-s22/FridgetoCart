import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError, errorHandler } from "./http";

function run(err: unknown) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  errorHandler(err, {} as Request, { status } as unknown as Response, vi.fn());
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe("errorHandler", () => {
  it("passes AppError through", () => {
    expect(run(new AppError(409, "x", "nope"))).toEqual({ status: 409, body: { error: { code: "x", message: "nope" } } });
  });
  it("reports malformed JSON as 400", () => {
    expect(run(Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed" })).status).toBe(400);
  });
  it("hides internals of unexpected errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = run(new Error("db password is hunter2"));
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain("hunter2");
  });
});

describe("errorHandler logging", () => {
  it("logs 5xx AppErrors (store or LLM down) but not 4xx", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(new AppError(502, "store_unavailable", "Store is unreachable"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("store_unavailable");
    spy.mockClear();
    run(new AppError(409, "not_awaiting_pick", "x"));
    expect(spy).not.toHaveBeenCalled();
  });
});
