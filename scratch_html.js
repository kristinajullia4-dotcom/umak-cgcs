const fs = require('fs');
const path = require('path');

const htmlFile = path.join(__dirname, 'umak-cgcs_UPDATEDFILE', 'public', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');

const lines = html.split('\n');
console.log('HTML Lines:', lines.length);

// Extract sidebar nav items or role sections
lines.forEach((line, idx) => {
  if (line.includes('data-view') || line.includes('nav-item') || line.includes('id="tab-') || line.includes('id="section-') || line.includes('data-role')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
