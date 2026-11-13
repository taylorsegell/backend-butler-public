import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const handoff = vi.hoisted(() => ({
  startHandoff: vi.fn(),
  decideApproval: vi.fn(),
  handoffStatus: vi.fn(),
}));
vi.mock("../../server/bridge/handoff", () => handoff);

const { bridgeHandler } = await import("../../server/bridge/listener");
const { approvalRoutes, mcpRoutes } = await import("../../server/bridge/mcp");
const { ApprovalGate, decide, pendingApprovals } = await import("../../server/approvals");
import type { Config } from "../../server/config";

const TOKEN = "test-token";
const cfg = { mode: "dev", apiToken: () => TOKEN, apiPort: 0, apiHost: "127.0.0.1" } as unknown as Config;
const CB_URL = "http://192.0.2.20:8952/chat/events?user=Alex";
const headers = { authorization: `Bearer ${TOKEN}`, "x-callback-url": CB_URL, "x-callback-token": "cb-token" };

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(bridgeHandler(cfg, { ...mcpRoutes({} as any), ...approvalRoutes() }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => vi.clearAllMocks());

async function connect() {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers } }));
  return client;
}
const textOf = (r: any) => JSON.parse(r.content[0].text);

describe("MCP endpoint", () => {
  it("lists exactly the three tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["butler_status", "decide_approval", "hand_to_butler"]);
    await client.close();
  });

  it("hand_to_butler passes the caller and returns the result as text JSON", async () => {
    handoff.startHandoff.mockReturnValue({ chat_id: "c1", status: "started" });
    const client = await connect();
    const r: any = await client.callTool({ name: "hand_to_butler", arguments: { request: "make an automation" } });
    expect(textOf(r)).toEqual({ chat_id: "c1", status: "started" });
    expect(r.isError).toBe(false);
    const [, caller, request, chatId] = handoff.startHandoff.mock.calls[0];
    expect(caller).toEqual({ user: "alex", callback: { url: CB_URL, token: "cb-token" } });
    expect(request).toBe("make an automation");
    expect(chatId).toBeUndefined();
    await client.close();
  });

  it("an error result sets isError and keeps the {error} text", async () => {
    handoff.decideApproval.mockReturnValue({ error: "no pending approval with that id" });
    handoff.handoffStatus.mockReturnValue({ chat_id: "c1", status: "idle", last_text: "", pending: [] });
    const client = await connect();
    const r: any = await client.callTool({ name: "decide_approval", arguments: { id: "x", allow: true } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toEqual({ error: "no pending approval with that id" });
    const s: any = await client.callTool({ name: "butler_status", arguments: { chat_id: "c1" } });
    expect(s.isError).toBe(false);
    expect(handoff.handoffStatus.mock.calls[0][2]).toBe("c1");
    await client.close();
  });

  it("rejects a request without the token and answers 405 to GET with it", async () => {
    const noAuth = await fetch(`${base}/mcp`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(noAuth.status).toBe(401);
    expect(handoff.startHandoff).not.toHaveBeenCalled();
    const get = await fetch(`${base}/mcp`, { headers: { authorization: headers.authorization } });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });
});

describe("approvals REST", () => {
  const auth = { authorization: headers.authorization, "content-type": "application/json" };

  async function pend(owner: string) {
    const events: [string, any][] = [];
    const preview = { title: "Create automation", summary: "s", preview: { kind: "yaml" as const, text: "alias: x" } };
    const gate = new ApprovalGate(
      [{ name: "mcp__ha__upsert_automation", normalize: (i) => i, prepare: async () => preview }],
      (e, d) => events.push([e, d]),
      { timeoutMs: 60_000, chatId: "chat-1", owner },
    );
    const p = gate.canUseTool("mcp__ha__upsert_automation", { id: "a" }, { signal: new AbortController().signal, toolUseID: "tu" } as any);
    await vi.waitFor(() => expect(pendingApprovals(owner).length).toBe(1));
    return { id: pendingApprovals(owner)[0].id, done: p };
  }

  it("lists a pending approval with owner, chat_id and expires_at", async () => {
    const { id, done } = await pend("alex");
    const r = await fetch(`${base}/api/approvals?user=Alex`, { headers: auth });
    const list: any[] = await r.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, chat_id: "chat-1", owner: "alex", title: "Create automation" });
    expect(typeof list[0].expires_at).toBe("string");
    expect(list[0]).not.toHaveProperty("chatId");
    const other = await (await fetch(`${base}/api/approvals?user=bob`, { headers: auth })).json();
    expect(other).toEqual([]);
    decide(id, false);
    await done;
  });

  it("POST /api/approval: wrong user 404 and still pending; mixed-case owner 200; bad types 400", async () => {
    const { id, done } = await pend("alex");
    const post = (body: unknown) => fetch(`${base}/api/approval`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    expect((await post({ id, allow: true, user: "bob" })).status).toBe(404);
    expect(pendingApprovals("alex")).toHaveLength(1);
    expect((await post({ id, allow: "yes" })).status).toBe(400);
    expect((await post({ id, allow: true, user: "   " })).status).toBe(400);
    expect((await post({ id, allow: true, user: " ALEX " })).status).toBe(200);
    expect((await done)!.behavior).toBe("allow");
    expect((await post({ id, allow: true, user: "alex" })).status).toBe(404);
  });
});
