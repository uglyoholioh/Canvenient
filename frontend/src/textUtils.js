export function stripHtml(html = "") {
  if (!html) return "";
  try {
    const withBreaks = html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/(p|div|tr|h[1-6])\s*>/gi, "\n\n")
      .replace(/<\s*li\s*>/gi, "\n• ")
      .replace(/<\s*\/li\s*>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    const raw = doc.body.innerText || doc.body.textContent || "";
    return raw
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}
