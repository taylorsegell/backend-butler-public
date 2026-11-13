import { decide, pendingApprovals, type PendingApproval } from "../approvals.js";
import { claimChat, releaseChat, runTurn, type ChatDeps } from "../chat.js";
import type { Approval, Part } from "../../shared/transcript.js";
import type { Caller } from "./auth.js";
import { postCallback, type CallbackTarget } from "./callback.js";

export const HANDOFF_APPROVAL_MS = 15 * 60_000;
export const MAX_RUNNING = 3;

/** A tool result: `{error}` on failure. The MCP layer turns it into a text block. */
export type ToolResult = Record<string, unknown>;

const MAX_REQUEST = 4000;
const MAX_FINAL = 4000;
const MAX_LAST_TEXT = 1000;
const STILL_WORKING = "Butler is still working on that chat; ask butler_status.";
const NOT_FOUND = "chat not found";

/** Source of truth while a turn runs: a new chat is not in the store until its first turn is saved. */
const running = new Map<string, { status: "running" | "waiting_approval"; owner: string }>();

function textOf(parts: Part[]): string {
  return parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function lastAssistantText(deps: ChatDeps, chatId: string): string {
  const chat = deps.store.get(chatId);
  const last = chat ? [...chat.messages].reverse().find((m) => m.role === "assistant") : undefined;
  return last ? textOf(last.parts).slice(0, MAX_LAST_TEXT) : "";
}

function pendingFor(user: string, chatId: string): PendingApproval[] {
  return pendingApprovals(user).filter((a) => a.chatId === chatId);
}

export function startHandoff(deps: ChatDeps, caller: Caller, request: string, chatId?: string): ToolResult {
  const user = caller.user;
  const callback = caller.callback;
  if (!user || !callback) {
    return {
      error:
        "Butler can only take hand-offs from a worker that sends a callback (set CALLBACK_BASE_URL and TEXT_API_TOKEN on the worker).",
    };
  }
  const text = typeof request === "string" ? request.trim() : "";
  if (text.length < 1 || text.length > MAX_REQUEST) return { error: `request must be 1-${MAX_REQUEST} characters.` };

  let chat;
  if (chatId) {
    const live = running.get(chatId);
    if (live) return { error: live.owner === user ? STILL_WORKING : NOT_FOUND };
    chat = deps.store.get(chatId);
    if (!chat || chat.owner !== user) return { error: NOT_FOUND };
  } else {
    chat = deps.store.draft(user);
  }
  if (running.size >= MAX_RUNNING) return { error: "Butler is busy with other requests; try again shortly." };
  if (!claimChat(chat.id)) return { error: STILL_WORKING };

  running.set(chat.id, { status: "running", owner: user });
  void runBackground(deps, chat, user, callback, text);
  return { chat_id: chat.id, status: "started" };
}

async function runBackground(
  deps: ChatDeps,
  chat: Parameters<typeof runTurn>[1],
  owner: string,
  callback: CallbackTarget,
  request: string,
): Promise<void> {
  const chatId = chat.id;
  const titles = new Map<string, string>();
  // Callbacks run through one promise chain, so their order equals emit order.
  let chain: Promise<unknown> = Promise.resolve();
  const send = (body: Record<string, unknown>) => {
    chain = chain.then(() => postCallback(callback, { source: "butler", chat_id: chatId, ...body }));
  };
  const emit = (event: string, data: unknown) => {
    if (event === "approval") {
      const a = data as Approval & { toolUseId?: string };
      const entry = pendingApprovals(owner).find((p) => p.id === a.id);
      const expiresAt = entry?.expiresAt ?? new Date(Date.now() + HANDOFF_APPROVAL_MS).toISOString();
      titles.set(a.id, a.title);
      const live = running.get(chatId);
      if (live) live.status = "waiting_approval";
      send({
        text: `Approval needed: ${a.title}. ${a.summary}. Say yes or no. (approval ${a.id})`,
        approval: {
          id: a.id,
          toolUseId: a.toolUseId,
          title: a.title,
          summary: a.summary,
          preview: a.preview,
          ...(a.outline ? { outline: a.outline } : {}),
          chat_id: chatId,
          expires_at: expiresAt,
        },
      });
    } else if (event === "approval_result") {
      const r = data as { id: string; allow: boolean };
      const title = titles.get(r.id) ?? "the change";
      const live = running.get(chatId);
      if (live) live.status = "running";
      send({
        text: r.allow ? `Approved: ${title}.` : `Not approved: ${title}.`,
        approval_result: { id: r.id, allow: r.allow, chat_id: chatId },
      });
    }
  };

  try {
    const result = await runTurn(deps, chat, { message: request, images: [] }, emit, {
      gate: { timeoutMs: HANDOFF_APPROVAL_MS, chatId, owner },
    });
    if (result.ok) {
      send({ text: textOf(result.parts).slice(0, MAX_FINAL) || "Butler finished.", done: { ok: true } });
    } else {
      const err = [...result.parts].reverse().find((p) => p.kind === "error");
      const msg = err && err.kind === "error" ? err.text : "the turn did not finish";
      send({ text: `Butler hit an error: ${msg}`.slice(0, MAX_FINAL), done: { ok: false } });
    }
  } catch (err) {
    send({ text: `Butler hit an error: ${err instanceof Error ? err.message : String(err)}`.slice(0, MAX_FINAL), done: { ok: false } });
  } finally {
    releaseChat(chatId);
    running.delete(chatId);
    await chain.catch(() => {});
  }
}

export function handoffStatus(deps: ChatDeps, caller: Caller, chatId: string): ToolResult {
  const user = caller.user;
  if (!user) return { error: NOT_FOUND };
  const live = running.get(chatId);
  if (live) {
    if (live.owner !== user) return { error: NOT_FOUND };
    return { chat_id: chatId, status: live.status, last_text: lastAssistantText(deps, chatId), pending: pendingFor(user, chatId) };
  }
  const chat = deps.store.get(chatId);
  if (!chat || chat.owner !== user) return { error: NOT_FOUND };
  return { chat_id: chatId, status: "idle", last_text: lastAssistantText(deps, chatId), pending: pendingFor(user, chatId) };
}

export function decideApproval(caller: Caller, id: string, allow: boolean): ToolResult {
  if (!caller.user || !decide(id, allow, caller.user)) return { error: "no pending approval with that id" };
  return { ok: true, id, allow };
}
