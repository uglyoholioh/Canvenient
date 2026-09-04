const fs = require('fs');
const lines = fs.readFileSync('/Users/oli/.gemini/antigravity/brain/cad25b13-ca92-454e-b284-8c43dd21378f/.system_generated/logs/transcript_full.jsonl', 'utf8').split('\n');
let found = false;
for (const line of lines) {
  if (!line) continue;
  const data = JSON.parse(line);
  if (data.step_index === 15 && data.type === 'GENERIC') {
     let content = data.content;
     content = content.replace(/^Created At:.*?\nCompleted At:.*?\n\nThe command exited with code 0\.\nOutput:\n/, '');
     fs.writeFileSync('/tmp/WorkspaceLayout_from_1911.jsx', content);
     console.log('Saved WorkspaceLayout!');
     found = true;
     break;
  }
}
if (!found) console.log("Not found step 15");
