// Washed ISB service tones — the first letter of the service code maps to a
// pastel the way the actual routes read on campus signage. Unknown services
// get a stable pick from the same set.

const TONES = [
  { match: /^A/i, color: "#d98a70" }, // A1, A2 — coral
  { match: /^D/i, color: "#93a8c4" }, // D1, D2 — sky
  { match: /^C/i, color: "#8aa98c" }, // C — sage
  { match: /^E/i, color: "#c2a265" }, // E — amber
  { match: /^K/i, color: "#b3a3c9" }, // K — lilac
];

const FALLBACK = ["#b3a3c9", "#93a8c4", "#8aa98c", "#c2a265", "#d98a70"];

export function serviceTone(service) {
  const code = String(service || "");
  for (const tone of TONES) {
    if (tone.match.test(code)) return tone.color;
  }
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return FALLBACK[Math.abs(hash) % FALLBACK.length];
}
