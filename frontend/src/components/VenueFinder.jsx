import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Copy,
  DoorOpen,
  ExternalLink,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Star,
  X,
} from "lucide-react";
import { getVenueInformation, getVenueLocations } from "../api";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_SLOTS = [
  "0800", "0830", "0900", "0930", "1000", "1030",
  "1100", "1130", "1200", "1230", "1300", "1330",
  "1400", "1430", "1500", "1530", "1600", "1630",
  "1700", "1730", "1800", "1830", "1900", "1930",
  "2000", "2030", "2100", "2130",
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
    keywords: ["utown", "university town", "erc", "town plaza", "stephen riady", "cinnamon", "tembusu"],
    lat: 1.30390,
    lon: 103.77400,
  },
  {
    id: "clb",
    name: "Central Library",
    prefixes: ["CLB", "YIH", "LT", "USC", "MPSH"],
    keywords: ["central library", "yusof ishak", "forum", "clb", "yih"],
    lat: 1.29660,
    lon: 103.77320,
  },
  {
    id: "sci",
    name: "Science (S17)",
    prefixes: [
      "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10",
      "S11", "S12", "S13", "S14", "S15", "S16", "S17",
      "LT26", "LT27", "LT28", "LT29", "LT31", "LT32", "LT33", "LT34",
    ],
    keywords: ["science", "s16", "s17"],
    lat: 1.29785,
    lon: 103.78035,
  },
  {
    id: "fass",
    name: "Arts (AS6)",
    prefixes: [
      "AS", "AS1", "AS2", "AS3", "AS4", "AS5", "AS6", "AS7", "AS8",
      "LT8", "LT9", "LT10", "LT11", "LT12", "LT13", "LT14", "LT15",
    ],
    keywords: ["arts & social sciences", "fass", "as1", "as2", "as3", "as4", "as5", "as6", "as7", "as8"],
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
      "EA", "E1", "E2", "E3", "E4", "E5", "E6", "EW1", "EW2", "ENG",
      "LT1", "LT2", "LT3", "LT4", "LT5", "LT6", "LT7",
    ],
    keywords: ["engineering", "techno edge"],
    lat: 1.30040,
    lon: 103.77050,
  },
  {
    id: "sde",
    name: "Design & Environment (SDE)",
    prefixes: ["SDE", "SDE1", "SDE2", "SDE3", "SDE4"],
    keywords: ["design & environment", "sde"],
    lat: 1.29740,
    lon: 103.77060,
  },
  {
    id: "med",
    name: "Medicine (MD6)",
    prefixes: ["MD", "MD1", "MD2", "MD3", "MD4", "MD5", "MD6", "MD7", "MD8", "MD9", "MD10", "MD11"],
    keywords: ["medicine", "dentistry", "tahir", "translational"],
    lat: 1.29470,
    lon: 103.78310,
  },
  {
    id: "law",
    name: "Law (BTC)",
    prefixes: ["BTC", "SR-BTC", "LKY", "BTH"],
    keywords: ["bukit timah", "law", "btc", "lee kuan yew"],
    lat: 1.31950,
    lon: 103.81750,
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
  const a = Math.sin(dphi / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


function formatWeeks(weeks) {
  if (!weeks) return "Regular schedule";
  if (Array.isArray(weeks)) {
    if (weeks.length === 0) return "";
    const sorted = [...weeks].sort((a,b)=>a-b);
    let isContiguous = true;
    for(let i=1; i<sorted.length; i++) {
      if (sorted[i] !== sorted[i-1] + 1) isContiguous = false;
    }
    if (isContiguous) return `Weeks ${sorted[0]}-${sorted[sorted.length-1]}`;
    return `Weeks: ${sorted.join(', ')}`;
  }
  if (typeof weeks === 'object') {
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

export default function VenueFinder({ token }) {
  const [venuesData, setVenuesData] = useState({});
  const [locationsData, setLocationsData] = useState({});
  const [buildingCentroids, setBuildingCentroids] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const [inspectedVenue, setInspectedVenue] = useState(null);
  const [tooltipData, setTooltipData] = useState(null);

  const [starredVenues, setStarredVenues] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("canvenient.venues.starred") || "[]");
    } catch(e) { return []; }
  });

  const toggleStar = (venueCode, e) => {
    e.stopPropagation();
    let newStarred;
    if (starredVenues.includes(venueCode)) {
      newStarred = starredVenues.filter(c => c !== venueCode);
    } else {
      newStarred = [...starredVenues, venueCode];
    }
    setStarredVenues(newStarred);
    try { window.localStorage.setItem("canvenient.venues.starred", JSON.stringify(newStarred)); } catch(e) {}
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setIsLocationDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsLocationDropdownOpen(false);
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

  const toolbarConfig = useMemo(() => ({
    title: "Venue Finder",
    subtitle: toolbarSubtitle,
  }), [toolbarSubtitle]);

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
    } catch (err) {
      setError("Could not load venue schedules.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
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
      { timeout: 10000, enableHighAccuracy: true }
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
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

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

      if (q && !venueCode.toLowerCase().includes(q) && !roomName.toLowerCase().includes(q) && !buildingName.toLowerCase().includes(q)) {
        continue;
      }

      if (selectedLocations.length > 0 && selectedLocations.length < CAMPUS_PRESETS.length) {
        const matchesSelected = selectedLocations.some((locId) => {
          const preset = CAMPUS_PRESETS.find((p) => p.id === locId);
          return preset ? venueMatchesPreset(venueCode, buildingName, roomName, vLat, vLon, preset) : false;
        });
        if (!matchesSelected) {
          continue;
        }
      }

      const dayData = (dayList || []).find((d) => (d.day || "").toLowerCase() === selectedDay.toLowerCase());
      const rawClasses = dayData?.classes || [];
      
      const classesToday = rawClasses.filter(cls => {
        if (cls.weeks && typeof cls.weeks === 'object' && cls.weeks.start && cls.weeks.end) {
          return targetDateStr >= cls.weeks.start && targetDateStr <= cls.weeks.end;
        }
        return true;
      });

      const computedAvail = {};
      TIME_SLOTS.forEach(slot => computedAvail[slot] = "vacant");
      classesToday.forEach(cls => {
        const start = cls.startTime || "0000";
        const end = cls.endTime || "0000";
        TIME_SLOTS.forEach(slot => {
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
          const tMin = parseInt(selectedTime.slice(0, 2), 10) * 60 + parseInt(selectedTime.slice(2), 10);
          const oMin = parseInt(occupiedSlot.slice(0, 2), 10) * 60 + parseInt(occupiedSlot.slice(2), 10);
          freeMinutes = Math.max(0, oMin - tMin);
        } else {
          const tMin = parseInt(selectedTime.slice(0, 2), 10) * 60 + parseInt(selectedTime.slice(2), 10);
          freeMinutes = Math.max(0, 22 * 60 - tMin);
        }
      }

      if (showOnlyFree && !isVacantNow) continue;
      if (minDuration > 0 && freeMinutes < minDuration) continue;

      let distanceM = null;
      let walkMins = null;
      if (effectiveCoords && vLat !== null && vLon !== null) {
        distanceM = Math.round(distanceInMetres(effectiveCoords.lat, effectiveCoords.lon, vLat, vLon));
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
        rawAvail: computedAvail,
        classesToday,
      });
    }

    list.sort((a, b) => {
      const aStarred = starredVenues.includes(a.venueCode) ? -1 : 1;
      const bStarred = starredVenues.includes(b.venueCode) ? -1 : 1;
      if (aStarred !== bStarred) return aStarred - bStarred;

      if (effectiveCoords) {
        if (a.distanceM === null) return 1;
        if (b.distanceM === null) return -1;
        return a.distanceM - b.distanceM;
      }
      return a.venueCode.localeCompare(b.venueCode);
    });

    return list.slice(0, 100);
  }, [venuesData, locationsData, buildingCentroids, selectedDay, selectedTime, searchQuery, showOnlyFree, minDuration, effectiveCoords, selectedLocations, starredVenues]);

  return (
    <div className="vf-container">
      {/* Search and Filters Header */}
      <div className="vf-header">
        <div className="vf-search-bar">
          <Search size={18} className="vf-search-icon" />
          <input
            type="text"
            className="vf-search-input"
            placeholder="Search rooms, buildings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="vf-filters-row">
          <div className="vf-filter-group">
            <select className="vf-select" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select className="vf-select" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>{formatTimeSlot(t)}</option>
              ))}
            </select>
            <select className="vf-select" value={minDuration} onChange={(e) => setMinDuration(Number(e.target.value))}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button 
              className={`vf-filter-btn ${showOnlyFree ? "active" : ""}`}
              onClick={() => setShowOnlyFree(!showOnlyFree)}
            >
              Available only
            </button>
          </div>

          <div className="vf-filter-group">
            {/* Campus Locations Dropdown */}
            <div className="vf-dropdown-wrapper" ref={locationDropdownRef}>
              <button
                type="button"
                className={`vf-filter-btn vf-dropdown-trigger ${selectedLocations.length > 0 ? "active" : ""}`}
                onClick={() => setIsLocationDropdownOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isLocationDropdownOpen}
              >
                <MapPin size={14} />
                <span>{dropdownButtonLabel}</span>
                <ChevronDown size={14} className={`vf-dropdown-chevron ${isLocationDropdownOpen ? "open" : ""}`} />
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
                        Select all
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
                        <label key={p.id} className={`vf-dropdown-item ${isChecked ? "selected" : ""}`}>
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

            <button className={`vf-filter-btn ${userCoords ? "active" : ""}`} onClick={handleUseCurrentLocation}>
              {isLocating ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />}
              {locationLabel || "Near me"}
            </button>
            {userCoords && (
              <button className="vf-icon-btn" onClick={() => { setUserCoords(null); setLocationLabel(""); }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Active Location Filter Badges */}
        {selectedLocations.length > 0 && selectedLocations.length < CAMPUS_PRESETS.length && (
          <div className="vf-active-locations">
            <span className="vf-active-locations-label">Filtering locations:</span>
            {selectedLocations.map((locId) => {
              const p = CAMPUS_PRESETS.find((item) => item.id === locId);
              if (!p) return null;
              return (
                <span key={p.id} className="vf-location-pill">
                  {p.name}
                  <button
                    type="button"
                    className="vf-location-pill-remove"
                    onClick={() => toggleLocation(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              className="vf-location-pill-clear"
              onClick={clearAllLocations}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      {isLoading ? (
        <div className="vf-empty-state">
          <Loader2 size={24} className="spin" />
          <p>Loading campus venues...</p>
        </div>
      ) : processedVenues.length === 0 ? (
        <div className="vf-empty-state">
          <DoorOpen size={32} />
          <p>No rooms found matching your criteria.</p>
        </div>
      ) : (
        <div className="vf-grid">
          {processedVenues.map((v) => (
            <div key={v.venueCode} className="vf-card" onClick={() => setInspectedVenue(v)}>
              <div className="vf-card-header">
                <div>
                  <h3 className="vf-card-title">{v.venueCode}</h3>
                  <p className="vf-card-subtitle">{v.roomName}</p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {v.distanceM !== null && (
                    <div className="vf-card-distance">
                      <MapPin size={12} />
                      {v.distanceM < 1000 ? `${v.distanceM}m` : `${(v.distanceM / 1000).toFixed(1)}km`}
                    </div>
                  )}
                  <button 
                    className="vf-icon-btn" 
                    onClick={(e) => toggleStar(v.venueCode, e)}
                    title={starredVenues.includes(v.venueCode) ? "Remove from favorites" : "Add to favorites"}
                    style={{ padding: 0, width: '24px', height: '24px', flex: 'none' }}
                  >
                    <Star size={14} fill={starredVenues.includes(v.venueCode) ? "var(--warning)" : "none"} color={starredVenues.includes(v.venueCode) ? "var(--warning)" : "currentColor"} />
                  </button>
                </div>
              </div>
              
              <div className="vf-timeline-bars">
                {TIME_SLOTS.map((slot) => {
                  const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                  const isSelected = slot === selectedTime;
                  
                  let currentClass = null;
                  if (!isVacant) {
                    currentClass = v.classesToday.find(c => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot);
                  }

                  let tooltip = isVacant ? "Available" : "Occupied";
                  if (currentClass) {
                    tooltip = `${currentClass.moduleCode} ${currentClass.lessonType}\n${formatTimeSlot(currentClass.startTime)} - ${formatTimeSlot(currentClass.endTime)}\n${formatWeeks(currentClass.weeks)}`;
                  } else if (isVacant) {
                    // For vacant block, show the time of the block
                    const endMin = parseInt(slot.slice(0, 2), 10) * 60 + parseInt(slot.slice(2), 10) + 30;
                    const endHour = Math.floor(endMin / 60).toString().padStart(2, "0");
                    const endMinute = (endMin % 60).toString().padStart(2, "0");
                    tooltip = `Available \n${formatTimeSlot(slot)} - ${endHour}:${endMinute}`;
                  }

                  return (
                    <div
                      key={slot}
                      className={`vf-t-block ${isVacant ? "free" : "occupied"} ${isSelected ? "selected" : ""}`}
                      onMouseEnter={(e) => {
                        const rect = e.target.getBoundingClientRect();
                        setTooltipData({
                          text: tooltip,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                        });
                      }}
                      onMouseLeave={() => setTooltipData(null)}
                      onClick={(e) => { e.stopPropagation(); setSelectedTime(slot); }}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {inspectedVenue && (
        <div className="vf-modal-overlay" onClick={() => setInspectedVenue(null)}>
          <div className="vf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vf-modal-header">
              <div>
                <h2 className="vf-modal-title">{inspectedVenue.venueCode}</h2>
                <p className="vf-modal-subtitle">{inspectedVenue.buildingName}</p>
              </div>
              <button className="vf-icon-btn" onClick={() => setInspectedVenue(null)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="vf-modal-body">
              {inspectedVenue.latitude && inspectedVenue.longitude && (
                <div style={{ marginBottom: "20px" }}>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${inspectedVenue.latitude},${inspectedVenue.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vf-filter-btn"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <ExternalLink size={14} />
                    Open in Google Maps
                  </a>
                </div>
              )}
              <div className="vf-detail-section">
                <h4 className="vf-detail-heading">Schedule ({selectedDay})</h4>
                {inspectedVenue.classesToday.length === 0 ? (
                  <p className="vf-detail-text">No classes scheduled.</p>
                ) : (
                  <div className="vf-schedule-list">
                    {inspectedVenue.classesToday
                      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
                      .map((cls, i) => (
                        <div key={i} className="vf-schedule-item">
                          <span className="vf-schedule-time">{formatTimeSlot(cls.startTime)} - {formatTimeSlot(cls.endTime)}</span>
                          <div className="vf-schedule-info">
                            <span className="vf-schedule-module">{cls.moduleCode} ({cls.lessonType})</span>
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
    
      {tooltipData && (
        <div
          style={{
            position: 'fixed',
            left: tooltipData.x,
            top: tooltipData.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--surface-warm)',
            border: '1px solid var(--border-strong)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            color: 'var(--text-h)',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            zIndex: 99999,
            boxShadow: 'var(--shadow)',
            lineHeight: '1.4',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {tooltipData.text}
        </div>
      )}
</div>
  );
}
