const fs = require("fs");

let content = fs.readFileSync("src/components/VenueFinder.jsx", "utf8");

// Insert formatWeeks function
const formatWeeksFunc = `
function formatWeeks(weeks) {
  if (!weeks) return "Regular schedule";
  if (Array.isArray(weeks)) {
    if (weeks.length === 0) return "";
    const sorted = [...weeks].sort((a,b)=>a-b);
    let isContiguous = true;
    for(let i=1; i<sorted.length; i++) {
      if (sorted[i] !== sorted[i-1] + 1) isContiguous = false;
    }
    if (isContiguous) return \`Weeks \${sorted[0]}-\${sorted[sorted.length-1]}\`;
    return \`Weeks: \${sorted.join(', ')}\`;
  }
  if (typeof weeks === 'object') {
    if (weeks.start && weeks.end) {
      return \`\${weeks.start} to \${weeks.end}\`;
    }
    if (weeks.weeks && Array.isArray(weeks.weeks)) {
      return formatWeeks(weeks.weeks);
    }
    return JSON.stringify(weeks);
  }
  return String(weeks);
}

export default function VenueFinder({ token }) {`;
content = content.replace("export default function VenueFinder({ token }) {", formatWeeksFunc);

// Replace timeline bars rendering
const oldTimelineBars = `<div className="vf-timeline-bars" title="08:00 - 22:00">
                {TIME_SLOTS.map((slot) => {
                  const state = v.rawAvail[slot] || "vacant";
                  const isSelected = slot === selectedTime;
                  return (
                    <div
                      key={slot}
                      className={\`vf-t-block \${state === "vacant" ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                    />
                  );
                })}
              </div>`;

const newTimelineBars = `<div className="vf-timeline-bars">
                {(() => {
                  const segments = [];
                  let currentSegment = null;

                  TIME_SLOTS.forEach((slot) => {
                    const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                    
                    let currentClass = null;
                    if (!isVacant) {
                      currentClass = v.classesToday.find(c => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot);
                    }
                    
                    const stateId = isVacant ? "vacant" : (currentClass ? currentClass.moduleCode + currentClass.startTime : "occupied");

                    if (!currentSegment || currentSegment.stateId !== stateId) {
                      if (currentSegment) segments.push(currentSegment);
                      currentSegment = {
                        stateId,
                        isVacant,
                        classInfo: currentClass,
                        slots: [slot],
                        length: 1
                      };
                    } else {
                      currentSegment.slots.push(slot);
                      currentSegment.length += 1;
                    }
                  });
                  if (currentSegment) segments.push(currentSegment);

                  return segments.map((seg, idx) => {
                    const isSelected = seg.slots.includes(selectedTime);
                    let tooltip = seg.isVacant ? "Available" : "Occupied";
                    if (seg.classInfo) {
                      const cls = seg.classInfo;
                      tooltip = \`\${cls.moduleCode} \${cls.lessonType}\\n\${formatTimeSlot(cls.startTime)} - \${formatTimeSlot(cls.endTime)}\\n\${formatWeeks(cls.weeks)}\`;
                    }

                    return (
                      <div
                        key={idx}
                        className={\`vf-t-segment \${seg.isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                        style={{ flex: seg.length }}
                        title={tooltip}
                      />
                    );
                  });
                })()}
              </div>`;

content = content.replace(oldTimelineBars, newTimelineBars);

// Update class details in the modal list to include the weeks information
const oldScheduleItem = `<div key={i} className="vf-schedule-item">
                          <span className="vf-schedule-time">{formatTimeSlot(cls.startTime)} - {formatTimeSlot(cls.endTime)}</span>
                          <span className="vf-schedule-module">{cls.moduleCode} ({cls.lessonType})</span>
                        </div>`;

const newScheduleItem = `<div key={i} className="vf-schedule-item">
                          <span className="vf-schedule-time">{formatTimeSlot(cls.startTime)} - {formatTimeSlot(cls.endTime)}</span>
                          <div className="vf-schedule-info">
                            <span className="vf-schedule-module">{cls.moduleCode} ({cls.lessonType})</span>
                            <span className="vf-schedule-weeks">{formatWeeks(cls.weeks)}</span>
                          </div>
                        </div>`;

content = content.replace(oldScheduleItem, newScheduleItem);

fs.writeFileSync("src/components/VenueFinder.jsx", content);

// Now update CSS
let css = fs.readFileSync("src/index.css", "utf8");

const oldCss = `/* Timeline Visual Strip */
.vf-timeline-bars {
  display: flex;
  height: 12px;
  gap: 2px;
  margin-top: 16px;
  border-radius: 4px;
  overflow: hidden;
}

.vf-t-block {
  flex: 1;
  background: var(--border-strong);
}

.vf-t-block.free {
  background: color-mix(in srgb, var(--success) 35%, transparent);
}

.vf-t-block.occupied {
  background: color-mix(in srgb, var(--warning) 40%, transparent);
}

.vf-t-block.selected {
  position: relative;
  z-index: 1;
}

.vf-t-block.selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid var(--text-h);
  border-radius: 2px;
}`;

const newCss = `/* Timeline Visual Strip */
.vf-timeline-bars {
  display: flex;
  height: 14px;
  gap: 1px;
  margin-top: 16px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--border);
}

.vf-t-segment {
  height: 100%;
  transition: opacity 0.15s;
}

.vf-t-segment.free {
  background: color-mix(in srgb, var(--success) 60%, transparent);
}

.vf-t-segment.occupied {
  background: color-mix(in srgb, var(--warning) 60%, transparent);
}

.vf-t-segment:hover {
  opacity: 0.8;
}

.vf-t-segment.selected {
  position: relative;
  z-index: 1;
}

.vf-t-segment.selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1.5px solid var(--text-h);
  border-radius: 2px;
}

.vf-schedule-info {
  display: flex;
  flex-direction: column;
}
.vf-schedule-weeks {
  font-size: 11px;
  color: var(--text-muted);
}
`;

css = css.replace(oldCss, newCss);
fs.writeFileSync("src/index.css", css);
