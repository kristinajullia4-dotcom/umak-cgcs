const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING SIGN-UP & FORGOT PASSWORD FIXES');
  console.log('====================================================\n');

  // 1. Audit DOM Element IDs in public/index.html
  console.log('1. Auditing public/index.html Element IDs:');
  const htmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');

  // Forgot Password modal triggers and close buttons
  assert.ok(htmlContent.includes('id="forgotPasswordLink"'), 'Must have id="forgotPasswordLink"');
  assert.ok(htmlContent.includes('id="modalForgotPassword"'), 'Must have id="modalForgotPassword"');
  assert.ok(htmlContent.includes('class="modal-backdrop z-50"') || htmlContent.includes('modalForgotPassword" style="z-index: 9999;'), 'Must have z-50 / z-index 9999 for modal');
  assert.ok(htmlContent.includes('id="closeForgotModal"'), 'Must have id="closeForgotModal"');
  assert.ok(htmlContent.includes('id="btnCancelForgotModal"'), 'Must have id="btnCancelForgotModal"');
  console.log('   ✅ PASS: Forgot Password trigger and modal close buttons audited');

  // Sign-Up form elements
  assert.ok(htmlContent.includes('id="btnTabSignUp"'), 'Must have id="btnTabSignUp"');
  assert.ok(htmlContent.includes('id="formSignUp"'), 'Must have id="formSignUp"');
  assert.ok(htmlContent.includes('id="signUpName"'), 'Must have id="signUpName"');
  assert.ok(htmlContent.includes('id="signUpStudentId"'), 'Must have id="signUpStudentId"');
  assert.ok(htmlContent.includes('id="signUpEmail"'), 'Must have id="signUpEmail"');
  assert.ok(htmlContent.includes('id="signUpContact"'), 'Must have id="signUpContact" (Contact Number)');
  assert.ok(htmlContent.includes('id="signUpCollege"'), 'Must have id="signUpCollege"');
  assert.ok(htmlContent.includes('id="signUpPassword"'), 'Must have id="signUpPassword"');
  assert.ok(htmlContent.includes('id="signUpBtn"'), 'Must have id="signUpBtn"');
  console.log('   ✅ PASS: Sign-up form and input fields audited (including Contact Number & signUpBtn)');

  // 2. Audit Event Listener & Handler Logic in public/app.js
  console.log('\n2. Auditing public/app.js Logic:');
  const appContent = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf-8');

  assert.ok(appContent.includes("document.addEventListener('DOMContentLoaded'"), 'Must wrap in DOMContentLoaded');
  assert.ok(appContent.includes('console.log("Sign-up triggered", payload)'), 'Must log "Sign-up triggered" with payload');
  assert.ok(appContent.includes("fetch('/api/auth/register'"), 'Must dispatch fetch to /api/auth/register');
  assert.ok(appContent.includes('e.preventDefault()'), 'Must call e.preventDefault() in submit handler');
  assert.ok(appContent.includes('openForgotPasswordModal'), 'Must expose openForgotPasswordModal');
  assert.ok(appContent.includes('closeForgotPasswordModal'), 'Must expose closeForgotPasswordModal');
  assert.ok(appContent.includes('closeForgotModal'), 'Must bind closeForgotModal');
  console.log('   ✅ PASS: app.js contains all required handlers, logging, and error wrappers');

  // 3. Testing POST /api/auth/register Endpoint
  console.log('\n3. Testing POST /api/auth/register Endpoint:');
  const rand = Date.now();
  const regPayload = {
    name: 'Juan Dela Cruz Testing',
    studentId: `K120-${rand.toString().slice(-5)}`,
    email: `juan.test.${rand}@umak.edu.ph`,
    contactNumber: '0917-555-4321',
    college: 'CCIS',
    program: 'BS Information Technology',
    yearLevel: '2nd Year',
    password: 'Password@123'
  };

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regPayload)
  });
  const regData = await regRes.json();

  assert.strictEqual(regRes.status, 200, `Expected HTTP 200, got ${regRes.status}`);
  assert.strictEqual(regData.success, true);
  assert.strictEqual(regData.requireVerification, true);
  console.log('   ✅ PASS: POST /api/auth/register creates unverified user and returns requireVerification: true');

  // Verify OTP so user becomes verified
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
  const dbUser = await new Promise((res, rej) => db.get('SELECT * FROM users WHERE LOWER(email) = ?', [regPayload.email.toLowerCase()], (e, r) => e ? rej(e) : res(r)));
  assert.ok(dbUser && dbUser.verification_otp, 'User OTP must be set in database');

  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: regPayload.email, otp: dbUser.verification_otp })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyData.success, true);
  db.close();

  // 4. Testing Duplicate User Rejection
  console.log('\n4. Testing Duplicate Registration Handling:');
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regPayload)
  });
  const dupData = await dupRes.json();
  assert.strictEqual(dupRes.status, 400);
  assert.strictEqual(dupData.success, false);
  console.log(`   ✅ PASS: Duplicate registration rejected with 400 (${dupData.error || dupData.message})`);

  // 5. Testing Missing Fields Validation
  console.log('\n5. Testing Missing Fields Validation:');
  const invalidRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Incomplete' })
  });
  const invalidData = await invalidRes.json();
  assert.strictEqual(invalidRes.status, 400);
  assert.strictEqual(invalidData.success, false);
  console.log(`   ✅ PASS: Incomplete registration rejected with 400 (${invalidData.message})`);

  // 6. Testing Backward Compatible POST /api/register
  console.log('\n6. Testing Backward Compatibility POST /api/register:');
  const rand2 = Date.now() + 1;
  const regPayload2 = {
    name: 'Maria Clara Testing',
    studentId: `K120-${rand2.toString().slice(-5)}`,
    email: `maria.test.${rand2}@umak.edu.ph`,
    college: 'CBFS',
    password: 'Password@123'
  };
  const reg2Res = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regPayload2)
  });
  const reg2Data = await reg2Res.json();
  assert.strictEqual(reg2Res.status, 200);
  assert.strictEqual(reg2Data.success, true);
  console.log('   ✅ PASS: Backward compatibility POST /api/register operational');

  console.log('\n====================================================');
  console.log('🎉 ALL SIGN-UP & FORGOT PASSWORD AUDIT TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
