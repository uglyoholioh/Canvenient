// Schedule card voice — how a class block dresses on the week grid:
//   slab      the colour is the card (flat module colour, luminance-picked ink)
//   registrar quiet print — hue reduced to a dot, type does the work
//   wash      the soft tint, refined (today's default material, tick bar gone)
// Stored locally like the theme; a change broadcasts "settings-updated" so an
// open Schedule view re-dresses without a reload.

export const SCHEDULE_CARD_STYLES = ["slab", "registrar", "wash"];

export function getScheduleCardStyle() {
  const value = localStorage.getItem("canvenient-sched-cards");
  return SCHEDULE_CARD_STYLES.includes(value) ? value : "slab";
}

export function setScheduleCardStyle(style) {
  localStorage.setItem("canvenient-sched-cards", style);
  window.dispatchEvent(new CustomEvent("settings-updated"));
}
