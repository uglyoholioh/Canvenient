const fs = require('fs');

let content = fs.readFileSync('src/components/VenueFinder.jsx', 'utf8');

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
                        style={{ flex: seg.length, cursor: 'pointer' }}
                        title={tooltip}
                        onClick={(e) => { e.stopPropagation(); setSelectedTime(seg.slots[0]); }}
                      />
                    );
                  });
                })()}
              </div>`;

const newTimelineBars = `<div className="vf-timeline-bars">
                {TIME_SLOTS.map((slot) => {
                  const isVacant = (v.rawAvail[slot] || "vacant") === "vacant";
                  const isSelected = slot === selectedTime;
                  
                  let currentClass = null;
                  if (!isVacant) {
                    currentClass = v.classesToday.find(c => (c.startTime || "0000") <= slot && (c.endTime || "0000") > slot);
                  }

                  let tooltip = isVacant ? "Available" : "Occupied";
                  if (currentClass) {
                    tooltip = \`\${currentClass.moduleCode} \${currentClass.lessonType}\\n\${formatTimeSlot(currentClass.startTime)} - \${formatTimeSlot(currentClass.endTime)}\\n\${formatWeeks(currentClass.weeks)}\`;
                  } else if (isVacant) {
                    // For vacant block, show the time of the block
                    const endMin = parseInt(slot.slice(0, 2), 10) * 60 + parseInt(slot.slice(2), 10) + 30;
                    const endHour = Math.floor(endMin / 60).toString().padStart(2, "0");
                    const endMinute = (endMin % 60).toString().padStart(2, "0");
                    tooltip = \`Available \\n\${formatTimeSlot(slot)} - \${endHour}:\${endMinute}\`;
                  }

                  return (
                    <div
                      key={slot}
                      className={\`vf-t-block \${isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                      title={tooltip}
                      onClick={(e) => { e.stopPropagation(); setSelectedTime(slot); }}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </div>`;

content = content.replace(oldTimelineBars, newTimelineBars);
fs.writeFileSync('src/components/VenueFinder.jsx', content);

let css = fs.readFileSync('src/index.css', 'utf8');

const oldCssBars = `/* Timeline Visual Strip */
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
}`;

const newCssBars = `/* Timeline Visual Strip */
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
  transition: opacity 0.15s;
}

.vf-t-block.free {
  background: color-mix(in srgb, var(--success) 35%, transparent);
}

.vf-t-block.occupied {
  background: color-mix(in srgb, var(--warning) 40%, transparent);
}

.vf-t-block:hover {
  opacity: 0.7;
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

css = css.replace(oldCssBars, newCssBars);
fs.writeFileSync('src/index.css', css);

