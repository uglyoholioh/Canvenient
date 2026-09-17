import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDashboardConfig } from "../dashboardConfig";

describe("aibrief headline force", () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  it("surfaces aibrief for configs written before it existed", () => {
    localStorage.setItem(
      "canvenient-dashboard-config",
      JSON.stringify({
        order: ["tasks", "schedule", "canvas", "isb"],
        hidden: ["notes", "aibrief", "studytimer", "wheel"],
      }),
    );
    const config = readDashboardConfig();
    expect(config.order[0]).toBe("aibrief");
    expect(config.hidden).not.toContain("aibrief");
  });

  it("respects the user's layout once they have saved one", () => {
    localStorage.setItem("canvenient.aibrief.forced.v2", "1");
    localStorage.setItem(
      "canvenient-dashboard-config",
      JSON.stringify({
        order: ["tasks", "schedule", "canvas", "isb"],
        hidden: ["notes", "studytimer", "wheel"],
      }),
    );
    const config = readDashboardConfig();
    expect(config.order).toEqual(["tasks", "schedule", "canvas", "isb"]);
  });
});
