// React is required by the test JSX transform.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCampusBusArrivals,
  getCampusBusStops,
  planCampusBusTrip,
  searchCampusBusPlaces,
} from "../../../api";
import CampusBusModule from "../CampusBusModule";

vi.mock("../../../api", () => ({
  getCampusBusArrivals: vi.fn(),
  getCampusBusStops: vi.fn(),
  getSchedule: vi.fn().mockResolvedValue({ classes: [] }),
  planCampusBusTrip: vi.fn(),
  searchCampusBusPlaces: vi.fn(),
}));

const stops = [
  { id: "COM3", name: "COM 3", latitude: 1.294431, longitude: 103.775217 },
  { id: "UTOWN", name: "University Town", latitude: 1.303876, longitude: 103.774621 },
];

describe("CampusBusModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    });
    getCampusBusStops.mockResolvedValue({ stops });
    getCampusBusArrivals.mockResolvedValue({
      stop: { id: "COM3", name: "COM 3" },
      arrivals: [
        { service: "A1", minutes: [2, 9] },
        { service: "D2", minutes: [0] },
      ],
      updated_at: "2026-09-01T10:00:00+08:00",
    });
    searchCampusBusPlaces.mockImplementation((_token, query) =>
      Promise.resolve({
        places: normaliseQuery(query).includes("computing")
          ? [
              {
                id: "place:soc",
                name: "School of Computing",
                subtitle: "Kent Ridge Campus",
                latitude: 1.2946,
                longitude: 103.7748,
              },
            ]
          : [
              {
                id: "place:utown",
                name: "University Town",
                subtitle: "Kent Ridge Campus",
                latitude: 1.3038,
                longitude: 103.7746,
              },
            ],
      }),
    );
    planCampusBusTrip.mockResolvedValue({
      routes: [
        {
          service: "D2",
          from_stop: { id: "COM3", name: "COM 3" },
          to_stop: { id: "UTOWN", name: "University Town" },
          next_bus_minutes: 6,
          bus_travel_minutes: 10,
          travel_time_source: "live",
          stops_count: 2,
          stops: ["COM 3", "Museum", "University Town"],
          stop_arrival_at: "2026-09-01T10:16:00+08:00",
          destination_arrival_at: "2026-09-01T10:17:00+08:00",
        },
      ],
    });
  });

  it("shows departures as the default view", async () => {
    render(<CampusBusModule token="token" />);

    expect(await screen.findByText("A1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "COM 3" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search NUS bus stops")).toBeInTheDocument();
  });

  it("changes the live departures when a bus stop is typed", async () => {
    render(<CampusBusModule token="token" />);

    await screen.findByText("A1");
    const input = screen.getByLabelText("Search NUS bus stops");
    fireEvent.change(input, { target: { value: "University Town" } });

    const option = await screen.findByRole("option", { name: /University Town/i });
    fireEvent.mouseDown(option);

    await waitFor(() => expect(getCampusBusArrivals).toHaveBeenLastCalledWith("token", "UTOWN"));
    expect(localStorage.getItem("canvenient-isb-stop")).toBe("UTOWN");
  });

  it("shows favourite stops directly in the chips list", async () => {
    render(<CampusBusModule token="token" />);

    await screen.findByText("A1");
    fireEvent.click(screen.getByLabelText("Add to favourites"));

    expect(localStorage.getItem("canvenient-isb-favourites")).toBe(JSON.stringify(["COM3"]));
    expect(screen.getByLabelText("Remove from favourites")).toBeInTheDocument();
  });

  it("uses the current location to switch to nearest stop", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success) =>
          success({ coords: { latitude: 1.3038, longitude: 103.7746 } }),
      },
    });
    render(<CampusBusModule token="token" />);

    await screen.findByText("A1");
    fireEvent.click(screen.getByLabelText("Find nearest stop and switch to it"));

    await waitFor(() => expect(getCampusBusArrivals).toHaveBeenCalledWith("token", "UTOWN"));
  });

  it("plans a location-to-location trip with a catchable bus and destination time", async () => {
    render(<CampusBusModule token="token" />);
    fireEvent.click(screen.getByLabelText("Plan a campus route"));
    fireEvent.change(screen.getByPlaceholderText(/School of Computing/i), {
      target: { value: "School of Computing" },
    });
    fireEvent.change(screen.getByPlaceholderText(/University Town/i), {
      target: { value: "University Town" },
    });

    await waitFor(() => expect(searchCampusBusPlaces).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Find Routes" }));

    expect(await screen.findByText("Next bus in 6 min")).toBeInTheDocument();
    expect(screen.getAllByText("University Town").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 stops · 10 min ride/)).toBeInTheDocument();
    expect(planCampusBusTrip).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        from_name: "School of Computing",
        to_name: "University Town",
      }),
    );
  });

  it("offers retry when the live provider is unavailable", async () => {
    getCampusBusArrivals.mockRejectedValueOnce(new Error("offline"));
    render(<CampusBusModule token="token" />);

    fireEvent.click(await screen.findByText("Retry"));
    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("shows a fresh cached arrival while it refreshes in the background", async () => {
    localStorage.setItem(
      "canvenient-isb-arrivals-cache:COM3",
      JSON.stringify({
        cachedAt: Date.now(),
        value: {
          stop: { id: "COM3", name: "COM 3" },
          arrivals: [{ service: "A2", minutes: [4] }],
          updated_at: "2026-09-01T10:00:00+08:00",
        },
      }),
    );
    getCampusBusArrivals.mockImplementation(() => new Promise(() => {}));

    render(<CampusBusModule token="token" />);

    expect(await screen.findByText("A2")).toBeInTheDocument();
    expect(screen.getByText(/Cached data/i)).toBeInTheDocument();
  });
});

function normaliseQuery(value) {
  return value.trim().toLocaleLowerCase();
}
