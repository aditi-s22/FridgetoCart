import { afterEach, describe, expect, it, vi } from "vitest";
import { storeClient } from "./storeClient";

const cart = { id: "c1", items: [], total: 0 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("storeClient retries (cold-start tolerance)", () => {
  it("retries once after a dropped connection and then succeeds", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce(json(201, cart));
    vi.stubGlobal("fetch", fetchMock);
    await expect(storeClient.createCart("scan1")).resolves.toEqual(cart);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 503 from a proxy in front of a waking store", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(503, null)).mockResolvedValueOnce(json(200, cart));
    vi.stubGlobal("fetch", fetchMock);
    await expect(storeClient.getCart("c1")).resolves.toEqual(cart);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after two attempts with a store_unavailable error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(storeClient.createCart("scan1")).rejects.toMatchObject({ status: 502, code: "store_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry real answers such as out_of_stock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(409, { error: { code: "out_of_stock", message: "Only 0 in stock" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(storeClient.setItem("c1", "p1", 1, "k")).rejects.toMatchObject({ status: 409, code: "out_of_stock" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wake() never throws, even when the store is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(storeClient.wake()).resolves.toBeUndefined();
  });
});
