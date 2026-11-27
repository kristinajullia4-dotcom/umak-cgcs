const http = require('http');
const { db } = require('./database');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`   ✅ PASS: ${message}`);
}

async function runSecurityTests() {
  console.log('====================================================');
  console.log('🛡️ RUNNING UMak CGCS SECURITY HARDENING TEST SUITE');
  console.log('====================================================\n');

  // Reset test accounts to clean state
  await db.runAsync('UPDATE users SET failed_attempts = 0, lock_until = NULL, reset_token = NULL, reset_token_expiry = NULL WHERE id IN ("USR-STD-001", "USR-CNS-001", "USR-DIR-001")');

  // ----------------------------------------------------
  // TEST 1: DUAL LOGIN IDENTIFIER (server.js & SQLite)
  // ----------------------------------------------------
  console.log('1. Testing Dual Login Identifier Support:');
  
  // 1a: Login with student email
  const loginByEmail = await request('POST', '/api/auth/login', {
    identifier: 'student@umak.edu.ph',
    password: 'Password123!'
  });
  assert(loginByEmail.status === 200 && loginByEmail.data.token, 'Login via student email (student@umak.edu.ph)');

  // 1b: Login with Student ID
  const loginByStudentId = await request('POST', '/api/auth/login', {
    identifier: 'K120-44921',
    password: 'Password123!'
  });
  assert(loginByStudentId.status === 200 && loginByStudentId.data.token, 'Login via Student ID (K120-44921)');

  // 1c: Test backward-compatible /api/login endpoint
  const legacyLogin = await request('POST', '/api/login', {
    identifier: 'K120-44921',
    password: 'Password123!'
  });
  assert(legacyLogin.status === 200 && legacyLogin.data.token, 'Backward compatibility for POST /api/login');

  const studentToken = loginByEmail.data.token;

  // ----------------------------------------------------
  // TEST 2: FAILED ATTEMPTS & ACCOUNT LOCKOUT (HTTP 423)
  // ----------------------------------------------------
  console.log('\n2. Testing Failed Attempts & 15-Minute Account Lockout:');
  
  // Test counselor account for lockout test
  const testUserEmail = 'counselor@umak.edu.ph';
  await db.runAsync('UPDATE users SET failed_attempts = 0, lock_until = NULL WHERE email = ?', [testUserEmail]);

  for (let i = 1; i <= 4; i++) {
    const failRes = await request('POST', '/api/auth/login', {
      identifier: testUserEmail,
      password: 'WrongPassword!'
    });
    assert(failRes.status === 401, `Failed attempt ${i} returns HTTP 401`);
    assert(failRes.data.attemptsRemaining === 5 - i, `Attempts remaining is ${5 - i}`);
  }

  // 5th attempt must trigger lockout (HTTP 423)
  const lockoutRes = await request('POST', '/api/auth/login', {
    identifier: testUserEmail,
    password: 'WrongPassword!'
  });
  assert(lockoutRes.status === 423, '5th failed attempt triggers HTTP 423 (Locked)');
  assert(lockoutRes.data.locked === true, 'Response payload contains locked: true');
  assert(lockoutRes.data.remainingSeconds > 800, 'Remaining seconds reflects 15-minute window');
  assert(lockoutRes.data.message.includes('Account locked due to 5 consecutive failed attempts'), 'Lockout message formatted correctly');

  // Attempting to log in while locked (even with correct password) returns HTTP 423
  const lockedAttempt = await request('POST', '/api/auth/login', {
    identifier: testUserEmail,
    password: 'Password123!'
  });
  assert(lockedAttempt.status === 423, 'Login attempt on locked account returns HTTP 423');

  // ----------------------------------------------------
  // TEST 3: FORGOT PASSWORD & RESET RECOVERY WORKFLOW
  // ----------------------------------------------------
  console.log('\n3. Testing Forgot Password & Account Recovery:');

  // 3a: Request recovery code by email
  const forgotRes = await request('POST', '/api/auth/forgot-password', {
    identifier: testUserEmail
  });
  assert(forgotRes.status === 200, 'POST /api/auth/forgot-password returns 200');
  assert(forgotRes.data.code && forgotRes.data.code.length === 6, '6-digit verification code generated');
  const recoveryCode = forgotRes.data.code;

  // 3b: Submit weak password (fails complexity)
  const weakReset = await request('POST', '/api/auth/reset-password', {
    identifier: testUserEmail,
    token: recoveryCode,
    newPassword: 'weak'
  });
  assert(weakReset.status === 400, 'Weak password rejected with 400 Bad Request');

  // 3c: Submit strong password with valid code
  const newPassword = 'NewSecurePassword2026!';
  const resetRes = await request('POST', '/api/auth/reset-password', {
    identifier: testUserEmail,
    token: recoveryCode,
    newPassword
  });
  assert(resetRes.status === 200, 'Valid reset request returns 200 OK');

  // 3d: Verify account is unlocked and can log in with new password
  const newLogin = await request('POST', '/api/auth/login', {
    identifier: testUserEmail,
    password: newPassword
  });
  assert(newLogin.status === 200, 'Account successfully unlocked and signs in with new password');
  const counselorToken = newLogin.data.token;

  // Reset counselor password back to Password123! for regression tests
  const revertCodeRes = await request('POST', '/api/auth/forgot-password', { identifier: testUserEmail });
  await request('POST', '/api/auth/reset-password', {
    identifier: testUserEmail,
    token: revertCodeRes.data.code,
    newPassword: 'Password123!'
  });

  // Re-login counselor with standard password
  const counselorFresh = await request('POST', '/api/auth/login', {
    identifier: testUserEmail,
    password: 'Password123!'
  });
  const counselorActiveToken = counselorFresh.data.token;

  // Director login
  const directorLogin = await request('POST', '/api/auth/login', {
    identifier: 'director@umak.edu.ph',
    password: 'Password123!'
  });
  assert(directorLogin.status === 200, 'Director login succeeds');
  const directorToken = directorLogin.data.token;

  // ----------------------------------------------------
  // TEST 4: AES-256 SENSITIVE DATA ENCRYPTION
  // ----------------------------------------------------
  console.log('\n4. Testing AES-256-GCM Sensitive Data Encryption:');

  const secretPhone = '0999-777-1234';
  const secretSubjective = 'Sensitive confidential clinical reflection by counselor.';

  // 4a: Book appointment with contact number
  const apptRes = await request('POST', '/api/appointments', {
    studentId: 'K120-44921',
    studentName: 'Mark Angelo Dela Cruz',
    email: 'student@umak.edu.ph',
    contactNumber: secretPhone,
    college: 'CCIS',
    counselingType: 'Personal / Emotional Support',
    counselorName: 'Dr. Ma. Elena Santos, RGC',
    date: '2026-09-15',
    timeSlot: '01:00 PM - 02:00 PM',
    mode: 'Face-to-Face Consultation (Admin Bldg Rm 304)',
    reason: 'Exam anxiety and academic stress'
  }, studentToken);
  assert(apptRes.status === 201, 'Appointment created');
  const apptId = apptRes.data.data.id;

  // 4b: Submit SOAP note with sensitive data
  const soapRes = await request('POST', '/api/soap', {
    appointmentId: apptId,
    studentId: 'K120-44921',
    subjective: secretSubjective,
    objective: 'Normal mental status examination',
    assessment: 'Mild situational stress',
    plan: 'Mindfulness grounding exercises',
    remarks: 'Student engaged positively'
  }, counselorActiveToken);
  assert(soapRes.status === 200, 'Clinical SOAP notes submitted');

  // 4c: Submit assessment responses
  const assessRes = await request('POST', '/api/assessments', {
    assessmentType: 'GAD-7',
    answers: [1, 2, 1, 0, 1, 2, 1]
  }, studentToken);
  assert(assessRes.status === 201, 'Mental health assessment submitted');
  const assessId = assessRes.data.data.id;

  // 4d: Check raw SQLite database records directly: must be encrypted with "enc:gcm:"
  const rawAppt = await db.getAsync('SELECT contact_number FROM appointments WHERE id = ?', [apptId]);
  assert(rawAppt.contact_number.startsWith('enc:gcm:'), `Raw appointment contact_number is AES-256 encrypted (${rawAppt.contact_number.slice(0, 25)}...)`);

  const rawSoap = await db.getAsync('SELECT subjective, plan FROM soap_notes WHERE appointment_id = ?', [apptId]);
  assert(rawSoap.subjective.startsWith('enc:gcm:'), `Raw SOAP subjective note is AES-256 encrypted (${rawSoap.subjective.slice(0, 25)}...)`);

  const rawAssess = await db.getAsync('SELECT answers_json FROM assessments WHERE id = ?', [assessId]);
  assert(rawAssess.answers_json.startsWith('enc:gcm:'), `Raw assessment answers_json is AES-256 encrypted (${rawAssess.answers_json.slice(0, 25)}...)`);

  // 4e: Verify automatic decryption when fetched via authorized API
  const fetchAppts = await request('GET', '/api/appointments', null, studentToken);
  const fetchedAppt = fetchAppts.data.data.find(a => a.id === apptId);
  assert(fetchedAppt && fetchedAppt.contact_number === secretPhone, 'Appointment contact_number automatically decrypted via API');

  const fetchSoap = await request('GET', `/api/soap/${apptId}`, null, counselorActiveToken);
  assert(fetchSoap.data.data && fetchSoap.data.data.subjective === secretSubjective, 'SOAP notes automatically decrypted via authorized API');

  // ----------------------------------------------------
  // TEST 5: RBAC & ROUTE GUARDS
  // ----------------------------------------------------
  console.log('\n5. Testing RBAC Server Route Guards:');

  // 5a: /api/student/* is accessible only by student
  const studentSelf = await request('GET', '/api/student/dashboard', null, studentToken);
  assert(studentSelf.status === 200, 'Student accessing /api/student/dashboard &rarr; HTTP 200');

  const counselorOnStudent = await request('GET', '/api/student/dashboard', null, counselorActiveToken);
  assert(counselorOnStudent.status === 403, 'Counselor accessing /api/student/dashboard &rarr; HTTP 403 Forbidden');

  const directorOnStudent = await request('GET', '/api/student/dashboard', null, directorToken);
  assert(directorOnStudent.status === 403, 'Director accessing /api/student/dashboard &rarr; HTTP 403 Forbidden');

  // 5b: /api/counselor/* is accessible only by counselor
  const counselorOnCounselor = await request('GET', '/api/counselor/schedules', null, counselorActiveToken);
  assert(counselorOnCounselor.status === 200, 'Counselor accessing /api/counselor/schedules &rarr; HTTP 200');

  const studentOnCounselor = await request('GET', '/api/counselor/schedules', null, studentToken);
  assert(studentOnCounselor.status === 403, 'Student accessing /api/counselor/schedules &rarr; HTTP 403 Forbidden');

  // 5c: /api/admin/* and executive logs accessible only by director
  const directorOnAdmin = await request('GET', '/api/admin/users', null, directorToken);
  assert(directorOnAdmin.status === 200, 'Director accessing /api/admin/users &rarr; HTTP 200');

  const directorOnLogs = await request('GET', '/api/admin/audit-logs', null, directorToken);
  assert(directorOnLogs.status === 200, 'Director accessing executive logs (/api/admin/audit-logs) &rarr; HTTP 200');

  const directorOnExecLogs = await request('GET', '/api/executive-logs', null, directorToken);
  assert(directorOnExecLogs.status === 200, 'Director accessing /api/executive-logs &rarr; HTTP 200');

  const counselorOnAdmin = await request('GET', '/api/admin/users', null, counselorActiveToken);
  assert(counselorOnAdmin.status === 403, 'Counselor accessing /api/admin/users &rarr; HTTP 403 Forbidden');

  const counselorOnLogs = await request('GET', '/api/admin/audit-logs', null, counselorActiveToken);
  assert(counselorOnLogs.status === 403, 'Counselor accessing executive logs &rarr; HTTP 403 Forbidden');

  const studentOnAdmin = await request('GET', '/api/admin/users', null, studentToken);
  assert(studentOnAdmin.status === 403, 'Student accessing /api/admin/users &rarr; HTTP 403 Forbidden');

  const studentOnLogs = await request('GET', '/api/admin/audit-logs', null, studentToken);
  assert(studentOnLogs.status === 403, 'Student accessing executive logs &rarr; HTTP 403 Forbidden');

  console.log('\n====================================================');
  console.log('🎉 ALL SECURITY HARDENING TESTS PASSED (100%)!');
  console.log('====================================================\n');
}

runSecurityTests().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
