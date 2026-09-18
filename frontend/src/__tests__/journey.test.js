import { describe, expect, it } from "vitest";
import {
  distanceMetres,
  nearestStop,
  nextClass,
  venueCoordinate,
  walkMinutes,
} from "../instrument/journey";
import { localDateKey, startOfLocalDay } from "../components/scheduleUtils";

const STOPS = [
  {
    id: "KR Bus Terminal",
    name: "KR Bus Terminal",
    short_name: "KR BT",
    latitude: 1.2936,
    longitude: 103.7733,
  },
  { id: "EA", name: "EA", short_name: "EA", latitude: 1.2996, longitude: 103.7704 },
];

const LOCATIONS = {
  LT19: { location: { x: 103.7742, y: 1.2956 } },
};

const CENTROIDS = {
  COM1: { lat: 1.2941, lon: 103.7742 },
  BIZ2: { lat: 1.2966, lon: 103.7757 },
};

describe("walkMinutes", () => {
  it("rounds metres at 75 m/min with a 1-minute floor", () => {
    expect(walkMinutes(30)).toBe(1);
    expect(walkMinutes(150)).toBe(2);
    expect(walkMinutes(Infinity)).toBeNull();
  });
});

describe("distanceMetres", () => {
  it("is zero for the same point and positive for campus-scale hops", () => {
    const a = { lat: 1.2936, lon: 103.7733 };
    expect(distanceMetres(a, a)).toBe(0);
    const b = { lat: 1.2996, lon: 103.7704 };
    expect(distanceMetres(a, b)).toBeGreaterThan(600);
    expect(distanceMetres(a, b)).toBeLessThan(1000);
  });
});

describe("venueCoordinate", () => {
  it("reads NUSMods x/y room coordinates first", () => {
    expect(venueCoordinate("LT19", LOCATIONS, CENTROIDS)).toEqual({ lat: 1.2956, lon: 103.7742 });
  });

  it("falls back to the building centroid", () => {
    expect(venueCoordinate("COM1-0201", LOCATIONS, CENTROIDS)).toEqual({
      lat: 1.2941,
      lon: 103.7742,
    });
  });

  it("returns null without a venue", () => {
    expect(venueCoordinate("", LOCATIONS, CENTROIDS)).toBeNull();
    expect(venueCoordinate("NOWHERE-99", LOCATIONS, CENTROIDS)).toBeNull();
  });
});

describe("nearestStop", () => {
  it("picks the closest stop to a coordinate", () => {
    const venue = { lat: 1.2956, lon: 103.7742 };
    expect(nearestStop(venue, STOPS).id).toBe("KR Bus Terminal");
  });

  it("returns null without a coordinate", () => {
    expect(nearestStop(null, STOPS)).toBeNull();
  });
});

describe("nextClass", () => {
  it("finds the next class item after now", () => {
    const now = new Date();
    const monday = startOfLocalDay(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const wednesday = new Date(monday);
    wednesday.setDate(monday.getDate() + 2);
    const schedule = {
      classes: [
        {
          id: 7,
          module_code: "CS2103T",
          lesson_type: "Lecture",
          class_no: "1",
          venue: "LT19",
          day_of_week: 3,
          start_time: "14:00",
          end_time: "15:00",
          attend_in_person: true,
        },
      ],
      events: [],
      exams: [],
    };
    // "Now" placed on the Wednesday itself, before the class starts.
    const before = new Date(wednesday);
    before.setHours(12, 0, 0, 0);
    const found = nextClass(schedule, before, 7);
    expect(found?.classId).toBe(7);
    expect(found?.title).toBe("CS2103T");
    expect(localDateKey(found.start)).toBe(localDateKey(wednesday));

    // After the class ends, nothing is next inside the window.
    const after = new Date(wednesday);
    after.setHours(16, 0, 0, 0);
    const saturday = new Date(after);
    saturday.setDate(after.getDate() + 3);
    expect(nextClass(schedule, after, 3)).toBeNull();
  });
});
