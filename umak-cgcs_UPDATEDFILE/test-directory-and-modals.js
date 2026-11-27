const http = require('http');
const fs = require('fs');
const assert = require('assert');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log("=== Testing Backend Directory Endpoints ===");

  // 1. All users
  const resAll = await get('http://localhost:3000/api/users');
  console.log(`GET /api/users: status ${resAll.status}, total users: ${resAll.body.users ? resAll.body.users.length : 0}`);
  assert.strictEqual(resAll.status, 200);
  assert(Array.isArray(resAll.body.users) && resAll.body.users.length > 0);

  // 2. Role filter: students
  const resStudents = await get('http://localhost:3000/api/users?role=student');
  console.log(`GET /api/users?role=student: status ${resStudents.status}, count: ${resStudents.body.users.length}`);
  assert(resStudents.body.users.every(u => u.role === 'student'));

  // 3. Role filter: counselors
  const resCounselors = await get('http://localhost:3000/api/users?role=counselor');
  console.log(`GET /api/users?role=counselor: status ${resCounselors.status}, count: ${resCounselors.body.users.length}`);
  assert(resCounselors.body.users.every(u => u.role.toLowerCase() === 'counselor'));

  // 4. College filter: CCIS
  const resCCIS = await get('http://localhost:3000/api/users?role=student&college=CCIS');
  console.log(`GET /api/users?role=student&college=CCIS: status ${resCCIS.status}, count: ${resCCIS.body.users.length}`);
  assert(resCCIS.body.users.every(u => u.college.toUpperCase() === 'CCIS'));

  // 5. Search filter
  const resSearch = await get('http://localhost:3000/api/users?search=counselor');
  console.log(`GET /api/users?search=counselor: status ${resSearch.status}, count: ${resSearch.body.users.length}`);
  assert(resSearch.body.users.length > 0);

  // 6. Single user profile
  const sampleUser = resAll.body.users[0];
  const resProfile = await get(`http://localhost:3000/api/users/${sampleUser.id}`);
  console.log(`GET /api/users/${sampleUser.id}: status ${resProfile.status}, name: ${resProfile.body.user.name}, contact: ${resProfile.body.user.contact}`);
  assert.strictEqual(resProfile.status, 200);
  assert(resProfile.body.user.name);
  assert(resProfile.body.user.contact !== undefined);

  console.log("=== Testing Frontend HTML Structure ===");
  const html = fs.readFileSync('./public/index.html', 'utf8');

  // Modal IDs
  assert(html.includes('id="userProfileModal"'), 'Missing userProfileModal');
  assert(html.includes('id="modalProfileInitials"'), 'Missing modalProfileInitials');
  assert(html.includes('id="modalProfileName"'), 'Missing modalProfileName');
  assert(html.includes('id="modalProfileId"'), 'Missing modalProfileId');
  assert(html.includes('id="modalProfileRoleBadge"'), 'Missing modalProfileRoleBadge');
  assert(html.includes('id="modalProfileCollege"'), 'Missing modalProfileCollege');
  assert(html.includes('id="modalProfileEmail"'), 'Missing modalProfileEmail');
  assert(html.includes('id="modalProfileContact"'), 'Missing modalProfileContact');
  assert(html.includes('id="modalProfileDate"'), 'Missing modalProfileDate');

  // Director section IDs
  assert(html.includes('id="directorUserManagementSection"'), 'Missing directorUserManagementSection');
  assert(html.includes('id="dirTabStudents"'), 'Missing dirTabStudents');
  assert(html.includes('id="dirTabCounselors"'), 'Missing dirTabCounselors');
  assert(html.includes('id="dirSearchInput"'), 'Missing dirSearchInput');
  assert(html.includes('id="dirCollegeSelectWrapper"'), 'Missing dirCollegeSelectWrapper');
  assert(html.includes('id="dirCollegeSelect"'), 'Missing dirCollegeSelect');
  assert(html.includes('id="dirDeptTh"'), 'Missing dirDeptTh');
  assert(html.includes('id="directorTableBody"'), 'Missing directorTableBody');

  // Counselor section IDs
  assert(html.includes('id="counselorDirectorySection"'), 'Missing counselorDirectorySection');
  assert(html.includes('id="counsSearchInput"'), 'Missing counsSearchInput');
  assert(html.includes('id="counsCollegeSelect"'), 'Missing counsCollegeSelect');
  assert(html.includes('id="counselorTableBody"'), 'Missing counselorTableBody');

  console.log("=== Testing JavaScript Implementation ===");
  const js = fs.readFileSync('./public/app.js', 'utf8');

  assert(js.includes('switchDirectorRole'), 'Missing switchDirectorRole');
  assert(js.includes('fetchAndRenderUsers'), 'Missing fetchAndRenderUsers');
  assert(js.includes('loadDirectorUsers'), 'Missing loadDirectorUsers');
  assert(js.includes('debounceDirSearch'), 'Missing debounceDirSearch');
  assert(js.includes('loadCounselorDirectory'), 'Missing loadCounselorDirectory');
  assert(js.includes('debounceCounsSearch'), 'Missing debounceCounsSearch');
  assert(js.includes('openUserProfileModal'), 'Missing openUserProfileModal');
  assert(js.includes('closeUserProfileModal'), 'Missing closeUserProfileModal');
  assert(js.includes("tabId === 'counselor-directory'"), 'Missing tabId counselor-directory hook');
  assert(js.includes("tabId === 'admin-users'"), 'Missing tabId admin-users hook');

  console.log("\n>>> ALL DIRECTORY & PROFILE MODAL TESTS PASSED! <<<");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
