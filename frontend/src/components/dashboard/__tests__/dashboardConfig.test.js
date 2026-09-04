import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDashboardSize, normalizeDashboardTracks, normalizeDashboardTypography, readDashboardConfig, threeColumnDashboardConfig } from "../dashboardConfig";

describe("dashboard card sizes", () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  it("migrates the old named size presets", () => {
    localStorage.setItem("canvenient-dashboard-config", JSON.stringify({
      sizes: { tasks: "hero", schedule: "wide", canvas: "tall", notes: "full" },
    }));

    expect(readDashboardConfig().sizes).toEqual({
      tasks: { columns: 3, rows: 3 },
      schedule: { columns: 3, rows: 1 },
      isb: { columns: 1, rows: 1 },
      canvas: { columns: 1, rows: 2 },
    });
  });

  it("rounds and bounds persisted drag dimensions", () => {
    expect(normalizeDashboardSize({ columns: 8, rows: 0 })).toEqual({ columns: 4, rows: 1 });
    expect(normalizeDashboardSize({ columns: 2.4, rows: 3.6 })).toEqual({ columns: 2, rows: 4 });
  });

  it("persists continuous dashboard track proportions", () => {
    expect(normalizeDashboardTracks({ columns: [0.2, 0.3, 0.25, 0.25], rows: [120, 210, 90, 180] })).toEqual({
      columns: [0.2, 0.3, 0.25, 0.25],
      rows: [120, 210, 90, 180],
    });
  });

  it("normalizes dashboard typography and migrates old configurations", () => {
    expect(normalizeDashboardTypography({ family: "serif", size: 13.3 })).toEqual({ family: "serif", size: 13.5 });
    expect(normalizeDashboardTypography({ family: "comic", size: 30 })).toEqual({ family: "sans", size: 16 });
    expect(readDashboardConfig().typography).toEqual({ family: "sans", size: 11 });
  });

  it("keeps NUS ISB available alongside the primary dashboard modules", () => {
    const config = threeColumnDashboardConfig(readDashboardConfig());
    expect(config.order.slice(0, 3)).toEqual(["tasks", "schedule", "canvas"]);
    expect(config.sizes.tasks).toEqual({ columns: 2, rows: 2 });
    expect(config.sizes.schedule).toEqual({ columns: 1, rows: 1 });
    expect(config.sizes.canvas).toEqual({ columns: 1, rows: 2 });
    expect(config.sizes.isb).toEqual({ columns: 1, rows: 1 });
    expect(config.tracks.columns).toEqual([1.35, 1.35, 1, 1]);
    expect(config.tracks.rows).toEqual([220, 520]);
  });
});
