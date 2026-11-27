const fs = require('fs');
const path = require('path');

const fns = JSON.parse(fs.readFileSync('app_functions.json', 'utf8'));

const studentFns = [];
const counselorFns = [];
const directorFns = [];
const commonFns = [];

fns.forEach(f => {
  const n = f.name.toLowerCase();
  if (n.includes('student') || n.includes('booking') || n.includes('assessment') || n.includes('phq') || n.includes('gad') || n.includes('mood') || n.includes('intake')) {
    studentFns.push(f);
  } else if (n.includes('counselor') || n.includes('queue') || n.includes('triage') || n.includes('soap') || n.includes('referral') || n.includes('delegat')) {
    counselorFns.push(f);
  } else if (n.includes('director') || n.includes('admin') || n.includes('analytics') || n.includes('audit') || n.includes('workload') || n.includes('broadcast')) {
    directorFns.push(f);
  } else {
    commonFns.push(f);
  }
});

console.log('Student functions:', studentFns.map(f => f.name));
console.log('Counselor functions:', counselorFns.map(f => f.name));
console.log('Director functions:', directorFns.map(f => f.name));
console.log('Sample common functions:', commonFns.slice(0, 30).map(f => f.name));
