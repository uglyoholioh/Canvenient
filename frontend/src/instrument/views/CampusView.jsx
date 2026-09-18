// Campus — one section, two designed pages.
//
// Bus — a departure board: the next departure as a live ticking numeral,
// every service on the stop's board with washed route tones, and the A→B
// planner rendered as step-by-step route cards.
//
// Venues — availability as a timeline: drag the day rail to any moment,
// and every free room shows the honest strip of its free window from there.
//
// Everything states what is. Nothing instructs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCampusBusArrivals,
  getCampusBusStops,
  getVenueInformation,
  planCampusBusTrip,
  searchCampusBusPlaces,
  searchFreeVenues,
} from "../../api";
import { useNow } from "../useNow";
import { serviceTone } from "../busTones";
import "./campus.css";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SAVED_KEY = "canvenient.campus.saved";
const PAGE_KEY = "canvenient.campus.page";
const BUS_REFRESH_MS = 20000;
const RAIL_START = 8 * 60;
const RAIL_END = 21 * 60 + 30;

function clockFromHHMM(hhmm) {
  const clean = String(Math.max(0, Math.round(hhmm || 0))).padStart(4, "0");
  const h = Math.min(23, Number(clean.slice(0, 2)));
  const m = Math.min(59, Number(clean.slice(2, 4)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h * 100 + m;
}

function slotToMinutes(hhmm) {
  const clean = String(hhmm || "0000").padStart(4, "0");
  return Number(clean.slice(0, 2)) * 60 + Number(clean.slice(2, 4));
}

function freeLabel(minutes) {
  if (minutes == null) return "";
  if (minutes < 60) return `free ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `free ${hours}h${rest ? ` ${rest}m` : ""}`;
}

function walkLabel(metres) {
  return Math.max(1, Math.round(metres / 80));
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

// The stop switcher: the stop's name is the header, picking happens in a
// filterable glass menu.
function StopPicker({ stops, stopId, onStopId }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [hot, setHot] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = stops.map((s) => ({ id: s.id, name: s.name || s.id, short: s.short_name || "" }));
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.short.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [stops, filter]);

  useEffect(() => {
    if (open) {
      setFilter("");
      setHot(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const current = stops.find((s) => s.id === stopId);

  return (
    <div className="ins-stoppicker" ref={wrapRef}>
      <button
        type="button"
        className="ins-stoppicker-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ins-title">{current?.name || "Pick a stop"}</span>
        <span className="ins-cap">change</span>
      </button>
      {open && (
        <div className="ins-stoppicker-menu">
          <input
            ref={inputRef}
            className="ins-input"
            placeholder="Filter stops"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setHot(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHot((h) => Math.min(h + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHot((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = filtered[hot];
                if (pick) {
                  onStopId(pick.id);
                  setOpen(false);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <div className="ins-stoppicker-list">
            {filtered.map((stop, index) => (
              <button
                key={stop.id}
                type="button"
                className={index === hot ? "is-hot" : ""}
                onMouseEnter={() => setHot(index)}
                onClick={() => {
                  onStopId(stop.id);
                  setOpen(false);
                }}
              >
                <span>{stop.name}</span>
                {stop.short && <span className="ins-cap">{stop.short}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="ins-cap">No stops match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Bus page ---------------------------------------------------------------

function BusPage({ token }) {
  const now = useNow(1000);
  const [stops, setStops] = useState([]);
  const [boardStop, setBoardStop] = useState(
    () => localStorage.getItem("canvenient-isb-stop") || "",
  );
  const [arrivals, setArrivals] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tripFrom, setTripFrom] = useState("");
  const [tripTo, setTripTo] = useState("");
  const [trip, setTrip] = useState(null);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState("");
  const [hotRoute, setHotRoute] = useState(0);

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
            setFailed(false);
          }
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    load();
    const timer = window.setInterval(load, BUS_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, boardStop]);

  const boardServices = useMemo(
    () =>
      (arrivals?.arrivals || [])
        .filter((entry) => Array.isArray(entry.minutes) && entry.minutes.length > 0)
        .map((entry) => ({ ...entry, minutes: entry.minutes.filter((m) => m > 0) }))
        .filter((entry) => entry.minutes.length > 0)
        .sort((a, b) => a.minutes[0] - b.minutes[0]),
    [arrivals],
  );

  const next = boardServices[0] || null;
  const nextEta = next?.minutes[0];
  const stop = stops.find((s) => s.id === boardStop);
  const updatedClock = arrivals?.updated_at ? String(arrivals.updated_at).slice(11, 19) : null;

  // Depletion meter for the approaching departure — full at 20 min out.
  const nextPct = nextEta != null ? Math.max(0, Math.min(100, (1 - nextEta / 20) * 100)) : 0;

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
      setHotRoute(0);
    } catch (err) {
      setTripError(err.message || "No route found.");
      setTrip(null);
    } finally {
      setTripBusy(false);
    }
  };

  return (
    <div className="ins-buspage">
      {/* Hero — the next departure, ticking */}
      <header className="ins-bushero">
        <div className="ins-bushero-main">
          <p className="ins-label">Next departure — {stop?.name || boardStop || "…"}</p>
          {next ? (
            <>
              <div className="ins-bushero-countrow">
                <span className="ins-numeral ins-bushero-count">
                  {nextEta < 60 ? `${nextEta} min` : etaClock(nextEta, now)}
                </span>
                <span className="ins-service" style={{ "--tone": serviceTone(next.service) }}>
                  {next.service}
                </span>
              </div>
              <div className="ins-meter is-green ins-bushero-meter">
                <span style={{ width: `${nextPct}%` }} />
              </div>
            </>
          ) : (
            <div className="ins-numeral ins-bushero-count is-waiting">
              {failed || arrivals ? "—" : "··:··"}
            </div>
          )}
        </div>
        <div className="ins-bushero-side">
          <span className={`ins-livedot ${arrivals ? "is-live" : ""}`} />
          <span className="ins-cap ins-mono">
            {updatedClock
              ? `feed ${updatedClock.slice(0, 8)}`
              : failed
                ? "feed unavailable"
                : "feed starting"}
          </span>
        </div>
      </header>

      <div className="ins-busgrid">
        {/* The board */}
        <section className="ins-sec ins-busboardpanel">
          <div className="ins-sec-head">
            <p className="ins-label">Board</p>
            <StopPicker stops={stops} stopId={boardStop} onStopId={setBoardStop} />
          </div>
          {failed && !arrivals && <p className="ins-cap">Departures unavailable right now.</p>}
          {arrivals && boardServices.length === 0 && (
            <p className="ins-cap">No departures on the board.</p>
          )}
          <div className="ins-busboard">
            {boardServices.map((service) => {
              const isNext = service === next;
              return (
                <div
                  key={service.service}
                  className={`ins-busboard-row ${isNext ? "is-next" : ""}`}
                >
                  <span
                    className="ins-service ins-busboard-route"
                    style={{ "--tone": serviceTone(service.service) }}
                  >
                    {service.service}
                  </span>
                  <span className="ins-mono ins-busboard-etas">
                    {service.minutes
                      .slice(0, 3)
                      .map((m, index) => (
                        <span
                          key={m}
                          className={`ins-eta ${index === 0 ? "is-big" : ""} ${m <= 2 ? "is-departing" : ""}`}
                        >
                          {m < 1 ? "now" : m < 60 ? `${m}′` : etaClock(m, now)}
                        </span>
                      ))
                      .reduce(
                        (acc, item, index) => (index ? [...acc, <i key={`s${index}`} />] : [item]),
                        [],
                      )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="ins-cap ins-campus-boardfoot">
            {stop?.name || boardStop}
            {updatedClock ? ` · updated ${updatedClock.slice(0, 8)}` : ""}
          </p>
        </section>

        {/* Trip planner */}
        <section className="ins-sec ins-buspage-trip">
          <div className="ins-sec-head">
            <p className="ins-label">Plan a trip</p>
          </div>
          <div className="ins-trip">
            <PlaceInput token={token} value={tripFrom} onChange={setTripFrom} placeholder="From" />
            <PlaceInput token={token} value={tripTo} onChange={setTripTo} placeholder="To" />
            <button
              type="button"
              className="ins-btn is-primary"
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
                <button
                  key={`${route.service}-${index}`}
                  type="button"
                  className={`ins-routecard ${index === hotRoute ? "is-hot" : ""}`}
                  onClick={() => setHotRoute(index)}
                >
                  <div className="ins-routecard-steps">
                    <span
                      className="ins-stepdot"
                      style={{ "--tone": serviceTone(route.service) }}
                    />
                    <span className="ins-routecard-service ins-mono">{route.service}</span>
                    <span className="ins-cap">{route.from_stop.name}</span>
                  </div>
                  <div className="ins-routecard-steps is-sub">
                    <span className="ins-cap">
                      walk {walkLabel(route.walking_to_stop_metres)} min · {route.stops_count} stops
                      · ride {route.bus_travel_minutes} min
                    </span>
                  </div>
                  <div className="ins-triproute-line">
                    <span className="ins-cap ins-triproute-total">
                      {route.next_bus_minutes != null
                        ? `bus in ${route.next_bus_minutes} min · `
                        : ""}
                      total {route.total_minutes ?? route.bus_travel_minutes} min · arrive{" "}
                      {String(route.destination_arrival_at).slice(11, 16)}
                      {route.travel_source === "live" ? "" : " · est"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {trip && trip.routes?.length === 0 && (
            <p className="ins-cap">{trip.message || "No direct route found."}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function etaClock(minutes, now) {
  return new Date(now.getTime() + minutes * 60000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// --- Venues page -------------------------------------------------------------

function VenuesPage({ token }) {
  const now = useNow(30000);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  // The window lives in total minutes internally — HHMM only at the edges.
  const [winStart, setWinStart] = useState(() => {
    const d = new Date();
    return Math.max(
      RAIL_START,
      Math.min(RAIL_END - 60, d.getHours() * 60 + Math.round(d.getMinutes() / 30) * 30),
    );
  });
  const [winEnd, setWinEnd] = useState(() => RAIL_END);
  const winStartRef = useRef(winStart);
  // The availability query commits when the drag ends — not on every tick.
  const [queryStartMin, setQueryStartMin] = useState(winStart);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(readSaved);
  const [area, setArea] = useState("All areas");
  const [venuesInfo, setVenuesInfo] = useState({});
  const railRef = useRef(null);
  const draggingRef = useRef(null); // "start" | "end" | null

  // Full-day schedules per venue (NUSMods, cached a day) — the strips.
  const availabilityDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return DAY_NAMES[(d.getDay() + 6) % 7];
  }, [dayOffset]);

  useEffect(() => {
    getVenueInformation(token)
      .then((data) => setVenuesInfo(data?.venues || {}))
      .catch(() => {});
  }, [token]);

  // The chosen day's actual date, for week-ranged lessons.
  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [dayOffset]);

  // Taken slots for one room on the chosen day — with the occupying lesson.
  const daySlots = useCallback(
    (venueCode) => {
      const dayList = venuesInfo[venueCode];
      if (!Array.isArray(dayList)) return null;
      const dayData = (dayList || []).find(
        (d) => String(d.day || "").toLowerCase() === availabilityDay.toLowerCase(),
      );
      if (!dayData) return [];
      return (dayData.classes || [])
        .filter((cls) => {
          if (cls.weeks && typeof cls.weeks === "object" && cls.weeks.start && cls.weeks.end) {
            return targetDate >= cls.weeks.start && targetDate <= cls.weeks.end;
          }
          return true;
        })
        .map((cls) => {
          const start = slotToMinutes(cls.startTime);
          const end = slotToMinutes(cls.endTime);
          const parts = [cls.moduleCode || cls.eventname || "Class"];
          if (cls.lessonType) parts.push(cls.lessonType);
          let weeksLabel = "every week";
          if (cls.weeks && typeof cls.weeks === "object" && cls.weeks.start && cls.weeks.end) {
            weeksLabel = `${String(cls.weeks.start).slice(8, 10)}.${String(cls.weeks.start).slice(5, 7)} – ${String(cls.weeks.end).slice(8, 10)}.${String(cls.weeks.end).slice(5, 7)}`;
          } else if (Array.isArray(cls.weeks) && cls.weeks.length) {
            weeksLabel = `weeks ${cls.weeks.join(", ")}`;
          }
          return {
            start,
            end,
            moduleCode: cls.moduleCode || "",
            lessonType: cls.lessonType || "",
            weeksLabel,
            label: parts.join(" · "),
            range: `${clockFromHHMM(start)}–${clockFromHHMM(end)}`,
          };
        })
        .filter((slot) => slot.end > RAIL_START && slot.start < RAIL_END)
        .sort((a, b) => a.start - b.start);
    },
    [venuesInfo, availabilityDay, targetDate],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchFreeVenues(token, {
      day: availabilityDay,
      time: String(minutesToHHMM(queryStartMin)).padStart(4, "0"),
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
  }, [token, availabilityDay, queryStartMin, debounced]);

  const toggleSaved = useCallback((code) => {
    setSaved((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const savedSet = useMemo(() => new Set(saved), [saved]);

  // Time rail — two drag handles define the window the search asks about.
  const setWindow = (startMin, endMin) => {
    startMin = Math.max(RAIL_START, Math.min(startMin, RAIL_END - 30));
    endMin = Math.max(startMin + 30, Math.min(endMin, RAIL_END));
    winStartRef.current = startMin;
    setWinStart(startMin);
    setWinEnd(endMin);
  };

  const railMinsAt = (clientX) => {
    const rail = railRef.current;
    if (!rail) return RAIL_START;
    const rect = rail.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((RAIL_START + frac * (RAIL_END - RAIL_START)) / 30) * 30;
  };

  const railToTime = (which, clientX) => {
    const mins = railMinsAt(clientX);
    if (which === "start") setWindow(mins, Math.max(mins + 30, winEnd));
    else setWindow(Math.min(winStart, mins - 30), mins);
  };

  const railMinutes = winStart;
  const railEndMinutes = winEnd;
  const commitWindow = () => setQueryStartMin(winStartRef.current);

  useEffect(() => {
    const move = (e) => {
      if (draggingRef.current) railToTime(draggingRef.current, e.clientX);
    };
    const up = () => {
      if (draggingRef.current) commitWindow();
      draggingRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });
  const windowMinutes = Math.max(30, winEnd - winStart);
  const railPct = (mins) => ((mins - RAIL_START) / (RAIL_END - RAIL_START)) * 100;
  const railNowPct =
    dayOffset === 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((now.getHours() * 60 + now.getMinutes() - RAIL_START) / (RAIL_END - RAIL_START)) * 100,
          ),
        )
      : null;

  // Areas of campus, straight from the data — chips with live counts.
  const areas = useMemo(() => {
    const counts = new Map();
    for (const room of results?.results || []) {
      const name = room.faculty || "Other";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  const rooms = useMemo(() => {
    const list = results?.results || [];
    const sized = list.filter((room) => (room.free_minutes || 0) >= windowMinutes);
    if (area === "All areas") return sized;
    return sized.filter((room) => (room.faculty || "Other") === area);
  }, [results, area, windowMinutes]);
  const count = rooms.length;

  return (
    <div className="ins-venuespage">
      <header className="ins-venhero">
        <div className="ins-venhero-clock">
          <span className="ins-numeral ins-venhero-time ins-mono">
            {clockFromHHMM(minutesToHHMM(winStart))}
          </span>
          <span className="ins-mono ins-venhero-end ins-mono">
            – {clockFromHHMM(minutesToHHMM(winEnd))}
          </span>
          <span className="ins-cap">{availabilityDay}</span>
        </div>
        <div
          className="ins-timerail"
          ref={railRef}
          role="slider"
          aria-label="Time of day"
          aria-valuemin={RAIL_START}
          aria-valuemax={RAIL_END}
          aria-valuenow={railMinutes}
          tabIndex={0}
          onPointerDown={(e) => {
            const mins = railMinsAt(e.clientX);
            const which = Math.abs(mins - winStart) <= Math.abs(mins - winEnd) ? "start" : "end";
            draggingRef.current = which;
            railToTime(which, e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWindow(winStart - 30, winEnd);
            if (e.key === "ArrowRight") setWindow(winStart + 30, winEnd);
          }}
        >
          {Array.from({ length: 15 }, (_, i) => RAIL_START + i * 60).map((mins) => (
            <span
              key={mins}
              className="ins-timerail-tick ins-mono"
              style={{
                left: `${Math.max(1.5, Math.min(98.5, ((mins - RAIL_START) / (RAIL_END - RAIL_START)) * 100))}%`,
              }}
            >
              {String(Math.floor(mins / 60)).padStart(2, "0")}
            </span>
          ))}
          <span
            className="ins-timerail-win"
            style={{
              left: `${railPct(railMinutes)}%`,
              width: `${railPct(railEndMinutes) - railPct(railMinutes)}%`,
            }}
          />
          <button
            type="button"
            className="ins-timerail-knob"
            style={{ left: `${railPct(railMinutes)}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              draggingRef.current = "start";
            }}
            aria-label="Window start"
          />
          <button
            type="button"
            className="ins-timerail-knob"
            style={{ left: `${railPct(railEndMinutes)}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              draggingRef.current = "end";
            }}
            aria-label="Window end"
          />
          {railNowPct != null && (
            <span className="ins-timerail-now" style={{ left: `${railNowPct}%` }} title="now" />
          )}
        </div>
        <div className="ins-venhero-meta">
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
          <div className="ins-venhero-countwrap">
            <span className="ins-numeral ins-venhero-count">{count}</span>
            <span className="ins-cap">rooms free</span>
          </div>
        </div>
      </header>

      <div className="ins-campus-search">
        <input
          className="ins-input"
          placeholder="Find a room — code, name, building"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {areas.length > 1 && (
        <div className="ins-arearow">
          <button
            type="button"
            className={`ins-areachip ${area === "All areas" ? "is-active" : ""}`}
            onClick={() => setArea("All areas")}
          >
            All areas
          </button>
          {areas.map(({ name, count: areaCount }) => (
            <button
              key={name}
              type="button"
              className={`ins-areachip ${area === name ? "is-active" : ""}`}
              onClick={() => setArea(name)}
            >
              {name} <span className="ins-mono ins-areachip-count">{areaCount}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ins-campus-list">
        {loading && !results && (
          <>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="ins-skrow" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </>
        )}
        {results && rooms.length === 0 && (
          <div className="ins-empty">No rooms free at this time</div>
        )}
        {rooms.slice(0, 60).map((room) => (
          <RoomRow
            key={room.venue_code}
            room={room}
            saved={savedSet.has(room.venue_code)}
            onToggle={toggleSaved}
            slots={daySlots(room.venue_code)}
            winStart={railMinutes}
            winEnd={railEndMinutes}
            now={now}
          />
        ))}
      </div>

      {saved.length > 0 && (
        <div className="ins-savedrooms">
          <span className="ins-label">Saved</span>
          <div className="ins-mono">
            {saved.map((code) => (
              <span key={code} className="ins-tag">
                {code}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// One room row: identity, its day timeline (taken slots + the searched
// window + cursor), and a hover card that names the occupying class.
function RoomRow({ room, saved, onToggle, slots, winStart, winEnd, now }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const pct = (mins) => ((mins - RAIL_START) / (RAIL_END - RAIL_START)) * 100;
  const hoveredSlot = hoveredIdx != null ? slots?.[hoveredIdx] : null;
  // The hover card anchors to the hovered slot, clamped to stay on the row.
  const cardLeft = hoveredSlot != null ? Math.max(4, Math.min(pct(hoveredSlot.start), 70)) : 0;

  return (
    <div className="ins-roomrow" onMouseLeave={() => setHoveredIdx(null)}>
      <SavedPin code={room.venue_code} saved={saved} onToggle={onToggle} />
      <div className="ins-roomid">
        <span className="ins-mono ins-roomrow-code">{room.venue_code}</span>
        <span className="ins-roomrow-name">
          {[room.room_name, room.building_name].filter(Boolean).join(" · ") || room.faculty || ""}
        </span>
      </div>
      <div className="ins-roomstrip">
        {slots === null && <span className="ins-roomstrip-noinfo">no schedule data</span>}
        {(slots || []).map((slot, index) => {
          const left = Math.max(0, pct(slot.start));
          const right = Math.min(100, pct(slot.end));
          return (
            <span
              key={index}
              className={`ins-roomstrip-busy ${hoveredIdx === index ? "is-hovered" : ""}`}
              style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }}
              onMouseEnter={() => setHoveredIdx(index)}
            />
          );
        })}
        <span
          className="ins-roomstrip-window"
          style={{
            left: `${pct(winStart)}%`,
            width: `${Math.max(pct(winEnd) - pct(winStart), 1)}%`,
          }}
        />
        <span
          className="ins-roomstrip-cursor"
          style={{ left: `${pct(now.getHours() * 60 + now.getMinutes())}%` }}
        />
      </div>
      {hoveredSlot && (
        <div className="ins-hovercard" role="tooltip" style={{ left: `${cardLeft}%` }}>
          <p className="ins-hovercard-title">{hoveredSlot.label}</p>
          <p className="ins-cap">
            {hoveredSlot.range} · {hoveredSlot.weeksLabel}
          </p>
        </div>
      )}
      <span className="ins-mono ins-cap ins-roomrow-free">
        {freeLabel(room.free_minutes)}
        {room.distance_metres != null ? ` · ${Math.round(room.distance_metres)} m` : ""}
      </span>
    </div>
  );
}

export default function CampusView({ token }) {
  const [page, setPage] = useState(() => localStorage.getItem(PAGE_KEY) || "bus");

  const showPage = (next) => {
    setPage(next);
    localStorage.setItem(PAGE_KEY, next);
    // the shell's Campus dropdown reflects the current page
    window.dispatchEvent(new CustomEvent("canvenient-campus-sel", { detail: { page: next } }));
  };

  // The shell's Campus dropdown can switch the page from outside.
  useEffect(() => {
    const onExternalSelect = (event) => {
      const next = event.detail?.page;
      if (next === "bus" || next === "venues") setPage(next);
    };
    window.addEventListener("canvenient-campus-select", onExternalSelect);
    return () => window.removeEventListener("canvenient-campus-select", onExternalSelect);
  }, []);

  return (
    <div className="ins-campus">
      <div className="ins-campus-tabs">
        <div className="ins-seg">
          <button
            type="button"
            className={page === "bus" ? "is-active" : ""}
            onClick={() => showPage("bus")}
          >
            Bus
          </button>
          <button
            type="button"
            className={page === "venues" ? "is-active" : ""}
            onClick={() => showPage("venues")}
          >
            Venues
          </button>
        </div>
      </div>
      {page === "bus" ? <BusPage token={token} /> : <VenuesPage token={token} />}
    </div>
  );
}
