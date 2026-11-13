import { afterEach, describe, expect, it, vi } from "vitest";
import { postCallback } from "../../server/bridge/callback";

const target = { url: "http://cb.test/chat/events?user=alex", token: "cb-secret-token" };
const body = { source: "butler", chat_id: "c1", text: "hi", done: { ok: true } };
const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

afterEach(() => vi.restoreAllMocks());

describe("postCallback", () => {
  it("posts JSON with the bearer token and returns true on 2xx", async () => {
    const f = vi.fn(async () => res(200));
    expect(await postCallback(target, body, { fetchImpl: f as any })).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe(target.url);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer cb-secret-token");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("retries once after a 5xx and returns true when the retry succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    expect(await postCallback(target, body, { fetchImpl: f as any, retryDelayMs: 1 })).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn(async () => res(401));
    expect(await postCallback(target, body, { fetchImpl: f as any, retryDelayMs: 1 })).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("returns false without throwing on a network error, after one retry", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await postCallback(target, body, { fetchImpl: f as any, retryDelayMs: 1 })).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("never logs the token or the URL query", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const f = vi.fn(async () => res(500));
    await postCallback(target, body, { fetchImpl: f as any, retryDelayMs: 1 });
    const lines = [...err.mock.calls, ...log.mock.calls].flat().join("\n");
    expect(lines).toContain("callback final for chat c1 failed: 500");
    expect(lines).not.toContain("cb-secret-token");
    expect(lines).not.toContain("user=alex");
  });
});
