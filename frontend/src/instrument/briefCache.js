// The brief is slow and expensive to make, and the dashboard must never open
// on an empty note. The last good payload survives tab switches and app
// relaunches; a stale one is refreshed quietly while the old words stay up.

import { getAssistantBrief } from "../api";

const KEY = "canvenient.cache.brief";
export const BRIEF_REFRESH_MS = 5 * 60 * 1000; // quietly re-ask after this
export const BRIEF_MAX_AGE_MS = 30 * 60 * 1000; // …and mark it stale after this

export function readBriefCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw?.brief) return raw;
  } catch {
    // fall through to nothing
  }
  return null;
}

export function writeBriefCache(brief) {
  if (!brief) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ brief, at: Date.now() }));
  } catch {
    // storage full or unavailable — the in-memory copy still works
  }
}

export function briefAge(entry, now = Date.now()) {
  return now - (entry?.at || 0);
}

export function shouldRefetch(entry, now = Date.now()) {
  return !entry || briefAge(entry, now) > BRIEF_REFRESH_MS;
}

// Mount-time orchestrator: shows the cache immediately, refreshes in the
// background only when it is worth asking again, and keeps the old words
// visible if the network says no.
export async function loadBrief(token, { force = false } = {}) {
  const cached = readBriefCache();
  if (!force && cached && !shouldRefetch(cached)) {
    return { brief: cached.brief, fromCache: true };
  }
  try {
    const brief = await getAssistantBrief(token, force);
    if (brief) writeBriefCache(brief);
    return { brief: brief || cached?.brief || null, fromCache: false };
  } catch {
    return { brief: cached?.brief || null, fromCache: true, failed: true };
  }
}
