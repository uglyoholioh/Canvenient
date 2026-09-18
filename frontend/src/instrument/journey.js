// Class-journey facts — joins the next class with the bus network and campus
// geography. Everything produced here is a statement about the world (arrival
// times, walk minutes, departure thresholds); whether to act on them is left
// entirely to the reader.
//
// Origin, when unknown, is explicit: the pinned bus stop, or the venue of the
// previous class today. With no stated origin the UI shows class facts only.

import { planCampusBusTrip } from "../api";
import { scheduleItemsForDate, startOfLocalDay } from "../components/scheduleUtils";

const WALK_M_PER_MIN = 75;
const ARRIVAL_BUFFER_MIN = 2;

export function distanceMetres(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

export function walkMinutes(metres) {
  if (!Number.isFinite(metres)) return null;
  return Math.max(1, Math.round(metres / WALK_M_PER_MIN));
}

// Venue codes look like "LT19", "COM1-0201", "BIZ2-0301"; coordinates come
// from NUSMods (x = longitude, y = latitude) with building centroids as the
// fallback for unmapped rooms.
export function venueCoordinate(venueCode, locations = {}, centroids = {}) {
  if (!venueCode) return null;
  const code = String(venueCode).trim();
  const direct = locations[code]?.location;
  if (direct?.y != null && direct?.x != null) {
    return { lat: direct.y, lon: direct.x };
  }
  const prefix = code.includes("-") ? code.split("-")[0] : code;
  for (const [building, coord] of Object.entries(centroids)) {
    const first = String(building).split(/[\s-]+/)[0];
    if (first && first.toLowerCase() === prefix.toLowerCase() && coord?.lat != null) {
      return { lat: coord.lat, lon: coord.lon };
    }
  }
  return null;
}

export function stopById(stops, stopId) {
  return (stops || []).find((stop) => stop.id === stopId) || null;
}

export function nearestStop(coord, stops = []) {
  if (!coord) return null;
  let best = null;
  for (const stop of stops) {
    if (stop.latitude == null || stop.longitude == null) continue;
    const dist = distanceMetres(coord, { lat: stop.latitude, lon: stop.longitude });
    if (!best || dist < best.dist) best = { stop, dist };
  }
  return best ? { ...best.stop, dist: best.dist } : null;
}

// The next class from the schedule, today or within `dayCount` days.
export function nextClass(schedule, now, dayCount = 7) {
  const start = startOfLocalDay(now);
  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const items = scheduleItemsForDate(schedule, day).filter(
      (item) => item.kind === "class" && item.attendInPerson !== false && item.end > now,
    );
    if (items.length) return items[0];
  }
  return null;
}

// Joins one class to the bus network. Returns structured facts; the caller
// decides what to render.
//
//   {
//     originLabel, venueCoord, venueStop, walkFromStopMin,
//     best: { service, fromStopName, leaveBy: Date, arrivesAt: Date,
//             travelSource, walkFromStopMin, makesIt },
//     routes: [...],
//   }
export async function buildClassJourney({ token, cls, origin, stops: _stops, locations, centroids, now }) {
  if (!cls || !origin?.coord) return null;
  const venueCoord = venueCoordinate(cls.venue, locations, centroids);
  if (!venueCoord) return null;

  let trip;
  try {
    trip = await planCampusBusTrip(token, {
      from_name: origin.label,
      from_latitude: origin.coord.lat,
      from_longitude: origin.coord.lon,
      to_name: cls.venue,
      to_latitude: venueCoord.lat,
      to_longitude: venueCoord.lon,
    });
  } catch {
    return null;
  }

  const routes = (trip?.routes || []).map((route) => {
    const arrivesAt = new Date(route.destination_arrival_at);
    const walkMin = walkMinutes(route.walking_from_stop_metres);
    const leaveBy =
      route.next_bus_minutes != null
        ? new Date(
            now.getTime() +
              (route.next_bus_minutes - route.walking_to_stop_metres / WALK_M_PER_MIN) * 60000,
          )
        : null;
    return {
      service: route.service,
      fromStopName: route.from_stop?.name || origin.label,
      toStopName: route.to_stop?.name || cls.venue,
      nextBusMinutes: route.next_bus_minutes,
      busTravelMinutes: route.bus_travel_minutes,
      travelSource: route.travel_source,
      walkToStopMin: walkMinutes(route.walking_to_stop_metres),
      walkFromStopMin: walkMin,
      arrivesAt,
      leaveBy,
      stopsCount: route.stops_count,
      makesIt: cls.start.getTime() - arrivesAt.getTime() >= ARRIVAL_BUFFER_MIN * 60000,
    };
  });

  const best = routes.find((route) => route.makesIt) || null;
  return {
    originLabel: origin.label,
    venueCoord,
    venueStopName: routes[0]?.toStopName || null,
    walkFromStopMin: best?.walkFromStopMin ?? routes[0]?.walkFromStopMin ?? null,
    best,
    routes,
  };
}

// Origin resolution, in order of honesty: where the previous class today is,
// then the pinned bus stop, then nothing.
export function resolveOrigin({ schedule, now, stops, pinnedStopId, locations, centroids }) {
  const todayItems = scheduleItemsForDate(schedule, now).filter(
    (item) => item.end <= now && item.venue,
  );
  const previous = todayItems[todayItems.length - 1];
  if (previous) {
    return {
      label: previous.venue,
      coord: venueCoordinate(previous.venue, locations, centroids),
      kind: "previous-venue",
    };
  }
  const pinned = stopById(stops, pinnedStopId);
  if (pinned && pinned.latitude != null) {
    return {
      label: pinned.short_name || pinned.name,
      coord: { lat: pinned.latitude, lon: pinned.longitude },
      kind: "pinned-stop",
    };
  }
  return null;
}
