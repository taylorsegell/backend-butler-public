import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config";
import { haFromConfig } from "../../server/ha";

// Explicit opt-in; no home-specific entity names or inventory thresholds.
const enabled = process.env.HA_SMOKE === "1";
const ha = enabled ? haFromConfig(loadConfig(process.env)) : null;
afterAll(() => ha?.ws.close());

describe.skipIf(!enabled)("HA live smoke (read-only)", () => {
  it("reads states without exposing the inventory", async () => {
    const states = await ha!.getStates();
    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((state) => typeof state.entity_id === "string")).toBe(true);
  });
  it("reads entity, device and area registries over websocket", async () => {
    const registries = await Promise.all([
      ha!.listEntities(), ha!.listDevices(), ha!.listAreas(),
    ]);
    expect(registries.every(Array.isArray)).toBe(true);
  });
  it("accepts valid config and rejects invalid config without installing it", async () => {
    const valid = await ha!.validateConfig({
      triggers: [{ trigger: "sun", event: "sunset" }],
      actions: [{ action: "persistent_notification.create", data: { message: "Smoke test" } }],
    });
    expect(valid.triggers.valid).toBe(true);
    expect(valid.actions.valid).toBe(true);
    const invalid = await ha!.validateConfig({ triggers: [{ trigger: "nonsense" }] });
    expect(invalid.triggers.valid).toBe(false);
  });
});
