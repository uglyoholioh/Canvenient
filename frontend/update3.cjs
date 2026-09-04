const fs = require('fs');

let content = fs.readFileSync('src/components/VenueFinder.jsx', 'utf8');

// 1. Add Star to lucide-react imports
content = content.replace('Search,', 'Search,\n  Star,');

// 2. Add starredVenues state
const stateHookPos = content.indexOf('const [inspectedVenue, setInspectedVenue] = useState(null);');
const stateInject = `const [inspectedVenue, setInspectedVenue] = useState(null);
  
  const [starredVenues, setStarredVenues] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("canvenient.venues.starred") || "[]");
    } catch(e) { return []; }
  });

  const toggleStar = (venueCode, e) => {
    e.stopPropagation();
    let newStarred;
    if (starredVenues.includes(venueCode)) {
      newStarred = starredVenues.filter(c => c !== venueCode);
    } else {
      newStarred = [...starredVenues, venueCode];
    }
    setStarredVenues(newStarred);
    try { window.localStorage.setItem("canvenient.venues.starred", JSON.stringify(newStarred)); } catch(e) {}
  };
`;
content = content.substring(0, stateHookPos) + stateInject + content.substring(stateHookPos + 'const [inspectedVenue, setInspectedVenue] = useState(null);'.length);

// 3. Update the sorting logic to account for starredVenues
const sortLogic = `list.sort((a, b) => {
      if (userCoords) {
        if (a.distanceM === null) return 1;
        if (b.distanceM === null) return -1;
        return a.distanceM - b.distanceM;
      }
      return a.venueCode.localeCompare(b.venueCode);
    });`;

const newSortLogic = `list.sort((a, b) => {
      const aStarred = starredVenues.includes(a.venueCode) ? -1 : 1;
      const bStarred = starredVenues.includes(b.venueCode) ? -1 : 1;
      if (aStarred !== bStarred) return aStarred - bStarred;

      if (userCoords) {
        if (a.distanceM === null) return 1;
        if (b.distanceM === null) return -1;
        return a.distanceM - b.distanceM;
      }
      return a.venueCode.localeCompare(b.venueCode);
    });`;

content = content.replace(sortLogic, newSortLogic);

// 4. Update the card header to include the Star button
const cardHeader = `<div className="vf-card-header">
                <div>
                  <h3 className="vf-card-title">{v.venueCode}</h3>
                  <p className="vf-card-subtitle">{v.roomName}</p>
                </div>
                {v.distanceM !== null && (
                  <div className="vf-card-distance">
                    <MapPin size={12} />
                    {v.distanceM < 1000 ? \`\${v.distanceM}m\` : \`\${(v.distanceM / 1000).toFixed(1)}km\`}
                  </div>
                )}
              </div>`;

const newCardHeader = `<div className="vf-card-header">
                <div>
                  <h3 className="vf-card-title">{v.venueCode}</h3>
                  <p className="vf-card-subtitle">{v.roomName}</p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {v.distanceM !== null && (
                    <div className="vf-card-distance">
                      <MapPin size={12} />
                      {v.distanceM < 1000 ? \`\${v.distanceM}m\` : \`\${(v.distanceM / 1000).toFixed(1)}km\`}
                    </div>
                  )}
                  <button 
                    className="vf-icon-btn" 
                    onClick={(e) => toggleStar(v.venueCode, e)}
                    title={starredVenues.includes(v.venueCode) ? "Remove from favorites" : "Add to favorites"}
                    style={{ padding: 0, width: '24px', height: '24px', flex: 'none' }}
                  >
                    <Star size={14} fill={starredVenues.includes(v.venueCode) ? "var(--warning)" : "none"} color={starredVenues.includes(v.venueCode) ? "var(--warning)" : "currentColor"} />
                  </button>
                </div>
              </div>`;

content = content.replace(cardHeader, newCardHeader);

// 5. Update timeline scrubbing (onClick on vf-t-segment)
const segmentDiv = `return (
                      <div
                        key={idx}
                        className={\`vf-t-segment \${seg.isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                        style={{ flex: seg.length }}
                        title={tooltip}
                      />
                    );`;
                    
const newSegmentDiv = `return (
                      <div
                        key={idx}
                        className={\`vf-t-segment \${seg.isVacant ? "free" : "occupied"} \${isSelected ? "selected" : ""}\`}
                        style={{ flex: seg.length, cursor: 'pointer' }}
                        title={tooltip}
                        onClick={(e) => { e.stopPropagation(); setSelectedTime(seg.slots[0]); }}
                      />
                    );`;

content = content.replace(segmentDiv, newSegmentDiv);

// 6. Make sure starredVenues is a dependency of the useMemo
content = content.replace('minDuration, userCoords]);', 'minDuration, userCoords, starredVenues]);');

fs.writeFileSync('src/components/VenueFinder.jsx', content);

