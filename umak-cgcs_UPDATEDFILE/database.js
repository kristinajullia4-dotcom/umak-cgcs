const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisify SQLite helper methods
db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
};

db.getAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

db.allAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

db.prepare = function (sql) {
  return {
    get: (...args) => db.getAsync(sql, args.flat()),
    all: (...args) => db.allAsync(sql, args.flat()),
    run: async (...args) => {
      const res = await db.runAsync(sql, args.flat());
      return { lastInsertRowid: res.lastID, changes: res.changes };
    }
  };
};

db.transaction = function (fn) {
  return function (...args) {
    return new Promise(async (resolve, reject) => {
      try {
        await db.runAsync('BEGIN TRANSACTION');
        const res = await fn(...args);
        await db.runAsync('COMMIT');
        resolve(res);
      } catch (err) {
        await db.runAsync('ROLLBACK').catch(() => {});
        reject(err);
      }
    });
  };
};

async function initDatabase() {
  console.log('🔄 Initializing SQLite database schema and production seed data...');

  // Safe migrations for newly added user profile and cascading columns
  const cascadingMigrations = [
    'ALTER TABLE users ADD COLUMN updated_at TEXT',
    'ALTER TABLE users ADD COLUMN emergency_contact TEXT',
    'ALTER TABLE users ADD COLUMN id_number TEXT',
    'ALTER TABLE appointments ADD COLUMN student_college TEXT',
    'ALTER TABLE appointments ADD COLUMN student_contact TEXT',
    'ALTER TABLE appointments ADD COLUMN counselor_college TEXT',
    'ALTER TABLE soap_notes ADD COLUMN student_name TEXT',
    'ALTER TABLE delegated_access_requests ADD COLUMN student_name TEXT',
    'ALTER TABLE delegated_access_requests ADD COLUMN requester_name TEXT',
    'ALTER TABLE delegated_access_requests ADD COLUMN requester_id TEXT',
    'ALTER TABLE delegated_access_requests ADD COLUMN target_counselor TEXT',
    'ALTER TABLE faculty_referrals ADD COLUMN actioned_at DATETIME',
    `CREATE TABLE IF NOT EXISTS crisis_alerts (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      student_name TEXT,
      student_college TEXT,
      responder_id TEXT,
      responder_name TEXT,
      severity TEXT,
      status TEXT,
      created_at TEXT
    )`
  ];
  for (const sql of cascadingMigrations) {
    try { await db.runAsync(sql); } catch (e) {}
  }

  // Enable foreign keys
  await db.runAsync('PRAGMA foreign_keys = OFF;');

  // 1. Create Users Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'counselor', 'superadmin', 'admin', 'director')),
      name TEXT NOT NULL,
      student_id TEXT,
      college TEXT,
      program TEXT,
      year_level TEXT,
      title TEXT,
      department TEXT,
      contact_number TEXT,
      contact TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_person TEXT,
      emergency_contact_number TEXT,
      avatar_initials TEXT,
      avatar_url TEXT,
      status TEXT DEFAULT 'Active',
      is_verified INTEGER DEFAULT 0,
      verification_otp TEXT DEFAULT NULL,
      otp_expires INTEGER DEFAULT NULL,
      failed_attempts INTEGER DEFAULT 0,
      lock_until DATETIME DEFAULT NULL,
      reset_token TEXT DEFAULT NULL,
      reset_token_expiry INTEGER DEFAULT NULL,
      reset_token_expires INTEGER DEFAULT NULL,
      reset_otp TEXT DEFAULT NULL,
      reset_otp_expires INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // Safe migrations for newly added user profile columns if table already existed
  const userColumns = [
    { name: 'contact', type: 'TEXT' },
    { name: 'contact_number', type: 'TEXT' },
    { name: 'emergency_contact_name', type: 'TEXT' },
    { name: 'emergency_contact_phone', type: 'TEXT' },
    { name: 'emergency_contact_person', type: 'TEXT' },
    { name: 'emergency_contact_number', type: 'TEXT' },
    { name: 'avatar_initials', type: 'TEXT' },
    { name: 'avatar_url', type: 'TEXT' },
    { name: 'status', type: 'TEXT DEFAULT "Active"' },
    { name: 'is_verified', type: 'INTEGER DEFAULT 0' },
    { name: 'verification_otp', type: 'TEXT' },
    { name: 'otp_expires', type: 'INTEGER' },
    { name: 'failed_attempts', type: 'INTEGER DEFAULT 0' },
    { name: 'lock_until', type: 'DATETIME' },
    { name: 'reset_token', type: 'TEXT' },
    { name: 'reset_token_expiry', type: 'INTEGER' },
    { name: 'reset_token_expires', type: 'INTEGER' },
    { name: 'reset_otp', type: 'TEXT' },
    { name: 'reset_otp_expires', type: 'INTEGER' },
    { name: 'has_completed_intake', type: 'INTEGER DEFAULT 0' },
    { name: 'medical_conditions_enc', type: 'TEXT' },
    { name: 'current_medications_enc', type: 'TEXT' },
    { name: 'previous_medications_enc', type: 'TEXT' },
    { name: 'has_existing_illness', type: 'INTEGER DEFAULT 0' },
    { name: 'intake_completed_at', type: 'TEXT' },
    { name: 'specialization', type: "TEXT DEFAULT 'General Guidance & Counseling'" }
  ];
  for (const col of userColumns) {
    try {
      await db.runAsync(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
    } catch(e) {}
  }

  // Update existing counselor records to set designated specializations
  try {
    await db.runAsync(`
      UPDATE users 
      SET specialization = 'Personal, Family and Career Development' 
      WHERE name LIKE '%Elena%' OR email LIKE '%elena%';
    `);
    await db.runAsync(`
      UPDATE users 
      SET specialization = 'Academic Adjustment & Learning Strategies' 
      WHERE name LIKE '%Reyes%' OR email LIKE '%reyes%';
    `);
  } catch(e) {}

  // Backfill existing staff and students with existing clinical history to completed intake
  try {
    await db.runAsync(`
      UPDATE users 
      SET has_completed_intake = 1 
      WHERE role != 'student' 
         OR id IN (SELECT student_id FROM assessments) 
         OR student_id IN (SELECT student_id FROM assessments)
         OR id IN (SELECT student_id FROM appointments)
         OR student_id IN (SELECT student_id FROM appointments);
    `);
  } catch(e) {}

  // Migration: Ensure users table CHECK constraint includes 'director'
  try {
    const userTableInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (userTableInfo && userTableInfo.sql && !userTableInfo.sql.includes('director')) {
      await db.runAsync("PRAGMA foreign_keys=off;");
      const cols = await db.allAsync("PRAGMA table_info(users)");
      const colNames = cols.map(c => c.name).join(', ');

      await db.runAsync("ALTER TABLE users RENAME TO users_old;");
      await db.runAsync(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('student', 'counselor', 'superadmin', 'admin', 'director')),
          name TEXT NOT NULL,
          student_id TEXT,
          college TEXT,
          program TEXT,
          year_level TEXT,
          title TEXT,
          department TEXT,
          contact_number TEXT,
          emergency_contact_name TEXT,
          emergency_contact_phone TEXT,
          emergency_contact_person TEXT,
          emergency_contact_number TEXT,
          avatar_initials TEXT,
          avatar_url TEXT,
          status TEXT DEFAULT 'Active',
          is_verified INTEGER DEFAULT 0,
          verification_otp TEXT DEFAULT NULL,
          otp_expires INTEGER DEFAULT NULL,
          failed_attempts INTEGER DEFAULT 0,
          lock_until DATETIME DEFAULT NULL,
          reset_token TEXT DEFAULT NULL,
          reset_token_expiry INTEGER DEFAULT NULL,
          reset_token_expires INTEGER DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        )
      `);
      await db.runAsync(`INSERT INTO users (${colNames}) SELECT ${colNames} FROM users_old;`);
      await db.runAsync("DROP TABLE users_old;");
      await db.runAsync("PRAGMA foreign_keys=on;");
      console.log('✅ Migrated users table schema to allow director role.');
    }
  } catch (uMigErr) {
    console.error('Users migration notice:', uMigErr.message);
  }

  // 2. Create Appointments Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      email TEXT NOT NULL,
      contact_number TEXT,
      college TEXT NOT NULL,
      program TEXT,
      year_level TEXT,
      counseling_type TEXT NOT NULL,
      counselor_name TEXT NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      mode TEXT NOT NULL,
      urgency TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Pending Reschedule', 'Completed', 'Declined', 'Cancelled', 'Expired', 'System Cancelled', 'No-Show')),
      reason TEXT,
      meeting_link TEXT,
      reschedule_reason TEXT,
      original_date TEXT,
      original_time_slot TEXT,
      proposed_date TEXT,
      proposed_time_slot TEXT,
      declined_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Ensure SQLite schema check constraint includes 'No-Show' and 'Pending Reschedule'
  try {
    const tableInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments'");
    if (tableInfo && tableInfo.sql && (!tableInfo.sql.includes('No-Show') || !tableInfo.sql.includes('Pending Reschedule'))) {
      await db.runAsync("PRAGMA foreign_keys=off;");
      await db.runAsync("ALTER TABLE appointments RENAME TO appointments_old;");
      await db.runAsync(`
        CREATE TABLE appointments (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          email TEXT NOT NULL,
          contact_number TEXT,
          college TEXT NOT NULL,
          program TEXT,
          year_level TEXT,
          counseling_type TEXT NOT NULL,
          counselor_name TEXT NOT NULL,
          date TEXT NOT NULL,
          time_slot TEXT NOT NULL,
          mode TEXT NOT NULL,
          urgency TEXT DEFAULT 'Medium',
          status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Confirmed', 'Rescheduled', 'Pending Reschedule', 'Completed', 'Declined', 'Cancelled', 'Expired', 'System Cancelled', 'No-Show')),
          reason TEXT,
          meeting_link TEXT,
          reschedule_reason TEXT,
          original_date TEXT,
          original_time_slot TEXT,
          proposed_date TEXT,
          proposed_time_slot TEXT,
          declined_reason TEXT,
          counselor_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const oldCols = (await db.allAsync("PRAGMA table_info(appointments_old)")).map(c => c.name);
      const newCols = (await db.allAsync("PRAGMA table_info(appointments)")).map(c => c.name);
      const commonCols = oldCols.filter(c => newCols.includes(c));
      const colsList = commonCols.join(', ');
      await db.runAsync(`INSERT INTO appointments (${colsList}) SELECT ${colsList} FROM appointments_old;`);
      await db.runAsync("DROP TABLE appointments_old;");
      await db.runAsync("PRAGMA foreign_keys=on;");
      console.log('✅ Migrated appointments table schema to support No-Show and Pending Reschedule.');
    }
  } catch (migErr) {
    console.error('Appointments migration notice:', migErr.message);
  }

  // Ensure counselor_id column exists on appointments
  try {
    await db.runAsync("ALTER TABLE appointments ADD COLUMN counselor_id TEXT;");
  } catch(e) {}

  // Ensure reschedule and tracking columns exist on appointments
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN reschedule_reason TEXT;"); } catch(e) {}
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN original_date TEXT;"); } catch(e) {}
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN original_time_slot TEXT;"); } catch(e) {}
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN proposed_date TEXT;"); } catch(e) {}
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN proposed_time_slot TEXT;"); } catch(e) {}
  try { await db.runAsync("ALTER TABLE appointments ADD COLUMN declined_reason TEXT;"); } catch(e) {}

  // Ensure soap_notes has no broken foreign key to appointments_old
  try {
    const soapInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='soap_notes'");
    if (soapInfo && soapInfo.sql && soapInfo.sql.includes('appointments_old')) {
      await db.runAsync("PRAGMA foreign_keys=off;");
      await db.runAsync("CREATE TABLE IF NOT EXISTS soap_notes_clean (id TEXT PRIMARY KEY, appointment_id TEXT UNIQUE NOT NULL, student_id TEXT NOT NULL, counselor_name TEXT NOT NULL, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, remarks TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
      await db.runAsync("INSERT INTO soap_notes_clean SELECT id, appointment_id, student_id, counselor_name, subjective, objective, assessment, plan, remarks, updated_at FROM soap_notes;");
      await db.runAsync("DROP TABLE soap_notes;");
      await db.runAsync("ALTER TABLE soap_notes_clean RENAME TO soap_notes;");
      await db.runAsync("PRAGMA foreign_keys=on;");
    }
  } catch(e) {}

  // 3. Create SOAP Clinical Notes Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS soap_notes (
      id TEXT PRIMARY KEY,
      appointment_id TEXT UNIQUE NOT NULL,
      student_id TEXT NOT NULL,
      counselor_name TEXT NOT NULL,
      subjective TEXT,
      objective TEXT,
      assessment TEXT,
      plan TEXT,
      remarks TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Create Digital Mental Health Assessments Table (PHQ-9 & GAD-7)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      college TEXT NOT NULL,
      assessment_type TEXT NOT NULL CHECK(assessment_type IN ('PHQ-9', 'GAD-7')),
      score INTEGER NOT NULL,
      severity TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      recommendations TEXT,
      crisis_flag INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.runAsync("ALTER TABLE assessments ADD COLUMN outreach_sent INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists
  }
  try {
    await db.runAsync("ALTER TABLE assessments ADD COLUMN user_id TEXT");
  } catch (e) {
    // Column already exists
  }

  // 5. Create Private Student Mood Logs Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS mood_logs (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_email TEXT NOT NULL,
      mood TEXT NOT NULL,
      score INTEGER NOT NULL,
      intensity INTEGER DEFAULT 5,
      note TEXT,
      logged_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Create Counselor Workload & Schedules Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS counselor_schedules (
      id TEXT PRIMARY KEY,
      counselor_id TEXT NOT NULL,
      counselor_name TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      max_slots INTEGER DEFAULT 4,
      current_assigned INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Unavailable', 'Fully Booked', 'Active')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TRIGGER IF NOT EXISTS trg_counselor_schedules_id 
    AFTER INSERT ON counselor_schedules 
    WHEN NEW.id IS NULL 
    BEGIN 
      UPDATE counselor_schedules SET id = 'SCHED-' || NEW.rowid WHERE rowid = NEW.rowid; 
    END;
  `);

  // 7. Create Role-Segregated Notifications Table
  try {
    const notifTableInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='notifications'");
    if (notifTableInfo && notifTableInfo.sql && !notifTableInfo.sql.includes('target_role')) {
      await db.runAsync("DROP TABLE IF EXISTS notifications;");
      console.log('🔄 Recreated notifications table with role-segregated schema.');
    }
  } catch (nErr) {
    console.error('Notification migration notice:', nErr.message);
  }

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      sender_id TEXT NULL,
      sender_name TEXT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system_notice',
      action_link TEXT NULL,
      reference_id TEXT NULL,
      link TEXT NULL,
      target_role TEXT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN sender_id TEXT;`); } catch (e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN sender_name TEXT;`); } catch (e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN action_link TEXT;`); } catch (e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN reference_id TEXT;`); } catch (e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN link TEXT;`); } catch (e) {}
  try { await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);`); } catch (e) {}

  // 8. Create System Audit Logs Table (DPA 2012 / RA 10173 Compliance)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 9. Create Campus Broadcasts Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL,
      author TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    const bTableInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='broadcasts'");
    if (bTableInfo && bTableInfo.sql && !bTableInfo.sql.includes('is_active')) {
      await db.runAsync("ALTER TABLE broadcasts ADD COLUMN is_active INTEGER DEFAULT 1;");
    }
  } catch (bColErr) {}

  // 10. Create Faculty Referrals Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referring_faculty TEXT NOT NULL,
      faculty_email TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      college TEXT NOT NULL,
      reason TEXT NOT NULL,
      urgency TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Pending Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS faculty_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_name TEXT NOT NULL,
      faculty_email TEXT NOT NULL,
      faculty_dept TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_college TEXT,
      student_email TEXT,
      behavior_category TEXT NOT NULL,
      urgency_level TEXT NOT NULL,
      objective_narrative TEXT NOT NULL,
      assigned_counselor_id TEXT,
      assigned_counselor_name TEXT,
      status TEXT DEFAULT 'Received by CGCS',
      actioned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_faculty_referrals_student ON faculty_referrals(student_id);`);

  // 11. Create Live Counselor Escalation Chat Requests & Sessions Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS live_chat_requests (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      college TEXT NOT NULL,
      counselor_id TEXT,
      counselor_name TEXT,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Active', 'Completed', 'Cancelled')),
      initial_summary TEXT,
      chat_transcript TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 12. Create Live Chat Messages Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 13. Create Delegated Clinical Data Access Requests Table (DPA 2012 / RA 9258 Clinical Data Silo)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS delegated_access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      appointment_id TEXT,
      requesting_counselor_id TEXT NOT NULL,
      requesting_counselor_name TEXT NOT NULL,
      target_counselor_id TEXT,
      target_counselor_name TEXT,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Declined')),
      reviewed_by TEXT,
      reviewed_by_name TEXT,
      reviewed_at TEXT,
      expires_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(requesting_counselor_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Safe migration: Ensure counselor_id column on soap_notes if missing
  try {
    await db.runAsync("ALTER TABLE soap_notes ADD COLUMN counselor_id TEXT");
  } catch (e) {}

  // Safe migration: Ensure appointment_id column on delegated_access_requests if missing
  try {
    await db.runAsync("ALTER TABLE delegated_access_requests ADD COLUMN appointment_id TEXT");
  } catch (e) {}

  // Safe migration: Ensure assigned_counselor_id column on delegated_access_requests if missing
  try {
    await db.runAsync("ALTER TABLE delegated_access_requests ADD COLUMN assigned_counselor_id TEXT");
  } catch (e) {}

  // Clinical Intake: Medical Disclosures & Mental Health Screenings
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS medical_disclosures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE,
      student_name TEXT,
      diagnosed_conditions TEXT,
      current_medications TEXT,
      past_psychiatric_meds TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS mental_health_screenings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT,
      student_name TEXT,
      phq9_score INTEGER,
      gad7_score INTEGER,
      phq9_data TEXT,
      gad7_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.runAsync("ALTER TABLE users ADD COLUMN intake_completed INTEGER DEFAULT 0");
  } catch (e) {}

  // 17. Directorate Clinical Supervision Notes & Incident Intake
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS case_supervision_notes (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      director_id TEXT NOT NULL,
      director_name TEXT NOT NULL,
      supervisory_notes TEXT NOT NULL,
      recommendations TEXT,
      review_type TEXT DEFAULT 'Supervisory Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS grievance_reports (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      reporter_id TEXT,
      reporter_name TEXT,
      reporter_email TEXT,
      reporter_role TEXT DEFAULT 'student',
      category TEXT NOT NULL,
      urgency TEXT DEFAULT 'Standard',
      subject TEXT NOT NULL,
      details_enc TEXT NOT NULL,
      status TEXT DEFAULT 'Under Review',
      resolution_notes TEXT,
      resolved_by TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.runAsync("ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE faculty_referrals ADD COLUMN student_email TEXT");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE faculty_referrals ADD COLUMN actioned_at DATETIME");
  } catch (e) {}

  // Safe migrations for appointments & schedules compatibility
  try {
    await db.runAsync("ALTER TABLE appointments ADD COLUMN schedule_date TEXT");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE appointments ADD COLUMN schedule_time TEXT");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE counselor_schedules ADD COLUMN date TEXT");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE counselor_schedules ADD COLUMN timeslot TEXT");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE counselor_schedules ADD COLUMN is_available INTEGER DEFAULT 1");
  } catch (e) {}
  try {
    await db.runAsync("ALTER TABLE counselor_schedules ADD COLUMN specialization TEXT");
  } catch (e) {}

  // Confidential 3-Question Post-Session CSAT Feedback Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS session_feedback (
      id TEXT PRIMARY KEY,
      appointment_id TEXT,
      student_id TEXT,
      counselor_id TEXT,
      helpfulness INTEGER NOT NULL,
      empathy INTEGER NOT NULL,
      ease INTEGER NOT NULL,
      comments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Dedicated Zero-PII Anonymous Counselor Feedback & CSAT Quality Improvement Table (RA 10173 Protected)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS consultation_feedbacks (
      id TEXT PRIMARY KEY,
      appointment_id TEXT UNIQUE NOT NULL,
      counselor_id TEXT NOT NULL,
      counselor_name TEXT NOT NULL,
      rating_helpfulness INTEGER CHECK(rating_helpfulness BETWEEN 1 AND 5),
      rating_empathy INTEGER CHECK(rating_empathy BETWEEN 1 AND 5),
      rating_ease INTEGER CHECK(rating_ease BETWEEN 1 AND 5),
      average_score REAL NOT NULL,
      student_reflection TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (counselor_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_feedbacks_counselor ON consultation_feedbacks(counselor_id);`);

  try {
    await db.runAsync("ALTER TABLE appointments ADD COLUMN feedback_submitted INTEGER DEFAULT 0");
  } catch (e) {}

  // Compatibility views for clinical_soap_notes, campus_broadcasts, and delegated_access
  try {
    await db.runAsync("CREATE VIEW IF NOT EXISTS clinical_soap_notes AS SELECT * FROM soap_notes;");
    await db.runAsync("CREATE VIEW IF NOT EXISTS campus_broadcasts AS SELECT * FROM broadcasts;");
    await db.runAsync("CREATE VIEW IF NOT EXISTS delegated_access AS SELECT * FROM delegated_access_requests;");
  } catch (e) {}

  await seedDatabase();
}

async function seedDatabase() {
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('Password123!', salt);

  // 1. Seed Core Production Accounts
  const coreUsers = [
    {
      id: 'USR-DIR-001',
      email: 'director@umak.edu.ph',
      password_hash: defaultPasswordHash,
      role: 'director',
      name: 'Dr. Carmelita F. Castelo',
      title: 'Director, Center for Guidance and Counseling Services',
      department: 'CGCS Directorate',
      contact_number: '(02) 8883-1860 loc 304',
      emergency_contact_person: 'UMak Health Clinic',
      emergency_contact_number: 'Local 114',
      avatar_url: '',
      status: 'Active'
    },
    {
      id: 'USR-CNS-001',
      email: 'counselor@umak.edu.ph',
      password_hash: defaultPasswordHash,
      role: 'counselor',
      name: 'Dr. Ma. Elena Santos, RGC',
      title: 'Registered Guidance Counselor',
      department: 'CCIS & COED Cluster',
      contact_number: '0917-888-1234',
      emergency_contact_person: 'Dr. Carmelita F. Castelo',
      emergency_contact_number: '(02) 8883-1860',
      avatar_url: '',
      status: 'Active'
    },
    {
      id: 'USR-CNS-002',
      email: 'reyes.counselor@umak.edu.ph',
      password_hash: defaultPasswordHash,
      role: 'counselor',
      name: 'Prof. Alan Reyes, RGC',
      title: 'Associate Guidance Specialist',
      department: 'CBFS & CTHM Cluster',
      contact_number: '0918-999-5678',
      emergency_contact_person: 'CGCS Office',
      emergency_contact_number: 'Loc 304',
      avatar_url: '',
      status: 'Active'
    }
  ];

  for (const user of coreUsers) {
    await db.runAsync(`
      INSERT OR IGNORE INTO users (
        id, email, password_hash, role, name, student_id, college, program, year_level, title, department, contact_number, emergency_contact_name, emergency_contact_phone, emergency_contact_person, emergency_contact_number, avatar_url, status, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      user.id,
      user.email,
      user.password_hash,
      user.role,
      user.name,
      user.student_id || null,
      user.college || null,
      user.program || null,
      user.year_level || null,
      user.title || null,
      user.department || null,
      user.contact_number || null,
      user.emergency_contact_person || null,
      user.emergency_contact_number || null,
      user.emergency_contact_person || null,
      user.emergency_contact_number || null,
      user.avatar_url || null,
      user.status
    ]);
  }

  // Ensure all seeded administrative accounts are marked verified and role normalized
  await db.runAsync(`
    UPDATE users SET is_verified = 1, role = 'director' 
    WHERE email = 'director@umak.edu.ph' OR LOWER(role) = 'superadmin'
  `);
  await db.runAsync(`
    UPDATE users SET is_verified = 1 
    WHERE email IN ('counselor@umak.edu.ph', 'reyes.counselor@umak.edu.ph', 'counselor.reyes@umak.edu.ph')
  `);

  // Purge any legacy dummy/seed student accounts and automated test accounts
  await db.runAsync(`
    DELETE FROM users 
    WHERE id = 'USR-STD-001' OR email = 'student@umak.edu.ph' OR email LIKE 'test.counselor.%'
  `);

  // Purge any mock/synthetic appointments, fake clinical notes, and demo assessments
  await db.runAsync(`
    DELETE FROM appointments 
    WHERE email = 'student@umak.edu.ph' OR email = 'sophia.bernardo@umak.edu.ph' OR student_id = 'K120-44921' OR student_id = 'B122-10843'
  `);
  await db.runAsync(`
    DELETE FROM assessments 
    WHERE student_email = 'student@umak.edu.ph' OR student_email = 'sophia.bernardo@umak.edu.ph' OR student_id = 'K120-44921' OR student_id = 'B122-10843'
  `);
  await db.runAsync(`
    DELETE FROM soap_notes 
    WHERE student_id = 'K120-44921' OR student_id = 'B122-10843'
  `);
  // Purge hallucinated notifications that misidentify staff as students
  await db.runAsync(`
    DELETE FROM notifications 
    WHERE message LIKE '%Student Dr.%' 
       OR message LIKE '%Student Prof.%'
       OR message LIKE '%Dr. Ma. Elena Santos%'
  `);

  // Purge dummy/spam test accounts with invalid names or non-UMak emails
  await db.runAsync(`
    DELETE FROM users 
    WHERE email NOT LIKE '%@umak.edu.ph' 
       OR name GLOB '*[0-9]*'
  `);

  // 2. Seed Counselor Duty Schedules
  const scheduleCount = await db.getAsync('SELECT COUNT(*) as count FROM counselor_schedules');
  if (scheduleCount.count === 0) {
    const schedules = [
      { id: 'SCHED-01', cId: 'USR-CNS-001', cName: 'Dr. Ma. Elena Santos, RGC', day: 'Monday', time: '08:30 AM - 11:30 AM', status: 'Available' },
      { id: 'SCHED-02', cId: 'USR-CNS-001', cName: 'Dr. Ma. Elena Santos, RGC', day: 'Wednesday', time: '01:00 PM - 04:30 PM', status: 'Available' },
      { id: 'SCHED-03', cId: 'USR-CNS-001', cName: 'Dr. Ma. Elena Santos, RGC', day: 'Friday', time: '08:30 AM - 11:30 AM', status: 'Available' },
      { id: 'SCHED-04', cId: 'USR-CNS-002', cName: 'Prof. Alan Reyes, RGC', day: 'Tuesday', time: '08:30 AM - 11:30 AM', status: 'Available' },
      { id: 'SCHED-05', cId: 'USR-CNS-002', cName: 'Prof. Alan Reyes, RGC', day: 'Thursday', time: '01:00 PM - 04:30 PM', status: 'Available' }
    ];
    for (const s of schedules) {
      await db.runAsync(`
        INSERT OR IGNORE INTO counselor_schedules (id, counselor_id, counselor_name, day_of_week, time_slot, max_slots, current_assigned, status)
        VALUES (?, ?, ?, ?, ?, 4, 1, ?)
      `, [s.id, s.cId, s.cName, s.day, s.time, s.status]);
    }
  }

  // 3. Seed Campus Broadcast
  const bcCount = await db.getAsync('SELECT COUNT(*) as count FROM broadcasts');
  if (bcCount.count === 0) {
    await db.runAsync(`
      INSERT OR IGNORE INTO broadcasts (id, title, message, category, author, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [
      'BC-001',
      'Midterm Wellness & Relaxation Week',
      'The CGCS invites all Heron students to participate in group grounding and mindfulness sessions this Friday at Admin Bldg Rm 304 or online via HeronCare AI.',
      'Campus Wellness Campaign',
      'Dr. Carmelita F. Castelo'
    ]);
  }

  console.log('✅ SQLite database schema & seed data initialized successfully.');
}

module.exports = { db, initDatabase };
