// Drive Backend Butler end to end through HA ingress, like the phone does.
// Usage: node scripts/butler/drive.mjs [--chat <id>] [--approve|--deny] "<message>" ["<follow-up>" ...]
// Prints a compact transcript (text, tool calls, approval cards) as JSON lines on stdout.
// Reads the HA admin token from /root/.ha_token at call time; never prints it.
import { readFileSync } from "node:fs";

const HA = process.env.HA_URL ?? "http://homeassistant.local:8123";
const token = readFileSync(process.env.HA_TOKEN_FILE ?? "/root/.ha_token", "utf8").trim();
const args = process.argv.slice(2);
let chatId = null;
let decision = null; // null = leave cards waiting (they time out → deny)
const messages = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--chat") chatId = args[++i];
  else if (args[i] === "--approve") decision = true;
  else if (args[i] === "--deny") decision = false;
  else messages.push(args[i]);
}

function wsCall(msg) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(HA.replace(/^http/, "ws") + "/api/websocket");
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_ok") ws.send(JSON.stringify({ id: 1, ...msg }));
      else if (m.type === "auth_invalid") reject(new Error("auth_invalid"));
      else if (m.id === 1) (ws.close(), m.success ? resolve(m.result) : reject(new Error(JSON.stringify(m.error))));
    };
    ws.onerror = reject;
  });
}

const info = await wsCall({ type: "supervisor/api", endpoint: "/addons/local_backend_butler/info", method: "get" });
const { session } = await wsCall({ type: "supervisor/api", endpoint: "/ingress/session", method: "post" });
const base = HA + info.ingress_url.replace(/\/$/, "");
const headers = { cookie: `ingress_session=${session}`, "content-type": "application/json" };
const api = (path, body) => fetch(`${base}/${path}`, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body) });

const out = (o) => console.log(JSON.stringify(o));
if (chatId) out({ chatId }); // a new chat's id arrives as the first event of its first turn

for (const message of messages) {
  out({ user: message });
  const started = Date.now();
  const res = await api("api/chat", { chatId, message });
  if (!res.ok) throw new Error(`chat failed ${res.status}: ${await res.text()}`);
  let buf = "";
  let text = "";
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const dataLine = /^data: (.*)$/m.exec(frame)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === "chat") (chatId = data.chatId), out({ chatId });
      else if (event === "text") text += data.delta;
      else {
        if (text) out({ bot: text }), (text = "");
        if (event === "tool") out({ tool: data.name.replace("mcp__ha__", ""), input: data.input });
        else if (event === "tool_result") out({ result: data.isError ? "ERROR" : "ok", text: data.text.slice(0, 200) });
        else if (event === "approval") {
          out({ approval: data.title, preview: data.preview.kind === "yaml" ? data.preview.text : data.preview.lines.filter((l) => l.op !== " ").map((l) => l.op + " " + l.text).join("\n") });
          if (decision !== null) {
            const r = await api("api/approval", { id: data.id, allow: decision });
            out({ decided: decision ? "approve" : "deny", status: r.status });
          }
        } else if (event === "approval_result") out({ approval_result: data.allow });
        else if (event === "error") out({ error: data.message });
        else if (event === "done") out({ done: true, seconds: Math.round((Date.now() - started) / 100) / 10, costUsd: data.costUsd });
      }
    }
  }
  if (text) out({ bot: text });
}
