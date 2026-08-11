const AUTH_TOKEN_KEY = "canvenient.auth.token";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

// Auth
function getErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallbackMessage;
}

async function apiRequest(path, { method = "GET", body, token } = {}) {
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
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Could not connect to server at ${url}. Please check your backend connection.`,
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

export function getAcademicModules(token) {
  return apiRequest("/academic-modules", { token });
}

export function getTasks(token) {
  return apiRequest("/tasks", { token });
}

export function createTask(token, payload) {
  return apiRequest("/tasks", {
    method: "POST",
    body: payload,
    token,
  });
}

export function updateTask(token, taskId, payload) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteTask(token, taskId) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "DELETE",
    token,
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

export function getCanvasAssignments(token, forceRefresh = false) {
  const query = forceRefresh ? "?force_refresh=true" : "";
  return apiRequest(`/canvas/assignments${query}`, { token });
}

export function getCanvasFiles(token, courseId) {
  return apiRequest(`/canvas/files?course_id=` + courseId, { token });
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

export async function importIcs(token, file) {
  const formData = new FormData();
  formData.append("file", file);
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

export function getSchedule(token) {
  return apiRequest("/schedule", { token });
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

export function getAiBrief(token, forceRefresh = false) {
  const query = forceRefresh ? "?force_refresh=true" : "";
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
