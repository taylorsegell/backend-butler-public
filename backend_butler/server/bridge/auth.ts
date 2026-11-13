import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

/** Who is calling: the voice worker's user id and where to send updates (from its callback headers). */
export interface Caller {
  user: string | null;
  callback: { url: string; token: string } | null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * Constant-time bearer check. Both sides are hashed first so the compared buffers always have equal length.
 * An empty configured token never matches.
 */
export function bearerOk(header: string | undefined, token: string): boolean {
  if (!token || !header || !header.startsWith("Bearer ")) return false;
  return timingSafeEqual(sha256(header.slice("Bearer ".length)), sha256(token));
}

/** Trim, casefold, 1-64 chars; anything else is null. The one place a user id is normalized. */
export function normalizeUser(raw: string | null | undefined): string | null {
  const user = (raw ?? "").trim().toLowerCase();
  return user.length >= 1 && user.length <= 64 ? user : null;
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const v = headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * The worker sends X-Callback-Url (with ?user=<id>) and X-Callback-Token on every MCP request. The bearer token has
 * already proven the caller is the worker, so these headers are trusted for routing only, never for auth.
 */
export function callerOf(headers: IncomingHttpHeaders): Caller {
  let url: URL | null = null;
  try {
    url = new URL(header(headers, "x-callback-url"));
  } catch {
    url = null;
  }
  if (url && url.protocol !== "http:" && url.protocol !== "https:") url = null;
  const token = header(headers, "x-callback-token").trim();
  return {
    user: url ? normalizeUser(url.searchParams.get("user")) : null,
    callback: url && token ? { url: url.toString(), token } : null,
  };
}
