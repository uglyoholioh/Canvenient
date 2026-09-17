// Campus — one surface for moving around campus: free rooms right now,
// live departures, and the A→B trip planner. Facts only: the bars show
// availability, the board shows ETAs, the planner shows routes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCampusBusArrivals,
  getCampusBusStops,
  planCampusBusTrip,
  searchCampusBusPlaces,
  searchFreeVenues,
} from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import "./campus.css";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SAVED_KEY = "canvenient.campus.saved";
const BUS_REFRESH_MS = 20000;

function clockFromHHMM(hhmm) {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function freeLabel(minutes) {
  if (minutes == null) return "";
  if (minutes < 60) return `free ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `free ${hours}h${rest ? ` ${rest}m` : ""}`;
}

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  } catch {
    return [];
  }
}

function SavedPin({ code, saved, onToggle }) {
  return (
    <button
      type="button"
      className={`ins-savedpin ${saved ? "is-on" : ""}`}
      onClick={() => onToggle(code)}
      aria-label={saved ? `Unsave ${code}` : `Save ${code}`}
      title={saved ? "Saved" : "Save"}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}

function PlaceInput({ token, value, onChange, placeholder }) {
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!value.trim()) {
      setOptions([]);
      return undefined;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const data = await searchCampusBusPlaces(token, value.trim());
        setOptions((data?.places || data?.results || []).slice(0, 6));
        setOpen(true);
      } catch {
        setOptions([]);
      }
    }, 220);
    return () => window.clearTimeout(timer.current);
  }, [value, token]);

  return (
    <div className="ins-place">
      <input
        className="ins-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(options.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <div className="ins-menu ins-place-menu">
          {options.map((place, index) => (
            <button
              key={`${place.name}-${index}`}
              type="button"
              onClick={() => {
                onChange(place.name || place.title || String(place));
                setOpen(false);
              }}
            >
              <span>{place.name || place.title}</span>
              {place.category && <span className="ins-cap">{place.category}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampusView({ token }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [timeHHMM, setTimeHHMM] = useState(() => {
    const d = new Date();
    return Math.max(800, Math.min(2100, d.getHours() * 100 + Math.round(d.getMinutes() / 30) * 30));
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(readSaved);

  const [stops, setStops] = useState([]);
  const [boardStop, setBoardStop] = useState(
    () => localStorage.getItem("canvenient-isb-stop") || "",
  );
  const [arrivals, setArrivals] = useState(null);
  const [boardFailed, setBoardFailed] = useState(false);

  const [tripFrom, setTripFrom] = useState("");
  const [tripTo, setTripTo] = useState("");
  const [trip, setTrip] = useState(null);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    getCampusBusStops(token)
      .then((data) => {
        const list = data?.stops || [];
        setStops(list);
        setBoardStop((current) => current || list[0]?.id || "");
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!boardStop) return undefined;
    let alive = true;
    const load = () =>
      getCampusBusArrivals(token, boardStop)
        .then((data) => {
          if (alive) {
            setArrivals(data);
            setBoardFailed(false);
          }
        })
        .catch(() => {
          if (alive) setBoardFailed(true);
        });
    load();
    const timer = window.setInterval(load, BUS_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, boardStop]);

  const availabilityDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return DAY_NAMES[(d.getDay() + 6) % 7];
  }, [dayOffset]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchFreeVenues(token, {
      day: availabilityDay,
      time: String(timeHHMM).padStart(4, "0"),
      query: debounced || undefined,
      onlyFree: true,
      sort: "duration",
    })
      .then((data) => {
        if (alive) setResults(data);
      })
      .catch(() => {
        if (alive) setResults({ results: [], total_matches: 0 });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, availabilityDay, timeHHMM, debounced]);

  const toggleSaved = useCallback((code) => {
    setSaved((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const runTrip = async () => {
    if (!tripFrom.trim() || !tripTo.trim()) return;
    setTripBusy(true);
    setTripError("");
    try {
      const fromPlaces = await searchCampusBusPlaces(token, tripFrom.trim());
      const toPlaces = await searchCampusBusPlaces(token, tripTo.trim());
      const from = (fromPlaces?.places || fromPlaces?.results || [])[0];
      const to = (toPlaces?.places || toPlaces?.results || [])[0];
      if (!from || !to) {
        setTripError("Place coordinates unavailable.");
        setTrip(null);
        return;
      }
      const plan = await planCampusBusTrip(token, {
        from_name: from.name || tripFrom,
        from_latitude: from.latitude ?? from.lat,
        from_longitude: from.longitude ?? from.lon,
        to_name: to.name || tripTo,
        to_latitude: to.latitude ?? to.lat,
        to_longitude: to.longitude ?? to.lon,
      });
      setTrip(plan);
    } catch (err) {
      setTripError(err.message || "No route found.");
      setTrip(null);
    } finally {
      setTripBusy(false);
    }
  };

  const fact = useMemo(() => {
    if (!results) return "";
    return `${results.total_matches ?? results.results?.length ?? 0} rooms free ${clockFromHHMM(timeHHMM)} ${availabilityDay.slice(0, 3)}`;
  }, [results, timeHHMM, availabilityDay]);

  const toolbarConfig = useMemo(() => ({ fact }), [fact]);
  useWorkspaceToolbar(toolbarConfig);

  const savedSet = useMemo(() => new Set(saved), [saved]);
  const boardStopName = stops.find((s) => s.id === boardStop)?.name || boardStop;
  const boardServices = (arrivals?.arrivals || []).filter(
    (entry) => Array.isArray(entry.minutes) && entry.minutes.length > 0,
  );

  return (
    <div className="ins-campus">
      <section className="ins-campus-rooms">
        <div className="ins-campus-search">
          <input
            className="ins-input"
            placeholder="Find a room — code, name, building"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ins-campus-scrubber">
          <div className="ins-seg">
            {DAY_NAMES.map((day, index) => {
              const d = new Date();
              d.setDate(d.getDate() + index);
              return (
                <button
                  key={day}
                  type="button"
                  className={dayOffset === index ? "is-active" : ""}
                  onClick={() => setDayOffset(index)}
                >
                  {index === 0 ? "Today" : DAY_NAMES[(d.getDay() + 6) % 7].slice(0, 3)}
                </button>
              );
            })}
          </div>
          <div className="ins-campus-time">
            <input
              type="range"
              min="800"
              max="2100"
              step="30"
              value={timeHHMM}
              onChange={(e) => setTimeHHMM(Number(e.target.value))}
              aria-label="Time"
            />
            <span className="ins-mono ins-cap">{clockFromHHMM(timeHHMM)}</span>
          </div>
        </div>

        <div className="ins-campus-list">
          {loading && !results && <div className="ins-empty">Reading the timetable…</div>}
          {results && results.results?.length === 0 && (
            <div className="ins-empty">No rooms free at this time</div>
          )}
          {results?.results?.slice(0, 40).map((room) => (
            <div key={room.venue_code} className="ins-roomrow">
              <SavedPin
                code={room.venue_code}
                saved={savedSet.has(room.venue_code)}
                onToggle={toggleSaved}
              />
              <span className="ins-mono ins-roomrow-code">{room.venue_code}</span>
              <span className="ins-roomrow-name">
                {[room.room_name, room.building_name].filter(Boolean).join(" · ")}
              </span>
              <div className="ins-roomrow-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, ((room.free_minutes || 0) / 240) * 100)}%`,
                  }}
                />
              </div>
              <span className="ins-mono ins-cap ins-roomrow-free">
                {freeLabel(room.free_minutes)}
                {room.distance_metres != null ? ` · ${Math.round(room.distance_metres)} m` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <aside className="ins-campus-side">
        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Departures</h2>
            <select
              className="ins-select ins-campus-stopselect"
              value={boardStop}
              onChange={(e) => {
                setBoardStop(e.target.value);
                localStorage.setItem("canvenient-isb-stop", e.target.value);
              }}
              aria-label="Bus stop"
            >
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </div>
          {boardFailed && !arrivals && <p className="ins-cap">Departures unavailable right now.</p>}
          {arrivals && boardServices.length === 0 && (
            <p className="ins-cap">No departures in the feed.</p>
          )}
          <div className="ins-busboard">
            {boardServices.map((service) => (
              <div key={service.service} className="ins-busboard-row">
                <span className="ins-mono ins-busboard-route">{service.service}</span>
                <span className="ins-mono ins-busboard-etas">
                  {service.minutes
                    .slice(0, 3)
                    .map((m) => {
                      if (m <= 0) return "now";
                      if (m < 180) return `${m}`;
                      const at = new Date(Date.now() + m * 60000);
                      return at.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                    })
                    .join("  ")}
                </span>
              </div>
            ))}
          </div>
          <p className="ins-cap ins-campus-boardfoot">
            {boardStopName} · live feed
            {arrivals?.updated_at ? ` · ${String(arrivals.updated_at).slice(11, 16)}` : ""}
          </p>
        </section>

        <section className="ins-sec">
          <div className="ins-sec-head">
            <h2>Trip</h2>
          </div>
          <div className="ins-trip">
            <PlaceInput token={token} value={tripFrom} onChange={setTripFrom} placeholder="From" />
            <PlaceInput token={token} value={tripTo} onChange={setTripTo} placeholder="To" />
            <button
              type="button"
              className="ins-btn"
              onClick={runTrip}
              disabled={tripBusy || !tripFrom.trim() || !tripTo.trim()}
            >
              {tripBusy ? "Planning…" : "Plan"}
            </button>
          </div>
          {tripError && <p className="ins-cap">{tripError}</p>}
          {trip?.routes?.length > 0 && (
            <div className="ins-triproutes">
              {trip.routes.map((route, index) => (
                <div key={`${route.service}-${index}`} className="ins-triproute">
                  <div className="ins-triproute-line">
                    <span className="ins-mono ins-busboard-route">{route.service}</span>
                    <span className="ins-cap">
                      {route.from_stop.name} → {route.to_stop.name}
                    </span>
                  </div>
                  <span className="ins-mono ins-cap ins-triproute-total">
                    {route.next_bus_minutes != null
                      ? `bus in ${route.next_bus_minutes} min · `
                      : ""}
                    {route.total_minutes ?? route.bus_travel_minutes} min total · arr{" "}
                    {String(route.destination_arrival_at).slice(11, 16)}
                    {route.travel_source === "live" ? "" : " · est"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {trip && trip.routes?.length === 0 && (
            <p className="ins-cap">{trip.message || "No direct route found."}</p>
          )}
        </section>

        {saved.length > 0 && (
          <section className="ins-sec">
            <div className="ins-sec-head">
              <h2>Saved rooms</h2>
            </div>
            <div className="ins-savedrooms ins-mono">
              {saved.map((code) => (
                <span key={code} className="ins-tag">
                  {code}
                </span>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
