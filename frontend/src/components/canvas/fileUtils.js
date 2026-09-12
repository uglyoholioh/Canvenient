// Shared pure helpers for the Canvas views.

export function stripHtml(v = "") {
  const n = document.createElement("div");
  n.innerHTML = v;
  return n.textContent || "";
}

export function getFileType(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "img";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "vid";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md"].includes(ext)) return "doc";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "zip";
  return "other";
}

export function formatSize(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.ceil(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export function relDate(str) {
  if (!str) return "";
  const d = new Date(str),
    now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function dueLabel(str) {
  if (!str) return "No due date";
  const d = new Date(str),
    now = new Date();
  const diff = d - now;
  if (diff < 0) return "Past due";
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `Due in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  return `Due ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// ─── Files Browser Component with Tree View ───────────────────────────────────
