const AUTH_TOKEN_KEY = "canvenient.auth.token";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const isPackagedDesktopApp = window.location.protocol === "tauri:";

// Vite's development server proxies relative API calls to FastAPI. A packaged
// Tauri app has no Vite proxy, so it must contact its bundled sidecar directly.
const API_BASE_URL = configuredApiBaseUrl
  || (isPackagedDesktopApp ? "http://127.0.0.1:8000" : "");

// The packaged Python sidecar can need several seconds on first launch to
// initialize its data directory and database. Keep retries bounded, but long
// enough that the first login request does not surface a false connection error.
const DESKTOP_STARTUP_RETRIES = 48;
const DESKTOP_RETRY_DELAY_MS = 100;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithDesktopStartupRetry(url, options) {
  const attempts = isPackagedDesktopApp ? DESKTOP_STARTUP_RETRIES + 1 : 1;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        break;
      }
      await wait(DESKTOP_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

// In-flight request deduplication for concurrent GET requests
const inFlightRequests = new Map();

// Auth
function getErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  // FastAPI returns request-validation failures as an array. Turn that into a
  // compact, useful message instead of hiding the field that needs attention
  // behind a bare "Request failed (422)".
  if (Array.isArray(payload.detail)) {
    const details = payload.detail
      .map((issue) => {
        if (!issue || typeof issue !== "object" || typeof issue.msg !== "string") return "";
        const location = Array.isArray(issue.loc)
          ? issue.loc.filter((part) => part !== "body").join(".")
          : "";
        return location ? `${location}: ${issue.msg}` : issue.msg;
      })
      .filter(Boolean);

    if (details.length > 0) return details.join(" ");
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallbackMessage;
}

async function executeApiRequest(path, { method = "GET", body, token } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = buildUrl(path);
  let response;
  try {
    response = await fetchWithDesktopStartupRetry(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Could not connect to server at ${url}. Please check your backend connection.`,
      { cause: err },
    );
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let payload = null;
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (payload) {
      throw new Error(
        getErrorMessage(payload, `Request failed (${response.status}).`),
      );
    }
    if (contentType.includes("text/html")) {
      throw new Error(
        `Request to backend failed (${response.status}). Received HTML response instead of JSON. Ensure VITE_API_BASE_URL is configured correctly in your deployment settings.`,
      );
    }
    throw new Error(`Request failed (${response.status}).`);
  }

  if (!payload && isJson) {
    throw new Error("Server returned an empty or invalid JSON response.");
  }

  if (!payload && !isJson && response.status !== 204) {
    throw new Error(
      "Received non-JSON response from server. Please verify that VITE_API_BASE_URL points to your live backend API URL.",
    );
  }

  return payload;
}

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (method === "GET") {
    const dedupeKey = `${path}::${options.token || ""}`;
    if (inFlightRequests.has(dedupeKey)) {
      return inFlightRequests.get(dedupeKey);
    }
    const promise = executeApiRequest(path, options).finally(() => {
      inFlightRequests.delete(dedupeKey);
    });
    inFlightRequests.set(dedupeKey, promise);
    return promise;
  }
  return executeApiRequest(path, options);
}

// Storage helpers for stale-while-revalidate client-side caching
export function getCachedApiData(key, ttlMs) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp) return null;
    if (ttlMs && Date.now() - parsed.timestamp > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedApiData(key, data) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {}
}

export function clearCachedApiData(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function persistToken(token) {
  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function register(credentials) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: credentials,
  });
}

export function login(credentials) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export function getCurrentUser(token) {
  return apiRequest("/auth/me", { token });
}

export function updateProfile(token, payload) {
  return apiRequest("/auth/profile", {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function getTelegramLink(token) {
  return apiRequest("/telegram/link", { token });
}

export function claimTelegramLink(token, code) {
  return apiRequest("/telegram/claim", {
    method: "POST",
    body: { code },
    token,
  });
}

export function unlinkTelegram(token) {
  return apiRequest("/telegram/link", { method: "DELETE", token });
}

export function getCategories(token) {
  return apiRequest("/categories", { token });
}

export function createCategory(token, payload) {
  return apiRequest("/categories", {
    method: "POST",
    body: payload,
    token,
  });
}

export function deleteCategory(token, categoryId) {
  return apiRequest(`/categories/${categoryId}`, {
    method: "DELETE",
    token,
  });
}

const ACADEMIC_MODULES_CACHE_KEY = "canvenient.academic_modules";

export function getAcademicModules(token) {
  try {
    const cached = window.sessionStorage.getItem(ACADEMIC_MODULES_CACHE_KEY);
    if (cached) return Promise.resolve(JSON.parse(cached));
  } catch {}

  return apiRequest("/academic-modules", { token }).then((data) => {
    try {
      window.sessionStorage.setItem(ACADEMIC_MODULES_CACHE_KEY, JSON.stringify(data));
    } catch {}
    return data;
  });
}

export function updateAcademicModuleSelection(token, moduleIds) {
  try {
    window.sessionStorage.removeItem(ACADEMIC_MODULES_CACHE_KEY);
  } catch {}
  return apiRequest("/academic-modules/selection", {
    method: "PUT",
    body: { module_ids: moduleIds.map(Number) },
    token,
  });
}

export function getModuleColors(token) {
  return apiRequest("/module-colors", { token });
}

export function applyModulePalette(token, palette) {
  return apiRequest("/module-colors/palette", {
    method: "PUT",
    body: { palette },
    token,
  });
}

export function updateModuleColor(token, moduleCode, color) {
  return apiRequest(`/module-colors/${encodeURIComponent(moduleCode)}`, {
    method: "PATCH",
    body: { color },
    token,
  });
}

export const TASKS_CACHE_KEY = "canvenient.cache.tasks";

export function getTasks(token, { groupId, filter } = {}) {
  const params = new URLSearchParams();
  if (groupId != null) params.set("group_id", groupId);
  if (filter) params.set("filter", filter);
  const qs = params.toString();
  const request = apiRequest(`/tasks${qs ? `?${qs}` : ""}`, { token });
  
  // Cache the default general task list
  if (groupId == null && !filter) {
    request.then((tasks) => {
      if (Array.isArray(tasks)) {
        setCachedApiData(TASKS_CACHE_KEY, tasks);
      }
    }).catch(() => {});
  }
  return request;
}

export function getGroupTasks(token, groupId) {
  return apiRequest(`/groups/${groupId}/tasks`, { token });
}

export function createTask(token, payload) {
  return apiRequest("/tasks", {
    method: "POST",
    body: payload,
    token,
  }).then((task) => {
    clearCachedApiData(TASKS_CACHE_KEY);
    return task;
  });
}

export function updateTask(token, taskId, payload) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
    token,
  }).then((task) => {
    clearCachedApiData(TASKS_CACHE_KEY);
    return task;
  });
}

export function deleteTask(token, taskId) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "DELETE",
    token,
  }).then((res) => {
    clearCachedApiData(TASKS_CACHE_KEY);
    return res;
  });
}

//Canvas

export function syncCanvasTasks(token) {
  return apiRequest("/tasks/sync-canvas", {
    method: "POST",
    token,
  });
}

export function getCanvasCourses(token, forceRefresh = false) {
  const query = forceRefresh ? "?force_refresh=true" : "";
  return apiRequest(`/canvas/courses${query}`, { token });
}

export function getCanvasAnnouncements(token, forceRefresh = false) {
  const query = forceRefresh ? "?force_refresh=true" : "";
  return apiRequest(`/canvas/announcements${query}`, { token });
}

export function dismissCanvasAnnouncement(token, announcementId) {
  return apiRequest("/canvas/announcements/dismiss", {
    method: "POST",
    body: { announcement_id: announcementId },
    token,
  });
}

export function getCanvasAssignments(token, forceRefresh = false) {
  const query = forceRefresh ? "?force_refresh=true" : "";
  return apiRequest(`/canvas/assignments${query}`, { token });
}

export function getCanvasAssignment(token, courseId, assignmentId) {
  return apiRequest(`/canvas/assignments/${assignmentId}?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function submitCanvasAssignment(token, courseId, assignmentId, payload) {
  return apiRequest(`/canvas/assignments/${assignmentId}/submit?course_id=${encodeURIComponent(courseId)}`, {
    method: "POST",
    body: payload,
    token,
  });
}

export function getCanvasGrades(token, courseId) {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
  return apiRequest(`/canvas/grades${query}`, { token });
}

export function getCanvasFiles(token, courseId) {
  return apiRequest(`/canvas/files?course_id=` + encodeURIComponent(courseId), { token });
}

export function getCanvasFolders(token, courseId) {
  return apiRequest(`/canvas/folders?course_id=` + encodeURIComponent(courseId), { token });
}

// Canvas download URLs expire quickly, so file content always goes through
// the backend proxy, which resolves a fresh signed URL per request.
function filenameFromDisposition(header) {
  if (!header) return "";
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {}
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : "";
}

export async function fetchCanvasFileContent(token, fileId) {
  const url = buildUrl(`/canvas/files/${fileId}/content`);
  let response;
  try {
    response = await fetchWithDesktopStartupRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    throw new Error(`Could not connect to server at ${url}. Please check your backend connection.`, { cause: error });
  }
  if (!response.ok) {
    const payload = (response.headers.get("content-type") || "").includes("application/json") ? await response.json().catch(() => null) : null;
    throw new Error(getErrorMessage(payload, `Could not load the file (${response.status}).`));
  }
  const blob = await response.blob();
  return {
    blob,
    contentType: (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim(),
    filename: filenameFromDisposition(response.headers.get("content-disposition")),
  };
}

export async function downloadCanvasFile(token, fileId, fallbackName = "canvas-file") {
  const { blob, filename } = await fetchCanvasFileContent(token, fileId);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename || fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

export function getCanvasCourseNavigation(token, courseId) {
  return apiRequest(`/canvas/navigation?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function getCanvasPages(token, courseId) {
  return apiRequest(`/canvas/pages?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function getCanvasPage(token, courseId, pageUrl) {
  return apiRequest(`/canvas/pages/${encodeURIComponent(pageUrl)}?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function getCanvasCourseModules(token, courseId) {
  return apiRequest(`/canvas/modules?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function getCanvasSyllabus(token, courseId) {
  return apiRequest(`/canvas/syllabus?course_id=${encodeURIComponent(courseId)}`, { token });
}

export function searchCanvasResources(token, query, limit = 30) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiRequest(`/canvas/resource-search?${params.toString()}`, { token });
}

export function syncCanvasResourceIndex(token) {
  return apiRequest("/canvas/resource-index", {
    method: "POST",
    token,
  });
}

export function getCachedCanvasFiles(token) {
  return apiRequest("/canvas/cached-files", { token });
}

export function syncCanvasFiles(token) {
  return apiRequest("/canvas/sync-files", {
    method: "POST",
    token,
  });
}

export function validateCanvasToken(token, canvasToken) {
  return apiRequest("/canvas/validate-token", {
    method: "POST",
    body: { token: canvasToken },
    token,
  });
}

export async function loadCachedCanvasFiles(token, { onSyncRequired } = {}) {
  let data = await getCachedCanvasFiles(token);
  const needsCurrentCourseSnapshot =
    !data.synced_at ||
    ((data.files || []).length > 0 && (data.courses || []).length === 0);

  if (needsCurrentCourseSnapshot) {
    onSyncRequired?.();
    data = await syncCanvasFiles(token);
  }

  return data;
}

// Schedule

export async function importIcs(token, file, fileName = "timetable.ics") {
  const formData = new FormData();
  const upload = file instanceof Blob ? file : new Blob([file], { type: "text/calendar" });
  formData.append("file", upload, file.name || fileName);
  const url = buildUrl("/schedule/import/ics");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch {
    throw new Error(
      `Could not connect to server at ${url}. Please check your backend connection.`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  let payload = null;
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `Failed to import schedule (${response.status}).`));
  }

  if (!payload && !isJson) {
    throw new Error("Received non-JSON response from server when importing schedule.");
  }

  return payload;
}

export const SCHEDULE_CACHE_KEY = "canvenient.cache.schedule";

export function importNusmods(token, url) {
  return apiRequest("/schedule/import/nusmods", {
    method: "POST",
    body: { url },
    token,
  }).then((res) => {
    clearCachedApiData(SCHEDULE_CACHE_KEY);
    return res;
  });
}

export function getSchedule(token) {
  const request = apiRequest("/schedule", { token });
  request.then((schedule) => {
    if (schedule && typeof schedule === "object") {
      setCachedApiData(SCHEDULE_CACHE_KEY, schedule);
    }
  }).catch(() => {});
  return request;
}

export function getClassContext(token, classId, occurrenceDate) {
  return apiRequest(`/schedule/classes/${classId}/context?occurrence_date=${encodeURIComponent(occurrenceDate)}`, { token });
}

export function updateClass(token, classId, payload) {
  return apiRequest(`/schedule/classes/${classId}`, {
    method: "PATCH",
    body: payload,
    token,
  }).then((res) => {
    clearCachedApiData(SCHEDULE_CACHE_KEY);
    return res;
  });
}

export async function uploadClassFile(token, classId, occurrenceDate, file, isRecurring = false) {
  const formData = new FormData();
  formData.append("file", file, file.name || "attachment");
  const path = `/schedule/classes/${classId}/files?occurrence_date=${encodeURIComponent(occurrenceDate)}${isRecurring ? "&is_recurring=true" : ""}`;
  const url = buildUrl(path);
  let response;
  try {
    response = await fetchWithDesktopStartupRetry(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch (error) {
    throw new Error(`Could not connect to server at ${url}. Please check your backend connection.`, { cause: error });
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok) throw new Error(getErrorMessage(payload, `Could not attach the file (${response.status}).`));
  if (!payload) throw new Error("Server returned an empty or invalid JSON response.");
  return payload;
}

export async function downloadClassFile(token, fileId) {
  const url = buildUrl(`/schedule/class-files/${fileId}`);
  let response;
  try {
    response = await fetchWithDesktopStartupRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    throw new Error(`Could not connect to server at ${url}. Please check your backend connection.`, { cause: error });
  }
  if (!response.ok) {
    const payload = (response.headers.get("content-type") || "").includes("application/json") ? await response.json().catch(() => null) : null;
    throw new Error(getErrorMessage(payload, `Could not download the file (${response.status}).`));
  }
  return response.blob();
}

export function getCampusBusStops(token) {
  return apiRequest("/campus-bus/stops", { token });
}

export function getCampusBusArrivals(token, stop) {
  return apiRequest(`/campus-bus/arrivals?stop=${encodeURIComponent(stop)}`, { token });
}

export function searchCampusBusPlaces(token, query) {
  return apiRequest(`/campus-bus/places?q=${encodeURIComponent(query)}`, { token });
}

export function planCampusBusTrip(token, trip) {
  return apiRequest("/campus-bus/trips", {
    method: "POST",
    body: trip,
    token,
  });
}

export function getEvents(token) {
  return apiRequest("/events", { token });
}

export function createEvent(token, payload) {
  return apiRequest("/events", {
    method: "POST",
    body: payload,
    token,
  });
}

export function updateEvent(token, eventId, payload) {
  return apiRequest(`/events/${eventId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteEvent(token, eventId) {
  return apiRequest(`/events/${eventId}`, {
    method: "DELETE",
    token,
  });
}

export function updateEventAttendance(token, eventId, isAttending) {
  return apiRequest(`/events/${eventId}/attendance`, {
    method: "POST",
    body: { is_attending: isAttending },
    token,
  });
}

export function getEventAttendance(token, eventId) {
  return apiRequest(`/events/${eventId}/attendance`, { token });
}

export function getEventAttendanceSummary(token, eventId) {
  return apiRequest(`/events/${eventId}/attendance-summary`, { token });
}

export function markEventActualAttendance(token, eventId, userId, attended) {
  return apiRequest(`/events/${eventId}/attendance-mark`, {
    method: "POST",
    body: { user_id: userId, attended },
    token,
  });
}

// Communities, groups, invites, and forms

export function getCommunities(token) {
  return apiRequest("/communities", { token });
}

export function createCommunity(token, payload) {
  return apiRequest("/communities", {
    method: "POST",
    body: payload,
    token,
  });
}

export function getGroups(token) {
  return apiRequest("/groups", { token });
}

export function createGroup(token, payload) {
  return apiRequest("/groups", {
    method: "POST",
    body: payload,
    token,
  });
}

export function getGroupMembers(token, groupId) {
  return apiRequest(`/groups/${groupId}/members`, { token });
}

export function createInvite(token, payload) {
  return apiRequest("/invites", {
    method: "POST",
    body: payload,
    token,
  });
}

export function joinGroup(token, code) {
  return apiRequest(`/invites/join/${encodeURIComponent(code)}`, {
    method: "POST",
    token,
  });
}

export function getForms(token) {
  return apiRequest("/forms", { token });
}

export function getForm(token, formId) {
  return apiRequest(`/forms/${formId}`, { token });
}

export function createForm(token, payload) {
  return apiRequest("/forms", {
    method: "POST",
    body: payload,
    token,
  });
}

export function submitFormResponse(token, formId, responseData) {
  return apiRequest(`/forms/${formId}/responses`, {
    method: "POST",
    body: { response_data: responseData },
    token,
  });
}

export function getFormResponses(token, formId) {
  return apiRequest(`/forms/${formId}/responses`, { token });
}

export function getFormStats(token, formId) {
  return apiRequest(`/forms/${formId}/stats`, { token });
}

// Notifications

export function getNotifications(token) {
  return apiRequest("/notifications", { token });
}

export function markNotificationAsRead(token, notificationId) {
  return apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH",
    token,
  });
}

export function markAllNotificationsAsRead(token) {
  return apiRequest("/notifications/read-all", {
    method: "POST",
    token,
  });
}

export function getAiBrief(token, forceRefresh = false, timeframe = "this_week") {
  const params = new URLSearchParams();
  if (forceRefresh) params.append("force_refresh", "true");
  if (timeframe) params.append("timeframe", timeframe);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/ai/brief${query}`, {
    method: "POST",
    token,
  });
}

export function sendAiChat(token, payload) {
  return apiRequest("/ai/chat", {
    method: "POST",
    body: payload,
    token,
  });
}

// Study timer
export function getStudySessions(token) {
  return apiRequest("/study-sessions", { token });
}

export function createStudySession(token, payload) {
  return apiRequest("/study-sessions", { method: "POST", body: payload, token });
}

export function completeStudySession(token, sessionId, payload) {
  return apiRequest(`/study-sessions/${sessionId}/complete`, {
    method: "PATCH", body: payload, token,
  });
}

export function cancelStudySession(token, sessionId) {
  return apiRequest(`/study-sessions/${sessionId}/cancel`, { method: "PATCH", token });
}

export function getStudySummary(token) {
  return apiRequest("/study-sessions/summary", { token });
}

export function getStudyLeaderboard(token, period = "week") {
  return apiRequest(`/study-sessions/leaderboard?period=${period}`, { token });
}

export function getNotes(token) { return apiRequest("/notes", { token }); }
export function createNote(payload, token) { return apiRequest("/notes", { method: "POST", body: payload, token }); }
export function updateNote(noteId, payload, token) { return apiRequest(`/notes/${noteId}`, { method: "PATCH", body: payload, token }); }
export function deleteNote(noteId, token) { return apiRequest(`/notes/${noteId}`, { method: "DELETE", token }); }

export function getFolders(token) { return apiRequest("/folders", { token }); }
export function createFolder(payload, token) { return apiRequest("/folders", { method: "POST", body: payload, token }); }
export function updateFolder(id, payload, token) { return apiRequest(`/folders/${id}`, { method: "PATCH", body: payload, token }); }
export function deleteFolder(id, token) { return apiRequest(`/folders/${id}`, { method: "DELETE", token }); }

export function getStoredUser() {
  const user = window.localStorage.getItem("canvenient.user");
  return user ? JSON.parse(user) : null;
}

export function persistUser(user) {
  window.localStorage.setItem("canvenient.user", JSON.stringify(user));
}

export function syncCanvasAssignments(token) {
  return apiRequest("/tasks/sync-canvas", {
    method: "POST",
    token,
  });
}

// Venues & Free Room Finder
export async function getVenueInformation(token, { academicYear, semester } = {}) {
  const params = new URLSearchParams();
  if (academicYear) params.set("academic_year", academicYear);
  if (semester) params.set("semester", semester);
  const q = params.toString() ? `?${params.toString()}` : "";
  
  const cacheKey = `canvenient.venues.info.${academicYear || 'current'}.${semester || 'current'}`;
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) return data;
    }
  } catch {}

  const data = await apiRequest(`/venues/info${q}`, { token });
  try { window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch {}
  return data;
}

export async function getVenueLocations(token) {
  const cacheKey = "canvenient.venues.locations";
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) return data;
    }
  } catch {}

  const data = await apiRequest("/venues/locations", { token });
  try { window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch {}
  return data;
}

export function searchFreeVenues(token, options = {}) {
  const params = new URLSearchParams();
  if (options.day) params.set("day", options.day);
  if (options.time) params.set("time", options.time);
  if (options.lat !== undefined && options.lat !== null) params.set("lat", options.lat);
  if (options.lon !== undefined && options.lon !== null) params.set("lon", options.lon);
  if (options.faculty) params.set("faculty", options.faculty);
  if (options.building) params.set("building", options.building);
  if (options.query) params.set("query", options.query);
  if (options.minFreeMinutes !== undefined && options.minFreeMinutes !== null) params.set("min_free_minutes", options.minFreeMinutes);
  if (options.onlyFree !== undefined) params.set("only_free", options.onlyFree);
  if (options.sort) params.set("sort", options.sort);
  if (options.academicYear) params.set("academic_year", options.academicYear);
  if (options.semester) params.set("semester", options.semester);
  return apiRequest(`/venues/availability?${params.toString()}`, { token });
}
