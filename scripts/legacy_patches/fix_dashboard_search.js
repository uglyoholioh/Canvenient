const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/Dashboard.jsx', 'utf8');

content = content.replace(
  'export default function Dashboard({ token, user, onNavigate, onOpenSearch, searchShortcutLabel }) {',
  'export default function Dashboard({ token, user, onNavigate }) {'
);

const searchButton = `            <button type="button" className="mac-toolbar-search dashboard-search" onClick={onOpenSearch}>\n              <Search size={14} />\n              <span>Search for anything…</span>\n              {searchShortcutLabel && <kbd>{searchShortcutLabel}</kbd>}\n            </button>\n`;
content = content.replace(searchButton, '');

fs.writeFileSync('frontend/src/components/Dashboard.jsx', content);
