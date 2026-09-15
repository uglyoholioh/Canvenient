// Local persistence for the focus timer.
//
// Running state survives app restarts (startedAt + plannedMinutes in
// localStorage). Completed sessions are queued here when the backend is
// unreachable and replayed on the next successful sync; every queued
// session carries a client_id so replaying can never duplicate it.

const RUNNING_KEY = "canvenient.focus.running";
const QUEUE_KEY = "canvenient.focus.queue";
const QUEUE_MAX = 50;

export function newClientId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `cli-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the timer still works, logging just
    // degrades to in-memory.
  }
}

// state: { startedAt: iso, plannedMinutes, moduleId?, taskId? } | null
export function saveRunning(state) {
  writeJson(RUNNING_KEY, state);
}

export function loadRunning() {
  return readJson(RUNNING_KEY, null);
}

export function clearRunning() {
  writeJson(RUNNING_KEY, null);
}

export function enqueueSession(session) {
  const queue = readJson(QUEUE_KEY, []);
  queue.push({ ...session, client_id: session.client_id || newClientId() });
  while (queue.length > QUEUE_MAX) queue.shift();
  writeJson(QUEUE_KEY, queue);
}

export function loadQueue() {
  return readJson(QUEUE_KEY, []);
}

export function storeQueue(queue) {
  writeJson(QUEUE_KEY, queue);
}

// Attempts to flush queued sessions; returns the ones that still failed.
export async function flushQueue(createSession, token) {
  const queue = loadQueue();
  if (!queue.length) return [];
  const remaining = [];
  for (const session of queue) {
    try {
      await createSession(token, session);
    } catch {
      remaining.push(session);
    }
  }
  storeQueue(remaining);
  return remaining;
}
