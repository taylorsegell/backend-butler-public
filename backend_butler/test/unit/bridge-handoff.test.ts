import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A controllable runTurn; claimChat/releaseChat stay real.
let script: (deps: any, chat: any, input: any, emit: any, opts: any) => Promise<any> = async () => ({ parts: [], ok: true });
vi.mock("../../server/chat", async (orig) => {
  const real = await orig<typeof import("../../server/chat")>();
  return { ...real, runTurn: (...a: any[]) => (script as any)(...a) };
});
const sent: any[] = [];
vi.mock("../../server/bridge/callback", () => ({
  postCallback: async (_t: unknown, body: any) => {
    sent.push(body);
    return true;
  },
}));

const { ChatStore } = await import("../../server/chats");
const { ApprovalGate, pendingApprovals } = await import("../../server/approvals");
const { startHandoff, handoffStatus, decideApproval, MAX_RUNNING, HANDOFF_APPROVAL_MS } = await import("../../server/bridge/handoff");

const cb = { url: "http://cb.test/chat/events?user=alice", token: "t" };
const alice = { user: "alice", callback: cb };
const bob = { user: "bob", callback: cb };

function deps() {
  return { store: new ChatStore(mkdtempSync(join(tmpdir(), "bb-handoff-"))) } as any;
}
const flush = () => new Promise((r) => setTimeout(r, 15));
function gate() {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  return { held, release };
}
const textMsg = (text: string) => [{ kind: "text", text }];
/** A turn that saves itself, like the real runTurn, after `held`. */
function savingTurn(held: Promise<void>, parts: any[] = textMsg("done text")) {
  return async (d: any, chat: any, input: any) => {
    await held;
    d.store.saveTurn(chat, { role: "user", parts: textMsg(input.message) }, { role: "assistant", parts });
    return { parts, ok: true };
  };
}
async function waitIdle(d: any, c: any, id: string) {
  for (let i = 0; i < 50; i++) {
    if ((handoffStatus(d, c, id) as any).status === "idle") return;
    await flush();
  }
  throw new Error("still running");
}

beforeEach(() => {
  sent.length = 0;
});

describe("startHandoff", () => {
  it("returns started at once, before the turn ends, then sends exactly one final callback", async () => {
    const d = deps();
    const g = gate();
    script = savingTurn(g.held, textMsg("All done."));
    const r = startHandoff(d, alice, "make an automation") as any;
    expect(r).toMatchObject({ status: "started" });
    expect(typeof r.chat_id).toBe("string");
    await flush();
    expect(sent).toHaveLength(0);
    g.release();
    await waitIdle(d, alice, r.chat_id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ source: "butler", chat_id: r.chat_id, text: "All done.", done: { ok: true } });
    expect(d.store.get(r.chat_id).owner).toBe("alice");
  });

  it("reports an error final when the turn fails, and survives a throwing runTurn", async () => {
    const d = deps();
    script = async () => ({ parts: [{ kind: "error", text: "boom" }], ok: false });
    const a = startHandoff(d, alice, "x") as any;
    await flush();
    expect(sent.at(-1)).toMatchObject({ chat_id: a.chat_id, text: "Butler hit an error: boom", done: { ok: false } });
    script = async () => {
      throw new Error("kaput");
    };
    const b = startHandoff(d, alice, "y") as any;
    await flush();
    expect(sent.at(-1)).toMatchObject({ chat_id: b.chat_id, text: "Butler hit an error: kaput", done: { ok: false } });
    script = async () => ({ parts: [], ok: true });
    startHandoff(d, alice, "z");
    await flush();
    expect(sent.at(-1).text).toBe("Butler finished.");
  });

  it("refuses without a callback or user, and validates the request", () => {
    const d = deps();
    expect((startHandoff(d, { user: "alice", callback: null }, "x") as any).error).toMatch(/CALLBACK_BASE_URL/);
    expect((startHandoff(d, { user: null, callback: cb }, "x") as any).error).toMatch(/TEXT_API_TOKEN/);
    expect((startHandoff(d, alice, "   ") as any).error).toMatch(/1-4000/);
    expect((startHandoff(d, alice, "a".repeat(4001)) as any).error).toMatch(/1-4000/);
  });

  it("answers 'chat not found' to a follow-up on another user's chat or a sidebar chat", async () => {
    const d = deps();
    script = async (dd, chat, input) => {
      dd.store.saveTurn(chat, { role: "user", parts: textMsg(input.message) }, { role: "assistant", parts: textMsg("ok") });
      return { parts: textMsg("ok"), ok: true };
    };
    const r = startHandoff(d, alice, "first") as any;
    await waitIdle(d, alice, r.chat_id);
    expect((startHandoff(d, bob, "mine now", r.chat_id) as any).error).toBe("chat not found");
    const sidebar = d.store.draft();
    d.store.saveTurn(sidebar, { role: "user", parts: textMsg("hi") }, { role: "assistant", parts: textMsg("yo") });
    expect((startHandoff(d, alice, "x", sidebar.id) as any).error).toBe("chat not found");
    expect((startHandoff(d, alice, "x", "nope") as any).error).toBe("chat not found");
    expect(startHandoff(d, alice, "follow up", r.chat_id)).toMatchObject({ chat_id: r.chat_id, status: "started" });
    await waitIdle(d, alice, r.chat_id);
  });

  it("refuses a fourth concurrent hand-off", async () => {
    const d = deps();
    const g = gate();
    script = savingTurn(g.held);
    const ids = Array.from({ length: MAX_RUNNING }, (_, i) => (startHandoff(d, alice, `r${i}`) as any).chat_id);
    expect((startHandoff(d, alice, "one too many") as any).error).toMatch(/busy/);
    g.release();
    for (const id of ids) await waitIdle(d, alice, id);
    expect(startHandoff(d, alice, "now fine")).toMatchObject({ status: "started" });
    await flush();
  });
});

describe("status of a chat that is not saved yet", () => {
  it("reports running with empty last_text, hides it from others, blocks a follow-up, then idle after saving", async () => {
    const d = deps();
    const g = gate();
    script = savingTurn(g.held, textMsg("later"));
    const r = startHandoff(d, alice, "slow one") as any;
    expect(d.store.get(r.chat_id)).toBeNull();
    expect(handoffStatus(d, alice, r.chat_id)).toMatchObject({ chat_id: r.chat_id, status: "running", last_text: "", pending: [] });
    expect((handoffStatus(d, bob, r.chat_id) as any).error).toBe("chat not found");
    expect((startHandoff(d, alice, "again", r.chat_id) as any).error).toMatch(/still working/);
    expect((startHandoff(d, bob, "again", r.chat_id) as any).error).toBe("chat not found");
    g.release();
    await waitIdle(d, alice, r.chat_id);
    expect(handoffStatus(d, alice, r.chat_id)).toMatchObject({ status: "idle", last_text: "later" });
    expect((handoffStatus(d, { user: null, callback: cb }, r.chat_id) as any).error).toBe("chat not found");
  });
});

describe("approvals", () => {
  const tool = {
    name: "mcp__ha__upsert_automation",
    normalize: (i: any) => i,
    prepare: async () => ({ title: "Porch light", summary: "Turns it on at sunset", preview: { kind: "yaml", text: "a: 1" } }),
  };
  /** A turn that asks the real gate for one approval, like buildTools does. */
  function gatedTurn(outcome: { allowed?: boolean }) {
    return async (d: any, chat: any, input: any, emit: any, opts: any) => {
      const g = new ApprovalGate([tool as any], emit, opts.gate);
      const r: any = await g.canUseTool(tool.name, {}, { signal: new AbortController().signal, toolUseID: "tu1" } as any);
      outcome.allowed = r.behavior === "allow";
      d.store.saveTurn(chat, { role: "user", parts: textMsg(input.message) }, { role: "assistant", parts: textMsg("fin") });
      return { parts: textMsg("fin"), ok: true };
    };
  }

  it("relays the approval, waits for the owner's decision, relays the result, then the final", async () => {
    const d = deps();
    const outcome: { allowed?: boolean } = {};
    script = gatedTurn(outcome);
    const r = startHandoff(d, alice, "porch") as any;
    await flush();
    expect(sent).toHaveLength(1);
    const a = sent[0];
    expect(a.text).toMatch(/^Approval needed: Porch light\. Turns it on at sunset\. Say yes or no\. \(approval [0-9a-f-]{36}\)$/);
    expect(a.approval).toMatchObject({ title: "Porch light", chat_id: r.chat_id, toolUseId: "tu1" });
    expect(a.approval.id).toBeTruthy();
    const ms = Date.parse(a.approval.expires_at) - Date.now();
    expect(ms).toBeGreaterThan(HANDOFF_APPROVAL_MS - 5000);
    expect(ms).toBeLessThanOrEqual(HANDOFF_APPROVAL_MS);

    const st = handoffStatus(d, alice, r.chat_id) as any;
    expect(st.status).toBe("waiting_approval");
    expect(st.pending.map((p: any) => p.id)).toEqual([a.approval.id]);

    // Another voice user cannot decide it.
    expect(decideApproval(bob, a.approval.id, true)).toEqual({ error: "no pending approval with that id" });
    expect(pendingApprovals("alice")).toHaveLength(1);
    expect(decideApproval({ user: null, callback: cb }, a.approval.id, true)).toHaveProperty("error");

    expect(decideApproval(alice, a.approval.id, true)).toEqual({ ok: true, id: a.approval.id, allow: true });
    await waitIdle(d, alice, r.chat_id);
    expect(outcome.allowed).toBe(true);
    expect(sent.map((s) => Object.keys(s).filter((k) => ["approval", "approval_result", "done"].includes(k))[0])).toEqual([
      "approval",
      "approval_result",
      "done",
    ]);
    expect(sent[1]).toMatchObject({ text: "Approved: Porch light.", approval_result: { id: a.approval.id, allow: true, chat_id: r.chat_id } });
    expect(sent[2]).toMatchObject({ text: "fin", done: { ok: true } });
    // A second decision never flips the first.
    expect(decideApproval(alice, a.approval.id, false)).toHaveProperty("error");
  });

  it("relays a decline", async () => {
    const d = deps();
    const outcome: { allowed?: boolean } = {};
    script = gatedTurn(outcome);
    const r = startHandoff(d, alice, "porch") as any;
    await flush();
    decideApproval(alice, sent[0].approval.id, false);
    await waitIdle(d, alice, r.chat_id);
    expect(outcome.allowed).toBe(false);
    expect(sent[1]).toMatchObject({ text: "Not approved: Porch light.", approval_result: { allow: false } });
  });
});
