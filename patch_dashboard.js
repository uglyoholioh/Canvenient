const fs = require('fs');
const path = 'frontend/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const module = modules[moduleId];',
  'const module = modules[moduleId];\n    if (!module) return null;'
);

fs.writeFileSync(path, content);
console.log("Patched Dashboard.jsx!");
