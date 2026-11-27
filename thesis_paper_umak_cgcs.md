# UNIVERSITY OF MAKATI
## COLLEGE OF COMPUTING AND INFORMATION SCIENCES
### Center for Guidance and Counseling Services (CGCS)

---

# AN ENTERPRISE GUIDANCE AND COUNSELING MANAGEMENT SYSTEM WITH AUTOMATED PSYCHOMETRIC TRIAGE, EMPATHETIC AI ASSISTANCE, AND REGULATORY CLINICAL SILOS
### Technical Architecture, Operations Manual, and Capstone Documentation

**Institutional Host:** Center for Guidance and Counseling Services (CGCS), Room 304, Admin Building, University of Makati, J.P. Rizal Ext., West Rembo, Taguig / Makati City  
**Compliance Standards:** Republic Act No. 9258 (Guidance and Counseling Act of 2004), Republic Act No. 10173 (Data Privacy Act of 2012), Republic Act No. 11036 (Mental Health Act), and CHED CMO No. 09, series of 2013.

---

## TABLE OF CONTENTS

- **Chapter 1 – Introduction**
  - 1.1 System Overview
  - 1.2 Purpose
  - 1.3 Intended Users
  - 1.4 System Features
- **Chapter 2 – System Requirements**
  - 2.1 Hardware Requirements
  - 2.2 Software Requirements
  - 2.3 Network Requirements
- **Chapter 3 – System Installation**
  - 3.1 Web Server Installation
  - 3.2 Application Installation
  - 3.3 Database Installation
  - 3.4 Database Configuration
  - 3.5 Application Configuration
- **Chapter 4 – System Operation**
  - 4.1 System Login
  - 4.2 Dashboard
  - 4.3 User Management
  4.4 Main Transactions
  - 4.5 Search
  - 4.6 Reports
  - 4.7 Logout
- **Chapter 5 – Administrator Guide**
  - 5.1 User Accounts
  - 5.2 Roles and Permissions
  - 5.3 System Configuration
  - 5.4 Audit Logs
  - 5.5 Backup
  - 5.6 Restore

---

# Chapter 1 – Introduction

### 1.1 System Overview
The **University of Makati – Center for Guidance and Counseling Services (UMak CGCS) Enterprise Web Portal & Teleconsultation Management System** is a mission-critical web application developed to modernize and centralize mental health support, clinical documentation, and psychometric evaluation for the university.

Built on a lightweight, secure architecture combining a **Node.js** and **Express.js** application server with an embedded, transactional **SQLite3** relational database engine, the platform replaces fragmented manual paperwork with an encrypted, role-segregated digital ecosystem. The frontend is engineered using responsive, dependency-light vanilla JavaScript and HTML5/CSS3 to guarantee maximum client rendering performance, rapid mobile responsiveness across student smartphones, and complete data sovereignty without external third-party tracking libraries.

The platform unifies student intake screening, automated psychological assessment scoring, intelligent counselor caseload distribution, encrypted WebRTC audio-video teleconsultations, inter-counselor clinical data access delegation, faculty crisis endorsements, and official institutional compliance reporting into a unified single-page interface.

### 1.2 Purpose
The system was designed and deployed to resolve core operational, clinical, and regulatory challenges in academic counseling services:

1. **Statutory and Regulatory Compliance**:
   - **Republic Act No. 9258 (Guidance and Counseling Act of 2004)**: Enforces strict data ownership boundaries. Under this law, psychological notes and clinical SOAP records belong exclusively to the licensed Registered Guidance Counselor (RGC) conducting the session. The system establishes cryptographic silos preventing unauthorized cross-counselor record browsing.
   - **Republic Act No. 10173 (Data Privacy Act of 2012)**: Safeguards sensitive student personal health information through AES-256-GCM data encryption at rest, Zero-PII masking on administrative dashboards, immutable audit logging, and role-based access control.
   - **Republic Act No. 11036 (Philippine Mental Health Act)**: Establishes proactive mental health evaluation, emergency distress intercepts, and suicide intervention pathways across higher education institutions.
   - **CHED CMO No. 09, series of 2013 (Enhanced Policies and Guidelines on Student Affairs and Services)**: Provides automated statistical modeling to track university student-to-counselor ratios, consultation volumes, and psychological distress patterns across individual colleges.

2. **Automated Clinical Triage & Risk Mitigation**:
   Replaces cumbersome pen-and-paper intake sheets with standardized digital inventories (**PHQ-9** and **GAD-7**). It flags self-harm or suicidal tendencies in real time, locking critical cases into an emergency escalation protocol while providing immediate access to national crisis hotlines.

3. **Hybrid Counseling Continuity**:
   Enables hybrid academic support by facilitating both traditional on-campus face-to-face sessions at CGCS Room 304 and end-to-end encrypted virtual consultations for remote or off-campus students.

4. **Empathetic AI-Assisted First-Aid**:
   Integrates **HeronCare AI** (powered by Google Gemini), an AI conversational assistant that offers non-clinical emotional check-ins, helps de-escalate anxiety, and generates synthesized clinical triage briefings for human counselors prior to live consultations.

### 1.3 Intended Users
The system establishes three primary user tiers, each bounded by strict technical permissions and separate user interfaces:

| User Tier | Target Audience & Scope | Authentication Standard | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Student** | Enrolled undergraduate and graduate students across all UMak colleges (CCIS, CBFS, COA, COE, CAS, CTHM, etc.). | Official institutional email (`@umak.edu.ph`) or Student ID Number. | Medical disclosures, PHQ-9 & GAD-7 screening, consultation booking, teleconsultation room, mood logging, HeronCare AI triage, anonymous post-session CSAT feedback. |
| **Counselor** | Licensed Registered Guidance Counselors (RGC) and clinical staff assigned to specific academic colleges. | Staff `@umak.edu.ph` institutional email, password, and staff role token. | Triage queue management, appointment approval/rescheduling, live chat crisis desk, legal SOAP clinical note drafting, faculty referral intake, delegated access requests. |
| **Director / Super Admin** | Guidance Director, Center Head, and authorized IT systems administrators. | High-privilege administrative credentials under `director` / `superadmin` role. | Institutional BI analytics, distress distribution dashboards, delegated access clearance approval, faculty referral oversight, user account creation and deletion, audit log inspection, CHED accreditation reporting. |

### 1.4 System Features
* **Role-Based Access Control (RBAC)**: Server-enforced middleware (`authenticateJWT`, `requireRole`) dynamically controlling navigation, API endpoints, and view rendering.
* **Standardized Dual Psychometric Screening**: Automated administration and scoring of the Patient Health Questionnaire-9 (PHQ-9) and Generalized Anxiety Disorder-7 (GAD-7) with immediate severity tiering (*Minimal Concern, Mild Concern, Moderate Concern, High Concern, Severe Concern*).
* **Automated Crisis Intercept**: Real-time evaluation of PHQ-9 Question 9 (self-harm/suicidal ideation). Any positive score triggers an un-dismissible emergency crisis modal, logs high-urgency alerts, and displays one-touch dialing for the National Center for Mental Health (NCMH 1553), Hopeline, and In Touch Crisis lines.
* **Intake Gatekeeper**: Enforces a clinical rule requiring students to complete health disclosures (chronic physical illnesses, current maintenance medications, past psychiatric medications) before scheduling consultations.
* **Cadence-Protected Consultation Booking**: Dynamic scheduling engine with double-booking prevention, college cluster counselor matching, and an enforced 14-day booking cadence to maintain balanced caseload distribution.
* **Encrypted WebRTC Teleconsultation**: Browser-based peer-to-peer audio/video calling using WebRTC mesh architecture, room tokens, and in-call connection status monitors.
* **Legal SOAP Clinical Records Desk**: Standardized clinical documentation (*Subjective, Objective, Assessment, Plan*) cryptographically bound to the authoring counselor.
* **Time-Locked Delegated Access Desk**: 24-hour read-only access clearance workflow for cross-counselor file review, requiring clinical justification and Director authorization.
* **Executive Faculty Referral Oversight**: Direct submission pipeline for university professors to refer students exhibiting behavioral or emotional red flags, complete with > 48 hours response aging indicators.
* **Institutional CHED & ALCUCOA Report Generator**: Dedicated print engines producing official, letterhead-formatted accreditation reports with college caseload breakdowns, counselor ratios, and deduplicated student registries without browser scrollbars.
* **Security & DPA Compliance**: Sensitive health disclosures encrypted via AES-256-GCM; passwords secured using salted bcrypt; brute-force protection with 15-minute lockouts after 5 consecutive failed attempts.

---

# Chapter 2 – System Requirements

### 2.1 Hardware Requirements

#### Server Host Requirements (Production / On-Premise / Cloud VPS)
* **Central Processing Unit (CPU)**: 64-bit x86_64 or ARM64 Dual-Core processor running at 2.0 GHz or higher (Quad-Core recommended for high-volume concurrent WebRTC signaling and simultaneous assessment submissions).
* **System Memory (RAM)**: Minimum 2 GB of RAM (4 GB or more recommended to maintain responsive SQLite in-memory page caching and background Nodemailer queues).
* **Disk Storage**: Minimum 10 GB of high-speed solid-state storage (SSD) to support database journaling, system audit logs, and document generation.
* **Network Adapter**: Gigabit Ethernet Network Interface Card (100/1000 Mbps NIC).

#### Client-Side Hardware Requirements (End-User Terminals)
* **Workstation / Laptop / Tablet / Smartphone**:
  * Any standard computing terminal running Windows, macOS, Linux, ChromeOS, Android, or iOS.
  * Minimum 1.0 GHz dual-core processor with at least 1 GB of RAM.
  * **Audio/Visual Hardware**: Integrated or external webcam, microphone, and speakers/headphones (mandatory for teleconsultations).
  * **Display**: Minimum screen resolution of 1280 x 720 for desktop workstations; layout dynamically adapts to mobile screens down to 360px.

### 2.2 Software Requirements

#### Server Software Environment
* **Operating System**: Windows Server 2019/2022, Windows 10/11 Professional (64-bit), Ubuntu Server 20.04/22.04 LTS, Debian 11/12, or Enterprise Linux.
* **Application Runtime**: **Node.js LTS** (version 18.x or 20.x).
* **Package Manager**: **NPM** (version 9.x or 10.x).
* **Database Management System**: **SQLite3** engine (via `sqlite3` npm driver v5.1.7). Serverless and zero-configuration, eliminating external database daemon overhead.
* **Production Process Manager**: `pm2` (recommended for background service auto-restart and log rotation).

#### Core Software Dependencies (`package.json`)
* `express` (^4.19.2): Core web application framework for routing and middleware.
* `sqlite3` (^5.1.7): Asynchronous relational database driver.
* `bcryptjs` (^2.4.3): Cryptographic password hashing utilizing 10 salt rounds.
* `jsonwebtoken` (^9.0.2): Stateless HMAC-SHA256 JWT generation and validation with 12-hour session lifespans.
* `dotenv` (^18.0.4): Zero-dependency environment variable parser.
* `cors` (^2.8.5): Express middleware controlling Cross-Origin Resource Sharing.
* `nodemailer` (^10.0.0): SMTP mail dispatch for 6-digit OTP verification and status alerts.
* `@google/generative-ai` (^0.24.1): Official Google Gemini SDK powering the HeronCare conversational model.

#### Client Software Environment
* **Supported Web Browsers**:
  * Google Chrome (v100+ recommended for WebRTC standard compliance).
  * Mozilla Firefox (v100+).
  * Microsoft Edge (Chromium engine, v100+).
  * Apple Safari (v15+ on macOS / iOS).
* **Prerequisites**: JavaScript enabled, HTML5 local storage active, WebRTC media capture permissions granted.

### 2.3 Network Requirements
* **Network Connectivity**:
  * General Portal Transactions: Minimum 512 Kbps dedicated upload/download per active user.
  * Teleconsultation Video Calls: Minimum 2.0 Mbps symmetric upload and download bandwidth per participant (5.0 Mbps recommended for HD video).
* **Firewall and Port Configurations**:
  * **TCP Port 5050**: Default HTTP inbound listener port (or standard Port 80/443 when deployed behind an Nginx or Apache reverse proxy with TLS/SSL encryption).
  * **Outbound TCP Port 587 / 465**: For SMTP Nodemailer communication with institutional mail relays (e.g., `smtp.gmail.com`).
  * **UDP/TCP Dynamic Range (1024–65535)**: Standard STUN/TURN traversal ports for WebRTC peer connection establishment.

---

# Chapter 3 – System Installation

### 3.1 Web Server Installation
1. **Download and Install Node.js LTS**:
   - Access the official Node.js portal (`https://nodejs.org/`) and download the current LTS package (version 18.x or 20.x) matching your host operating system.
   - Run the installer. On Windows, ensure the option **"Add to PATH"** is selected. On Linux, deploy via NodeSource:
     ```bash
     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
     sudo apt-get install -y nodejs
     ```
2. **Verify Node and NPM Installation**:
   Open a terminal and verify binary availability:
   ```bash
   node -v
   npm -v
   ```
   Both commands must return active version strings (e.g., `v20.18.0` and `10.8.2`).

### 3.2 Application Installation
1. **Extract Repository**:
   Deploy the application directory onto the designated host path (e.g., `C:\inetpub\umak-cgcs` or `/var/www/umak-cgcs`).
2. **Install Node Packages**:
   Navigate into the application root directory and execute:
   ```bash
   npm install
   ```
   This reads `package.json` and populates the local `node_modules/` folder with all required runtime dependencies.

### 3.3 Database Installation
The system uses an embedded, zero-configuration **SQLite3** relational database. There is **no need** to install separate database server daemons (such as MySQL or PostgreSQL).
- The storage file is maintained locally in the project root as `database.sqlite`.
- The database engine is embedded directly within the Node.js process space via the `sqlite3` binary driver.

### 3.4 Database Configuration
1. **Automated Schema Provisioning and Data Seeding**:
   The database configuration and table definitions are defined in `database.js`. Execute the initialization routine by running:
   ```bash
   npm run seed
   ```
   *or directly:*
   ```bash
   node database.js
   ```
2. **Database Provisioning Scope**:
   The execution performs the following transactional operations:
   - Configures SQLite performance pragmas (`PRAGMA foreign_keys = ON;`).
   - Creates the necessary database tables:
     - `users`: Core authentication, verification status, and profile records.
     - `appointments`: Booking schedules, statuses, and meeting tokens.
     - `soap_notes`: Clinical counseling records with counselor ownership silos.
     - `assessments`: PHQ-9 and GAD-7 screening results and Question 9 crisis flags.
     - `mood_logs`: Private student daily affective tracking logs.
     - `counselor_schedules`: Counselor duty rosters, days, and slot quotas.
     - `notifications`: Role-segregated in-app notification dispatches.
     - `audit_logs`: Immutable, DPA 2012-compliant system activity logs.
     - `broadcasts`: University-wide guidance announcements.
     - `faculty_referrals`: Faculty student concern endorsements.
     - `live_chat_requests` & `live_chat_messages`: Real-time crisis triage transcripts.
     - `delegated_access_requests`: 24-hour temporary cross-counselor access clearance logs.
     - `consultation_feedbacks`: Anonymized 3-question post-session CSAT ratings.
     - `case_supervision_notes`: Director clinical supervision and second-opinion notes.
     - `grievance_reports`: Confidential student incident reporting channel.
   - Executes dynamic schema migrations to safely add newly required columns without dropping existing data.
   - Populates default institutional seed accounts (Director, licensed counselors, and demo student profiles).

### 3.5 Application Configuration
1. **Environment Variables Configuration**:
   Create a `.env` file in the application root directory containing the following configuration keys:
   ```env
   # Network Port
   PORT=5050

   # JWT Secret Key for Session Authentication
   JWT_SECRET=umak_cgcs_enterprise_secret_2026_supersecure_key

   # 32-Byte Key for AES-256-GCM Health Data Encryption
   ENCRYPTION_KEY=umak_cgcs_aes256_encryption_key_2026_dpa_compliant_super_secure

   # Google Gemini API Key for HeronCare AI Emotional First-Aid
   GEMINI_API_KEY=AIzaSyYourGeneratedGeminiApiKeyHere

   # Institutional SMTP Relay for Verification OTPs & Notifications
   EMAIL_USER=guidance.cgcs@umak.edu.ph
   EMAIL_PASS=your_secure_application_password
   ```
2. **Launch Application Server**:
   To start the web application:
   ```bash
   npm start
   ```
   For 24/7 production daemon execution with auto-restart, use `pm2`:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "umak-cgcs"
   pm2 save
   ```
3. **Access Portal**:
   Verify system operation by navigating to `http://localhost:5050` in a supported browser.

---

# Chapter 4 – System Operation

```
                             +------------------------+
                             |   UMak CGCS Web App    |
                             | (http://localhost:5050)|
                             +-----------+------------+
                                         |
                                         v
                         +-------------------------------+
                         | Unified Portal Authentication |
                         | (Email / Student ID + Pass)   |
                         +---------------+---------------+
                                         |
                +------------------------+-----------------------+
                |                        |                       |
                v                        v                       v
      +------------------+     +-------------------+   +--------------------+
      |  STUDENT PORTAL  |     | COUNSELOR PORTAL  |   |  DIRECTOR PORTAL   |
      +------------------+     +-------------------+   +--------------------+
      | - Intake Records |     | - Triage Queue    |   | - Institutional BI |
      | - PHQ-9 & GAD-7  |     | - Daily Schedules |   | - Delegated Access |
      | - Mood Tracker   |     | - Legal SOAP Notes|   | - Referral Desk    |
      | - Appointment    |     | - Teleconsultation|   | - User Governance  |
      | - HeronCare AI   |     | - Case Feedback   |   | - CHED & Exec Reps |
      +------------------+     +-------------------+   +--------------------+
```

### 4.1 System Login
1. **Unified Authentication Entry**:
   - Access the main landing screen.
   - Enter either a valid **UMak Email Address** (`@umak.edu.ph`) or a registered **Student ID Number** (e.g., `K12345678`), along with the account password.
2. **Account Lockout Mechanism**:
   - To prevent credential stuffing and brute-force dictionary attacks, the backend tracks failed authentication attempts.
   - On the **5th consecutive failed attempt**, the account is locked for **15 minutes** (`lock_until = CURRENT_TIMESTAMP + 15 mins`). The user interface informs the user of the active lockout and displays the remaining lock duration.
3. **Email Verification & Instant Director Provisioning**:
   - Self-registered students must input a **6-digit numeric OTP** dispatched to their inbox via Nodemailer to activate their account (`is_verified = 1`).
   - Accounts registered directly by the Guidance Director via the administrative portal are automatically flagged as pre-verified (`is_verified = 1`, `status = 'Active'`), allowing immediate access without OTP delays.
4. **Credential Recovery**:
   - Users click **"Forgot Password?"**, provide their institutional email, and receive an OTP to reset their password securely.

### 4.2 Dashboard Operations

#### Student Portal Dashboard
* **Wellness Status Indicator**: Summarizes current psychological standing based on recent assessments and provides alerts when periodic reassessment is required.
* **Consultation Card**: Displays the student's next confirmed counseling session with a live countdown and a one-click **"Enter Teleconsultation Room"** button.
* **Mandatory Intake Alert**: Highlights missing health disclosure forms with direct navigation to the intake module.
* **Daily Mood Tracker**: Quick-logging widget allowing students to log daily mood ratings (1–10) and personal diary notes.
* **HeronCare AI Floating Drawer**: Easily accessible chat interface for emotional de-escalation and instant guidance.

#### Counselor Portal Dashboard
* **Live Triage Caseload Queue**: Tabbed interface filtering consultations into *Pending, Confirmed, Completed, Rescheduled, Pending Reschedule,* and *Cancelled*.
* **Daily Schedule Summary**: Real-time counter of booked vs. available slots for the current date.
* **Faculty Referral Notifications**: Real-time alerts of students endorsed by university professors requiring immediate outreach.
* **Live Chat Escalation Monitor**: Urgent banner alerting counselors when a student in acute distress requests immediate live chat triage.

#### Director / Super Admin Portal Dashboard
* **Executive Institutional Analytics**: Anonymized macro-level dashboards aggregating depression severity (PHQ-9), generalized anxiety (GAD-7), peak exam stress windows, and college consultation volumes.
* **Counselor Presence & Telemetry Desk**: Real-time status indicators tracking whether counselors are *Available / On Duty, In Video Session, In Live Chat,* or *Offline*.
* **Delegated Clinical Access Clearances**: Executive overview of pending inter-counselor access requests under RA 9258.

### 4.3 User Management
Exclusively accessible to the Guidance Director via the **Enterprise User Directory & Role Governance** tab:
1. **Directory Segmentation**: Toggle buttons allow the Director to switch between the **Students** directory and **Counselors** directory.
2. **Registering New Accounts**:
   - Clicking **"+ Register User Account"** opens the modal dialog.
   - Selecting **"Student"** dynamically hides counselor-only input fields (*Professional Title, Clinical Specializations*) and provisions an instantly usable student account.
   - Selecting **"Counselor"** displays title fields and clinical specialization pickers (*Academic Adjustment, Career Development, Family Counseling, Crisis Intervention*).
3. **Account Moderation**:
   - The Director can toggle user statuses between `Active` and `Inactive`, deactivate compromised accounts, or approve pending student profiles.
4. **User Deletion**:
   - Clicking **"Remove"** on a user record prompts for confirmation.
   - Deleting a counselor safely unbinds their scheduled appointments and active chats without data loss.
   - Deleting a student cascades and permanently purges associated clinical histories, SOAP notes, and assessment records in compliance with DPA right-to-be-forgotten standards.
   - The system prevents self-deletion of the active Director account.

### 4.4 Main Transactions

#### Transaction 1: Mandatory Clinical Intake & Health Disclosure
1. The student navigates to **Wellness Screenings**.
2. Submits the **Medical Disclosure**: captures chronic illnesses (e.g., Asthma, Diabetes, Hypertension), current maintenance medications, and psychiatric treatment history. Data is encrypted using AES-256-GCM.
3. Completes the **Dual Psychological Inventories**:
   - **PHQ-9**: 9 Likert-scale items measuring depressive symptomatology over the preceding two weeks.
   - **GAD-7**: 7 Likert-scale items assessing anxiety and panic indicators.
4. **Crisis Intercept**: If Question 9 of the PHQ-9 is scored > 0, the **Immediate Crisis Intercept Overlay** activates automatically, displaying emergency crisis lines and notifying counselors.
5. The student's `has_completed_intake` flag is set to `1`, unlocking appointment booking.

#### Transaction 2: Counseling Consultation Booking
1. The student navigates to **Schedule Counseling**.
2. Selects **Counseling Focus** (e.g., *Academic Adjustment, Emotional Crisis, Career Guidance, Family Concerns*).
3. Selects **Consultation Mode**: *Face-to-Face (CGCS Room 304)* or *Virtual Teleconsultation (WebRTC)*.
4. The system validates the **14-day booking cadence**, preventing duplicate or overlapping bookings within 2 weeks.
5. Selects an open date and time slot from the counselor assigned to their college cluster.
6. The appointment is saved with status `Pending`.

#### Transaction 3: Counselor Triage & Actioning
1. The assigned counselor reviews the booking in their **Triage Queue**.
2. The counselor executes one of three clinical actions:
   - **Approve**: Confirms the date and time. For virtual sessions, an encrypted WebRTC room token is generated.
   - **Reschedule**: Proposes an alternative date/time slot with an explanation. The appointment enters `Pending Reschedule` status until the student accepts.
   - **Decline**: Rejects the session with a required clinical justification (e.g., student referred to an external clinic).

#### Transaction 4: Clinical Documentation (SOAP Notes)
1. Following a completed session, the counselor opens **"Document Clinical Record (SOAP)"**.
2. Enters structured documentation:
   - **S (Subjective)**: Student's reported complaints, emotional state, and statements.
   - **O (Objective)**: Counselor's behavioral observations, affect, eye contact, and demeanor.
   - **A (Assessment)**: Clinical evaluation, progress check, and diagnostic impressions.
   - **P (Plan)**: Therapeutic interventions, homework, next scheduled follow-up date.
3. The note is cryptographically signed and saved with an immutable foreign key link to the appointment.

#### Transaction 5: Delegated Clinical Access Clearance
1. When a secondary counselor needs to review a student's prior clinical history handled by another RGC:
2. The secondary counselor submits a **Delegated Clinical Data Access Request** specifying a valid reason (e.g., transfer endorsement, crisis coverage).
3. The request appears on the **Director's Review Desk**.
4. The Director clicks **"Approve"** (granting a temporary 24-hour read-only access window) or **"Decline"**.

#### Transaction 6: Faculty Student Referral Oversight
1. Academic faculty submit student behavioral concerns via the Faculty Referral form.
2. The endorsement enters the **Executive Faculty Referral Oversight Desk**.
3. If un-actioned for > 48 hours, the system automatically flags the record with a **Critical Overdue Badge**.
4. The Director can reassign the referral to an on-duty counselor or remove resolved records.

#### Transaction 7: Anonymous CSAT Feedback
1. Following a completed consultation, the student receives a confidential 3-question survey:
   - *Counselor Helpfulness* (1–5 Likert scale)
   - *Empathy & Understanding* (1–5 Likert scale)
   - *Ease of Booking & Telehealth* (1–5 Likert scale)
2. Responses are saved without student user IDs to guarantee total anonymity under RA 10173.

### 4.5 Search Capabilities
* **Appointment Queue Search**: Real-time filtering across appointments by student name, student ID number, counseling category, consultation status, and college.
* **User Directory Search**: Debounced live search across registered students and staff by name, email, or college affiliation.
* **Audit Trail Search**: Filter administrative actions by actor name, action type, and date ranges.

### 4.6 Reports Generation
* **Institutional CHED Accreditation Report (CHED CMO No. 09 s. 2013)**:
  - Generates university-wide student-to-counselor ratios.
  - College caseload distribution tables.
  - Standardized PHQ-9 mental health distress breakdown (*Minimal, Mild, Moderate, High, Severe Concern*).
  - Direct CSV export and clean, scrollbar-free official print document with institutional headers and signature lines.
* **Executive Director Summary Report**:
  - Caseload volume breakdown (Completed, Pending, Cancelled).
  - Unique, deduplicated student registry with portal status and latest mental health severity tiers.
* **Clinical Monitoring Sheet & Student Excuse Slips**:
  - Printable clinic visit slips verifying student attendance for academic professors without exposing confidential clinical SOAP notes.

### 4.7 Logout
* Clicking **"Sign Out"** invalidates the local JWT bearer token, clears `sessionStorage` and `localStorage`, logs an audit trail event (`DPA_AUTH_LOGOUT`), and redirects the browser to the authenticated login portal.

---

# Chapter 5 – Administrator Guide

### 5.1 User Accounts
User accounts in the UMak CGCS System are centrally managed by the Guidance Director. The account schema maintains the following attributes:
* `id`: Unique generated identifier (`USR-STU-...`, `USR-CNS-...`, `USR-DIR-...`).
* `email`: Institutional email strictly validated against `@umak.edu.ph`.
* `password_hash`: Salted bcrypt hash (plaintext passwords are never saved).
* `role`: System authorization role (`student`, `counselor`, `director`, `superadmin`).
* `status`: Account lifecycle state (`Active`, `Pending`, `Inactive`, `Declined`).
* `is_verified`: Boolean verification flag (`1` for verified, `0` for unverified).
* `failed_attempts` & `lock_until`: Automated brute-force prevention markers.

### 5.2 Roles and Permissions Matrix

| Functional Module / Action | Student | Counselor | Director / Super Admin |
| :--- | :---: | :---: | :---: |
| **Complete Medical Intake & PHQ-9/GAD-7** | Full Access | View Assigned | View Anonymized |
| **Log Daily Personal Mood Tracker** | Full Access | No Access | No Access |
| **Book Counseling Consultations** | Full Access | No Access | No Access |
| **Approve / Reschedule / Decline Appointments** | No Access | Full Access | Full Access |
| **Conduct WebRTC Video Teleconsultations** | Room Client | Room Host | Full Access |
| **Author Legal SOAP Clinical Notes** | No Access | Assigned Only | Supervisory Input Only |
| **Request Delegated Access to Other SOAP Notes** | No Access | Request Only | Authorize / Revoke |
| **Submit Faculty Student Endorsements** | No Access | Process Assigned | Reassign / Manage Desk |
| **View Executive Analytics & Distress Charts** | No Access | No Access | Full Access |
| **Create, Moderate & Delete User Accounts** | No Access | No Access | Full Access |
| **Inspect System & DPA Audit Logs** | No Access | No Access | Full Access |
| **Export Official CHED Reports & CSV Data** | No Access | No Access | Full Access |
| **Publish Campus-Wide Wellness Broadcasts** | View Active | View Active | Create / Edit / Delete |

### 5.3 System Configuration
The system is configured through environment variables loaded via `dotenv`:
1. **Port Binding**: Set `PORT=5050` (or customized port) in `.env`.
2. **JWT Secret Management**: Set `JWT_SECRET` to a cryptographically random 64-character string. Rotating this secret immediately revokes all currently active sessions across all devices.
3. **AES-256 Encryption Key**: Set `ENCRYPTION_KEY` in `.env`. This 32-byte key encrypts medical disclosures and emergency contact details. *Never change this key on an existing production database without running a database re-encryption migration script.*
4. **Google Gemini API Key**: Set `GEMINI_API_KEY` to enable HeronCare AI's emotional triage and automatic conversation summarization.
5. **Nodemailer SMTP Configuration**: Configure valid institutional SMTP credentials (`EMAIL_USER`, `EMAIL_PASS`) to enable email verification OTPs and appointment notifications.

### 5.4 Audit Logs (RA 10173 Compliance)
To satisfy the requirements of the National Privacy Commission (NPC) under the Data Privacy Act of 2012:
1. Every administrative action, profile update, clinical clearance approval, account deletion, and login/logout event is written to the `audit_logs` table.
2. Log records capture:
   * `id`: Unique audit record identifier.
   * `actor_name`: Full name of the user performing the transaction.
   * `actor_role`: System role of the user.
   * `action`: Categorical action tag (`DPA_AUTH_LOGIN`, `USER_CREATED`, `SOAP_NOTE_CREATED`, `DELEGATED_ACCESS_GRANTED`, `USER_DELETED`, etc.).
   * `details`: Structured description with Zero-PII sanitization (student names sanitized where legally required).
   * `ip_address`: Originating IPv4/IPv6 address of the request.
   * `timestamp`: High-precision UTC timestamp.
3. The audit log table can be inspected by the Director in the **Audit Logs & DPA 2012 Compliance** tab.

### 5.5 Backup Procedures
Because SQLite is a self-contained, serverless database, complete system state is encapsulated within the `database.sqlite` file. Administrators can perform backups using either of the following standard methods:

#### Method 1: Automated File-Level Snapshot (Cold Backup)
1. Stop the application service or ensure database transactions are momentarily idle:
   ```bash
   # Windows PowerShell Example
   Copy-Item "database.sqlite" -Destination "backups\database_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sqlite"
   ```
   ```bash
   # Linux / macOS Bash Example
   cp database.sqlite backups/database_backup_$(date +%Y%m%d_%H%M%S).sqlite
   ```

#### Method 2: Online SQLite Hot Backup (Zero Downtime)
Using the official SQLite command-line tool, a non-blocking hot backup can be performed while the server is live:
```bash
sqlite3 database.sqlite ".backup 'backups/cgcs_hot_backup.sqlite'"
```
*Recommendation*: Schedule automated daily backups via Windows Task Scheduler or a Linux cron job, storing encrypted copies off-site or on institutional backup volumes.

### 5.6 Restore Procedures
In the event of hardware failure, database corruption, or administrative disaster recovery:

1. **Stop Application Service**:
   Terminate the running Node.js process:
   ```bash
   # Windows PowerShell
   Stop-Process -Name "node" -Force
   ```
   ```bash
   # Linux systemd / pm2
   pm2 stop umak-cgcs
   # or
   sudo systemctl stop umak-cgcs
   ```
2. **Quarantine Damaged Database**:
   Rename the current `database.sqlite` file to preserve diagnostic evidence:
   ```bash
   mv database.sqlite database_corrupted.sqlite
   ```
3. **Deploy Verified Backup File**:
   Copy the latest verified backup file into the application root folder and rename it to `database.sqlite`:
   ```bash
   cp backups/database_backup_YYYYMMDD_HHMMSS.sqlite database.sqlite
   ```
4. **Integrity Check**:
   Verify database consistency using the SQLite CLI:
   ```bash
   sqlite3 database.sqlite "PRAGMA integrity_check;"
   ```
   The output must return `ok`.
5. **Restart Application Service**:
   Start the Node.js application:
   ```bash
   npm start
   # or
   pm2 start umak-cgcs
   ```
   The startup self-healing routines will automatically check schema integrity, restore future appointments, and resume normal institutional guidance operations.
