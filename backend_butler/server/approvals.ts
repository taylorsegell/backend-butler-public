import { randomUUID } from "node:crypto";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { Emit } from "./sse.js";
import type { Approval, OutlineSection } from "../shared/transcript.js";
import type { DiffLine } from "./yaml.js";

export interface ApprovalRequest {
  title: string;
  summary: string;
  preview: { kind: "yaml"; text: string } | { kind: "diff"; lines: DiffLine[] };
  outline?: OutlineSection[];
}

/** A tool that needs approval. prepare() validates and builds the preview, or returns an error for the agent. */
export interface GatedTool {
  /** Full SDK tool name, e.g. mcp__ha__upsert_automation */
  name: string;
  /**
   * The input as the tool's handler will receive it (the SDK zod-parses raw input with the tool's shape).
   * Grants are keyed on this so a stray key the parser strips cannot make an approved call miss.
   */
  normalize(input: Record<string, unknown>): unknown;
  prepare(input: Record<string, unknown>): Promise<ApprovalRequest | { error: string }>;
  /** Inputs that run without a card (call_service's everyday device control). The tool must re-check them itself. */
  autoAllow?(input: Record<string, unknown>): boolean;
}

type Decision = "allow" | "deny";

export interface GateOptions {
  timeoutMs?: number;
  chatId?: string;
  owner?: string;
}

/** An approval waiting for an answer, with the metadata a REST listing needs. */
export interface PendingApproval extends Approval {
  toolUseId?: string;
  chatId?: string;
  owner?: string;
  expiresAt: string;
}

/** Pending decisions across requests: the card's POST /api/approval arrives on a different connection. */
const pending = new Map<string, { finish: (d: Decision) => void; info: PendingApproval }>();

/** Resolve a pending approval. When `owner` is given it must match the approval's owner; no owner = the sidebar (admin). */
export function decide(id: string, allow: boolean, owner?: string): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  if (owner !== undefined && entry.info.owner !== owner) return false;
  entry.finish(allow ? "allow" : "deny");
  return true;
}

/** Approvals waiting for an answer, oldest first; only one owner's when `owner` is given. */
export function pendingApprovals(owner?: string): PendingApproval[] {
  return [...pending.values()].map((e) => e.info).filter((i) => owner === undefined || i.owner === owner);
}

/** Stable key for a tool call, so an approval can only be spent on exactly what was shown. */
export function callKey(name: string, input: unknown): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
  return `${name}:${JSON.stringify(canon(input))}`;
}

export class ApprovalGate {
  /** key → number of approved, not yet executed calls (identical parallel calls each get their own). */
  private readonly granted = new Map<string, number>();
  private readonly tools: Map<string, GatedTool>;
  private readonly opts: GateOptions;
  private readonly timeoutMs: number;

  constructor(tools: GatedTool[], private readonly emit: Emit, opts: number | GateOptions = {}) {
    this.opts = typeof opts === "number" ? { timeoutMs: opts } : opts;
    this.timeoutMs = this.opts.timeoutMs ?? 5 * 60_000;
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  /** SDK permission callback. Non-gated tools that reach here are denied. */
  readonly canUseTool: CanUseTool = async (toolName, input, { signal, toolUseID }): Promise<PermissionResult> => {
    const tool = this.tools.get(toolName);
    if (!tool) return { behavior: "deny", message: `${toolName} is not available.` };
    if (tool.autoAllow?.(input)) return { behavior: "allow", updatedInput: input };

    const prepared = await tool.prepare(input).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("error" in prepared) {
      return { behavior: "deny", message: `Not sent for approval: ${prepared.error}` };
    }

    const id = randomUUID();
    const info: PendingApproval = {
      id,
      toolUseId: toolUseID,
      ...prepared,
      chatId: this.opts.chatId,
      owner: this.opts.owner,
      expiresAt: new Date(Date.now() + this.timeoutMs).toISOString(),
    };
    // Register (and arm the timer) before emitting, so an emit listener already sees the entry and can decide it.
    const decided = new Promise<Decision>((resolve) => {
      const finish = (d: Decision) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(d);
      };
      const timer = setTimeout(() => finish("deny"), this.timeoutMs);
      pending.set(id, { finish, info });
      signal.addEventListener("abort", () => finish("deny"));
    });
    this.emit("approval", { id, toolUseId: toolUseID, ...prepared });
    const decision = await decided;
    this.emit("approval_result", { id, allow: decision === "allow" });

    if (decision === "allow") {
      const key = callKey(toolName, tool.normalize(input));
      this.granted.set(key, (this.granted.get(key) ?? 0) + 1);
      return { behavior: "allow", updatedInput: input };
    }
    return { behavior: "deny", message: "The user declined this change. Ask what they would like instead." };
  };

  /** Called inside a gated tool before it writes. One approval = one execution of exactly that input. */
  consume(toolName: string, input: unknown): boolean {
    const key = callKey(toolName, input);
    const n = this.granted.get(key) ?? 0;
    if (n === 0) return false;
    if (n === 1) this.granted.delete(key);
    else this.granted.set(key, n - 1);
    return true;
  }
}
