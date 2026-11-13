import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { decide, pendingApprovals } from "../approvals.js";
import type { ChatDeps } from "../chat.js";
import { readJson, sendJson } from "../http.js";
import { normalizeUser } from "./auth.js";
import type { BridgeRoutes } from "./listener.js";
import { decideApproval, handoffStatus, startHandoff, type ToolResult } from "./handoff.js";

const SERVER_VERSION = "0.7.0";

const asContent = (result: ToolResult) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result) }],
  isError: "error" in result,
});

/** MCP Streamable HTTP, stateless: every POST gets its own server and transport. */
export function mcpRoutes(deps: ChatDeps): BridgeRoutes {
  const notAllowed = (_req: unknown, res: Parameters<BridgeRoutes[string]>[1]) => {
    res.setHeader("allow", "POST");
    sendJson(res, 405, { error: "method not allowed" });
  };
  return {
    "POST /mcp": async (req, res, caller) => {
      const body = await readJson<unknown>(req);
      const server = new McpServer({ name: "backend-butler", version: SERVER_VERSION });
      server.registerTool(
        "hand_to_butler",
        {
          description:
            "Hand a request to Backend Butler, which creates and edits Home Assistant automations, scripts and configuration. Use it for those, not for switching devices. It answers at once with a chat_id; Butler reports its progress and result later as an update. Pass chat_id to continue the same piece of work.",
          inputSchema: { request: z.string().min(1).max(4000), chat_id: z.string().optional() },
        },
        async ({ request, chat_id }) => asContent(startHandoff(deps, caller, request, chat_id)),
      );
      server.registerTool(
        "decide_approval",
        {
          description:
            "Approve or decline a change Butler asked about. Call it only after the person has said yes or no to that exact change; use the id from Butler's 'Approval needed' update.",
          inputSchema: { id: z.string(), allow: z.boolean() },
        },
        async ({ id, allow }) => asContent(decideApproval(caller, id, allow)),
      );
      server.registerTool(
        "butler_status",
        {
          description:
            "What Butler is doing in a chat: running, waiting_approval or idle, its latest reply, and any approval waiting for an answer.",
          inputSchema: { chat_id: z.string() },
        },
        async ({ chat_id }) => asContent(handoffStatus(deps, caller, chat_id)),
      );
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    },
    "GET /mcp": notAllowed,
    "DELETE /mcp": notAllowed,
  };
}

/** REST access to pending approvals, for the worker's card. Same bearer as the rest of the bridge. */
export function approvalRoutes(): BridgeRoutes {
  return {
    "GET /api/approvals": (req, res) => {
      const user = normalizeUser(new URL(req.url ?? "/", "http://bridge").searchParams.get("user")) ?? undefined;
      const list = pendingApprovals(user).map(({ chatId, expiresAt, owner, ...rest }) => ({
        ...rest,
        chat_id: chatId,
        owner,
        expires_at: expiresAt,
      }));
      sendJson(res, 200, list);
    },
    "POST /api/approval": async (req, res) => {
      const { id, allow, user } = await readJson<{ id?: unknown; allow?: unknown; user?: unknown }>(req);
      if (typeof id !== "string" || typeof allow !== "boolean" || (user !== undefined && typeof user !== "string")) {
        return sendJson(res, 400, { error: "id and allow are required; user must be a string" });
      }
      const owner = user === undefined ? undefined : normalizeUser(user);
      if (owner === null) return sendJson(res, 400, { error: "user must be 1-64 characters" });
      return decide(id, allow, owner) ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: "no pending approval" });
    },
  };
}
