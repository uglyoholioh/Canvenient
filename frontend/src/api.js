const AUTH_TOKEN_KEY = "canvenient.auth.token"

function getErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage
  }

  if (typeof payload.detail === "string") {
    return payload.detail
  }

  if (typeof payload.message === "string") {
    return payload.message
  }

  return fallbackMessage
}

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = {}

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return null
  }

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json")
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Request failed."))
  }

  return payload
}

export function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || ""
}

export function persistToken(token) {
  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    return
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearStoredToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

export function register(credentials) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: credentials,
  })
}

export function login(credentials) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: credentials,
  })
}

export function getCurrentUser(token) {
  return apiRequest("/auth/me", { token })
}

export function updateProfile(token, payload) {
  return apiRequest("/auth/profile", {
    method: "PATCH",
    body: payload,
    token,
  })
}

export function getCategories(token) {
  return apiRequest("/categories", { token })
}

export function createCategory(token, payload) {
  return apiRequest("/categories", {
    method: "POST",
    body: payload,
    token,
  })
}

export function deleteCategory(token, categoryId) {
  return apiRequest(`/categories/${categoryId}`, {
    method: "DELETE",
    token,
  })
}

export function getAcademicModules(token) {
  return apiRequest("/academic-modules", { token })
}

export function createAcademicModule(token, payload) {
  return apiRequest("/academic-modules", {
    method: "POST",
    body: payload,
    token,
  })
}

export function deleteAcademicModule(token, moduleId) {
  return apiRequest(`/academic-modules/${moduleId}`, {
    method: "DELETE",
    token,
  })
}

export function getTasks(token) {
  return apiRequest("/tasks", { token })
}

export function createTask(token, payload) {
  return apiRequest("/tasks", {
    method: "POST",
    body: payload,
    token,
  })
}

export function updateTask(token, taskId, payload) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
    token,
  })
}

export function deleteTask(token, taskId) {
  return apiRequest(`/tasks/${taskId}`, {
    method: "DELETE",
    token,
  })
}

export function syncCanvasTasks(token) {
  return apiRequest("/tasks/sync-canvas", {
    method: "POST",
    token,
  })
}

export function getCanvasCourses(token) {
  return apiRequest(`/canvas/courses`, { token }
  )
}

export function getCanvasAnnouncements(token) {
  return apiRequest(`/canvas/announcements`, { token })
}

export function getCanvasAssignments(token) {
  return apiRequest(`/canvas/assignments`, { token })
}

export function getCanvasFiles(token, courseId) {
  return apiRequest(`/canvas/files?course_id=` + courseId, { token })
}
