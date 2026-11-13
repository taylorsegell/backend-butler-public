import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Config } from "../config.js";
import { BadRequest, BASE_HEADERS, sendJson } from "../http.js";
import { bearerOk, callerOf, type Caller } from "./auth.js";

export const BRIDGE_PORT = 8098;

export type BridgeHandler = (req: IncomingMessage, res: ServerResponse, caller: Caller) => Promise<void> | void;
/** Key: "<METHOD> <path>", e.g. "POST /mcp". */
export type BridgeRoutes = Record<string, BridgeHandler>;

export function bridgeHandler(config: Config, routes: BridgeRoutes) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    for (const [k, v] of Object.entries(BASE_HEADERS)) res.setHeader(k, v);
    // Auth before anything else: no routing and no body read for an unauthenticated caller.
    if (!bearerOk(req.headers.authorization, config.apiToken())) {
      res.setHeader("www-authenticate", "Bearer");
      res.on("finish", () => req.resume());
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (req.method === "GET" && path === "/api/health") {
        return sendJson(res, 200, { ok: true, mode: config.mode, bridge: true });
      }
      const route = routes[`${req.method} ${path}`];
      if (!route) return sendJson(res, 404, { error: "not found" });
      await route(req, res, callerOf(req.headers));
    } catch (err) {
      if (err instanceof BadRequest) {
        if (!res.headersSent) sendJson(res, 400, { error: err.message });
        else res.end();
        return;
      }
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    }
  };
}

/** Second listener beside the ingress one; null (and nothing listening) when api_token is empty. */
export function startBridge(config: Config, routes: BridgeRoutes): Server | null {
  if (!config.apiToken()) {
    console.log("Bridge off: api_token is empty");
    return null;
  }
  const server = createServer(bridgeHandler(config, routes));
  server.listen(config.apiPort, config.apiHost, () => {
    console.log(`Bridge listening on ${config.apiHost}:${config.apiPort}`);
  });
  return server;
}
