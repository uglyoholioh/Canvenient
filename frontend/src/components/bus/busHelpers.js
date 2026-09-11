// Shared constants and pure helpers for the Campus Bus module.

export const STOP_STORAGE_KEY       = "canvenient-isb-stop";
export const FROM_STORAGE_KEY       = "canvenient-isb-from";
export const TO_STORAGE_KEY         = "canvenient-isb-to";
export const FAVOURITES_STORAGE_KEY = "canvenient-isb-favourites";
export const STOPS_CACHE_KEY        = "canvenient-isb-stops-cache";
export const ARRIVALS_PREFIX        = "canvenient-isb-arrivals-cache:";
export const DEFAULT_STOP_ID        = "COM3";
export const STOPS_TTL_MS           = 24 * 60 * 60 * 1000;
export const ARRIVALS_TTL_MS        = 60 * 1000;
export const REFRESH_INTERVAL_S     = 20;

// Popular campus spots for 1-click route planning shortcuts
export const QUICK_POPULAR_PLACES = [
  "University Town",
  "School of Computing",
  "Central Library",
  "Faculty of Science",
  "Business School",
];

// ── Schedule-aware venue → stop hints ────────────────────────────────────────
const VENUE_STOP_HINTS = [
  { pattern: /^(COM\d|AS6|I3)/i,                       stopText: "COM3"      },
  { pattern: /^AS[1-5]/i,                               stopText: "LT13"      },
  { pattern: /^(E[1-9]A?|EA\d?|LT[7-9](?!\d)|LT10)/i, stopText: "LT13A"     },
  { pattern: /^(UTown|ERC|CAPT|RC\d?|Cinnamon)/i,       stopText: "UTown"     },
  { pattern: /^BIZ/i,                                   stopText: "BIZ 2"     },
  { pattern: /^(S\d|LT2\d|YIH)/i,                      stopText: "Opp YIH"   },
  { pattern: /^(MD|NUH|CRC)/i,                          stopText: "MD 1"      },
  { pattern: /^PGP/i,                                   stopText: "PGP"       },
  { pattern: /^YST/i,                                   stopText: "YST"       },
  { pattern: /^(MPSH|SRC|LT19|LT20)/i,                  stopText: "Opp TCOMS" },
];

export function venueToStop(venue) {
  if (!venue) return null;
  for (const hint of VENUE_STOP_HINTS) {
    if (hint.pattern.test(venue.trim())) return hint.stopText;
  }
  return null;
}

// ── Formatting helpers ───────────────────────────────────────────────────────
export function formatEta(minutes) {
  if (minutes === 0) return "Now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatClock(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function serviceTone(service) {
  if (service.startsWith("A")) return "is-a";
  if (service.startsWith("B")) return "is-b";
  if (service.startsWith("C")) return "is-c";
  if (service.startsWith("D")) return "is-d";
  if (service.startsWith("R")) return "is-r";
  if (service === "K") return "is-k";
  if (service === "P") return "is-p";
  return "is-default";
}

export function urgencyFill(minutes) {
  if (minutes == null || minutes > 20) return 0;
  return Math.round((1 - minutes / 20) * 100);
}

// ── Cache helpers ────────────────────────────────────────────────────────────
export function readFavourites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVOURITES_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((s) => typeof s === "string") : [];
  } catch { return []; }
}

export function readCache(key, maxAgeMs) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached || !Number.isFinite(cached.cachedAt) || Date.now() - cached.cachedAt > maxAgeMs) return null;
    return cached.value ?? null;
  } catch { return null; }
}

export function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value }));
  } catch { /* ignore */ }
}

// ── Geo helpers ──────────────────────────────────────────────────────────────
export function distanceInMetres(origin, stop) {
  if (!origin || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return Infinity;
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(stop.latitude - origin.latitude);
  const dLon = rad(stop.longitude - origin.longitude);
  const lat  = rad(origin.latitude);
  const sLat = rad(stop.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat) * Math.cos(sLat) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Stop helpers ─────────────────────────────────────────────────────────────
export function stopLabel(stop) { return stop?.name || stop?.short_name || stop?.id || ""; }
export function normalise(value) { return String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

export function findStop(value, stops) {
  const n = normalise(value);
  if (!n) return null;
  return stops.find((s) =>
    [s.id, s.name, s.short_name].some((c) => normalise(c || "") === n),
  ) ?? null;
}

export function resolvePlace(value, places) {
  const exact = places.find((p) => normalise(p.name) === normalise(value));
  return exact ?? (places.length === 1 ? places[0] : null);
}

// ── Keyboard-navigable Place Input Combobox (From/To) ───────────────────────
