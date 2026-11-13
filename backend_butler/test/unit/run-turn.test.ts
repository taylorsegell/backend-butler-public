import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const queries: any[] = [];
let script: (opts: any) => AsyncGenerator<any> = async function* () {};
vi.mock("@anthropic-ai/claude-agent-sdk", async (orig) => {
  const real = await orig<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...real,
    query: (args: any) => {
      queries.push(args.options);
      return script(args.options);
    },
  };
});

const { ChatStore } = await import("../../server/chats");
const { runTurn, claimChat, releaseChat, isBusy } = await import("../../server/chat");
const { pendingApprovals, decide } = await import("../../server/approvals");
const { applyEvent, settle } = await import("../../shared/transcript");

const textDelta = (text: string) => ({
  type: "stream_event",
  parent_tool_use_id: null,
  session_id: "sess-1",
  event: { type: "content_block_delta", delta: { type: "text_delta", text } },
});
const result = { type: "result", subtype: "success", session_id: "sess-1", total_cost_usd: 0, is_error: false };

function deps() {
  const dir = mkdtempSync(join(tmpdir(), "bb-turn-"));
  const config: any = { dataDir: dir, configDir: join(dir, "cfg"), bundledSkillsDir: join(dir, "skills"), model: "m", apiKey: () => "k" };
  const ha: any = { rest: async () => ({ time_zone: "UTC" }) };
  const cache: any = { get: async () => [] };
  return { config, ha, cache, store: new ChatStore(dir) } as any;
}

describe("runTurn", () => {
  it("emits the SDK text and done, saves exactly one turn equal to the fold, and returns ok", async () => {
    script = async function* () {
      yield textDelta("All set.");
      yield result;
    };
    const d = deps();
    const chat = d.store.draft("alice");
    const events: [string, any][] = [];
    const r = await runTurn(d, chat, { message: "hello", images: [] }, (e, data) => events.push([e, data]), {});
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe("sess-1");
    expect(events.map(([e]) => e)).toContain("done");
    expect(events.some(([e, data]) => e === "text" && String(data.delta).includes("All set."))).toBe(true);

    let folded: any[] = [];
    for (const [event, data] of events) folded = applyEvent(folded, { event, data } as any);
    const saved = d.store.get(chat.id)!;
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[0]).toMatchObject({ role: "user", parts: [{ kind: "text", text: "hello" }] });
    expect(saved.messages[1].parts).toEqual(settle(folded));
    expect(r.parts).toEqual(settle(folded));
    expect(saved.owner).toBe("alice");
    expect(saved.sessionId).toBe("sess-1");
  });

  it("reports ok=false and emits error when setup throws, and still saves the turn", async () => {
    const d = deps();
    d.cache.get = async () => {
      throw new Error("ha down");
    };
    const chat = d.store.draft();
    const events: [string, any][] = [];
    const r = await runTurn(d, chat, { message: "x", images: [] }, (e, data) => events.push([e, data]), {});
    expect(r.ok).toBe(false);
    expect(events.find(([e]) => e === "error")![1].message).toContain("ha down");
    expect(d.store.get(chat.id)!.messages).toHaveLength(2);
  });

  it("passes the gate options to the approval gate: owner, chatId and the 15 minute window", async () => {
    let seen: any[] = [];
    let expires = 0;
    script = async function* (opts: any) {
      const p = opts.canUseTool("mcp__ha__call_service", { domain: "scene", service: "turn_on", entity_ids: ["scene.movie"] }, { signal: new AbortController().signal, toolUseID: "tu1" });
      await vi.waitFor(() => expect(pendingApprovals().length).toBe(1));
      seen = pendingApprovals();
      expires = Date.parse(seen[0].expiresAt);
      decide(seen[0].id, false, "alice");
      await p;
      yield result;
    };
    const d = deps();
    const chat = d.store.draft("alice");
    const before = Date.now();
    const events: [string, any][] = [];
    await runTurn(d, chat, { message: "reload", images: [] }, (e, data) => events.push([e, data]), {
      gate: { timeoutMs: 15 * 60_000, owner: "alice", chatId: chat.id },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ owner: "alice", chatId: chat.id });
    expect(expires - before).toBeGreaterThan(14 * 60_000);
    expect(expires - before).toBeLessThan(16 * 60_000);
    expect(events.map(([e]) => e)).toEqual(expect.arrayContaining(["approval", "approval_result", "done"]));
    expect(pendingApprovals()).toEqual([]);
  });

  it("claimChat is exclusive until releaseChat", () => {
    expect(claimChat("c-x")).toBe(true);
    expect(isBusy("c-x")).toBe(true);
    expect(claimChat("c-x")).toBe(false);
    releaseChat("c-x");
    expect(isBusy("c-x")).toBe(false);
    expect(claimChat("c-x")).toBe(true);
    releaseChat("c-x");
  });
});
