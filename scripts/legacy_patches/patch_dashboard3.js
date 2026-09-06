const fs = require('fs');
const path = 'frontend/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    'export default function Dashboard({ token, user, onNavigate }) {',
    'export default function Dashboard({ token, user, onNavigate, onOpenSearch, searchShortcutLabel }) {'
);

fs.writeFileSync(path, content);
console.log("Patched again!");
