const CANVAS_ORIGIN = "https://canvas.nus.edu.sg";

export function extractCanvasLinks(html = "") {
  if (!html || typeof DOMParser === "undefined") return [];
  const seen = new Set();
  return Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("a[href]"))
    .map((anchor) => {
      try {
        const href = new URL(anchor.getAttribute("href"), CANVAS_ORIGIN);
        if (!/^https?:$/.test(href.protocol)) return null;
        return { href: href.toString(), label: anchor.textContent.trim() || href.hostname };
      } catch {
        return null;
      }
    })
    .filter((link) => link && !seen.has(link.href) && seen.add(link.href));
}

export function moduleItemExternalUrl(item) {
  const value = item?.external_url || item?.html_url || "";
  return /^https?:\/\//i.test(value) ? value : "";
}
