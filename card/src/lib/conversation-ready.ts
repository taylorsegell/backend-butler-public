/** A transport connection cannot authorize sending or capture until persistence is ready. */
export function createConversationReady(timeoutMs = 15000) {
  let state: boolean | null = null;
  let finish!: (ready: boolean) => void;
  const promise = new Promise<boolean>(resolve => { finish = resolve; });
  const settle = (ready: boolean) => {
    if (state !== null) return;
    state = ready;
    clearTimeout(timer);
    finish(ready);
  };
  const timer = setTimeout(() => settle(false), timeoutMs);
  return { promise, settle, get state() { return state; } };
}
