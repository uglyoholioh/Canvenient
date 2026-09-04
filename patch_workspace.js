const fs = require('fs');
const path = 'frontend/src/components/WorkspaceLayout.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '<header className="mac-workspace-toolbar" data-tauri-drag-region>',
  '{activeTab !== "dashboard" && (<header className="mac-workspace-toolbar" data-tauri-drag-region>'
);

// We want to replace the SECOND </header> or specifically the one closing mac-workspace-toolbar
// It is at line 398 in HEAD
content = content.replace(
  '          </div>\n        </header>',
  '          </div>\n        </header>)}'
);

fs.writeFileSync(path, content);
console.log("Patched WorkspaceLayout!");
