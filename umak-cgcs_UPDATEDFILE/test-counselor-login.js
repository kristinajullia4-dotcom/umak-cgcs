const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function testCounselorLogin() {
  console.log('====================================================');
  console.log('🧪 TESTING COUNSELOR LOGIN & REDIRECT ROUTING');
  console.log('====================================================\n');

  // 1. Test Counselor Login with New Reset Password
  console.log('1. Testing Counselor Login with Reset Password (Counselor@123):');
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'counselor@umak.edu.ph', password: 'Counselor@123' })
  });
  const data = await res.json();

  assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.role, 'counselor', 'Role must be lowercase "counselor"');
  assert.strictEqual(data.user.role, 'counselor');
  assert.strictEqual(data.redirect, 'counselor-queue', 'Redirect must route to counselor queue');
  assert.strictEqual(data.dashboardView, 'counselor-dashboard', 'Dashboard view must be counselor-dashboard');
  assert.ok(data.token, 'JWT Token must be present');
  console.log('   ✅ PASS: Counselor successfully authenticated with Counselor@123');
  console.log(`   User: ${data.user.name} (${data.user.email})`);
  console.log(`   Role: ${data.role}`);
  console.log(`   Redirect: ${data.redirect}`);
  console.log(`   DashboardView: ${data.dashboardView}`);

  // 2. Test Case-Insensitive Identifier & Role Normalization
  console.log('\n2. Testing Case-Insensitive Identifier:');
  const caseRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'COUNSELOR@UMAK.EDU.PH', password: 'Counselor@123' })
  });
  const caseData = await caseRes.json();
  assert.strictEqual(caseRes.status, 200);
  assert.strictEqual(caseData.role, 'counselor');
  console.log('   ✅ PASS: Case-insensitive login verified');

  // 3. Test Invalid Password Rejection
  console.log('\n3. Testing Invalid Password Rejection:');
  const badRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'counselor@umak.edu.ph', password: 'WrongPassword999!' })
  });
  const badData = await badRes.json();
  assert.strictEqual(badRes.status, 401);
  assert.strictEqual(badData.success, false);
  console.log(`   ✅ PASS: Invalid password rejected with 401: ${badData.message}`);

  // Re-login with correct password to reset failed attempts
  const fixRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'counselor@umak.edu.ph', password: 'Counselor@123' })
  });
  assert.strictEqual(fixRes.status, 200);
  console.log('   ✅ PASS: Counselor attempts reset on valid login');

  console.log('\n====================================================');
  console.log('🎉 ALL COUNSELOR LOGIN TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

testCounselorLogin().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
