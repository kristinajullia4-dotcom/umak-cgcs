const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'umak-cgcs_UPDATEDFILE', 'server.js');
const content = fs.readFileSync(serverFile, 'utf8');

const lines = content.split('\n');
const routes = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]\s*,\s*(.*)/);
  if (m) {
    let nextLines = line;
    let j = i;
    while (!nextLines.includes('=>') && !nextLines.includes('function') && j < i + 5 && j < lines.length - 1) {
      j++;
      nextLines += ' ' + lines[j].trim();
    }
    
    // Check middleware
    let middlewares = [];
    if (nextLines.includes('authenticateJWT') || nextLines.includes('authenticateToken') || nextLines.includes('requireAuth')) middlewares.push('auth');
    if (nextLines.includes('optionalAuth')) middlewares.push('optionalAuth');
    if (nextLines.includes('requireDirector')) middlewares.push('director');
    if (nextLines.includes('requireCounselorOrAdmin')) middlewares.push('counselor/director');
    if (nextLines.includes("requireRole('student')")) middlewares.push('student');
    if (nextLines.includes("requireRole('counselor')")) middlewares.push('counselor');
    if (nextLines.includes("requireRole('superadmin')")) middlewares.push('superadmin');
    
    routes.push({
      line: i + 1,
      method: m[1].toUpperCase(),
      path: m[2],
      signature: nextLines.substring(0, 100).replace(/\s+/g, ' '),
      mw: middlewares.join(', ') || 'public'
    });
  }
}

fs.writeFileSync(path.join(__dirname, 'routes_summary.txt'), routes.map(r => `${r.line.toString().padStart(4)} | ${r.method.padEnd(6)} | ${r.path.padEnd(50)} | ${r.mw.padEnd(20)} | ${r.signature}`).join('\n'));
console.log('Saved ' + routes.length + ' routes to routes_summary.txt');

