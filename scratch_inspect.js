const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'umak-cgcs_UPDATEDFILE', 'public', 'app.js');
const app = fs.readFileSync(appFile, 'utf8');

const roleRegex = /(?:role|user\.role|currentUser\.role|sessionUser\.role)\s*===?\s*['"]([^'"]+)['"]/g;
let m;
const roles = new Set();
while ((m = roleRegex.exec(app)) !== null) {
  roles.add(m[1]);
}
console.log('Roles found:', Array.from(roles));

// Check navigation elements and role tabs
const navMatches = [];
const lines = app.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('nav-item') || line.includes('tab') || line.includes('role') || line.includes('view-') || line.includes('section-')) {
    if (line.toLowerCase().includes('student') || line.toLowerCase().includes('counselor') || line.toLowerCase().includes('director') || line.toLowerCase().includes('admin')) {
      if (line.includes('display') || line.includes('style') || line.includes('classList') || line.includes('show') || line.includes('hide')) {
        navMatches.push(`${idx + 1}: ${line.trim()}`);
      }
    }
  }
});

console.log('Sample role-based visibility lines:', navMatches.slice(0, 30));
