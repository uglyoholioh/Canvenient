export const WHEEL_PALETTE = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#84cc16", // Lime
  "#e11d48", // Rose
  "#0ea5e9", // Sky
];

export const DEFAULT_FOOD_OPTIONS = [
  { id: "food-1", label: "The Deck (Arts / FASS)", tag: "Arts", enabled: true },
  { id: "food-2", label: "Techno Edge (Engineering)", tag: "Engineering", enabled: true },
  { id: "food-3", label: "Frontier Canteen (Science)", tag: "Science", enabled: true },
  { id: "food-4", label: "Fine Food (UTown)", tag: "UTown", enabled: true },
  { id: "food-5", label: "Flavours @ UTown", tag: "UTown", enabled: true },
  { id: "food-6", label: "The Terrace (Computing COM3)", tag: "Computing", enabled: true },
  { id: "food-7", label: "PGPR Aircon Food Court", tag: "PGPR", enabled: true },
  { id: "food-8", label: "Hwang's Korean Restaurant", tag: "UTown", enabled: true },
  { id: "food-9", label: "SuperSnacks", tag: "UTown", enabled: true },
  { id: "food-10", label: "Waa Cow! (UTown)", tag: "UTown", enabled: true },
  { id: "food-11", label: "Central Square (YIH)", tag: "YIH", enabled: true },
  { id: "food-12", label: "Reedz Cafe (Business)", tag: "Business", enabled: true },
  { id: "food-13", label: "Sapore Italiano (UTown)", tag: "UTown", enabled: true },
  { id: "food-14", label: "Pasta Express (Frontier)", tag: "Science", enabled: true },
  { id: "food-15", label: "Subway (YIH / UTown)", tag: "Campus", enabled: true },
  { id: "food-16", label: "Maxx Coffee / Starbucks", tag: "Campus", enabled: true },
];

export const DEFAULT_MODULE_OPTIONS = [
  { id: "mod-1", label: "CS1101S Programming Methodology", tag: "Computing", enabled: true },
  { id: "mod-2", label: "CS2030S Programming Methodology II", tag: "Computing", enabled: true },
  { id: "mod-3", label: "CS2040S Data Structures & Algorithms", tag: "Computing", enabled: true },
  { id: "mod-4", label: "CS2100 Computer Organisation", tag: "Computing", enabled: true },
  { id: "mod-5", label: "CS2103T Software Engineering", tag: "Computing", enabled: true },
  { id: "mod-6", label: "CS3230 Design & Analysis of Algorithms", tag: "Computing", enabled: true },
  { id: "mod-7", label: "MA1521 Calculus for Computing", tag: "Math", enabled: true },
  { id: "mod-8", label: "ST2334 Probability & Statistics", tag: "Math", enabled: true },
  { id: "mod-9", label: "GEA1000 Quantitative Reasoning", tag: "General", enabled: true },
];

export const INITIAL_WHEELS_DATA = {
  activeWheelId: "eat_nus",
  wheels: [
    {
      id: "eat_nus",
      name: "Places to Eat in NUS",
      description: "Where to have your next meal on campus",
      isPreset: true,
      items: DEFAULT_FOOD_OPTIONS,
    },
    {
      id: "study_modules",
      name: "Modules to Study",
      description: "Which module to focus on next",
      isPreset: true,
      items: DEFAULT_MODULE_OPTIONS,
    },
  ],
};

const STORAGE_KEY = "canvenient-wheels-data-v1";

export function loadWheelData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_WHEELS_DATA;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.wheels) || parsed.wheels.length === 0) {
      return INITIAL_WHEELS_DATA;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to load wheel data from localStorage:", error);
    return INITIAL_WHEELS_DATA;
  }
}

export function saveWheelData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("canvenient-wheel-updated", { detail: data }));
  } catch (error) {
    console.error("Failed to save wheel data to localStorage:", error);
  }
}

export function resetWheelPreset(wheelId) {
  if (wheelId === "eat_nus") {
    return {
      id: "eat_nus",
      name: "Places to Eat in NUS",
      description: "Where to have your next meal on campus",
      isPreset: true,
      items: DEFAULT_FOOD_OPTIONS,
    };
  }
  if (wheelId === "study_modules") {
    return {
      id: "study_modules",
      name: "Modules to Study",
      description: "Which module to focus on next",
      isPreset: true,
      items: DEFAULT_MODULE_OPTIONS,
    };
  }
  return null;
}
