import { describe, expect, it } from "vitest";
import { bearerOk, callerOf, normalizeUser } from "../../server/bridge/auth";

describe("bearerOk", () => {
  it("accepts the right token only", () => {
    expect(bearerOk("Bearer test-token", "test-token")).toBe(true);
    expect(bearerOk("Bearer wrong-token", "test-token")).toBe(false);
    expect(bearerOk("Bearer test-token-and-more", "test-token")).toBe(false);
    expect(bearerOk("Bearer t", "test-token")).toBe(false);
  });
  it("never matches an empty configured token", () => {
    expect(bearerOk("Bearer ", "")).toBe(false);
    expect(bearerOk("Bearer anything", "")).toBe(false);
    expect(bearerOk(undefined, "")).toBe(false);
  });
  it("rejects other schemes and a missing header", () => {
    expect(bearerOk("Basic test-token", "test-token")).toBe(false);
    expect(bearerOk("test-token", "test-token")).toBe(false);
    expect(bearerOk(undefined, "test-token")).toBe(false);
  });
});

describe("normalizeUser", () => {
  it("trims, casefolds and bounds the length", () => {
    expect(normalizeUser("  AlEx ")).toBe("alex");
    expect(normalizeUser("a".repeat(64))).toBe("a".repeat(64));
    expect(normalizeUser("a".repeat(65))).toBeNull();
    expect(normalizeUser("   ")).toBeNull();
    expect(normalizeUser(null)).toBeNull();
    expect(normalizeUser(undefined)).toBeNull();
  });
});

describe("callerOf", () => {
  const url = "http://192.0.2.20:8952/chat/events?user=Alex";
  it("reads a worker-shaped header pair", () => {
    expect(callerOf({ "x-callback-url": url, "x-callback-token": "cb-token" })).toEqual({
      user: "alex",
      callback: { url, token: "cb-token" },
    });
  });
  it("drops the callback for a bad scheme, garbage URL or missing token", () => {
    expect(callerOf({ "x-callback-url": "ftp://host/x?user=a", "x-callback-token": "t" }).callback).toBeNull();
    expect(callerOf({ "x-callback-url": "not a url", "x-callback-token": "t" }).callback).toBeNull();
    expect(callerOf({ "x-callback-url": url }).callback).toBeNull();
    expect(callerOf({ "x-callback-url": url, "x-callback-token": "  " }).callback).toBeNull();
  });
  it("gives user null without a user param, with no headers at all", () => {
    expect(callerOf({ "x-callback-url": "http://h/chat/events", "x-callback-token": "t" }).user).toBeNull();
    expect(callerOf({})).toEqual({ user: null, callback: null });
  });
});
