// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVenueInformation, getVenueLocations, searchCampusBusPlaces } from "../../api";
import VenueFinder from "../VenueFinder";

vi.mock("../../api", () => ({
  getVenueInformation: vi.fn(),
  getVenueLocations: vi.fn(),
  searchCampusBusPlaces: vi.fn(),
}));

const MOCK_VENUE_INFO = {
  "COM1-0206": [
    {
      day: "Monday",
      classes: [
        {
          classNo: "1",
          startTime: "1000",
          endTime: "1200",
          day: "Monday",
          lessonType: "Lecture",
          size: 60,
          moduleCode: "CS2040C",
        },
      ],
      availability: {
        "1000": "occupied",
        "1030": "occupied",
        "1100": "occupied",
        "1130": "occupied",
      },
    },
    {
      day: "Tuesday",
      classes: [],
      availability: {},
    },
  ],
  "AS6-0208": [
    {
      day: "Monday",
      classes: [
        {
          classNo: "T1",
          startTime: "1400",
          endTime: "1600",
          day: "Monday",
          lessonType: "Tutorial",
          size: 25,
          moduleCode: "PL1101E",
        },
      ],
      availability: {
        "1400": "occupied",
        "1430": "occupied",
        "1500": "occupied",
        "1530": "occupied",
      },
    },
  ],
  "LT27": [
    {
      day: "Monday",
      classes: [],
      availability: {},
    },
  ],
};

const MOCK_LOCATIONS = {
  "COM1-0206": {
    roomName: "Seminar Room 1",
    floor: 2,
    location: { x: 103.77372, y: 1.29495 },
  },
  "AS6-0208": {
    roomName: "Tutorial Room 8",
    floor: 2,
    location: { x: 103.77265, y: 1.29532 },
  },
  "LT27": {
    roomName: "Lecture Theatre 27",
    floor: 1,
    location: { x: 103.78035, y: 1.29785 },
  },
};

const MOCK_BUILDING_CENTROIDS = {
  COM1: [1.29495, 103.77372, "School of Computing 1", "Computing"],
  AS6: [1.29532, 103.77265, "Arts 6", "Arts & Social Sciences"],
  LT: [1.29600, 103.77300, "Lecture Theatre", "General"],
};

describe("VenueFinder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVenueInformation.mockResolvedValue({
      academic_year: "2024-2025",
      semester: 1,
      total_venues: 3,
      venues: MOCK_VENUE_INFO,
    });
    getVenueLocations.mockResolvedValue({
      total_locations: 3,
      locations: MOCK_LOCATIONS,
      building_centroids: MOCK_BUILDING_CENTROIDS,
    });
    searchCampusBusPlaces.mockResolvedValue({
      places: [
        {
          id: "place:1",
          name: "Central Library",
          subtitle: "Kent Ridge Campus",
          latitude: 1.2966,
          longitude: 103.7732,
        },
      ],
    });
  });

  it("renders venue list and allows day selection", async () => {
    render(<VenueFinder token="mock-token" />);

    expect(await screen.findByText("COM1-0206")).toBeInTheDocument();
    expect(screen.getByText("AS6-0208")).toBeInTheDocument();
    expect(screen.getByText("LT27")).toBeInTheDocument();

    // Switch day to Tuesday
    const daySelect = screen.getByDisplayValue(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
    fireEvent.change(daySelect, { target: { value: "Tuesday" } });
    
    expect(daySelect.value).toBe("Tuesday");
  });

  it("filters rooms by text search", async () => {
    render(<VenueFinder token="mock-token" />);

    await screen.findByText("COM1-0206");
    const searchInput = screen.getByPlaceholderText(/Search rooms, buildings/i);
    fireEvent.change(searchInput, { target: { value: "AS6" } });

    expect(screen.getByText("AS6-0208")).toBeInTheDocument();
    expect(screen.queryByText("COM1-0206")).not.toBeInTheDocument();
    expect(screen.queryByText("LT27")).not.toBeInTheDocument();
  });

  it("allows toggling campus locations via the dropdown to filter venues and update proximity", async () => {
    render(<VenueFinder token="mock-token" />);

    await screen.findByText("COM1-0206");
    expect(screen.getByText("AS6-0208")).toBeInTheDocument();
    expect(screen.getByText("LT27")).toBeInTheDocument();

    // Open dropdown
    const dropdownBtn = screen.getByRole("button", { name: /Campus: All locations/i });
    fireEvent.click(dropdownBtn);

    // Dropdown menu should show
    expect(screen.getByText("Campus Locations")).toBeInTheDocument();

    // Tick Computing (COM)
    const comCheckbox = screen.getByLabelText("Computing (COM)");
    fireEvent.click(comCheckbox);

    // Should filter to COM1-0206 and calculate 0m distance from Computing centroid
    expect(screen.getByText("COM1-0206")).toBeInTheDocument();
    expect(screen.queryByText("AS6-0208")).not.toBeInTheDocument();
    expect(screen.getByText("0m")).toBeInTheDocument();

    // Dropdown button label updates
    expect(screen.getByRole("button", { name: /Campus: Computing \(COM\)/i })).toBeInTheDocument();

    // Tick Arts (AS6) as well
    const artsCheckbox = screen.getByLabelText("Arts (AS6)");
    fireEvent.click(artsCheckbox);

    // Now both COM and AS6 should be visible, but not LT27
    expect(screen.getByText("COM1-0206")).toBeInTheDocument();
    expect(screen.getByText("AS6-0208")).toBeInTheDocument();
    expect(screen.queryByText("LT27")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Campus: 2 locations/i })).toBeInTheDocument();

    // Clear filters via active pill
    const clearBtn = screen.getByRole("button", { name: /Clear all/i });
    fireEvent.click(clearBtn);

    // All venues should be visible again
    expect(screen.getByText("COM1-0206")).toBeInTheDocument();
    expect(screen.getByText("AS6-0208")).toBeInTheDocument();
    expect(screen.getByText("LT27")).toBeInTheDocument();
  });

  it("opens venue detail sheet on card click and displays class schedule", async () => {
    render(<VenueFinder token="mock-token" />);

    await screen.findByText("COM1-0206");

    const daySelect = screen.getByDisplayValue(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
    fireEvent.change(daySelect, { target: { value: "Monday" } });

    // Ensure all rooms are visible
    const availableOnlyBtn = screen.getByRole("button", { name: /Available only/i });
    if (availableOnlyBtn.classList.contains("active")) {
      fireEvent.click(availableOnlyBtn);
    }

    const com1Card = (await screen.findByText("COM1-0206")).closest(".vf-card");
    fireEvent.click(com1Card);

    expect(screen.getByText("CS2040C (Lecture)")).toBeInTheDocument();
  });

  it("triggers browser geolocation on Near me click", async () => {
    const getCurrentPositionMock = vi.fn((success) =>
      success({
        coords: { latitude: 1.29495, longitude: 103.77372, accuracy: 10 },
      })
    );
    global.navigator.geolocation = { getCurrentPosition: getCurrentPositionMock };

    render(<VenueFinder token="mock-token" />);

    await screen.findByText("COM1-0206");
    const locateBtn = screen.getByRole("button", { name: /Near me/i });
    fireEvent.click(locateBtn);

    await waitFor(() => expect(getCurrentPositionMock).toHaveBeenCalled());
    expect(screen.getByText(/Current Location/i)).toBeInTheDocument();
  });
});
