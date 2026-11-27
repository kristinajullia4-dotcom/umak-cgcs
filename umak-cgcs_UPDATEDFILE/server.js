require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db, initDatabase } = require('./database');
const { generateHeronResponse, generateLiveChatClinicalSummary } = require('./controllers/heronAiController');

const app = express();
const PORT = 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'umak_cgcs_enterprise_secret_2026_supersecure_key';

// --- Nodemailer Setup ---
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP Connection Failed:', error);
  } else {
    console.log('SMTP Server is ready to send emails');
  }
});
// -------------------------

// AES-256 Sensitive Data Encryption Key (32-byte derived key)
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || 'umak_cgcs_aes256_encryption_key_2026_dpa_compliant_super_secure';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();

/**
 * Encrypt sensitive records using AES-256-GCM
 * Format: enc:gcm:<iv_hex>:<tag_hex>:<encrypted_hex>
 */
function encryptData(text) {
  if (text === null || text === undefined || text === '') return text;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  if (str.startsWith('enc:gcm:')) return str; // Already encrypted

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('AES-256 encryption error:', err);
    return str;
  }
}

/**
 * Decrypt records previously encrypted with AES-256-GCM
 * Gracefully returns unencrypted plaintext for backward compatibility
 */
function decryptData(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith('enc:gcm:')) {
    return cipherText;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length < 5) return cipherText;
    const ivHex = parts[2];
    const tagHex = parts[3];
    const encryptedHex = parts.slice(4).join(':');

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('AES-256 decryption notice:', err.message);
    return cipherText;
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Technical Safeguards & HTTP Security Headers (WCAG & DPA 2012 Compliance)
app.use((req, res, next) => {
  // Prevent clickjacking & framing attacks
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Cross-site scripting filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy: enforce frame-ancestors 'none' to block framing
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; frame-ancestors 'none';");
  next();
});

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// RBAC AUTHENTICATION MIDDLEWARE
// ----------------------------------------------------

function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Invalid Authorization header format.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session token. Please sign in again.' });
    }
    req.user = user;
    next();
  });
}

function requireRole(...allowedRoles) {
  const flattened = allowedRoles.flat(Infinity);
  const normalizedAllowed = flattened.map(r => (typeof r === 'string' ? r.toLowerCase() : String(r)));
  if (normalizedAllowed.includes('director') && !normalizedAllowed.includes('superadmin')) {
    normalizedAllowed.push('superadmin');
  }
  if (normalizedAllowed.includes('superadmin') && !normalizedAllowed.includes('director')) {
    normalizedAllowed.push('director');
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Authorized for ${flattened.join(', ')} only.`
      });
    }
    next();
  };
}

const authenticateToken = authenticateJWT;
const requireAuth = authenticateJWT;
const requireDirector = requireRole('director', 'superadmin', 'admin');
const requireCounselorOrAdmin = requireRole('counselor', 'director', 'superadmin', 'admin');

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) req.user = user;
        next();
      });
      return;
    }
  }
  next();
}

// Helper: Sanitize audit trail records for Zero-PII disclosure compliance
function sanitizeAuditLogsForZeroPii(logs) {
  return (logs || []).map(log => {
    let safeName = log.actor_name;
    if (log.actor_role === 'student' || log.actor_role === 'Student') {
      safeName = 'Student (UMak)';
    }
    let safeDetails = (log.details || '')
      .replace(/[a-zA-Z0-9._%+-]+@umak\.edu\.ph/gi, '[ANONYMIZED_EMAIL]')
      .replace(/\b[aAkK][0-9\-]{4,}\b/g, '[ANONYMIZED_ID]')
      .replace(/(?:medicalConditions|currentMedications|previousMedications|conditions|medications|diagnosis|prescription|illness):\s*[^,;}\n]+/gi, '[CONFIDENTIAL_HEALTH_DATA_REDACTED]');
    return {
      ...log,
      actor_name: safeName,
      details: safeDetails
    };
  });
}

// Strict DPA 2012 Compliance Audit Logger (Zero-PII & Privacy Preserving)
async function logDpaEvent(req, action, details) {
  try {
    let rawActor = req?.user?.name || req?.user?.email || req?.body?.name || req?.body?.email || req?.body?.identifier || (typeof req === 'string' ? req : 'System');
    const actorRole = req?.user?.role || (req?.user ? 'authenticated' : 'system');
    const ip = req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
    const timestamp = new Date().toISOString();
    const logId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Zero-PII compliance: Anonymize student identities in audit trail
    let actorName = rawActor;
    if (actorRole === 'student') {
      const studentCollege = req?.user?.college || req?.body?.college || 'UMak Student';
      actorName = `Student (${studentCollege})`;
    }

    // Strip student names, student IDs, and raw health disclosures from audit details
    let safeDetails = typeof details === 'string' ? details : JSON.stringify(details);
    safeDetails = safeDetails
      .replace(/[a-zA-Z0-9._%+-]+@umak\.edu\.ph/gi, '[ANONYMIZED_EMAIL]')
      .replace(/\b[aAkK][0-9\-]{5,}\b/g, '[ANONYMIZED_ID]')
      .replace(/(?:medicalConditions|currentMedications|previousMedications|conditions|medications|diagnosis|prescription|illness):\s*[^,;}\n]+/gi, '[CONFIDENTIAL_HEALTH_DATA_REDACTED]')
      .replace(/(?:password|token|secret):\s*[^,;}\n]+/gi, '[REDACTED]');

    await db.runAsync(`
      INSERT INTO audit_logs (id, actor_name, actor_role, action, details, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [logId, actorName, actorRole, action, safeDetails, ip, timestamp]);
  } catch (e) {
    console.error('DPA audit log write error:', e);
  }
}

// System Audit Logger (Restricted to Critical DPA Compliance Actions)
async function logActivity(actorName, actorRole, action, details, ip = '127.0.0.1') {
  const criticalMap = {
    'LOGIN_SUCCESS': 'DPA_AUTH_LOGIN',
    'ACCOUNT_LOCKED': 'DPA_AUTH_LOCKOUT',
    'ACCOUNT_LOCKED_ATTEMPT': 'DPA_AUTH_LOCKOUT',
    'SCHEDULE_ASSIGNED': 'DPA_DUTY_ASSIGN',
    'SCHEDULE_SAVED': 'DPA_DUTY_ASSIGN',
    'SCHEDULE_UPDATED': 'DPA_DUTY_ASSIGN',
    'SCHEDULE_DELETED': 'DPA_DUTY_ASSIGN',
    'USER_CREATED': 'DPA_USER_MUTATE',
    'USER_UPDATED': 'DPA_USER_MUTATE',
    'USER_DELETED': 'DPA_USER_MUTATE',
    'UPDATE_STUDENT_STATUS': 'DPA_USER_MUTATE',
    'DELETE_STUDENT': 'DPA_USER_MUTATE',
    'SOAP_NOTES_FILED': 'DPA_PHI_ACCESS'
  };

  const dpaAction = criticalMap[action] || (action && action.startsWith('DPA_') ? action : null);
  if (!dpaAction) return; // Suppress non-critical noise events

  try {
    const logId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    await db.runAsync(`
      INSERT INTO audit_logs (id, actor_name, actor_role, action, details, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [logId, actorName, actorRole, dpaAction, details, ip, timestamp]);
  } catch (e) {
    console.error('Audit log write error:', e);
  }
}

function getPhilippineISOString() {
  const now = new Date();
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now).replace(' ', 'T');
}

// Centralized Safe Targeted Notification Helper (Zero Bleed / Recipient Isolated)
function createTargetedNotification({ recipientId, senderId = null, senderName = 'System', title, message, type = 'system_notice', actionLink = null, referenceId = null }) {
  if (!recipientId) return false;
  try {
    const createdAt = new Date().toISOString();
    const sql = `
      INSERT INTO notifications (user_id, sender_id, sender_name, title, message, type, action_link, reference_id, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `;
    db.run(sql, [
      String(recipientId),
      senderId ? String(senderId) : null,
      senderName || 'System',
      title,
      message,
      type || 'system_notice',
      actionLink || null,
      referenceId ? String(referenceId) : null,
      actionLink || null,
      createdAt
    ], function(err) {
      if (err) console.error('Failed to create targeted notification:', err.message);
    });
    return true;
  } catch (err) {
    console.error('Failed to create targeted notification:', err.message);
    return false;
  }
}

// Backward-compatible safe wrapper that maps to exact target recipient IDs
function createNotification({ userId = null, targetRole = null, title, message, type = 'info', link = null }) {
  if (userId) {
    return createTargetedNotification({
      recipientId: userId,
      senderName: 'System',
      title,
      message,
      type: type || 'system_notice',
      actionLink: link,
      referenceId: null
    });
  }
  // If targetRole is specified without explicit recipient, resolve individual user IDs to prevent leaked records
  if (targetRole) {
    db.all("SELECT id FROM users WHERE LOWER(role) = ?", [targetRole.toLowerCase()], (err, users) => {
      if (!err && users && users.length > 0) {
        users.forEach(u => {
          createTargetedNotification({
            recipientId: u.id,
            senderName: 'System',
            title,
            message,
            type: type || 'system_notice',
            actionLink: link
          });
        });
      }
    });
  }
}

// Helper to construct lightweight token payload from user record (No large base64 strings)
function buildTokenPayload(user) {
  const roleLower = (user.role || '').toLowerCase();
  return {
    id: user.id,
    email: user.email,
    role: roleLower === 'superadmin' ? 'director' : roleLower,
    name: user.name,
    student_id: user.student_id || null,
    studentId: user.student_id || null,
    college: user.college || null,
    department: user.department || null,
    title: user.title || null,
    has_completed_intake: user.has_completed_intake ? 1 : 0
  };
}

// Full user profile object for JSON response payloads with automatic AES-256 decryption
function buildUserResponse(user) {
  const roleLower = (user.role || '').toLowerCase();
  return {
    id: user.id,
    email: user.email,
    role: roleLower === 'superadmin' ? 'director' : roleLower,
    name: user.name,
    student_id: user.student_id || null,
    studentId: user.student_id || null,
    college: user.college || null,
    program: user.program || null,
    yearLevel: user.year_level || null,
    title: user.title || null,
    department: user.department || null,
    contactNumber: decryptData(user.contact_number) || null,
    emergencyContactPerson: decryptData(user.emergency_contact_person || user.emergency_contact_name) || null,
    emergencyContactNumber: decryptData(user.emergency_contact_number || user.emergency_contact_phone) || null,
    emergencyContactName: decryptData(user.emergency_contact_name || user.emergency_contact_person) || null,
    emergencyContactPhone: decryptData(user.emergency_contact_phone || user.emergency_contact_number) || null,
    avatarInitials: user.avatar_initials || null,
    avatarUrl: user.avatar_url || null,
    status: user.status || 'Active',
    specialization: user.specialization || null,
    has_completed_intake: user.has_completed_intake ? 1 : 0,
    hasCompletedIntake: user.has_completed_intake ? 1 : 0,
    hasExistingIllness: user.has_existing_illness ? 1 : 0,
    intakeCompletedAt: user.intake_completed_at || null
  };
}

// ----------------------------------------------------
// 1. AUTHENTICATION, REGISTRATION & RECOVERY ENDPOINTS
// ----------------------------------------------------

// Unified Login Handler with Dual Identifier & Lockout Logic
async function handleLogin(req, res) {
  const { identifier, email, password } = req.body;
  const loginId = identifier || email;

  if (!loginId || !password) {
    return res.status(400).json({ success: false, message: 'Please enter your UMak Email / Student ID and password.' });
  }

  try {
    const query = loginId.trim().toLowerCase();
    const user = await db.getAsync(`
      SELECT * FROM users 
      WHERE LOWER(email) = ? OR LOWER(student_id) = ?
    `, [query, query]);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact CGCS Room 304.' });
    }

    const now = Date.now();

    // 1. Check Account Lockout Status
    if (user.lock_until) {
      const lockUntilMs = new Date(user.lock_until).getTime();
      if (lockUntilMs > now) {
        const remainingSeconds = Math.ceil((lockUntilMs - now) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);

        await logDpaEvent(req, 'DPA_AUTH_LOCKOUT', `Login attempt on locked account (${user.email}) for ${user.name}`);

        return res.status(423).json({
          success: false,
          locked: true,
          lockUntil: user.lock_until,
          remainingSeconds,
          remainingMinutes,
          message: 'Account locked due to 5 consecutive failed attempts. Try again in 15 minutes or reset your password.'
        });
      } else {
        // Lockout period has elapsed: auto-reset lockout state
        await db.runAsync('UPDATE users SET failed_attempts = 0, lock_until = NULL WHERE id = ?', [user.id]);
        user.failed_attempts = 0;
        user.lock_until = null;
      }
    }

    // 2. Verify Password Credentials
    const passwordHash = user.password_hash || user.password;
    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      const newFailed = (user.failed_attempts || 0) + 1;

      if (newFailed >= 5) {
        const lockUntilDate = new Date(now + 15 * 60 * 1000).toISOString();
        await db.runAsync('UPDATE users SET failed_attempts = ?, lock_until = ? WHERE id = ?', [newFailed, lockUntilDate, user.id]);
        await logDpaEvent(req, 'DPA_AUTH_LOCKOUT', `Account locked after 5 failed attempts for ${user.email} (${user.name})`);

        return res.status(423).json({
          success: false,
          locked: true,
          lockUntil: lockUntilDate,
          remainingSeconds: 15 * 60,
          remainingMinutes: 15,
          message: 'Account locked due to 5 consecutive failed attempts. Try again in 15 minutes or reset your password.'
        });
      } else {
        await db.runAsync('UPDATE users SET failed_attempts = ? WHERE id = ?', [newFailed, user.id]);
        const attemptsLeft = 5 - newFailed;

        return res.status(401).json({
          success: false,
          attemptsRemaining: attemptsLeft,
          message: `Invalid credentials. Please check your password. (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before account lockout)`
        });
      }
    }

    // 3. Check Account Verification Status
    if (Number(user.is_verified) === 0) {
      return res.status(403).json({
        success: false,
        error: "Account not verified. Please verify your email before logging in.",
        message: "Account not verified. Please verify your email before logging in."
      });
    }

    // 4. Successful Login: Reset Failed Attempts & Lockout
    const loginTimestamp = new Date().toISOString();
    await db.runAsync('UPDATE users SET failed_attempts = 0, lock_until = NULL, last_login = ? WHERE id = ?', [loginTimestamp, user.id]);

    // Ensure role comparison and normalization is case-insensitive
    const roleLower = (user.role || '').toLowerCase();
    const cleanRole = roleLower === 'superadmin' ? 'director' : roleLower;
    user.role = cleanRole;

    const tokenPayload = buildTokenPayload(user);
    const userPayload = buildUserResponse(user);
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    await logDpaEvent(req, 'DPA_AUTH_LOGIN', `User signed in successfully via ${user.role} portal for ${user.name} (${user.email})`);

    // Immediate token return for verified active accounts
    if (user.is_verified === 1 && user.status === 'Active') {
      let redirect = 'student-overview';
      let dashboardView = 'student-dashboard';
      if (cleanRole === 'counselor' || cleanRole === 'admin') {
        redirect = 'counselor-queue';
        dashboardView = 'counselor-dashboard';
      } else if (cleanRole === 'director') {
        redirect = 'admin-analytics';
        dashboardView = 'director-dashboard';
      }

      return res.json({
        success: true,
        message: `Welcome back, ${user.name}!`,
        token,
        user: userPayload,
        role: cleanRole,
        redirect,
        dashboardView
      });
    }

    res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: userPayload,
      role: cleanRole,
      redirect,
      dashboardView
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during sign in.' });
  }
}

// POST /api/auth/login and POST /api/login
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// POST /api/auth/forgot-password - Explicit logging, 6-digit OTP & Nodemailer dispatch
app.post('/api/auth/forgot-password', (req, res) => {
  console.log("Forgot password request received for:", req.body);
  const identifier = (req.body.email || req.body.identifier || '').trim();

  if (!identifier) {
    return res.status(400).json({ error: "Email is required." });
  }

  if (identifier.includes('@') && !identifier.toLowerCase().endsWith('@umak.edu.ph')) {
    return res.status(400).json({ error: "Please enter your official @umak.edu.ph email address." });
  }

  db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(student_id) = LOWER(?)", [identifier, identifier], (err, user) => {
    if (err) {
      console.error("Database lookup error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!user) {
      console.warn("User not found for identifier:", identifier);
      return res.status(404).json({ error: "User account not found" });
    }

    if (!user.email.toLowerCase().endsWith('@umak.edu.ph')) {
      return res.status(400).json({ error: "Institutional email must end with @umak.edu.ph." });
    }

    // Generate 6-digit numeric OTP and 32-byte hex token
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

    db.run(`
      UPDATE users 
      SET reset_otp = ?, reset_otp_expires = ?, reset_token = ?, reset_token_expires = ?, reset_token_expiry = ? 
      WHERE id = ?
    `, [otp, otpExpires, resetToken, resetExpires, resetExpires, user.id], (upErr) => {
      if (upErr) {
        console.error("Token/OTP save error:", upErr);
        return res.status(500).json({ error: "Failed to store reset credentials" });
      }

      const rawToken = resetToken;
      const resetLink = `http://localhost:3000/reset-password.html?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

      const mailOptions = {
        from: '"UMak CGCS" <jmarquez.k12150582@umak.edu.ph>',
        to: user.email,
        subject: 'UMak CGCS - Password Reset Verification Code',
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.5; color: #1e293b;">
            <h2 style="color: #1e3a8a;">UMak CGCS Password Reset</h2>
            <p>You requested to reset your password. Use the 6-digit verification code below:</p>
            <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d97706;">${otp}</span>
            </div>
            <p style="font-size: 13px; color: #64748b;">This verification code will expire in 10 minutes.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 13px; color: #64748b;">Alternatively, you can reset your password directly using this link:</p>
            <p><a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">Reset Password Page</a></p>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (mailErr, info) => {
        if (mailErr) {
          console.error("transporter.sendMail failed:", mailErr);
          return res.status(500).json({ error: mailErr.message });
        }
        console.log(`[OTP] Password reset OTP generated for ${user.email}: ${otp}`);
        return res.json({ 
          success: true, 
          message: "Verification code sent to your UMak email.",
          otp,
          resetToken
        });
      });
    });
  });
});

// POST /api/auth/verify-reset-otp - Verify incoming 6-digit reset OTP
app.post('/api/auth/verify-reset-otp', (req, res) => {
  const { email, identifier, otp } = req.body;
  const cleanEmail = (email || identifier || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  if (!cleanEmail || !cleanOtp) {
    return res.status(400).json({ error: "Email and verification code are required." });
  }

  db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(student_id) = LOWER(?)", [cleanEmail, cleanEmail], (err, user) => {
    if (err) {
      console.error("Database lookup error in verify-reset-otp:", err);
      return res.status(500).json({ error: "Database error." });
    }
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    if (!user.reset_otp || user.reset_otp !== cleanOtp) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    if (user.reset_otp_expires && Date.now() > Number(user.reset_otp_expires)) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new code." });
    }

    return res.json({
      success: true,
      message: "Verification code verified successfully."
    });
  });
});

// POST /api/auth/reset-password - Verify OTP or Token & update password
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, identifier, otp, token, newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      error: 'New password is required.',
      message: 'New password is required.'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long.',
      message: 'Password must be at least 8 characters long.'
    });
  }

  if (!otp && !token) {
    return res.status(400).json({
      success: false,
      error: 'Verification code or reset token is required.',
      message: 'Verification code or reset token is required.'
    });
  }

  try {
    const cleanEmail = (email || identifier || '').trim().toLowerCase();
    let user;

    if (cleanEmail) {
      user = await db.getAsync(`
        SELECT * FROM users 
        WHERE LOWER(email) = LOWER(?) OR LOWER(student_id) = LOWER(?)
      `, [cleanEmail, cleanEmail]);
    } else if (token) {
      user = await db.getAsync(`
        SELECT * FROM users 
        WHERE reset_token = ? OR reset_token LIKE ?
      `, [token.trim(), `${token.trim()}%`]);
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired password reset request.',
        message: 'Invalid or expired password reset request.'
      });
    }

    // Check verification via OTP or Token
    if (otp) {
      const cleanOtp = otp.trim();
      if (!user.reset_otp || user.reset_otp !== cleanOtp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification code.',
          message: 'Invalid verification code.'
        });
      }
      if (user.reset_otp_expires && Date.now() > Number(user.reset_otp_expires)) {
        return res.status(400).json({
          success: false,
          error: 'Verification code has expired. Please request a new code.',
          message: 'Verification code has expired. Please request a new code.'
        });
      }
    } else if (token) {
      const cleanToken = token.trim();
      const tokenMatches = user.reset_token === cleanToken || user.reset_token?.startsWith(cleanToken);
      if (!tokenMatches) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification token.',
          message: 'Invalid verification token.'
        });
      }
      const expiresAt = user.reset_token_expires || user.reset_token_expiry;
      if (expiresAt && Date.now() > Number(expiresAt)) {
        return res.status(400).json({
          success: false,
          error: 'Password reset link has expired. Please request a new link.',
          message: 'Password reset link has expired. Please request a new link.'
        });
      }
    }

    // Hash the new password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Clear reset_otp, reset_otp_expires, reset_token, reset_token_expires, and reset failed_attempts to 0
    await db.runAsync(`
      UPDATE users 
      SET password_hash = ?, 
          reset_otp = NULL, 
          reset_otp_expires = NULL, 
          reset_token = NULL, 
          reset_token_expires = NULL, 
          reset_token_expiry = NULL, 
          failed_attempts = 0, 
          lock_until = NULL 
      WHERE id = ?
    `, [passwordHash, user.id]);

    await logActivity(user.name, user.role, 'PASSWORD_RESET_SUCCESS', `Password successfully updated and account unlocked for ${user.email}`, req.ip);

    res.json({
      success: true,
      message: "Password reset successful! Please log in."
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      success: false,
      error: 'Server error updating password.',
      message: 'Server error updating password.'
    });
  }
});

// POST /api/auth/register & POST /api/register - Student Self-Registration
const handleRegister = async (req, res) => {
  let {
    email, password, name, full_name,
    studentId, student_id,
    college, program,
    yearLevel, year_level,
    contact, contactNumber, contact_number,
    emergencyContactName, emergencyContactPhone
  } = req.body;

  if (!name && full_name) name = full_name;
  if (!student_id && studentId) student_id = studentId;
  if (!studentId && student_id) studentId = student_id;
  if (!contactNumber && contact) contactNumber = contact;
  if (!contactNumber && contact_number) contactNumber = contact_number;
  if (!yearLevel && year_level) yearLevel = year_level;
  if (!college) college = 'CCIS';

  // 1. Name validation: letters, spaces, hyphens, periods, and commas only (NO numbers)
  const nameRegex = /^[a-zA-ZñÑ\s.,'-]+$/;
  const studentIdRegex = /^[aAkK][0-9\-]+$/;
  // 2. Strict @umak.edu.ph institutional email restriction
  const emailRegex = /^[a-zA-Z0-9._%+-]+@umak\.edu\.ph$/i;

  if (!name || !nameRegex.test(name.trim())) {
    return res.status(400).json({
      success: false,
      error: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited.",
      message: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited."
    });
  }
  if (!student_id || !studentIdRegex.test(student_id.trim())) {
    return res.status(400).json({
      success: false,
      error: "Invalid Student ID: Must begin with 'A' or 'K'.",
      message: "Invalid Student ID: Must begin with 'A' or 'K'."
    });
  }
  if (!email || !emailRegex.test(email.trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted.",
      message: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted."
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      error: 'Password is required.',
      message: 'All fields (Full Name, Email, Student ID, College, Password) are required.'
    });
  }

  // Mandatory DPA 2012 (RA 10173) & RA 9258 Clinical Consent Validation
  const consent = req.body.dataPrivacyConsent;
  if (consent !== true && consent !== 'true' && consent !== 1 && consent !== '1') {
    return res.status(400).json({
      success: false,
      error: "Data privacy and clinical consent is mandatory under RA 10173 and RA 9258.",
      message: "Data privacy and clinical consent is mandatory under RA 10173 and RA 9258."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters in length.',
      message: 'Password must be at least 6 characters in length.'
    });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanStudentId = (student_id || studentId).trim().toUpperCase();

    const existingEmail = await db.getAsync('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingEmail && Number(existingEmail.is_verified) === 1) {
      return res.status(400).json({
        success: false,
        error: "An account with this email is already registered.",
        message: "An account with this email is already registered."
      });
    }

    const existingStudentId = await db.getAsync('SELECT * FROM users WHERE UPPER(student_id) = ?', [cleanStudentId]);
    if (existingStudentId && Number(existingStudentId.is_verified) === 1) {
      return res.status(400).json({
        success: false,
        error: "An account with this Student ID is already registered.",
        message: "An account with this Student ID is already registered."
      });
    }

    const existing = existingEmail || existingStudentId;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (existing && Number(existing.is_verified) === 0) {
      await db.runAsync(`
        UPDATE users SET 
          password_hash = ?, 
          name = ?, 
          student_id = ?, 
          college = ?, 
          program = ?, 
          year_level = ?, 
          department = ?,
          contact_number = ?, 
          emergency_contact_name = ?, 
          emergency_contact_phone = ?, 
          verification_otp = ?, 
          otp_expires = ?
        WHERE id = ?
      `, [
        passwordHash,
        name.trim(),
        cleanStudentId,
        college.trim().toUpperCase(),
        program ? program.trim() : 'Undergraduate Degree',
        yearLevel || '1st Year',
        `${college.trim().toUpperCase()} Department`,
        encryptData(contactNumber || null),
        encryptData(emergencyContactName || null),
        encryptData(emergencyContactPhone || null),
        otp,
        otpExpires,
        existing.id
      ]);
    } else {
      const newId = `USR-STD-${Date.now()}`;
      await db.runAsync(`
        INSERT INTO users (
          id, email, password_hash, role, name, student_id, college, program, year_level, department, contact_number, emergency_contact_name, emergency_contact_phone, status, is_verified, verification_otp, otp_expires
        ) VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0, ?, ?)
      `, [
        newId,
        cleanEmail,
        passwordHash,
        name.trim(),
        cleanStudentId,
        college.trim().toUpperCase(),
        program ? program.trim() : 'Undergraduate Degree',
        yearLevel || '1st Year',
        `${college.trim().toUpperCase()} Department`,
        encryptData(contactNumber || null),
        encryptData(emergencyContactName || null),
        encryptData(emergencyContactPhone || null),
        otp,
        otpExpires
      ]);
    }

    console.log(`[OTP] Generated verification OTP for ${cleanEmail}: ${otp} (expires in 10m)`);

    const mailOptions = {
      from: '"UMak CGCS" <jmarquez.k12150582@umak.edu.ph>',
      to: cleanEmail,
      subject: 'UMak CGCS - Email Verification Code',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>UMak CGCS Email Verification</h2>
          <p>Thank you for registering. Use the 6-digit verification code below to activate your account:</p>
          <h1 style="letter-spacing: 5px; color: #1e3a8a;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (err) => {
      if (err) {
        console.error("OTP send error:", err);
        return res.status(500).json({ error: "Failed to send verification email. Check server SMTP settings." });
      }
      return res.json({ 
        success: true, 
        requireVerification: true, 
        email: cleanEmail, 
        message: "A 6-digit verification code has been sent to your UMak email." 
      });
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

app.post('/api/auth/register', handleRegister);
app.post('/api/register', handleRegister);

// POST /api/counselor/register - Counselor Self-Registration
const handleCounselorRegister = async (req, res) => {
  let { email, password, name, fullName, department, title, contactNumber } = req.body;
  if (!name && fullName) name = fullName;

  // 1. Name validation: letters, spaces, hyphens, periods, and commas only (NO numbers)
  const nameRegex = /^[a-zA-ZñÑ\s.,'-]+$/;
  if (!name || !nameRegex.test(name.trim())) {
    return res.status(400).json({
      success: false,
      error: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited.",
      message: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited."
    });
  }

  // 2. Strict @umak.edu.ph institutional email restriction
  const emailRegex = /^[a-zA-Z0-9._%+-]+@umak\.edu\.ph$/i;
  if (!email || !emailRegex.test(email.trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted.",
      message: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted."
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 6 characters in length.",
      message: "Password must be at least 6 characters in length."
    });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.getAsync('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "An account with this email is already registered.",
        message: "An account with this email is already registered."
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newId = `USR-CNS-${Date.now()}`;

    await db.runAsync(`
      INSERT INTO users (id, email, password_hash, role, name, department, title, contact_number, status, is_verified)
      VALUES (?, ?, ?, 'counselor', ?, ?, ?, ?, 'Pending', 0)
    `, [
      newId,
      cleanEmail,
      passwordHash,
      name.trim(),
      department || 'CGCS',
      title || 'Guidance Counselor',
      encryptData(contactNumber || null)
    ]);

    createNotification({
      targetRole: 'director',
      title: 'New Counselor Registration Pending Review',
      message: `Counselor ${name.trim()} (${cleanEmail}) has registered and requires account verification.`,
      type: 'info'
    });

    res.status(201).json({
      success: true,
      message: "Counselor registration submitted successfully. Your account is pending director verification."
    });
  } catch (err) {
    console.error("Counselor register error:", err);
    res.status(500).json({ success: false, message: "Failed to register counselor account." });
  }
};

app.post('/api/counselor/register', handleCounselorRegister);

// POST /api/auth/verify-otp & POST /api/verify-otp - Verify Email Registration OTP
const handleVerifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      error: "Email and verification code are required.",
      message: "Email and verification code are required."
    });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();
    const user = await db.getAsync('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification code.",
        message: "Invalid or expired verification code."
      });
    }

    const isMatch = user.verification_otp && user.verification_otp === cleanOtp;
    const isExpired = !user.otp_expires || Date.now() >= Number(user.otp_expires);

    if (!isMatch || isExpired) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification code.",
        message: "Invalid or expired verification code."
      });
    }

    await db.runAsync('UPDATE users SET is_verified = 1, verification_otp = NULL, otp_expires = NULL WHERE id = ?', [user.id]);
    await logActivity(user.name, user.role || 'student', 'EMAIL_VERIFIED', `User email verified successfully (${user.email})`, req.ip);

    // Notify counselors and directors of new student registration
    createNotification({
      targetRole: 'counselor',
      title: 'New Student Registration',
      message: `${user.name} (${user.student_id || user.college || 'Student'}) has registered for the CGCS portal.`,
      type: 'info'
    });
    createNotification({
      targetRole: 'director',
      title: 'New Student Registration',
      message: `${user.name} (${user.student_id || user.college || 'Student'}) has registered for the CGCS portal.`,
      type: 'info'
    });

    return res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now log in."
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({
      success: false,
      error: "Internal server error during verification.",
      message: "Internal server error during verification."
    });
  }
};

app.post('/api/auth/verify-otp', handleVerifyOtp);
app.post('/api/verify-otp', handleVerifyOtp);

// GET /api/me - Verify Active Session & Fetch Latest Profile
app.get('/api/me', authenticateJWT, async (req, res) => {
  try {
    const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const userPayload = buildUserResponse(user);
    res.json({ success: true, user: userPayload });
  } catch (e) {
    res.json({ success: true, user: req.user });
  }
});

// Add avatar and phone columns to users table if absent
try {
  db.runAsync("ALTER TABLE users ADD COLUMN avatar TEXT").catch(() => {});
} catch (e) {}
try {
  db.runAsync("ALTER TABLE users ADD COLUMN phone TEXT").catch(() => {});
} catch (e) {}

// GET profile endpoint (Accessible by any authenticated user)
app.get(['/api/user/profile', '/api/users/profile'], authenticateToken, async (req, res) => {
  try {
    const user = await db.prepare(`
      SELECT id, student_id, id_number, name, email, phone, contact_number, college, program, emergency_contact, role, avatar, avatar_url 
      FROM users 
      WHERE id = ?
    `).get(req.user.id);

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const rawPhone = user.phone || user.contact_number || '';
    user.phone = (typeof decryptData === 'function') ? decryptData(rawPhone) : rawPhone;
    user.contact_number = user.phone;
    user.contactNumber = user.phone;
    const rawEmergency = user.emergency_contact || '';
    user.emergency_contact = (typeof decryptData === 'function') ? decryptData(rawEmergency) : rawEmergency;
    user.emergencyContact = user.emergency_contact;
    user.avatar = user.avatar || user.avatar_url || null;
    user.avatarUrl = user.avatar;
    user.studentId = user.student_id || user.id_number || '';
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/user/profile & /api/users/profile - Cascading Multi-Table Profile Update
const handleUserProfileUpdate = async (req, res) => {
  const { name, fullName, year_level, yearLevel, college, contact_number, contactNumber, emergency_contact, emergencyContact, emergencyContactPerson, emergencyContactNumber, avatar, avatarUrl } = req.body;

  const rawName = name !== undefined ? name : fullName;
  if (!rawName || String(rawName).trim() === '') {
    return res.status(400).json({ success: false, message: 'Name cannot be empty' });
  }

  const cleanName = String(rawName).trim();

  // Name validation: letters, spaces, hyphens, periods, and commas only (NO numbers)
  const nameRegex = /^[a-zA-ZñÑ\s.,'-]+$/;
  if (!nameRegex.test(cleanName)) {
    return res.status(400).json({
      success: false,
      message: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited."
    });
  }

  // Strict @umak.edu.ph institutional email restriction if email is submitted
  if (req.body.email && String(req.body.email).trim()) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@umak\.edu\.ph$/i;
    if (!emailRegex.test(String(req.body.email).trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted."
      });
    }
  }

  const userId = req.user.id;
  const userRole = req.user.role;

  // Retrieve current user to obtain immutable identifiers
  const currentUser = await (db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  if (!currentUser) {
    return res.status(404).json({ success: false, message: 'User record not found' });
  }

  const studentId = currentUser.student_id || currentUser.id_number || '';
  const rawEmail = req.body.email;
  const cleanEmail = (rawEmail && String(rawEmail).trim()) ? String(rawEmail).trim().toLowerCase() : currentUser.email;
  const cleanCollege = college || req.body.college || currentUser.college || '';
  const cleanProgram = req.body.program !== undefined ? req.body.program : (currentUser.program || '');
  const cleanYear = year_level || yearLevel || currentUser.year_level || '';
  const cleanContact = contact_number || contactNumber || req.body.phone || currentUser.phone || currentUser.contact_number || '';
  const cleanEmergency = emergency_contact || emergencyContact || emergencyContactPerson || emergencyContactNumber || currentUser.emergency_contact || '';
  const cleanAvatar = avatar !== undefined ? avatar : (avatarUrl !== undefined ? avatarUrl : (req.body.avatar_url || currentUser.avatar || currentUser.avatar_url || null));

  // Execute atomic cascade across entire schema
  const updateCascade = db.transaction(() => {
    // 1. Update primary users record
    db.prepare(`
      UPDATE users 
      SET name = ?, 
          email = ?, 
          phone = ?, 
          contact_number = ?, 
          college = ?, 
          program = ?, 
          year_level = ?, 
          emergency_contact = ?, 
          avatar = COALESCE(?, avatar), 
          avatar_url = COALESCE(?, avatar_url), 
          updated_at = datetime('now')
      WHERE id = ?
    `).run(cleanName, cleanEmail, cleanContact, cleanContact, cleanCollege, cleanProgram, cleanYear, cleanEmergency, cleanAvatar, cleanAvatar, userId);

    // 2. Cascade if user is a Student
    if (userRole === 'student' && studentId) {
      // Update appointments where student is participant
      db.prepare(`
        UPDATE appointments 
        SET student_name = ?, student_college = ?, college = ?, student_contact = COALESCE(?, student_contact)
        WHERE student_id = ? OR student_id = ?
      `).run(cleanName, cleanCollege, cleanCollege, cleanContact, studentId, String(userId));

      // Update faculty endorsements / referrals
      db.prepare(`
        UPDATE faculty_referrals 
        SET student_name = ?, student_college = ?
        WHERE student_id = ? OR student_id = ?
      `).run(cleanName, cleanCollege, studentId, String(userId));

      // Update crisis alerts
      db.prepare(`
        UPDATE crisis_alerts 
        SET student_name = ?, student_college = ?
        WHERE student_id = ? OR student_id = ?
      `).run(cleanName, cleanCollege, studentId, String(userId));

      // Update clinical SOAP notes referencing student
      db.prepare(`
        UPDATE soap_notes 
        SET student_name = ? 
        WHERE student_id = ? OR student_id = ?
      `).run(cleanName, studentId, String(userId));

      // Update delegated access requests referencing student
      db.prepare(`
        UPDATE delegated_access_requests 
        SET student_name = ? 
        WHERE student_id = ? OR student_id = ?
      `).run(cleanName, studentId, String(userId));
    }

    // 3. Cascade if user is a Counselor or Director
    if (userRole === 'counselor' || userRole === 'director') {
      // Update appointments assigned to counselor
      db.prepare(`
        UPDATE appointments 
        SET counselor_name = ?, counselor_college = COALESCE(?, counselor_college)
        WHERE counselor_id = ? OR counselor_name = ?
      `).run(cleanName, cleanCollege, userId, currentUser.name);

      // Update SOAP clinical author
      db.prepare(`
        UPDATE soap_notes 
        SET counselor_name = ?
        WHERE counselor_id = ? OR counselor_name = ?
      `).run(cleanName, userId, currentUser.name);

      // Update faculty referral intake assignments
      db.prepare(`
        UPDATE faculty_referrals 
        SET assigned_counselor_name = ?
        WHERE assigned_counselor_id = ? OR assigned_counselor_name = ?
      `).run(cleanName, userId, currentUser.name);

      // Update delegated access requester or target counselor fields
      db.prepare(`
        UPDATE delegated_access_requests 
        SET requester_name = ?, requesting_counselor_name = ?
        WHERE requester_id = ? OR requester_name = ? OR requesting_counselor_id = ? OR requesting_counselor_name = ?
      `).run(cleanName, cleanName, userId, currentUser.name, userId, currentUser.name);

      db.prepare(`
        UPDATE delegated_access_requests 
        SET target_counselor = ?, target_counselor_name = ?
        WHERE target_counselor = ? OR target_counselor_name = ? OR target_counselor_id = ?
      `).run(cleanName, cleanName, currentUser.name, currentUser.name, userId);
    }
  });

  try {
    await updateCascade();

    // Fetch freshly updated profile record
    const updatedUser = await db.prepare(`
      SELECT id, student_id, id_number, name, email, role, college, program, year_level, phone, contact_number, emergency_contact, avatar, avatar_url 
      FROM users 
      WHERE id = ?
    `).get(userId);

    const rawUpdatedPhone = updatedUser.phone || updatedUser.contact_number || '';
    updatedUser.phone = (typeof decryptData === 'function') ? decryptData(rawUpdatedPhone) : rawUpdatedPhone;
    updatedUser.contact_number = updatedUser.phone;
    updatedUser.contactNumber = updatedUser.phone;
    updatedUser.avatar = updatedUser.avatar || updatedUser.avatar_url || null;
    updatedUser.avatarUrl = updatedUser.avatar;
    updatedUser.studentId = updatedUser.student_id || updatedUser.id_number || '';
    const rawUpdatedEmergency = updatedUser.emergency_contact || '';
    const decryptedEmergency = (typeof decryptData === 'function') ? decryptData(rawUpdatedEmergency) : rawUpdatedEmergency;
    updatedUser.emergency_contact = decryptedEmergency;
    updatedUser.emergencyContactPerson = decryptedEmergency;
    updatedUser.emergencyContactNumber = decryptedEmergency;

    const tokenPayload = typeof buildTokenPayload === 'function' ? buildTokenPayload(updatedUser) : { id: updatedUser.id, role: updatedUser.role, email: updatedUser.email, name: updatedUser.name };
    const newToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    res.json({ success: true, message: 'Profile updated successfully.', user: updatedUser, token: newToken });
  } catch (err) {
    console.error('Cascading profile database update failed:', err);
    res.status(500).json({ success: false, message: 'Database transaction error updating profile' });
  }
};

app.put('/api/users/profile', authenticateToken, handleUserProfileUpdate);
app.put('/api/user/profile', authenticateToken, handleUserProfileUpdate);
app.patch('/api/users/profile', authenticateToken, handleUserProfileUpdate);
app.patch('/api/user/profile', authenticateToken, handleUserProfileUpdate);

// Helper: Parse dateStr ('YYYY-MM-DD') and timeSlotStr ('08:30 AM - 09:30 AM') into Date objects
function parseAppointmentDateRange(dateStr, timeSlotStr) {
  if (!dateStr) return { startTime: null, endTime: null };

  let startTimeStr = '08:00 AM';
  let endTimeStr = '05:00 PM';

  if (timeSlotStr) {
    if (timeSlotStr.includes('-')) {
      const parts = timeSlotStr.split('-');
      startTimeStr = parts[0].trim();
      endTimeStr = parts[1].trim();
    } else {
      startTimeStr = timeSlotStr.trim();
      endTimeStr = timeSlotStr.trim();
    }
  }

  function parseSingleTime(datePrefix, timeStr) {
    const parts = datePrefix.split('-').map(v => parseInt(v, 10));
    const dt = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    if (!timeStr) return dt;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return dt;
    let [_, hStr, mStr, meridian] = match;
    let hours = parseInt(hStr, 10);
    const mins = parseInt(mStr, 10);
    if (meridian) {
      const mer = meridian.toUpperCase();
      if (mer === 'PM' && hours < 12) hours += 12;
      if (mer === 'AM' && hours === 12) hours = 0;
    }
    dt.setHours(hours, mins, 0, 0);
    return dt;
  }

  const startTime = parseSingleTime(dateStr, startTimeStr);
  const endTime = parseSingleTime(dateStr, endTimeStr);

  if (endTime.getTime() <= startTime.getTime()) {
    endTime.setTime(startTime.getTime() + 60 * 60 * 1000);
  }

  return { startTime, endTime };
}

// Helper: Check if two appointment slots overlap in time on the same date
function checkTimeSlotsOverlap(dateA, slotA, dateB, slotB) {
  if (!dateA || !dateB || dateA !== dateB) return false;
  if (slotA && slotB && slotA.trim().toLowerCase() === slotB.trim().toLowerCase()) return true;

  const rangeA = parseAppointmentDateRange(dateA, slotA);
  const rangeB = parseAppointmentDateRange(dateB, slotB);
  if (!rangeA.startTime || !rangeA.endTime || !rangeB.startTime || !rangeB.endTime) {
    return false;
  }
  return (rangeA.startTime.getTime() < rangeB.endTime.getTime()) && (rangeB.startTime.getTime() < rangeA.endTime.getTime());
}

// Automated Triage Engine: Resolve Counselor based on Multi-Specialization and Lowest Daily Load
async function resolveAutoTriageCounselor(counselingType, date, timeSlot) {
  try {
    const focusStr = (counselingType || '').toLowerCase().trim();

    // Helper: Normalize focus strings for fuzzy topic matching
    const focusKeywords = [];
    if (focusStr.includes('personal') || focusStr.includes('family') || focusStr.includes('career') || focusStr.includes('relationship') || focusStr.includes('interpersonal')) {
      focusKeywords.push('personal', 'family', 'career');
    }
    if (focusStr.includes('academic') || focusStr.includes('learning') || focusStr.includes('thesis') || focusStr.includes('adjustment') || focusStr.includes('routine')) {
      focusKeywords.push('academic', 'learning', 'adjustment');
    }
    if (focusStr.includes('crisis') || focusStr.includes('trauma') || focusStr.includes('urgent')) {
      focusKeywords.push('crisis', 'trauma');
    }
    if (focusStr.includes('mental health') || focusStr.includes('emotional') || focusStr.includes('regulation') || focusStr.includes('stress')) {
      focusKeywords.push('mental health', 'emotional');
    }

    // Fetch all active verified counselors with current active caseload count
    const counselors = await db.allAsync(`
      SELECT u.id, u.name, u.email, u.specialization,
        (SELECT COUNT(*) FROM appointments a 
         WHERE (a.counselor_id = u.id OR a.counselor_name = u.name)
           AND a.status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled')) as active_caseload
      FROM users u
      WHERE LOWER(u.role) = 'counselor' AND (u.status = 'Active' OR u.status IS NULL) AND (u.is_verified = 1 OR u.is_verified IS NULL)
      ORDER BY active_caseload ASC
    `);

    if (!counselors || counselors.length === 0) {
      return {
        id: 'USR-CNS-001',
        name: 'Dr. Ma. Elena Santos, RGC',
        specialization: 'Personal, Family & Career Development'
      };
    }

    // Helper: Calculate daily appointment load on the requested date (status NOT IN ('Declined', 'Cancelled'))
    const attachDailyLoad = async (list) => {
      if (!date) return;
      for (const cand of list) {
        const row = await db.getAsync(`
          SELECT COUNT(*) as daily_load 
          FROM appointments 
          WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
            AND date = ?
            AND status NOT IN ('Declined', 'Cancelled')
        `, [cand.id, cand.name, cand.name, date]);
        cand.lowest_daily_load = row ? (row.daily_load || 0) : 0;
      }
      list.sort((a, b) => (a.lowest_daily_load - b.lowest_daily_load) || (a.active_caseload - b.active_caseload));
    };

    // Helper: Check if counselor has overlapping appointment on date and timeSlot
    const isCounselorFree = async (counselor) => {
      if (!date || !timeSlot) return true;
      const booked = await db.allAsync(`
        SELECT date, time_slot FROM appointments
        WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
          AND date = ?
          AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled')
      `, [counselor.id, counselor.name, counselor.name, date]);

      for (const b of booked) {
        if (checkTimeSlotsOverlap(date, timeSlot, b.date, b.time_slot)) {
          return false;
        }
      }
      return true;
    };

    // Filter counselors matching ANY of their assigned 2-3 specializations
    const matchedCounselors = counselors.filter(c => {
      if (!c.specialization) return false;
      const specList = c.specialization.split('|').map(s => s.trim().toLowerCase());
      return specList.some(spec => {
        if (!spec) return false;
        if (spec.includes(focusStr) || focusStr.includes(spec)) return true;
        return focusKeywords.some(kw => spec.includes(kw));
      });
    });

    if (matchedCounselors.length > 0) {
      await attachDailyLoad(matchedCounselors);
      // Pick available matched counselor with lowest daily load on that date
      for (const cand of matchedCounselors) {
        if (await isCounselorFree(cand)) {
          return cand;
        }
      }
    }

    // Fallback: Check counselors with 'General Guidance & Counseling'
    const generalCounselors = counselors.filter(c => {
      const spec = (c.specialization || '').toLowerCase();
      return spec.includes('general guidance');
    });

    if (generalCounselors.length > 0) {
      await attachDailyLoad(generalCounselors);
      for (const cand of generalCounselors) {
        if (await isCounselorFree(cand)) {
          return cand;
        }
      }
    }

    // Fallback: Check any active licensed counselor sorted by lowest daily load
    await attachDailyLoad(counselors);
    for (const cand of counselors) {
      if (await isCounselorFree(cand)) {
        return cand;
      }
    }

    // If all are booked in that slot, assign candidate with lowest daily load
    return matchedCounselors[0] || counselors[0];
  } catch (err) {
    console.error('Error in resolveAutoTriageCounselor:', err);
    return {
      id: 'USR-CNS-001',
      name: 'Dr. Ma. Elena Santos, RGC',
      specialization: 'Personal, Family & Career Development'
    };
  }
}

// 1. Automated Expired Appointment Cleanup
async function cleanupExpiredAppointments() {
  try {
    const pendingAppointments = await db.allAsync(`
      SELECT id, student_id, student_name, date, time_slot, status 
      FROM appointments 
      WHERE status = 'Pending'
    `);

    const now = new Date();
    let expiredCount = 0;

    for (const appt of pendingAppointments) {
      const { endTime } = parseAppointmentDateRange(appt.date, appt.time_slot);
      if (endTime && endTime.getTime() < now.getTime()) {
        await db.runAsync(`UPDATE appointments SET status = 'Expired' WHERE id = ?`, [appt.id]);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      await logActivity('System Cron', 'system', 'EXPIRED_APPOINTMENTS_CLEANUP', `Cleaned up and moved ${expiredCount} past pending appointment(s) to Expired status`);
    }
  } catch (err) {
    console.error('Error during expired appointment cleanup:', err);
  }
}

// 2. Proactive Session Reminders Dispatcher (15 minutes prior & Session Start)
async function dispatchSessionReminders() {
  try {
    const approvedAppointments = await db.allAsync(`
      SELECT id, student_id, student_name, email, counselor_name, date, time_slot, mode, meeting_link 
      FROM appointments 
      WHERE status IN ('Approved', 'Confirmed')
    `);

    const now = new Date();

    for (const appt of approvedAppointments) {
      const { startTime, endTime } = parseAppointmentDateRange(appt.date, appt.time_slot);
      if (!startTime || !endTime) continue;

      const diffMs = startTime.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / (60 * 1000));

      // A. 15-Minute Reminder (between 10 and 16 minutes before session)
      if (diffMins >= 10 && diffMins <= 16) {
        const notifTitleStudent = '⏰ Tele-Counseling Session in 15 Minutes';
        const existing = await db.getAsync(`SELECT id FROM notifications WHERE user_id = ? AND title = ? AND created_at >= datetime("now", "-30 minutes")`, [appt.student_id, notifTitleStudent]);
        if (!existing) {
          createNotification({
            userId: appt.student_id,
            title: notifTitleStudent,
            message: `Reminder: Your scheduled tele-counseling session starts in 15 minutes (${appt.time_slot}). Your assigned CGCS specialist will meet you in the room.`,
            type: 'appointment'
          });

          createNotification({
            targetRole: 'counselor',
            title: '⏰ Upcoming Counseling Session in 15 Min',
            message: `Upcoming Session: Consultation with student ${appt.student_name} starts in 15 minutes (${appt.time_slot}).`,
            type: 'appointment'
          });
        }
      }

      // B. Video Room Active Alert (within 10 min pre-call window up to session end)
      if (now.getTime() >= (startTime.getTime() - 10 * 60 * 1000) && now.getTime() <= endTime.getTime()) {
        const notifTitleRoom = '🟢 Video Room Is Now Active';
        const existing = await db.getAsync(`SELECT id FROM notifications WHERE user_id = ? AND title = ? AND created_at >= datetime("now", "-30 minutes")`, [appt.student_id, notifTitleRoom]);
        if (!existing) {
          createNotification({
            userId: appt.student_id,
            title: notifTitleRoom,
            message: `Your Video Room for tele-counseling is now open and active. Click to enter your private consultation stage.`,
            type: 'appointment'
          });

          createNotification({
            targetRole: 'counselor',
            title: notifTitleRoom,
            message: `Tele-counseling room for ${appt.student_name} is active. Click to join the consultation.`,
            type: 'appointment'
          });
        }
      }
    }
  } catch (err) {
    console.error('Error dispatching session reminders:', err);
  }
}

// ----------------------------------------------------
// RBAC ROUTE GUARDS & PATH ISOLATION MIDDLEWARES
// ----------------------------------------------------

// 1. Strict Student Guard: /api/student/* (student role only)
app.use('/api/student', authenticateJWT, (req, res, next) => {
  if (req.user?.role !== 'student') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Authorized for student role only.'
    });
  }
  next();
});

// 2. Strict Counselor Guard: /api/counselor/* (counselor & director roles)
app.use('/api/counselor', authenticateJWT, (req, res, next) => {
  if (req.path.startsWith('/live-chat') && ['counselor', 'student', 'superadmin', 'director'].includes(req.user?.role)) {
    return next();
  }
  if (['counselor', 'director', 'superadmin'].includes(req.user?.role)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied. Authorized for counselor only.'
  });
});

// 3. Strict Directorate Guard: /api/admin/* (director role only, with status moderation allowed for counselors)
app.use('/api/admin', authenticateJWT, (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (role === 'director' || role === 'superadmin' || role === 'admin') {
    return next();
  }
  // Allow guidance counselors to verify student accounts via status endpoint
  if (role === 'counselor' && req.path.includes('/status')) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied. Directorate only.'
  });
});

// Dedicated Student Sub-Endpoints
app.get('/api/student/dashboard', (req, res) => {
  res.json({ success: true, message: 'Welcome to Student Portal', user: req.user });
});

app.get(['/api/student/appointments', '/api/appointments/my'], authenticateJWT, async (req, res) => {
  try {
    await cleanupExpiredAppointments();
    const userId = req.user.id;
    const userStudentId = req.user.student_id || req.user.studentId || '';
    const userEmail = (req.user.email || '').trim().toLowerCase();

    const studentApptsQuery = `
      SELECT a.*, 
             s.id AS soap_note_id,
             CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_soap,
             CASE WHEN sf.id IS NOT NULL OR a.feedback_submitted = 1 THEN 1 ELSE 0 END AS feedback_submitted
      FROM appointments a
      LEFT JOIN soap_notes s ON s.appointment_id = a.id
      LEFT JOIN session_feedback sf ON sf.appointment_id = a.id
      WHERE (
        a.student_id = ? 
        OR a.student_id = ? 
        OR a.student_id IN (SELECT student_id FROM users WHERE id = ? OR LOWER(email) = ?)
        OR LOWER(a.email) = ?
      )
      ORDER BY 
        CASE 
          WHEN a.status IN ('Approved', 'Confirmed', 'Pending Reschedule', 'Pending') THEN 1 
          ELSE 2 
        END,
        a.date ASC, 
        a.time_slot ASC
    `;
    const appts = await db.allAsync(studentApptsQuery, [
      userId, 
      userStudentId, 
      userId, 
      userEmail, 
      userEmail
    ]);
    const todayString = getPhilippineISOString().split('T')[0];

    const formatted = appts.map(r => ({
      ...r,
      contact_number: decryptData(r.contact_number),
      isToday: r.date === todayString,
      hasSoap: Boolean(r.has_soap || r.soap_note_id),
      feedback_submitted: Boolean(r.feedback_submitted),
      counselor_display: r.counselor_name || 'Assigned CGCS Licensed Counselor'
    }));

    // Sort appointments: Earliest upcoming first (FIFO)
    formatted.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time_slot ? a.time_slot.split('-')[0].trim() : '00:00'}`);
      const dateB = new Date(`${b.date} ${b.time_slot ? b.time_slot.split('-')[0].trim() : '00:00'}`);
      const tA = isNaN(dateA.getTime()) ? new Date(a.date).getTime() : dateA.getTime();
      const tB = isNaN(dateB.getTime()) ? new Date(b.date).getTime() : dateB.getTime();
      return tA - tB; // Ascending: Earliest session appears first
    });

    return res.json({ success: true, appointments: formatted, data: formatted });
  } catch (err) {
    console.error('Error in student appointments endpoint:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve appointments.' });
  }
});

app.get('/api/student/assessments', authenticateJWT, async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT * FROM assessments WHERE (student_id = ? OR student_id = ? OR LOWER(student_email) = LOWER(?)) ORDER BY created_at DESC',
      [req.user.id, req.user.studentId || '', req.user.email || '']
    );
    const formatted = rows.map(r => ({
      ...r,
      answers_json: decryptData(r.answers_json),
      recommendations: decryptData(r.recommendations)
    }));
    res.json({ success: true, total: formatted.length, data: formatted });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error retrieving student assessments.' });
  }
});

// ==============================================================================
// 1. Student Submits Anonymous Consultation Feedback (POST /api/appointments/:id/feedback)
// Strictly Zero-PII (Privacy-by-Design under RA 10173)
// ==============================================================================
app.post('/api/appointments/:id/feedback', authenticateToken, async (req, res) => {
  const { id } = req.params; // appointment_id
  const ratingHelpfulness = req.body.ratingHelpfulness !== undefined ? req.body.ratingHelpfulness : req.body.helpfulness;
  const ratingEmpathy = req.body.ratingEmpathy !== undefined ? req.body.ratingEmpathy : req.body.empathy;
  const ratingEase = req.body.ratingEase !== undefined ? req.body.ratingEase : req.body.ease;
  const studentReflection = req.body.studentReflection !== undefined ? req.body.studentReflection : req.body.comments;

  if (!ratingHelpfulness || !ratingEmpathy || !ratingEase) {
    return res.status(400).json({ success: false, message: 'Please provide ratings for all 3 questions.' });
  }

  try {
    // 1. Verify appointment exists and is completed
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    if (appt.status !== 'Completed') {
      return res.status(400).json({ success: false, message: 'Feedback can only be submitted for completed sessions.' });
    }

    // 2. Check if feedback already submitted
    const existing = await db.getAsync('SELECT id FROM consultation_feedbacks WHERE appointment_id = ?', [id]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Feedback for this session has already been recorded. Thank you!' });
    }

    // 3. Compute overall average score
    const avg = ((Number(ratingHelpfulness) + Number(ratingEmpathy) + Number(ratingEase)) / 3).toFixed(1);
    const feedbackId = `FB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    // 4. Save to database WITHOUT student identity (Strict DPA 2012 Compliance)
    await db.runAsync(`
      INSERT INTO consultation_feedbacks (
        id, appointment_id, counselor_id, counselor_name,
        rating_helpfulness, rating_empathy, rating_ease, average_score, student_reflection, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      feedbackId,
      id,
      appt.counselor_id || 'USR-CNS-001',
      appt.counselor_name || 'Assigned Counselor',
      ratingHelpfulness,
      ratingEmpathy,
      ratingEase,
      avg,
      (studentReflection || '').trim()
    ]);

    try {
      await db.runAsync("UPDATE appointments SET feedback_submitted = 1 WHERE id = ?", [id]);
    } catch (e) {}

    // Legacy session_feedback insertion for backwards compatibility
    try {
      await db.runAsync(`
        INSERT INTO session_feedback (id, appointment_id, student_id, counselor_id, helpfulness, empathy, ease, comments, created_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
      `, [feedbackId, id, appt.counselor_id || null, parseInt(ratingHelpfulness, 10), parseInt(ratingEmpathy, 10), parseInt(ratingEase, 10), (studentReflection || '').trim() || null]);
    } catch (e) {}

    // 5. Send an ANONYMOUS notification to the assigned counselor
    if (appt.counselor_id) {
      createTargetedNotification({
        recipientId: appt.counselor_id,
        senderId: null, // Keep anonymous
        senderName: 'Anonymous Student Feedback',
        title: 'New Student Session Feedback Received',
        message: `A student from a completed consultation submitted an evaluation (Overall: ${avg}★). View feedback in your Quality Desk.`,
        type: 'feedback_received',
        actionLink: 'counselor-feedback',
        referenceId: feedbackId
      });
    }

    res.json({ success: true, message: 'Thank you! Your confidential feedback has been submitted.', feedbackId });
  } catch (err) {
    console.error('Error saving feedback:', err);
    res.status(500).json({ success: false, message: 'Failed to record session feedback.' });
  }
});

// Backward-compatible fallback for POST /api/feedback
app.post('/api/feedback', authenticateToken, async (req, res) => {
  const appointmentId = req.body.appointmentId || null;
  const ratingHelpfulness = req.body.ratingHelpfulness !== undefined ? req.body.ratingHelpfulness : req.body.helpfulness;
  const ratingEmpathy = req.body.ratingEmpathy !== undefined ? req.body.ratingEmpathy : req.body.empathy;
  const ratingEase = req.body.ratingEase !== undefined ? req.body.ratingEase : req.body.ease;
  const studentReflection = req.body.studentReflection !== undefined ? req.body.studentReflection : req.body.comments;

  if (!ratingHelpfulness || !ratingEmpathy || !ratingEase) {
    return res.status(400).json({ success: false, message: 'Please provide ratings for all 3 questions.' });
  }
  const feedbackId = `FB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const avg = ((Number(ratingHelpfulness) + Number(ratingEmpathy) + Number(ratingEase)) / 3).toFixed(1);

  try {
    let counselorId = 'USR-CNS-001';
    let counselorName = 'Assigned Counselor';
    if (appointmentId) {
      const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
      if (appt) {
        counselorId = appt.counselor_id || counselorId;
        counselorName = appt.counselor_name || counselorName;
        await db.runAsync('UPDATE appointments SET feedback_submitted = 1 WHERE id = ?', [appointmentId]).catch(() => {});
      }
    }

    await db.runAsync(`
      INSERT OR REPLACE INTO consultation_feedbacks (
        id, appointment_id, counselor_id, counselor_name,
        rating_helpfulness, rating_empathy, rating_ease, average_score, student_reflection, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      feedbackId,
      appointmentId || feedbackId,
      counselorId,
      counselorName,
      ratingHelpfulness,
      ratingEmpathy,
      ratingEase,
      avg,
      (studentReflection || '').trim()
    ]);

    await db.runAsync(`
      INSERT INTO session_feedback (id, appointment_id, student_id, counselor_id, helpfulness, empathy, ease, comments, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
    `, [feedbackId, appointmentId || null, counselorId, parseInt(ratingHelpfulness, 10), parseInt(ratingEmpathy, 10), parseInt(ratingEase, 10), (studentReflection || '').trim() || null]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Thank you for your confidential feedback! Your responses help CGCS enhance guidance services for all Herons.',
      feedbackId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to record feedback.' });
  }
});

// ==============================================================================
// 2. Counselor Retrieves Their Anonymous Feedback (GET /api/counselor/feedbacks)
// Strictly De-Identified, Counselor-Isolated (or All for Director/SuperAdmin)
// ==============================================================================
app.get('/api/counselor/feedbacks', authenticateToken, requireRole('counselor', 'director', 'superadmin'), async (req, res) => {
  try {
    const counselorId = req.user.id;
    const isDirector = ['director', 'superadmin'].includes(req.user.role.toLowerCase());
    let query = '';
    let params = [];
    if (isDirector) {
      // Director can view all counselor evaluations
      query = `SELECT * FROM consultation_feedbacks ORDER BY created_at DESC LIMIT 100`;
    } else {
      // Counselor sees ONLY their own evaluations
      query = `
        SELECT id, rating_helpfulness, rating_empathy, rating_ease, average_score, student_reflection, created_at 
        FROM consultation_feedbacks 
        WHERE counselor_id = ? OR counselor_name LIKE ?
        ORDER BY created_at DESC LIMIT 100
      `;
      params = [counselorId, `%${req.user.name || ''}%`];
    }
    const rows = await db.allAsync(query, params);
    // Compute Counselor Overall Averages
    const totalCount = rows.length;
    let avgOverall = 0, avgHelp = 0, avgEmpathy = 0, avgEase = 0;
    if (totalCount > 0) {
      avgOverall = (rows.reduce((sum, r) => sum + Number(r.average_score), 0) / totalCount).toFixed(1);
      avgHelp = (rows.reduce((sum, r) => sum + Number(r.rating_helpfulness), 0) / totalCount).toFixed(1);
      avgEmpathy = (rows.reduce((sum, r) => sum + Number(r.rating_empathy), 0) / totalCount).toFixed(1);
      avgEase = (rows.reduce((sum, r) => sum + Number(r.rating_ease), 0) / totalCount).toFixed(1);
    }
    res.json({
      success: true,
      stats: {
        totalEvaluations: totalCount,
        overallRating: avgOverall,
        helpfulnessRating: avgHelp,
        empathyRating: avgEmpathy,
        easeRating: avgEase
      },
      feedbacks: rows // Completely de-identified (no student names or IDs)
    });
  } catch (err) {
    console.error('Error loading counselor feedbacks:', err);
    res.status(500).json({ success: false, message: 'Failed to load feedback records.' });
  }
});

// Aggregate CSAT stats for Directorate (Confidential / Anonymous)
app.get('/api/feedback/stats', authenticateJWT, async (req, res) => {
  try {
    const stats = await db.getAsync(`
      SELECT 
        COUNT(*) as total_responses,
        ROUND(AVG(helpfulness), 2) as avg_helpfulness,
        ROUND(AVG(empathy), 2) as avg_empathy,
        ROUND(AVG(ease), 2) as avg_ease,
        ROUND(AVG((helpfulness + empathy + ease) / 3.0), 2) as overall_csat
      FROM session_feedback
    `);
    return res.json({ success: true, stats: stats || { total_responses: 0, avg_helpfulness: 0, avg_empathy: 0, avg_ease: 0, overall_csat: 0 } });
  } catch (err) {
    console.error('Error fetching CSAT stats:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve feedback stats.' });
  }
});

app.get('/api/student/mood', async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT * FROM mood_logs WHERE student_id = ? OR student_email = ? ORDER BY created_at DESC',
      [req.user.studentId || '', req.user.email]
    );
    res.json({ success: true, total: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error retrieving student mood logs.' });
  }
});

// Executive Logs Route - Protected for Director Only
app.get('/api/executive-logs', authenticateJWT, (req, res, next) => {
  if (req.user?.role !== 'director' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Access denied. Directorate executive logs only.' });
  }
  next();
}, async (req, res) => {
  try {
    const logs = await db.allAsync('SELECT * FROM audit_logs ORDER BY datetime(timestamp) DESC LIMIT 50');
    res.json({ success: true, total: logs.length, data: sanitizeAuditLogsForZeroPii(logs) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error retrieving executive logs.' });
  }
});

// ----------------------------------------------------
// 2. APPOINTMENTS & SCHEDULING (RBAC ISOLATED & WORKFLOWS)
// ----------------------------------------------------


app.get('/api/appointments', authenticateJWT, async (req, res) => {
  try {
    // Run cleanup on fetch to ensure live status accuracy
    await cleanupExpiredAppointments();

    const { status, college, search, date, urgency, includeArchived, student_id } = req.query;
    const userRole = (req.user.role || '').toLowerCase();
    const isStudent = userRole === 'student';
    const isCounselor = userRole === 'counselor';
    const hasSearchOrDate = Boolean((search && search.trim()) || (date && date.trim()) || (status && status !== 'all') || (college && college !== 'all') || (urgency && urgency !== 'all'));

    let sql = `
      SELECT a.*, 
             s.id AS soap_note_id,
             CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_soap
      FROM appointments a
      LEFT JOIN soap_notes s ON s.appointment_id = a.id
      WHERE 1=1
    `;
    const params = [];

    // RBAC: Data Isolation for Students and Counselors (Unified Multi-Key Matching for Students)
    if (isStudent) {
      const userId = req.user.id;
      const userStudentId = req.user.student_id || req.user.studentId || '';
      const userEmail = (req.user.email || '').trim().toLowerCase();
      sql += `
        AND (
          a.student_id = ? 
          OR a.student_id = ? 
          OR a.student_id IN (SELECT student_id FROM users WHERE id = ? OR LOWER(email) = ?)
          OR LOWER(a.email) = ?
        )
      `;
      params.push(userId, userStudentId, userId, userEmail, userEmail);
    } else if (isCounselor) {
      // Counselor Queue Isolation: Counselors can ONLY see appointments assigned to them
      sql += ' AND (a.counselor_id = ? OR a.counselor_name = ? OR LOWER(a.counselor_name) = LOWER(?))';
      params.push(req.user.id, req.user.name, req.user.name);
    } else if (student_id) {
      sql += ' AND (a.student_id = ? OR a.student_id = ?)';
      params.push(student_id, student_id);
    }

    if (hasSearchOrDate) {
      // Historical Search & Date Picker: Query matching appointments without excluding completed SOAP records
      if (date && date.trim()) {
        sql += ' AND a.date = ?';
        params.push(date.trim());
      }
      if (search && search.trim()) {
        sql += ' AND (a.id LIKE ? OR a.student_name LIKE ? OR a.student_id LIKE ? OR a.counseling_type LIKE ? OR a.reason LIKE ?)';
        const q = `%${search.trim()}%`;
        params.push(q, q, q, q, q);
      }
      if (status && status !== 'all') {
        sql += ' AND LOWER(a.status) = LOWER(?)';
        params.push(status);
      }
      if (college && college !== 'all') {
        sql += ' AND UPPER(a.college) = UPPER(?)';
        params.push(college);
      }
      if (urgency && urgency !== 'all') {
        sql += ' AND LOWER(a.urgency) = LOWER(?)';
        params.push(urgency);
      }
      sql += ' ORDER BY a.date DESC, a.time_slot ASC, a.created_at DESC';
    } else {
      // Default Active View:
      if (isCounselor || req.user.role === 'director' || req.user.role === 'superadmin') {
        if (!includeArchived || includeArchived === 'false') {
          // FIFO Queue Ordering & SOAP-Completion Auto-Archive:
          // Concluded sessions whose SOAP note has been filed are auto-archived.
          // Concluded sessions without SOAP note remain active so counselor can complete the SOAP note.
          sql += `
            AND a.status NOT IN ('Declined', 'Cancelled', 'Expired', 'System Cancelled')
            AND (
              a.status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Ongoing', 'Pending Reschedule')
              OR (a.status IN ('Completed', 'Concluded') AND s.id IS NULL)
            )
          `;
        }
      }

      if (status && status !== 'all') {
        sql += ' AND LOWER(a.status) = LOWER(?)';
        params.push(status);
      }
      if (college && college !== 'all') {
        sql += ' AND UPPER(a.college) = UPPER(?)';
        params.push(college);
      }
      if (urgency && urgency !== 'all') {
        sql += ' AND LOWER(a.urgency) = LOWER(?)';
        params.push(urgency);
      }

      if (isCounselor) {
        // Enforce FIFO: earliest scheduled date & time slot first, keeping sessions with pending SOAP notes visible
        sql += ' ORDER BY a.date ASC, a.time_slot ASC, a.created_at ASC';
      } else if (isStudent) {
        sql += `
          ORDER BY 
            CASE 
              WHEN a.status IN ('Approved', 'Confirmed', 'Pending Reschedule', 'Pending') THEN 1 
              ELSE 2 
            END,
            a.date ASC, 
            a.time_slot ASC
        `;
      } else {
        sql += ' ORDER BY a.date DESC, a.time_slot ASC, a.created_at DESC';
      }
    }

    const rows = await db.allAsync(sql, params);
    const todayString = getPhilippineISOString().split('T')[0];

    const formatted = rows.map(r => {
      const item = {
        ...r,
        contact_number: decryptData(r.contact_number),
        isToday: r.date === todayString,
        hasSoap: Boolean(r.has_soap || r.soap_note_id)
      };
      if (isStudent) {
        item.counselor_display = item.counselor_name || 'Assigned CGCS Licensed Counselor';
        delete item.counselor_id;
      }
      return item;
    });

    if (isStudent) {
      formatted.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time_slot ? a.time_slot.split('-')[0].trim() : '00:00'}`);
        const dateB = new Date(`${b.date} ${b.time_slot ? b.time_slot.split('-')[0].trim() : '00:00'}`);
        const tA = isNaN(dateA.getTime()) ? new Date(a.date).getTime() : dateA.getTime();
        const tB = isNaN(dateB.getTime()) ? new Date(b.date).getTime() : dateB.getTime();
        return tA - tB;
      });
    }

    // Compute distinct active session students (Approved, Rescheduled, Ongoing)
    const activeStudentsQuery = isCounselor
      ? await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
            AND status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `, [req.user.id, req.user.name, req.user.name])
      : await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `);

    const totalActiveStudentsTakingSessions = activeStudentsQuery ? activeStudentsQuery.total : 0;

    res.json({
      success: true,
      total: formatted.length,
      appointments: formatted,
      data: formatted,
      totalActiveStudentsTakingSessions
    });
  } catch (err) {
    console.error('Error in GET /api/appointments:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve appointments.' });
  }
});

// GET /api/counselor/queue - Isolated Counselor Queue Endpoint
app.get('/api/counselor/queue', authenticateJWT, requireRole('counselor', 'director', 'superadmin'), async (req, res) => {
  try {
    await cleanupExpiredAppointments();
    const isCounselor = req.user.role === 'counselor';
    let sql = `
      SELECT a.*, 
             s.id AS soap_note_id,
             CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_soap
      FROM appointments a
      LEFT JOIN soap_notes s ON s.appointment_id = a.id
      WHERE 1=1
    `;
    const params = [];
    if (isCounselor) {
      sql += ' AND (a.counselor_id = ? OR a.counselor_name = ? OR LOWER(a.counselor_name) = LOWER(?))';
      params.push(req.user.id, req.user.name, req.user.name);
      sql += `
        AND a.status NOT IN ('Declined', 'Cancelled', 'Expired', 'System Cancelled')
        AND (
          a.status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Ongoing', 'Pending Reschedule')
          OR (a.status IN ('Completed', 'Concluded') AND s.id IS NULL)
        )
        ORDER BY a.date ASC, a.time_slot ASC, a.created_at ASC
      `;
    } else {
      sql += ' ORDER BY a.date DESC, a.created_at DESC';
    }

    const rows = await db.allAsync(sql, params);
    const todayString = getPhilippineISOString().split('T')[0];
    const formatted = rows.map(r => ({
      ...r,
      contact_number: decryptData(r.contact_number),
      isToday: r.date === todayString,
      hasSoap: Boolean(r.has_soap || r.soap_note_id)
    }));

    const activeStudentsQuery = isCounselor
      ? await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
            AND status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `, [req.user.id, req.user.name, req.user.name])
      : await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `);

    res.json({
      success: true,
      total: formatted.length,
      data: formatted,
      totalActiveStudentsTakingSessions: activeStudentsQuery ? activeStudentsQuery.total : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve counselor queue.' });
  }
});

// GET /api/appointments/stats and /api/counselor/queue-stats - KPI Metrics Endpoint
app.get(['/api/appointments/stats', '/api/counselor/queue-stats'], authenticateJWT, async (req, res) => {
  try {
    const isCounselor = req.user.role === 'counselor';
    const counselorFilter = isCounselor ? 'WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))' : '';
    const counselorParams = isCounselor ? [req.user.id, req.user.name, req.user.name] : [];

    const activeStudentsQuery = isCounselor
      ? await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
            AND status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `, counselorParams)
      : await db.getAsync(`
          SELECT COUNT(DISTINCT student_id) AS total
          FROM appointments
          WHERE status IN ('Approved', 'Rescheduled', 'Ongoing', 'Confirmed')
        `);

    const totalCaseloadQuery = isCounselor
      ? await db.getAsync(`SELECT COUNT(*) AS total FROM appointments ${counselorFilter}`, counselorParams)
      : await db.getAsync(`SELECT COUNT(*) AS total FROM appointments`);

    const pendingQuery = isCounselor
      ? await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Pending', 'Pending Reschedule') AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))`, counselorParams)
      : await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Pending', 'Pending Reschedule')`);

    const activeApptsQuery = isCounselor
      ? await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Approved', 'Confirmed', 'Rescheduled', 'Ongoing') AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))`, counselorParams)
      : await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Approved', 'Confirmed', 'Rescheduled', 'Ongoing')`);

    const completedQuery = isCounselor
      ? await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Completed', 'Concluded') AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))`, counselorParams)
      : await db.getAsync(`SELECT COUNT(*) AS total FROM appointments WHERE status IN ('Completed', 'Concluded')`);

    res.json({
      success: true,
      totalActiveStudentsTakingSessions: activeStudentsQuery ? activeStudentsQuery.total : 0,
      totalCaseload: totalCaseloadQuery ? totalCaseloadQuery.total : 0,
      awaitingApproval: pendingQuery ? pendingQuery.total : 0,
      approvedAndActive: activeApptsQuery ? activeApptsQuery.total : 0,
      completedSessions: completedQuery ? completedQuery.total : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments - Book Appointment (Starts as 'Pending')
app.post('/api/appointments', authenticateJWT, async (req, res) => {
  const {
    studentId,
    studentName,
    email,
    contactNumber,
    college,
    program,
    yearLevel,
    counselingType,
    counselorId,
    counselorName,
    date,
    timeSlot,
    mode,
    urgency,
    reason
  } = req.body;

  if (!studentId || !studentName || !email || !college || !date || !timeSlot || !counselingType) {
    return res.status(400).json({
      success: false,
      message: 'Required booking information missing (Student, College, Date, Time Slot, and Counseling Type).'
    });
  }

  const finalMode = mode || 'Face-to-Face Consultation (Admin Bldg Rm 304)';
  const finalUrgency = urgency || 'Medium';

  try {
    // 0. Intake Gatekeeper: Verify student completed initial mental health screening and health disclosure
    if (req.user && req.user.role === 'student') {
      const studentUser = await db.getAsync("SELECT has_completed_intake FROM users WHERE id = ? OR student_id = ? OR LOWER(email) = LOWER(?)", [req.user.id, req.user.studentId || req.user.id, req.user.email || '']);
      if (!studentUser || !studentUser.has_completed_intake) {
        return res.status(403).json({
          success: false,
          error: "MANDATORY_SCREENING_REQUIRED",
          message: "In accordance with CGCS clinical protocol, all students must complete the initial mental health screening and health disclosure before booking a consultation."
        });
      }

      // Mandatory Dual Screenings (PHQ-9 & GAD-7)
      const hasPHQ9 = await db.getAsync(
        "SELECT id FROM assessments WHERE (student_id = ? OR student_id = ? OR user_id = ? OR LOWER(student_email) = LOWER(?)) AND assessment_type = 'PHQ-9' LIMIT 1",
        [req.user.id, req.user.student_id || req.user.studentId || '', req.user.id, req.user.email || '']
      );
      const hasGAD7 = await db.getAsync(
        "SELECT id FROM assessments WHERE (student_id = ? OR student_id = ? OR user_id = ? OR LOWER(student_email) = LOWER(?)) AND assessment_type = 'GAD-7' LIMIT 1",
        [req.user.id, req.user.student_id || req.user.studentId || '', req.user.id, req.user.email || '']
      );
      if (!hasPHQ9 || !hasGAD7) {
        return res.status(403).json({
          success: false,
          error: "ASSESSMENT_REQUIRED",
          message: "In accordance with CGCS clinical protocol, please complete your foundational wellness inventories (Personal Well-Being & Stress Coping) before scheduling a consultation."
        });
      }

      // 2-Week Interval Booking Cadence Rule: Ensure at least 14 days apart from an existing consultation
      const existingAppts = await db.allAsync(`
        SELECT date FROM appointments
        WHERE (student_id = ? OR student_id = ? OR LOWER(email) = LOWER(?))
          AND status IN ('Approved', 'Confirmed', 'Pending')
      `, [req.user.id, req.user.student_id || req.user.studentId || '', req.user.email || '']);
      const targetDate = new Date(date);
      for (const appt of existingAppts) {
        const existingDate = new Date(appt.date);
        const diffInDays = Math.abs((targetDate - existingDate) / (1000 * 60 * 60 * 24));
        if (diffInDays < 14) {
          return res.status(400).json({
            success: false,
            message: "Consultation Scheduling Notice: To allow adequate time to apply wellness guidance and ensure availability for all students, appointments must be scheduled at least 2 weeks apart from an existing consultation."
          });
        }
      }
    }

    // PREVENT OVERLAPPING / DOUBLE BOOKING
    const scheduleDate = date || req.body.scheduleDate || req.body.schedule_date;
    const scheduleTime = timeSlot || req.body.scheduleTime || req.body.schedule_time;
    const studentFinalId = studentId || req.user?.student_id || req.user?.studentId || req.user?.id;
    const requestedCounselorId = counselorId || req.body.counselor_id;

    // 1. Single Counselor Lock: Check if student already has a booking at this exact timeslot
    const existingBooking = await db.getAsync(
      `SELECT id FROM appointments 
       WHERE (student_id = ? OR student_id = ? OR LOWER(email) = LOWER(?)) 
         AND (
           (date = ? AND time_slot = ?) OR
           (schedule_date = ? AND schedule_time = ?)
         ) 
         AND status IN ('Pending', 'Approved', 'Active', 'Confirmed', 'Rescheduled')`,
      [studentFinalId, req.user?.id || studentFinalId, email || '', scheduleDate, scheduleTime, scheduleDate, scheduleTime]
    );
    if (existingBooking) {
      return res.status(409).json({ 
        success: false,
        error: 'You already have an existing scheduled session at this date and time.',
        message: 'You already have an existing scheduled session at this date and time.' 
      });
    }

    // Check if the student already has an active appointment on target date where timeslots overlap
    const activeStudentAppts = await db.allAsync(`
      SELECT id, date, time_slot FROM appointments
      WHERE (student_id = ? OR student_id = ? OR LOWER(email) = LOWER(?))
        AND date = ?
        AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled')
    `, [studentFinalId, req.user?.id || studentFinalId, email || '', scheduleDate]);

    for (const appt of activeStudentAppts) {
      if (checkTimeSlotsOverlap(scheduleDate, scheduleTime, appt.date, appt.time_slot)) {
        return res.status(400).json({
          success: false,
          error: 'You already have an active appointment scheduled during this time window. Double booking is not allowed.',
          message: 'You already have an active appointment scheduled during this time window. Double booking is not allowed.'
        });
      }
    }

    // 2. Automated Specialization-Based Counselor Triage or Explicit Counselor Selection
    let finalCounselorId = null;
    let finalCounselor = null;
    let preferredCandidate = null;

    if (requestedCounselorId) {
      preferredCandidate = await db.getAsync("SELECT id, name, role, specialization FROM users WHERE id = ? AND LOWER(role) IN ('counselor', 'director')", [requestedCounselorId]);
    } else if (counselorName && counselorName !== 'Any Available Counselor') {
      preferredCandidate = await db.getAsync("SELECT id, name, role, specialization FROM users WHERE (name = ? OR name LIKE ?) AND LOWER(role) IN ('counselor', 'director')", [counselorName, `%${counselorName}%`]);
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const parsedDate = new Date(scheduleDate + 'T00:00:00');
    const dayOfWeek = days[parsedDate.getDay()];

    // 2. Unavailable Slot Guard & Specialization Routing Fallback
    if (requestedCounselorId || preferredCandidate) {
      const targetCnsId = requestedCounselorId || preferredCandidate?.id;
      const counselorAvailability = await db.getAsync(
        `SELECT is_available, specialization, status FROM counselor_schedules 
         WHERE counselor_id = ? 
           AND (
             (date = ? AND timeslot = ?) OR 
             (day_of_week = ? AND (time_slot = ? OR time_slot LIKE ?))
           )`,
        [targetCnsId, scheduleDate, scheduleTime, dayOfWeek, scheduleTime, `%${scheduleTime}%`]
      );

      const isUnavailable = counselorAvailability && (
        counselorAvailability.is_available === 0 || 
        ['unavailable', 'on leave', 'inactive', 'off duty'].includes((counselorAvailability.status || '').toLowerCase())
      );

      if (isUnavailable) {
        // Find alternate counselor with matching specialization
        const targetSpec = counselingType || counselorAvailability?.specialization || (preferredCandidate && preferredCandidate.specialization) || 'General Counseling';
        const alternateCounselor = await db.getAsync(
          `SELECT u.id, u.name, u.specialization FROM users u
           LEFT JOIN counselor_schedules cs ON u.id = cs.counselor_id
           WHERE LOWER(u.role) = 'counselor' 
             AND u.id != ? 
             AND (cs.specialization = ? OR u.specialization = ? OR u.specialization LIKE ?)
             AND (cs.date = ? OR cs.day_of_week = ? OR cs.date IS NULL)
             AND (cs.timeslot = ? OR cs.time_slot = ? OR cs.timeslot IS NULL)
             AND (cs.is_available = 1 OR cs.is_available IS NULL OR LOWER(cs.status) = 'available')
           LIMIT 1`,
          [targetCnsId, targetSpec, targetSpec, `%${targetSpec}%`, scheduleDate, dayOfWeek, scheduleTime, scheduleTime]
        );

        return res.status(400).json({
          success: false,
          error: 'The requested Director/Counselor is unavailable at this timeslot.',
          message: 'The requested Director/Counselor is unavailable at this timeslot.',
          suggestedAlternate: alternateCounselor || null
        });
      }

      if (preferredCandidate) {
        finalCounselorId = preferredCandidate.id;
        finalCounselor = preferredCandidate.name;
      }
    }

    // Smart Specialization Routing: If preferred counselor/director is unavailable or not set, route to available peer counselor
    if (!finalCounselorId) {
      const targetSpecialization = counselingType || (preferredCandidate && preferredCandidate.specialization) || 'General Guidance & Counseling';
      const assignedCounselorObj = await resolveAutoTriageCounselor(targetSpecialization, scheduleDate, scheduleTime);
      if (assignedCounselorObj && assignedCounselorObj.id) {
        finalCounselorId = assignedCounselorObj.id;
        finalCounselor = assignedCounselorObj.name;
      } else {
        finalCounselorId = 'USR-CNS-001';
        finalCounselor = 'Dr. Ma. Elena Santos, RGC';
      }
    }

    // 3. Strict Single-Counselor Booking: Check if assigned counselor is already booked during that date and time slot
    const activeCounselorAppts = await db.allAsync(`
      SELECT id, student_name, date, time_slot FROM appointments
      WHERE (
        counselor_id = ? OR
        counselor_name = ? OR 
        LOWER(counselor_name) = LOWER(?) OR 
        counselor_name LIKE ?
      )
        AND date = ?
        AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled')
    `, [finalCounselorId, finalCounselor, finalCounselor, `%${finalCounselor}%`, date]);

    let counselorHasConflict = false;
    for (const appt of activeCounselorAppts) {
      if (checkTimeSlotsOverlap(date, timeSlot, appt.date, appt.time_slot)) {
        counselorHasConflict = true;
        break;
      }
    }

    if (counselorHasConflict) {
      // Attempt smart routing to another counselor with matching clinical specialization
      const altCounselor = await resolveAutoTriageCounselor(counselingType, date, timeSlot);
      if (altCounselor && altCounselor.id && altCounselor.id !== finalCounselorId) {
        // Re-check alternative counselor for overlap
        const altBookings = await db.allAsync(`
          SELECT id, date, time_slot FROM appointments
          WHERE (counselor_id = ? OR counselor_name = ?)
            AND date = ?
            AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled')
        `, [altCounselor.id, altCounselor.name, date]);
        const altConflict = altBookings.some(b => checkTimeSlotsOverlap(date, timeSlot, b.date, b.time_slot));
        if (!altConflict) {
          finalCounselorId = altCounselor.id;
          finalCounselor = altCounselor.name;
          counselorHasConflict = false;
        }
      }
    }

    if (counselorHasConflict) {
      return res.status(400).json({
        success: false,
        message: 'All available guidance counselors for this clinical specialization are fully booked for the selected time slot. Please choose another time or date.'
      });
    }

    const apptId = `UMAK-CGCS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    await db.runAsync(`
      INSERT INTO appointments (
        id, student_id, student_name, email, contact_number, college, program, year_level,
        counseling_type, counselor_id, counselor_name, date, time_slot, schedule_date, schedule_time, mode, urgency, status, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    `, [
      apptId,
      studentId,
      studentName,
      email,
      encryptData(contactNumber || 'N/A'),
      college,
      program || 'Undergraduate',
      yearLevel || '1st Year',
      counselingType,
      finalCounselorId,
      finalCounselor,
      scheduleDate,
      scheduleTime,
      scheduleDate,
      scheduleTime,
      finalMode,
      finalUrgency,
      reason || 'General counseling and wellness support'
    ]);

    // Dispatch Notifications to Student and Counselor
    let studentUserRecord = null;
    if (req.user && req.user.id) {
      studentUserRecord = req.user;
    } else {
      studentUserRecord = await db.getAsync('SELECT id FROM users WHERE student_id = ? OR id = ? OR email = ?', [studentId, studentId, email]);
    }
    const studentRecipientId = studentUserRecord ? studentUserRecord.id : studentId;

    // 1. Notify ONLY the assigned counselor with actionable triage deep link
    createTargetedNotification({
      recipientId: finalCounselorId,
      senderId: req.user ? req.user.id : null,
      senderName: studentName,
      title: 'New Consultation Assigned',
      message: `${studentName} booked a session scheduled on ${date} (${timeSlot}).`,
      type: 'appointment_booked',
      actionLink: 'counselor-queue',
      referenceId: apptId
    });

    // 2. Notify ONLY the specific student who booked
    createTargetedNotification({
      recipientId: studentRecipientId,
      senderId: null,
      senderName: 'CGCS Guidance Team',
      title: 'Appointment Request Submitted',
      message: `Your consultation request under ${counselingType} on ${date} (${timeSlot}) has been received. Your assigned specialist will review the schedule.`,
      type: 'appointment_status',
      actionLink: 'student-appointments',
      referenceId: apptId
    });

    await logActivity(studentName, 'student', 'APPOINTMENT_REQUESTED', `Submitted appointment request ${apptId} for ${date} (${timeSlot})`, req.ip);

    const isStudentUser = req.user && req.user.role === 'student';
    const responseData = {
      id: apptId,
      status: 'Pending',
      date,
      timeSlot,
      mode: finalMode,
      counselorDisplay: 'Assigned CGCS Licensed Counselor'
    };

    if (!isStudentUser) {
      responseData.counselorName = finalCounselor;
      responseData.counselorId = finalCounselorId;
    }

    res.status(201).json({
      success: true,
      message: 'Your consultation request has been confirmed for ' + date + ' at ' + timeSlot + '. A guidance specialist has been assigned to your case.',
      data: responseData
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ success: false, message: 'Server error scheduling appointment.' });
  }
});

// PATCH /api/appointments/:id - Triage Workflow (Approve / Reschedule / Decline / Complete / Cancel / No-Show)
app.patch('/api/appointments/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const { status, counselorName, date, timeSlot, mode, remarks, reason, action } = req.body;

  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const isCounselorOrAdmin = ['counselor', 'director', 'superadmin', 'admin'].includes((req.user.role || '').toLowerCase());
    const isStudentOwner = req.user.role === 'student' && (req.user.id === appt.student_id || req.user.studentId === appt.student_id || req.user.email === appt.email);

    if (!isCounselorOrAdmin && !(isStudentOwner && (status === 'Cancelled' || status === 'Declined'))) {
      return res.status(403).json({ success: false, message: 'Unauthorized to modify this appointment.' });
    }

    const studentUser = await db.getAsync('SELECT id FROM users WHERE id = ? OR student_id = ? OR email = ?', [appt.student_id, appt.student_id, appt.email]);
    const studentTargetId = studentUser ? studentUser.id : appt.student_id;

    // -------------------------------------------------------------
    // FEATURE 1: EXPLICIT "NO-SHOW" STATUS FOR CONSULTATIONS
    // -------------------------------------------------------------
    if (status === 'No-Show') {
      if (!isCounselorOrAdmin) {
        return res.status(403).json({ success: false, message: 'Only counselors and administrators can mark appointments as No-Show.' });
      }

      // Normalize current time to Philippine Time (UTC+8)
      const phtNow = new Date(Date.now() + (8 * 60 * 60 * 1000));
      const todayPhtStr = phtNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const apptDateStr = String(appt.date || '').slice(0, 10); // "YYYY-MM-DD"

      // Only block strictly future calendar dates (appointment date > today)
      if (apptDateStr > todayPhtStr) {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark future appointments as No-Show before the scheduled session date.',
          error: 'Cannot mark future appointments as No-Show before the scheduled session date.'
        });
      }

      const noShowRemarks = reason || remarks || 'Student did not attend scheduled consultation';
      await db.runAsync(`
        UPDATE appointments 
        SET status = 'No-Show',
            reason = COALESCE(?, reason)
        WHERE id = ?
      `, [noShowRemarks, id]);

      // Gentle, non-punitive targeted notification to student
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Missed Guidance Appointment',
        message: `You missed your scheduled consultation on ${appt.date} at ${appt.time_slot}. Your mental well-being matters to us—please re-book or reach out to the CGCS office if you need support.`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });

      await logActivity(req.user.name, req.user.role, 'APPOINTMENT_NOSHOW', `Marked consultation ${id} as No-Show. Remarks: ${noShowRemarks}`, req.ip);

      return res.json({
        success: true,
        message: `Appointment ${id} has been marked as No-Show.`,
        data: {
          id,
          status: 'No-Show',
          date: appt.date,
          timeSlot: appt.time_slot,
          reason: noShowRemarks
        }
      });
    }

    // -------------------------------------------------------------
    // FEATURE 2: COUNSELOR APPROVAL / DECLINE WORKFLOW FOR RESCHEDULES
    // -------------------------------------------------------------
    const isRescheduleApproval = action === 'approve_reschedule' || 
      (appt.status === 'Pending Reschedule' && (status === 'Approved' || status === 'Confirmed'));

    if (isRescheduleApproval) {
      if (!isCounselorOrAdmin) {
        return res.status(403).json({ success: false, message: 'Only counselors and administrators can approve reschedule requests.' });
      }

      const proposedDate = appt.proposed_date || date || appt.date;
      const proposedTime = appt.proposed_time_slot || timeSlot || appt.time_slot;
      const finalCounselor = counselorName || req.user.name || appt.counselor_name;
      const finalMode = mode || appt.mode;

      // Conflict Prevention: verify counselor has no overlapping confirmed consultation
      const activeCounselorAppts = await db.allAsync(`
        SELECT id, student_id, counselor_name, date, time_slot FROM appointments
        WHERE id != ? 
          AND date = ? 
          AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
          AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Ongoing')
      `, [id, proposedDate, appt.counselor_id || req.user.id, finalCounselor, finalCounselor]);

      for (const other of activeCounselorAppts) {
        if (checkTimeSlotsOverlap(proposedDate, proposedTime, other.date, other.time_slot)) {
          return res.status(400).json({
            success: false,
            message: 'Conflict detected: You have an existing confirmed consultation overlapping with the proposed slot.'
          });
        }
      }

      // If Online Video, re-validate and activate unique WebRTC meeting room
      let meetingLink = appt.meeting_link;
      const isVideo = finalMode && (finalMode.includes('Virtual') || finalMode.includes('Video') || finalMode.includes('Online'));
      if (isVideo && !meetingLink) {
        meetingLink = `UMAK-ROOM-${Math.floor(1000 + Math.random() * 9000)}-${id.slice(-3)}`;
      }

      await db.runAsync(`
        UPDATE appointments 
        SET status = 'Approved',
            counselor_name = ?,
            date = ?,
            time_slot = ?,
            mode = ?,
            meeting_link = ?,
            original_date = COALESCE(original_date, ?),
            original_time_slot = COALESCE(original_time_slot, ?),
            proposed_date = NULL,
            proposed_time_slot = NULL,
            reschedule_reason = COALESCE(?, reschedule_reason),
            reason = COALESCE(?, reason)
        WHERE id = ?
      `, [finalCounselor, proposedDate, proposedTime, finalMode, meetingLink, appt.date, appt.time_slot, reason, remarks, id]);

      // Targeted notification to student
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Reschedule Request Approved',
        message: `Your counselor has confirmed your new consultation schedule for ${proposedDate} at ${proposedTime}. Mode: ${finalMode}.`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });

      await logActivity(req.user.name, req.user.role, 'RESCHEDULE_APPROVED', `Approved reschedule request for ${id} to ${proposedDate} ${proposedTime}`, req.ip);

      return res.json({
        success: true,
        message: `Reschedule request approved. Consultation confirmed for ${proposedDate} at ${proposedTime}.`,
        data: {
          id,
          status: 'Approved',
          date: proposedDate,
          timeSlot: proposedTime,
          mode: finalMode,
          meetingLink
        }
      });
    }

    const isRescheduleDecline = action === 'decline_reschedule' || 
      (appt.status === 'Pending Reschedule' && status === 'Declined');

    if (isRescheduleDecline) {
      if (!isCounselorOrAdmin) {
        return res.status(403).json({ success: false, message: 'Only counselors and administrators can decline reschedule requests.' });
      }

      const declineExplanation = reason || remarks || 'Institutional schedule conflict';

      await db.runAsync(`
        UPDATE appointments 
        SET status = 'Declined',
            proposed_date = NULL,
            proposed_time_slot = NULL,
            reason = ?
        WHERE id = ?
      `, [declineExplanation, id]);

      // Targeted notification to student
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Reschedule Request Declined',
        message: `Your counselor could not accommodate the requested schedule (${declineExplanation}). Please select an alternative slot.`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });

      await logActivity(req.user.name, req.user.role, 'RESCHEDULE_DECLINED', `Declined reschedule request for ${id}. Reason: ${declineExplanation}`, req.ip);

      return res.json({
        success: true,
        message: 'Reschedule request declined and student notified.',
        data: {
          id,
          status: 'Declined',
          reason: declineExplanation
        }
      });
    }

    // -------------------------------------------------------------
    // STANDARD TRIAGE (Approve, Reschedule, Decline, Cancel, Complete)
    // -------------------------------------------------------------
    const newStatus = status || appt.status;
    const finalDate = date || appt.date;
    const finalTime = timeSlot || appt.time_slot;
    const finalMode = mode || appt.mode;
    const finalCounselor = counselorName || req.user.name || appt.counselor_name;

    // Strict Guard: Prevent premature marking of future appointments as Completed
    if (newStatus === 'Completed') {
      const phtNow = new Date(Date.now() + (8 * 60 * 60 * 1000));
      const todayPhtStr = phtNow.toISOString().slice(0, 10);
      const scheduledDateStr = String(finalDate || appt.date || '').slice(0, 10);

      if (scheduledDateStr > todayPhtStr) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot mark future appointments as completed before the scheduled session date.',
          error: 'Cannot mark future appointments as completed before the scheduled session date.' 
        });
      }
    }

    // Reschedule Overlap Validation
    if (newStatus !== 'Cancelled' && newStatus !== 'Declined' && newStatus !== 'No-Show') {
      const isDateOrTimeChanged = (date && date !== appt.date) || (timeSlot && timeSlot !== appt.time_slot);
      if (isDateOrTimeChanged || newStatus === 'Rescheduled') {
        const activeOtherAppts = await db.allAsync(`
          SELECT id, student_id, email, counselor_name, date, time_slot FROM appointments
          WHERE id != ? 
            AND date = ? 
            AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Pending Reschedule')
        `, [id, finalDate]);

        for (const other of activeOtherAppts) {
          const isSameStudent = (other.student_id && (other.student_id === appt.student_id || other.student_id === req.user.id || other.student_id === req.user.studentId)) ||
                               (other.email && appt.email && other.email.toLowerCase() === appt.email.toLowerCase());
          const otherCounselor = (other.counselor_name || '').trim().toLowerCase();
          const targetCounselor = (finalCounselor || '').trim().toLowerCase();
          const isSameCounselor = otherCounselor && targetCounselor && (otherCounselor === targetCounselor || otherCounselor.includes(targetCounselor) || targetCounselor.includes(otherCounselor));

          if (isSameStudent || isSameCounselor) {
            if (checkTimeSlotsOverlap(finalDate, finalTime, other.date, other.time_slot)) {
              return res.status(400).json({
                success: false,
                message: 'Conflict detected: The proposed slot overlaps with an existing appointment.'
              });
            }
          }
        }
      }
    }

    // Generate unique session room if Approved or Rescheduled
    let meetingLink = appt.meeting_link;
    if ((newStatus === 'Approved' || newStatus === 'Rescheduled') && !meetingLink) {
      meetingLink = `UMAK-ROOM-${Math.floor(1000 + Math.random() * 9000)}-${id.slice(-3)}`;
    }

    await db.runAsync(`
      UPDATE appointments 
      SET status = ?,
          counselor_name = ?,
          date = ?,
          time_slot = ?,
          mode = ?,
          meeting_link = ?,
          reason = COALESCE(?, reason)
      WHERE id = ?
    `, [newStatus, finalCounselor, finalDate, finalTime, finalMode, meetingLink, reason || remarks, id]);

    if (newStatus === 'Approved') {
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Consultation Approved',
        message: `Your appointment on ${finalDate} (${finalTime}) is confirmed.`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });
    } else if (newStatus === 'Rescheduled') {
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Consultation Rescheduled',
        message: `Your appointment has been rescheduled to ${finalDate} (${finalTime}). Reason: ${reason || remarks || 'Counselor schedule update'}`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });
    } else if (newStatus === 'Declined') {
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Consultation Declined',
        message: `Your appointment request was declined. Reason: ${reason || remarks || 'Institutional schedule conflict'}`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });
    } else if (newStatus === 'Cancelled') {
      if (req.user.role === 'student') {
        const counselorTarget = await db.getAsync('SELECT id FROM users WHERE (id = ? OR name = ?) AND LOWER(role) = "counselor"', [appt.counselor_id || '', finalCounselor]);
        if (counselorTarget) {
          createTargetedNotification({
            recipientId: counselorTarget.id,
            senderId: req.user.id,
            senderName: req.user.name,
            title: 'Consultation Cancelled by Student',
            message: `Student ${req.user.name} cancelled their consultation scheduled for ${finalDate} (${finalTime}).`,
            type: 'appointment_status',
            actionLink: 'counselor-queue',
            referenceId: appt.id
          });
        }
      } else {
        createTargetedNotification({
          recipientId: studentTargetId,
          senderId: req.user.id,
          senderName: req.user.name,
          title: 'Consultation Cancelled',
          message: `Your appointment on ${finalDate} (${finalTime}) was cancelled. Reason: ${reason || remarks || 'Counselor schedule update'}`,
          type: 'appointment_status',
          actionLink: 'student-appointments',
          referenceId: appt.id
        });
      }
    } else if (newStatus === 'Completed') {
      await logActivity(req.user.name, req.user.role, 'APPOINTMENT_COMPLETED', `Marked consultation ${id} as Completed`, req.ip);
    }

    await logActivity(req.user.name, req.user.role, 'APPOINTMENT_TRIAGED', `Updated status of ${id} to ${newStatus}`, req.ip);

    res.json({
      success: true,
      message: `Appointment ${id} has been marked as ${newStatus}.`,
      data: {
        id,
        status: newStatus,
        meetingLink,
        date: finalDate,
        timeSlot: finalTime
      }
    });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ success: false, message: 'Server error updating appointment.' });
  }
});

// Dedicated Completion Guard Endpoints
app.post('/api/appointments/:id/complete', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const phtNow = new Date(Date.now() + (8 * 60 * 60 * 1000));
    const todayPhtStr = phtNow.toISOString().slice(0, 10);
    const apptDateStr = String(appt.date || '').slice(0, 10);

    if (apptDateStr > todayPhtStr) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot mark future appointments as completed before the scheduled session date.',
        error: 'Cannot mark future appointments as completed before the scheduled session date.' 
      });
    }

    await db.runAsync("UPDATE appointments SET status = 'Completed' WHERE id = ?", [id]);
    await logActivity(req.user.name, req.user.role, 'APPOINTMENT_COMPLETED', `Marked consultation ${id} as Completed`, req.ip);

    res.json({
      success: true,
      message: `Appointment ${id} has been marked as Completed.`,
      status: 'Completed'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark appointment completed.' });
  }
});

app.put('/api/counselor/appointment-status', authenticateJWT, async (req, res) => {
  const { id, appointmentId, status } = req.body;
  const targetId = id || appointmentId;
  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [targetId]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    if (status === 'Completed') {
      const phtNow = new Date(Date.now() + (8 * 60 * 60 * 1000));
      const todayPhtStr = phtNow.toISOString().slice(0, 10);
      const apptDateStr = String(appt.date || '').slice(0, 10);

      if (apptDateStr > todayPhtStr) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot mark future appointments as completed before the scheduled session date.',
          error: 'Cannot mark future appointments as completed before the scheduled session date.' 
        });
      }
    }

    await db.runAsync("UPDATE appointments SET status = ? WHERE id = ?", [status, targetId]);
    res.json({ success: true, message: `Appointment ${targetId} status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update appointment status.' });
  }
});

// PATCH /api/appointments/:id/reschedule - Student-Initiated "Request Reschedule" Flow
app.patch('/api/appointments/:id/reschedule', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const targetDate = (req.body.newDate || req.body.date || '').trim();
  const targetTime = (req.body.newTime || req.body.timeSlot || '').trim();
  const reason = (req.body.reason || req.body.rescheduleReason || '').trim();

  if (!targetDate || !targetTime) {
    return res.status(400).json({ success: false, message: 'Proposed new date and time slot are required.' });
  }

  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const isStudentOwner = req.user.role === 'student' && 
      (req.user.id === appt.student_id || req.user.studentId === appt.student_id || req.user.email === appt.email);
    const isStaff = ['counselor', 'director', 'superadmin', 'admin'].includes((req.user.role || '').toLowerCase());

    if (!isStudentOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Unauthorized: You can only reschedule your own appointments.' });
    }

    if (['Cancelled', 'Declined', 'Expired', 'System Cancelled', 'No-Show'].includes(appt.status)) {
      return res.status(400).json({ success: false, message: `Cannot reschedule an appointment that has been ${appt.status.toLowerCase()}.` });
    }

    // Check slot collision to prevent double-booking on target date/time
    const activeOtherAppts = await db.allAsync(`
      SELECT id, student_id, email, counselor_name, date, time_slot, proposed_date, proposed_time_slot FROM appointments
      WHERE id != ? 
        AND (date = ? OR proposed_date = ?)
        AND status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Pending Reschedule')
    `, [id, targetDate, targetDate]);

    for (const other of activeOtherAppts) {
      const isSameStudent = (other.student_id && (other.student_id === appt.student_id || other.student_id === req.user.id || other.student_id === req.user.studentId)) ||
                           (other.email && appt.email && other.email.toLowerCase() === appt.email.toLowerCase());
      const otherCounselor = (other.counselor_name || '').trim().toLowerCase();
      const targetCounselor = (appt.counselor_name || '').trim().toLowerCase();
      const isSameCounselor = otherCounselor && targetCounselor && (otherCounselor === targetCounselor || otherCounselor.includes(targetCounselor) || targetCounselor.includes(otherCounselor));

      if (isSameStudent || isSameCounselor) {
        const otherDate = other.proposed_date || other.date;
        const otherTime = other.proposed_time_slot || other.time_slot;
        const overlaps = typeof checkTimeSlotsOverlap === 'function'
          ? checkTimeSlotsOverlap(targetDate, targetTime, otherDate, otherTime)
          : (targetDate === otherDate && targetTime === otherTime);
        if (overlaps) {
          return res.status(400).json({
            success: false,
            message: 'Conflict detected: The proposed slot overlaps with an existing appointment.'
          });
        }
      }
    }

    const originalDate = appt.original_date || appt.date;
    const originalTime = appt.original_time_slot || appt.time_slot;
    const rescheduleReason = reason || 'Student requested reschedule';

    if (req.user.role === 'student') {
      // Student Reschedule Request: Sets status to 'Pending Reschedule' awaiting counselor review
      await db.runAsync(`
        UPDATE appointments 
        SET status = 'Pending Reschedule',
            original_date = ?,
            original_time_slot = ?,
            proposed_date = ?,
            proposed_time_slot = ?,
            reschedule_reason = ?
        WHERE id = ?
      `, [originalDate, originalTime, targetDate, targetTime, rescheduleReason, id]);

      // Dispatch a notification to the assigned counselor's inbox regarding the reschedule request
      const counselorTarget = await db.getAsync(
        'SELECT id FROM users WHERE (id = ? OR name = ?) AND LOWER(role) = "counselor"', 
        [appt.counselor_id || '', appt.counselor_name]
      );
      if (counselorTarget) {
        createTargetedNotification({
          recipientId: counselorTarget.id,
          senderId: req.user.id,
          senderName: req.user.name,
          title: 'Appointment Reschedule Request',
          message: `Student ${req.user.name} requested to reschedule appointment from ${originalDate} (${originalTime}) to ${targetDate} (${targetTime}). Reason: ${rescheduleReason}`,
          type: 'appointment_status',
          actionLink: 'counselor-queue',
          referenceId: appt.id
        });
      }

      // Also notify student confirming the reschedule request submission
      createTargetedNotification({
        recipientId: req.user.id,
        senderId: req.user.id,
        senderName: 'UMak CGCS Guidance Office',
        title: 'Reschedule Request Submitted',
        message: `Your reschedule request to ${targetDate} (${targetTime}) has been submitted and is awaiting counselor confirmation.`,
        type: 'appointment_status',
        actionLink: 'student-booking',
        referenceId: appt.id
      });

      await logActivity(req.user.name, req.user.role, 'APPOINTMENT_RESCHEDULE_REQUESTED', `Student requested reschedule of ${id} to ${targetDate} ${targetTime}`, req.ip);

      return res.json({
        success: true,
        message: 'Reschedule request submitted successfully. Awaiting counselor review.',
        data: {
          id,
          status: 'Pending Reschedule',
          originalDate,
          originalTime,
          proposedDate: targetDate,
          proposedTimeSlot: targetTime,
          rescheduleReason
        }
      });
    } else {
      // Staff / Counselor direct administrative reschedule
      await db.runAsync(`
        UPDATE appointments 
        SET status = 'Rescheduled',
            original_date = ?,
            original_time_slot = ?,
            date = ?,
            time_slot = ?,
            proposed_date = NULL,
            proposed_time_slot = NULL,
            reschedule_reason = ?,
            reason = COALESCE(?, reason)
        WHERE id = ?
      `, [originalDate, originalTime, targetDate, targetTime, rescheduleReason, reason, id]);

      const studentUser = await db.getAsync('SELECT id FROM users WHERE id = ? OR student_id = ? OR email = ?', [appt.student_id, appt.student_id, appt.email]);
      const studentTargetId = studentUser ? studentUser.id : appt.student_id;
      createTargetedNotification({
        recipientId: studentTargetId,
        senderId: req.user.id,
        senderName: req.user.name,
        title: 'Consultation Rescheduled',
        message: `Your appointment has been rescheduled to ${targetDate} (${targetTime}). Assigned Counselor: ${appt.counselor_name}.`,
        type: 'appointment_status',
        actionLink: 'student-appointments',
        referenceId: appt.id
      });

      await logActivity(req.user.name, req.user.role, 'APPOINTMENT_RESCHEDULED', `Staff rescheduled ${id} to ${targetDate} ${targetTime}`, req.ip);

      return res.json({
        success: true,
        message: 'Appointment successfully rescheduled.',
        data: {
          id,
          status: 'Rescheduled',
          originalDate,
          originalTime,
          date: targetDate,
          timeSlot: targetTime,
          rescheduleReason
        }
      });
    }
  } catch (err) {
    console.error('Error in PATCH /api/appointments/:id/reschedule:', err);
    res.status(500).json({ success: false, message: 'Server error processing reschedule request.' });
  }
});

// GET /api/appointments/:id/attendance-slip - Privacy-Preserving Attendance / Excuse Slip Data
app.get('/api/appointments/:id/attendance-slip', authenticateJWT, async (req, res) => {
  const { id } = req.params;

  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const isStudentOwner = req.user.role === 'student' && 
      (req.user.id === appt.student_id || req.user.studentId === appt.student_id || req.user.email === appt.email);
    const isStaff = ['counselor', 'director', 'superadmin', 'admin'].includes((req.user.role || '').toLowerCase());

    if (!isStudentOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to appointment attendance slip.' });
    }

    if (appt.status !== 'Completed' && appt.status !== 'Concluded') {
      return res.status(400).json({
        success: false,
        message: 'Attendance slips can only be generated for completed counseling sessions.'
      });
    }

    // Retrieve verified student profile for official name & student ID
    const studentUser = await db.getAsync('SELECT * FROM users WHERE id = ? OR student_id = ? OR email = ?', [appt.student_id, appt.student_id, appt.email]);

    // STRICT PRIVACY PROTECTION (RA 10173 & RA 9258):
    // Zero clinical content, zero psychological disclosures, zero screening scores.
    res.json({
      success: true,
      data: {
        certificateId: `CGCS-ATT-${appt.id}`,
        institution: 'University of Makati',
        office: 'Center for Guidance & Counseling Services (CGCS)',
        officeAddress: 'Admin Building, Room 304, J.P. Rizal Ext., West Rembo, Taguig City',
        title: 'Official Certificate of Counseling Attendance',
        studentName: (studentUser && studentUser.name) ? studentUser.name : appt.student_name,
        studentId: (studentUser && studentUser.student_id) ? studentUser.student_id : (appt.student_id || 'N/A'),
        college: (studentUser && studentUser.college) ? studentUser.college : appt.college,
        program: (studentUser && studentUser.program) ? studentUser.program : (appt.program || 'N/A'),
        yearLevel: (studentUser && studentUser.year_level) ? studentUser.year_level : (appt.year_level || 'N/A'),
        attendanceDate: appt.date,
        timeSlot: appt.time_slot,
        modality: appt.mode,
        counselorName: appt.counselor_name,
        counselorTitle: 'Registered Guidance Counselor (RGC)',
        issuedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        purpose: 'Issued strictly for academic excuse and official attendance verification purposes.',
        legalNotice: 'Pursuant to the Guidance and Counseling Act of 2004 (Republic Act No. 9258) and the Data Privacy Act of 2012 (Republic Act No. 10173), all therapeutic disclosures, clinical assessments, session notes, and diagnostic observations are privileged and confidential. This certificate serves solely to verify attendance.'
      }
    });
  } catch (err) {
    console.error('Error in GET /api/appointments/:id/attendance-slip:', err);
    res.status(500).json({ success: false, message: 'Server error generating attendance slip.' });
  }
});

// GET /api/video-room/verify/:appointmentId - Strict Privacy & Timed Verification for Tele-Counseling Room
app.get('/api/video-room/verify/:appointmentId', authenticateJWT, async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isStudent = userRole === 'student';
    const isCounselorOrStaff = ['counselor', 'director', 'superadmin', 'admin'].includes(userRole);

    // 1. Strict Ownership Validation
    if (isStudent) {
      const isStudentOwner = (req.user.id && req.user.id === appt.student_id) ||
                             (req.user.studentId && req.user.studentId === appt.student_id) ||
                             (req.user.email && appt.email && req.user.email.toLowerCase() === appt.email.toLowerCase());
      if (!isStudentOwner) {
        await logDpaEvent(req, 'UNAUTHORIZED_ROOM_ACCESS_ATTEMPT', `Student ${req.user.name} attempted unauthorized access to room ${appointmentId}`);
        return res.status(403).json({
          success: false,
          authorized: false,
          message: 'Access Denied: This confidential tele-counseling room is strictly reserved for the booked student.'
        });
      }
    } else if (isCounselorOrStaff) {
      const reqUserName = (req.user.name || '').trim().toLowerCase();
      const apptCounselorName = (appt.counselor_name || '').trim().toLowerCase();
      const isAssignedCounselor = (appt.counselor_id && appt.counselor_id === req.user.id) ||
                                  (apptCounselorName && (apptCounselorName === reqUserName || apptCounselorName.includes(reqUserName) || reqUserName.includes(apptCounselorName)));
      if (!isAssignedCounselor) {
        await logDpaEvent(req, 'UNAUTHORIZED_ROOM_ACCESS_ATTEMPT', `Counselor ${req.user.name} attempted unauthorized access to case ${appointmentId}`);
        return res.status(403).json({
          success: false,
          authorized: false,
          message: 'Access Denied: You are not the assigned counselor for this confidential case.'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        authorized: false,
        message: 'Access Denied: Unauthorized role for tele-counseling video room.'
      });
    }

    if (appt.status !== 'Approved' && appt.status !== 'Confirmed' && appt.status !== 'Rescheduled') {
      return res.status(400).json({
        success: false,
        authorized: false,
        message: `Video room is not active. Appointment status is currently: ${appt.status}.`
      });
    }

    // 2. Timed Window Check (Allow entry from 10 minutes before start time until scheduled end time)
    const { startTime, endTime } = parseAppointmentDateRange(appt.date, appt.time_slot);
    const now = new Date();
    const tenMinsBeforeStart = startTime ? new Date(startTime.getTime() - 10 * 60 * 1000) : null;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        authorized: false,
        message: 'Invalid schedule timeframe for this appointment.'
      });
    }

    const isInsideWindow = (now.getTime() >= tenMinsBeforeStart.getTime()) && (now.getTime() <= endTime.getTime());
    if (!isInsideWindow) {
      const isExpired = now.getTime() > endTime.getTime();
      return res.status(403).json({
        success: false,
        authorized: false,
        isExpired: Boolean(isExpired),
        isWaitingRoom: Boolean(tenMinsBeforeStart && now.getTime() < tenMinsBeforeStart.getTime()),
        opensAt: tenMinsBeforeStart ? tenMinsBeforeStart.toISOString() : null,
        message: 'Session not active. Video room is only accessible during your scheduled consultation window.'
      });
    }

    // 3. Audit Log Entry
    try {
      const logId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const timestamp = new Date().toISOString();
      await db.runAsync(`
        INSERT INTO audit_logs (id, actor_name, actor_role, action, details, ip_address, timestamp)
        VALUES (?, ?, ?, 'TELECOUNSELING_ROOM_JOINED', ?, ?, ?)
      `, [
        logId,
        req.user.name || req.user.email || req.user.id,
        req.user.role || 'authenticated',
        `User ${req.user.id} (${req.user.role}) joined video room for appointment ${appt.id}`,
        req.ip || '127.0.0.1',
        timestamp
      ]);
    } catch (auditErr) {
      console.error('Audit log error on video room join:', auditErr);
    }

    const roomToken = appt.meeting_link || `UMAK-ROOM-${appt.id.slice(-4)}`;
    const formattedAppt = {
      ...appt,
      contact_number: decryptData(appt.contact_number)
    };

    res.json({
      success: true,
      authorized: true,
      roomToken,
      meetingLink: roomToken,
      appointment: formattedAppt,
      data: {
        appointmentId: appt.id,
        meetingLink: roomToken,
        roomToken,
        studentName: appt.student_name,
        studentId: appt.student_id,
        counselorName: appt.counselor_name,
        counselingType: appt.counseling_type,
        date: appt.date,
        timeSlot: appt.time_slot,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        opensAt: tenMinsBeforeStart.toISOString(),
        remainingMs: Math.max(0, endTime.getTime() - now.getTime())
      }
    });
  } catch (err) {
    console.error('Error verifying video room credentials:', err);
    res.status(500).json({ success: false, message: 'Error verifying video room credentials.' });
  }
});

// GET /api/video-room/upcoming - Next Upcoming Online Appointment Endpoint
app.get('/api/video-room/upcoming', authenticateJWT, async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    let sql = `
      SELECT * FROM appointments 
      WHERE status IN ('Approved', 'Confirmed', 'Rescheduled')
        AND (
          LOWER(mode) LIKE '%virtual%' OR 
          LOWER(mode) LIKE '%video%' OR 
          LOWER(mode) LIKE '%online%'
        )
    `;
    const params = [];

    if (userRole === 'student') {
      sql += ` AND (student_id = ? OR student_id = ? OR LOWER(email) = LOWER(?))`;
      params.push(req.user.id, req.user.studentId || req.user.id, req.user.email || '');
    } else {
      sql += ` AND (
        counselor_id = ? OR 
        LOWER(counselor_name) = LOWER(?) OR 
        counselor_name LIKE ?
      )`;
      params.push(req.user.id, req.user.name || '', `%${req.user.name || ''}%`);
    }

    sql += ` ORDER BY date ASC, time_slot ASC`;
    const appointments = await db.allAsync(sql, params);

    const now = new Date();
    let activeSession = null;
    let nextAppointment = null;

    for (const raw of appointments) {
      const appt = {
        ...raw,
        contact_number: decryptData(raw.contact_number)
      };
      const { startTime, endTime } = parseAppointmentDateRange(appt.date, appt.time_slot);
      if (!startTime || !endTime) continue;

      const tenMinsBefore = new Date(startTime.getTime() - 10 * 60 * 1000);

      // Active Session Check: inside 10m pre-call up to end of session
      if (now.getTime() >= tenMinsBefore.getTime() && now.getTime() <= endTime.getTime()) {
        if (!activeSession) {
          activeSession = {
            ...appt,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            opensAt: tenMinsBefore.toISOString(),
            remainingMs: Math.max(0, endTime.getTime() - now.getTime()),
            isWithinWindow: true
          };
        }
      } else if (now.getTime() < tenMinsBefore.getTime()) {
        // Upcoming Session
        if (!nextAppointment) {
          nextAppointment = {
            ...appt,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            opensAt: tenMinsBefore.toISOString(),
            unlocksInMs: Math.max(0, tenMinsBefore.getTime() - now.getTime()),
            isWithinWindow: false
          };
        }
      }
    }

    if (userRole === 'student') {
      if (activeSession) {
        activeSession.counselor_display = 'Assigned CGCS Licensed Counselor';
        delete activeSession.counselor_name;
        delete activeSession.counselor_id;
      }
      if (nextAppointment) {
        nextAppointment.counselor_display = 'Assigned CGCS Licensed Counselor';
        delete nextAppointment.counselor_name;
        delete nextAppointment.counselor_id;
      }
    }

    res.json({
      success: true,
      hasActiveSession: Boolean(activeSession),
      activeSession: activeSession || null,
      nextAppointment: nextAppointment || null
    });
  } catch (err) {
    console.error('Error fetching upcoming video appointment:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve upcoming video appointments.' });
  }
});

// ----------------------------------------------------
// 3. DYNAMIC COUNSELOR SCHEDULES & STUDENT AVAILABILITY
// ----------------------------------------------------

// Dynamic Booking Slot Availability Handler for Students & Counselors
async function handleCounselorAvailability(req, res) {
  try {
    const { counselor, date } = req.query;

    let dayOfWeek = null;
    if (date) {
      const parsedDate = new Date(date + 'T00:00:00');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayOfWeek = days[parsedDate.getDay()];
    }

    let sql = 'SELECT * FROM counselor_schedules WHERE 1=1';
    const params = [];

    if (counselor && counselor !== 'Any Available Counselor') {
      sql += ' AND counselor_name LIKE ?';
      params.push(`%${counselor}%`);
    }

    if (dayOfWeek) {
      sql += ' AND day_of_week = ?';
      params.push(dayOfWeek);
    }

    sql += ' ORDER BY time_slot ASC';
    const schedules = await db.allAsync(sql, params);

    // If date is provided, check existing booked appointments to determine capacity
    let bookedCounts = {};
    if (date) {
      const booked = await db.allAsync(`
        SELECT time_slot, COUNT(*) as count 
        FROM appointments 
        WHERE date = ? AND status IN ('Pending', 'Approved', 'Confirmed')
        GROUP BY time_slot
      `, [date]);
      booked.forEach(b => bookedCounts[b.time_slot] = b.count);
    }

    // Standardized fallback slots if no specific schedule found
    const defaultSlots = [
      '08:00 AM - 10:00 AM',
      '10:00 AM - 12:00 PM',
      '01:00 PM - 03:00 PM',
      '03:00 PM - 05:00 PM'
    ];

    let availableSlots = [];

    if (schedules.length > 0) {
      availableSlots = schedules.map(s => {
        const booked = bookedCounts[s.time_slot] || 0;
        const maxSlots = s.max_slots !== undefined && s.max_slots !== null ? s.max_slots : 4;
        const isMaxed = booked >= maxSlots;
        const isStatusAvailable = s.status === 'Available' || s.status === 'Active';
        const isAvailable = isStatusAvailable && !isMaxed;
        const remainingSlots = Math.max(0, maxSlots - booked);

        let reason = 'Available';
        if (s.status === 'Unavailable') reason = 'Unavailable';
        else if (s.status === 'Fully Booked' || isMaxed) reason = 'Fully Booked';

        return {
          id: s.id,
          counselorName: s.counselor_name,
          dayOfWeek: s.day_of_week,
          timeSlot: s.time_slot,
          maxSlots,
          currentBooked: booked,
          remainingSlots,
          status: s.status,
          isAvailable,
          reason
        };
      });
    } else {
      // Fallback slots
      availableSlots = defaultSlots.map(slot => {
        const booked = bookedCounts[slot] || 0;
        const maxSlots = 4;
        const isMaxed = booked >= maxSlots;
        const remainingSlots = Math.max(0, maxSlots - booked);
        return {
          timeSlot: slot,
          dayOfWeek: dayOfWeek || 'Daily',
          maxSlots,
          currentBooked: booked,
          remainingSlots,
          status: isMaxed ? 'Fully Booked' : 'Available',
          isAvailable: !isMaxed,
          reason: isMaxed ? 'Fully Booked' : 'Available'
        };
      });
    }

    res.json({
      success: true,
      dayOfWeek,
      counselor: counselor || 'Any',
      slots: availableSlots
    });
  } catch (err) {
    console.error('Availability check error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve counselor availability.' });
  }
}

app.get('/api/student/availability', handleCounselorAvailability);
app.get('/api/student/counselor-availability', handleCounselorAvailability);
app.get('/api/counselor/availability', handleCounselorAvailability);

// GET /api/counselors/list - Dynamic Active Counselor Directory for Assignment Dropdowns
app.get('/api/counselors/list', async (req, res) => {
  try {
    const counselors = await db.allAsync(`
      SELECT id, name, email, COALESCE(department, college, 'CGCS Guidance') AS department
      FROM users 
      WHERE role = 'counselor'
      ORDER BY name ASC
    `);
    res.json({ success: true, counselors });
  } catch (err) {
    console.error('Error fetching counselors list:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch counselors list.' });
  }
});
app.get('/api/counselor/list', async (req, res) => {
  try {
    const counselors = await db.allAsync(`
      SELECT id, name, email, COALESCE(department, college, 'CGCS Guidance') AS department
      FROM users 
      WHERE role = 'counselor'
      ORDER BY name ASC
    `);
    res.json({ success: true, counselors });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch counselors list.' });
  }
});

// GET /api/counselor/schedules - Counselor & Director/Admin View
app.get('/api/counselor/schedules', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), (req, res) => {
  const userRole = (req.user.role || '').toLowerCase();
  if (userRole === 'counselor') {
    const counselorId = req.user.id;
    const counselorName = req.user.name;

    db.all(
      `SELECT * FROM counselor_schedules 
       WHERE counselor_id = ? OR counselor_name = ? 
       ORDER BY day_of_week, time_slot`,
      [counselorId, counselorName],
      (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "Error fetching schedules." });
        res.json({ success: true, data: rows || [], schedules: rows || [] });
      }
    );
  } else {
    const counselorId = req.query.counselor_id || req.query.counselorId;
    const dayOfWeek = req.query.day_of_week || req.query.dayOfWeek;
    let sql = 'SELECT * FROM counselor_schedules WHERE 1=1';
    const params = [];

    if (counselorId) {
      sql += ' AND (counselor_id = ? OR counselor_name = ?)';
      params.push(counselorId, counselorId);
    }
    if (dayOfWeek) {
      sql += ' AND day_of_week = ?';
      params.push(dayOfWeek);
    }
    sql += ' ORDER BY day_of_week, time_slot';

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: "Error fetching schedules." });
      res.json({ success: true, data: rows || [], schedules: rows || [] });
    });
  }
});

// POST & PUT /api/counselors/schedule & /api/counselor/schedules - Upsert Duty Schedule Slot
const handleSaveCounselorSchedule = async (req, res) => {
  try {
    let counselorId = req.body.counselorId || req.body.counselor_id;
    let counselorName = req.body.counselorName || req.body.counselor_name;

    // If counselor is setting their own schedule:
    if (req.user.role === 'counselor') {
      counselorId = req.user.id;
      counselorName = req.user.name;
    }

    // If Director assigned by ID, query exact name to avoid string mismatches:
    if (!counselorName && counselorId) {
      const userRow = await new Promise(resolve => db.get("SELECT id, name FROM users WHERE id = ?", [counselorId], (err, row) => resolve(row)));
      if (userRow) {
        counselorName = userRow.name;
      }
    } else if (counselorId) {
      // Synchronize exact canonical name if counselorId is provided
      const userRow = await new Promise(resolve => db.get("SELECT id, name FROM users WHERE id = ?", [counselorId], (err, row) => resolve(row)));
      if (userRow) {
        counselorName = userRow.name;
      }
    }

    // If Director assigned by Name, resolve the ID:
    if (!counselorId && counselorName) {
      const userRow = await new Promise(resolve => db.get("SELECT id, name FROM users WHERE name = ? OR name LIKE ?", [counselorName, `%${counselorName}%`], (err, row) => resolve(row)));
      if (userRow) {
        counselorId = userRow.id;
        counselorName = userRow.name;
      } else {
        counselorId = `USR-CNS-${Date.now()}`;
      }
    }
    if (!counselorId) counselorId = `USR-CNS-${Date.now()}`;

    const rawDays = Array.isArray(req.body.workingDays) && req.body.workingDays.length > 0
      ? req.body.workingDays
      : [req.body.dayOfWeek || req.body.day_of_week || 'Monday'];

    const dayOfWeek = rawDays[0];
    const timeSlot = req.body.timeSlot || req.body.time_slot || req.body.shiftHours || '08:00 AM - 10:00 AM';
    const maxSlots = parseInt(req.body.maxSlots || req.body.caseloadLimit || 4, 10);
    const status = req.body.status || 'Available';

    if (rawDays.length > 1) {
      // Support multi-day schedules from counselor setup
      for (const d of rawDays) {
        const existing = await new Promise(resolve => db.get(
          `SELECT id FROM counselor_schedules 
           WHERE (counselor_id = ? OR counselor_name = ?) 
             AND day_of_week = ? 
             AND time_slot = ?`,
          [counselorId || 0, counselorName, d, timeSlot],
          (err, row) => resolve(row)
        ));

        if (existing) {
          await new Promise(resolve => db.run(
            `UPDATE counselor_schedules 
             SET counselor_id = ?, counselor_name = ?, max_slots = ?, status = ? 
             WHERE id = ?`,
            [counselorId, counselorName, maxSlots, status, existing.id],
            () => resolve()
          ));
        } else {
          await new Promise(resolve => db.run(
            `INSERT INTO counselor_schedules (counselor_id, counselor_name, day_of_week, time_slot, max_slots, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [counselorId, counselorName, d, timeSlot, maxSlots, status],
            () => resolve()
          ));
        }
      }
      await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Assigned duty schedule for ${counselorName} on ${rawDays.join(', ')} (${timeSlot})`);
      return res.json({ success: true, message: "Duty schedule assigned successfully." });
    }

    // Check if existing record exists for this counselor and slot (match by ID or Name)
    db.get(
      `SELECT id FROM counselor_schedules 
       WHERE (counselor_id = ? OR counselor_name = ?) 
         AND day_of_week = ? 
         AND time_slot = ?`,
      [counselorId || 0, counselorName, dayOfWeek, timeSlot],
      (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: "Database query error." });

        if (existing) {
          db.run(
            `UPDATE counselor_schedules 
             SET counselor_id = ?, counselor_name = ?, max_slots = ?, status = ? 
             WHERE id = ?`,
            [counselorId, counselorName, maxSlots, status, existing.id],
            async (updateErr) => {
              if (updateErr) return res.status(500).json({ success: false, message: "Failed to update slot." });
              await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Updated duty schedule for ${counselorName} on ${dayOfWeek} (${timeSlot})`);
              return res.status(201).json({ success: true, message: "Duty schedule updated successfully." });
            }
          );
        } else {
          db.run(
            `INSERT INTO counselor_schedules (counselor_id, counselor_name, day_of_week, time_slot, max_slots, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [counselorId, counselorName, dayOfWeek, timeSlot, maxSlots, status],
            async function(insertErr) {
              if (insertErr) return res.status(500).json({ success: false, message: "Failed to insert duty slot: " + insertErr.message });
              await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Assigned duty schedule for ${counselorName} on ${dayOfWeek} (${timeSlot})`);
              return res.status(201).json({ success: true, message: "Duty schedule assigned successfully.", id: this.lastID });
            }
          );
        }
      }
    );
  } catch (err) {
    console.error('Error saving schedule:', err);
    res.status(500).json({ success: false, message: 'Failed to save duty schedule.' });
  }
};

app.post('/api/counselors/schedule', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleSaveCounselorSchedule);
app.post('/api/counselor/schedules', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleSaveCounselorSchedule);
app.put('/api/counselors/schedule', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleSaveCounselorSchedule);
app.put('/api/counselor/schedules', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleSaveCounselorSchedule);

// PATCH /api/counselor/schedules/:id - Update Status & Capacity
app.patch('/api/counselor/schedules/:id', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { status, maxSlots, max_slots } = req.body;
  const targetMax = maxSlots !== undefined ? maxSlots : max_slots;

  try {
    const existing = await db.getAsync('SELECT * FROM counselor_schedules WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Duty schedule slot not found.' });
    }

    await db.runAsync(`
      UPDATE counselor_schedules 
      SET status = COALESCE(?, status),
          max_slots = COALESCE(?, max_slots)
      WHERE id = ?
    `, [status, targetMax, id]);

    await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Updated duty schedule for ${existing.counselor_name} on ${existing.day_of_week} (${existing.time_slot}) to status: ${status || existing.status}`);

    res.json({ success: true, message: 'Schedule slot status updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update schedule.' });
  }
});

// DELETE /api/counselor/schedules/:id - Delete Duty Slot
app.delete('/api/counselor/schedules/:id', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.getAsync('SELECT * FROM counselor_schedules WHERE id = ?', [id]);
    await db.runAsync('DELETE FROM counselor_schedules WHERE id = ?', [id]);
    await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Deleted duty schedule slot ${id} for ${existing?.counselor_name || 'Counselor'} on ${existing?.day_of_week || 'N/A'} (${existing?.time_slot || 'N/A'})`);
    res.json({ success: true, message: 'Duty slot deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete schedule slot.' });
  }
});

// GET /api/counselor/student/:id - Fetch individual student details for Counselor/Director
app.get('/api/counselor/student/:id', authenticateToken, async (req, res) => {
  if (!['counselor', 'director', 'admin'].includes((req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const student = await db.getAsync(`
      SELECT 
        id, 
        student_id, 
        id_number, 
        name, 
        email, 
        phone, 
        contact_number, 
        college, 
        program, 
        emergency_contact, 
        role, 
        avatar, 
        intake_completed, 
        created_at 
      FROM users 
      WHERE (id = ? OR student_id = ? OR id_number = ?)
    `, [req.params.id, req.params.id, req.params.id]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    if (student.phone) student.phone = decryptData(student.phone);
    if (student.contact_number) student.contact_number = decryptData(student.contact_number);
    if (student.emergency_contact) student.emergency_contact = decryptData(student.emergency_contact);

    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/counselor/students & GET /api/students - Student Directory Query
const handleGetCounselorStudents = (req, res) => {
  const sql = `
    SELECT 
      u.id, 
      u.name, 
      u.student_id, 
      u.email, 
      COALESCE(u.college, 'CCIS') as college, 
      COALESCE(u.program, 'Undergraduate Degree') as program,
      COALESCE(u.year_level, '1st Year') as year_level,
      u.contact_number, 
      COALESCE(u.status, 'Active') as status, 
      COALESCE(u.is_verified, 0) as is_verified, 
      u.avatar, 
      u.created_at,
      MIN(a.date) as first_session_date,
      COUNT(a.id) as total_sessions
    FROM users u
    LEFT JOIN appointments a ON (
      a.student_id = u.student_id 
      OR a.student_id = u.id 
      OR LOWER(a.email) = LOWER(u.email)
    )
    WHERE LOWER(u.role) = 'student'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Failed to fetch student roster:", err);
      return res.status(500).json({ error: "Failed to fetch student roster" });
    }

    const byCollege = {};
    const decryptedStudents = (rows || []).map(s => {
      const decryptedPhone = decryptData(s.contact_number);
      const studentObj = {
        ...s,
        avatar: s.avatar || null,
        contact_number: decryptedPhone,
        total_sessions: parseInt(s.total_sessions || 0, 10),
        first_session_date: s.first_session_date || null
      };

      const collegeKey = studentObj.college || 'General';
      if (!byCollege[collegeKey]) byCollege[collegeKey] = [];
      byCollege[collegeKey].push(studentObj);

      return studentObj;
    });

    res.json({
      success: true,
      count: decryptedStudents.length,
      students: decryptedStudents,
      byCollege
    });
  });
};

app.get('/api/counselor/students', authenticateToken, requireCounselorOrAdmin, handleGetCounselorStudents);
app.get('/api/students', authenticateToken, requireCounselorOrAdmin, handleGetCounselorStudents);

// PATCH /api/counselor/students/:id/status - Update Student Status
app.patch('/api/counselor/students/:id/status', authenticateToken, requireCounselorOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['Active', 'Under Counseling', 'Completed', 'Flagged'];

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`,
      message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
    });
  }

  try {
    const student = await db.getAsync('SELECT * FROM users WHERE (id = ? OR student_id = ?) AND LOWER(role) = "student"', [id, id]);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "Student record not found.",
        message: "Student record not found."
      });
    }

    await db.runAsync('UPDATE users SET status = ? WHERE id = ? AND LOWER(role) = "student"', [status, student.id]);
    await logDpaEvent(req, 'DPA_USER_MUTATE', `Updated status for student ${student.name} (ID: ${student.student_id || student.id}) to ${status}`);
    await logActivity(req.user?.name || 'Counselor', req.user?.role || 'counselor', 'UPDATE_STUDENT_STATUS', `Updated student ${student.name} (${student.id}) status to ${status}`, req.ip);

    // Notify the specific student of status change
    createNotification({
      userId: student.id,
      title: 'Profile Status Updated',
      message: `Your counseling status has been updated to "${status}".`,
      type: 'info'
    });

    res.json({
      success: true,
      message: "Student status updated successfully."
    });
  } catch (err) {
    console.error('Error updating student status:', err);
    res.status(500).json({ success: false, error: 'Database error updating student status.' });
  }
});

// Student Deletion: Strictly authorized for Guidance Director and Super Admin only (Item 3)
const handleDeleteStudent = async (req, res) => {
  const userRole = (req.user?.role || '').toLowerCase();
  if (userRole !== 'director' && userRole !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized: Only the Guidance Director has permission to delete student accounts.',
      message: 'Unauthorized: Only the Guidance Director has permission to delete student accounts.'
    });
  }

  const targetId = req.params.id;

  try {
    const student = await db.getAsync("SELECT * FROM users WHERE (id = ? OR student_id = ?) AND LOWER(role) = 'student'", [targetId, targetId]);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student record not found." });
    }

    // Cascade purge of that student's appointments, assessments, soap notes, mood logs, and delegated access requests
    await db.runAsync('DELETE FROM appointments WHERE student_id = ? OR student_id = ? OR email = ?', [student.student_id, student.id, student.email]);
    await db.runAsync('DELETE FROM soap_notes WHERE student_id = ? OR student_id = ?', [student.student_id, student.id]);
    await db.runAsync('DELETE FROM assessments WHERE student_id = ? OR student_id = ? OR student_email = ?', [student.student_id, student.id, student.email]);
    await db.runAsync('DELETE FROM mood_logs WHERE student_id = ? OR student_id = ? OR student_email = ?', [student.student_id, student.id, student.email]);
    await db.runAsync('DELETE FROM delegated_access_requests WHERE student_id = ? OR student_id = ?', [student.student_id, student.id]);
    await db.runAsync("DELETE FROM users WHERE id = ? AND LOWER(role) = 'student'", [student.id]);

    // Log DPA Compliance audit entry
    await logDpaEvent(req, 'STUDENT_RECORD_AND_CLINICAL_HISTORY_PURGED', `Purged student record and cascaded clinical history for ${student.name} (${student.student_id || student.id})`);
    await logActivity(req.user?.name || 'Authorized Staff', req.user?.role || 'counselor', 'STUDENT_RECORD_AND_CLINICAL_HISTORY_PURGED', `Permanently deleted student ${student.name} (${student.student_id || student.id}) and all clinical records.`, req.ip);

    res.json({ success: true, message: `Student record and clinical history for ${student.name} permanently removed.` });
  } catch (err) {
    console.error('Error during student purge:', err);
    res.status(500).json({ success: false, message: "Database error removing student record." });
  }
};

app.delete(['/api/students/:id', '/api/counselor/students/:id'], authenticateJWT, handleDeleteStudent);
app.delete('/api/students/:id', authenticateJWT, handleDeleteStudent);
app.delete('/api/counselor/students/:id', authenticateJWT, handleDeleteStudent);

// Helper: Check Clinical Data Silo Authorization (DPA 2012 / RA 9258)
async function checkClinicalAccess(reqUser, student) {
  const role = (reqUser?.role || '').toLowerCase();
  if (['director', 'superadmin', 'admin'].includes(role)) {
    return { allowed: true, isDelegatedReadOnly: false };
  }

  // 1. Direct View if student has an appointment assigned to this counselor
  const assignedAppt = await db.getAsync(`
    SELECT id, counselor_id, counselor_name FROM appointments 
    WHERE (student_id = ? OR student_id = ? OR email = ?)
      AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?))
    LIMIT 1
  `, [student.id, student.student_id, student.email, reqUser.id, reqUser.name, reqUser.name]);

  if (assignedAppt) {
    return { allowed: true, isDelegatedReadOnly: false };
  }

  // Find primary assigned counselor for delegation target info
  const primaryAppt = await db.getAsync(`
    SELECT counselor_id, counselor_name FROM appointments
    WHERE (student_id = ? OR student_id = ? OR email = ?)
      AND status NOT IN ('Declined', 'Cancelled')
    ORDER BY created_at DESC LIMIT 1
  `, [student.id, student.student_id, student.email]);

  const targetCounselorId = primaryAppt?.counselor_id || 'USR-DIR-001';
  const targetCounselorName = primaryAppt?.counselor_name || 'Dr. Carmelita F. Castelo (Director)';

  // 2. Check for active, approved delegated access request
  const approvedReq = await db.getAsync(`
    SELECT * FROM delegated_access_requests 
    WHERE (student_id = ? OR student_id = ?) 
      AND requesting_counselor_id = ? 
      AND status = 'Approved' 
      AND datetime('now') <= datetime(expires_at)
    ORDER BY reviewed_at DESC LIMIT 1
  `, [student.id, student.student_id, reqUser.id]);

  if (approvedReq) {
    return { allowed: true, isDelegatedReadOnly: true, expiresAt: approvedReq.expires_at };
  }

  // 3. Siloed / Forbidden: requires explicit delegated access request
  return {
    allowed: false,
    requiresDelegation: true,
    targetCounselorId,
    targetCounselorName,
    message: "Confidential Clinical File: You must submit an access request to view this student's clinical notes and medical history."
  };
}

// GET /api/counselor/students/:id/soap-history - Fetch Decrypted Clinical SOAP Notes for a Student (Silo Guarded)
app.get('/api/counselor/students/:id/soap-history', authenticateJWT, requireRole('counselor', 'director', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const student = await db.getAsync('SELECT id, name, student_id, email, college, program, contact_number FROM users WHERE (id = ? OR student_id = ?) AND role = "student"', [id, id]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    const access = await checkClinicalAccess(req.user, student);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        requiresDelegation: true,
        message: access.message,
        studentId: student.id,
        studentNumericId: student.student_id,
        studentName: student.name,
        targetCounselorId: access.targetCounselorId,
        targetCounselorName: access.targetCounselorName
      });
    }

    await logDpaEvent(req, 'DPA_PHI_ACCESS', `Accessed clinical SOAP history for student ${student.name} (ID: ${student.student_id || student.id}) by ${req.user?.name || req.user?.email || 'Authorized Staff'}${access.isDelegatedReadOnly ? ' [DELEGATED_READ_ONLY]' : ''}`);

    student.contact_number = decryptData(student.contact_number);

    const notes = await db.allAsync(`
      SELECT s.*, a.date as appointment_date, a.time_slot, a.counselor_name as session_counselor, a.id as reference_no
      FROM soap_notes s
      LEFT JOIN appointments a ON s.appointment_id = a.id
      WHERE s.student_id = ? OR s.student_id = ?
      ORDER BY s.updated_at DESC
    `, [student.id, student.student_id]);

    const decryptedNotes = notes.map(n => ({
      ...n,
      subjective: decryptData(n.subjective),
      objective: decryptData(n.objective),
      assessment: decryptData(n.assessment),
      plan: decryptData(n.plan),
      remarks: n.remarks || ''
    }));

    res.json({
      success: true,
      student,
      isDelegatedReadOnly: Boolean(access.isDelegatedReadOnly),
      expiresAt: access.expiresAt || null,
      totalNotes: decryptedNotes.length,
      notes: decryptedNotes
    });
  } catch (err) {
    console.error('Error fetching student SOAP notes history:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch student clinical history.' });
  }
});

// ----------------------------------------------------
// 4. STUDENT PRIVATE MOOD TRACKER
// ----------------------------------------------------

app.get('/api/mood', authenticateJWT, async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.id;
    const rows = await db.allAsync(`
      SELECT * FROM mood_logs 
      WHERE student_id = ? OR student_email = ?
      ORDER BY logged_date DESC LIMIT 14
    `, [studentId, req.user.email]);

    res.json({ success: true, data: rows.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch mood history.' });
  }
});

app.post('/api/mood', authenticateJWT, async (req, res) => {
  const { mood, intensity, note } = req.body;
  if (!mood) {
    return res.status(400).json({ success: false, message: 'Mood selection is required.' });
  }

  const moodScoreMap = {
    'Joyful': 5,
    'Good': 4,
    'Neutral': 3,
    'Stressed': 2,
    'Anxious': 2,
    'Burnout': 1
  };

  const score = moodScoreMap[mood] || 3;
  const loggedDate = new Date().toISOString().split('T')[0];
  const moodId = `MOOD-${Date.now()}`;

  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const existingToday = await db.getAsync(`
      SELECT id FROM mood_logs 
      WHERE (student_id = ? OR student_id = ? OR LOWER(student_email) = LOWER(?)) 
        AND logged_date = ?
    `, [req.user.id, req.user.student_id || req.user.studentId || '', req.user.email || '', today]);

    if (existingToday) {
      return res.status(400).json({
        success: false,
        message: "You have already logged your emotional wellness pulse for today. Thank you for checking in!"
      });
    }

    await db.runAsync(`
      INSERT INTO mood_logs (id, student_id, student_email, mood, score, intensity, note, logged_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      moodId,
      req.user.studentId || req.user.id,
      req.user.email,
      mood,
      score,
      intensity || 5,
      note || '',
      loggedDate
    ]);

    await logActivity(req.user.name, req.user.role, 'MOOD_LOGGED', `Recorded daily mood pulse: ${mood} (Score: ${score}/5)`, req.ip);

    res.status(201).json({
      success: true,
      message: 'Daily mood logged successfully!',
      data: { id: moodId, mood, score, loggedDate }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to log mood.' });
  }
});

// ----------------------------------------------------
// 5. CLINICAL SOAP CASE NOTES (LOCKED FROM STUDENTS)
// ----------------------------------------------------

app.get('/api/soap/:appointmentId', authenticateJWT, requireRole('counselor', 'superadmin', 'director'), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const note = await db.getAsync('SELECT * FROM soap_notes WHERE appointment_id = ?', [appointmentId]);
    if (note) {
      note.subjective = decryptData(note.subjective);
      note.objective = decryptData(note.objective);
      note.assessment = decryptData(note.assessment);
      note.plan = decryptData(note.plan);
      note.remarks = decryptData(note.remarks);
      await logDpaEvent(req, 'DPA_PHI_ACCESS', `Accessed clinical SOAP notes for student ID: ${note.student_id} (Session: ${appointmentId}) by ${req.user?.name || req.user?.email || 'Authorized Staff'}`);
    }
    res.json({ success: true, data: note || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving SOAP case notes.' });
  }
});

app.post(['/api/soap', '/api/soap-notes'], authenticateJWT, requireRole('counselor', 'superadmin', 'director'), async (req, res) => {
  const { appointmentId, subjective, objective, assessment, plan, remarks } = req.body;

  if (!appointmentId) {
    return res.status(400).json({ success: false, message: 'Appointment ID is required.' });
  }

  // 1. Mandatory input validation on all 4 fields
  if (!subjective?.trim() || !objective?.trim() || !assessment?.trim() || !plan?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'All 4 clinical fields (Subjective, Objective, Assessment, Plan) are strictly required.'
    });
  }

  try {
    const appt = await db.getAsync('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const studentId = req.body.studentId || appt.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    // 2. SOAP Authoring Exclusivity: Only the assigned counselor can file notes
    const isDirector = ['director', 'superadmin'].includes(req.user.role.toLowerCase());
    const isAssigned = (appt.counselor_id === req.user.id) ||
                       (appt.counselor_name && appt.counselor_name.toLowerCase() === req.user.name.toLowerCase());

    if (!isDirector && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the assigned primary counselor can author or submit SOAP clinical notes for this session.'
      });
    }

    // 3. Time-Gating: notes can only be saved once the session is ongoing or concluded
    const { startTime } = parseAppointmentDateRange(appt.date, appt.time_slot);
    const now = new Date();
    if (appt.status !== 'Completed' && startTime && now.getTime() < startTime.getTime()) {
      return res.status(403).json({
        success: false,
        message: 'Time-Gated SOAP Filing: Clinical notes can only be saved once the session is ongoing or concluded.'
      });
    }

    const existing = await db.getAsync('SELECT id FROM soap_notes WHERE appointment_id = ?', [appointmentId]);
    const nowIso = now.toISOString();

    const encSubjective = encryptData(subjective.trim());
    const encObjective = encryptData(objective.trim());
    const encAssessment = encryptData(assessment.trim());
    const encPlan = encryptData(plan.trim());
    const encRemarks = encryptData(remarks?.trim() || '');

    if (existing) {
      await db.runAsync(`
        UPDATE soap_notes 
        SET subjective = ?, objective = ?, assessment = ?, plan = ?, remarks = ?, counselor_id = ?, counselor_name = ?, updated_at = ?
        WHERE appointment_id = ?
      `, [encSubjective, encObjective, encAssessment, encPlan, encRemarks, req.user.id, req.user.name, nowIso, appointmentId]);
    } else {
      const soapId = `SOAP-${Date.now()}`;
      await db.runAsync(`
        INSERT INTO soap_notes (id, appointment_id, student_id, counselor_id, counselor_name, subjective, objective, assessment, plan, remarks, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [soapId, appointmentId, studentId, req.user.id, req.user.name, encSubjective, encObjective, encAssessment, encPlan, encRemarks, nowIso]);
    }

    await db.runAsync('UPDATE appointments SET status = "Completed" WHERE id = ?', [appointmentId]);
    await logDpaEvent(req, 'DPA_PHI_ACCESS', `Filed clinical SOAP notes for student ID: ${studentId} (Session: ${appointmentId}) by ${req.user.name}`);
    await logActivity(req.user.name, req.user.role, 'SOAP_NOTES_FILED', `Documented encrypted clinical SOAP notes for session ${appointmentId}`, req.ip);

    res.json({ success: true, message: 'SOAP note filed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to save SOAP case notes.' });
  }
});

// GET /api/counselor/soap-records - Strictly Documented Clinical Session Records (Non-empty entries only)
app.get(['/api/counselor/soap-records', '/api/clinical-records'], authenticateToken, async (req, res) => {
  if (req.user.role !== 'counselor' && req.user.role !== 'director' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  // Strict check: Must exist in soap_notes AND contain non-empty subjective/assessment documentation
  const query = `
    SELECT 
      a.id AS appointment_id,
      a.id AS reference_code,
      a.student_name,
      a.student_id,
      a.counseling_type AS counseling_focus,
      a.counselor_name,
      a.date AS scheduled_date,
      a.date AS date_concluded,
      s.id AS soap_id,
      s.subjective,
      s.objective,
      s.assessment,
      s.plan,
      s.updated_at AS documented_at
    FROM appointments a
    INNER JOIN soap_notes s ON (s.appointment_id = a.id)
    WHERE (a.counselor_id = ? OR a.counselor_name LIKE ? OR ? IN ('director', 'superadmin'))
    ORDER BY s.id DESC
  `;

  try {
    const rows = await db.allAsync(query, [req.user.id, `%${req.user.name}%`, req.user.role]);
    const processedRows = (rows || []).map(r => {
      let subj = r.subjective || '';
      let assess = r.assessment || '';
      let obj = r.objective || '';
      let plan = r.plan || '';
      if (typeof decryptData === 'function') {
        if (typeof subj === 'string' && subj.startsWith('enc:')) subj = decryptData(subj);
        if (typeof assess === 'string' && assess.startsWith('enc:')) assess = decryptData(assess);
        if (typeof obj === 'string' && obj.startsWith('enc:')) obj = decryptData(obj);
        if (typeof plan === 'string' && plan.startsWith('enc:')) plan = decryptData(plan);
      }
      return {
        ...r,
        subjective: subj,
        objective: obj,
        assessment: assess,
        plan: plan
      };
    }).filter(r => (r.subjective && r.subjective.trim() !== '') || (r.assessment && r.assessment.trim() !== ''));

    res.json({ success: true, records: processedRows });
  } catch (err) {
    console.error('Failed to query documented SOAP sessions:', err);
    res.status(500).json({ success: false, message: 'Database error fetching documented sessions' });
  }
});

// POST /api/public/faculty-referral - Public/Faculty Student Endorsement Intake
app.post('/api/public/faculty-referral', async (req, res) => {
  const { facultyName, facultyEmail, facultyDept, studentQuery, studentEmail, behaviorCategory, urgencyLevel, objectiveNarrative } = req.body;

  if (!facultyName || !facultyEmail || !studentQuery || !behaviorCategory || !urgencyLevel || !objectiveNarrative) {
    return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
  }

  try {
    // Check if student exists in users registry (Graceful / Universal Student Referral)
    const cleanQuery = studentQuery.trim();
    const student = await db.getAsync(`
      SELECT id, name, college, student_id, email 
      FROM users 
      WHERE role = 'student' AND (student_id = ? OR LOWER(name) LIKE LOWER(?))
      LIMIT 1
    `, [cleanQuery, `%${cleanQuery}%`]);

    const resolvedStudentId = student ? (student.student_id || student.id) : cleanQuery;
    const resolvedStudentName = student ? student.name : cleanQuery;
    const resolvedStudentCollege = student ? (student.college || facultyDept || 'UMak') : (facultyDept || 'UMak');
    const resolvedStudentEmail = (studentEmail && studentEmail.trim()) || (student ? student.email : '') || '';

    // 1. Store in Open Pool (No initial assigned counselor)
    const insertResult = await db.runAsync(`
      INSERT INTO faculty_referrals (
        faculty_name, faculty_email, faculty_dept, student_id, student_name,
        student_college, student_email, behavior_category, urgency_level, objective_narrative,
        assigned_counselor_id, assigned_counselor_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'Received by CGCS')
    `, [
      facultyName, facultyEmail, facultyDept,
      resolvedStudentId, resolvedStudentName, resolvedStudentCollege, resolvedStudentEmail,
      behaviorCategory, urgencyLevel, objectiveNarrative
    ]);
    const referralId = insertResult.lastID;

    // 2. Broadcast notification to ALL active counselors
    const allCounselors = await db.allAsync(`
      SELECT id, name FROM users 
      WHERE LOWER(role) = 'counselor' AND (status = 'Active' OR status IS NULL)
    `);
    if (allCounselors && allCounselors.length > 0 && typeof createTargetedNotification === 'function') {
      allCounselors.forEach(c => {
        createTargetedNotification({
          recipientId: c.id,
          senderName: facultyName,
          title: `Faculty Endorsement: ${resolvedStudentName} (${urgencyLevel})`,
          message: `Prof. ${facultyName} (${facultyDept}) submitted an endorsement: ${behaviorCategory}.`,
          type: 'referral_received',
          actionLink: 'counselor-referrals',
          referenceId: String(referralId)
        });
      });
    }

    // 3. Notify Student in-app if registered user exists
    if (student && student.id && typeof createTargetedNotification === 'function') {
      createTargetedNotification({
        recipientId: student.id,
        senderName: 'CGCS Center',
        title: 'Guidance & Counseling Support Invitation',
        message: `Your professor, ${facultyName}, endorsed you for routine guidance support. You may schedule a voluntary consultation through your portal.`,
        type: 'student_invitation',
        actionLink: 'student-appointments',
        referenceId: String(referralId)
      });
    }

    return res.json({ success: true, message: 'Endorsement submitted successfully. All counselors have been notified.' });
  } catch (err) {
    console.error('Faculty endorsement error:', err);
    return res.status(500).json({ success: false, message: 'Server error processing endorsement.' });
  }
});

// GET /api/counselor/faculty-referrals - Fetch all faculty student endorsements for counselor desk
app.get('/api/counselor/faculty-referrals', authenticateToken, async (req, res) => {
  if (req.user.role !== 'counselor' && req.user.role !== 'director' && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Counselor access required.' });
  }

  try {
    const referrals = await db.allAsync('SELECT * FROM faculty_referrals ORDER BY id DESC');
    return res.json({ success: true, referrals: referrals || [] });
  } catch (err) {
    console.error('Error fetching faculty referrals:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch faculty referrals.' });
  }
});

// GET /api/referrals (backward-compatibility alias)
app.get('/api/referrals', authenticateToken, async (req, res) => {
  try {
    const referrals = await db.allAsync('SELECT * FROM faculty_referrals ORDER BY id DESC');
    return res.json({ success: true, data: referrals || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch referrals' });
  }
});

// POST /api/counselor/faculty-referrals/action - Counselor outreach action
app.post('/api/counselor/faculty-referrals/action', authenticateToken, async (req, res) => {
  if (req.user.role !== 'counselor' && req.user.role !== 'director' && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Counselor access required.' });
  }

  const { refId, targetType, subject, message, updateStatus } = req.body;
  const ref = await (db.prepare ? db.prepare('SELECT * FROM faculty_referrals WHERE id = ?').get(refId) : db.getAsync('SELECT * FROM faculty_referrals WHERE id = ?', [refId]));
  if (!ref) {
    return res.status(404).json({ success: false, message: 'Referral record not found.' });
  }

  // --- FCFS CHECK: Prevent action if already claimed by another counselor ---
  if (ref.assigned_counselor_id && String(ref.assigned_counselor_id) !== String(req.user.id)) {
    return res.status(409).json({
      success: false,
      code: 'ALREADY_CLAIMED',
      message: `Na-aksyunan na ito ni ${ref.assigned_counselor_name || 'ibang counselor'}. Hindi mo na ito pwedeng galawin.`
    });
  }

  const nextStatus = targetType === 'student' ? 'Student Contacted' : 'Faculty Coordinated';

  // Atomic Update: Ensures only the first counselor claiming it wins the race condition
  const updateResult = await db.runAsync(`
    UPDATE faculty_referrals 
    SET status = ?, 
        assigned_counselor_id = ?, 
        assigned_counselor_name = ?,
        actioned_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (assigned_counselor_id IS NULL OR assigned_counselor_id = ?)
  `, [nextStatus, req.user.id, req.user.name, refId, req.user.id]);

  if (updateResult.changes === 0) {
    const currentRef = await db.getAsync('SELECT assigned_counselor_name FROM faculty_referrals WHERE id = ?', [refId]);
    return res.status(409).json({
      success: false,
      code: 'ALREADY_CLAIMED',
      message: `Na-aksyunan na ito ni ${currentRef?.assigned_counselor_name || 'ibang counselor'}. Hindi mo na ito pwedeng galawin.`
    });
  }

  // --- NOTIFICATION PURGE FOR OTHER COUNSELORS ---
  // Delete the notification from all other counselors' inboxes so it disappears
  try {
    await db.runAsync(`
      DELETE FROM notifications 
      WHERE reference_id = ? 
        AND type = 'referral_received' 
        AND user_id != ?
    `, [String(refId), String(req.user.id)]);
  } catch (notifErr) {
    console.warn('Failed to delete notifications for other counselors:', notifErr.message);
  }

  // Mark notification as read for the acting counselor
  try {
    await db.runAsync(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE reference_id = ? 
        AND type = 'referral_received' 
        AND user_id = ?
    `, [String(refId), String(req.user.id)]);
  } catch (notifErr) {}

  // Dispatch notification to student if target is student
  if (targetType === 'student' && typeof createTargetedNotification === 'function') {
    createTargetedNotification({
      recipientId: ref.student_id,
      senderName: req.user.name,
      title: subject,
      message: message,
      type: 'counselor_outreach',
      actionLink: 'student-appointments',
      referenceId: String(refId)
    });
  }

  // Automated Email Trigger on Counselor Action:
  let studentEmail = ref.student_email;
  if (!studentEmail) {
    const studentUser = await db.getAsync('SELECT email FROM users WHERE student_id = ? OR id = ?', [ref.student_id, ref.student_id]);
    if (studentUser && studentUser.email) {
      studentEmail = studentUser.email;
    }
  }

  if (studentEmail && studentEmail.includes('@')) {
    const studentName = ref.student_name || 'UMak Student';
    const counselorName = req.user.name || 'UMak Guidance Specialist';
    try {
      await transporter.sendMail({
        from: 'UMak Center for Guidance and Counseling Services <guidance@umak.edu.ph>',
        to: studentEmail,
        subject: 'University of Makati CGCS — Support & Wellness Check-In',
        html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px;">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="color: #0d4a2b; margin: 0;">UNIVERSITY OF MAKATI</h3>
    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Center for Guidance and Counseling Services (CGCS)</p>
  </div>
  <p>Dear <strong>${studentName}</strong>,</p>
  <p>We hope this message finds you well. A guidance specialist (<strong>${counselorName}</strong>) is available to connect with you for a confidential check-in, wellness consultation, or academic adjustment support.</p>
  <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px; margin: 18px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Location:</strong> Admin Building, Room 304, CGCS Center</p>
    <p style="margin: 4px 0 0; font-size: 14px; color: #334155;"><strong>Portal:</strong> You can also view available schedules and book directly via the Heron Student Wellness Portal.</p>
  </div>
  <p style="font-size: 13px; color: #64748b;">Your privacy is strictly protected under Republic Act 10173 and RA 9258.</p>
  <p style="margin-top: 24px; font-size: 14px;">Warm regards,<br><strong>UMak Guidance & Counseling Team</strong></p>
</div>
        `
      });
      console.log(`[DPA AUDIT] FACULTY_REFERRAL_STUDENT_OUTREACH: Sent to [${studentEmail}] for referral [${refId}]`);
    } catch (mailErr) {
      console.warn('Failed to dispatch automated referral email to student:', mailErr.message);
    }
  }

  return res.json({ success: true, message: 'Outreach dispatched and referral locked to you.' });
});

// ----------------------------------------------------
// 5B. DELEGATED CLINICAL ACCESS REQUESTS (DPA 2012 / RA 9258)
// ----------------------------------------------------

// POST /api/delegated-access/request - Request temporary 24h read-only access
app.post('/api/delegated-access/request', authenticateToken, async (req, res) => {
  try {
    const { studentId, appointmentId, reason, reasonCategory, reasonDetails, targetCounselorId } = req.body;
    const requestingCounselorId = String(req.user.id);
    const requestingCounselorName = req.user.name;

    // Find the student's assigned counselor from active appointments
    let targetCounselor = null;
    if (appointmentId) {
      targetCounselor = await db.getAsync(`SELECT counselor_id, counselor_name FROM appointments WHERE id = ?`, [appointmentId]);
    }
    if (!targetCounselor || !targetCounselor.counselor_id) {
      targetCounselor = await db.getAsync(`
        SELECT counselor_id, counselor_name 
        FROM appointments 
        WHERE (student_id = ? OR student_id = (SELECT student_id FROM users WHERE id = ?) OR email = (SELECT email FROM users WHERE id = ? OR student_id = ?)) 
          AND status NOT IN ('Declined', 'Cancelled')
        ORDER BY id DESC LIMIT 1
      `, [studentId, studentId, studentId, studentId]);
    }

    if (!targetCounselor && targetCounselorId) {
      const u = await db.getAsync(`SELECT id AS counselor_id, name AS counselor_name FROM users WHERE id = ? OR name = ?`, [targetCounselorId, targetCounselorId]);
      if (u) targetCounselor = u;
    }

    if (targetCounselor && !targetCounselor.counselor_id && targetCounselor.counselor_name) {
      const u = await db.getAsync(`SELECT id FROM users WHERE name = ? AND role = 'counselor'`, [targetCounselor.counselor_name]);
      if (u) targetCounselor.counselor_id = u.id;
    }

    // Ensure target_counselor_id and target_counselor_name are never NULL
    const targetId = (targetCounselor && targetCounselor.counselor_id) ? String(targetCounselor.counselor_id) : 'USR-DIR-001';
    const targetName = (targetCounselor && targetCounselor.counselor_name) ? targetCounselor.counselor_name : 'Primary Assigned Counselor';
    const finalReason = reason || (reasonCategory ? `${reasonCategory}: ${reasonDetails || ''}` : 'Clinical Consultation');

    // Resolve student's internal UUID for consistent foreign key
    const studentUser = await db.getAsync('SELECT id, name, student_id FROM users WHERE id = ? OR student_id = ?', [studentId, studentId]);
    const finalStudentId = studentUser ? studentUser.id : studentId;

    const result = await db.runAsync(`
      INSERT INTO delegated_access_requests (
        student_id, appointment_id, requesting_counselor_id, requesting_counselor_name,
        target_counselor_id, target_counselor_name, reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP)
    `, [finalStudentId, appointmentId || null, requestingCounselorId, requestingCounselorName, targetId, targetName, finalReason]);

    const reqId = result.lastID;

    // Notifications & DPA audit
    try {
      createTargetedNotification({
        recipientId: targetId,
        senderId: req.user.id,
        senderName: requestingCounselorName,
        title: 'Clinical Record Access Requested',
        message: `Counselor ${requestingCounselorName} requested 24h read-only access for student ${studentUser?.name || studentId}.`,
        type: 'delegated_access_req',
        actionLink: 'counselor-delegated-desk',
        referenceId: reqId
      });

      const directorUser = await db.getAsync("SELECT id FROM users WHERE LOWER(role) IN ('director', 'superadmin') LIMIT 1");
      if (directorUser && String(directorUser.id) !== String(targetId)) {
        createTargetedNotification({
          recipientId: directorUser.id,
          senderId: req.user.id,
          senderName: requestingCounselorName,
          title: 'Clinical Record Access Requested',
          message: `Counselor ${requestingCounselorName} requested 24h read-only access for student ${studentUser?.name || studentId}.`,
          type: 'delegated_access_req',
          actionLink: 'director-reports',
          referenceId: reqId
        });
      }

      await logDpaEvent(req, 'DPA_PHI_ACCESS', `Requested delegated clinical access for student ${studentUser?.name || studentId} (${finalStudentId}) by ${requestingCounselorName}`);
    } catch (e) {}

    return res.json({
      success: true,
      requestId: reqId,
      lastInsertRowid: reqId,
      message: "Delegated access request submitted successfully."
    });
  } catch (err) {
    console.error('Error submitting delegated access request:', err);
    return res.status(500).json({ success: false, error: err.message, message: 'Failed to submit delegated access request.' });
  }
});

// PATCH /api/delegated-access/review/:id - Approve or Decline access request
app.patch('/api/delegated-access/review/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'Approved' | 'Declined'
  if (!['Approved', 'Declined'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be "Approved" or "Declined".' });
  }

  try {
    const accessReq = await db.getAsync('SELECT * FROM delegated_access_requests WHERE id = ?', [id]);
    if (!accessReq) {
      return res.status(404).json({ success: false, message: 'Access request not found.' });
    }

    const isDirector = ['director', 'superadmin'].includes((req.user.role || '').toLowerCase());
    let isTarget = (accessReq.target_counselor_id && String(accessReq.target_counselor_id) === String(req.user.id)) || 
                   (accessReq.target_counselor_name && accessReq.target_counselor_name.toLowerCase() === req.user.name.toLowerCase());

    if (!isDirector && !isTarget) {
      // Check if user is the assigned counselor for this student in appointments
      const appt = await db.getAsync(`
        SELECT id FROM appointments 
        WHERE (student_id = ? OR student_id = (SELECT student_id FROM users WHERE id = ?)) 
          AND (counselor_id = ? OR LOWER(counselor_name) = LOWER(?))
        LIMIT 1
      `, [accessReq.student_id, accessReq.student_id, String(req.user.id), req.user.name]);
      if (appt) {
        isTarget = true;
      }
    }

    if (!isDirector && !isTarget) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only the assigned primary counselor or Director can review this access request.' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const studentRec = await db.getAsync('SELECT name FROM users WHERE id = ? OR student_id = ?', [accessReq.student_id, accessReq.student_id]);
    const studentDisplayName = studentRec ? studentRec.name : (accessReq.student_name || 'the student');

    if (action === 'Approved') {
      await db.runAsync(`
        UPDATE delegated_access_requests
        SET status = 'Approved', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, expires_at = ?
        WHERE id = ?
      `, [req.user.id, req.user.name, expiresAt, id]);

      try {
        createTargetedNotification({
          recipientId: accessReq.requesting_counselor_id,
          senderId: req.user.id,
          senderName: req.user.name,
          title: `Clinical Access Request Approved`,
          message: `Clearance granted for 24 hours to view ${studentDisplayName}'s records.`,
          type: 'delegated_access_decision',
          actionLink: 'open-student-clinical-sheet',
          referenceId: accessReq.student_id
        });

        await logDpaEvent(req, 'DPA_PHI_ACCESS', `Approved 24h delegated clinical access for counselor ${accessReq.requesting_counselor_name} to student ID ${accessReq.student_id}`);
      } catch (e) {}

      return res.json({ success: true, message: 'Access request approved. 24-hour read-only permission granted.' });
    } else {
      await db.runAsync(`
        UPDATE delegated_access_requests
        SET status = 'Declined', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user.id, req.user.name, id]);

      try {
        createTargetedNotification({
          recipientId: accessReq.requesting_counselor_id,
          senderId: req.user.id,
          senderName: req.user.name,
          title: `Clinical Access Request Declined`,
          message: `Your access request for ${studentDisplayName} was declined.`,
          type: 'delegated_access_decision',
          actionLink: null,
          referenceId: accessReq.student_id
        });

        await logDpaEvent(req, 'DPA_PHI_ACCESS', `Declined delegated clinical access for counselor ${accessReq.requesting_counselor_name} to student ID ${accessReq.student_id}`);
      } catch (e) {}

      return res.json({ success: true, message: 'Access request declined.' });
    }
  } catch (err) {
    console.error('Error reviewing delegated access request:', err);
    return res.status(500).json({ success: false, message: 'Failed to process access review.' });
  }
});

// GET /api/delegated-access/requests - List access requests
app.get('/api/delegated-access/requests', authenticateToken, async (req, res) => {
  try {
    let rows = [];
    if (req.user.role === 'director' || req.user.role === 'superadmin') {
      rows = await db.allAsync(`
        SELECT d.*, u.name AS student_name, u.student_id AS student_school_id 
        FROM delegated_access_requests d
        LEFT JOIN users u ON (u.id = d.student_id OR u.student_id = d.student_id)
        ORDER BY 
          CASE WHEN d.status = 'Pending' THEN 1 ELSE 2 END,
          d.id DESC
      `);
    } else {
      const userIdStr = String(req.user.id);
      const userName = req.user.name;
      rows = await db.allAsync(`
        SELECT d.*, u.name AS student_name, u.student_id AS student_school_id 
        FROM delegated_access_requests d
        LEFT JOIN users u ON (u.id = d.student_id OR u.student_id = d.student_id)
        WHERE d.target_counselor_id = ? 
           OR LOWER(d.target_counselor_name) = LOWER(?)
           OR d.student_id IN (
             SELECT student_id FROM appointments 
             WHERE counselor_id = ? OR LOWER(counselor_name) = LOWER(?)
           )
           OR u.student_id IN (
             SELECT student_id FROM appointments 
             WHERE counselor_id = ? OR LOWER(counselor_name) = LOWER(?)
           )
           OR u.id IN (
             SELECT student_id FROM appointments 
             WHERE counselor_id = ? OR LOWER(counselor_name) = LOWER(?)
           )
        ORDER BY 
          CASE WHEN d.status = 'Pending' THEN 1 ELSE 2 END,
          d.id DESC
      `, [userIdStr, userName, userIdStr, userName, userIdStr, userName, userIdStr, userName]);
    }
    return res.json({ success: true, requests: rows, data: rows });
  } catch (err) {
    console.error('Error fetching delegated access requests:', err);
    return res.status(500).json({ success: false, error: err.message, requests: [], data: [] });
  }
});

// ----------------------------------------------------
// 6. DIGITAL ASSESSMENTS (PHQ-9 & GAD-7)
// ----------------------------------------------------

app.get('/api/assessments', authenticateJWT, async (req, res) => {
  try {
    let sql = 'SELECT * FROM assessments WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      sql += ' AND (student_id = ? OR student_email = ?)';
      params.push(req.user.studentId || '', req.user.email);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = await db.allAsync(sql, params);
    const formatted = rows.map(r => ({
      ...r,
      answers_json: decryptData(r.answers_json),
      recommendations: decryptData(r.recommendations)
    }));
    res.json({ success: true, total: formatted.length, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve assessment records.' });
  }
});

app.post('/api/assessments', authenticateJWT, async (req, res) => {
  const { assessmentType, answers } = req.body;

  if (!assessmentType || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid assessment payload. Please answer all questions.' });
  }

  // Mandatory DPA 2012 (RA 10173) & RA 9258 Clinical Disclosure Consent Validation
  const consent = req.body.dataPrivacyConsent;
  if (consent !== true && consent !== 'true' && consent !== 1 && consent !== '1') {
    return res.status(400).json({
      success: false,
      error: "Data privacy and clinical consent is mandatory under RA 10173 and RA 9258.",
      message: "Data privacy and clinical consent is mandatory under RA 10173 and RA 9258."
    });
  }

  try {
    const totalScore = answers.reduce((sum, val) => sum + parseInt(val || 0, 10), 0);
    let severity = 'Minimal';
    let recommendations = '';
    let crisisFlag = 0;

    if (assessmentType === 'PHQ-9') {
      if (totalScore <= 4) {
        severity = 'Minimal Depression';
        recommendations = 'Score indicates minimal distress. Maintain healthy sleep, exercise, and social balance.';
      } else if (totalScore <= 9) {
        severity = 'Mild Depression';
        recommendations = 'Mild depressive symptoms detected. Practice active mindfulness and time management techniques.';
      } else if (totalScore <= 14) {
        severity = 'Moderate Depression';
        recommendations = 'Moderate symptoms present. Booking a counseling consultation with CGCS is encouraged.';
      } else if (totalScore <= 19) {
        severity = 'Moderately Severe Depression';
        recommendations = 'Noticeable clinical distress. Active guidance session recommended immediately.';
        crisisFlag = 1;
      } else {
        severity = 'Severe Depression';
        recommendations = 'High distress levels. Immediate guidance intervention prioritized by CGCS counselors.';
        crisisFlag = 1;
      }
      if (answers[8] && parseInt(answers[8], 10) > 0) {
        crisisFlag = 1;
      }
    } else if (assessmentType === 'GAD-7') {
      if (totalScore <= 4) {
        severity = 'Minimal Anxiety';
        recommendations = 'Low anxiety levels. Continue practicing self-care and relaxation.';
      } else if (totalScore <= 9) {
        severity = 'Mild Anxiety';
        recommendations = 'Mild tension observed. Use HeronCare AI grounding exercises when feeling overwhelmed.';
      } else if (totalScore <= 14) {
        severity = 'Moderate Anxiety';
        recommendations = 'Moderate anxiety detected. Scheduling a 1-on-1 session with CGCS is recommended.';
      } else {
        severity = 'Severe Anxiety';
        recommendations = 'High anxiety index. Please schedule an appointment or contact CGCS duty counselor.';
        crisisFlag = 1;
      }
    }

    const asmId = `ASM-${assessmentType.replace('-', '')}-${Date.now()}`;
    const createdAt = new Date().toISOString();
    await db.runAsync(`
      INSERT INTO assessments (
        id, student_id, student_name, student_email, college, assessment_type, score, severity, answers_json, recommendations, crisis_flag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      asmId,
      req.user.studentId || 'K120-UNKWN',
      req.user.name,
      req.user.email,
      req.user.college || 'CCIS',
      assessmentType,
      totalScore,
      severity,
      encryptData(JSON.stringify(answers)),
      encryptData(recommendations),
      crisisFlag,
      createdAt
    ]);

    // Dispatch High Urgency Crisis Alerts ONLY to assigned counselor and Director
    if (crisisFlag) {
      const studentRec = await db.getAsync("SELECT name, college, role FROM users WHERE id = ?", [req.user.id]);
      if (studentRec && studentRec.role === 'student') {
        // Find assigned counselor
        let assignedCounselor = await db.getAsync(`
          SELECT counselor_id, counselor_name FROM appointments 
          WHERE (student_id = ? OR student_id = ? OR email = ?) AND counselor_id IS NOT NULL 
          ORDER BY id DESC LIMIT 1
        `, [req.user.id, req.user.studentId || req.user.id, req.user.email || '']);

        if (!assignedCounselor || !assignedCounselor.counselor_id) {
          assignedCounselor = await db.getAsync("SELECT id AS counselor_id, name AS counselor_name FROM users WHERE LOWER(role) = 'counselor' LIMIT 1");
        }

        const nonDiagSev = totalScore >= 15 ? 'High Concern' : (totalScore >= 10 ? 'Moderate Concern' : 'Mild Concern');
        if (assignedCounselor && assignedCounselor.counselor_id) {
          createTargetedNotification({
            recipientId: assignedCounselor.counselor_id,
            senderId: req.user.id,
            senderName: studentRec.name,
            title: 'PRIORITY ALERT: Elevated Concern Score Detected',
            message: `Student ${studentRec.name} (${studentRec.college || req.user.college || 'UMak'}) completed ${assessmentType} (${nonDiagSev}, ${totalScore} pts). Supportive outreach recommended.`,
            type: 'crisis_alert',
            actionLink: 'counselor-queue',
            referenceId: asmId
          });
        }

        const directorUser = await db.getAsync("SELECT id FROM users WHERE LOWER(role) IN ('director', 'superadmin') LIMIT 1");
        if (directorUser) {
          createTargetedNotification({
            recipientId: directorUser.id,
            senderId: req.user.id,
            senderName: studentRec.name,
            title: 'PRIORITY ALERT: Elevated Concern Score Detected',
            message: `Elevated concern score detected for student ${studentRec.name} (${studentRec.college || req.user.college || 'UMak'}) on ${assessmentType} (${nonDiagSev}). Supportive triage review recommended.`,
            type: 'crisis_alert',
            actionLink: 'director-reports',
            referenceId: asmId
          });
        }
      }
    }

    await logActivity(req.user.name, req.user.role, 'ASSESSMENT_COMPLETED', `Completed ${assessmentType} (Score: ${totalScore}, ${severity}, CrisisFlag: ${crisisFlag})`, req.ip);

    res.status(201).json({
      success: true,
      message: `${assessmentType} Assessment completed.`,
      data: {
        id: asmId,
        assessmentType,
        score: totalScore,
        severity,
        recommendations,
        crisisFlag: Boolean(crisisFlag)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error processing assessment.' });
  }
});

// POST /api/student/intake-disclosure - Dual Assessment (PHQ-9 + GAD-7) & Medical Disclosure
app.post('/api/student/intake-disclosure', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { phq9, gad7, medical_history } = req.body;

  if (!phq9 || !gad7 || !medical_history) {
    return res.status(400).json({ success: false, message: 'Both mental health scales and medical history are strictly required.' });
  }

  try {
    const studentId = req.user.student_id || req.user.id_number || req.user.id;

    // 1. Store or update medical disclosure
    await db.prepare(`
      INSERT INTO medical_disclosures (student_id, student_name, diagnosed_conditions, current_medications, past_psychiatric_meds, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id) DO UPDATE SET
        diagnosed_conditions = excluded.diagnosed_conditions,
        current_medications = excluded.current_medications,
        past_psychiatric_meds = excluded.past_psychiatric_meds,
        updated_at = datetime('now')
    `).run(
      studentId,
      req.user.name,
      medical_history.diagnosed_conditions,
      medical_history.current_medications,
      medical_history.past_psychiatric_meds
    );

    // 2. Record assessment scores
    await db.prepare(`
      INSERT INTO mental_health_screenings (student_id, student_name, phq9_score, gad7_score, phq9_data, gad7_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      studentId,
      req.user.name,
      phq9.total_score,
      gad7.total_score,
      JSON.stringify(phq9.answers),
      JSON.stringify(gad7.answers)
    );

    // 3. Mark user intake as completed to unlock booking
    await db.prepare(`
      UPDATE users 
      SET intake_completed = 1, has_completed_intake = 1, updated_at = datetime('now')
      WHERE id = ? OR student_id = ?
    `).run(req.user.id, studentId);

    res.json({ success: true, message: 'Intake and disclosure saved successfully.' });
  } catch (err) {
    console.error('Error saving student intake:', err);
    res.status(500).json({ success: false, message: 'Database error saving intake disclosure.' });
  }
});

// POST /api/student/complete-intake - Combined Intake & Encrypted Health Disclosure
app.post('/api/student/complete-intake', authenticateJWT, async (req, res) => {
  const {
    assessmentType = 'PHQ-9',
    answers,
    hasIllness,
    medicalConditions,
    isTakingMedication,
    currentMedications,
    previousMedications
  } = req.body;

  if (!assessmentType || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid assessment payload. Please answer all questions.' });
  }

  const hasIllnessVal = (hasIllness === true || hasIllness === 1 || hasIllness === '1' || hasIllness === 'yes') ? 1 : 0;
  const isTakingMedVal = (isTakingMedication === true || isTakingMedication === 1 || isTakingMedication === '1' || isTakingMedication === 'yes') ? 1 : 0;

  if (hasIllnessVal && (!medicalConditions || !medicalConditions.trim())) {
    return res.status(400).json({ success: false, message: 'Please specify your physical illness or medical conditions.' });
  }

  if (isTakingMedVal && (!currentMedications || !currentMedications.trim())) {
    return res.status(400).json({ success: false, message: 'Please list your current prescription or maintenance medications.' });
  }

  try {
    const totalScore = answers.reduce((sum, val) => sum + parseInt(val || 0, 10), 0);
    let severity = 'Minimal';
    let recommendations = '';
    let crisisFlag = 0;

    if (assessmentType === 'PHQ-9') {
      if (totalScore <= 4) {
        severity = 'Minimal Depression';
        recommendations = 'Score indicates minimal distress. Maintain healthy sleep, exercise, and social balance.';
      } else if (totalScore <= 9) {
        severity = 'Mild Depression';
        recommendations = 'Mild depressive symptoms detected. Practice active mindfulness and time management techniques.';
      } else if (totalScore <= 14) {
        severity = 'Moderate Depression';
        recommendations = 'Moderate symptoms present. Booking a counseling consultation with CGCS is encouraged.';
      } else if (totalScore <= 19) {
        severity = 'Moderately Severe Depression';
        recommendations = 'Noticeable clinical distress. Active guidance session recommended immediately.';
        crisisFlag = 1;
      } else {
        severity = 'Severe Depression';
        recommendations = 'High distress levels. Immediate guidance intervention prioritized by CGCS counselors.';
        crisisFlag = 1;
      }
      if (answers[8] && parseInt(answers[8], 10) > 0) {
        crisisFlag = 1;
      }
    } else if (assessmentType === 'GAD-7') {
      if (totalScore <= 4) {
        severity = 'Minimal Anxiety';
        recommendations = 'Low anxiety levels. Continue practicing self-care and relaxation.';
      } else if (totalScore <= 9) {
        severity = 'Mild Anxiety';
        recommendations = 'Mild tension observed. Use HeronCare AI grounding exercises when feeling overwhelmed.';
      } else if (totalScore <= 14) {
        severity = 'Moderate Anxiety';
        recommendations = 'Moderate anxiety detected. Scheduling a 1-on-1 session with CGCS is recommended.';
      } else {
        severity = 'Severe Anxiety';
        recommendations = 'High anxiety index. Please schedule an appointment or contact CGCS duty counselor.';
        crisisFlag = 1;
      }
    }

    const asmId = `ASM-${assessmentType.replace('-', '')}-${Date.now()}`;
    const createdAt = new Date().toISOString();

    // 1. Insert Initial Assessment Record
    await db.runAsync(`
      INSERT INTO assessments (
        id, student_id, student_name, student_email, college, assessment_type, score, severity, answers_json, recommendations, crisis_flag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      asmId,
      req.user.studentId || req.user.id || 'K120-UNKWN',
      req.user.name,
      req.user.email,
      req.user.college || 'CCIS',
      assessmentType,
      totalScore,
      severity,
      encryptData(JSON.stringify(answers)),
      encryptData(recommendations),
      crisisFlag,
      createdAt
    ]);

    // 2. Encrypt Sensitive Medical / Medication Records (AES-256-GCM)
    const encMedical = encryptData(medicalConditions ? medicalConditions.trim() : '');
    const encCurrentMed = encryptData(currentMedications ? currentMedications.trim() : '');
    const encPrevMed = encryptData(previousMedications ? previousMedications.trim() : '');
    const intakeCompletedAt = new Date().toISOString();

    await db.runAsync(`
      UPDATE users 
      SET has_completed_intake = 1,
          has_existing_illness = ?,
          medical_conditions_enc = ?,
          current_medications_enc = ?,
          previous_medications_enc = ?,
          intake_completed_at = ?
      WHERE id = ?
    `, [
      hasIllnessVal,
      encMedical,
      encCurrentMed,
      encPrevMed,
      intakeCompletedAt,
      req.user.id
    ]);

    // 3. Dispatch Crisis Alerts if High Severity
    if (crisisFlag) {
      const nonDiagSev = totalScore >= 15 ? 'High Concern' : (totalScore >= 10 ? 'Moderate Concern' : 'Mild Concern');
      createNotification({
        targetRole: 'counselor',
        title: 'Priority Alert: Elevated Concern Score Detected',
        message: `Student ${req.user.name} (${req.user.college || 'CCIS'}) scored ${totalScore} on initial intake ${assessmentType} (${nonDiagSev}). Supportive outreach recommended.`,
        type: 'warning'
      });

      createNotification({
        targetRole: 'director',
        title: 'Directorate Alert: Elevated Intake Concern Detected',
        message: `Elevated concern score detected during intake for student ${req.user.name} (${req.user.college || 'CCIS'}) on ${assessmentType} (${nonDiagSev}).`,
        type: 'warning'
      });
    }

    // 4. DPA Compliance Audit Log
    await logDpaEvent(req, 'STUDENT_INTAKE_AND_MEDICAL_HISTORY_FILED', `Student ${req.user.name} completed initial intake screening (${assessmentType}) and filed encrypted medical/medication disclosures.`);

    const updatedUserRaw = await db.getAsync('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const updatedUser = buildUserResponse(updatedUserRaw);

    res.status(200).json({
      success: true,
      message: 'Initial screening and health disclosures filed successfully. You may now book a counseling session.',
      user: updatedUser,
      data: {
        assessmentId: asmId,
        assessmentType,
        score: totalScore,
        severity,
        recommendations,
        crisisFlag: Boolean(crisisFlag)
      }
    });
  } catch (err) {
    console.error('Error processing student intake:', err);
    res.status(500).json({ success: false, message: 'Server error processing intake submission.' });
  }
});

// GET /api/counselor/students/:id/health-intake - Decrypted Health Summary for Counselors & Director (Silo Guarded)
app.get('/api/counselor/students/:id/health-intake', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const student = await db.getAsync(`
      SELECT id, name, student_id, email, college, program, year_level, 
             has_completed_intake, has_existing_illness, 
             medical_conditions_enc, current_medications_enc, previous_medications_enc, 
             intake_completed_at
      FROM users 
      WHERE (id = ? OR student_id = ?) AND LOWER(role) = "student"
    `, [id, id]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    const access = await checkClinicalAccess(req.user, student);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        requiresDelegation: true,
        message: access.message,
        studentId: student.id,
        studentNumericId: student.student_id,
        studentName: student.name,
        targetCounselorId: access.targetCounselorId,
        targetCounselorName: access.targetCounselorName
      });
    }

    await logDpaEvent(req, 'DPA_RECORD_ACCESS', `Counselor ${req.user.name} accessed decrypted clinical health intake for student ${student.name} (${student.id})${access.isDelegatedReadOnly ? ' [DELEGATED_READ_ONLY]' : ''}`);

    const healthSummary = {
      studentId: student.student_id || student.id,
      studentName: student.name,
      college: student.college,
      hasCompletedIntake: Boolean(student.has_completed_intake),
      hasExistingIllness: Boolean(student.has_existing_illness),
      medicalConditions: decryptData(student.medical_conditions_enc) || 'None reported',
      currentMedications: decryptData(student.current_medications_enc) || 'None reported',
      previousMedications: decryptData(student.previous_medications_enc) || 'None reported',
      intakeCompletedAt: student.intake_completed_at
    };

    res.json({
      success: true,
      isDelegatedReadOnly: Boolean(access.isDelegatedReadOnly),
      expiresAt: access.expiresAt || null,
      data: healthSummary
    });
  } catch (err) {
    console.error('Error fetching student health intake:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve student health disclosure.' });
  }
});

// ----------------------------------------------------
// 7. REAL-TIME CRISIS & TRIAGE ALERTS
// ----------------------------------------------------

app.get('/api/crisis-alerts', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), async (req, res) => {
  try {
    const rawAssessments = await db.allAsync(`
      SELECT a.id, 
             COALESCE(u.id, a.student_id) AS user_id, 
             a.assessment_type, 
             a.score, 
             a.severity, 
             a.crisis_flag, 
             a.recommendations, 
             a.created_at,
             COALESCE(a.outreach_sent, 0) AS outreach_sent,
             COALESCE(u.name, a.student_name) AS student_name, 
             COALESCE(u.student_id, a.student_id) AS student_id, 
             COALESCE(u.college, a.college) AS college, 
             COALESCE(u.email, a.student_email) AS email
      FROM assessments a
      LEFT JOIN users u ON (a.student_id = u.id OR a.student_id = u.student_id OR a.student_email = u.email)
      ORDER BY a.created_at DESC
      LIMIT 50
    `);

    const flaggedAssessments = (rawAssessments || []).map(a => ({
      ...a,
      recommendations: decryptData(a.recommendations) || a.recommendations || ''
    }));

    const crisisNotifications = await db.allAsync(`
      SELECT * FROM notifications 
      WHERE type IN ('warning', 'CRISIS_ALERT', 'AI_CRISIS_TRIGGER') OR target_role IN ('counselor', 'director', 'superadmin', 'admin')
      ORDER BY created_at DESC LIMIT 50
    `);

    res.json({
      success: true,
      data: {
        flaggedAssessments: flaggedAssessments || [],
        crisisNotifications: crisisNotifications || []
      }
    });
  } catch (err) {
    console.error('Error in /api/crisis-alerts:', err);
    res.status(500).json({ success: false, message: 'Error retrieving crisis alerts.' });
  }
});

// Outreach action: Counselor check-in from crisis/screening alert
app.post('/api/counselor/reach-out', requireAuth, requireRole(['counselor', 'director', 'superadmin']), (req, res) => {
  const { studentId, studentName, assessmentType, assessmentId } = req.body;
  const counselorName = req.user.name;

  if (!studentId) {
    return res.status(400).json({ success: false, message: "Student identifier required." });
  }

  // Resolve recipient's user row
  db.get("SELECT id, name, email FROM users WHERE id = ? OR student_id = ?", [studentId, studentId], (err, student) => {
    if (err || !student) {
      return res.status(404).json({ success: false, message: "Student account not found." });
    }

    const testName = (assessmentType || '').toUpperCase() === 'PHQ-9'
      ? 'PHQ-9'
      : (assessmentType || '').toUpperCase() === 'GAD-7'
        ? 'GAD-7'
        : (assessmentType || 'Mental Health');

    const title = `Supportive Check-in: Follow-up on your recent ${testName}`;
    const message = `Kumusta, ${student.name}! Guidance Counselor ${counselorName} has reviewed the responses from the ${testName} you recently completed. Please remember that you don't have to carry your burdens alone—we're here to listen and help. Would you like to talk? Click below to book an appointment with our counseling team whenever you're ready.`;

    const createdAt = new Date().toISOString();
    db.run(
      `INSERT INTO notifications (user_id, title, message, type, link, is_read, created_at)
       VALUES (?, ?, ?, 'appointment_followup', '#student-booking', 0, ?)`,
      [student.id, title, message, createdAt],
      function(notifErr) {
        if (notifErr) {
          console.error("Error inserting notification:", notifErr);
          return res.status(500).json({ success: false, message: "Database error dispatching notification." });
        }

        // Mark outreach_sent = 1 on assessments
        if (assessmentId) {
          db.run("UPDATE assessments SET outreach_sent = 1 WHERE id = ?", [assessmentId]);
        } else {
          // Fallback: update latest assessment for this user & type
          db.run(
            "UPDATE assessments SET outreach_sent = 1 WHERE id = (SELECT id FROM assessments WHERE (student_id = ? OR student_id = ? OR student_email = ?) AND assessment_type = ? ORDER BY created_at DESC LIMIT 1)",
            [student.id, student.student_id || student.id, student.email, assessmentType]
          );
        }

        if (typeof logDpaEvent === 'function') {
          logDpaEvent(req, 'DPA_PHI_ACCESS', `Counselor ${counselorName} reached out to ${student.name} regarding completed ${assessmentType}`);
        }

        res.json({ 
          success: true, 
          message: `Supportive notification for ${assessmentType} sent to ${student.name}!`,
          assessmentId: assessmentId || null,
          outreach_sent: 1
        });
      }
    );
  });
});

// ----------------------------------------------------
// 8. EMPATHETIC "KUMUSTAHAN" AI CHATBOT & LIVE ESCALATION
// ----------------------------------------------------

app.post('/api/chatbot/message', optionalAuth, async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message content is required.' });
  }

  const rawText = message.trim();
  const lowerText = rawText.toLowerCase();
  const studentName = req.user?.name || 'Heron Student';

  // ========================================================
  // 1. DETERMINISTIC CRISIS SENTRY (SAFETY NET - DO NOT REMOVE)
  // ========================================================
  const crisisTriggers = [
    'suicide', 'kill myself', 'end my life', 'want to die', 'harm myself',
    'hurt myself', 'cut myself', 'no reason to live', 'hopeless', 'self harm',
    'hang myself', 'end it all', 'ayoko na mabuhay', 'gusto ko na mamatay'
  ];

  if (crisisTriggers.some(t => lowerText.includes(t))) {
    if (req.user) {
      createNotification({
        targetRole: 'counselor',
        title: '🚨 High-Distress Crisis Alert',
        message: `Student ${req.user.name} expressed severe distress in HeronCare chat.`,
        type: 'warning'
      });
    }

    return res.json({
      success: true,
      isCrisis: true,
      suggestCounselor: true,
      reply: `Nandito ako para sa'yo, ${studentName}. Ramdam ko ang matinding bigat ng pinagdadaanan mo, at hindi ka nag-iisa. Mahalaga ang buhay mo rito sa University of Makati.\n\n🚨 **National Center for Mental Health Hotline:** 1553\n🏥 **UMak CGCS Guidance Office:** Admin Bldg Room 304\n\nGusto mo bang ikonekta kita agad sa ating on-duty Guidance Counselor?`
    });
  }

  // ========================================================
  // 2. ESCALATION TO HUMAN COUNSELOR TRIGGER
  // ========================================================
  const escalationPhrases = ['talk to a human', 'human', 'counselor', 'guidance', 'gusto ko ng kausap', 'real person'];
  if (escalationPhrases.some(p => lowerText.includes(p))) {
    return res.json({
      success: true,
      isCrisis: false,
      suggestCounselor: true,
      reply: `Naiintindihan kita, ${studentName}. Minsan mas magaan kapag may totoong tao tayong nakakausap. Nandito ang ating mga Registered Guidance Counselors. Pindutin lamang ang "Talk to a Real Counselor" sa ibaba para maikonekta kita agad.`
    });
  }

  // ========================================================
  // 3. EMPATHETIC AI CONTROLLER INVOCATION
  // ========================================================
  const reply = await generateHeronResponse({
    message: rawText,
    history: history || [],
    studentName
  });

  return res.json({
    success: true,
    isCrisis: false,
    suggestCounselor: false,
    reply
  });
});

// ----------------------------------------------------
// 9. LIVE COUNSELOR ESCALATION & CHAT DESK ENDPOINTS
// ----------------------------------------------------

// POST /api/counselor/live-chat-request - Student Requests Live Counselor
app.post('/api/counselor/live-chat-request', authenticateJWT, async (req, res) => {
  const { recentSummary, chatTranscript, reason } = req.body;
  const studentId = req.user.studentId || req.user.id;
  const studentName = req.user.name;
  const studentEmail = req.user.email;
  const college = req.user.college || 'CCIS';
  const requestId = `CHAT-REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const summary = recentSummary || reason || 'Student requested live guidance counseling consultation via HeronCare Kumustahan chatbot.';

  try {
    // Check if student already has a pending or active request
    const existing = await db.getAsync(`
      SELECT * FROM live_chat_requests 
      WHERE (student_id = ? OR student_email = ?) AND status IN ('Pending', 'Active')
    `, [studentId, studentEmail]);

    if (existing) {
      return res.json({
        success: true,
        message: 'Connecting you to an available UMak Guidance Counselor...',
        data: existing
      });
    }

    await db.runAsync(`
      INSERT INTO live_chat_requests (
        id, student_id, student_name, student_email, college, status, initial_summary, chat_transcript
      ) VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)
    `, [
      requestId,
      studentId,
      studentName,
      studentEmail,
      college,
      summary,
      chatTranscript ? (typeof chatTranscript === 'string' ? chatTranscript : JSON.stringify(chatTranscript)) : '[]'
    ]);

    // High-priority notification dispatched to counselors
    createNotification({
      targetRole: 'counselor',
      title: '🔴 Live Student Chat Request',
      message: `Incoming Live Consultation: ${studentName} (${college}) requested immediate counselor chat. Summary: ${summary.slice(0, 100)}...`,
      type: 'warning'
    });

    await logActivity(studentName, req.user.role, 'LIVE_CHAT_REQUESTED', `Requested live counselor escalation: ${requestId}`, req.ip);

    res.status(201).json({
      success: true,
      message: 'Connecting you to an available UMak Guidance Counselor...',
      data: {
        id: requestId,
        studentId,
        studentName,
        studentEmail,
        college,
        status: 'Pending',
        summary
      }
    });
  } catch (err) {
    console.error('Error creating live chat request:', err);
    res.status(500).json({ success: false, message: 'Failed to dispatch live chat request.' });
  }
});

// GET /api/counselor/live-chat-requests - Fetch Live Chat Requests for Student or Counselor
app.get('/api/counselor/live-chat-requests', authenticateJWT, async (req, res) => {
  try {
    const isStudent = req.user.role === 'student';
    let sql = 'SELECT * FROM live_chat_requests WHERE 1=1';
    const params = [];

    if (isStudent) {
      sql += ' AND (student_id = ? OR student_email = ?) AND status IN ("Pending", "Active")';
      params.push(req.user.studentId || req.user.id, req.user.email);
    } else {
      // FOR COUNSELORS: Only show Pending (unclaimed) OR Active sessions belonging to THIS counselor.
      // Sessions accepted by other counselors are strictly filtered out so they disappear from this counselor's desk!
      sql += ' AND (status = "Pending" OR (status = "Active" AND counselor_id = ?)) ORDER BY created_at DESC';
      params.push(req.user.id);
    }

    const rows = await db.allAsync(sql, params);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve live chat requests.' });
  }
});

// POST /api/counselor/live-chat-accept - Counselor Accepts Live Chat
app.post('/api/counselor/live-chat-accept', authenticateJWT, requireRole('counselor', 'superadmin', 'admin'), async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ success: false, message: 'Request ID is required.' });

  const counselorId = req.user.id;
  const counselorName = req.user.name;

  try {
    const reqRecord = await db.getAsync('SELECT * FROM live_chat_requests WHERE id = ?', [requestId]);
    if (!reqRecord) return res.status(404).json({ success: false, message: 'Live chat request not found.' });

    // 1. Check if another counselor already claimed this session
    if (reqRecord.status === 'Active') {
      if (reqRecord.counselor_id === counselorId) {
        // Same counselor re-entering their own active session
        return res.json({
          success: true,
          message: `Re-entering consultation with ${reqRecord.student_name}.`,
          data: reqRecord
        });
      } else {
        // Another counselor was faster
        return res.status(409).json({
          success: false,
          alreadyClaimed: true,
          message: `Na-accept na ito ni ${reqRecord.counselor_name || 'ibang counselor'}. Sila na po ang naka-assign sa estudyante.`
        });
      }
    }

    if (reqRecord.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Tapos na ang konsultasyong ito.' });
    }

    // 2. Atomic lock update
    await db.runAsync(`
      UPDATE live_chat_requests 
      SET status = 'Active', counselor_id = ?, counselor_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'Pending'
    `, [counselorId, counselorName, requestId]);

    // Initial greeting from counselor
    const msgId = `MSG-${Date.now()}`;
    const initialGreeting = `Kumusta ${reqRecord.student_name}! Ako si ${counselorName} mula sa UMak Center for Guidance and Counseling Services. Nabasa ko ang iyong mensahe at nandito ako ngayon para makinig at umalalay sa'yo. Paano kita matutulungan?`;

    await db.runAsync(`
      INSERT INTO live_chat_messages (id, session_id, sender_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, 'counselor', ?)
    `, [msgId, requestId, counselorId, counselorName, initialGreeting]);

    // Notify student
    const studentUser = await db.getAsync('SELECT id FROM users WHERE id = ? OR student_id = ?', [reqRecord.student_id, reqRecord.student_id]);
    createNotification({
      userId: studentUser ? studentUser.id : reqRecord.student_id,
      title: '💬 Counselor Connected!',
      message: `${counselorName} has joined your live counseling session.`,
      type: 'info'
    });

    await logActivity(counselorName, req.user.role, 'LIVE_CHAT_ACCEPTED', `Accepted live chat session ${requestId} for ${reqRecord.student_name}`, req.ip);

    res.json({
      success: true,
      message: `Connected with ${reqRecord.student_name}.`,
      data: {
        id: requestId,
        status: 'Active',
        studentName: reqRecord.student_name,
        studentId: reqRecord.student_id,
        counselorName,
        college: reqRecord.college,
        initialGreeting
      }
    });
  } catch (err) {
    console.error('Error accepting live chat:', err);
    res.status(500).json({ success: false, message: 'Failed to accept live chat request.' });
  }
});

// In-Memory Live Typing State (sessionId -> { student: timestamp, counselor: timestamp })
const liveChatTypingState = {};

// POST /api/counselor/live-chat/:id/typing - Notify peer of typing activity
app.post('/api/counselor/live-chat/:id/typing', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const role = req.user.role === 'student' ? 'student' : 'counselor';
  if (!liveChatTypingState[id]) liveChatTypingState[id] = {};
  liveChatTypingState[id][role] = Date.now();
  res.json({ success: true });
});

// GET /api/counselor/live-chat/:id/messages - Get Live Chat Transcript
app.get('/api/counselor/live-chat/:id/messages', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const session = await db.getAsync('SELECT * FROM live_chat_requests WHERE id = ?', [id]);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    // Fetch and attach student's profile picture
    const studentUser = await db.getAsync(
      'SELECT avatar, avatar_url FROM users WHERE id = ? OR student_id = ?',
      [session.student_id, session.student_id]
    );
    session.student_avatar = studentUser ? (studentUser.avatar || studentUser.avatar_url) : null;

    const messages = await db.allAsync(`
      SELECT * FROM live_chat_messages WHERE session_id = ? ORDER BY created_at ASC
    `, [id]);

    const typing = liveChatTypingState[id] || {};
    const now = Date.now();
    const isStudentTyping = (now - (typing.student || 0)) < 4500;
    const isCounselorTyping = (now - (typing.counselor || 0)) < 4500;
    const isPeerTyping = req.user.role === 'student' ? isCounselorTyping : isStudentTyping;

    res.json({
      success: true,
      session,
      messages,
      isPeerTyping
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving live chat messages.' });
  }
});

// POST /api/counselor/live-chat/:id/ai-summary - Generate Dynamic Clinical Summary
app.post('/api/counselor/live-chat/:id/ai-summary', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const session = await db.getAsync('SELECT * FROM live_chat_requests WHERE id = ?', [id]);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const messages = await db.allAsync('SELECT * FROM live_chat_messages WHERE session_id = ? ORDER BY created_at ASC', [id]);
    const summary = await generateLiveChatClinicalSummary({
      messages,
      studentName: session.student_name,
      college: session.college
    });

    await db.runAsync('UPDATE live_chat_requests SET initial_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [summary, id]);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate AI summary.' });
  }
});

// POST /api/counselor/live-chat/:id/messages - Send Live Message
app.post('/api/counselor/live-chat/:id/messages', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message content cannot be empty.' });
  }

  try {
    const session = await db.getAsync('SELECT * FROM live_chat_requests WHERE id = ?', [id]);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const msgId = `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const senderRole = req.user.role === 'student' ? 'student' : 'counselor';

    await db.runAsync(`
      INSERT INTO live_chat_messages (id, session_id, sender_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [msgId, id, req.user.id, req.user.name, senderRole, message.trim()]);

    await db.runAsync('UPDATE live_chat_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    res.status(201).json({
      success: true,
      message: 'Message sent.',
      data: {
        id: msgId,
        sessionId: id,
        senderName: req.user.name,
        senderRole,
        message: message.trim(),
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

// POST /api/counselor/live-chat/:id/end - Conclude Live Chat
app.post('/api/counselor/live-chat/:id/end', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    await db.runAsync('UPDATE live_chat_requests SET status = "Completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    await logActivity(req.user.name, req.user.role, 'LIVE_CHAT_CONCLUDED', `Concluded live chat session ${id}`, req.ip);
    res.json({ success: true, message: 'Live counseling chat session concluded.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error ending live chat session.' });
  }
});

// ----------------------------------------------------
// 10. REAL-TIME NOTIFICATION CENTER
// ----------------------------------------------------

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const studentId = req.user.studentId ? String(req.user.studentId) : null;
    const rows = await db.allAsync(`
      SELECT id, user_id, sender_id, sender_name, title, message, type, action_link, reference_id, is_read, created_at
      FROM notifications
      WHERE user_id = ? OR (user_id = ? AND ? IS NOT NULL)
      ORDER BY id DESC
      LIMIT 40
    `, [userId, studentId || userId, studentId]);
    return res.json({ success: true, notifications: rows, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, notifications: [], data: [] });
  }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const studentId = req.user.studentId ? String(req.user.studentId) : null;
    await db.runAsync(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE id = ? AND (user_id = ? OR (user_id = ? AND ? IS NOT NULL))
    `, [req.params.id, userId, studentId || userId, studentId]);
    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const studentId = req.user.studentId ? String(req.user.studentId) : null;
    await db.runAsync(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE user_id = ? OR (user_id = ? AND ? IS NOT NULL)
    `, [userId, studentId || userId, studentId]);
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 10. SUPER ADMIN (CGCS HEAD) GOVERNANCE & USER DIRECTORY
// ----------------------------------------------------

// Workload & Schedules
const handleGetCounselorWorkload = async (req, res) => {
  try {
    const counselors = await db.allAsync('SELECT id, name, email, department, status FROM users WHERE role = "counselor"');

    // Compute total appointments assigned per counselor
    const apptCounts = await db.allAsync('SELECT counselor_name, COUNT(*) as active_count FROM appointments WHERE status IN ("Pending", "Approved", "Confirmed") GROUP BY counselor_name');
    const countMap = {};
    apptCounts.forEach(c => countMap[c.counselor_name] = c.active_count);

    const calculatedWorkload = counselors.map(c => ({
      ...c,
      activeCases: countMap[c.name] || 0,
      assignedCluster: c.department || 'General Guidance'
    }));

    db.all(
      `SELECT cs.id, cs.counselor_id, cs.counselor_name, cs.day_of_week, cs.time_slot, cs.max_slots, cs.status 
       FROM counselor_schedules cs 
       ORDER BY cs.day_of_week, cs.time_slot`,
      [],
      (err, scheduleRows) => {
        if (err) return res.status(500).json({ success: false, message: 'Database query error.' });
        // Return in data.schedules so the frontend receives it
        res.json({
          success: true,
          data: {
            workload: calculatedWorkload || [],
            schedules: scheduleRows || []
          },
          workload: calculatedWorkload || [],
          schedules: scheduleRows || []
        });
      }
    );
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load workload data.' });
  }
};

app.get('/api/counselor/workload', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleGetCounselorWorkload);
app.get('/api/counselors/workload', authenticateJWT, requireRole('counselor', 'director', 'superadmin', 'admin'), handleGetCounselorWorkload);

app.post('/api/admin/schedules', authenticateJWT, requireRole('superadmin'), async (req, res) => {
  const { counselorId, counselorName, dayOfWeek, timeSlot, maxSlots } = req.body;
  if (!counselorName || !dayOfWeek || !timeSlot) {
    return res.status(400).json({ success: false, message: 'Counselor name, day, and time slot are required.' });
  }

  try {
    const schedId = `SCHED-${Date.now()}`;
    await db.runAsync(`
      INSERT INTO counselor_schedules (id, counselor_id, counselor_name, day_of_week, time_slot, max_slots, current_assigned, status)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'Available')
    `, [schedId, counselorId || 'USR-CNS', counselorName, dayOfWeek, timeSlot, maxSlots || 4]);

    await logDpaEvent(req, 'DPA_DUTY_ASSIGN', `Assigned duty schedule for counselor ${counselorName} on ${dayOfWeek} (${timeSlot})`);
    await logActivity(req.user.name, req.user.role, 'SCHEDULE_ASSIGNED', `Assigned ${dayOfWeek} slot (${timeSlot}) to ${counselorName}`, req.ip);

    res.status(201).json({ success: true, message: 'Counselor duty schedule saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to assign schedule.' });
  }
});

// Users Management - Returns Complete Directory
app.get('/api/admin/users', authenticateJWT, requireRole('director', 'superadmin', 'admin'), async (req, res) => {
  try {
    const rawUsers = await db.allAsync(`
      SELECT id, email, role, name, student_id, college, program, year_level, title, department, specialization, contact_number, emergency_contact_name, emergency_contact_phone, status, created_at, last_login 
      FROM users 
      ORDER BY created_at DESC
    `);

    const users = rawUsers.map(u => ({
      ...u,
      role: u.role === 'superadmin' ? 'director' : u.role,
      contact_number: decryptData(u.contact_number),
      emergency_contact_phone: decryptData(u.emergency_contact_phone),
      emergency_contact_name: decryptData(u.emergency_contact_name)
    }));

    // Also calculate active caseload for counselors
    const apptCounts = await db.allAsync('SELECT counselor_name, COUNT(*) as active_count FROM appointments WHERE status IN ("Pending", "Approved", "Confirmed") GROUP BY counselor_name');
    const countMap = {};
    apptCounts.forEach(c => countMap[c.counselor_name] = c.active_count);

    const counselors = users.filter(u => u.role === 'counselor' || u.role === 'admin').map(c => ({
      ...c,
      activeCases: countMap[c.name] || 0
    }));

    const students = users.filter(u => u.role === 'student');

    res.json({
      success: true,
      total: users.length,
      data: users,
      counselors,
      students
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve user accounts.' });
  }
});

app.post('/api/admin/users', authenticateJWT, requireRole('director', 'superadmin', 'admin'), async (req, res) => {
  const { email, password, role, name, studentId, college, program, title, department, specialization, contactNumber } = req.body;

  if (!email || !password || !role || !name) {
    return res.status(400).json({ success: false, message: 'Email, password, role, and name are required.' });
  }

  // 1. Name validation: letters, spaces, hyphens, periods, and commas only (NO numbers)
  const nameRegex = /^[a-zA-ZñÑ\s.,'-]+$/;
  if (!nameRegex.test(name.trim())) {
    return res.status(400).json({
      success: false,
      message: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited."
    });
  }

  // 2. Strict @umak.edu.ph institutional email restriction
  const emailRegex = /^[a-zA-Z0-9._%+-]+@umak\.edu\.ph$/i;
  if (!emailRegex.test(email.trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Registration restricted: You must use a valid official UMak email address (@umak.edu.ph). Public domains like @gmail.com are not permitted."
    });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.getAsync('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'A user with this email address already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newId = `USR-${role.toUpperCase().slice(0, 3)}-${Date.now()}`;

    const studentIdentifier = studentId || (role === 'student' ? cleanEmail.split('@')[0].toUpperCase() : null);
    const userCollege = college || department || null;
    const userTitle = role === 'student' ? null : (title ? title.trim() : null);
    const userSpec = role === 'counselor' ? (specialization || 'General Guidance & Counseling') : null;

    await db.runAsync(`
      INSERT INTO users (
        id, email, password_hash, role, name, student_id, college, program, 
        title, department, specialization, contact_number, 
        is_verified, status, failed_attempts, lock_until, has_completed_intake,
        verification_otp, otp_expires
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 
        ?, ?, ?, ?, 
        1, 'Active', 0, NULL, 1,
        NULL, NULL
      )
    `, [
      newId,
      cleanEmail,
      passwordHash,
      role,
      name.trim(),
      studentIdentifier,
      userCollege,
      program || null,
      userTitle,
      userCollege,
      userSpec,
      encryptData(contactNumber || null)
    ]);

    await logDpaEvent(req, 'DPA_USER_MUTATE', `Created target ${role} user account for ${name} (${cleanEmail})`);
    await logActivity(req.user.name, req.user.role, 'USER_CREATED', `Created new ${role} account for ${name} (${cleanEmail})`, req.ip);

    res.status(201).json({ success: true, message: `User account created successfully for ${name}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create user account.' });
  }
});

app.patch('/api/admin/users/:id', authenticateJWT, requireRole('director', 'superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { status, role, name, department, title, specialization } = req.body;

  try {
    const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name !== undefined && name !== null) {
      const nameRegex = /^[a-zA-ZñÑ\s.,'-]+$/;
      if (!nameRegex.test(String(name).trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid name: Names must only contain letters and standard punctuation (periods, commas, hyphens). Numbers are strictly prohibited."
        });
      }
    }

    await db.runAsync(`
      UPDATE users 
      SET status = COALESCE(?, status),
          role = COALESCE(?, role),
          name = COALESCE(?, name),
          department = COALESCE(?, department),
          title = COALESCE(?, title),
          specialization = COALESCE(?, specialization)
      WHERE id = ?
    `, [status, role, name, department, title, specialization, id]);

    await logDpaEvent(req, 'DPA_USER_MUTATE', `Updated target user ${user.name} (ID: ${id}) [Status: ${status || user.status}, Role: ${role || user.role}]`);
    await logActivity(req.user.name, req.user.role, 'USER_UPDATED', `Updated profile for user ${user.name} (${id})`, req.ip);

    res.json({ success: true, message: 'User profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// Director / Superadmin / Counselor User Status Moderation Action
const handleUserStatusUpdate = (req, res) => {
  const role = (req.user?.role || '').toLowerCase();
  const isCounselor = role === 'counselor';
  const isDirectorate = ['director', 'superadmin', 'admin'].includes(role) || ['director', 'superadmin'].includes(req.user?.role);

  if (!isDirectorate && !isCounselor) {
    return res.status(403).json({ success: false, message: "Unauthorized." });
  }

  const targetId = req.params.id;
  const { action } = req.body; // 'approve', 'decline', 'deactivate', 'activate', 'verify'

  // Guidance Counselors are permitted to verify student accounts, but cannot decline or delete accounts
  if (action === 'decline' || action === 'reject') {
    if (isCounselor) {
      return res.status(403).json({ 
        success: false, 
        message: "Guidance Counselors are not authorized to decline accounts. Only the Directorate may decline registrations." 
      });
    }

    db.get("SELECT id, name, role, email, student_id FROM users WHERE id = ? OR student_id = ?", [targetId, targetId], (lookupErr, user) => {
      if (lookupErr || !user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      const actualId = user.id;

      // Cascade cleanup of pending registration artifacts
      db.serialize(() => {
        db.run("DELETE FROM notifications WHERE user_id = ?", [actualId], (err) => {
          if (err) console.warn("Notifications deletion warning:", err.message);
        });
        db.run("DELETE FROM appointments WHERE student_id = ? OR student_id = ? OR email = ?", [actualId, user.student_id || actualId, user.email], (err) => {
          if (err) console.warn("Appointments deletion warning:", err.message);
        });
        db.run("DELETE FROM assessments WHERE student_id = ? OR student_id = ? OR student_email = ?", [actualId, user.student_id || actualId, user.email], (err) => {
          if (err) console.warn("Assessments deletion warning:", err.message);
        });
        db.run("DELETE FROM users WHERE id = ?", [actualId], function(delErr) {
          if (delErr) {
            return res.status(500).json({ success: false, message: "Failed to delete user record." });
          }

          if (typeof logDpaEvent === 'function') {
            logDpaEvent(req, 'DPA_USER_MUTATE', `Declined and permanently removed registration for ${user.name} (${user.email})`);
          }

          return res.json({
            success: true,
            deleted: true,
            message: `Account registration for ${user.name} was declined and permanently removed.`
          });
        });
      });
    });
    return;
  }

  let newStatus = 'Active';
  let isVerified = 1;

  if (action === 'approve' || action === 'verify') {
    newStatus = 'Active';
    isVerified = 1;
  } else if (action === 'deactivate') {
    newStatus = 'Inactive';
    isVerified = 0;
  } else if (action === 'activate') {
    newStatus = 'Active';
    isVerified = 1;
  }

  db.get("SELECT id, name, role, email FROM users WHERE id = ? OR student_id = ?", [targetId, targetId], (err, user) => {
    if (err || !user) return res.status(404).json({ success: false, message: "User not found." });

    db.run(
      `UPDATE users SET status = ?, is_verified = ? WHERE id = ?`,
      [newStatus, isVerified, user.id],
      function(updErr) {
        if (updErr) return res.status(500).json({ success: false, message: "Database error updating status." });

        if (typeof logDpaEvent === 'function') {
          logDpaEvent(req, 'DPA_USER_MUTATE', `${req.user?.name || req.user?.role || 'Staff'} changed status of ${user.role} ${user.name} to ${newStatus}`);
        }

        return res.json({
          success: true,
          message: `Account for ${user.name} is now ${newStatus}.`,
          status: newStatus,
          is_verified: isVerified
        });
      }
    );
  });
};

app.patch('/api/admin/users/:id/status', requireAuth, handleUserStatusUpdate);
app.put('/api/admin/users/:id/status', requireAuth, handleUserStatusUpdate);
app.patch('/api/users/:id/status', requireAuth, handleUserStatusUpdate);
app.put('/api/users/:id/status', requireAuth, handleUserStatusUpdate);

// DELETE /api/admin/users/:id - Authorized Director & Superadmin User Deletion (Counselors, Directors, Students)
app.delete('/api/admin/users/:id', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await db.getAsync('SELECT * FROM users WHERE id = ? OR student_id = ?', [id, id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }
    // Prevent accidental self-deletion
    if (String(user.id) === String(req.user.id) || String(user.email).toLowerCase() === String(req.user.email).toLowerCase()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Security Restriction: You cannot delete your own currently logged-in Director account.' 
      });
    }
    const roleLower = (user.role || '').toLowerCase();
    // Cascade cleanup by role
    if (roleLower === 'counselor' || roleLower === 'admin') {
      // Reassign or unbind counselor appointments and active chats
      await db.runAsync("UPDATE appointments SET counselor_id = NULL, counselor_name = 'Unassigned' WHERE counselor_id = ?", [user.id]);
      await db.runAsync("UPDATE faculty_referrals SET assigned_counselor_id = NULL, assigned_counselor_name = 'Unassigned', status = 'Received by CGCS' WHERE assigned_counselor_id = ?", [user.id]);
      await db.runAsync('DELETE FROM live_chat_requests WHERE counselor_id = ?', [user.id]);
      await db.runAsync('DELETE FROM delegated_access_requests WHERE requesting_counselor_id = ? OR assigned_counselor_id = ? OR target_counselor_id = ?', [user.id, user.id, user.id]);
    } else if (roleLower === 'student') {
      // Purge student records and clinical assessments
      await db.runAsync('DELETE FROM appointments WHERE student_id = ? OR student_id = ? OR email = ?', [user.student_id, user.id, user.email]);
      await db.runAsync('DELETE FROM soap_notes WHERE student_id = ? OR student_id = ?', [user.student_id, user.id]);
      await db.runAsync('DELETE FROM assessments WHERE student_id = ? OR student_id = ? OR student_email = ?', [user.student_id, user.id, user.email]);
      await db.runAsync('DELETE FROM mood_logs WHERE student_id = ? OR student_id = ? OR student_email = ?', [user.student_id, user.id, user.email]);
      await db.runAsync('DELETE FROM delegated_access_requests WHERE student_id = ? OR student_id = ?', [user.student_id, user.id]);
    }
    // Permanently remove the user row
    await db.runAsync('DELETE FROM users WHERE id = ?', [user.id]);
    await logDpaEvent(req, 'DPA_USER_MUTATE', `Director removed ${user.role} user account: ${user.name} (${user.email}, ID: ${user.id})`);
    await logActivity(req.user.name, req.user.role, 'USER_DELETED', `Deleted ${user.role} account ${user.name} (${user.email})`, req.ip);
    const formattedRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    res.json({ success: true, message: `${formattedRole} account for "${user.name}" has been permanently removed.` });
  } catch (err) {
    console.error('Error during administrative user deletion:', err);
    res.status(500).json({ success: false, message: 'Database error while removing user account.' });
  }
});

// DPA 2012 / RA 10173 Audit Trail
app.get('/api/admin/audit-logs', authenticateJWT, requireRole('superadmin', 'director', 'admin'), async (req, res) => {
  try {
    const logs = await db.allAsync('SELECT * FROM audit_logs ORDER BY datetime(timestamp) DESC LIMIT 50');
    res.json({ success: true, total: logs.length, data: sanitizeAuditLogsForZeroPii(logs) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
  }
});

// Explicit DPA compliance event logger from frontend
app.post('/api/audit/dpa', authenticateJWT, async (req, res) => {
  const { action, details } = req.body;
  if (!action || !details) {
    return res.status(400).json({ success: false, message: 'Action and details are required.' });
  }
  await logDpaEvent(req, action, details);
  res.json({ success: true, message: 'DPA compliance event logged successfully.' });
});

// ----------------------------------------------------
// ROLE-FILTERED LIVE ROSTER ENDPOINTS
// ----------------------------------------------------
app.get('/api/users/students', authenticateToken, requireCounselorOrAdmin, (req, res) => {
  const sql = `
    SELECT id, name, student_id, email, college, contact_number, status, is_verified, created_at 
    FROM users 
    WHERE LOWER(role) = 'student' 
    ORDER BY created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch student roster" });
    const students = (rows || []).map(s => ({
      ...s,
      contact_number: decryptData(s.contact_number)
    }));
    res.json({ success: true, students, count: students.length });
  });
});

app.get('/api/users/counselors', authenticateToken, requireCounselorOrAdmin, (req, res) => {
  const sql = `
    SELECT id, name, email, contact_number, status, created_at 
    FROM users 
    WHERE LOWER(role) = 'counselor' 
    ORDER BY created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch counselor roster" });
    const counselors = (rows || []).map(c => ({
      ...c,
      contact_number: decryptData(c.contact_number)
    }));
    res.json({ success: true, counselors, count: counselors.length });
  });
});

// ----------------------------------------------------
// DIRECTORY & USER MANAGEMENT ENDPOINTS
// ----------------------------------------------------
app.get('/api/users', (req, res) => {
  const { role, college, search } = req.query;
  let query = `
    SELECT id, name, student_id, email, college, contact_number, contact_number AS contact, role, is_verified, failed_attempts, created_at 
    FROM users 
    WHERE 1=1
  `;
  const params = [];

  if (role && role !== 'ALL') {
    query += " AND LOWER(role) = LOWER(?)";
    params.push(role);
  }

  if (college && college !== 'ALL') {
    query += " AND UPPER(college) = UPPER(?)";
    params.push(college);
  }

  if (search && search.trim() !== '') {
    query += " AND (LOWER(name) LIKE LOWER(?) OR LOWER(student_id) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))";
    const pattern = `%${search.trim()}%`;
    params.push(pattern, pattern, pattern);
  }

  query += " ORDER BY role ASC, name ASC";

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("[USERS API] Error:", err);
      return res.status(500).json({ error: "Failed to query accounts." });
    }
    const users = (rows || []).map(u => ({
      ...u,
      contact: decryptData(u.contact_number) || u.contact || u.contact_number || 'N/A'
    }));
    res.json({ users });
  });
});

// Helper: Student Profile & Historical Operations with DPA Privacy Guard
async function getStudentProfileWithPrivacyGuard(lookupId, reqUser) {
  const user = await db.getAsync(
    "SELECT * FROM users WHERE id = ? OR student_id = ?",
    [lookupId, lookupId]
  );
  if (!user) return null;

  const isStudent = (user.role || '').toLowerCase() === 'student';

  // 1. Historical Operational Dates (visible to all counselors & directors)
  const firstSignInDate = user.created_at || user.first_login_at || 'Not recorded';

  const firstSessionRow = await db.getAsync(`
    SELECT date, time_slot, created_at 
    FROM appointments 
    WHERE (student_id = ? OR student_id = ? OR email = ?) 
      AND status IN ('Completed', 'Concluded')
    ORDER BY date ASC, id ASC
    LIMIT 1
  `, [user.id, user.student_id, user.email]);

  const firstSessionDate = firstSessionRow 
    ? (firstSessionRow.date || firstSessionRow.created_at || 'No completed sessions yet')
    : 'No completed sessions yet';

  // 2. Clinical Data Silo Authorization Check
  const userRole = (reqUser?.role || '').toLowerCase();
  const isPrivileged = ['director', 'superadmin', 'admin'].includes(userRole);

  let isAssigned = false;
  let activeDelegation = null;
  let pendingReq = null;
  let targetCounselor = null;

  if (isStudent && userRole === 'counselor') {
    isAssigned = await db.getAsync(`
      SELECT id, counselor_id, counselor_name FROM appointments 
      WHERE (student_id = ? OR student_id = ? OR email = ?) 
        AND (counselor_id = ? OR counselor_name = ? OR LOWER(counselor_name) = LOWER(?)) 
        AND status NOT IN ('Declined', 'Cancelled')
      LIMIT 1
    `, [user.id, user.student_id, user.email, reqUser.id, reqUser.name, reqUser.name]);

    activeDelegation = await db.getAsync(`
      SELECT id, expires_at FROM delegated_access_requests 
      WHERE (student_id = ? OR student_id = ?) 
        AND requesting_counselor_id = ? 
        AND status = 'Approved' 
        AND datetime('now') <= datetime(expires_at)
      ORDER BY reviewed_at DESC LIMIT 1
    `, [user.id, user.student_id, reqUser.id]);

    pendingReq = await db.getAsync(`
      SELECT id, created_at FROM delegated_access_requests 
      WHERE (student_id = ? OR student_id = ?) 
        AND requesting_counselor_id = ? 
        AND status = 'Pending'
      ORDER BY created_at DESC LIMIT 1
    `, [user.id, user.student_id, reqUser.id]);

    targetCounselor = await db.getAsync(`
      SELECT counselor_id, counselor_name FROM appointments
      WHERE (student_id = ? OR student_id = ? OR email = ?)
        AND status NOT IN ('Declined', 'Cancelled')
      ORDER BY created_at DESC LIMIT 1
    `, [user.id, user.student_id, user.email]);
  }

  const assignedCounselorName = targetCounselor?.counselor_name || 'Assigned RGC';
  const targetCounselorId = targetCounselor?.counselor_id || 'USR-DIR-001';

  const canAccessClinicalRecords = Boolean(
    isPrivileged ||
    isAssigned ||
    activeDelegation
  );

  let phone = 'N/A';
  try {
    if (user.contact_number) {
      phone = decryptData(user.contact_number) || user.contact_number;
    } else if (user.contact) {
      phone = decryptData(user.contact) || user.contact;
    }
  } catch (e) {
    phone = user.contact_number || user.contact || 'N/A';
  }

  const profileUser = { ...user };
  delete profileUser.password_hash;
  delete profileUser.verification_otp;
  delete profileUser.reset_otp;
  delete profileUser.reset_token;

  // Always return actual values for contact_number, emergency_contact_person, and emergency_contact_number to all authenticated counselors
  profileUser.phone = phone || 'N/A';
  profileUser.contact_number = phone || 'N/A';
  profileUser.contact = phone || 'N/A';
  profileUser.emergency_contact_person = decryptData(user.emergency_contact_person) || user.emergency_contact_person || 'N/A';
  profileUser.emergency_contact_name = profileUser.emergency_contact_person;
  profileUser.emergency_contact_number = decryptData(user.emergency_contact_number) || user.emergency_contact_number || user.emergency_contact_phone || 'N/A';
  profileUser.emergency_contact_phone = profileUser.emergency_contact_number;

  if (!profileUser.status) {
    profileUser.status = profileUser.is_verified ? 'Active' : 'Pending';
  }

  // Assessments (protected under clinical clearance)
  let assessments = [];
  if (canAccessClinicalRecords) {
    assessments = await db.allAsync(
      `SELECT * FROM assessments WHERE user_id = ? OR student_id = ? OR student_email = ? ORDER BY created_at DESC`,
      [user.id, user.student_id, user.email]
    );
  }

  return {
    user: profileUser,
    student: profileUser,
    assessments,
    firstSignInDate,
    firstSessionDate,
    canAccessClinicalRecords,
    requiresDelegation: !canAccessClinicalRecords,
    isAssigned: !!isAssigned,
    isDelegatedReadOnly: !!activeDelegation,
    hasPendingRequest: !!pendingReq,
    assignedCounselorName,
    targetCounselorId
  };
}

// GET /api/users/:id - Fetch user profile with privacy guard
app.get('/api/users/:id', optionalAuth, async (req, res) => {
  try {
    const result = await getStudentProfileWithPrivacyGuard(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: "User not found" });

    if (req.user && typeof logDpaEvent === 'function') {
      logDpaEvent(req, 'DPA_PHI_ACCESS', `Accessed profile for ${result.user.name} (ID: ${result.user.student_id || result.user.id}) by ${req.user.name || 'Staff'}`);
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Users API] Error:', err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// GET /api/users/:id/full-profile - Comprehensive Clinical & Academic Profile for Counselor/Director
app.get('/api/users/:id/full-profile', optionalAuth, async (req, res) => {
  try {
    const result = await getStudentProfileWithPrivacyGuard(req.params.id, req.user);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    if (req.user && typeof logDpaEvent === 'function') {
      logDpaEvent(req, 'DPA_PHI_ACCESS', `${req.user.role || 'Staff'} ${req.user.name || 'Staff'} viewed profile of student ${result.user.name} (${result.user.student_id || result.user.id})`);
    }

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[FullProfile API] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/students/:id - Alias endpoint for student profile viewer
app.get('/api/students/:id', optionalAuth, async (req, res) => {
  try {
    const result = await getStudentProfileWithPrivacyGuard(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: "Student not found" });

    if (req.user && typeof logDpaEvent === 'function') {
      logDpaEvent(req, 'DPA_PHI_ACCESS', `Accessed student profile for ${result.user.name} (ID: ${result.user.student_id || result.user.id}) by ${req.user.name || 'Staff'}`);
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Students API] Error:', err);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

// GET /api/students/:id/clinical-monitoring-sheet & /api/counselor/clinical-monitoring/:id
app.get(['/api/students/:id/clinical-monitoring-sheet', '/api/counselor/clinical-monitoring/:id'], authenticateToken, async (req, res) => {
  const studentId = req.params.id;
  try {
    const student = await db.getAsync(`
      SELECT id, name, student_id, college, program, year_level, status, email, contact_number,
             medical_conditions_enc, current_medications_enc, previous_medications_enc, created_at 
      FROM users 
      WHERE (id = ? OR student_id = ?) AND LOWER(role) = 'student'
    `, [studentId, studentId]);

    if (!student) {
      return res.status(404).json({ success: false, message: "Student record not found." });
    }

    // Check clinical clearance
    const isAssigned = await db.getAsync(`
      SELECT id FROM appointments 
      WHERE (student_id = ? OR student_id = ?) 
        AND (counselor_id = ? OR LOWER(counselor_name) = LOWER(?)) 
        AND status NOT IN ('Declined', 'Cancelled') 
      LIMIT 1
    `, [student.id, student.student_id, req.user.id, req.user.name]);

    const activeDelegation = await db.getAsync(`
      SELECT id FROM delegated_access_requests 
      WHERE (student_id = ? OR student_id = ?) 
        AND requesting_counselor_id = ? 
        AND status = 'Approved' 
        AND datetime('now') <= datetime(expires_at) 
      LIMIT 1
    `, [student.id, student.student_id, req.user.id]);

    const isDirector = ['director', 'superadmin', 'admin'].includes((req.user.role || '').toLowerCase());
    const canAccessClinicalRecords = Boolean(isDirector || isAssigned || activeDelegation);

    if (!canAccessClinicalRecords) {
      return res.status(403).json({ success: false, message: "Unauthorized: Clinical records clearance required." });
    }

    // Health intake disclosures
    let healthRow = null;
    try {
      healthRow = await db.getAsync(`
        SELECT diagnosed_conditions, current_medications, psychiatric_history 
        FROM health_intake 
        WHERE (student_id = ? OR student_id = ?) 
        LIMIT 1
      `, [student.id, student.student_id]);
    } catch (e) {}

    if (!healthRow || (!healthRow.diagnosed_conditions && !healthRow.current_medications && !healthRow.psychiatric_history)) {
      healthRow = {
        diagnosed_conditions: decryptData(student.medical_conditions_enc) || 'None reported',
        current_medications: decryptData(student.current_medications_enc) || 'None reported',
        psychiatric_history: decryptData(student.previous_medications_enc) || 'None reported'
      };
    }

    // Appointments & Decrypted SOAPs
    const appointments = await db.allAsync(`
      SELECT 
        a.id AS appointment_id,
        a.date AS session_date,
        a.time_slot,
        a.counseling_type AS focus,
        a.counselor_name,
        a.status,
        s.subjective,
        s.objective,
        s.assessment,
        s.plan,
        s.updated_at AS soap_filed_at
      FROM appointments a
      LEFT JOIN soap_notes s ON (s.appointment_id = a.id OR (s.student_id = a.student_id AND s.appointment_id IS NULL))
      WHERE (a.student_id = ? OR a.student_id = ? OR a.email = ?) 
        AND a.status IN ('Completed', 'Concluded', 'Ongoing', 'Approved')
      ORDER BY a.date ASC, a.id ASC
    `, [student.id, student.student_id, student.email]);

    const decryptedSessions = (appointments || []).map(a => ({
      ...a,
      subjective: decryptData(a.subjective) || a.subjective || '---',
      objective: decryptData(a.objective) || a.objective || '---',
      assessment: decryptData(a.assessment) || a.assessment || '---',
      plan: decryptData(a.plan) || a.plan || '---'
    }));

    const firstSession = decryptedSessions.find(a => ['Completed', 'Concluded'].includes(a.status));

    // Log DPA audit event
    if (typeof logDpaEvent === 'function') {
      logDpaEvent(req, 'CLINICAL_MONITORING_SHEET_ACCESSED', `Viewed clinical monitoring sheet for student ${student.name} (${student.student_id || student.id}) by ${req.user.name}`);
    }

    let phone = 'N/A';
    try {
      phone = decryptData(student.contact_number) || student.contact_number || 'N/A';
    } catch(e) {
      phone = student.contact_number || 'N/A';
    }

    return res.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        student_id: student.student_id || student.id,
        college: student.college || '---',
        program: student.program || '---',
        year_level: student.year_level || '1st Year',
        status: student.status || 'Active',
        email: student.email || '---',
        contact_number: phone,
        created_at: student.created_at
      },
      healthData: healthRow,
      firstSessionDate: firstSession ? firstSession.session_date : 'No concluded sessions yet',
      sessions: decryptedSessions
    });
  } catch (err) {
    console.error('Error retrieving clinical monitoring sheet:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve clinical monitoring sheet.' });
  }
});

// ----------------------------------------------------
// STRICT LIVE DIRECTOR ANALYTICS ENDPOINTS
// ----------------------------------------------------
app.get('/api/analytics/director', authenticateToken, requireDirector, (req, res) => {
  const queries = {
    // User counts
    userStats: `
      SELECT 
        COUNT(CASE WHEN LOWER(role) = 'student' THEN 1 END) AS total_students,
        COUNT(CASE WHEN LOWER(role) = 'student' AND is_verified = 1 THEN 1 END) AS verified_students,
        COUNT(CASE WHEN LOWER(role) = 'student' AND is_verified = 0 THEN 1 END) AS unverified_students,
        COUNT(CASE WHEN LOWER(role) = 'counselor' THEN 1 END) AS total_counselors,
        COUNT(CASE WHEN LOWER(role) IN ('director', 'superadmin') THEN 1 END) AS total_directors
      FROM users
    `,
    // Students grouped strictly by registered college
    studentsByCollege: `
      SELECT 
        COALESCE(college, 'Unspecified') AS college, 
        COUNT(*) AS count 
      FROM users 
      WHERE LOWER(role) = 'student' 
      GROUP BY college
    `,
    // Appointment / Case metrics (if appointments/cases table exists)
    appointmentStats: `
      SELECT 
        COUNT(*) AS total_appointments,
        COUNT(CASE WHEN LOWER(status) = 'completed' THEN 1 END) AS completed_sessions,
        COUNT(CASE WHEN LOWER(status) = 'pending' THEN 1 END) AS pending_sessions,
        COUNT(CASE WHEN LOWER(status) = 'cancelled' THEN 1 END) AS cancelled_sessions
      FROM appointments
    `,
    // Student status distribution (Active, Under Counseling, Completed, Flagged)
    studentStatusBreakdown: `
      SELECT 
        COALESCE(status, 'Active') AS status, 
        COUNT(*) AS count 
      FROM users 
      WHERE LOWER(role) = 'student' 
      GROUP BY status
    `
  };

  db.get(queries.userStats, [], (err, userStats) => {
    if (err) return res.status(500).json({ error: "Failed to load user analytics" });
    
    db.all(queries.studentsByCollege, [], (err2, byCollege) => {
      if (err2) return res.status(500).json({ error: "Failed to load college analytics" });
      
      db.all(queries.studentStatusBreakdown, [], (err3, byStatus) => {
        if (err3) return res.status(500).json({ error: "Failed to load status analytics" });

        // Check if appointments table exists before querying
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'", (tblErr, table) => {
          if (!table) {
            return res.json({
              success: true,
              userStats: userStats || { total_students: 0, verified_students: 0, unverified_students: 0, total_counselors: 0, total_directors: 0 },
              studentsByCollege: byCollege || [],
              studentStatusBreakdown: byStatus || [],
              appointmentStats: { total_appointments: 0, completed_sessions: 0, pending_sessions: 0, cancelled_sessions: 0 },
              phqCounts: {},
              typeCounts: {}
            });
          }

          db.get(queries.appointmentStats, [], (err4, aptStats) => {
            const finalAptStats = aptStats || { total_appointments: 0, completed_sessions: 0, pending_sessions: 0, cancelled_sessions: 0 };

            // Query dynamic PHQ & Counseling Type distributions from SQLite (Zero Mocks)
            db.all("SELECT severity, COUNT(*) as count FROM assessments WHERE assessment_type = 'PHQ-9' GROUP BY severity", [], (errPhq, phqRows) => {
              const phqCounts = {};
              (phqRows || []).forEach(r => { phqCounts[r.severity] = r.count; });

              db.all("SELECT counseling_type, COUNT(*) as count FROM appointments GROUP BY counseling_type", [], (errType, typeRows) => {
                const typeCounts = {};
                (typeRows || []).forEach(r => { typeCounts[r.counseling_type] = r.count; });

                return res.json({
                  success: true,
                  userStats: userStats || { total_students: 0, verified_students: 0, unverified_students: 0, total_counselors: 0, total_directors: 0 },
                  studentsByCollege: byCollege || [],
                  studentStatusBreakdown: byStatus || [],
                  appointmentStats: finalAptStats,
                  phqCounts,
                  typeCounts
                });
              });
            });
          });
        });
      });
    });
  });
});

// Anonymized Executive Analytics (Zero Mock/Hallucinated Data)
app.get('/api/admin/analytics', authenticateJWT, requireRole('counselor', 'director', 'superadmin'), async (req, res) => {
  try {
    const totalAppts = await db.getAsync('SELECT COUNT(*) as count FROM appointments');
    const totalAssessments = await db.getAsync('SELECT COUNT(*) as count FROM assessments');
    const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM users');
    const totalStudents = await db.getAsync('SELECT COUNT(*) as count FROM users WHERE LOWER(role) = "student"');
    const activeCounselors = await db.getAsync('SELECT COUNT(*) as count FROM users WHERE LOWER(role) = "counselor" AND status = "Active"');

    const statusRows = await db.allAsync('SELECT status, COUNT(*) as count FROM appointments GROUP BY status');
    const statusCounts = {};
    statusRows.forEach(r => statusCounts[r.status] = r.count);

    const collegeRows = await db.allAsync('SELECT COALESCE(college, "Unspecified") AS college, COUNT(*) as count FROM users WHERE LOWER(role) = "student" GROUP BY college');
    const collegeCounts = {};
    collegeRows.forEach(r => collegeCounts[r.college] = r.count);

    const typeRows = await db.allAsync('SELECT counseling_type, COUNT(*) as count FROM appointments GROUP BY counseling_type');
    const typeCounts = {};
    typeRows.forEach(r => typeCounts[r.counseling_type] = r.count);

    const phqRows = await db.allAsync('SELECT severity, COUNT(*) as count FROM assessments WHERE assessment_type = "PHQ-9" GROUP BY severity');
    const phqCounts = {};
    phqRows.forEach(r => phqCounts[r.severity] = r.count);

    const gadRows = await db.allAsync('SELECT severity, COUNT(*) as count FROM assessments WHERE assessment_type = "GAD-7" GROUP BY severity');
    const gadCounts = {};
    gadRows.forEach(r => gadCounts[r.severity] = r.count);

    const completedAppts = await db.getAsync('SELECT COUNT(*) as count FROM appointments WHERE LOWER(status) = "completed"');

    // Zero-PII aggregated timestamp windows (monthly appointment count & monthly assessments)
    const monthlyApptRows = await db.allAsync(`
      SELECT substr(date, 1, 7) AS month_window, COUNT(*) as count 
      FROM appointments 
      WHERE date IS NOT NULL AND date != ''
      GROUP BY month_window 
      ORDER BY month_window DESC LIMIT 12
    `);
    const monthlyAppointments = {};
    monthlyApptRows.forEach(r => { if (r.month_window) monthlyAppointments[r.month_window] = r.count; });

    const monthlyAsmRows = await db.allAsync(`
      SELECT substr(created_at, 1, 7) AS month_window, COUNT(*) as count 
      FROM assessments 
      WHERE created_at IS NOT NULL AND created_at != ''
      GROUP BY month_window 
      ORDER BY month_window DESC LIMIT 12
    `);
    const monthlyAssessments = {};
    monthlyAsmRows.forEach(r => { if (r.month_window) monthlyAssessments[r.month_window] = r.count; });

    res.json({
      success: true,
      data: {
        totalAppointments: totalAppts.count,
        totalAssessments: totalAssessments.count,
        totalUsers: totalUsers.count,
        totalStudents: totalStudents.count,
        completedSessions: completedAppts.count,
        activeCounselors: activeCounselors.count,
        statusCounts,
        collegeCounts,
        typeCounts,
        phqCounts,
        gadCounts,
        monthlyAppointments,
        monthlyAssessments,
        peakStressPeriods: {} // No static or synthetic data
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to generate institutional analytics.' });
  }
});

// Faculty Referrals
app.get('/api/referrals', authenticateJWT, requireRole('counselor', 'superadmin'), async (req, res) => {
  try {
    const rows = await db.allAsync('SELECT * FROM referrals ORDER BY created_at DESC');
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve referrals.' });
  }
});

// Campus Broadcasts
app.get('/api/broadcasts', async (req, res) => {
  try {
    db.all('SELECT * FROM broadcasts ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        console.warn('[Broadcasts API] Warning (table or column error, returning empty list):', err.message);
        return res.json({ success: true, total: 0, data: [], broadcasts: [] });
      }
      const activeRows = (rows || []).filter(r => r.is_active === undefined || r.is_active === null || r.is_active === 1 || r.is_active === '1');
      res.json({ success: true, total: activeRows.length, data: activeRows, broadcasts: activeRows });
    });
  } catch (err) {
    console.warn('[Broadcasts API] Caught error:', err.message);
    res.json({ success: true, total: 0, data: [], broadcasts: [] });
  }
});

app.post('/api/broadcasts', authenticateJWT, requireRole('superadmin'), async (req, res) => {
  const { title, message, category } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Title and message are required.' });
  }

  try {
    const bId = `BC-${Date.now()}`;
    await db.runAsync(`
      INSERT INTO broadcasts (id, title, message, category, author, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [bId, title.trim(), message.trim(), category || 'Campus Wellness Campaign', req.user.name]);

    await logActivity(req.user.name, req.user.role, 'BROADCAST_PUBLISHED', `Published campus broadcast: ${title}`, req.ip);

    res.status(201).json({ success: true, message: 'Campus broadcast announcement published successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to post broadcast.' });
  }
});

// ==============================================================================
// GUIDANCE DIRECTORATE INSTITUTIONAL ENHANCEMENTS API
// ==============================================================================

// 1. CHED & ALCUCOA Accreditation Metrics
app.get('/api/admin/reports/accreditation', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  try {
    const userStats = await db.getAsync(`
      SELECT 
        COUNT(CASE WHEN LOWER(role) = 'student' THEN 1 END) AS total_students,
        COUNT(CASE WHEN LOWER(role) = 'counselor' THEN 1 END) AS total_counselors
      FROM users
    `);
    const totalConsultations = (await db.getAsync("SELECT COUNT(*) AS count FROM appointments WHERE status = 'Completed'"))?.count || 0;
    const byCollege = await db.allAsync(`
      SELECT COALESCE(college, 'Unspecified') AS college, COUNT(DISTINCT id) AS student_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.student_id = u.id AND a.status = 'Completed') AS completed_sessions
      FROM users u WHERE LOWER(role) = 'student' GROUP BY college
    `);
    const phqRows = await db.allAsync("SELECT severity, COUNT(*) as count FROM assessments WHERE assessment_type = 'PHQ-9' GROUP BY severity");
    const phqDistribution = {};
    phqRows.forEach(r => { if (r.severity) phqDistribution[r.severity] = r.count; });

    const counselorRatio = userStats?.total_counselors > 0 
      ? `1:${Math.round((userStats.total_students || 0) / userStats.total_counselors)}`
      : `1:${userStats?.total_students || 0}`;

    await logDpaEvent(req, 'CHED_ACCREDITATION_REPORT_GENERATED', 'Generated institutional CHED accreditation report');
    res.json({ success: true, userStats, totalConsultations, byCollege, phqDistribution, studentToCounselorRatio: counselorRatio });
  } catch (err) {
    console.error('Accreditation report error:', err);
    res.status(500).json({ success: false, message: 'Failed to aggregate accreditation metrics.' });
  }
});

// GET /api/admin/reports/executive-roster - Deduplicated Student Roster for Executive Directorate Report
app.get('/api/admin/reports/executive-roster', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  try {
    const students = await db.allAsync(`
      SELECT 
        u.id,
        COALESCE(u.student_id, u.id) AS student_id,
        u.name,
        u.email,
        COALESCE(u.college, u.department, 'Unspecified') AS college,
        COALESCE(u.status, 'Active') AS status,
        COALESCE(u.is_verified, 1) AS is_verified,
        (
          SELECT a.severity 
          FROM assessments a 
          WHERE (a.student_id = u.id OR a.student_id = u.student_id OR a.user_id = u.id OR LOWER(a.student_email) = LOWER(u.email))
            AND a.assessment_type = 'PHQ-9'
          ORDER BY a.created_at DESC LIMIT 1
        ) AS latest_phq_severity,
        (
          SELECT a.created_at 
          FROM assessments a 
          WHERE (a.student_id = u.id OR a.student_id = u.student_id OR a.user_id = u.id OR LOWER(a.student_email) = LOWER(u.email))
            AND a.assessment_type = 'PHQ-9'
          ORDER BY a.created_at DESC LIMIT 1
        ) AS latest_phq_date
      FROM users u
      WHERE LOWER(u.role) = 'student'
      GROUP BY u.id
      ORDER BY u.name ASC
    `);
    res.json({ success: true, count: students.length, students });
  } catch (err) {
    console.error('Error fetching executive student roster:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve executive student roster.' });
  }
});

// 2. Executive Faculty Referrals Oversight
app.get('/api/admin/faculty-referrals/oversight', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  try {
    const referrals = await db.allAsync(`
      SELECT id, student_name, student_id, faculty_name, COALESCE(faculty_dept, student_college, 'General') AS department,
        status, created_at, assigned_counselor_name, assigned_counselor_id,
        ((strftime('%s', 'now') - strftime('%s', created_at)) / 3600.0) AS ageHours
      FROM faculty_referrals ORDER BY created_at DESC
    `);
    res.json({ success: true, data: referrals });
  } catch (err) {
    console.error('Faculty referrals oversight error:', err);
    res.status(500).json({ success: false, message: 'Database error retrieving referrals.' });
  }
});

// 2b. Reassign Counselor for Faculty Referral
app.post('/api/admin/faculty-referrals/:id/reassign', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  const referralId = req.params.id;
  const { counselorId, counselorName, directiveNotes } = req.body;
  if (!counselorId) {
    return res.status(400).json({ success: false, message: 'Target counselor is required.' });
  }
  try {
    const targetCounselor = await db.getAsync("SELECT id, name FROM users WHERE id = ? AND LOWER(role) = 'counselor'", [counselorId]);
    const finalName = targetCounselor ? targetCounselor.name : (counselorName || 'Assigned Counselor');
    
    await db.runAsync(`
      UPDATE faculty_referrals 
      SET assigned_counselor_id = ?, assigned_counselor_name = ?, status = 'Assigned to Counselor', actioned_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [counselorId, finalName, referralId]);

    await logDpaEvent(req, 'FACULTY_REFERRAL_REASSIGNED', `Reassigned faculty referral ${referralId} to ${finalName}. Notes: ${directiveNotes || 'None'}`);
    res.json({ success: true, message: `Referral successfully reassigned to ${finalName}.` });
  } catch (err) {
    console.error('Referral reassignment error:', err);
    res.status(500).json({ success: false, message: 'Failed to reassign counselor.' });
  }
});

// 2c. DELETE /api/admin/faculty-referrals/:id - Remove Faculty Student Referral Record
app.delete('/api/admin/faculty-referrals/:id', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  const referralId = req.params.id;
  try {
    const existing = await db.getAsync('SELECT * FROM faculty_referrals WHERE id = ?', [referralId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Faculty referral record not found.' });
    }
    await db.runAsync('DELETE FROM faculty_referrals WHERE id = ?', [referralId]);
    await logDpaEvent(req, 'FACULTY_REFERRAL_REMOVED', `Director removed faculty referral record #${referralId} for ${existing.student_name}`);
    await logActivity(req.user.name, req.user.role, 'REFERRAL_REMOVED', `Removed faculty referral #${referralId} for ${existing.student_name}`, req.ip);
    res.json({ success: true, message: `Faculty referral #${referralId} successfully removed.` });
  } catch (err) {
    console.error('Error deleting faculty referral:', err);
    res.status(500).json({ success: false, message: 'Database error removing faculty referral.' });
  }
});

// 3. Counselor Presence & Shift Occupancy Telemetry
app.get('/api/admin/counselors/presence', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  try {
    const counselors = await db.allAsync("SELECT id, name, college as assigned_cluster FROM users WHERE LOWER(role) = 'counselor' AND status = 'Active'");
    const todayPhilippine = typeof getPhilippineISOString === 'function' ? getPhilippineISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const telemetryData = await Promise.all(counselors.map(async c => {
      const inVideo = await db.getAsync(
        "SELECT id FROM appointments WHERE counselor_id = ? AND status IN ('Approved', 'In Progress') AND date = ?",
        [c.id, todayPhilippine]
      );
      const inChat = await db.getAsync(
        "SELECT id FROM live_chat_requests WHERE counselor_id = ? AND status = 'Active'",
        [c.id]
      );

      let statusClass = 'available', statusLabel = 'Available / On Duty';
      if (inVideo) { statusClass = 'video'; statusLabel = 'In Video Session'; }
      else if (inChat) { statusClass = 'chat'; statusLabel = 'In Live Chat'; }

      const bookedSlots = (await db.getAsync(
        "SELECT COUNT(*) as cnt FROM appointments WHERE counselor_id = ? AND date = ? AND status IN ('Approved', 'Completed', 'In Progress')",
        [c.id, todayPhilippine]
      ))?.cnt || 0;
      const totalSlots = 6;

      return {
        ...c,
        statusClass,
        statusLabel,
        active_cases: bookedSlots,
        bookedSlotsToday: bookedSlots,
        totalSlotsToday: totalSlots,
        utilizationPercent: Math.min(100, Math.round((bookedSlots / totalSlots) * 100))
      };
    }));
    res.json({ success: true, data: telemetryData });
  } catch (err) {
    console.error('Counselor presence telemetry error:', err);
    res.status(500).json({ success: false, message: 'Error fetching telemetry data.' });
  }
});

// 4. Clinical Supervision Notes (Add & Retrieve)
app.post('/api/soap/supervisory-note', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  const { appointmentId, studentId, supervisoryNotes, recommendations, reviewType } = req.body;
  if (!appointmentId || !supervisoryNotes?.trim()) {
    return res.status(400).json({ success: false, message: 'Appointment ID and note contents are required.' });
  }
  try {
    const noteId = `SUP-${Date.now()}`;
    await db.runAsync(`
      INSERT INTO case_supervision_notes (id, appointment_id, student_id, director_id, director_name, supervisory_notes, recommendations, review_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      noteId, 
      appointmentId, 
      studentId || '', 
      req.user.id, 
      req.user.name || 'Director', 
      encryptData(supervisoryNotes.trim()), 
      encryptData(recommendations || ''), 
      reviewType || 'Supervisory Review'
    ]);

    await logDpaEvent(req, 'DPA_PHI_ACCESS', `Added clinical supervisory note for case ${appointmentId}`);
    res.json({ success: true, message: 'Supervisory note documented successfully.' });
  } catch (err) {
    console.error('Supervisory note error:', err);
    res.status(500).json({ success: false, message: 'Failed to record supervisory note.' });
  }
});

app.get('/api/soap/supervisory-notes/:appointmentId', authenticateJWT, async (req, res) => {
  const { appointmentId } = req.params;
  try {
    const rows = await db.allAsync(
      "SELECT * FROM case_supervision_notes WHERE appointment_id = ? ORDER BY created_at DESC",
      [appointmentId]
    );
    const decrypted = rows.map(r => ({
      ...r,
      supervisory_notes: decryptData(r.supervisory_notes),
      recommendations: decryptData(r.recommendations)
    }));
    res.json({ success: true, notes: decrypted });
  } catch (err) {
    console.error('Fetch supervisory notes error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch supervisory notes.' });
  }
});

// 5. Confidential Grievance & Student Incident Intake
app.post('/api/student/grievance', authenticateJWT, async (req, res) => {
  const { category, urgency, subject, details } = req.body;
  if (!category || !subject?.trim() || !details?.trim()) {
    return res.status(400).json({ success: false, message: 'Category, subject, and incident details are required.' });
  }
  try {
    const ticketNumber = `GRV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const id = `GRV-${Date.now()}`;
    await db.runAsync(`
      INSERT INTO grievance_reports (id, ticket_number, reporter_id, reporter_name, reporter_email, reporter_role, category, urgency, subject, details_enc, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Under Review')
    `, [
      id,
      ticketNumber,
      req.user.id || '',
      req.user.name || 'Anonymous Student',
      req.user.email || '',
      req.user.role || 'student',
      category,
      urgency || 'Standard',
      subject.trim(),
      encryptData(details.trim())
    ]);

    await logDpaEvent(req, 'GRIEVANCE_FILED', `Confidential grievance ${ticketNumber} filed under category: ${category}`);
    res.status(201).json({ success: true, ticket_number: ticketNumber, message: 'Confidential report submitted to CGCS Directorate.' });
  } catch (err) {
    console.error('Grievance submission error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit grievance report.' });
  }
});

app.get('/api/admin/grievances', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  try {
    const rows = await db.allAsync("SELECT * FROM grievance_reports ORDER BY created_at DESC");
    const decrypted = rows.map(r => ({
      ...r,
      details: decryptData(r.details_enc)
    }));
    res.json({ success: true, data: decrypted });
  } catch (err) {
    console.error('Fetch grievances error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch grievances.' });
  }
});

app.patch('/api/admin/grievances/:id/resolve', authenticateJWT, requireRole('director', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { status, resolutionNotes } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required.' });
  }
  try {
    await db.runAsync(`
      UPDATE grievance_reports 
      SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ? OR ticket_number = ?
    `, [status, resolutionNotes || '', req.user.name || 'Director', id, id]);

    await logDpaEvent(req, 'GRIEVANCE_RESOLVED', `Grievance ${id} status updated to ${status}`);
    res.json({ success: true, message: `Grievance ticket marked as ${status}.` });
  } catch (err) {
    console.error('Resolve grievance error:', err);
    res.status(500).json({ success: false, message: 'Failed to update grievance.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'UMak Center for Guidance and Counseling Services (CGCS) Enterprise RBAC System',
    institution: 'University of Makati (UMak)',
    version: '2.7.0',
    database: 'SQLite (database.sqlite)',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend for all unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initDatabase().then(() => {
  db.run("ALTER TABLE assessments ADD COLUMN outreach_sent INTEGER DEFAULT 0", (err) => {
    // Ignore error if column already exists
  });

  db.run("ALTER TABLE assessments ADD COLUMN user_id TEXT", (err) => {
    // Backfill user_id from users table if unlinked
    db.run("UPDATE assessments SET user_id = (SELECT id FROM users WHERE users.student_id = assessments.student_id OR users.email = assessments.student_email) WHERE user_id IS NULL OR user_id = ''");
  });

  // Purge hallucinated notifications that misidentify staff as students
  db.run(`
    DELETE FROM notifications 
    WHERE message LIKE '%Student Dr.%' 
       OR message LIKE '%Student Prof.%'
       OR message LIKE '%Dr. Ma. Elena Santos%'
  `, (err) => {
    if (err) console.error("Error purging erroneous notifications:", err);
  });

  // Purge dummy/spam test accounts with invalid names or non-UMak emails
  db.run(`
    DELETE FROM users 
    WHERE email NOT LIKE '%@umak.edu.ph' 
       OR name GLOB '*[0-9]*'
  `, (cleanErr) => {
    if (!cleanErr) console.log("Purged non-UMak test records and numeric accounts.");
  });

  // Data integrity repair: Reset premature 'Completed' marks on future or today's pending appointments
  const todayPhilippine = getPhilippineISOString().split('T')[0];
  db.run(`
    UPDATE appointments 
    SET status = 'Approved' 
    WHERE status = 'Completed' AND date > ?
  `, [todayPhilippine], (err) => {
    if (!err) console.log("Restored future appointments prematurely marked as Completed back to Approved.");
  });

  db.run(`
    UPDATE appointments 
    SET status = 'Approved' 
    WHERE status = 'Completed' 
      AND date = ? 
      AND id NOT IN (SELECT appointment_id FROM soap_notes WHERE appointment_id IS NOT NULL)
  `, [todayPhilippine], (err) => {
    if (!err) console.log("Restored today's unconducted appointments back to Approved.");
  });

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` UMak CGCS System running at http://localhost:${PORT}`);
    console.log(` Role-Based Access Control (RBAC) Enforced`);
    console.log(`=======================================================`);

    // Start background schedule cleanup and session reminder timer (every 30 seconds)
    setInterval(async () => {
      await cleanupExpiredAppointments();
      await dispatchSessionReminders();
    }, 30000);

    // Initial run on boot
    cleanupExpiredAppointments();
    dispatchSessionReminders();
  });
}).catch(err => {
  console.error('Fatal Database Initialization Error:', err);
});
