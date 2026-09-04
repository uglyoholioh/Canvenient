const fs = require('fs');

let content = fs.readFileSync('src/components/VenueFinder.jsx', 'utf8');

// 1. Add tooltip state
const stateHookPos = content.indexOf('const [inspectedVenue, setInspectedVenue] = useState(null);');
const stateInject = `const [inspectedVenue, setInspectedVenue] = useState(null);
  const [tooltipData, setTooltipData] = useState(null);
`;
content = content.substring(0, stateHookPos) + stateInject + content.substring(stateHookPos + 'const [inspectedVenue, setInspectedVenue] = useState(null);'.length);

// 2. Add onMouseEnter and onMouseLeave to the vf-t-block elements
const blockDiv = `className={\`vf-t-block \${isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                      title={tooltip}
                      onClick={(e) => { e.stopPropagation(); setSelectedTime(slot); }}
                      style={{ cursor: 'pointer' }}`;

const newBlockDiv = `className={\`vf-t-block \${isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                      onMouseEnter={(e) => {
                        const rect = e.target.getBoundingClientRect();
                        setTooltipData({
                          text: tooltip,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                        });
                      }}
                      onMouseLeave={() => setTooltipData(null)}
                      onClick={(e) => { e.stopPropagation(); setSelectedTime(slot); }}
                      style={{ cursor: 'pointer' }}`;

content = content.replace(blockDiv, newBlockDiv);

// 3. Inject the tooltip rendering right before the final closing </div>
const closingDivPos = content.lastIndexOf('</div>');
const tooltipRender = `
      {tooltipData && (
        <div
          style={{
            position: 'fixed',
            left: tooltipData.x,
            top: tooltipData.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--surface-warm)',
            border: '1px solid var(--border-strong)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            color: 'var(--text-h)',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            zIndex: 99999,
            boxShadow: 'var(--shadow)',
            lineHeight: '1.4',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {tooltipData.text}
        </div>
      )}
`;

content = content.substring(0, closingDivPos) + tooltipRender + content.substring(closingDivPos);

fs.writeFileSync('src/components/VenueFinder.jsx', content);
