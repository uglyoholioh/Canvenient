const fs = require("fs");

let content = fs.readFileSync("src/components/VenueFinder.jsx", "utf8");

const oldTimelineBars = `<div className="vf-timeline-bars">
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
              </div>
              <div className="vf-timeline-labels">
                <span>08:00</span>
                <span>21:30</span>
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
                    
                    const startTimeStr = formatTimeSlot(seg.slots[0]);
                    const lastSlot = seg.slots[seg.slots.length - 1];
                    const endMin = parseInt(lastSlot.slice(0, 2), 10) * 60 + parseInt(lastSlot.slice(2), 10) + 30;
                    const endHour = Math.floor(endMin / 60).toString().padStart(2, "0");
                    const endMinute = (endMin % 60).toString().padStart(2, "0");
                    const endTimeStr = \`\${endHour}:\${endMinute}\`;

                    let tooltip = \`\${seg.isVacant ? 'Available' : 'Occupied'} \\n\${startTimeStr} - \${endTimeStr}\`;
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

fs.writeFileSync("src/components/VenueFinder.jsx", content);

// Also remove .vf-timeline-labels from index.css
let css = fs.readFileSync("src/index.css", "utf8");
const labelsCss = `.vf-timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}`;
css = css.replace(labelsCss, "");
fs.writeFileSync("src/index.css", css);
