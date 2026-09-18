import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map();
vi.stubGlobal("localStorage", {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
});
vi.stubGlobal("window", {
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const getAssistantBrief = vi.fn();
vi.mock("../api", () => ({ getAssistantBrief: (...args) => getAssistantBrief(...args) }));

const { DASHBOARD_DEFAULTS, readDashboardConfig, writeDashboardConfig } =
  await import("../instrument/dashboardConfig");
const { loadBrief, readBriefCache, shouldRefetch, writeBriefCache, BRIEF_REFRESH_MS } =
  await import("../instrument/briefCache");
const { clockParts, examRows } = await import("../instrument/ledger");

beforeEach(() => {
  store.clear();
  getAssistantBrief.mockReset();
});

describe("dashboardConfig", () => {
  it("falls back to defaults on an empty store", () => {
    expect(readDashboardConfig()).toEqual(DASHBOARD_DEFAULTS);
  });

  it("merges patches, persists, and rejects unknown values", () => {
    writeDashboardConfig({ clock: "12h", busCard: "hero" });
    writeDashboardConfig({ seconds: false, busCard: "nope" });
    const config = readDashboardConfig();
    expect(config).toMatchObject({ clock: "12h", seconds: false, busCard: "hero" });
    expect(JSON.parse(store.get("canvenient.instrument.dashboard")).busCard).toBe("hero");
  });

  it("keeps the horizon shape sane", () => {
    writeDashboardConfig({ horizon: { view: "list", range: 30, label: "due pressure" } });
    expect(readDashboardConfig().horizon).toEqual({
      view: "list",
      range: 14,
      label: "due pressure",
    });
  });
});

describe("briefCache", () => {
  it("round-trips a payload and knows when it is stale", () => {
    expect(readBriefCache()).toBeNull();
    writeBriefCache({ summary: "hello" });
    const entry = readBriefCache();
    expect(entry.brief.summary).toBe("hello");
    expect(shouldRefetch(entry, entry.at + BRIEF_REFRESH_MS + 1)).toBe(true);
    expect(shouldRefetch(entry, entry.at + 1000)).toBe(false);
  });

  it("serves a fresh cache without asking the network", async () => {
    writeBriefCache({ summary: "cached" });
    const { brief, fromCache } = await loadBrief("token");
    expect(brief.summary).toBe("cached");
    expect(fromCache).toBe(true);
    expect(getAssistantBrief).not.toHaveBeenCalled();
  });

  it("refreshes when stale and keeps old words on failure", async () => {
    const old = { brief: { summary: "old" }, at: Date.now() - BRIEF_REFRESH_MS - 5000 };
    store.set("canvenient.cache.brief", JSON.stringify(old));
    getAssistantBrief.mockRejectedValueOnce(new Error("down"));
    const { brief, failed } = await loadBrief("token");
    expect(getAssistantBrief).toHaveBeenCalled();
    expect(brief.summary).toBe("old");
    expect(failed).toBe(true);

    getAssistantBrief.mockResolvedValueOnce({ summary: "new" });
    const second = await loadBrief("token", { force: true });
    expect(second.brief.summary).toBe("new");
    expect(readBriefCache().brief.summary).toBe("new");
  });
});

describe("clockParts", () => {
  it("renders the two clock voices", () => {
    const evening = new Date(2026, 8, 29, 21, 7, 9);
    expect(clockParts(evening)).toEqual({ main: "21:07", tail: ":09" });
    expect(clockParts(evening, { clock: "12h", seconds: false })).toEqual({
      main: "9:07",
      tail: " pm",
    });
    expect(clockParts(new Date(2026, 8, 29, 0, 3, 0), { clock: "12h", seconds: false })).toEqual({
      main: "12:03",
      tail: " am",
    });
  });
});

describe("examRows", () => {
  it("keeps the upcoming window sorted, without the past", () => {
    const now = new Date(2026, 8, 29, 9, 0);
    const rows = examRows(
      [
        {
          id: 1,
          module_code: "MA1501",
          start_at: "2026-11-30T01:00:00Z",
          end_at: "2026-11-30T03:00:00Z",
        },
        { id: 2, module_code: "CS2040", start_at: "2026-11-23T02:00:00Z" },
        { id: 3, module_code: "OLD", start_at: "2026-08-01T02:00:00Z" },
        { id: 4, module_code: "FAR", start_at: "2027-06-01T02:00:00Z" },
      ],
      now,
    );
    expect(rows.map((r) => r.moduleCode)).toEqual(["CS2040", "MA1501"]);
    expect(rows[1].end).not.toBeNull();
    expect(rows[0].end).toBeNull();
  });
});
