// The omnibar searches the whole notes+tasks+Canvas corpus client-side, so
// refetching everything on every keystroke would hammer the backend. The
// corpus is cached for a short window and invalidated when tasks change
// elsewhere in the app. Canvas data uses its own longer-lived cache because
// it costs several API calls (courses, assignments, files per course) and
// changes rarely; its first refresh happens in the background so opening the
// omnibar never blocks on Canvas.

import {
  getCanvasAssignments,
  getCanvasCourses,
  getCanvasFiles,
  getCachedApiData,
  getNotes,
  getTasks,
  setCachedApiData,
} from "./api";

export const CORPUS_TTL_MS = 30_000;
const CANVAS_CORPUS_CACHE_KEY = "canvenient.cache.omnibar-canvas";
const CANVAS_CORPUS_TTL_MS = 15 * 60_000;

let corpusCache = null;
let canvasCorpus = null;
let canvasRefreshInFlight = null;

export function invalidateOmnibarCorpus() {
  corpusCache = null;
}

// Test hook: the Canvas refresh tracking is module state, so tests that stub
// the API need a way to clear it between cases.
export function resetOmnibarCanvasStateForTests() {
  corpusCache = null;
  canvasCorpus = null;
  canvasRefreshInFlight = null;
}

function emptyCanvasCorpus() {
  return { courses: [], assignments: [], files: [] };
}

async function refreshCanvasCorpus(token) {
  const courses = (await getCanvasCourses(token).catch(() => [])) || [];
  const [assignments, fileLists] = await Promise.all([
    getCanvasAssignments(token).catch(() => []),
    Promise.all(courses.map((course) => getCanvasFiles(token, course.id).catch(() => []))),
  ]);
  const files = [];
  courses.forEach((course, index) => {
    for (const file of fileLists[index] || []) {
      files.push({
        id: file.id,
        course_id: course.id,
        title: file.display_name || file.filename || "",
        external_url: file.external_url || null,
      });
    }
  });
  return {
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name || "",
      course_code: course.course_code || "",
    })),
    assignments: (assignments || []).map((assignment) => ({
      id: assignment.id,
      course_id: assignment.course_id,
      title: assignment.title || assignment.name || "",
      due_at: assignment.due_at || null,
    })),
    files,
  };
}

// Returns the last-known Canvas corpus immediately and refreshes it in the
// background (one refresh in flight at a time); the refresh invalidates the
// corpus cache so the next keystroke picks the result up.
function loadCanvasCorpus(token) {
  const cached = getCachedApiData(CANVAS_CORPUS_CACHE_KEY, CANVAS_CORPUS_TTL_MS);
  if (cached) {
    canvasCorpus = cached;
    return canvasCorpus;
  }
  if (!canvasRefreshInFlight) {
    canvasRefreshInFlight = refreshCanvasCorpus(token)
      .then((fresh) => {
        canvasCorpus = fresh;
        setCachedApiData(CANVAS_CORPUS_CACHE_KEY, fresh);
        invalidateOmnibarCorpus();
      })
      .catch(() => {})
      .finally(() => {
        canvasRefreshInFlight = null;
      });
  }
  return canvasCorpus || emptyCanvasCorpus();
}

export async function loadCorpus(token) {
  if (
    corpusCache &&
    corpusCache.token === token &&
    Date.now() - corpusCache.fetchedAt < CORPUS_TTL_MS
  ) {
    return corpusCache;
  }
  const [notes, tasks, canvas] = await Promise.all([
    getNotes(token),
    getTasks(token),
    loadCanvasCorpus(token),
  ]);
  corpusCache = { token, notes, tasks, canvas, fetchedAt: Date.now() };
  return corpusCache;
}
