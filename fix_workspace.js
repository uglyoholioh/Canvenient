const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/WorkspaceLayout.jsx', 'utf8');
content = content.replace('          </div>\n        </header>)}', '          </div>\n        </header>');
fs.writeFileSync('frontend/src/components/WorkspaceLayout.jsx', content);
