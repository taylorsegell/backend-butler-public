import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { Config } from "../../server/config";
import { bridgeHandler, startBridge } from "../../server/bridge/listener";
import type { BridgeRoutes } from "../../server/bridge/listener";

const cfg = (token: string): Config => ({ mode: "dev", apiToken: () => token, apiPort: 0, apiHost: "127.0.0.1" }) as unknown as Config;
const auth = { authorization: "Bearer test-token" };

let server: Server | null = null;
async function serve(routes: BridgeRoutes, token = "test-token"): Promise<string> {
  server = createServer(bridgeHandler(cfg(token), routes));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

describe("bridge auth gate", () => {
  it("answers 401 without or with a wrong token, and never runs a route", async () => {
    const spy = vi.fn();
    const base = await serve({ "POST /x": spy });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer nope" }]) {
      const res = await fetch(`${base}/x`, { method: "POST", headers, body: "{}" });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect((await fetch(`${base}/api/health`)).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not read the body of an unauthenticated request until the 401 is sent", async () => {
    const read = vi.fn();
    const req = Object.assign(new Readable({ read }), { headers: {}, url: "/x", method: "POST" });
    const res = Object.assign(new EventEmitter(), {
      headersSent: false,
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    });
    const routes = { "POST /x": vi.fn() };
    await bridgeHandler(cfg("test-token"), routes)(req as never, res as never);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.anything());
    expect(read).not.toHaveBeenCalled();
    res.emit("finish"); // only now is the unread body drained
    await new Promise((r) => setImmediate(r));
    expect(read).toHaveBeenCalled();
    expect(routes["POST /x"]).not.toHaveBeenCalled();
  });
});

describe("bridge routing", () => {
  it("serves health to a valid token", async () => {
    const base = await serve({});
    const res = await fetch(`${base}/api/health`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "dev", bridge: true });
  });

  it("answers 404 for an unknown path", async () => {
    const base = await serve({});
    const res = await fetch(`${base}/nope`, { headers: auth });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("passes the parsed caller to a registered route", async () => {
    const seen = vi.fn();
    const base = await serve({
      "POST /x": (_req, res, caller) => {
        seen(caller);
        res.writeHead(200).end("ok");
      },
    });
    const res = await fetch(`${base}/x?ignored=1`, {
      method: "POST",
      headers: { ...auth, "x-callback-url": "http://w:1/chat/events?user=Bob", "x-callback-token": "cb" },
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveBeenCalledWith({ user: "bob", callback: { url: "http://w:1/chat/events?user=Bob", token: "cb" } });
  });

  it("maps a thrown error to 500 without leaking it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const base = await serve({ "GET /boom": () => { throw new Error("secret detail"); } });
    const res = await fetch(`${base}/boom`, { headers: auth });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
  });
});

describe("startBridge", () => {
  it("returns null and listens on nothing when api_token is empty", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(startBridge(cfg(""), {})).toBeNull();
  });

  it("listens when a token is set", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const s = startBridge(cfg("test-token"), {});
    expect(s).not.toBeNull();
    await new Promise<void>((r) => (s!.listening ? r() : s!.once("listening", () => r())));
    const res = await fetch(`http://127.0.0.1:${(s!.address() as AddressInfo).port}/api/health`, { headers: auth });
    expect(res.status).toBe(200);
    await new Promise<void>((r) => s!.close(() => r()));
  });
});
