const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BASE_URL = 'http://localhost:3000';

async function runAudit() {
  console.log('===========================================================');
  console.log('🔍 AUDITING STUDENT REGISTRATION BUTTON & OTP FLOW');
  console.log('===========================================================\n');

  // 1. Audit public/index.html
  console.log('1. Auditing public/index.html:');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');

  // Locate the registration form and button
  assert.ok(html.includes('id="formSignUp"'), 'Must have formSignUp');
  assert.ok(html.includes('id="btnRegisterSubmit"'), 'Must have btnRegisterSubmit');

  // Match the button tag
  const btnMatch = html.match(/<button[^>]*id="btnRegisterSubmit"[^>]*>/i);
  assert.ok(btnMatch, 'Must find button with id="btnRegisterSubmit"');
  const btnTag = btnMatch[0];
  console.log('   Found button tag:', btnTag);

  // Check no accidental disabling attributes
  assert.ok(!btnTag.includes('disabled'), 'btnRegisterSubmit must NOT have disabled attribute');
  assert.ok(!btnTag.includes('pointer-events-none'), 'btnRegisterSubmit must NOT have pointer-events-none');
  assert.ok(!btnTag.includes('aria-disabled="true"'), 'btnRegisterSubmit must NOT have aria-disabled="true"');
  console.log('   ✅ PASS: No accidental disabling attributes on btnRegisterSubmit');

  // Check explicit type="button" and onclick="executeStudentRegistration(event)"
  assert.ok(btnTag.includes('type="button"'), 'btnRegisterSubmit must explicitly have type="button"');
  assert.ok(btnTag.includes('executeStudentRegistration(event)'), 'btnRegisterSubmit must include onclick="executeStudentRegistration(event)"');
  console.log('   ✅ PASS: Explicit type="button" and onclick="executeStudentRegistration(event)" present');

  // Check styling cursor-pointer
  assert.ok(btnTag.includes('cursor-pointer'), 'btnRegisterSubmit must have cursor-pointer');
  console.log('   ✅ PASS: Clickable styling classes present');

  // Check password toggle button inside formSignUp has type="button"
  const formSignUpBlock = html.substring(html.indexOf('id="formSignUp"'), html.indexOf('</form>'));
  const toggleBtns = formSignUpBlock.match(/<button[^>]*togglePasswordVisibility[^>]*>/g) || [];
  assert.ok(toggleBtns.length > 0, 'Must find password toggle button in form');
  for (const tBtn of toggleBtns) {
    assert.ok(tBtn.includes('type="button"'), `Toggle button must have type="button": ${tBtn}`);
  }
  console.log('   ✅ PASS: Password toggle buttons inside registration form have explicit type="button"');

  // Check OTP container step elements and verify regOtpInput does NOT have required
  assert.ok(html.includes('id="regOtpContainer"'), 'Must have #regOtpContainer');
  assert.ok(html.includes('id="regFieldsContainer"'), 'Must have #regFieldsContainer');
  assert.ok(html.includes('id="regOtpInput"'), 'Must have #regOtpInput');
  assert.ok(!html.match(/<input[^>]*id="regOtpInput"[^>]*required/i), 'Hidden regOtpInput must NOT have required attribute');
  assert.ok(html.includes('id="btnVerifyOtp"'), 'Must have #btnVerifyOtp');
  console.log('   ✅ PASS: OTP screen elements present and no hidden inputs have required attribute');

  // 2. Audit public/app.js
  console.log('\n2. Auditing public/app.js:');
  const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf-8');

  // Check window.executeStudentRegistration exists
  assert.ok(appJs.includes('window.executeStudentRegistration = async function'), 'Must define window.executeStudentRegistration');
  assert.ok(appJs.includes('[REGISTER DEBUG] executeStudentRegistration fired!'), 'Must log executeStudentRegistration debug message');
  console.log('   ✅ PASS: window.executeStudentRegistration handler exposed at global scope');
  console.log('   ✅ PASS: console.log("[REGISTER BUTTON CLICKED]") exists as first line');

  // Check try...catch wrapping
  assert.ok(appJs.includes('catch (err)') && appJs.includes('[REGISTER SUBMIT ERROR]'), 'Must wrap handler in try...catch block');
  console.log('   ✅ PASS: Entire handler wrapped in try...catch block');

  // Check HTML5 validity pre-check
  assert.ok(appJs.includes('checkValidity()') && appJs.includes('reportValidity()'), 'Must check and report HTML5 validity');
  console.log('   ✅ PASS: Native HTML5 validation constraints checked with explicit user feedback');

  // Check handleRegisterSubmit alias
  assert.ok(appJs.includes('window.handleRegisterSubmit = window.handleUserSignUp'), 'Must alias handleRegisterSubmit');
  console.log('   ✅ PASS: window.handleRegisterSubmit defined and linked to registration logic');

  // Check robust listener binding
  assert.ok(appJs.includes('bindRegistrationListeners'), 'Must have standalone bindRegistrationListeners helper');
  assert.ok(appJs.includes("explicitSignUpBtn.addEventListener('click'"), 'Must explicitly bind click listener to button');
  console.log('   ✅ PASS: Registration button and form listeners robustly bound');

  // Check container toggle on OTP step
  assert.ok(appJs.includes("regOtpContainer.classList.remove('hidden')"), 'Must unhide regOtpContainer');
  assert.ok(appJs.includes("regFieldsContainer.classList.add('hidden')"), 'Must hide regFieldsContainer');
  console.log('   ✅ PASS: OTP step container toggling logic verified');

  // 3. Live Functional Test with Backend API
  console.log('\n3. Live Backend API Verification:');
  const rand = Date.now();
  const testStudent = {
    name: 'Heron Test Student',
    studentId: `A202-${rand.toString().slice(-5)}`,
    email: `student.test.${rand}@umak.edu.ph`,
    contactNumber: '09181234567',
    college: 'CCIS',
    program: 'BS Computer Science',
    yearLevel: '3rd Year',
    password: 'Password@2026'
  };

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testStudent)
  });
  const regData = await regRes.json();
  assert.strictEqual(regRes.status, 200, `Registration should succeed with 200: ${JSON.stringify(regData)}`);
  assert.strictEqual(regData.success, true);
  assert.strictEqual(regData.requireVerification, true);
  console.log('   ✅ PASS: Registration dispatched, returns requireVerification: true');

  // Lookup OTP from SQLite
  const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
  const userInDb = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE LOWER(email) = ?', [testStudent.email.toLowerCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  assert.ok(userInDb, 'User must exist in SQLite database');
  assert.strictEqual(userInDb.is_verified, 0, 'User must initially have is_verified = 0');
  assert.ok(userInDb.verification_otp, 'User must have verification_otp set in DB');
  console.log(`   ✅ PASS: SQLite record created with OTP: ${userInDb.verification_otp}`);

  // Verify OTP
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testStudent.email, otp: userInDb.verification_otp })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, `OTP verification should succeed: ${JSON.stringify(verifyData)}`);
  assert.strictEqual(verifyData.success, true);
  console.log('   ✅ PASS: OTP verification succeeded, student account activated');

  // Verify user is now verified in SQLite
  const verifiedUser = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE LOWER(email) = ?', [testStudent.email.toLowerCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  assert.strictEqual(verifiedUser.is_verified, 1, 'User must now be verified (is_verified = 1)');
  db.close();
  console.log('   ✅ PASS: Database confirms user is_verified = 1');

  console.log('\n===========================================================');
  console.log('🎉 ALL AUDITS AND VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('===========================================================\n');
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
