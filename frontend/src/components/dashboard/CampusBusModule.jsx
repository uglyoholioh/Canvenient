// React is required by the test JSX transform.
 
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, LocateFixed, RotateCw, Star, X, Search, Route } from "lucide-react";
import {
  getCampusBusArrivals,
  getCampusBusStops,
  getSchedule,
  planCampusBusTrip,
  searchCampusBusPlaces,
} from "../../api";

// ── Storage keys ────────────────────────────────────────────────────────────

import { normalise, stopLabel, findStop, resolvePlace, formatEta, formatClock, serviceTone,
  urgencyFill, readFavourites, readCache, writeCache, venueToStop, distanceInMetres, QUICK_POPULAR_PLACES,
  STOP_STORAGE_KEY, FROM_STORAGE_KEY, TO_STORAGE_KEY, FAVOURITES_STORAGE_KEY,
  STOPS_CACHE_KEY, ARRIVALS_PREFIX, DEFAULT_STOP_ID, STOPS_TTL_MS,
  ARRIVALS_TTL_MS, REFRESH_INTERVAL_S,
} from "../bus/busHelpers";
import { PlaceCombobox } from "../bus/PlaceCombobox";

export default function CampusBusModule({ token }) {
  // Current view: "departures" (default) or "route"
  const [currentView, setCurrentView] = useState("departures");

  // Stops list
  const [stops, setStops] = useState(() => {
    const cached = readCache(STOPS_CACHE_KEY, STOPS_TTL_MS);
    return Array.isArray(cached?.stops) ? cached.stops : [];
  });
  const stopsRef = useRef([]);
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // Selected stop
  const [stopId,   setStopId]   = useState(() => localStorage.getItem(STOP_STORAGE_KEY) || DEFAULT_STOP_ID);
  const [stopText, setStopText] = useState(() => localStorage.getItem(STOP_STORAGE_KEY) || DEFAULT_STOP_ID);

  // Arrivals
  const [arrivalData, setArrivalData] = useState(null);
  const [status,      setStatus]      = useState("loading");

  // Favourites
  const [favourites, setFavourites] = useState(readFavourites);

  // Geolocation
  const [location,       setLocation]       = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [pendingAutoSelect, setPendingAutoSelect] = useState(false);

  // Stop Search Bar state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedSearchIdx, setHighlightedSearchIdx] = useState(-1);
  const searchBlurTimerRef = useRef(null);

  // Refresh tracking
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  // Schedule suggestion
  const [scheduleSuggestion,  setScheduleSuggestion]  = useState(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Route planner state
  const [fromText,    setFromText]    = useState(() => localStorage.getItem(FROM_STORAGE_KEY) || "");
  const [toText,      setToText]      = useState(() => localStorage.getItem(TO_STORAGE_KEY)   || "");
  const [fromPlaces,  setFromPlaces]  = useState([]);
  const [toPlaces,    setToPlaces]    = useState([]);
  const [fromPlace,   setFromPlace]   = useState(null);
  const [toPlace,     setToPlace]     = useState(null);
  const [routeStatus, setRouteStatus] = useState("idle");
  const [routePlan,   setRoutePlan]   = useState(null);
  const [routeError,  setRouteError]  = useState("");

  const toInputRef = useRef(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Load stop list
  useEffect(() => {
    const cached = readCache(STOPS_CACHE_KEY, STOPS_TTL_MS);
    getCampusBusStops(token)
      .then(({ stops: next = [] }) => {
        setStops(next);
        writeCache(STOPS_CACHE_KEY, { stops: next });
      })
      .catch(() => { if (!cached?.stops) setStops([]); });
  }, [token]);

  // Geolocation auto-select
  useEffect(() => {
    if (!pendingAutoSelect || !location || stops.length === 0) return;
    const nearest = stops
      .map((s) => ({ ...s, dist: distanceInMetres(location, s) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (nearest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-select once stops and location arrive
      setStopId(nearest.id);
      setStopText(stopLabel(nearest));
      localStorage.setItem(STOP_STORAGE_KEY, nearest.id);
    }
    setPendingAutoSelect(false);
  }, [stops, location, pendingAutoSelect]);

  // Load arrivals
  const loadArrivals = useCallback(async (showLoading = false) => {
    if (!stopId) return;
    const cached = readCache(`${ARRIVALS_PREFIX}${stopId}`, ARRIVALS_TTL_MS);
    if (cached) { setArrivalData(cached); setStatus("cached"); }
    if (showLoading) setStatus("loading");
    try {
      const data = await getCampusBusArrivals(token, stopId);
      setArrivalData(data);
      writeCache(`${ARRIVALS_PREFIX}${stopId}`, data);
      setStatus("success");
      setLastRefreshAt(Date.now());
    } catch {
      setStatus(cached ? "cached" : "error");
    }
  }, [stopId, token]);

  useEffect(() => {
    const initial  = window.setTimeout(() => loadArrivals(), 0);
    const interval = window.setInterval(() => loadArrivals(), REFRESH_INTERVAL_S * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [loadArrivals]);

  // Refresh ticker removed to prevent 1s full component re-renders.
  // We can just calculate time diff when necessary or rely on the 20s interval.

  // Schedule suggestion
  useEffect(() => {
    let cancelled = false;
    getSchedule(token)
      .then((schedule) => {
        if (cancelled) return;
        const now      = new Date();
        const todayStr = now.toDateString();
        const upcoming = (schedule?.classes ?? [])
          .filter((cls) => cls.venue && new Date(cls.class_date).toDateString() === todayStr)
          .map((cls) => {
            const start = new Date(`${cls.class_date}T${cls.start_time}+08:00`);
            return { ...cls, start };
          })
          .filter((cls) => {
            const diffMin = (cls.start - now) / 60000;
            return diffMin > -5 && diffMin < 90;
          })
          .sort((a, b) => a.start - b.start)[0];

        if (!upcoming) return;
        const suggestedStop = venueToStop(upcoming.venue);
        if (!suggestedStop) return;
        setScheduleSuggestion({
          moduleCode:   upcoming.module_code,
          venue:        upcoming.venue,
          stopText:     suggestedStop,
          minutesUntil: Math.round((upcoming.start - now) / 60000),
        });
      })
      .catch(() => { /* Non-critical */ });
    return () => { cancelled = true; };
  }, [token]);

  // Place search for route planner inputs (debounced 250 ms)
  useEffect(() => {
    if (normalise(fromText).length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale results when the query is too short
      setFromPlaces([]);
      return undefined;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchCampusBusPlaces(token, fromText)
        .then(({ places = [] }) => { if (!cancelled) setFromPlaces(places); })
        .catch(() =>            { if (!cancelled) setFromPlaces([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [fromText, token]);

  useEffect(() => {
    if (normalise(toText).length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale results when the query is too short
      setToPlaces([]);
      return undefined;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchCampusBusPlaces(token, toText)
        .then(({ places = [] }) => { if (!cancelled) setToPlaces(places); })
        .catch(() =>            { if (!cancelled) setToPlaces([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [toText, token]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const chooseStop = useCallback((stop) => {
    if (!stop) return;
    setStopId(stop.id);
    setStopText(stopLabel(stop));
    localStorage.setItem(STOP_STORAGE_KEY, stop.id);
    setSearchQuery("");
    setIsSearchOpen(false);
    setHighlightedSearchIdx(-1);
  }, []);

  const findNearbyStops = useCallback(() => {
    if (!navigator.geolocation) { setLocationStatus("unsupported"); return; }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { latitude: coords.latitude, longitude: coords.longitude };
        setLocation(pos);
        setLocationStatus("ready");
        const currentStops = stopsRef.current;
        if (currentStops.length > 0) {
          const nearest = currentStops
            .map((s) => ({ ...s, dist: distanceInMetres(pos, s) }))
            .sort((a, b) => a.dist - b.dist)[0];
          if (nearest) {
            setStopId(nearest.id);
            setStopText(stopLabel(nearest));
            localStorage.setItem(STOP_STORAGE_KEY, nearest.id);
          }
        } else {
          setPendingAutoSelect(true);
        }
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 },
    );
  }, []);

  const toggleFavourite = useCallback(() => {
    setFavourites((cur) => {
      const next = cur.includes(stopId)
        ? cur.filter((id) => id !== stopId)
        : [...cur, stopId];
      localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [stopId]);

  const applySuggestion = useCallback(() => {
    if (!scheduleSuggestion) return;
    const matched = findStop(scheduleSuggestion.stopText, stopsRef.current);
    if (matched) {
      chooseStop(matched);
    } else {
      setStopId(scheduleSuggestion.stopText);
      setStopText(scheduleSuggestion.stopText);
      localStorage.setItem(STOP_STORAGE_KEY, scheduleSuggestion.stopText);
    }
    setSuggestionDismissed(true);
  }, [scheduleSuggestion, chooseStop]);

  const handleSelectFromPlace = (place) => {
    setFromText(place.name);
    setFromPlace(place);
    localStorage.setItem(FROM_STORAGE_KEY, place.name);
    if (toInputRef.current) {
      toInputRef.current.focus();
    }
  };

  const handleSelectToPlace = (place) => {
    setToText(place.name);
    setToPlace(place);
    localStorage.setItem(TO_STORAGE_KEY, place.name);
  };

  const swapLocations = () => {
    const prevFrom = fromText;
    const prevTo = toText;
    const prevFromPlace = fromPlace;
    const prevToPlace = toPlace;
    setFromText(prevTo);
    setToText(prevFrom);
    setFromPlace(prevToPlace);
    setToPlace(prevFromPlace);
    localStorage.setItem(FROM_STORAGE_KEY, prevTo);
    localStorage.setItem(TO_STORAGE_KEY, prevFrom);
    if (prevTo && prevFrom) {
      const origin = prevToPlace || resolvePlace(prevTo, fromPlaces);
      const destination = prevFromPlace || resolvePlace(prevFrom, toPlaces);
      if (origin && destination) {
        executeRoutePlan(origin, destination);
      }
    }
  };

  const executeRoutePlan = async (origin, destination) => {
    if (!origin || !destination) {
      setRouteError("Choose both locations from the campus suggestions.");
      setRouteStatus("error");
      return;
    }
    localStorage.setItem(FROM_STORAGE_KEY, origin.name);
    localStorage.setItem(TO_STORAGE_KEY,   destination.name);
    setRouteError("");
    setRouteStatus("loading");
    try {
      const plan = await planCampusBusTrip(token, {
        from_name: origin.name, from_latitude: origin.latitude, from_longitude: origin.longitude,
        to_name:   destination.name, to_latitude: destination.latitude, to_longitude: destination.longitude,
      });
      setRoutePlan(plan);
      setRouteStatus("success");
    } catch (err) {
      setRouteError(err.message || "Couldn't plan this route right now.");
      setRouteStatus("error");
    }
  };

  const submitRoute = async (event) => {
    if (event) event.preventDefault();
    const origin      = fromPlace || resolvePlace(fromText, fromPlaces);
    const destination = toPlace   || resolvePlace(toText,   toPlaces);
    executeRoutePlan(origin, destination);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const isFavourite    = favourites.includes(stopId);
  const selectedStop   = stops.find((s) => s.id === stopId);
  const displayName    = arrivalData?.stop?.name || stopLabel(selectedStop) || stopId;


  const nearbyStops = useMemo(() => {
    if (!location) return [];
    return stops
      .map((s) => ({ ...s, distance: distanceInMetres(location, s) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }, [location, stops]);

  const favouriteStops = useMemo(
    () => stops.filter((s) => favourites.includes(s.id)),
    [favourites, stops],
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return stops.slice(0, 8);
    }
    const q = normalise(searchQuery);
    return stops
      .filter((s) => [s.id, s.name, s.short_name].some((c) => normalise(c || "").includes(q)))
      .slice(0, 8);
  }, [searchQuery, stops]);

  useEffect(() => {
    if (searchResults.length > 0 && isSearchOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the highlight when the search results change
      setHighlightedSearchIdx(0);
    } else {
      setHighlightedSearchIdx(-1);
    }
  }, [searchResults, isSearchOpen]);

  const showSuggestion =
    scheduleSuggestion &&
    !suggestionDismissed &&
    normalise(scheduleSuggestion.stopText) !== normalise(stopText);

  const statusBarText = (() => {
    if (status === "success") {
      return arrivalData?.updated_at ? `Live · ${formatClock(arrivalData.updated_at)}` : "Live";
    }
    if (status === "cached") {
      return lastRefreshAt ? `Recent · ${formatClock(lastRefreshAt)}` : "Cached data";
    }
    if (status === "error") return "Failed to load";
    return "Loading…";
  })();

  // ── Stop Search Keyboard Handler ───────────────────────────────────────────
  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isSearchOpen && searchResults.length > 0) {
        setIsSearchOpen(true);
        setHighlightedSearchIdx(0);
        return;
      }
      if (searchResults.length > 0) {
        setHighlightedSearchIdx((prev) => (prev + 1) % searchResults.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedSearchIdx((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      }
    } else if (e.key === "Enter") {
      if (isSearchOpen && highlightedSearchIdx >= 0 && searchResults[highlightedSearchIdx]) {
        e.preventDefault();
        chooseStop(searchResults[highlightedSearchIdx]);
      } else if (searchResults.length > 0) {
        e.preventDefault();
        chooseStop(searchResults[0]);
      }
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
      setHighlightedSearchIdx(-1);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="cbm" data-status={status}>

      {/* ════════════════ PAGE 1: DEPARTURES VIEW (DEFAULT) ═════════════════ */}
      {currentView === "departures" && (
        <div className="cbm-page cbm-departures-page">
          {/* Header: Stop Title, Compact Search Bar & Action Toolbar */}
          <header className="cbm-header">
            <div className="cbm-stop-title-wrap">
              <span
                className={`cbm-status-dot${
                  status === "success" ? " is-live"
                  : status === "cached" ? " is-stale"
                  : status === "error"  ? " is-error"
                  : ""
                }`}
                aria-hidden="true"
              />
              <h2 className="cbm-stop-heading" title={displayName}>
                {displayName}
              </h2>
            </div>

            {/* Compact Stop Search Bar */}
            <div className="cbm-stop-search-box">
              <div className="cbm-search-input-wrap">
                <Search size={11} className="cbm-search-icon" aria-hidden="true" />
                <input
                  type="text"
                  className="cbm-search-input"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (searchBlurTimerRef.current) clearTimeout(searchBlurTimerRef.current);
                    setIsSearchOpen(true);
                  }}
                  onBlur={() => {
                    searchBlurTimerRef.current = setTimeout(() => {
                      setIsSearchOpen(false);
                      setHighlightedSearchIdx(-1);
                    }, 150);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search stop…"
                  aria-label="Search NUS bus stops"
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="cbm-search-clear"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                    aria-label="Clear search"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Search suggestions dropdown */}
              {isSearchOpen && (
                <div className="cbm-stop-search-dropdown" role="listbox" aria-label="Bus stop suggestions">
                  {searchResults.map((stop, idx) => (
                    <button
                      type="button"
                      key={stop.id}
                      role="option"
                      aria-selected={idx === highlightedSearchIdx || stop.id === stopId}
                      className={`cbm-stop-search-row${idx === highlightedSearchIdx ? " is-highlighted" : ""}${stop.id === stopId ? " is-selected" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        chooseStop(stop);
                      }}
                      onMouseEnter={() => setHighlightedSearchIdx(idx)}
                    >
                      <span className="cbm-stop-search-name">{stopLabel(stop)}</span>
                      <small className="cbm-stop-search-code">{stop.id}</small>
                      {favourites.includes(stop.id) && (
                        <Star size={9} fill="currentColor" className="cbm-picker-star" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="cbm-picker-empty">No stops match &ldquo;{searchQuery}&rdquo;</p>
                  )}
                </div>
              )}
            </div>

            <div className="cbm-header-actions">
              <button
                type="button"
                className={`cbm-action-btn${isFavourite ? " is-active" : ""}`}
                onClick={toggleFavourite}
                aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
                title={isFavourite ? "Remove favourite" : "Add to favourites"}
              >
                <Star size={12} fill={isFavourite ? "currentColor" : "none"} />
              </button>

              <button
                type="button"
                className={`cbm-action-btn${locationStatus === "ready" ? " is-active" : ""}`}
                onClick={findNearbyStops}
                aria-label={
                  locationStatus === "denied" ? "Location access denied — tap to retry"
                  : locationStatus === "ready" ? "Location active — tap to refresh nearest stop"
                  : "Find nearest stop and switch to it"
                }
                title={
                  locationStatus === "denied"  ? "Location unavailable"
                  : locationStatus === "ready" ? "Nearest stop active"
                  : "Use my location"
                }
              >
                <LocateFixed size={12} className={locationStatus === "loading" ? "spin" : ""} />
              </button>

              <button
                type="button"
                className="cbm-action-btn cbm-refresh-btn"
                onClick={() => loadArrivals(true)}
                aria-label="Refresh timings"
                title="Refresh"
              >
                <RotateCw size={12} className={status === "loading" ? "spin" : ""} />
              </button>

              {/* Noticeable small Route button to enter Plan Route page */}
              <button
                type="button"
                className="cbm-action-btn cbm-plan-route-trigger"
                onClick={() => setCurrentView("route")}
                aria-label="Plan a campus route"
                title="Plan route"
              >
                <Route size={11} />
                <span>Route</span>
              </button>
            </div>
          </header>

          {/* Schedule suggestion banner */}
          {showSuggestion && (
            <div className="cbm-suggestion" role="status" aria-live="polite">
              <span className="cbm-suggestion-text">
                {scheduleSuggestion.minutesUntil <= 0
                  ? `${scheduleSuggestion.moduleCode} now · ${scheduleSuggestion.venue}`
                  : `${scheduleSuggestion.moduleCode} in ${scheduleSuggestion.minutesUntil} min · ${scheduleSuggestion.venue}`}
              </span>
              <button type="button" className="cbm-suggestion-switch" onClick={applySuggestion}>
                Try {scheduleSuggestion.stopText} →
              </button>
              <button
                type="button"
                className="cbm-suggestion-dismiss"
                onClick={() => setSuggestionDismissed(true)}
                aria-label="Dismiss suggestion"
              >
                <X size={10} />
              </button>
            </div>
          )}

          {/* Quick stop shortcuts (Favourites + Nearby) */}
          {(favouriteStops.length > 0 || locationStatus === "ready") && (
            <div className="cbm-chips" aria-label="Quick stop shortcuts">
              {favouriteStops.map((stop) => (
                <button
                  type="button"
                  key={stop.id}
                  className={`cbm-chip${stop.id === stopId ? " is-active" : ""}`}
                  onClick={() => chooseStop(stop)}
                  title={stopLabel(stop)}
                >
                  <Star size={9} fill="currentColor" aria-hidden="true" />
                  {stop.short_name || stop.id}
                </button>
              ))}
              {nearbyStops
                .filter((s) => !favourites.includes(s.id))
                .slice(0, 3)
                .map((stop) => (
                  <button
                    type="button"
                    key={stop.id}
                    className={`cbm-chip${stop.id === stopId ? " is-active" : ""}`}
                    onClick={() => chooseStop(stop)}
                    title={`${stopLabel(stop)} · ${Math.round(stop.distance)} m away`}
                  >
                    {stop.short_name || stop.id}
                    <small>{Math.round(stop.distance)} m</small>
                  </button>
                ))}
            </div>
          )}

          {/* Arrivals List (Live departures) */}
          <section className="cbm-arrivals" aria-label="Live departures">
            <div className="cbm-arrivals-status">
              {status === "cached" && <span className="cbm-stale-dot" aria-hidden="true" />}
              <span>{statusBarText}</span>
            </div>

            {status === "loading" && !arrivalData && (
              <div className="cbm-msg" aria-live="polite">Loading live timings…</div>
            )}
            {status === "error" && !arrivalData && (
              <div className="cbm-msg is-error" role="alert" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
                <span>NUS bus APIs are currently down. Please use the official <strong>uNivUS</strong> app for live timings in the meantime.</span>
                <button type="button" onClick={() => loadArrivals(true)}>Retry</button>
              </div>
            )}
            {status === "error" && arrivalData && (
              <div className="cbm-msg is-error" role="alert" style={{ marginBottom: "8px" }}>
                Live timings are unavailable. Showing cached data. Please use <strong>uNivUS</strong> instead.
              </div>
            )}

            {arrivalData && (
              <div className="cbm-arrivals-list" aria-live="polite">
                {arrivalData.arrivals?.length === 0 && (
                  <div className="cbm-msg">No arrivals reported for this stop.</div>
                )}
                {(arrivalData.arrivals ?? []).map((arrival) => {
                  const firstMin = arrival.minutes[0];
                  const fill     = urgencyFill(firstMin);
                  return (
                    <div className={`cbm-row ${serviceTone(arrival.service)}`} key={arrival.service}>
                      <strong className="cbm-svc">{arrival.service}</strong>
                      <div className="cbm-urgency-track" aria-hidden="true">
                        <div className="cbm-urgency-fill" style={{ width: `${fill}%` }} />
                      </div>
                      {arrival.minutes.length > 0 ? (
                        <div className="cbm-times">
                          <span className={firstMin <= 2 ? "is-imminent" : ""}>{formatEta(firstMin)}</span>
                          {arrival.minutes.length > 1 && (
                            <small>then {arrival.minutes.slice(1).map(formatEta).join(" · ")}</small>
                          )}
                        </div>
                      ) : (
                        <span className="cbm-no-svc">No bus</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ════════════════ PAGE 2: PLAN ROUTE VIEW (WITH BACK BUTTON) ════════ */}
      {currentView === "route" && (
        <div className="cbm-page cbm-route-page">
          <header className="cbm-route-header">
            <button
              type="button"
              className="cbm-back-btn"
              onClick={() => setCurrentView("departures")}
              aria-label="Back to departures"
            >
              <ArrowLeft size={12} />
              <span>Departures</span>
            </button>
            <span className="cbm-route-page-title">Plan Campus Route</span>
          </header>

          <form className="cbm-route-form" onSubmit={submitRoute}>
            <div className="cbm-route-inputs">
              <PlaceCombobox
                label="From"
                value={fromText}
                onChange={(val) => {
                  setFromText(val);
                  setFromPlace(fromPlaces.find((p) => normalise(p.name) === normalise(val)) ?? null);
                }}
                onSelectPlace={handleSelectFromPlace}
                suggestions={fromPlaces}
                placeholder="e.g. School of Computing"
                onEnterSubmit={() => {
                  if (toInputRef.current) toInputRef.current.focus();
                }}
              />

              <button
                type="button"
                className="cbm-swap-btn"
                onClick={swapLocations}
                title="Swap From and To locations"
                aria-label="Swap From and To locations"
              >
                <ArrowLeftRight size={12} />
              </button>

              <PlaceCombobox
                label="To"
                value={toText}
                onChange={(val) => {
                  setToText(val);
                  setToPlace(toPlaces.find((p) => normalise(p.name) === normalise(val)) ?? null);
                }}
                onSelectPlace={handleSelectToPlace}
                suggestions={toPlaces}
                placeholder="e.g. University Town"
                onEnterSubmit={() => submitRoute()}
                inputRef={toInputRef}
              />
            </div>

            <button
              type="submit"
              className="cbm-route-submit-btn"
              disabled={routeStatus === "loading"}
            >
              {routeStatus === "loading" ? "Planning…" : "Find Routes"}
            </button>
          </form>

          {/* Quick place shortcut tags for easy 1-click input */}
          {(!fromText || !toText) && (
            <div className="cbm-route-quick-places">
              <span className="cbm-quick-label">Quick places:</span>
              <div className="cbm-quick-place-chips">
                {QUICK_POPULAR_PLACES.map((placeName) => (
                  <button
                    type="button"
                    key={placeName}
                    className="cbm-quick-place-chip"
                    onClick={() => {
                      if (!fromText) {
                        setFromText(placeName);
                        localStorage.setItem(FROM_STORAGE_KEY, placeName);
                        if (toInputRef.current) toInputRef.current.focus();
                      } else if (!toText) {
                        setToText(placeName);
                        localStorage.setItem(TO_STORAGE_KEY, placeName);
                      }
                    }}
                  >
                    {placeName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Route results */}
          <div className="cbm-route-results" aria-live="polite">
            {routeStatus === "idle" && (
              <div className="cbm-route-empty-hint">
                <p>Search campus locations or faculties — we&rsquo;ll calculate the optimal bus and walking path.</p>
              </div>
            )}
            {routeStatus === "loading" && <div className="cbm-msg">Finding optimal campus bus routes…</div>}
            {routeStatus === "error"   && (
              <div className="cbm-msg is-error" role="alert">{routeError}</div>
            )}
            {routeStatus === "success" && !routePlan?.routes?.length && (
              <div className="cbm-msg">{routePlan?.message ?? "No direct route found."}</div>
            )}
            {routeStatus === "success" && routePlan?.routes?.map((route, rIdx) => (
              <article
                className={`cbm-route-card ${serviceTone(route.service)}`}
                key={`${route.service}-${route.from_stop.id}-${route.to_stop.id}-${rIdx}`}
              >
                <div className="cbm-route-card-header">
                  <span className="cbm-route-badge">{route.service}</span>
                  <div className="cbm-route-eta-summary">
                    <strong className="cbm-route-next-eta">
                      {route.next_bus_minutes == null
                        ? "No live bus"
                        : `Next bus in ${formatEta(route.next_bus_minutes)}`}
                    </strong>
                    <span className="cbm-route-total-time">
                      ~{route.total_minutes ?? (route.bus_travel_minutes + 4)} min total
                    </span>
                  </div>
                </div>

                <div className="cbm-route-card-body">
                  <div className="cbm-route-journey-line">
                    <div className="cbm-journey-stop">
                      <span className="cbm-journey-dot" />
                      <span>{route.from_stop.name}</span>
                      {route.walking_to_stop_metres > 0 && (
                        <small className="cbm-walk-tag">Walk ~{Math.ceil(route.walking_to_stop_metres / 80)} min</small>
                      )}
                    </div>
                    <div className="cbm-journey-transit">
                      <span className="cbm-transit-text">{route.stops_count} stops · {route.bus_travel_minutes} min ride</span>
                    </div>
                    <div className="cbm-journey-stop">
                      <span className="cbm-journey-dot is-dest" />
                      <span>{route.to_stop.name}</span>
                      <small className="cbm-arrival-time">arr {formatClock(route.destination_arrival_at)}</small>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

