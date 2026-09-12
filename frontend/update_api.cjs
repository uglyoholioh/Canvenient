const fs = require("fs");

let content = fs.readFileSync("src/api.js", "utf8");

const oldGetVenueInfo = `export function getVenueInformation(token, { academicYear, semester } = {}) {
  const params = new URLSearchParams();
  if (academicYear) params.set("academic_year", academicYear);
  if (semester) params.set("semester", semester);
  const q = params.toString() ? \`?\${params.toString()}\` : "";
  return apiRequest(\`/venues/info\${q}\`, { token });
}`;

const newGetVenueInfo = `export async function getVenueInformation(token, { academicYear, semester } = {}) {
  const params = new URLSearchParams();
  if (academicYear) params.set("academic_year", academicYear);
  if (semester) params.set("semester", semester);
  const q = params.toString() ? \`?\${params.toString()}\` : "";
  
  const cacheKey = \`canvenient.venues.info.\${academicYear || 'current'}.\${semester || 'current'}\`;
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) return data;
    }
  } catch (e) {}

  const data = await apiRequest(\`/venues/info\${q}\`, { token });
  try { window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch (e) {}
  return data;
}`;

content = content.replace(oldGetVenueInfo, newGetVenueInfo);

const oldGetVenueLoc = `export function getVenueLocations(token) {
  return apiRequest("/venues/locations", { token });
}`;

const newGetVenueLoc = `export async function getVenueLocations(token) {
  const cacheKey = "canvenient.venues.locations";
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) return data;
    }
  } catch (e) {}

  const data = await apiRequest("/venues/locations", { token });
  try { window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch (e) {}
  return data;
}`;

content = content.replace(oldGetVenueLoc, newGetVenueLoc);

fs.writeFileSync("src/api.js", content);
