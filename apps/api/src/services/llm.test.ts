import { describe, expect, it } from "vitest";
import { geminiSchema } from "./llm";

describe("geminiSchema", () => {
  it("turns nullable type lists into Gemini's nullable flag, recursively", () => {
    const input = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { qty: { type: ["string", "null"] }, n: { type: "number" } } },
        },
      },
    };
    expect(geminiSchema(input)).toEqual({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { qty: { type: "string", nullable: true }, n: { type: "number" } } },
        },
      },
    });
  });
});
