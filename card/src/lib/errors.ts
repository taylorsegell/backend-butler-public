/**
 * HA's `hass.callApi` rejects with `{ error, status_code, body }` rather than an Error, so
 * a proxy's 503 ("not configured") shows up as `status_code`, not in a message.
 */
export function httpStatus(e: unknown): number | undefined {
  const code = (e as { status_code?: unknown } | null)?.status_code;
  if (typeof code === 'number') return code;
  const text = typeof e === 'string' ? e : (e as Error)?.message ?? '';
  const match = /\b([45]\d\d)\b/.exec(text);
  return match ? Number(match[1]) : undefined;
}
