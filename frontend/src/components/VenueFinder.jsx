import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Clock,
  DoorOpen,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { getVenueInformation, getVenueLocations } from "../api";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_SLOTS = [
  "0800",
  "0830",
  "0900",
  "0930",
  "1000",
  "1030",
  "1100",
  "1130",
  "1200",
  "1230",
  "1300",
  "1330",
  "1400",
  "1430",
  "1500",
  "1530",
  "1600",
  "1630",
  "1700",
  "1730",
  "1800",
  "1830",
  "1900",
  "1930",
  "2000",
  "2030",
  "2100",
  "2130",
];

const DURATION_OPTIONS = [
  { label: "Any duration", value: 0 },
  { label: "≥ 30 min", value: 30 },
  { label: "≥ 1 hour", value: 60 },
  { label: "≥ 2 hours", value: 120 },
  { label: "≥ 3 hours", value: 180 },
];

const CAMPUS_PRESETS = [
  {
    id: "com",
    name: "Computing (COM)",
    prefixes: ["COM", "COM1", "COM2", "COM3", "COM4"],
    keywords: ["computing", "com1", "com2", "com3", "com4"],
    lat: 1.29495,
    lon: 103.77372,
  },
  {
    id: "utown",
    name: "UTown",
    prefixes: ["UT", "ERC", "TGR", "TP-", "CAPT", "RC4", "UTR", "CQT"],
    keywords: [
      "utown",
      "university town",
      "erc",
      "town plaza",
      "stephen riady",
      "cinnamon",
      "tembusu",
    ],
    lat: 1.3039,
    lon: 103.774,
  },
  {
    id: "clb",
    name: "Central Library",
    prefixes: ["CLB", "YIH", "LT", "USC", "MPSH"],
    keywords: ["central library", "yusof ishak", "forum", "clb", "yih"],
    lat: 1.2966,
    lon: 103.7732,
  },
  {
    id: "sci",
    name: "Science (S17)",
    prefixes: [
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
      "S11",
      "S12",
      "S13",
      "S14",
      "S15",
      "S16",
      "S17",
      "LT26",
      "LT27",
      "LT28",
      "LT29",
      "LT31",
      "LT32",
      "LT33",
      "LT34",
    ],
    keywords: ["science", "s16", "s17"],
    lat: 1.29785,
    lon: 103.78035,
  },
  {
    id: "fass",
    name: "Arts (AS6)",
    prefixes: [
      "AS",
      "AS1",
      "AS2",
      "AS3",
      "AS4",
      "AS5",
      "AS6",
      "AS7",
      "AS8",
      "LT8",
      "LT9",
      "LT10",
      "LT11",
      "LT12",
      "LT13",
      "LT14",
      "LT15",
    ],
    keywords: [
      "arts & social sciences",
      "fass",
      "as1",
      "as2",
      "as3",
      "as4",
      "as5",
      "as6",
      "as7",
      "as8",
    ],
    lat: 1.29532,
    lon: 103.77265,
  },
  {
    id: "biz",
    name: "Business (BIZ1)",
    prefixes: ["BIZ", "BIZ1", "BIZ2", "MRB", "HSSML"],
    keywords: ["business", "biz1", "biz2", "mochtar riady"],
    lat: 1.29315,
    lon: 103.77485,
  },
  {
    id: "eng",
    name: "Engineering (EA)",
    prefixes: [
      "EA",
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "EW1",
      "EW2",
      "ENG",
      "LT1",
      "LT2",
      "LT3",
      "LT4",
      "LT5",
      "LT6",
      "LT7",
    ],
    keywords: ["engineering", "techno edge"],
    lat: 1.3004,
    lon: 103.7705,
  },
  {
    id: "sde",
    name: "Design & Environment (SDE)",
    prefixes: ["SDE", "SDE1", "SDE2", "SDE3", "SDE4"],
    keywords: ["design & environment", "sde"],
    lat: 1.2974,
    lon: 103.7706,
  },
  {
    id: "med",
    name: "Medicine (MD6)",
    prefixes: ["MD", "MD1", "MD2", "MD3", "MD4", "MD5", "MD6", "MD7", "MD8", "MD9", "MD10", "MD11"],
    keywords: ["medicine", "dentistry", "tahir", "translational"],
    lat: 1.2947,
    lon: 103.7831,
  },
  {
    id: "law",
    name: "Law (BTC)",
    prefixes: ["BTC", "SR-BTC", "LKY", "BTH"],
    keywords: ["bukit timah", "law", "btc", "lee kuan yew"],
    lat: 1.3195,
    lon: 103.8175,
  },
];

function venueMatchesPreset(venueCode, buildingName, roomName, vLat, vLon, preset) {
  const upperCode = (venueCode || "").toUpperCase();
  if (preset.prefixes?.some((pfx) => upperCode.startsWith(pfx.toUpperCase()))) {
    return true;
  }
  const bLower = (buildingName || "").toLowerCase();
  const rLower = (roomName || "").toLowerCase();
  if (preset.keywords?.some((k) => bLower.includes(k) || rLower.includes(k))) {
    return true;
  }
  return false;
}

function formatTimeSlot(slot) {
  if (!slot || slot.length !== 4) return slot;
  return `${slot.slice(0, 2)}:${slot.slice(2)}`;
}

function getCurrentTimeSlot() {
  const now = new Date();
  const hour = Math.min(Math.max(now.getHours(), 8), 21);
  const min = now.getMinutes() >= 30 ? "30" : "00";
  return `${String(hour).padStart(2, "0")}${min}`;
}

function getCurrentDayName() {
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7;
  return DAYS_OF_WEEK[dayIdx];
}

function distanceInMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatWeeks(weeks) {
  if (!weeks) return "Regular schedule";
  if (Array.isArray(weeks)) {
    if (weeks.length === 0) return "";
    const sorted = [...weeks].sort((a, b) => a - b);
    let isContiguous = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) isContiguous = false;
    }
    if (isContiguous) return `Weeks ${sorted[0]}-${sorted[sorted.length - 1]}`;
    return `Weeks: ${sorted.join(", ")}`;
  }
  if (typeof weeks === "object") {
    if (weeks.start && weeks.end) {
      return `${weeks.start} to ${weeks.end}`;
    }
    if (weeks.weeks && Array.isArray(weeks.weeks)) {
      return formatWeeks(weeks.weeks);
    }
    return JSON.stringify(weeks);
  }
  return String(weeks);
}

function formatDuration(minutes, isFree) {
  if (!isFree) return "Occupied";
  if (minutes <= 0) return "Vacant now";
  if (minutes >= 12 * 60) return "All day";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m free`;
  if (m === 0) return `${h}h free`;
  return `${h}h ${m}m free`;
}

export default function VenueFinder({ token }) {
  const [venuesData, setVenuesData] = useState({});
  const [locationsData, setLocationsData] = useState({});
  const [buildingCentroids, setBuildingCentroids] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [, setError] = useState(null);

  const [selectedDay, setSelectedDay] = useState(getCurrentDayName);
  const [selectedTime, setSelectedTime] = useState(getCurrentTimeSlot);
  const [minDuration, setMinDuration] = useState(0);

  const [userCoords, setUserCoords] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const [selectedLocations, setSelectedLocations] = useState([]);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyFree, setShowOnlyFree] = useState(true);
  const [sortBy, setSortBy] = useState("distance");

  const getStoredPreference = (key, defaultValue) => {
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
        return window.localStorage.getItem(`canvenient.vf.${key}`) || defaultValue;
      }
    } catch {}
    return defaultValue;
  };

  const [timePickerStyle, setTimePickerStyle] = useState(() => getStoredPreference("timePickerStyle", "scrubber"));
  const [vizStyle, setVizStyle] = useState(() => getStoredPreference("vizStyle", "blocks"));
  const [markerStyle, setMarkerStyle] = useState(() => getStoredPreference("markerStyle", "needle"));
  const [transitionStyle, setTransitionStyle] = useState(() => getStoredPreference("transitionStyle", "stagger"));

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsDropdownRef = useRef(null);
  const scrubberTrackRef = useRef(null);

  const [inspectedVenue, setInspectedVenue] = useState(null);
  const [pinnedPopover, setPinnedPopover] = useState(null);

  const [starredVenues, setStarredVenues] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
        return JSON.parse(window.localStorage.getItem("canvenient.venues.starred") || "[]");
      }
    } catch {
      return [];
    }
    return [];
  });

  const toggleStar = (venueCode, e) => {
    e.stopPropagation();
    let newStarred;
    if (starredVenues.includes(venueCode)) {
      newStarred = starredVenues.filter((c) => c !== venueCode);
    } else {
      newStarred = [...starredVenues, venueCode];
    }
    setStarredVenues(newStarred);
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.setItem === "function") {
        window.localStorage.setItem("canvenient.venues.starred", JSON.stringify(newStarred));
      }
    } catch {}
  };

  const setPreference = (key, val, setter) => {
    setter(val);
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.setItem === "function") {
        window.localStorage.setItem(`canvenient.vf.${key}`, val);
      }
    } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setIsLocationDropdownOpen(false);
      }
      if (optionsDropdownRef.current && !optionsDropdownRef.current.contains(e.target)) {
        setIsOptionsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsLocationDropdownOpen(false);
        setIsOptionsOpen(false);
        setInspectedVenue(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const toggleLocation = (locId) => {
    setSelectedLocations((prev) => {
      if (prev.includes(locId)) {
        return prev.filter((id) => id !== locId);
      }
      return [...prev, locId];
    });
  };

  const selectAllLocations = () => {
    setSelectedLocations(CAMPUS_PRESETS.map((p) => p.id));
  };

  const clearAllLocations = () => {
    setSelectedLocations([]);
  };

  const dropdownButtonLabel = useMemo(() => {
    if (selectedLocations.length === 0 || selectedLocations.length === CAMPUS_PRESETS.length) {
      return "Campus: All locations";
    }
    if (selectedLocations.length === 1) {
      const preset = CAMPUS_PRESETS.find((p) => p.id === selectedLocations[0]);
      return `Campus: ${preset?.name || "1 location"}`;
    }
    return `Campus: ${selectedLocations.length} locations`;
  }, [selectedLocations]);

  const toolbarSubtitle = useMemo(() => {
    if (locationLabel) return `Near ${locationLabel}`;
    if (selectedLocations.length > 0 && selectedLocations.length < CAMPUS_PRESETS.length) {
      if (selectedLocations.length === 1) {
        const p = CAMPUS_PRESETS.find((item) => item.id === selectedLocations[0]);
        return `Filtered by ${p?.name || "1 location"}`;
      }
      return `Filtered by ${selectedLocations.length} locations`;
    }
    return "Discover vacant rooms";
  }, [locationLabel, selectedLocations]);

  const toolbarConfig = useMemo(
    () => ({
      title: "Venue Finder",
      subtitle: toolbarSubtitle,
    }),
    [toolbarSubtitle],
  );

  useWorkspaceToolbar(toolbarConfig);

  const loadVenueData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [infoRes, locRes] = await Promise.all([
        getVenueInformation(token),
        getVenueLocations(token),
      ]);
      setVenuesData(infoRes.venues || {});
      setLocationsData(locRes.locations || {});
      setBuildingCentroids(locRes.building_centroids || {});
    } catch {
      setError("Could not load venue schedules.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the async venue-data fetch; loading state must apply immediately
    loadVenueData();
  }, [loadVenueData]);

  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
        setLocationLabel("Current Location");
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const effectiveCoords = useMemo(() => {
    if (userCoords) return userCoords;
    if (selectedLocations.length === 1) {
      const p = CAMPUS_PRESETS.find((item) => item.id === selectedLocations[0]);
      if (p) return { lat: p.lat, lon: p.lon };
    }
    return null;
  }, [userCoords, selectedLocations]);

  const processedVenues = useMemo(() => {
    const list = [];
    const q = searchQuery.toLowerCase().trim();

    // Determine target date for the selected day of the week
    const now = new Date();
    const currentDayIdx = (now.getDay() + 6) % 7; // Monday=0, Sunday=6
    const selectedDayIdx = DAYS_OF_WEEK.indexOf(selectedDay);
    let daysDiff = selectedDayIdx - currentDayIdx;
    if (daysDiff < 0) daysDiff += 7; // Next occurrence
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysDiff);
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

    for (const [venueCode, dayList] of Object.entries(venuesData)) {
      const loc = locationsData[venueCode] || {};
      const coords = loc.location;

      let vLat = coords?.y ?? null;
      let vLon = coords?.x ?? null;
      let roomName = loc.roomName || venueCode;

      let buildingName = "NUS Kent Ridge";
      for (const [prefix, [cLat, cLon, bName]] of Object.entries(buildingCentroids)) {
        if (venueCode.toUpperCase().startsWith(prefix)) {
          buildingName = bName;
          if (vLat === null || vLon === null) {
            vLat = cLat;
            vLon = cLon;
            if (!loc.roomName) roomName = `${venueCode} (${bName})`;
          }
          break;
        }
      }

      if (
        q &&
        !venueCode.toLowerCase().includes(q) &&
        !roomName.toLowerCase().includes(q) &&
        !buildingName.toLowerCase().includes(q)
      ) {
        continue;
      }

      if (selectedLocations.length > 0 && selectedLocations.length < CAMPUS_PRESETS.length) {
        const matchesSelected = selectedLocations.some((locId) => {
          const preset = CAMPUS_PRESETS.find((p) => p.id === locId);
          return preset
            ? venueMatchesPreset(venueCode, buildingName, roomName, vLat, vLon, preset)
            : false;
        });
        if (!matchesSelected) {
          continue;
        }
      }

      const dayData = (dayList || []).find(
        (d) => (d.day || "").toLowerCase() === selectedDay.toLowerCase(),
      );
      const rawClasses = dayData?.classes || [];

      const classesToday = rawClasses.filter((cls) => {
        if (cls.weeks && typeof cls.weeks === "object" && cls.weeks.start && cls.weeks.end) {
          return targetDateStr >= cls.weeks.start && targetDateStr <= cls.weeks.end;
        }
        return true;
      });

      const computedAvail = {};
      TIME_SLOTS.forEach((slot) => (computedAvail[slot] = "vacant"));
      classesToday.forEach((cls) => {
        const start = cls.startTime || "0000";
        const end = cls.endTime || "0000";
        TIME_SLOTS.forEach((slot) => {
          if (slot >= start && slot < end) {
            computedAvail[slot] = "occupied";
          }
        });
      });

      const isVacantNow = (computedAvail[selectedTime] || "vacant") === "vacant";

      let freeMinutes = 0;
      const targetIdx = TIME_SLOTS.indexOf(selectedTime);

      if (isVacantNow) {
        let occupiedSlot = null;
        for (let i = targetIdx; i < TIME_SLOTS.length; i++) {
          if ((computedAvail[TIME_SLOTS[i]] || "vacant") === "occupied") {
            occupiedSlot = TIME_SLOTS[i];
            break;
          }
        }
        if (occupiedSlot) {
          const tMin =
            parseInt(selectedTime.slice(0, 2), 10) * 60 + parseInt(selectedTime.slice(2), 10);
          const oMin =
            parseInt(occupiedSlot.slice(0, 2), 10) * 60 + parseInt(occupiedSlot.slice(2), 10);
          freeMinutes = Math.max(0, oMin - tMin);
        } else {
          const tMin =
            parseInt(selectedTime.slice(0, 2), 10) * 60 + parseInt(selectedTime.slice(2), 10);
          freeMinutes = Math.max(0, 22 * 60 - tMin);
        }
      }

      if (showOnlyFree && !isVacantNow) continue;
      if (minDuration > 0 && freeMinutes < minDuration) continue;

      let distanceM = null;
      let walkMins = null;
      if (effectiveCoords && vLat !== null && vLon !== null) {
        distanceM = Math.round(
          distanceInMetres(effectiveCoords.lat, effectiveCoords.lon, vLat, vLon),
        );
        walkMins = Math.max(1, Math.ceil(distanceM / 80));
      }

      list.push({
        venueCode,
        roomName,
        buildingName,
        latitude: vLat,
        longitude: vLon,
        distanceM,
        walkMins,
        isFree: isVacantNow,
        freeMinutes,
        rawAvail: computedAvail,
        classesToday,
      });
    }

    list.sort((a, b) => {
      const aStarred = starredVenues.includes(a.venueCode) ? -1 : 1;
      const bStarred = starredVenues.includes(b.venueCode) ? -1 : 1;
      if (aStarred !== bStarred) return aStarred - bStarred;

      if (sortBy === "duration") {
        if (b.freeMinutes !== a.freeMinutes) {
          return b.freeMinutes - a.freeMinutes;
        }
      } else if (sortBy === "distance" && effectiveCoords) {
        if (a.distanceM === null && b.distanceM !== null) return 1;
        if (b.distanceM === null && a.distanceM !== null) return -1;
        if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) {
          return a.distanceM - b.distanceM;
        }
      }

      return a.venueCode.localeCompare(b.venueCode);
    });

    return list.slice(0, 120);
  }, [
    venuesData,
    locationsData,
    buildingCentroids,
    selectedDay,
    selectedTime,
    searchQuery,
    showOnlyFree,
    minDuration,
    effectiveCoords,
    selectedLocations,
    starredVenues,
    sortBy,
  ]);

  const handleScrubberMouseDown = (e) => {
    if (!scrubberTrackRef.current) return;
    const updateFromEvent = (event) => {
      const rect = scrubberTrackRef.current.getBoundingClientRect();
      const clientX = event.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const idx = Math.min(TIME_SLOTS.length - 1, Math.floor(pct * TIME_SLOTS.length));
      setSelectedTime(TIME_SLOTS[idx]);
    };
    updateFromEvent(e);

    const handleMouseMove = (event) => {
      updateFromEvent(event);
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const realTimePct = useMemo(() => {
    const now = new Date();
    const dayName = getCurrentDayName();
    if (selectedDay !== dayName) return null;
    const hours = now.getHours() + now.getMinutes() / 60;
    if (hours < 8 || hours > 22) return null;
    return ((hours - 8) / 14) * 100;
  }, [selectedDay]);

  const selectedTimePct = useMemo(() => {
    const idx = TIME_SLOTS.indexOf(selectedTime);
    if (idx < 0) return 0;
    return ((idx + 0.5) / TIME_SLOTS.length) * 100;
  }, [selectedTime]);

  const isCurrentTimeSlotSelected = selectedTime === getCurrentTimeSlot();
  const isCurrentDaySelected = selectedDay === getCurrentDayName();

  const resetFilters = () => {
    setSelectedDay(getCurrentDayName());
    setSelectedTime(getCurrentTimeSlot());
    setMinDuration(0);
    setSelectedLocations([]);
    setSearchQuery("");
    setShowOnlyFree(true);
    setUserCoords(null);
    setLocationLabel("");
  };

  const hasActiveFilters =
    !isCurrentDaySelected ||
    !isCurrentTimeSlotSelected ||
    minDuration > 0 ||
    selectedLocations.length > 0 ||
    searchQuery.trim() !== "" ||
    !showOnlyFree ||
    userCoords !== null;

  return (
    <div className="vf-container">
      {/* Sticky Filter Header */}
      <header className="vf-sticky-header">
        <div className="vf-filter-bar">
          {/* Controls Row */}
          <div className="vf-controls-row">
            {/* Search Input */}
            <div className="vf-search-wrap">
              <Search size={15} className="vf-search-icon" />
              <input
                type="text"
                className="vf-search-input"
                placeholder="Search rooms, buildings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="vf-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Day Selector */}
            <select
              className="vf-select"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              aria-label="Select day of the week"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Duration Selector */}
            <select
              className="vf-select"
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
              aria-label="Minimum free duration"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            {/* Campus Locations Dropdown */}
            <div className="vf-dropdown-wrapper" ref={locationDropdownRef}>
              <button
                type="button"
                className={`vf-btn ${selectedLocations.length > 0 ? "active" : ""}`}
                onClick={() => setIsLocationDropdownOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isLocationDropdownOpen}
              >
                <MapPin size={13} />
                <span>{dropdownButtonLabel}</span>
                <ChevronDown
                  size={13}
                  className={`vf-dropdown-chevron ${isLocationDropdownOpen ? "open" : ""}`}
                />
              </button>

              {isLocationDropdownOpen && (
                <div className="vf-dropdown-menu" role="listbox" aria-multiselectable="true">
                  <div className="vf-dropdown-header">
                    <span className="vf-dropdown-title">Campus Locations</span>
                    <div className="vf-dropdown-actions">
                      <button
                        type="button"
                        className="vf-dropdown-action-btn"
                        onClick={selectAllLocations}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="vf-dropdown-action-btn"
                        onClick={clearAllLocations}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="vf-dropdown-list">
                    {CAMPUS_PRESETS.map((p) => {
                      const isChecked = selectedLocations.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`vf-dropdown-item ${isChecked ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="vf-dropdown-checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleLocation(p.id);
                            }}
                          />
                          <span className="vf-dropdown-item-name">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Near Me Location Button */}
            <button
              type="button"
              className={`vf-btn ${userCoords ? "active" : ""}`}
              onClick={handleUseCurrentLocation}
              title="Filter by distance to your current location"
            >
              {isLocating ? <Loader2 size={13} className="spin" /> : <LocateFixed size={13} />}
              <span>{locationLabel || "Near me"}</span>
            </button>
            {userCoords && (
              <button
                type="button"
                className="vf-btn vf-btn-icon-only"
                onClick={() => {
                  setUserCoords(null);
                  setLocationLabel("");
                }}
                title="Clear current location filter"
                aria-label="Clear current location"
              >
                <X size={13} />
              </button>
            )}

            {/* Available Only Toggle Button */}
            <button
              type="button"
              className={`vf-btn ${showOnlyFree ? "active" : ""}`}
              onClick={() => setShowOnlyFree(!showOnlyFree)}
            >
              <span>Available only</span>
            </button>

            {/* View Customizer Popover Trigger */}
            <div className="vf-dropdown-wrapper" ref={optionsDropdownRef} style={{ marginLeft: "auto" }}>
              <button
                type="button"
                className={`vf-btn vf-btn-icon-only ${isOptionsOpen ? "active" : ""}`}
                onClick={() => setIsOptionsOpen((prev) => !prev)}
                title="View and design preferences"
                aria-label="View options"
              >
                <SlidersHorizontal size={14} />
              </button>

              {isOptionsOpen && (
                <div className="vf-options-popover">
                  <div className="vf-options-group">
                    <span className="vf-options-label">Time Picker Style</span>
                    <div className="vf-segmented-toggle">
                      <button
                        type="button"
                        className={`vf-segmented-item ${timePickerStyle === "scrubber" ? "selected" : ""}`}
                        onClick={() => setPreference("timePickerStyle", "scrubber", setTimePickerStyle)}
                      >
                        Timeline
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${timePickerStyle === "chips" ? "selected" : ""}`}
                        onClick={() => setPreference("timePickerStyle", "chips", setTimePickerStyle)}
                      >
                        Chips
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${timePickerStyle === "select" ? "selected" : ""}`}
                        onClick={() => setPreference("timePickerStyle", "select", setTimePickerStyle)}
                      >
                        Select
                      </button>
                    </div>
                  </div>

                  <div className="vf-options-group">
                    <span className="vf-options-label">Availability Bar Style</span>
                    <div className="vf-segmented-toggle">
                      <button
                        type="button"
                        className={`vf-segmented-item ${vizStyle === "blocks" ? "selected" : ""}`}
                        onClick={() => setPreference("vizStyle", "blocks", setVizStyle)}
                      >
                        Blocks
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${vizStyle === "dots" ? "selected" : ""}`}
                        onClick={() => setPreference("vizStyle", "dots", setVizStyle)}
                      >
                        Dots
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${vizStyle === "continuous" ? "selected" : ""}`}
                        onClick={() => setPreference("vizStyle", "continuous", setVizStyle)}
                      >
                        Bar
                      </button>
                    </div>
                  </div>

                  <div className="vf-options-group">
                    <span className="vf-options-label">Time Marker Style</span>
                    <div className="vf-segmented-toggle">
                      <button
                        type="button"
                        className={`vf-segmented-item ${markerStyle === "needle" ? "selected" : ""}`}
                        onClick={() => setPreference("markerStyle", "needle", setMarkerStyle)}
                      >
                        Needle
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${markerStyle === "dot" ? "selected" : ""}`}
                        onClick={() => setPreference("markerStyle", "dot", setMarkerStyle)}
                      >
                        Dot
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${markerStyle === "taller" ? "selected" : ""}`}
                        onClick={() => setPreference("markerStyle", "taller", setMarkerStyle)}
                      >
                        Raised
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${markerStyle === "label" ? "selected" : ""}`}
                        onClick={() => setPreference("markerStyle", "label", setMarkerStyle)}
                      >
                        Label
                      </button>
                    </div>
                  </div>

                  <div className="vf-options-group">
                    <span className="vf-options-label">Transition Animation</span>
                    <div className="vf-segmented-toggle">
                      <button
                        type="button"
                        className={`vf-segmented-item ${transitionStyle === "stagger" ? "selected" : ""}`}
                        onClick={() => setPreference("transitionStyle", "stagger", setTransitionStyle)}
                      >
                        Stagger
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${transitionStyle === "fade" ? "selected" : ""}`}
                        onClick={() => setPreference("transitionStyle", "fade", setTransitionStyle)}
                      >
                        Fade
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${transitionStyle === "skeleton" ? "selected" : ""}`}
                        onClick={() => setPreference("transitionStyle", "skeleton", setTransitionStyle)}
                      >
                        Pulse
                      </button>
                      <button
                        type="button"
                        className={`vf-segmented-item ${transitionStyle === "slide" ? "selected" : ""}`}
                        onClick={() => setPreference("transitionStyle", "slide", setTransitionStyle)}
                      >
                        Slide
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Time Picker Shell */}
          <div className="vf-time-picker-shell">
            <div className="vf-time-picker-header">
              <span>
                Target time: <strong style={{ color: "var(--text-h)" }}>{formatTimeSlot(selectedTime)}</strong>
              </span>
              <button
                type="button"
                className="vf-time-picker-now-btn"
                onClick={() => {
                  setSelectedDay(getCurrentDayName());
                  setSelectedTime(getCurrentTimeSlot());
                }}
                title="Jump to current day and time"
              >
                <Clock size={11} />
                <span>Jump to now</span>
              </button>
            </div>

            {/* Time Picker Variant A: Timeline Scrubber */}
            {timePickerStyle === "scrubber" && (
              <div className="vf-scrubber-container">
                <div
                  ref={scrubberTrackRef}
                  className="vf-scrubber-track"
                  onMouseDown={handleScrubberMouseDown}
                  role="slider"
                  tabIndex={0}
                  aria-label="Time scrubber"
                  aria-valuemin={8}
                  aria-valuemax={22}
                  aria-valuenow={parseInt(selectedTime.slice(0, 2), 10)}
                >
                  <div className="vf-scrubber-ticks">
                    <span className="vf-scrubber-tick-label">08:00</span>
                    <span className="vf-scrubber-tick-label">10:00</span>
                    <span className="vf-scrubber-tick-label">12:00</span>
                    <span className="vf-scrubber-tick-label">14:00</span>
                    <span className="vf-scrubber-tick-label">16:00</span>
                    <span className="vf-scrubber-tick-label">18:00</span>
                    <span className="vf-scrubber-tick-label">20:00</span>
                    <span className="vf-scrubber-tick-label">22:00</span>
                  </div>

                  {realTimePct !== null && (
                    <div
                      className="vf-scrubber-realnow-line"
                      style={{ left: `${realTimePct}%` }}
                      title="Real-world current time"
                    />
                  )}

                  <div className="vf-scrubber-cursor-line" style={{ left: `${selectedTimePct}%` }}>
                    <div className="vf-scrubber-cursor-bubble">{formatTimeSlot(selectedTime)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Time Picker Variant B: Pill Chips */}
            {timePickerStyle === "chips" && (
              <div className="vf-chips-container">
                {TIME_SLOTS.map((t) => {
                  const isSelected = t === selectedTime;
                  const isNowSlot = isCurrentDaySelected && t === getCurrentTimeSlot();
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`vf-time-chip ${isSelected ? "active" : ""} ${isNowSlot ? "is-now" : ""}`}
                      onClick={() => setSelectedTime(t)}
                    >
                      {formatTimeSlot(t)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Time Picker Variant C: Classic Select */}
            {timePickerStyle === "select" && (
              <div className="vf-time-classic-wrap">
                <select
                  className="vf-select"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  style={{ width: "160px" }}
                  aria-label="Target time slot"
                >
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {formatTimeSlot(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Results Summary Bar */}
      <div className="vf-results-bar">
        <div className="vf-results-left">
          <div className="vf-count-badge">
            <span className="vf-count-number">{processedVenues.length}</span>
            <span>{processedVenues.length === 1 ? "room available" : "rooms available"}</span>
          </div>

          {/* Active Filter Pills */}
          {hasActiveFilters && (
            <div className="vf-active-pills">
              {!isCurrentDaySelected && (
                <span className="vf-filter-pill">
                  {selectedDay}
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => setSelectedDay(getCurrentDayName())}
                    aria-label={`Remove ${selectedDay} filter`}
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {!isCurrentTimeSlotSelected && (
                <span className="vf-filter-pill">
                  {formatTimeSlot(selectedTime)}
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => setSelectedTime(getCurrentTimeSlot())}
                    aria-label="Reset to current time"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {minDuration > 0 && (
                <span className="vf-filter-pill">
                  ≥ {minDuration >= 60 ? `${minDuration / 60}h` : `${minDuration}m`}
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => setMinDuration(0)}
                    aria-label="Remove duration filter"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {selectedLocations.length > 0 && selectedLocations.length < CAMPUS_PRESETS.length && (
                <span className="vf-filter-pill">
                  {selectedLocations.length === 1
                    ? CAMPUS_PRESETS.find((p) => p.id === selectedLocations[0])?.name
                    : `${selectedLocations.length} campuses`}
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={clearAllLocations}
                    aria-label="Clear campus filters"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {userCoords && (
                <span className="vf-filter-pill">
                  Near me
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => {
                      setUserCoords(null);
                      setLocationLabel("");
                    }}
                    aria-label="Remove near me filter"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {!showOnlyFree && (
                <span className="vf-filter-pill">
                  Showing occupied
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => setShowOnlyFree(true)}
                    aria-label="Show free only"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="vf-filter-pill">
                  &ldquo;{searchQuery}&rdquo;
                  <button
                    type="button"
                    className="vf-filter-pill-remove"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              <button
                type="button"
                className="vf-filter-pill-clear-all"
                onClick={resetFilters}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Sort selector on the right */}
        <div className="vf-results-right">
          <ArrowUpDown size={12} style={{ color: "var(--text-muted)" }} />
          <select
            className="vf-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ height: "28px", fontSize: "11.5px" }}
            aria-label="Sort venues by"
          >
            <option value="distance">Sort: Distance</option>
            <option value="code">Sort: Room Code</option>
            <option value="duration">Sort: Free Duration</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="vf-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="vf-skeleton-card">
              <div className="vf-skeleton-line" style={{ width: "45%" }} />
              <div className="vf-skeleton-line" style={{ width: "70%" }} />
              <div className="vf-skeleton-line" style={{ width: "100%", height: "10px", marginTop: "auto" }} />
            </div>
          ))}
        </div>
      ) : processedVenues.length === 0 ? (
        <div className="vf-empty-state">
          <DoorOpen size={28} className="vf-empty-icon" />
          <h3 className="vf-empty-title">No free rooms match your filters</h3>
          <p className="vf-empty-subtext">
            Try choosing a different time, reducing minimum duration, or clearing campus filters.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              className="vf-btn"
              onClick={resetFilters}
              style={{ marginTop: "12px" }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div
          className={`vf-grid ${
            transitionStyle === "stagger"
              ? "anim-stagger"
              : transitionStyle === "fade"
                ? "anim-fade"
                : transitionStyle === "slide"
                  ? "anim-slide"
                  : ""
          }`}
        >
          {processedVenues.map((v, index) => {
            const isStarred = starredVenues.includes(v.venueCode);
            const targetIdx = TIME_SLOTS.indexOf(selectedTime);

            return (
              <div
                key={v.venueCode}
                className={`vf-card ${v.isFree ? "is-free" : ""}`}
                style={{ "--stagger-idx": Math.min(index, 25) }}
                onClick={() => setInspectedVenue(v)}
                onMouseLeave={() => setPinnedPopover(null)}
              >
                {/* Header row */}
                <div className="vf-card-header">
                  <div className="vf-card-titles">
                    <h3 className="vf-card-title">{v.venueCode}</h3>
                    <span className="vf-card-building" title={v.buildingName}>
                      {v.buildingName}
                    </span>
                  </div>

                  <div className="vf-card-header-actions">
                    {v.distanceM !== null && (
                      <span className="vf-walk-badge" title={`${v.distanceM}m away`}>
                        <MapPin size={10} />
                        {v.distanceM < 1000 ? `${v.distanceM}m` : `${(v.distanceM / 1000).toFixed(1)}km`}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`vf-star-btn ${isStarred ? "is-starred" : ""}`}
                      onClick={(e) => toggleStar(v.venueCode, e)}
                      title={isStarred ? "Remove from favorites" : "Add to favorites"}
                      aria-label={isStarred ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star
                        size={13}
                        fill={isStarred ? "var(--warning)" : "none"}
                        color={isStarred ? "var(--warning)" : "currentColor"}
                      />
                    </button>
                  </div>
                </div>

                {/* Room Name Subtitle */}
                <p className="vf-card-room-name" title={v.roomName}>
                  {v.roomName}
                </p>

                {/* Availability Visualization Container */}
                <div className="vf-avail-wrapper">
                  {/* Selected Time Marker */}
                  {targetIdx >= 0 && (
                    <>
                      {markerStyle === "needle" && (
                        <div
                          className="vf-marker-needle"
                          style={{ left: `${((targetIdx + 0.5) / TIME_SLOTS.length) * 100}%` }}
                        />
                      )}
                      {markerStyle === "dot" && (
                        <div
                          className="vf-marker-dot"
                          style={{ left: `${((targetIdx + 0.5) / TIME_SLOTS.length) * 100}%` }}
                        />
                      )}
                      {markerStyle === "label" && (
                        <div
                          className="vf-marker-label"
                          style={{ left: `${((targetIdx + 0.5) / TIME_SLOTS.length) * 100}%` }}
                        >
                          {formatTimeSlot(selectedTime)}
                        </div>
                      )}
                    </>
                  )}

                  {/* Viz Style A: 28-Block Heat-Strip */}
                  {vizStyle === "blocks" && (
                    <div className="vf-avail-strip">
                      {TIME_SLOTS.map((slot) => {
                        const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                        const isSelected = slot === selectedTime;

                        let currentClass = null;
                        if (!isVacant) {
                          currentClass = v.classesToday.find(
                            (c) => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot,
                          );
                        }

                        return (
                          <div
                            key={slot}
                            className={`vf-slot-block ${isVacant ? "free" : "occupied"} ${
                              isSelected && markerStyle === "taller" ? "marker-taller" : ""
                            }`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPinnedPopover({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 6,
                                venueCode: v.venueCode,
                                slot,
                                isVacant,
                                currentClass,
                              });
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTime(slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Viz Style B: Dot Matrix */}
                  {vizStyle === "dots" && (
                    <div className="vf-avail-dots">
                      {TIME_SLOTS.map((slot) => {
                        const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                        const isSelected = slot === selectedTime;

                        let currentClass = null;
                        if (!isVacant) {
                          currentClass = v.classesToday.find(
                            (c) => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot,
                          );
                        }

                        return (
                          <div
                            key={slot}
                            className={`vf-dot ${isVacant ? "free" : "occupied"} ${
                              isSelected ? "selected" : ""
                            }`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPinnedPopover({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 6,
                                venueCode: v.venueCode,
                                slot,
                                isVacant,
                                currentClass,
                              });
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTime(slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Viz Style C: Continuous Bar */}
                  {vizStyle === "continuous" && (
                    <div className="vf-avail-continuous">
                      {TIME_SLOTS.map((slot) => {
                        const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                        let currentClass = null;
                        if (!isVacant) {
                          currentClass = v.classesToday.find(
                            (c) => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot,
                          );
                        }
                        return (
                          <div
                            key={slot}
                            className={`vf-cont-segment ${isVacant ? "free" : "occupied"}`}
                            style={{ flex: 1 }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPinnedPopover({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 6,
                                venueCode: v.venueCode,
                                slot,
                                isVacant,
                                currentClass,
                              });
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTime(slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer: Status Dot and Bar-End Label */}
                <div className="vf-card-footer">
                  <span className="vf-card-status-pill">
                    <span className={`vf-status-dot ${v.isFree ? "free" : ""}`} />
                    <span>{v.isFree ? "Vacant now" : "In use"}</span>
                  </span>

                  <span className="vf-bar-end-label">
                    {formatDuration(v.freeMinutes, v.isFree)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pinned Slot Popover (stays pinned until leaving the card) */}
      {pinnedPopover && (
        <div
          className="vf-pinned-popover"
          style={{
            left: pinnedPopover.x,
            top: pinnedPopover.y,
          }}
        >
          {pinnedPopover.currentClass ? (
            <div>
              <div className="vf-popover-module">
                {pinnedPopover.currentClass.moduleCode} ({pinnedPopover.currentClass.lessonType})
              </div>
              <div className="vf-popover-meta">
                {formatTimeSlot(pinnedPopover.currentClass.startTime)} -{" "}
                {formatTimeSlot(pinnedPopover.currentClass.endTime)} ·{" "}
                {formatWeeks(pinnedPopover.currentClass.weeks)}
              </div>
            </div>
          ) : (
            <div>
              <div className="vf-popover-module" style={{ color: "var(--success)" }}>
                Available
              </div>
              <div className="vf-popover-meta">
                {formatTimeSlot(pinnedPopover.slot)} -{" "}
                {formatTimeSlot(
                  String(
                    parseInt(pinnedPopover.slot.slice(0, 2), 10) * 100 +
                      parseInt(pinnedPopover.slot.slice(2), 10) +
                      30,
                  ).padStart(4, "0"),
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Restyled Centered Modal Sheet for Venue Detail */}
      {inspectedVenue && (
        <div className="vf-modal-overlay" onClick={() => setInspectedVenue(null)}>
          <div className="vf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vf-modal-header">
              <div>
                <h2 className="vf-modal-title">{inspectedVenue.venueCode}</h2>
                <p className="vf-modal-subtitle">
                  {inspectedVenue.buildingName} · {inspectedVenue.roomName}
                </p>
              </div>
              <button
                type="button"
                className="vf-btn vf-btn-icon-only"
                onClick={() => setInspectedVenue(null)}
                title="Close modal (Esc)"
                aria-label="Close modal"
              >
                <X size={15} />
              </button>
            </div>

            <div className="vf-modal-body">
              {inspectedVenue.latitude && inspectedVenue.longitude && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${inspectedVenue.latitude},${inspectedVenue.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vf-modal-map-link"
                >
                  <ExternalLink size={14} />
                  <span>Open in Google Maps</span>
                </a>
              )}

              <div className="vf-detail-section">
                <h4 className="vf-detail-heading">Schedule ({selectedDay})</h4>
                {inspectedVenue.classesToday.length === 0 ? (
                  <p className="vf-detail-text">No classes scheduled for this venue today.</p>
                ) : (
                  <div className="vf-schedule-list">
                    {inspectedVenue.classesToday
                      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
                      .map((cls, i) => (
                        <div key={i} className="vf-schedule-item">
                          <span className="vf-schedule-time">
                            {formatTimeSlot(cls.startTime)} - {formatTimeSlot(cls.endTime)}
                          </span>
                          <div className="vf-schedule-info">
                            <span className="vf-schedule-module">
                              {cls.moduleCode} ({cls.lessonType})
                            </span>
                            <span className="vf-schedule-weeks">{formatWeeks(cls.weeks)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
