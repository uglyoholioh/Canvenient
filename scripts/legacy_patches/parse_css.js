const fs = require('fs');
const css = fs.readFileSync('frontend/src/index.css', 'utf8');
const rules = css.match(/[^}]+\{[^{}]+\}/g);
if (rules) {
  rules.forEach(rule => {
    if (rule.includes('module-view-full')) {
      console.log(rule.trim());
    }
  });
}
