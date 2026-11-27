const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING COUNSELOR STUDENT DIRECTORY & SIGN-UP FIXES');
  console.log('====================================================\n');

  // 1. Audit DOM inline attributes and elements in public/index.html
  console.log('1. Auditing public/index.html:');
  const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');

  assert.ok(htmlContent.includes('onsubmit="handleUserSignUp(event)"'), 'Must have onsubmit="handleUserSignUp(event)" on sign-up form');
  assert.ok(htmlContent.includes('onclick="openForgotPasswordModal()"'), 'Must have onclick="openForgotPasswordModal()" on forgot password trigger');
  assert.ok(htmlContent.includes('id="tab-counselor-directory"'), 'Must have id="tab-counselor-directory" section');
  assert.ok(htmlContent.includes('id="counselorStudentDirectoryContainer"'), 'Must have #counselorStudentDirectoryContainer');
  assert.ok(htmlContent.includes('id="modalStudentProfile"'), 'Must have #modalStudentProfile');
  assert.ok(htmlContent.includes('id="modalStudentSoapHistory"'), 'Must have #modalStudentSoapHistory');
  console.log('   ✅ PASS: index.html verified for onsubmit, onclick, directory tab, and modals');

  // 2. Audit public/app.js functions
  console.log('\n2. Auditing public/app.js Logic:');
  const appContent = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf-8');

  assert.ok(appContent.includes('window.handleUserSignUp = async function'), 'Must define window.handleUserSignUp');
  assert.ok(appContent.includes('^(09\\d{9}|639\\d{9})$'), 'Must test Philippine mobile regex');
  assert.ok(appContent.includes('window.openForgotPasswordModal = function'), 'Must define window.openForgotPasswordModal');
  assert.ok(appContent.includes('window.loadCounselorStudentDirectory'), 'Must define window.loadCounselorStudentDirectory');
  assert.ok(appContent.includes('window.renderStudentDirectory'), 'Must define window.renderStudentDirectory');
  assert.ok(appContent.includes('window.openStudentProfileModal'), 'Must define window.openStudentProfileModal');
  assert.ok(appContent.includes('window.openStudentSoapHistoryModal'), 'Must define window.openStudentSoapHistoryModal');
  console.log('   ✅ PASS: app.js contains all required global handlers and controllers');

  // 3. Authenticate counselor and student
  console.log('\n3. Authenticating Test Accounts:');
  const counselorRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'counselor@umak.edu.ph', password: 'Password123!' })
  });
  const counselorData = await counselorRes.json();
  assert.strictEqual(counselorRes.status, 200);
  const counselorToken = counselorData.token;
  console.log('   ✅ Counselor authenticated successfully');

  const studentRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'student@umak.edu.ph', password: 'Password123!' })
  });
  const studentData = await studentRes.json();
  assert.strictEqual(studentRes.status, 200);
  const studentToken = studentData.token;
  console.log('   ✅ Student authenticated successfully');

  // 4. Test GET /api/counselor/students Endpoint
  console.log('\n4. Testing GET /api/counselor/students Endpoint:');
  const dirRes = await fetch(`${BASE_URL}/api/counselor/students`, {
    headers: { 'Authorization': `Bearer ${counselorToken}` }
  });
  const dirData = await dirRes.json();
  assert.strictEqual(dirRes.status, 200);
  assert.strictEqual(dirData.success, true);
  assert.ok(Array.isArray(dirData.students), 'Must return array of students');
  assert.ok(dirData.byCollege && typeof dirData.byCollege === 'object', 'Must return byCollege dictionary');
  assert.ok(dirData.students.length > 0, 'Must contain registered students');

  const firstStudent = dirData.students[0];
  assert.ok('student_id' in firstStudent, 'Student must have student_id');
  assert.ok('name' in firstStudent, 'Student must have name');
  assert.ok('college' in firstStudent, 'Student must have college');
  assert.ok('total_sessions' in firstStudent, 'Student must have total_sessions');
  assert.ok('first_session_date' in firstStudent, 'Student must have first_session_date');

  console.log(`   ✅ PASS: Retrieved ${dirData.students.length} students across ${Object.keys(dirData.byCollege).length} colleges`);
  console.log(`   Sample student: ${firstStudent.name} (${firstStudent.college}) - Sessions: ${firstStudent.total_sessions}, First Date: ${firstStudent.first_session_date || 'None'}`);

  // Test Student Access is Blocked
  const blockedRes = await fetch(`${BASE_URL}/api/counselor/students`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert.strictEqual(blockedRes.status, 403, 'Student access must be blocked with HTTP 403');
  console.log('   ✅ PASS: Student access to /api/counselor/students is blocked with HTTP 403');

  // 5. Test GET /api/counselor/students/:id/soap-history
  console.log('\n5. Testing GET /api/counselor/students/:id/soap-history:');
  const soapHistRes = await fetch(`${BASE_URL}/api/counselor/students/${firstStudent.id}/soap-history`, {
    headers: { 'Authorization': `Bearer ${counselorToken}` }
  });
  const soapHistData = await soapHistRes.json();
  assert.strictEqual(soapHistRes.status, 200);
  assert.strictEqual(soapHistData.success, true);
  assert.ok(Array.isArray(soapHistData.notes), 'Must return notes array');
  console.log(`   ✅ PASS: Retrieved SOAP history for ${firstStudent.name} (${soapHistData.totalNotes} notes found)`);

  const studentSoapBlocked = await fetch(`${BASE_URL}/api/counselor/students/${firstStudent.id}/soap-history`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert.strictEqual(studentSoapBlocked.status, 403);
  console.log('   ✅ PASS: Student access to student SOAP history is blocked with HTTP 403');

  // 6. Test Sign-Up Validation & Registration
  console.log('\n6. Testing Sign-Up Registration & Philippine Phone Handling:');
  const randNum = Date.now();
  const validPayload = {
    full_name: 'Dalisay Hernandez',
    student_id: `K120-${randNum.toString().slice(-5)}`,
    email: `dalisay.${randNum}@umak.edu.ph`,
    contact_number: '09181234567',
    college: 'CAL',
    program: 'AB Journalism',
    year_level: '3rd Year',
    password: 'Password@123'
  };

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload)
  });
  const regData = await regRes.json();
  assert.strictEqual(regRes.status, 200);
  assert.strictEqual(regData.success, true);
  assert.ok(regData.requireVerification, 'Must require email OTP verification');
  console.log('   ✅ PASS: Registration succeeds with Philippine phone number and OTP dispatch');

  // Short password rejected
  const shortPassRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validPayload, email: `test.short.${randNum}@umak.edu.ph`, student_id: `K120-00001`, password: '123' })
  });
  const shortPassData = await shortPassRes.json();
  assert.strictEqual(shortPassRes.status, 400);
  assert.strictEqual(shortPassData.success, false);
  console.log(`   ✅ PASS: Short password rejected with 400 (${shortPassData.message})`);

  console.log('\n====================================================');
  console.log('🎉 ALL COUNSELOR DIRECTORY & SIGN-UP TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
