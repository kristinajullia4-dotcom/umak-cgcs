const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'umak-cgcs_UPDATEDFILE', 'public', 'app.js');
const app = fs.readFileSync(appFile, 'utf8');

// Find function declarations and role blocks
const fnMatches = [];
const lines = app.split('\n');
lines.forEach((line, idx) => {
  const m = line.match(/^(\s*(?:async\s+)?function\s+([a-zA-Z0-9_]+)|window\.([a-zA-Z0-9_]+)\s*=)/);
  if (m) {
    const fnName = m[2] || m[3];
    fnMatches.push({ line: idx + 1, name: fnName });
  }
});

console.log('Total functions found:', fnMatches.length);
fs.writeFileSync('app_functions.json', JSON.stringify(fnMatches, null, 2));
