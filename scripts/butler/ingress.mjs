// Fetch a path from the backend_butler app through HA ingress, as a logged-in browser would.
// Usage: node scripts/butler/ingress.mjs <path> [--method POST --body '{"..."}' | --body-file audio.pcm] [--stream] [--headers]
// Reads the HA admin token from /root/.ha_token at call time; never prints it.
import { readFileSync } from "node:fs";

const HA = process.env.HA_URL ?? "http://homeassistant.local:8123";
const token = readFileSync(process.env.HA_TOKEN_FILE ?? "/root/.ha_token", "utf8").trim();
const args = process.argv.slice(2);
const path = args[0] ?? "";
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const stream = args.includes("--stream");

function wsCall(msg) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(HA.replace(/^http/, "ws") + "/api/websocket");
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_ok") ws.send(JSON.stringify({ id: 1, ...msg }));
      else if (m.type === "auth_invalid") reject(new Error("auth_invalid"));
      else if (m.id === 1) { ws.close(); m.success ? resolve(m.result) : reject(new Error(JSON.stringify(m.error))); }
    };
    ws.onerror = (e) => reject(e);
  });
}

const info = await wsCall({ type: "supervisor/api", endpoint: "/addons/local_backend_butler/info", method: "get" });
const { session } = await wsCall({ type: "supervisor/api", endpoint: "/ingress/session", method: "post" });
const url = HA + info.ingress_url.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
const started = Date.now();
const res = await fetch(url, {
  method: opt("--method") ?? "GET",
  headers: {
    cookie: `ingress_session=${session}`,
    ...(opt("--body") ? { "content-type": "application/json" } : {}),
    ...(opt("--body-file") ? { "content-type": "application/octet-stream" } : {}),
  },
  body: opt("--body-file") ? readFileSync(opt("--body-file")) : opt("--body"),
});
console.error(`${res.status} ${res.headers.get("content-type")} ${url.replace(/hassio_ingress\/[^/]+/, "hassio_ingress/<token>")}`);
if (args.includes("--headers")) for (const [k, v] of res.headers) if (!/cookie/i.test(k)) console.error(`  ${k}: ${v}`);
if (stream && res.body) {
  const dec = new TextDecoder();
  for await (const chunk of res.body) process.stdout.write(`[+${Date.now() - started}ms] ${dec.decode(chunk)}`);
} else {
  process.stdout.write(await res.text());
}
