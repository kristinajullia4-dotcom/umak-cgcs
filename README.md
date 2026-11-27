# University of Makati — Center for Guidance & Counseling Services (CGCS) Enterprise Portal

An enterprise Guidance and Counseling Management System developed for the University of Makati (UMak). Built with Role-Based Access Control (RBAC), standardized psychological assessments (PHQ-9, GAD-7), automated scheduling, clinical SOAP case management, and HeronCare AI student wellness companion.

---

## 🌟 Key Features

1. **Role-Based Access Control (RBAC):**
   - **Student Portal:** Book counseling sessions, take PHQ-9 & GAD-7 screenings, access confidential resources, and chat with HeronCare AI.
   - **Counselor Desk:** Manage appointment queues, conduct 1-on-1 sessions, log clinical SOAP notes, manage case closures, and track caseloads.
   - **Directorate / Executive Portal:** Institutional CHED CMO compliance metrics, executive reporting, counselor duty rosters, user and role governance, and audit trails.

2. **HeronCare 24/7 AI Student Companion:**
   - Powered by Google Gemini Flash-Lite.
   - Conversational, warm, empathetic Taglish support adhering strictly to Guidance & Counseling ethics.
   - Integrated deterministic safety sentry for crisis detection and emergency escalation.

3. **Standardized Clinical Assessments:**
   - Automatic severity calculation for PHQ-9 (Depression) and GAD-7 (Anxiety).
   - High-distress automated priority flagging and alerts for guidance counselors.

4. **Compliance & Security:**
   - **RA 10173 (Data Privacy Act of 2012):** Zero-PII anonymized audit logging, end-to-end access governance.
   - **RA 9258 (Guidance and Counseling Act):** Standardized clinical confidentiality and SOAP record protocols.
   - **CHED CMO No. 09 s. 2013:** Automated institutional student-to-counselor ratio reporting and accreditation compliance.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite3 (Self-seeding on initial setup)
- **AI / LLM:** `@google/generative-ai` (Gemini Flash-Lite API)
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Adaptive Dark/Light Mode)
- **Authentication:** JWT (JSON Web Tokens) with HttpOnly sessions & bcryptjs password hashing
- **Mailing:** Nodemailer (Gmail SMTP integration)

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### 2. Installation & Quick Start

Clone this repository:
```bash
git clone https://github.com/kristinajullia4-dotcom/umak-cgcs.git
cd umak-cgcs/umak-cgcs_UPDATEDFILE
```

Install dependencies:
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file inside `umak-cgcs_UPDATEDFILE` (you can copy `.env.example`):
```bash
cp .env.example .env
```

Configure your environment variables inside `.env`:
```env
PORT=5050
JWT_SECRET=umak_cgcs_enterprise_secret_2026_supersecure_key
GEMINI_API_KEY=your_gemini_api_key_here
SMTP_USER=your_email@umak.edu.ph
SMTP_PASS=your_gmail_app_password
```

### 4. Running the Application
Start the server:
```bash
npm start
```
The application will automatically initialize the database schema, seed initial administrative accounts, and start listening at:
👉 **http://localhost:5050**

---

## 🔐 Default Demo Accounts

| Role | Email / Login ID | Default Password |
|---|---|---|
| **Director** | `director@umak.edu.ph` | `Director@123` |
| **Counselor** | `counselor@umak.edu.ph` | `Counselor@123` |
| **Student** | `student@umak.edu.ph` | `Student@123` |

---

## 📄 License
This project is developed for the University of Makati Center for Guidance and Counseling Services (CGCS). All rights reserved.
