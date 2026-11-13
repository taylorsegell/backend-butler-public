/** Posts an update to the voice worker's callback URL. Fire-and-forget: never throws, retries once on a network error or 5xx. */
export interface CallbackTarget {
  url: string;
  token: string;
}

export interface CallbackOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Which update this is, for log lines only. */
function kindOf(body: Record<string, unknown>): string {
  if (body.approval) return "approval";
  if (body.approval_result) return "approval_result";
  if (body.done) return "final";
  return "update";
}

export async function postCallback(target: CallbackTarget, body: Record<string, unknown>, opts: CallbackOptions = {}): Promise<boolean> {
  const doFetch = opts.fetchImpl ?? fetch;
  const kind = kindOf(body);
  const chat = typeof body.chat_id === "string" ? body.chat_id : "?";
  let failure = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    let retry = false;
    try {
      const res = await doFetch(target.url, {
        method: "POST",
        headers: { authorization: `Bearer ${target.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (res.ok) return true;
      failure = String(res.status);
      retry = res.status >= 500;
    } catch (err) {
      failure = err instanceof Error ? err.name : "error";
      retry = true;
    }
    if (!retry || attempt === 1) break;
    await sleep(opts.retryDelayMs ?? 2000);
  }
  console.error(`[bridge] callback ${kind} for chat ${chat} failed: ${failure}`);
  return false;
}
