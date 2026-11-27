/**
 * UMak CGCS (Center for Guidance and Counseling Services)
 * Enterprise Production Application Controller
 * Strict Role-Based Access Control (RBAC), Triage & Profile Management
 */

// Global Application State
const state = {
  authToken: localStorage.getItem('umak_cgcs_token') || null,
  currentUser: null,
  activeTab: 'student-overview',
  adminSubTab: 'counselors',
  appointments: [],
  assessments: [],
  moodLogs: [],
  notifications: [],
  adminCounselors: [],
  adminStudents: [],
  auditLogs: [],
  broadcasts: [],
  counselorSchedules: [],
  workload: [],
  crisisData: { flaggedAssessments: [], crisisNotifications: [] },
  charts: {},
  heronChatHistory: [],
  activeSession: null,
  // Video Room State
  video: {
    micOn: true,
    camOn: true,
    screenShareOn: false,
    sessionTimer: null,
    secondsElapsed: 0
  }
};

// =========================================================
// OFFICIAL UMAK ACADEMIC UNITS HELPER & SELECT POPULATOR
// =========================================================
window.UMAK_COLLEGES_AND_INSTITUTES = {
  colleges: [
    { code: 'CBFS', name: 'College of Business and Financial Science (CBFS)' },
    { code: 'CCIS', name: 'College of Computing and Information Sciences (CCIS)' },
    { code: 'CCSE', name: 'College of Construction Sciences and Engineering (CCSE)' },
    { code: 'CCAPS', name: 'College of Continuing, Advanced and Professional Studies (CCAPS)' },
    { code: 'CET', name: 'College of Engineering Technology (CET)' },
    { code: 'CGPP', name: 'College of Governance and Public Policy (CGPP)' },
    { code: 'CHK', name: 'College of Human Kinetics (CHK)' },
    { code: 'CITE', name: 'College of Innovative Teacher Education (CITE)' },
    { code: 'CLAS', name: 'College of Liberal Arts and Sciences (CLAS)' },
    { code: 'COS', name: 'College of Science (COS)' },
    { code: 'CTHM', name: 'College of Tourism and Hospitality Management (CTHM)' },
    { code: 'SOL', name: 'School of Law (SOL)' }
  ],
  institutes: [
    { code: 'IOA', name: 'Institute of Accountancy (IOA)' },
    { code: 'IAD', name: 'Institute of Arts and Design (IAD)' },
    { code: 'IDEM', name: 'Institute for Disaster and Emergency Management (IDEM)' },
    { code: 'IIHS', name: 'Institute of Imaging Health Science (IIHS)' },
    { code: 'ION', name: 'Institute of Nursing (ION)' },
    { code: 'IOP', name: 'Institute of Pharmacy (IOP)' },
    { code: 'HSU', name: 'Higher School ng UMak (HSU)' }
  ]
};

window.renderCollegeSelectOptions = function(includeAllOption = true, selectedValue = '') {
  let html = includeAllOption ? '<option value="">All Colleges & Institutes</option>' : '<option value="">Select College / Institute</option>';
  
  html += '<optgroup label="Colleges and Schools">';
  window.UMAK_COLLEGES_AND_INSTITUTES.colleges.forEach(c => {
    const isSel = selectedValue === c.code ? 'selected' : '';
    html += `<option value="${c.code}" ${isSel}>${c.code} - ${c.name}</option>`;
  });
  html += '</optgroup>';

  html += '<optgroup label="Institutes & Specialized Units">';
  window.UMAK_COLLEGES_AND_INSTITUTES.institutes.forEach(i => {
    const isSel = selectedValue === i.code ? 'selected' : '';
    html += `<option value="${i.code}" ${isSel}>${i.code} - ${i.name}</option>`;
  });
  html += '</optgroup>';

  return html;
};

function populateAllCollegeDropdowns() {
  const collegeSelectIds = [
    'collegeFilter',
    'studentCollegeFilter',
    'adminCollegeFilter',
    'counselorCollegeFilter',
    'counselorApptCollegeFilter',
    'regCollegeSelect',
    'profileCollegeSelect',
    'directorCollegeSelect',
    'directorCollegeSelectStudent',
    'filterQueueCollege',
    'signUpCollege',
    'editProfileCollege'
  ];

  collegeSelectIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const currentVal = el.value;
      const isFilter = !id.toLowerCase().includes('reg') && !id.toLowerCase().includes('profile') && !id.toLowerCase().includes('signup');
      el.innerHTML = window.renderCollegeSelectOptions(isFilter, currentVal);
      if (currentVal && currentVal !== 'ALL' && currentVal !== 'all') {
        el.value = currentVal;
      }
      el.classList.add('college-filter-select');
    }
  });
}
window.populateAllCollegeDropdowns = populateAllCollegeDropdowns;

// Run immediately on script load
populateAllCollegeDropdowns();

// ====================================================
// INITIALIZATION & SESSION GUARD
// ====================================================
document.addEventListener('DOMContentLoaded', async () => {
  // ==========================================================================
  // DYNAMIC THEME-AWARE MODAL ENFORCER (LIGHT & DARK ADAPTIVE, ZERO TRANSPARENCY)
  // ==========================================================================
  document.addEventListener('show.bs.modal', function (event) {
    const modal = event.target;
    if (!modal) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light' || 
                    document.body.classList.contains('light-theme') ||
                    localStorage.getItem('umak_theme') === 'light';

    const isHardwareModal = modal.id === 'modalHardwareCheck';
    const isExcuseModal = modal.id === 'modalExcuseSlip';
    const forceLightModal = isHardwareModal || isExcuseModal;
    
    // Surface background selection
    const solidBg = (isLight || forceLightModal) ? '#ffffff' : '#0b1329';
    const cardBg  = (isLight || forceLightModal) ? '#f8fafc' : '#111e38';
    const textColor = (isLight || forceLightModal) ? '#0f172a' : '#f8fafc';
    const borderColor = (isLight || forceLightModal) ? '#e2e8f0' : 'rgba(255, 255, 255, 0.16)';

    modal.style.setProperty('background-color', 'transparent', 'important');

    const dialog = modal.querySelector('.modal-dialog');
    if (dialog) {
      dialog.style.setProperty('max-height', '92vh', 'important');
      dialog.style.setProperty('display', 'flex', 'important');
      dialog.style.setProperty('flex-direction', 'column', 'important');
    }

    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.setProperty('background', solidBg, 'important');
      content.style.setProperty('background-color', solidBg, 'important');
      content.style.setProperty('color', textColor, 'important');
      content.style.setProperty('opacity', '1', 'important');
      content.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      content.style.setProperty('backdrop-filter', 'none', 'important');
      content.style.setProperty('border', `1px solid ${borderColor}`, 'important');

      const header = content.querySelector('.modal-header');
      if (header) {
        header.style.setProperty('background-color', solidBg, 'important');
        header.style.setProperty('border-color', borderColor, 'important');
      }

      const body = content.querySelector('.modal-body');
      if (body) {
        body.style.setProperty('background-color', solidBg, 'important');
        body.style.setProperty('color', textColor, 'important');
        body.style.setProperty('overflow-y', 'auto', 'important');
        body.style.setProperty('max-height', 'calc(88vh - 130px)', 'important');
      }

      const footer = content.querySelector('.modal-footer');
      if (footer) {
        footer.style.setProperty('background-color', solidBg, 'important');
        footer.style.setProperty('border-color', borderColor, 'important');
      }

      // Adapt inner cards and containers
      const innerCards = content.querySelectorAll('.card, .step-card, .intake-step-card, [class*="step-"], .scale-question-container > div, .rounded-3.border, .rounded-4.border, .intake-q-card, .intake-banner-box, .intake-step-wrapper, .intake-step2-wrapper, .intake-scale-bar');
      innerCards.forEach(c => {
        c.style.setProperty('background-color', cardBg, 'important');
        c.style.setProperty('border-color', borderColor, 'important');
        c.style.setProperty('color', textColor, 'important');
      });

      // Adapt labels and titles for high contrast
      const labels = content.querySelectorAll('.intake-field-label, .intake-field-label span, .intake-q-title, .intake-step2-title, .intake-step2-desc');
      labels.forEach(lbl => {
        if (lbl.classList.contains('intake-step2-desc')) {
          lbl.style.setProperty('color', (isLight || isHardwareModal) ? '#475569' : '#94a3b8', 'important');
        } else if (lbl.classList.contains('intake-step2-title') || lbl.classList.contains('intake-q-title')) {
          lbl.style.setProperty('color', (isLight || isHardwareModal) ? '#0b1329' : '#f59e0b', 'important');
        } else {
          lbl.style.setProperty('color', (isLight || isHardwareModal) ? '#0f172a' : '#f8fafc', 'important');
        }
      });

      // Adapt inputs in body
      const inputs = content.querySelectorAll('input.form-control, textarea.form-control, select.form-select, .intake-styled-input');
      inputs.forEach(inp => {
        inp.style.setProperty('background-color', (isLight || isHardwareModal) ? '#ffffff' : '#0b1329', 'important');
        inp.style.setProperty('color', (isLight || isHardwareModal) ? '#0f172a' : '#ffffff', 'important');
        inp.style.setProperty('border-color', borderColor, 'important');
      });
    }
  });

  try { initTheme(); } catch (e) { console.error('Theme init error:', e); }
  try { initClock(); } catch (e) { console.error('Clock init error:', e); }
  try { populateAllCollegeDropdowns(); } catch (e) { console.error('College dropdowns init error:', e); }
  try { initAuthFormHandlers(); } catch (e) { console.error('Auth handlers init error:', e); }
  try { initModals(); } catch (e) { console.error('Modals init error:', e); }
  try { initStudentBookingForm(); } catch (e) { console.error('Booking form init error:', e); }
  try { initChatbot(); } catch (e) { console.error('Chatbot init error:', e); }
  try { initVideoRoomControls(); } catch (e) { console.error('Video room init error:', e); }
  try { initMoodTracker(); } catch (e) { console.error('Mood tracker init error:', e); }
  try { initBroadcasts(); } catch (e) { console.error('Broadcasts init error:', e); }
  try { initWorkloadManager(); } catch (e) { console.error('Workload manager init error:', e); }
  try { initTriageWorkflowModals(); } catch (e) { console.error('Triage modals init error:', e); }
  try { initCounselorScheduleForm(); } catch (e) { console.error('Schedule form init error:', e); }
  try { initEditProfileForm(); } catch (e) { console.error('Profile form init error:', e); }
  try { initCounselorAppointmentFilters(); } catch (e) { console.error('Appointment filters init error:', e); }
  try { initIntakeFormHandler(); } catch (e) { console.error('Intake form handler init error:', e); }
  try { checkCookieConsent(); } catch (e) { console.error('Cookie consent check error:', e); }
  try { initKeyboardAccessibility(); } catch (e) { console.error('Keyboard accessibility error:', e); }
  try { initQueueSearchAndFilters(); } catch (e) { console.error('Queue search/filters error:', e); }

  // Clean up any residual accessibility contrast or scaling preferences
  try {
    localStorage.removeItem('cgcs_high_contrast');
    localStorage.removeItem('cgcs_text_scale');
    document.documentElement.removeAttribute('data-contrast');
    document.documentElement.removeAttribute('data-text-scale');
  } catch (e) {}

  // Check Authenticated Session
  if (state.authToken) {
    try {
      await validateSession();
    } catch (err) {
      console.error('Session validation error:', err);
      showAuthLanding();
    }
  } else {
    showAuthLanding();
  }
});

// ====================================================
// COOKIE & LOCAL STORAGE COMPLIANCE BANNER
// ====================================================

function checkCookieConsent() {
  const accepted = localStorage.getItem('cgcs_consent_accepted');
  const banner = document.getElementById('cookieConsentBanner');
  if (!banner) return;
  if (accepted === 'true') {
    banner.classList.add('hidden');
    banner.style.display = 'none';
  } else {
    banner.classList.remove('hidden');
    banner.style.display = 'flex';
  }
}

window.acceptCookieConsent = function() {
  localStorage.setItem('cgcs_consent_accepted', 'true');
  const banner = document.getElementById('cookieConsentBanner');
  if (banner) {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      banner.classList.add('hidden');
      banner.style.display = 'none';
    }, 300);
  }
  if (typeof showToast === 'function') showToast('Local storage acknowledgment recorded.', 'info');
};

// ====================================================
// LEGAL MODALS (PRIVACY POLICY & TERMS OF SERVICE)
// ====================================================

window.openPrivacyPolicyModal = function() {
  const modal = document.getElementById('modalPrivacyPolicy');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    setupFocusTrap(modal);
  }
};

window.closePrivacyPolicyModal = function() {
  const modal = document.getElementById('modalPrivacyPolicy');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
    releaseFocusTrap(modal);
  }
};

window.openTermsOfServiceModal = function() {
  const modal = document.getElementById('modalTermsOfService');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    setupFocusTrap(modal);
  }
};

window.closeTermsOfServiceModal = function() {
  const modal = document.getElementById('modalTermsOfService');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
    releaseFocusTrap(modal);
  }
};

// ====================================================
// KEYBOARD ACCESSIBILITY & FOCUS TRAPS (WCAG 2.1 AA)
// ====================================================

let previousActiveElement = null;

function setupFocusTrap(modalEl) {
  if (!modalEl) return;
  previousActiveElement = document.activeElement;

  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusables = Array.from(modalEl.querySelectorAll(focusableSelector)).filter(el => !el.disabled && el.offsetParent !== null);
  
  if (focusables.length > 0) {
    focusables[0].focus();
  }

  const keyHandler = function(e) {
    if (e.key === 'Tab') {
      const activeElements = Array.from(modalEl.querySelectorAll(focusableSelector)).filter(el => !el.disabled && el.offsetParent !== null);
      if (activeElements.length === 0) return;
      const first = activeElements[0];
      const last = activeElements[activeElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  modalEl._focusTrapHandler = keyHandler;
  modalEl.addEventListener('keydown', keyHandler);
}

function releaseFocusTrap(modalEl) {
  if (!modalEl) return;
  if (modalEl._focusTrapHandler) {
    modalEl.removeEventListener('keydown', modalEl._focusTrapHandler);
    delete modalEl._focusTrapHandler;
  }
  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    try { previousActiveElement.focus(); } catch (e) {}
  }
}

function initKeyboardAccessibility() {
  // Global Escape key listener to dismiss open dialogs and modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      // 1. Legal modals
      const privacyModal = document.getElementById('modalPrivacyPolicy');
      if (privacyModal && privacyModal.style.display === 'flex') {
        closePrivacyPolicyModal();
        return;
      }
      const termsModal = document.getElementById('modalTermsOfService');
      if (termsModal && termsModal.style.display === 'flex') {
        closeTermsOfServiceModal();
        return;
      }
      // 2. Video Room modal
      const videoModal = document.getElementById('modalVideoRoom');
      if (videoModal && videoModal.style.display === 'flex') {
        if (window.closeVideoRoomModal) window.closeVideoRoomModal();
        return;
      }
      // 3. Assessment modal
      const asmModal = document.getElementById('modalAssessment');
      if (asmModal && (asmModal.classList.contains('active') || asmModal.style.display === 'flex')) {
        asmModal.classList.remove('active');
        asmModal.style.display = 'none';
        return;
      }
      // 4. Reschedule modal
      const reschedModal = document.getElementById('modalReschedule');
      if (reschedModal && (reschedModal.classList.contains('active') || reschedModal.style.display === 'flex')) {
        reschedModal.classList.remove('active');
        reschedModal.style.display = 'none';
        return;
      }
      // 5. Intake modal
      const intakeModal = document.getElementById('modalStudentIntake') || document.getElementById('modalIntakeScreening');
      if (intakeModal && (intakeModal.style.display === 'flex' || intakeModal.classList.contains('active') || intakeModal.classList.contains('show'))) {
        intakeModal.style.display = 'none';
        intakeModal.classList.remove('active', 'show');
        return;
      }
      // 6. Generic active backdrop
      const openModal = document.querySelector('.modal-backdrop.active, .modal-backdrop[style*="display: flex"]');
      if (openModal) {
        openModal.classList.remove('active');
        openModal.style.display = 'none';
      }
    }
  });
}

// ====================================================
// GLOBAL LIGHT / DARK THEME SYSTEM
// ====================================================
function updateThemeToggleUI(currentTheme) {
  // Select all theme toggle buttons across the app (login page, student portal, counselor portal, etc.)
  const themeToggleBtns = document.querySelectorAll('#btnToggleTheme, .btn-theme-toggle, [onclick*="toggleTheme"]');
  themeToggleBtns.forEach(btn => {
    if (currentTheme === 'dark') {
      // In dark mode: indicate action to switch to light mode
      btn.innerHTML = `<i class="fa-solid fa-sun" style="color: #f59e0b; margin-right: 6px;"></i> Switch to Light Mode`;
      btn.setAttribute('title', 'Switch to Light Mode');
      btn.setAttribute('aria-label', 'Switch to Light Mode');
    } else {
      // In light mode: indicate action to switch to dark mode
      btn.innerHTML = `<i class="fa-solid fa-moon" style="color: #6366f1; margin-right: 6px;"></i> Switch to Dark Mode`;
      btn.setAttribute('title', 'Switch to Dark Mode');
      btn.setAttribute('aria-label', 'Switch to Dark Mode');
    }
  });
}
window.updateThemeToggleUI = updateThemeToggleUI;

function updateThemeIcons(theme) {
  updateThemeToggleUI(theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('umak_cgcs_theme') || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode', 'dark-theme');
    document.body.classList.remove('light-mode', 'light-theme');
  } else {
    document.body.classList.remove('dark-mode', 'dark-theme');
    document.body.classList.add('light-mode', 'light-theme');
  }
  updateThemeIcons(savedTheme);
  updateThemeToggleUI(savedTheme);
  if (typeof syncCounselorChatTheme === 'function') {
    syncCounselorChatTheme();
  }
}

window.toggleTheme = function () {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  if (newTheme === 'dark') {
    document.body.classList.add('dark-mode', 'dark-theme');
    document.body.classList.remove('light-mode', 'light-theme');
  } else {
    document.body.classList.remove('dark-mode', 'dark-theme');
    document.body.classList.add('light-mode', 'light-theme');
  }
  localStorage.setItem('umak_cgcs_theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcons(newTheme);
  updateThemeToggleUI(newTheme);

  // Sync Counselor Live Chat if currently open
  if (typeof syncCounselorChatTheme === 'function') {
    syncCounselorChatTheme();
  }

  // If charts exist, re-render with appropriate colors
  if (state && state.activeTab === 'admin-analytics' && typeof renderInstitutionalAnalytics === 'function') {
    renderInstitutionalAnalytics();
  } else if (state && state.activeTab === 'student-overview' && typeof fetchMoodHistory === 'function') {
    fetchMoodHistory();
  }

  showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
};

// Real-Time Header Clock
function initClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }
  update();
  setInterval(update, 1000);
}

// High-Visibility Toast Notifications (Directly on document.body, z-index: 1000000)
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container') || document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container); // Must be on document.body!
  } else if (container.parentElement !== document.body) {
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast-notification toast toast-${type}`;

  const icon = type === 'success' ? 'fa-circle-check'
             : type === 'warning' ? 'fa-triangle-exclamation'
             : type === 'error'   ? 'fa-circle-xmark'
             : 'fa-circle-info';
  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="font-size: 18px; flex-shrink: 0;"></i>
    <div style="flex: 1;">${message}</div>
    <button type="button" style="background:none; border:none; color:inherit; opacity:0.7; cursor:pointer; font-size:16px;" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  // Auto remove after 4.5 seconds
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}
window.showToast = showToast;

// Authenticated Fetch Helper
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

// ====================================================
// 1. AUTHENTICATION & VIEW ISOLATION CONTROLLER
// ====================================================

window.switchAuthTab = function (tab) {
  const btnSignIn = document.getElementById('btnTabSignIn');
  const btnSignUp = document.getElementById('btnTabSignUp') || document.getElementById('signUpTabBtn');
  const formSignIn = document.getElementById('formSignIn');
  const formSignUp = document.getElementById('formSignUp') || document.getElementById('registerForm');
  const loginFormContainer = document.getElementById('loginFormContainer');
  const forgotOtpContainer = document.getElementById('forgotOtpContainer');
  const forgotPasswordFieldsContainer = document.getElementById('forgotPasswordFieldsContainer');

  if (tab === 'signin') {
    btnSignIn?.classList.add('active');
    btnSignUp?.classList.remove('active');
    if (loginFormContainer) loginFormContainer.classList.remove('hidden');
    if (forgotOtpContainer) forgotOtpContainer.classList.add('hidden');
    if (forgotPasswordFieldsContainer) forgotPasswordFieldsContainer.classList.add('hidden');
    if (formSignIn) {
      formSignIn.classList.remove('hidden');
      formSignIn.classList.add('active');
      formSignIn.style.display = 'block';
    }
    if (formSignUp) {
      formSignUp.classList.add('hidden');
      formSignUp.classList.remove('active');
      formSignUp.style.display = 'none';
    }
  } else {
    btnSignUp?.classList.add('active');
    btnSignIn?.classList.remove('active');
    if (loginFormContainer) loginFormContainer.classList.add('hidden');
    if (forgotOtpContainer) forgotOtpContainer.classList.add('hidden');
    if (forgotPasswordFieldsContainer) forgotPasswordFieldsContainer.classList.add('hidden');
    if (formSignUp) {
      formSignUp.classList.remove('hidden');
      formSignUp.classList.add('active');
      formSignUp.style.display = 'block';
    }
    if (formSignIn) {
      formSignIn.classList.add('hidden');
      formSignIn.classList.remove('active');
      formSignIn.style.display = 'none';
    }
  }
};

// Account Lockout State & Interval
let lockoutCountdownInterval = null;

function triggerAccountLockout(seconds = 900) {
  clearInterval(lockoutCountdownInterval);
  let remaining = seconds > 0 ? seconds : 900;

  const noticeBox = document.getElementById('signInLockoutNotice');
  const inlineTimer = document.getElementById('lockoutTimerInline');
  const modalTimer = document.getElementById('lockoutModalCountdown');
  const attemptsLabel = document.getElementById('signInAttemptsRemaining');

  if (noticeBox) noticeBox.classList.remove('hidden');
  if (attemptsLabel) attemptsLabel.classList.add('hidden');

  function update() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (inlineTimer) inlineTimer.textContent = formatted;
    if (modalTimer) modalTimer.textContent = formatted;
  }

  update();
  openModal('modalAccountLockout');

  lockoutCountdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(lockoutCountdownInterval);
      if (noticeBox) noticeBox.classList.add('hidden');
      closeModal('modalAccountLockout');
      showToast('Lockout security cooldown expired. You may attempt to sign in again.', 'info');
    } else {
      update();
    }
  }, 1000);
}

// ====================================================
// UNIVERSAL PASSWORD VISIBILITY TOGGLE HELPER
// ====================================================

window.togglePasswordVisibility = function(inputId, btnElement) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  const eyeOpenIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 hover:text-amber-400 transition-colors pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  `;

  const eyeSlashIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-400 transition-colors pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  `;

  const btn = btnElement || (window.event && window.event.target ? window.event.target.closest('button') : null);
  if (btn) {
    btn.innerHTML = isPassword ? eyeSlashIcon : eyeOpenIcon;
    btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  }
};

// ====================================================
// FORGOT PASSWORD ONE-CLICK & IN-CARD TRANSITIONS
// ====================================================

window.handleForgotPasswordClick = async function(e) {
  if (e) e.preventDefault();
  const loginEmailInput = document.getElementById('loginIdentifier') || document.getElementById('signInIdentifier') || document.getElementById('email') || document.querySelector('input[type="email"]');
  const email = loginEmailInput ? loginEmailInput.value.trim() : '';

  if (!email) {
    alert("Please type your UMak email or Student ID first before clicking Forgot Password.");
    if (loginEmailInput) loginEmailInput.focus();
    return;
  }

  // Switch login card directly to Step 2 (Masked OTP)
  const loginContainer = document.getElementById('loginFormContainer');
  const otpContainer = document.getElementById('forgotOtpContainer');
  if (loginContainer) loginContainer.classList.add('hidden');
  if (otpContainer) otpContainer.classList.remove('hidden');

  // Show sending status indicator
  const otpPromptText = document.getElementById('otpPromptText');
  if (otpPromptText) otpPromptText.textContent = `Sending 6-digit verification code to ${email}...`;

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok) {
      window.currentResetEmail = email;
      if (otpPromptText) otpPromptText.textContent = `Enter the 6-digit code sent to ${email}:`;
    } else {
      alert(data.error || "Could not find account. Please check your email.");
      // Revert back to login card if failed
      if (loginContainer) loginContainer.classList.remove('hidden');
      if (otpContainer) otpContainer.classList.add('hidden');
    }
  } catch (err) {
    alert("Failed to connect to server. Check terminal.");
    if (loginContainer) loginContainer.classList.remove('hidden');
    if (otpContainer) otpContainer.classList.add('hidden');
  }
};

window.toggleOtpDisplay = function() {
  const inp = document.getElementById('resetOtpInput');
  const btn = (window.event && window.event.target) || document.querySelector('#forgotOtpContainer button[onclick*="toggleOtpDisplay"]');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btn) btn.textContent = 'Hide';
  } else {
    inp.type = 'password';
    if (btn) btn.textContent = 'Show';
  }
};

window.cancelResetFlow = function() {
  const otpInp = document.getElementById('resetOtpInput');
  if (otpInp) otpInp.value = '';
  const p1 = document.getElementById('newResetPassword');
  if (p1) p1.value = '';
  const p2 = document.getElementById('confirmResetPassword');
  if (p2) p2.value = '';
  const err = document.getElementById('resetMatchError');
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }
  const otpContainer = document.getElementById('forgotOtpContainer');
  const passContainer = document.getElementById('forgotPasswordFieldsContainer');
  const loginContainer = document.getElementById('loginFormContainer');
  if (otpContainer) otpContainer.classList.add('hidden');
  if (passContainer) passContainer.classList.add('hidden');
  if (loginContainer) loginContainer.classList.remove('hidden');
};

window.handleVerifyResetOtp = async function() {
  const otp = document.getElementById('resetOtpInput')?.value.trim();
  if (!otp || otp.length !== 6) {
    alert("Please enter the complete 6-digit code.");
    return;
  }

  try {
    const res = await fetch('/api/auth/verify-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: window.currentResetEmail, otp })
    });
    const data = await res.json();
    if (res.ok) {
      window.currentResetOtp = otp;
      document.getElementById('forgotOtpContainer')?.classList.add('hidden');
      document.getElementById('forgotPasswordFieldsContainer')?.classList.remove('hidden');
    } else {
      alert(data.error || "Invalid verification code.");
    }
  } catch (err) {
    alert("Error checking code.");
  }
};

window.handleCompleteReset = async function() {
  const p1 = document.getElementById('newResetPassword')?.value || '';
  const p2 = document.getElementById('confirmResetPassword')?.value || '';
  const err = document.getElementById('resetMatchError');

  if (!p1 || p1.length < 8) {
    if (err) {
      err.textContent = "Password must be at least 8 characters.";
      err.classList.remove('hidden');
    }
    return;
  }
  if (p1 !== p2) {
    if (err) {
      err.textContent = "Passwords do not match.";
      err.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: window.currentResetEmail,
        otp: window.currentResetOtp,
        newPassword: p1
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert("Password reset successfully! You can now log in.");
      cancelResetFlow();
      const signPass = document.getElementById('signInPassword');
      if (signPass) signPass.value = p1;
    } else {
      if (err) {
        err.textContent = data.error || "Failed to update password.";
        err.classList.remove('hidden');
      }
    }
  } catch (e) {
    if (err) {
      err.textContent = "Network error.";
      err.classList.remove('hidden');
    }
  }
};

window.openForgotPasswordModal = function () {
  window.openForgotModal();
};

window.closeForgotPasswordModal = function () {
  window.closeForgotModal();
};

window.backToForgotStep1 = function () {
  window.openForgotModal();
};

window.unlockViaForgotPassword = function () {
  if (typeof closeModal === 'function') closeModal('modalAccountLockout');
  window.openForgotModal();
};

function initAuthFormHandlers() {
  // 1. Sign In Form with Dual Identifier & Lockout Interception
  const formSignIn = document.getElementById('formSignIn');
  formSignIn?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('signInIdentifier').value.trim();
    const password = document.getElementById('signInPassword').value.trim();
    const attemptsLabel = document.getElementById('signInAttemptsRemaining');

    if (!identifier || !password) {
      showToast('Please enter your UMak email / Student ID and password.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();

      if (res.status === 423 || data.locked) {
        // Account Locked (HTTP 423)
        triggerAccountLockout(data.remainingSeconds || 900);
        showToast(data.message || 'Account is locked. Try again later or reset password.', 'error');
        return;
      }

      if (data.success) {
        clearInterval(lockoutCountdownInterval);
        document.getElementById('signInLockoutNotice')?.classList.add('hidden');
        if (attemptsLabel) attemptsLabel.classList.add('hidden');

        handleSuccessfulLogin(data.token, data.user);
        showToast(data.message || `Welcome back, ${data.user.name}!`, 'success');
      } else {
        if (data.attemptsRemaining !== undefined && attemptsLabel) {
          attemptsLabel.classList.remove('hidden');
          attemptsLabel.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Invalid password. <strong>${data.attemptsRemaining} attempt(s) remaining</strong> before 15-min account lockout.`;
        }
        showToast(data.message || 'Sign in failed. Check your credentials.', 'error');
      }
    } catch (err) {
      showToast('Authentication network error. Please try again.', 'error');
    }
  });

  // 2. Forgot Password Request Step
  const formForgotRequest = document.getElementById('formForgotRequestStep');
  formForgotRequest?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('forgotIdentifier')?.value.trim();
    if (!identifier) {
      showToast('Please enter your Email or Student/Employee ID.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitForgotRequest');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('formForgotRequestStep')?.classList.add('hidden');
        document.getElementById('formForgotResetStep')?.classList.remove('hidden');

        const noticeText = document.getElementById('resetCodeNoticeText');
        if (noticeText) {
          noticeText.innerHTML = `Verification code sent to <strong>${data.maskedEmail || identifier}</strong>. Valid for 10 minutes.${data.code ? ` (Code: <strong>${data.code}</strong>)` : ''}`;
        }
        const tokenInput = document.getElementById('resetTokenInput');
        if (tokenInput && data.code) {
          tokenInput.value = data.code;
        }
      } else {
        showToast(data.message || 'Could not find an account with this identifier.', 'error');
      }
    } catch (err) {
      showToast('Network error requesting recovery code.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // 3. Password Complexity Real-Time Validator
  const newPassInput = document.getElementById('resetNewPassword');
  newPassInput?.addEventListener('input', () => {
    const val = newPassInput.value;
    const ruleLen = document.getElementById('ruleLength');
    const ruleUp = document.getElementById('ruleUpper');
    const ruleLow = document.getElementById('ruleLower');
    const ruleNum = document.getElementById('ruleNumber');
    const ruleSpec = document.getElementById('ruleSpecial');

    const hasLen = val.length >= 8;
    const hasUp = /[A-Z]/.test(val);
    const hasLow = /[a-z]/.test(val);
    const hasNum = /\d/.test(val);
    const hasSpec = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val);

    function updateRule(el, isValid, text) {
      if (!el) return;
      el.className = isValid ? 'text-green' : 'text-danger';
      el.innerHTML = `<i class="fa-solid fa-circle-${isValid ? 'check' : 'xmark'}"></i> ${text}`;
    }

    updateRule(ruleLen, hasLen, 'At least 8 characters');
    updateRule(ruleUp, hasUp, 'At least 1 uppercase letter');
    updateRule(ruleLow, hasLow, 'At least 1 lowercase letter');
    updateRule(ruleNum, hasNum, 'At least 1 number (0-9)');
    updateRule(ruleSpec, hasSpec, 'At least 1 special character (!@#$%^&*)');
  });

  // 4. Reset Password Submission
  const formForgotReset = document.getElementById('formForgotResetStep');
  formForgotReset?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('forgotIdentifier')?.value.trim();
    const token = document.getElementById('resetTokenInput')?.value.trim();
    const newPassword = document.getElementById('resetNewPassword')?.value;
    const confirmPassword = document.getElementById('resetConfirmPassword')?.value;
    const mismatchNotice = document.getElementById('resetPasswordMismatch');

    if (newPassword !== confirmPassword) {
      if (mismatchNotice) mismatchNotice.classList.remove('hidden');
      showToast('Passwords do not match. Please verify.', 'error');
      return;
    } else {
      if (mismatchNotice) mismatchNotice.classList.add('hidden');
    }

    // Complexity check
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!complexityRegex.test(newPassword)) {
      showToast('Password does not meet the 8+ character complexity rules.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitResetPassword');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, token, newPassword })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Password reset successfully! You can now sign in.', 'success');
        closeModal('modalForgotPassword');
        closeModal('modalAccountLockout');
        clearInterval(lockoutCountdownInterval);
        document.getElementById('signInLockoutNotice')?.classList.add('hidden');

        // Autofill sign-in fields
        const signIdent = document.getElementById('signInIdentifier');
        const signPass = document.getElementById('signInPassword');
        if (signIdent && identifier) signIdent.value = identifier;
        if (signPass) signPass.value = newPassword;
      } else {
        showToast(data.message || 'Password reset failed. Please check the code.', 'error');
      }
    } catch (err) {
      showToast('Network error resetting password.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Global Sign-Up Handler - Supports both onsubmit="handleRegisterSubmit(event)", onclick, and EventListeners
  window.handleUserSignUp = async function (event) {
    console.log("[REGISTER BUTTON CLICKED]");
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const submitBtn = document.getElementById('signUpBtn') || document.getElementById('btnSubmitSignUp');

    try {
      // 0. Pre-check Native HTML5 Form Validity & provide explicit user feedback
      const form = document.getElementById('formSignUp') || document.getElementById('registerForm');
      if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
        if (typeof form.reportValidity === 'function') {
          form.reportValidity();
        }
        const invalidEl = form.querySelector(':invalid');
        if (invalidEl) {
          invalidEl.focus();
          const titleMsg = invalidEl.getAttribute('title');
          const customMsg = invalidEl.validationMessage;
          const label = form.querySelector(`label[for="${invalidEl.id}"]`)?.textContent || invalidEl.placeholder || invalidEl.id || 'field';
          const alertMsg = titleMsg || customMsg || `Please provide a valid entry for: ${label}`;
          showToast(alertMsg, 'warning');
        }
        return;
      }

      const name = (document.getElementById('signUpName')?.value || '').trim();
      const studentId = (document.getElementById('signUpStudentId')?.value || '').trim();
      const email = (document.getElementById('signUpEmail')?.value || '').trim();
      const contactNumber = (document.getElementById('signUpContact')?.value || document.getElementById('signUpContactNumber')?.value || '').trim();
      const college = document.getElementById('signUpCollege')?.value || 'CCIS';
      const program = (document.getElementById('signUpProgram')?.value || '').trim() || 'Undergraduate Degree';
      const yearLevel = document.getElementById('signUpYear')?.value || '1st Year';
      const password = document.getElementById('signUpPassword')?.value || '';

      // Derive email or studentId if one was provided in an Email/Student ID single field
      let resolvedEmail = email;
      let resolvedStudentId = studentId;
      if (!resolvedEmail && resolvedStudentId) {
        resolvedEmail = resolvedStudentId.includes('@') ? resolvedStudentId.toLowerCase() : `${resolvedStudentId.toLowerCase().replace(/[^a-z0-9]/g, '')}@umak.edu.ph`;
      }
      if (!resolvedStudentId && resolvedEmail) {
        resolvedStudentId = resolvedEmail.split('@')[0].toUpperCase();
      }

      // 1. Required fields validation
      if (!name || (!resolvedEmail && !resolvedStudentId) || !password) {
        alert('Please fill in all required fields: Full Legal Name, Student ID, Email, and Password.');
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      // 1a. Strict Full Name & Email Pre-flight Validations
      const cleanEmail = (resolvedEmail || email || '').trim().toLowerCase();
      if (!cleanEmail.endsWith('@umak.edu.ph')) {
        alert("Only official UMak email addresses (@umak.edu.ph) are permitted.");
        showToast("Only official UMak email addresses (@umak.edu.ph) are permitted.", 'error');
        document.getElementById('signUpEmail')?.focus();
        return false;
      }

      const cleanName = name.trim();
      if (/\d/.test(cleanName)) {
        alert("Numbers are not allowed in the Name field.");
        showToast("Numbers are not allowed in the Name field.", 'error');
        document.getElementById('signUpName')?.focus();
        return false;
      }

      if (!/^[aAkK][0-9\-]+$/.test(resolvedStudentId)) {
        alert("Student ID must start with 'A' or 'K'.");
        showToast("Student ID must start with 'A' or 'K'.", 'error');
        document.getElementById('signUpStudentId')?.focus();
        return false;
      }

      // 2. Minimum Password Length Validation
      if (password.length < 6) {
        alert('Password must be at least 6 characters in length.');
        showToast('Password must be at least 6 characters in length.', 'error');
        document.getElementById('signUpPassword')?.focus();
        return;
      }

      // 3. Philippine Phone Number Regex Validation: ^(09\d{9}|639\d{9})$
      const cleanPhone = contactNumber.replace(/[\s\-\(\)\+]/g, '');
      const phPhoneRegex = /^(09\d{9}|639\d{9})$/;
      if (cleanPhone && !phPhoneRegex.test(cleanPhone)) {
        alert('Please enter a valid Philippine mobile number (e.g. 09171234567 or 639171234567).');
        showToast('Invalid Philippine mobile phone format.', 'error');
        document.getElementById('signUpContact')?.focus();
        return;
      }

      // 4. Student Guidance Terms & Consent Checkbox
      const consentBox = document.getElementById('signUpConsent') || document.querySelector('#formSignUp input[type="checkbox"]');
      if (consentBox && !consentBox.checked) {
        alert("Please confirm that you are a bonafide UMak student and consent to the CGCS guidance terms under RA 9258 and DPA 2012.");
        showToast("Student consent is required to register.", "error");
        consentBox.focus();
        return;
      }

      const payload = {
        name,
        full_name: name,
        studentId: resolvedStudentId,
        student_id: resolvedStudentId,
        email: resolvedEmail,
        contactNumber: cleanPhone,
        contact_number: cleanPhone,
        college,
        program,
        yearLevel,
        year_level: yearLevel,
        password
      };

      console.log("Sign-up triggered", payload);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering...';
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if ((res.status === 200 || res.status === 201) && data.success) {
        if (data.requireVerification) {
          window.registeringEmail = data.email || resolvedEmail;
          const regOtpContainer = document.getElementById('regOtpContainer');
          const regFieldsContainer = document.getElementById('regFieldsContainer');
          const targetEmailEl = document.getElementById('regOtpTargetEmail');
          const otpInput = document.getElementById('regOtpInput');

          if (regOtpContainer) {
            regOtpContainer.dataset.email = window.registeringEmail;
            regOtpContainer.classList.remove('hidden');
            regOtpContainer.style.display = 'block';
          }
          if (regFieldsContainer) {
            regFieldsContainer.classList.add('hidden');
            regFieldsContainer.style.display = 'none';
          }
          if (targetEmailEl) {
            targetEmailEl.textContent = window.registeringEmail;
          }
          if (otpInput) {
            otpInput.value = '';
            otpInput.type = 'password';
            const toggleBtn = document.getElementById('btnToggleRegOtp');
            if (toggleBtn) toggleBtn.textContent = 'Show';
            setTimeout(() => otpInput.focus(), 150);
          }
          showToast(data.message || 'A 6-digit verification code has been sent to your UMak email.', 'info');
        } else if (data.token) {
          handleSuccessfulLogin(data.token, data.user);
          showToast(data.message || 'Student account registered successfully! Welcome to UMak CGCS.', 'success');
        } else {
          showToast(data.message || 'Registration submitted. Please verify your email.', 'info');
        }
      } else {
        const errMsg = data.error || data.message || `Registration failed (HTTP ${res.status}). Please check your input.`;
        alert(errMsg);
        showToast(errMsg, 'error');
        console.error('Sign-up failed:', res.status, data);
      }
    } catch (err) {
      console.error('[REGISTER SUBMIT ERROR]:', err);
      alert('Network connection error during registration: ' + err.message);
      showToast('Network error during registration. Please try again.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Complete Student Registration';
      }
    }
  };

  // Window alias for explicit handleRegisterSubmit
  window.handleRegisterSubmit = window.handleUserSignUp;

  // Toggle Visibility for Registration OTP Input
  window.toggleRegOtpVisibility = function() {
    const otpInput = document.getElementById('regOtpInput');
    const toggleBtn = document.getElementById('btnToggleRegOtp');
    if (!otpInput) return;

    if (otpInput.type === 'password') {
      otpInput.type = 'text';
      if (toggleBtn) toggleBtn.textContent = 'Hide';
    } else {
      otpInput.type = 'password';
      if (toggleBtn) toggleBtn.textContent = 'Show';
    }
  };

  // Global OTP Verification Handler
  window.handleVerifyOtp = async function () {
    const otpInput = document.getElementById('regOtpInput');
    const otp = (otpInput?.value || '').trim();
    const email = window.registeringEmail || document.getElementById('regOtpContainer')?.dataset?.email || (document.getElementById('signUpEmail')?.value || '').trim();

    if (!otp || otp.length !== 6) {
      showToast('Please enter the 6-digit verification code.', 'error');
      otpInput?.focus();
      return;
    }

    if (!email) {
      showToast('Registration email not found. Please try registering again.', 'error');
      window.backToRegisterFields();
      return;
    }

    const btn = document.getElementById('btnVerifyOtp');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
    }

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.success) {
        showToast("Account verified! You can now log in.", 'success');

        // Reset registration fields and switch to sign in tab
        window.backToRegisterFields();
        const form = document.getElementById('formSignUp') || document.getElementById('registerForm');
        if (form && typeof form.reset === 'function') form.reset();

        switchAuthTab('signin');

        // Autofill sign-in identifier
        const signIdent = document.getElementById('signInIdentifier');
        if (signIdent) {
          signIdent.value = email;
          const signPass = document.getElementById('signInPassword');
          if (signPass) signPass.focus();
        }
      } else {
        const errMsg = data.error || data.message || 'Invalid or expired verification code.';
        showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error('OTP verification network error:', err);
      showToast('Network error during verification. Please try again.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verify & Complete';
      }
    }
  };

  // Alias for verify registration handler
  window.handleVerifyRegistration = window.handleVerifyOtp;

  window.backToRegisterFields = function () {
    const regOtpContainer = document.getElementById('regOtpContainer');
    const regFieldsContainer = document.getElementById('regFieldsContainer');
    const otpInput = document.getElementById('regOtpInput');
    const toggleBtn = document.getElementById('btnToggleRegOtp');
    if (otpInput) {
      otpInput.type = 'password';
      otpInput.value = '';
    }
    if (toggleBtn) toggleBtn.textContent = 'Show';
    if (regOtpContainer) regOtpContainer.classList.add('hidden');
    if (regFieldsContainer) regFieldsContainer.classList.remove('hidden');
  };

  // Sign Up Form (Students) - Supports #formSignUp and #registerForm
  const formSignUp = document.getElementById('formSignUp') || document.getElementById('registerForm');
  formSignUp?.addEventListener('submit', (e) => window.handleRegisterSubmit(e));

  // Explicit click listener for submit button
  const explicitSignUpBtn = document.getElementById('signUpBtn') || document.getElementById('btnSubmitSignUp');
  if (explicitSignUpBtn) {
    explicitSignUpBtn.addEventListener('click', (e) => {
      window.handleRegisterSubmit(e);
    });
  }

  // Bind Forgot Password Trigger Elements (Supporting multiple IDs)
  const forgotTriggers = [
    document.getElementById('forgotPasswordLink'),
    document.getElementById('forgotPasswordBtn'),
    document.getElementById('linkForgotPassword')
  ].filter(Boolean);

  forgotTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openForgotPasswordModal();
    });
  });

  // Close Forgot Password Button
  document.getElementById('closeForgotModal')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeForgotPasswordModal();
  });

  // Cancel Forgot Password Button
  document.getElementById('btnCancelForgotModal')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeForgotPasswordModal();
  });

  // Auth Tab Listeners
  document.getElementById('btnTabSignIn')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchAuthTab('signin');
  });
  const signUpTabBtn = document.getElementById('btnTabSignUp') || document.getElementById('signUpTabBtn');
  signUpTabBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    switchAuthTab('signup');
  });

  // Global Header Sign Out Button
  document.getElementById('btnSignOut')?.addEventListener('click', () => {
    logout();
  });
}

// Global dynamic input sanitization & pattern enforcement
function setupNameAndEmailValidation() {
  // Strip numbers instantly on typing in all name inputs
  document.querySelectorAll('input[name="name"], input[name="fullName"], #regName, #signUpName, #studentName, #studentNameInput, #counselorName, #counselorNameInput, #profileName, #editProfileName, #adminNewUserName').forEach(input => {
    input.setAttribute('pattern', "[A-Za-zñÑ\\s.,'-]+");
    input.setAttribute('title', "Names must only contain letters, spaces, hyphens, or periods.");
    
    if (!input.dataset.nameDigitsStripped) {
      input.dataset.nameDigitsStripped = 'true';
      input.addEventListener('input', function() {
        // Strip digits dynamically
        this.value = this.value.replace(/[0-9]/g, '');
      });
    }
  });

  // Enforce @umak.edu.ph email pattern on all email inputs
  document.querySelectorAll('input[type="email"], #regEmail, #signUpEmail, #studentEmail, #counselorEmail, #editProfileEmail, #adminNewUserEmail').forEach(input => {
    input.setAttribute('pattern', ".+@umak\\.edu\\.ph");
    input.setAttribute('placeholder', "username@umak.edu.ph");
  });
}
window.setupNameAndEmailValidation = setupNameAndEmailValidation;

// Standalone robust binding for Student Registration Form & Button
window.bindRegistrationListeners = function () {
  setupNameAndEmailValidation();

  const formSignUp = document.getElementById('formSignUp') || document.getElementById('registerForm');
  if (formSignUp && !formSignUp._cgcsRegBound) {
    formSignUp._cgcsRegBound = true;
    formSignUp.addEventListener('submit', (e) => window.handleRegisterSubmit(e));
  }

  const explicitSignUpBtn = document.getElementById('signUpBtn') || document.getElementById('btnSubmitSignUp');
  if (explicitSignUpBtn && !explicitSignUpBtn._cgcsRegBound) {
    explicitSignUpBtn._cgcsRegBound = true;
    explicitSignUpBtn.addEventListener('click', (e) => window.handleRegisterSubmit(e));
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.bindRegistrationListeners();
    setupNameAndEmailValidation();
  });
} else {
  window.bindRegistrationListeners();
  setupNameAndEmailValidation();
}

function handleSuccessfulLogin(token, user) {
  state.authToken = token;
  state.currentUser = user;
  localStorage.setItem('umak_cgcs_token', token);
  localStorage.setItem('token', token);

  updateHeaderProfile();
  showMainApp();
  renderDynamicNavbar();
  checkStudentIntakeStatus();
  loadAllData();
  startNotificationPoller();
}

async function validateSession() {
  try {
    const res = await authFetch('/api/me');
    const data = await res.json();

    if (data.success && data.user) {
      state.currentUser = data.user;
      updateHeaderProfile();
      showMainApp();
      renderDynamicNavbar();
      checkStudentIntakeStatus();
      loadAllData();
      startNotificationPoller();
    } else {
      logout(false);
    }
  } catch (err) {
    logout(false);
  }
}

function logout(notify = true) {
  state.authToken = null;
  state.currentUser = null;
  localStorage.removeItem('umak_cgcs_token');
  localStorage.removeItem('token');

  showAuthLanding();
  updateHeaderProfile();
  if (notify) showToast('You have been securely signed out.', 'info');
}

function showAuthLanding() {
  document.getElementById('view-landing').style.display = 'flex';
  document.getElementById('view-landing').classList.add('active');
  document.getElementById('view-dashboard').classList.add('hidden');
}

function showMainApp() {
  document.getElementById('view-landing').style.display = 'none';
  document.getElementById('view-landing').classList.remove('active');
  document.getElementById('view-dashboard').classList.remove('hidden');
}

function updateHeaderProfile() {
  const user = state.currentUser;
  const avatarEl = document.getElementById('headerUserAvatar') || document.getElementById('userAvatar');
  const nameEl = document.getElementById('headerUserName') || document.getElementById('userName');
  const roleBadgeEl = document.getElementById('headerUserRoleBadge');
  const portalSubTag = document.getElementById('portalSubTag');

  if (user) {
    const avatarSrc = user.avatar || user.avatarUrl || user.avatar_url || null;
    if (typeof updatePortalAvatarDisplay === 'function') {
      updatePortalAvatarDisplay(avatarSrc, user.name);
    } else if (avatarEl) {
      const initials = user.avatarInitials || user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      if (avatarSrc) {
        avatarEl.innerHTML = `<img src="${avatarSrc}" alt="${escapeHtml(user.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatarEl.textContent = initials;
      }
    }

    if (nameEl) nameEl.textContent = user.name;
    if (roleBadgeEl) roleBadgeEl.textContent = (user.role || '').toUpperCase();

    if (portalSubTag) {
      if (user.role === 'superadmin' || user.role === 'director') portalSubTag.textContent = 'CGCS Directorate & Executive Portal';
      else if (user.role === 'counselor' || user.role === 'admin') portalSubTag.textContent = 'Clinical Guidance & Triage Portal';
      else portalSubTag.textContent = 'Confidential Student Wellness Portal';
    }

    if (document.getElementById('studentWelcomeName')) {
      document.getElementById('studentWelcomeName').textContent = user.name;
    }
    if (document.getElementById('videoFeedSelfName')) {
      document.getElementById('videoFeedSelfName').textContent = `${user.name} (${user.role.toUpperCase()})`;
    }
  } else {
    if (typeof updatePortalAvatarDisplay === 'function') {
      updatePortalAvatarDisplay(null, 'Active User');
    } else if (avatarEl) {
      avatarEl.textContent = 'U';
    }
    if (nameEl) nameEl.textContent = 'Active User';
    if (roleBadgeEl) roleBadgeEl.textContent = 'PORTAL';
  }
}

// ====================================================
// STRICT DYNAMIC NAVBAR GENERATOR (RBAC ISOLATED)
// ====================================================
function renderDynamicNavbar() {
  const navContainer = document.getElementById('mainNavContainer');
  if (!navContainer || !state.currentUser) return;

  const role = state.currentUser.role;
  const isDirector = role === 'director' || role === 'superadmin';
  const isCounselor = role === 'counselor' || role === 'admin';
  const isStudent = role === 'student';

  navContainer.innerHTML = '';

  let tabs = [];

  if (isStudent) {
    tabs = [
      { id: 'student-overview', icon: 'fa-house-chimney-user', label: 'Home & Mood Tracker' },
      { id: 'student-booking', icon: 'fa-calendar-plus', label: 'Book an Appointment' },
      { id: 'student-assessments', icon: 'fa-square-poll-vertical', label: 'Mental Health Screenings' },
      { id: 'student-ai-chat', icon: 'fa-robot', label: 'HeronCare AI Grounding Companion' },
      { id: 'video-room-view', icon: 'fa-video', label: 'Join Video Session' }
    ];
    state.activeTab = 'student-overview';
  } else if (isCounselor) {
    tabs = [
      { id: 'counselor-queue', icon: 'fa-clipboard-list', label: 'Appointments & Triage Queue', counter: true, badge: 'counselorQueueBadge' },
      { id: 'counselor-alerts', icon: 'fa-triangle-exclamation text-rose-500', label: 'Real-Time Student Crisis Alerts', badge: 'counselorCrisisBadge' },
      { id: 'counselor-directory', icon: 'fa-address-book', label: 'Student Directory by College' },
      { id: 'counselor-availability', icon: 'fa-calendar-days', label: 'Availability & Schedule' },
      { id: 'counselor-cases', icon: 'fa-folder-medical', label: 'Digital SOAP Notes & Records' },
      { id: 'video-room-view', icon: 'fa-video', label: 'Video Counseling Room' },
      { id: 'counselor-referrals', icon: 'fa-people-pulling', label: 'Faculty Referrals' }
    ];
    state.activeTab = 'counselor-queue';
  } else if (isDirector) {
    tabs = [
      { id: 'admin-analytics', icon: 'fa-chart-pie', label: 'Executive Analytics' },
      { id: 'counselor-directory', icon: 'fa-address-book', label: 'Student Directory by College' },
      { id: 'admin-users', icon: 'fa-users-gear', label: 'User Management' },
      { id: 'admin-workload', icon: 'fa-clipboard-list', label: 'Comprehensive Reports & Caseload' },
      { id: 'admin-audit', icon: 'fa-shield-halved', label: 'Audit Logs & DPA 2012' },
      { id: 'admin-broadcasts', icon: 'fa-bullhorn', label: 'Campus Broadcasts' },
      { id: 'admin-crisis-feed', icon: 'fa-triangle-exclamation', label: 'Directorate Crisis Alerts' }
    ];
    state.activeTab = 'admin-analytics';
  }

  // Restore persistent active tab if previously set or hash is present
  const defaultTab = state.activeTab;
  const storageKey = `active_tab_${role}`;
  const savedTab = (window.location.hash ? window.location.hash.replace(/^#tab-/, '').replace(/^#/, '') : null) || localStorage.getItem(storageKey);
  const targetInitialTab = (savedTab && tabs.some(t => t.id === savedTab)) ? savedTab : defaultTab;
  state.activeTab = targetInitialTab;

  // Render each tab button dynamically
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = `nav-tab ${isDirector ? 'nav-tab-admin' : ''}`;
    btn.dataset.tab = t.id;
    btn.id = `tabBtn-${t.id}`;
    btn.innerHTML = `
      <i class="fa-solid ${t.icon}"></i> ${t.label}
      ${t.counter ? '<span class="nav-counter" id="queueBadge">0</span>' : ''}
      ${t.badge ? `<span id="${t.badge}" class="badge-count" style="display:none;">0</span>` : ''}
    `;
    btn.addEventListener('click', () => {
      switchTab(t.id);
      if (t.id === 'counselor-alerts' || t.id === 'admin-crisis-feed') {
        if (typeof loadCrisisAlerts === 'function') loadCrisisAlerts();
        if (typeof loadNotifications === 'function') loadNotifications();
      }
    });
    navContainer.appendChild(btn);
  });

  // Switch to initial role active tab
  switchTab(state.activeTab);

  if (typeof enableEdgeHoverScrollForTabs === 'function') {
    enableEdgeHoverScrollForTabs();
  }
  if (typeof wireUniversalRefreshButtons === 'function') {
    wireUniversalRefreshButtons();
  }
  if (typeof setupPersistentTabs === 'function') {
    setupPersistentTabs();
  }
}

// ====================================================
// EDGE-HOVER & MOUSEWHEEL HORIZONTAL SCROLL FOR TABS
// ====================================================
function enableEdgeHoverScrollForTabs() {
  // Target the navigation containers for Director, Counselor, and general dashboard tabs
  const tabContainers = document.querySelectorAll(
    '#counselorNavTabs, #directorNavTabs, .counselor-nav-tabs, .director-nav-tabs, .nav-tabs-horizontal, nav[aria-label="Counselor Navigation"], nav[aria-label="Director Navigation"], #mainNavContainer, #counselorNav, .nav-bar, .nav-container'
  );

  tabContainers.forEach(container => {
    if (!container || container.dataset.hoverScrollInitialized) return;
    container.dataset.hoverScrollInitialized = "true";

    let scrollInterval = null;
    const scrollSpeed = 8; // speed of auto-scroll
    const edgeThreshold = 70; // pixels from the edge to trigger scrolling

    // Helper to scroll either container or its scrollable parent/child
    const doScroll = (delta) => {
      if (container.scrollWidth > container.clientWidth) {
        container.scrollLeft += delta;
      } else if (container.parentElement && container.parentElement.scrollWidth > container.parentElement.clientWidth) {
        container.parentElement.scrollLeft += delta;
      } else {
        container.scrollLeft += delta;
      }
    };

    // 1. Edge-hover auto-scrolling
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const width = rect.width;

      clearInterval(scrollInterval);

      // Check if mouse is near the right edge
      if (mouseX > width - edgeThreshold) {
        scrollInterval = setInterval(() => {
          doScroll(scrollSpeed);
        }, 16);
      } 
      // Check if mouse is near the left edge
      else if (mouseX < edgeThreshold) {
        scrollInterval = setInterval(() => {
          doScroll(-scrollSpeed);
        }, 16);
      }
    });

    container.addEventListener('mouseleave', () => {
      clearInterval(scrollInterval);
    });

    // 2. Mousewheel horizontal scroll support
    container.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        doScroll(e.deltaY);
      }
    }, { passive: false });
  });
}

// Ensure it runs after initial render and when switching dashboards
document.addEventListener('DOMContentLoaded', enableEdgeHoverScrollForTabs);
if (typeof window.enableEdgeHoverScrollForTabs === 'undefined') {
  window.enableEdgeHoverScrollForTabs = enableEdgeHoverScrollForTabs;
}

// ====================================================
// ACTIVE TAB STATE PERSISTENCE
// ====================================================
function setupPersistentTabs() {
  const activeRole = localStorage.getItem('user_role') || (state.currentUser && state.currentUser.role) || 'student';
  const storageKey = `active_tab_${activeRole}`;

  // Listen to any Bootstrap tab switch event across all dashboards
  document.querySelectorAll('button[data-bs-toggle="tab"], a[data-bs-toggle="tab"]').forEach(tabTrigger => {
    tabTrigger.addEventListener('shown.bs.tab', (event) => {
      const targetId = event.target.getAttribute('data-bs-target') || event.target.getAttribute('href');
      if (targetId) {
        localStorage.setItem(storageKey, targetId);
        // Optional: Update window hash for clean URL state
        try { history.replaceState(null, null, targetId); } catch(e) {}
      }
    });
  });

  // Listen to custom .nav-tab clicks
  document.querySelectorAll('.nav-tab').forEach(tabTrigger => {
    tabTrigger.addEventListener('click', () => {
      const targetTab = tabTrigger.dataset.tab;
      if (targetTab) {
        const curRole = (state.currentUser && state.currentUser.role) || localStorage.getItem('user_role') || 'student';
        localStorage.setItem(`active_tab_${curRole}`, targetTab);
        try { history.replaceState(null, null, `#${targetTab}`); } catch(e) {}
      }
    });
  });

  // Restore active tab on page reload
  function restoreActiveTab() {
    const curRole = (state.currentUser && state.currentUser.role) || localStorage.getItem('user_role') || 'student';
    const roleKey = `active_tab_${curRole}`;
    const savedTabId = (window.location.hash ? window.location.hash.replace(/^#tab-/, '').replace(/^#/, '') : null) || localStorage.getItem(roleKey) || localStorage.getItem(storageKey);
    if (savedTabId) {
      if (typeof switchTab === 'function') {
        const cleanId = savedTabId.replace(/^#tab-/, '').replace(/^#/, '');
        const pane = document.getElementById(`tab-${cleanId}`) || document.getElementById(cleanId);
        if (pane) {
          switchTab(cleanId);
          return true;
        }
      }
      const targetBtn = document.querySelector(`button[data-bs-target="${savedTabId}"], a[data-bs-target="${savedTabId}"], button[href="${savedTabId}"], a[href="${savedTabId}"], button[data-tab="${savedTabId}"]`);
      if (targetBtn) {
        if (window.bootstrap && bootstrap.Tab) {
          try {
            const tabInstance = bootstrap.Tab.getOrCreateInstance(targetBtn);
            tabInstance.show();
          } catch(e) {}
        }
        if (targetBtn.dataset.tab && typeof switchTab === 'function') {
          switchTab(targetBtn.dataset.tab);
        }
        return true;
      }
    }
    return false;
  }

  // Attempt immediate restore or fallback to initial dashboard ready
  setTimeout(restoreActiveTab, 150);
}

window.addEventListener('hashchange', () => {
  if (window.location.hash) {
    const cleanId = window.location.hash.replace(/^#tab-/, '').replace(/^#/, '');
    if (typeof switchTab === 'function') {
      const pane = document.getElementById(`tab-${cleanId}`) || document.getElementById(cleanId);
      if (pane) {
        switchTab(cleanId);
        return;
      }
    }
    const targetBtn = document.querySelector(`[data-bs-target="${window.location.hash}"], [href="${window.location.hash}"], [data-tab="${cleanId}"]`);
    if (targetBtn) {
      if (window.bootstrap && bootstrap.Tab) {
        try {
          bootstrap.Tab.getOrCreateInstance(targetBtn).show();
        } catch(e) {}
      }
    }
  }
});

// ====================================================
// UNIVERSAL DATA RE-FETCH ON IN-PORTAL REFRESH BUTTONS
// ====================================================
function wireUniversalRefreshButtons() {
  // Helper to run visual spin animation on icons during async fetch
  async function executeRefreshWithSpinner(btn, fetchFn) {
    if (!btn || typeof fetchFn !== 'function') return;
    const icon = btn.querySelector('i.bi-arrow-clockwise, i.bi-arrow-repeat, i.bi-arrow-counterclockwise, i.fa-rotate, i.fa-arrows-rotate, i.fa-sync');
    if (icon) icon.classList.add('spin-animation');
    btn.disabled = true;

    try {
      await fetchFn();
      if (typeof showAlert === 'function') {
        showAlert('Data updated successfully.', 'success', 2000);
      } else if (typeof showToast === 'function') {
        showToast('Data updated successfully.', 'success');
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      if (icon) icon.classList.remove('spin-animation');
      btn.disabled = false;
    }
  }

  // 1. Triage Queue Refresh
  const btnRefreshQueue = document.getElementById('btnRefreshQueue') || document.querySelector('.btn-refresh-queue');
  if (btnRefreshQueue) {
    btnRefreshQueue.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshQueue, async () => {
        if (typeof loadCounselorQueue === 'function') await loadCounselorQueue();
        if (typeof loadQueueStats === 'function') await loadQueueStats();
        if (typeof fetchAppointments === 'function') await fetchAppointments();
      });
    };
  }

  // 2. Delegated Access Requests Refresh (Counselor & Director)
  const btnRefreshRequests = document.getElementById('btnRefreshRequests') || document.querySelector('.btn-refresh-delegated');
  if (btnRefreshRequests) {
    btnRefreshRequests.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshRequests, async () => {
        if (typeof loadDelegatedAccessRequests === 'function') await loadDelegatedAccessRequests();
        if (typeof loadDirectorDelegatedAccessRequests === 'function') await loadDirectorDelegatedAccessRequests();
      });
    };
  }

  // 3. Student Directory Roster Refresh
  const btnRefreshDirectory = document.getElementById('btnRefreshDirectory') || document.querySelector('.btn-refresh-students');
  if (btnRefreshDirectory) {
    btnRefreshDirectory.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshDirectory, async () => {
        if (typeof loadStudentDirectory === 'function') await loadStudentDirectory();
        if (typeof loadCounselorStudents === 'function') await loadCounselorStudents();
        if (typeof loadCounselorDirectory === 'function') await loadCounselorDirectory();
      });
    };
  }

  // 4. Notifications Bell Refresh
  const btnRefreshNotifs = document.getElementById('btnRefreshNotifications') || document.querySelector('.btn-refresh-notifications');
  if (btnRefreshNotifs) {
    btnRefreshNotifs.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshNotifs, async () => {
        if (typeof loadNotifications === 'function') await loadNotifications();
        if (typeof fetchNotifications === 'function') await fetchNotifications();
      });
    };
  }

  // 5. Schedule & Availability Refresh
  const btnRefreshSchedule = document.getElementById('btnRefreshSchedule');
  if (btnRefreshSchedule) {
    btnRefreshSchedule.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshSchedule, async () => {
        if (typeof loadCounselorSchedules === 'function') await loadCounselorSchedules();
      });
    };
  }

  // 6. Crisis Alerts Refresh
  const btnRefreshAlerts = document.getElementById('btnRefreshAlerts');
  if (btnRefreshAlerts) {
    btnRefreshAlerts.onclick = (e) => {
      e.preventDefault();
      executeRefreshWithSpinner(btnRefreshAlerts, async () => {
        if (typeof loadCrisisAlerts === 'function') await loadCrisisAlerts();
      });
    };
  }
}

// Call on initial DOM load and dashboard switches
document.addEventListener('DOMContentLoaded', () => {
  setupPersistentTabs();
  wireUniversalRefreshButtons();
});

window.setupPersistentTabs = setupPersistentTabs;
window.wireUniversalRefreshButtons = wireUniversalRefreshButtons;


window.renderCounselorNav = function() {
  const counselorTabs = [
    { id: 'counselor-queue', label: 'Appointments & Triage Queue', icon: 'fa-clipboard-list', badge: 'counselorQueueBadge' },
    { id: 'counselor-alerts', label: 'Real-Time Student Crisis Alerts', icon: 'fa-triangle-exclamation', badge: 'counselorCrisisBadge' },
    { id: 'counselor-students', label: 'Student Directory by College', icon: 'fa-address-book' },
    { id: 'counselor-schedule', label: 'Availability & Schedule', icon: 'fa-calendar-days' },
    { id: 'counselor-soap', label: 'Digital SOAP Notes & Records', icon: 'fa-file-medical' },
    { id: 'counselor-telehealth', label: 'Video Counseling Room', icon: 'fa-video' }
  ];
  return counselorTabs;
};

window.switchCounselorTab = function(tabId) {
  switchTab(tabId);
};

function switchTab(tabId) {
  if (!window.activeCallConnected) {
    if (typeof setMeetingExitButtonVisibility === 'function') {
      setMeetingExitButtonVisibility(false);
    }
  }
  if (!state.currentUser) return;
  const role = (state.currentUser.role || '').toLowerCase();
  const isDirector = role === 'director' || role === 'superadmin';
  const isCounselor = role === 'counselor' || role === 'admin';
  const isStudent = role === 'student';

  const requestedTab = tabId;
  const aliasMap = {
    'counselor-students': 'counselor-directory',
    'counselor-schedule': 'counselor-availability',
    'counselor-soap': 'counselor-cases',
    'counselor-telehealth': 'video-room-view',
    'student-appointments': 'student-booking'
  };
  if (aliasMap[tabId]) tabId = aliasMap[tabId];

  const studentTabs = ['student-overview', 'student-booking', 'student-appointments', 'student-assessments', 'student-ai-chat', 'video-room-view'];
  const counselorTabs = [
    'counselor-queue', 
    'counselor-alerts', 
    'counselor-directory', 
    'counselor-availability', 
    'counselor-cases', 
    'video-room-view', 
    'counselor-referrals',
    'counselor-students',
    'counselor-schedule',
    'counselor-soap',
    'counselor-telehealth'
  ];
  const directorTabs = ['admin-analytics', 'counselor-directory', 'admin-users', 'admin-workload', 'admin-audit', 'admin-broadcasts', 'admin-crisis-feed', 'video-room-view'];

  let allowedTabs = [];
  let defaultTab = 'student-overview';

  if (isStudent) {
    allowedTabs = studentTabs;
    defaultTab = 'student-overview';
  } else if (isCounselor) {
    allowedTabs = counselorTabs;
    defaultTab = 'counselor-queue';
  } else if (isDirector) {
    allowedTabs = directorTabs;
    defaultTab = 'admin-analytics';
  }

  // Enforce strict client-side RBAC view guard
  if (tabId && !allowedTabs.includes(tabId)) {
    showToast(`Access denied. View ${tabId} is restricted for ${role} role.`, 'error');
    tabId = defaultTab;
  }

  // Intake enforcement guard for student booking
  if (tabId === 'student-booking' && isStudent && (!state.currentUser?.has_completed_intake)) {
    showToast('Please complete your intake assessment and health disclosure first before booking an appointment.', 'warning');
    openIntakeModal();
  }

  // Universal Dual Screening Check (PHQ-9 & GAD-7)
  if (tabId === 'student-booking' && isStudent && requestedTab !== 'student-appointments') {
    const allAssessments = (state.studentAssessments || []).concat(state.assessments || []);
    const hasPHQ9 = allAssessments.some(a => (a.assessment_type || a.type) === 'PHQ-9');
    const hasGAD7 = allAssessments.some(a => (a.assessment_type || a.type) === 'GAD-7');
    if ((!hasPHQ9 || !hasGAD7) && state.currentUser?.has_completed_intake) {
      showToast("In accordance with CGCS clinical protocol, please complete your foundational wellness inventories (Personal Well-Being & Stress Coping) before scheduling a consultation.", "warning");
      switchTab('student-assessments');
      return;
    }
  }

  // If student was routed to appointments / history, switch to history subtab
  if (isStudent && requestedTab === 'student-appointments') {
    if (typeof switchStudentBookingSubtab === 'function') {
      switchStudentBookingSubtab('history');
    }
  }

  state.activeTab = tabId;
  const currentRole = state.currentUser?.role || localStorage.getItem('user_role') || 'student';
  localStorage.setItem(`active_tab_${currentRole}`, tabId);
  try {
    history.replaceState(null, null, `#${tabId}`);
  } catch(e) {}

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId || (t.dataset.tab === 'student-booking' && requestedTab === 'student-appointments'));
  });

  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) {
    activePane.classList.add('active');
  }

  // Auto-refresh specific data depending on tab selected
  if (tabId === 'video-room-view') {
    if (typeof restoreActiveVideoSessionOnLoad === 'function') {
      restoreActiveVideoSessionOnLoad();
    } else if (typeof loadUpcomingVideoRoomState === 'function') {
      loadUpcomingVideoRoomState();
    }
  } else if (isStudent) {
    if (tabId === 'student-booking' || requestedTab === 'student-appointments' || tabId === 'student-overview') {
      if (typeof loadStudentAppointments === 'function') {
        loadStudentAppointments();
      } else if (typeof fetchAppointments === 'function') {
        fetchAppointments();
      }
    }
  } else if (tabId === 'counselor-queue') {
    fetchAppointments();
  } else if (tabId === 'counselor-directory') {
    if (typeof loadCounselorDirectory === 'function') loadCounselorDirectory();
    if (typeof loadCounselorStudents === 'function') loadCounselorStudents();
  } else if (tabId === 'counselor-availability') {
    loadCounselorSchedules();
  } else if (tabId === 'counselor-alerts' || tabId === 'admin-crisis-feed') {
    if (typeof loadCrisisAlerts === 'function') loadCrisisAlerts();
    if (typeof loadNotifications === 'function') loadNotifications();
  } else if (tabId === 'admin-analytics') {
    renderInstitutionalAnalytics();
  } else if (tabId === 'admin-workload' || tabId === 'director-reports') {
    loadWorkloadData();
    if (typeof loadDirectorDelegatedAccessRequests === 'function') loadDirectorDelegatedAccessRequests();
    if (typeof loadDirectorFacultyReferralsDesk === 'function') loadDirectorFacultyReferralsDesk();
    if (typeof updateCounselorPresenceTelemetry === 'function') updateCounselorPresenceTelemetry();
  } else if (tabId === 'counselor-cases') {
    if (typeof fetchCompletedCases === 'function') fetchCompletedCases();
    if (typeof loadDelegatedAccessRequests === 'function') loadDelegatedAccessRequests();
  } else if (tabId === 'admin-users') {
    if (typeof loadDirectorUsers === 'function') loadDirectorUsers();
    if (typeof loadAdminData === 'function') loadAdminData();
  } else if (tabId === 'admin-audit') {
    if (typeof loadAdminData === 'function') loadAdminData();
    if (typeof loadDirectorGrievancesDesk === 'function') loadDirectorGrievancesDesk();
  } else if (tabId === 'counselor-referrals') {
    if (typeof loadFacultyReferralsDesk === 'function') loadFacultyReferralsDesk();
  }
}

// ====================================================
// DATA LOADING CONTROLLER
// ====================================================
async function loadAllData() {
  await Promise.all([
    fetchAppointments(),
    fetchAssessments(),
    fetchMoodHistory(),
    fetchNotifications(),
    fetchBroadcasts()
  ]);

  if (state.currentUser?.role === 'counselor' || state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'director' || state.currentUser?.role === 'admin') {
    await fetchReferrals();
    await fetchCompletedCases();
    await loadCounselorSchedules();
    await loadWorkloadData();
    await loadCrisisAlerts();
    await loadLiveChatRequests();
    await loadCounselorStudents();
    if (typeof loadDelegatedAccessRequests === 'function') {
      await loadDelegatedAccessRequests();
    }
  }
  if (state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'director') {
    await loadAdminData();
  }
}

async function fetchAppointments() {
  try {
    const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
    const endpoint = isStudent ? '/api/student/appointments' : '/api/appointments';
    const res = await authFetch(endpoint);
    const data = await res.json();
    if (data.success) {
      const appts = data.appointments || data.data || [];
      state.appointments = appts;
      if (!isStudent) {
        window.counselorAppointmentsCache = appts;
      }
      renderStudentAppointments();
      renderStudentMyBookings();
      if (typeof renderActiveAppointmentsSummary === 'function') {
        renderActiveAppointmentsSummary();
      } else if (typeof renderActiveAppointments === 'function') {
        renderActiveAppointments();
      }
      if (!isStudent) {
        renderCounselorQueue();
        updateMetrics();
        if (typeof window.filterCounselorAppointments === 'function') {
          window.filterCounselorAppointments();
        }
      }
      if (state.activeTab === 'video-room-view') {
        if (typeof restoreActiveVideoSessionOnLoad === 'function') {
          restoreActiveVideoSessionOnLoad();
        }
      }
    }
  } catch (err) {
    console.error('Error fetching appointments:', err);
  }
}

async function fetchStudentAppointments() {
  try {
    const res = await authFetch('/api/student/appointments');
    const data = await res.json();
    if (data.success && (Array.isArray(data.appointments) || Array.isArray(data.data))) {
      const appts = data.appointments || data.data || [];
      appts.sort((a, b) => {
        const parseSlot = (s) => (s ? s.split('-')[0].trim() : '00:00');
        const dateA = new Date(`${a.date} ${parseSlot(a.time_slot)}`);
        const dateB = new Date(`${b.date} ${parseSlot(b.time_slot)}`);
        const tA = isNaN(dateA.getTime()) ? new Date(a.date).getTime() : dateA.getTime();
        const tB = isNaN(dateB.getTime()) ? new Date(b.date).getTime() : dateB.getTime();
        return tA - tB;
      });
      state.appointments = appts;
      renderStudentAppointments();
      renderStudentMyBookings();
      if (typeof renderActiveAppointmentsSummary === 'function') {
        renderActiveAppointmentsSummary();
      } else if (typeof renderActiveAppointments === 'function') {
        renderActiveAppointments();
      }
      if (state.activeTab === 'video-room-view') {
        if (typeof restoreActiveVideoSessionOnLoad === 'function') {
          restoreActiveVideoSessionOnLoad();
        }
      }
      return appts;
    }
  } catch (err) {
    console.error('Error in fetchStudentAppointments:', err);
  }
}
window.fetchStudentAppointments = fetchStudentAppointments;

async function loadStudentAppointments() {
  return await fetchStudentAppointments();
}
window.loadStudentAppointments = loadStudentAppointments;
window.loadCounselorAppointments = async function() {
  await fetchAppointments();
  if (typeof window.filterCounselorAppointments === 'function') {
    window.filterCounselorAppointments();
  }
};

async function fetchAssessments() {
  try {
    const res = await authFetch('/api/assessments');
    const data = await res.json();
    if (data.success) {
      state.assessments = data.data;
      state.studentAssessments = data.data;
      renderStudentAssessmentsHistory();
    }
  } catch (err) {
    console.error('Error fetching assessments:', err);
  }
}

async function loadNotifications() {
  try {
    const res = await authFetch('/api/notifications');
    const data = await res.json();
    if (data && data.success) {
      const notifications = data.notifications || data.data || [];
      state.notifications = notifications;

      const unreadCount = notifications.filter(n => n.is_read === 0).length;
      const badge = document.getElementById('notifBadgeCount');
      if (badge) {
        badge.textContent = unreadCount;
        if (unreadCount === 0) {
          badge.classList.add('hidden');
        } else {
          badge.classList.remove('hidden');
        }
      }

      const unreadLabel = document.getElementById('drawerUnreadCount');
      if (unreadLabel) {
        unreadLabel.textContent = `${unreadCount} Unread Alert${unreadCount === 1 ? '' : 's'}`;
      }

      const list = document.getElementById('drawerNotifList');
      if (list) {
        if (notifications.length === 0) {
          list.innerHTML = `<div class="p-4 text-center text-sm text-slate-400">No new notifications</div>`;
        } else {
          renderNotifications();
        }
      }

      renderUserNotifications(notifications);
      return notifications;
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
  return [];
}

const fetchNotifications = loadNotifications;
window.loadNotifications = loadNotifications;

function startNotificationPoller() {
  setInterval(() => {
    loadNotifications();
    if (state.currentUser?.role === 'counselor' || state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'admin') {
      loadLiveChatRequests();
    }
  }, 10000);
}

// ====================================================
// 2. NOTIFICATION CENTER DRAWER & UNIVERSAL ROUTER
// ====================================================

window.toggleNotificationDrawer = function (show = true) {
  const drawer = document.getElementById('notifDrawer');
  const backdrop = document.getElementById('notifDrawerBackdrop');
  if (!drawer || !backdrop) return;

  if (show) {
    drawer.classList.add('show');
    backdrop.classList.add('show');
    loadNotifications();
  } else {
    drawer.classList.remove('show');
    backdrop.classList.remove('show');
  }
};

function formatPhilippineTime(dateStr) {
  if (!dateStr) return '';
  // Append 'Z' if SQLite returned raw UTC without zone indicator
  let normalizedStr = dateStr;
  if (typeof dateStr === 'string') {
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
      normalizedStr = dateStr.replace(' ', 'T') + 'Z';
    }
  }
  
  const dateObj = new Date(normalizedStr);
  if (isNaN(dateObj.getTime())) return dateStr;

  const timePart = dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const datePart = dateObj.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });

  return `${timePart} • ${datePart}`;
}
window.formatPhilippineTime = formatPhilippineTime;

function renderUserNotifications(notifications) {
  const list = document.getElementById('notificationList');
  const badge = document.getElementById('notificationBadge');
  if (!list) return;

  const notifs = notifications || state.notifications || [];
  const unreadCount = notifs.filter(n => !n.is_read).length;
  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
  }

  if (!notifs || notifs.length === 0) {
    list.innerHTML = `<li class="dropdown-item text-muted text-center py-3">No notifications.</li>`;
    return;
  }

  list.innerHTML = notifs.map(n => `
    <li class="dropdown-item p-2 border-bottom border-secondary ${n.is_read ? 'opacity-75' : 'bg-dark'}" 
        style="cursor: ${n.action_link ? 'pointer' : 'default'};"
        onclick="handleNotificationRouting(${n.id}, '${n.action_link || ''}', '${n.reference_id || ''}', ${n.is_read})">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <strong class="text-light small">${escapeHtml(n.title)}</strong>
        <small class="text-muted" style="font-size: 0.68rem;">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      <p class="mb-1 text-light small text-wrap">${escapeHtml(n.message)}</p>
      ${n.action_link ? `
        <span class="badge bg-warning text-dark fw-semibold" style="font-size: 0.65rem;">
          <i class="bi bi-arrow-right-circle me-1"></i> View / Take Action
        </span>
      ` : ''}
    </li>
  `).join('');
}
window.renderUserNotifications = renderUserNotifications;

async function handleNotificationRouting(notificationId, actionLink, referenceId, isRead) {
  // 1. Mark notification as read
  if (!isRead) {
    try {
      await authFetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });
      if (typeof loadNotifications === 'function') loadNotifications();
    } catch (e) {
      console.warn('Could not mark notification as read:', e);
    }
  }

  if (typeof toggleNotificationDrawer === 'function') {
    toggleNotificationDrawer(false);
  }

  if (!actionLink) return;

  // 2. Role-specific deep-linking
  switch (actionLink) {
    // Counselor: Anonymous Student Consultation Feedback Desk
    case 'counselor-feedback': {
      if (typeof openCounselorFeedbackModal === 'function') {
        openCounselorFeedbackModal();
      }
      break;
    }

    // Counselor: Navigate to Faculty Referrals Desk
    case 'counselor-referrals': {
      const btn = document.querySelector('[data-bs-target="#tab-counselor-referrals"], [data-bs-target="#tab-faculty-referrals"], #navFacultyReferrals');
      if (btn) btn.click();
      if (typeof switchTab === 'function') switchTab('counselor-referrals');
      if (typeof loadFacultyReferralsDesk === 'function') {
        loadFacultyReferralsDesk();
      }
      setTimeout(() => {
        if (referenceId) {
          const row = document.getElementById(`ref-row-${referenceId}`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('table-row-today');
            setTimeout(() => row.classList.remove('table-row-today'), 3500);
          }
        }
      }, 350);
      break;
    }

    // Counselor: Navigate to Triage Queue
    case 'counselor-queue': {
      const btn = document.querySelector('[data-bs-target="#tab-counselor-queue"], #tab-counselor-queue-btn, [href="#tab-counselor-queue"], button[data-tab="counselor-queue"]');
      if (btn) btn.click();
      if (typeof switchTab === 'function') switchTab('counselor-queue');
      setTimeout(() => {
        if (referenceId) {
          const row = document.getElementById(`appt-row-${referenceId}`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('table-row-today');
            setTimeout(() => row.classList.remove('table-row-today'), 3500);
          }
        }
      }, 300);
      break;
    }

    // Counselor: Navigate to Delegated Access desk in Cases tab
    case 'counselor-delegated-desk': {
      const btn = document.querySelector('[data-bs-target="#tab-counselor-cases"], #tab-counselor-cases-btn, [href="#tab-counselor-cases"], button[data-tab="counselor-cases"]');
      if (btn) btn.click();
      if (typeof switchTab === 'function') switchTab('counselor-cases');
      setTimeout(() => {
        const desk = document.getElementById('delegatedAccessTable') || document.querySelector('.delegated-action-group') || document.getElementById('counselorDelegatedAccessContainer');
        if (desk) desk.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
      break;
    }

    // Director: Navigate to Comprehensive Reports Delegated Access table
    case 'director-reports': {
      const btn = document.querySelector('[data-bs-target="#tab-director-reports"], #tab-director-reports-btn, [href="#tab-director-reports"], [data-bs-target="#tab-admin-workload"], button[data-tab="admin-workload"]');
      if (btn) btn.click();
      if (typeof switchTab === 'function') switchTab('admin-workload');
      setTimeout(() => {
        const table = document.getElementById('directorDelegatedAccessTableBody') || document.getElementById('directorDelegatedAccessCard');
        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof loadDirectorDelegatedAccessRequests === 'function') loadDirectorDelegatedAccessRequests();
      }, 350);
      break;
    }

    // Counselor: Open Clinical Monitoring Sheet for student
    case 'open-student-clinical-sheet': {
      if (referenceId && typeof openClinicalMonitoringSheet === 'function') {
        openClinicalMonitoringSheet(referenceId);
      } else if (referenceId && typeof window.openClinicalMonitoringSheetFromProfile === 'function') {
        window.openClinicalMonitoringSheetFromProfile(referenceId);
      }
      break;
    }

    // Student: Navigate to My Appointments list
    case 'student-appointments':
    case 'student-booking': {
      if (typeof switchTab === 'function') {
        switchTab('student-booking');
      }
      if (typeof switchStudentBookingSubtab === 'function') {
        switchStudentBookingSubtab('history');
      }
      if (typeof fetchStudentAppointments === 'function') {
        await fetchStudentAppointments();
      } else if (typeof loadStudentAppointments === 'function') {
        await loadStudentAppointments();
      }
      if (typeof renderStudentMyBookings === 'function') {
        renderStudentMyBookings();
      }
      setTimeout(() => {
        const card = document.getElementById(`student-appt-${referenceId}`) || document.getElementById(`appt-row-${referenceId}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      break;
    }
  }
}
window.handleNotificationRouting = handleNotificationRouting;

async function handleNotificationClick(notif) {
  if (!notif) return;
  const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
  if (notif.id && !notif.is_read) {
    try {
      await authFetch(`/api/notifications/${notif.id}/read`, { method: 'PATCH' });
      if (typeof loadNotifications === 'function') loadNotifications();
      else if (typeof fetchNotifications === 'function') fetchNotifications();
    } catch (e) {
      console.warn('Could not mark notification read:', e);
    }
  }
  if (typeof toggleNotificationDrawer === 'function') {
    toggleNotificationDrawer(false);
  }

  const notifType = notif.type || '';
  const actionLink = notif.action_link || notif.link || '';
  const refId = notif.reference_id || '';

  if (isStudent && (notifType === 'appointment_status' || notifType === 'appointment_booked' || notifType === 'appointment' || actionLink === 'student-appointments' || actionLink === 'student-booking')) {
    if (typeof switchTab === 'function') {
      switchTab('student-booking');
    }
    if (typeof switchStudentBookingSubtab === 'function') {
      switchStudentBookingSubtab('history');
    }
    if (typeof fetchStudentAppointments === 'function') {
      await fetchStudentAppointments();
    }
    if (typeof renderStudentMyBookings === 'function') {
      renderStudentMyBookings();
    }
    return;
  }

  await handleNotificationRouting(notif.id, actionLink, refId, true);
}
window.handleNotificationClick = handleNotificationClick;

function renderNotifications() {
  const list = document.getElementById('drawerNotifList');
  const badge = document.getElementById('notifBadgeCount');
  const unreadLabel = document.getElementById('drawerUnreadCount');

  const notifications = state.notifications || [];
  const unreadCount = notifications.filter(n => n.is_read === 0 || !n.is_read).length;

  if (badge) {
    badge.textContent = unreadCount;
    if (unreadCount === 0) {
      badge.classList.add('hidden');
    } else {
      badge.classList.remove('hidden');
    }
  }
  if (unreadLabel) {
    unreadLabel.textContent = `${unreadCount} Unread Alert${unreadCount === 1 ? '' : 's'}`;
  }

  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-sm text-slate-400">No new notifications</div>`;
    return;
  }

  list.innerHTML = notifications.map(n => {
    const actionKey = n.action_link || n.link || '';
    const refKey = n.reference_id || '';
    const isUnread = (n.is_read === 0 || !n.is_read);

    // Supportive Check-in / Assessment follow-up check (Task 3)
    const isSupportiveCheckin = (
      n.type === 'appointment_followup' ||
      (n.title && n.title.toLowerCase().includes('supportive check-in')) ||
      (n.message && (n.message.toLowerCase().includes('supportive check-in') || n.message.toLowerCase().includes('click below to book')))
    );

    return `
    <div class="notif-card ${isUnread ? 'unread' : ''} ${n.type === 'warning' || n.type === 'crisis_alert' ? 'notif-urgent' : ''}" 
         style="cursor: ${actionKey ? 'pointer' : 'default'};"
         onclick="handleNotificationRouting('${n.id}', '${actionKey}', '${refKey}', ${n.is_read ? 1 : 0})">
      <div class="notif-card-header">
        <div class="notif-card-title">
          <i class="fa-solid ${n.type === 'warning' || n.type === 'crisis_alert' ? 'fa-triangle-exclamation text-danger bi bi-exclamation-triangle-fill' : n.type === 'appointment_booked' || n.type === 'appointment_status' || n.type === 'appointment' ? 'fa-calendar-check text-gold bi bi-calendar-check' : 'fa-bell text-gold bi bi-bell'}"></i> ${escapeHtml(n.title)}
        </div>
        <span class="badge ${n.type === 'warning' || n.type === 'crisis_alert' ? 'badge-danger bg-danger text-light' : 'badge-navy'}">${escapeHtml(n.type || 'info')}</span>
      </div>
      <div class="notif-card-msg">${escapeHtml(n.message)}</div>
      ${isSupportiveCheckin ? `
        <div style="margin-top: 12px; margin-bottom: 8px;">
          <button type="button" class="btn btn-gold btn-sm" onclick="event.stopPropagation(); openAppointmentModalFromNotif('${n.id || ''}')" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; border-radius: 6px; cursor: pointer;">
            <i class="fa-solid fa-calendar-check"></i> Book an Appointment
          </button>
        </div>
      ` : (actionKey ? `
        <div style="margin-top: 6px;">
          <span class="badge bg-warning text-dark fw-semibold" style="font-size: 0.65rem;">
            <i class="bi bi-arrow-right-circle fa-solid fa-arrow-right me-1"></i> View / Take Action
          </span>
        </div>
      ` : '')}
      <div class="notif-card-meta mt-2 d-flex justify-content-between align-items-center">
        <span class="notif-timestamp" style="font-size: 11px; opacity: 0.7;">
          ${formatPhilippineTime(n.created_at)}
        </span>
        ${isUnread ? `
          <button class="btn-mark-single-read" onclick="event.stopPropagation(); markSingleNotificationRead('${n.id}')">
            <i class="fa-solid fa-check"></i> Mark Read
          </button>
        ` : '<small class="text-muted"><i class="fa-solid fa-check-double text-green"></i> Read</small>'}
      </div>
    </div>
  `;
  }).join('');
}

window.openAppointmentModalFromNotif = async function (notifId) {
  if (notifId) {
    try {
      await authFetch(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
      if (typeof loadNotifications === 'function') loadNotifications();
      else if (typeof fetchNotifications === 'function') fetchNotifications();
    } catch (e) {
      console.warn('Could not mark notification read:', e);
    }
  }
  if (typeof toggleNotificationDrawer === 'function') {
    toggleNotificationDrawer(false);
  }
  if (typeof switchTab === 'function') {
    switchTab('student-booking');
  }
  const modalBooking = document.getElementById('modalAppointmentBooking') || document.getElementById('modalBookAppointment');
  if (modalBooking && typeof openModal === 'function') {
    openModal(modalBooking.id);
  }
};

window.markSingleNotificationRead = async function (id) {
  try {
    await authFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    await fetchNotifications();
  } catch (e) {
    console.error('Error marking notification read:', e);
  }
};

window.markAllNotificationsRead = async function () {
  try {
    const res = await authFetch('/api/notifications/mark-all-read', { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast('All notifications marked as read.', 'success');
      await fetchNotifications();
    }
  } catch (e) {
    showToast('Failed to mark all as read.', 'error');
  }
};

window.handleNotifClick = async function (id, link) {
  await handleNotificationRouting(id, link, '', false);
};

// ====================================================
// 3. EDIT USER PROFILE MODULE WITH PHOTO UPLOAD
// ====================================================

let currentAvatarBase64 = null;

// Synchronize all avatar displays across the navigation bar and header
function updatePortalAvatarDisplay(avatarUrl, fullName) {
  const navImg = document.getElementById('headerUserAvatarImg');
  const navInitials = document.getElementById('headerUserInitials');

  const initials = (fullName || 'U')
    .split(' ')
    .filter(n => n.length > 0)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl) {
    if (navImg) {
      navImg.src = avatarUrl;
      navImg.style.display = 'block';
      navImg.classList.remove('d-none');
      navImg.classList.remove('hidden');
    }
    if (navInitials) {
      navInitials.style.display = 'none';
      navInitials.classList.add('d-none');
      navInitials.classList.add('hidden');
    }
  } else {
    if (navImg) {
      navImg.src = '';
      navImg.style.display = 'none';
      navImg.classList.add('d-none');
      navImg.classList.add('hidden');
    }
    if (navInitials) {
      navInitials.textContent = initials;
      navInitials.style.display = 'block';
      navInitials.classList.remove('d-none');
      navInitials.classList.remove('hidden');
    }
  }
}
window.updatePortalAvatarDisplay = updatePortalAvatarDisplay;

// Open and populate profile modal based on active role
window.openEditProfileModal = async function() {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/user/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (!data.success || !data.user) {
      alert('Failed to load profile data.');
      return;
    }

    const u = data.user;
    currentAvatarBase64 = u.avatar || null;

    // Role dynamic title & ID label
    const role = (u.role || 'student').toLowerCase();
    const titleEl = document.getElementById('editProfileRoleTitle');
    const idLabelEl = document.getElementById('labelEditProfileIdentifier');
    
    if (titleEl) {
      titleEl.textContent = `Edit ${role.charAt(0).toUpperCase() + role.slice(1)} Profile`;
    }
    if (idLabelEl) {
      idLabelEl.textContent = role === 'student' ? 'Student ID Number' : 'Employee / Faculty ID Number';
    }

    // Locked Fields: Identifier & Email
    const studentIdInput = document.getElementById('editProfileStudentId');
    if (studentIdInput) {
      studentIdInput.value = u.student_id || u.id_number || u.account_number || u.employee_id || '';
      studentIdInput.setAttribute('readonly', true);
      studentIdInput.setAttribute('disabled', true);
    }

    const emailInput = document.getElementById('editProfileEmail');
    if (emailInput) {
      emailInput.value = u.email || '';
      emailInput.setAttribute('readonly', true);
      emailInput.setAttribute('disabled', true);
    }

    // Editable text attributes
    if (document.getElementById('editProfileFullName')) document.getElementById('editProfileFullName').value = u.name || '';
    
    // Clean raw ciphertext from contact number if present
    let contactVal = u.phone || u.contact_number || '';
    if (typeof contactVal === 'string' && (contactVal.startsWith('enc:gcm:') || contactVal.startsWith('enc:'))) {
      contactVal = '';
    }
    if (document.getElementById('editProfileContact')) document.getElementById('editProfileContact').value = contactVal;

    if (document.getElementById('editProfileCollege')) document.getElementById('editProfileCollege').value = u.college || u.department || '';
    if (document.getElementById('editProfileProgram')) document.getElementById('editProfileProgram').value = u.program || '';

    let emergencyVal = u.emergency_contact || '';
    if (typeof emergencyVal === 'string' && (emergencyVal.startsWith('enc:gcm:') || emergencyVal.startsWith('enc:'))) {
      emergencyVal = '';
    }
    if (document.getElementById('editProfileEmergency')) document.getElementById('editProfileEmergency').value = emergencyVal;

    // Centered avatar rendering
    const previewImg = document.getElementById('editProfileAvatarPreview');
    const previewInitials = document.getElementById('editProfileAvatarInitials');
    const initials = (u.name || 'User')
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    if (u.avatar && u.avatar.length > 50) {
      if (previewImg) {
        previewImg.src = u.avatar;
        previewImg.style.setProperty('display', 'block', 'important');
      }
      if (previewInitials) {
        previewInitials.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (previewImg) {
        previewImg.src = '';
        previewImg.style.setProperty('display', 'none', 'important');
      }
      if (previewInitials) {
        previewInitials.textContent = initials;
        previewInitials.style.setProperty('display', 'flex', 'important');
      }
    }

    const modalEl = document.getElementById('modalEditProfile');
    if (modalEl) {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();
      } else if (typeof openModal === 'function') {
        openModal('modalEditProfile');
      }
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
  }
};

window.removeProfilePhoto = function () {
  currentAvatarBase64 = null;
  const previewImg = document.getElementById('editProfileAvatarPreview');
  const previewInitials = document.getElementById('editProfileAvatarInitials');
  const fileInput = document.getElementById('inputProfilePic');

  if (previewImg) {
    previewImg.src = '';
    previewImg.style.setProperty('display', 'none', 'important');
  }
  if (previewInitials) {
    previewInitials.style.setProperty('display', 'flex', 'important');
  }
  if (fileInput) fileInput.value = '';
};

// Event Bindings and Form Handlers
function initEditProfileForm() {
  // Bind click trigger to profile badge if present
  const profileBadge = document.querySelector('.user-profile-badge, #btnHeaderUserProfile, #userProfileWidget');
  if (profileBadge && !profileBadge.__boundProfileClick) {
    profileBadge.__boundProfileClick = true;
    profileBadge.addEventListener('click', openEditProfileModal);
  }

  // Handle local file selection and convert to Base64
  const inputPic = document.getElementById('inputProfilePic');
  if (inputPic && !inputPic.__boundProfileFile) {
    inputPic.__boundProfileFile = true;
    inputPic.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 3 * 1024 * 1024) {
        alert('File size exceeds the 3MB upload limit.');
        this.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        currentAvatarBase64 = evt.target.result;
        const previewImg = document.getElementById('editProfileAvatarPreview');
        const previewInitials = document.getElementById('editProfileAvatarInitials');
        
        if (previewImg) {
          previewImg.src = currentAvatarBase64;
          previewImg.style.setProperty('display', 'block', 'important');
        }
        if (previewInitials) {
          previewInitials.style.setProperty('display', 'none', 'important');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Profile save event handler
  const formProfile = document.getElementById('formEditUserProfile');
  if (formProfile && !formProfile.__boundProfileSubmit) {
    formProfile.__boundProfileSubmit = true;
    formProfile.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('editProfileFullName')?.value.trim();
      const email = document.getElementById('editProfileEmail')?.value.trim();
      const phone = document.getElementById('editProfileContact')?.value.trim();
      const college = document.getElementById('editProfileCollege')?.value.trim();
      const program = document.getElementById('editProfileProgram')?.value.trim();
      const emergency_contact = document.getElementById('editProfileEmergency')?.value.trim();

      if (!name || !email) {
        alert('Name and Email are required.');
        return;
      }

      try {
        const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name,
            email,
            phone,
            contactNumber: phone,
            college,
            program,
            emergency_contact,
            emergencyContact: emergency_contact,
            avatar: currentAvatarBase64,
            avatarUrl: currentAvatarBase64
          })
        });

        const result = await res.json();
        if (result.success) {
          alert('Profile and avatar updated successfully!');
          
          const headerName = document.getElementById('headerUserName');
          if (headerName) headerName.textContent = name;
          if (typeof state !== 'undefined' && state.currentUser) {
            state.currentUser.name = name;
            state.currentUser.email = email;
            state.currentUser.phone = phone;
            state.currentUser.contact_number = phone;
            state.currentUser.college = college;
            state.currentUser.program = program;
            state.currentUser.emergency_contact = emergency_contact;
            state.currentUser.avatar = currentAvatarBase64;
            state.currentUser.avatarUrl = currentAvatarBase64;
          }
          if (result.token) {
            state.authToken = result.token;
            localStorage.setItem('umak_cgcs_token', result.token);
            localStorage.setItem('token', result.token);
          }
          updatePortalAvatarDisplay(currentAvatarBase64, name);

          const modalEl = document.getElementById('modalEditProfile');
          if (modalEl) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
              bootstrap.Modal.getInstance(modalEl)?.hide();
            }
            if (typeof closeModal === 'function') {
              closeModal('modalEditProfile');
            }
          }
        } else {
          alert(result.message || 'Failed to update profile.');
        }
      } catch (err) {
        console.error('Profile update error:', err);
        alert('Network error saving profile changes.');
      }
    });
  }
}

// Bind event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initEditProfileForm();
});

// ====================================================
// 4. STUDENT BOOKING & DYNAMIC COUNSELOR AVAILABILITY
// ====================================================

window.fetchCounselorAvailability = async function () {
  const date = document.getElementById('bookDate')?.value;
  const timeSelect = document.getElementById('bookTime');
  const noticeBox = document.getElementById('counselorAvailabilityNotice');
  const noticeText = document.getElementById('availabilityNoticeText');

  if (!timeSelect) return;

  if (!date) {
    if (noticeBox) noticeBox.classList.add('hidden');
    return;
  }

  try {
    const query = new URLSearchParams({ date: date || '' }).toString();
    const endpoint = state.currentUser?.role === 'student' ? '/api/student/availability' : '/api/counselor/availability';
    const res = await authFetch(`${endpoint}?${query}`);
    const data = await res.json();

    if (data.success && data.slots) {
      const availableCount = data.slots.filter(s => s.isAvailable && s.status === 'Available').length;
      if (noticeBox && noticeText) {
        noticeBox.classList.remove('hidden');
        noticeText.textContent = `Schedule for ${data.dayOfWeek} (${date}): ${availableCount} slot(s) open for booking.`;
      }

      timeSelect.innerHTML = data.slots.map(s => {
        const isAvail = s.isAvailable && s.status === 'Available';
        if (!isAvail) {
          const reasonLabel = s.status === 'Unavailable' ? '[Unavailable]' : '[Fully Booked]';
          return `<option value="${s.timeSlot}" disabled>${s.timeSlot} ${reasonLabel}</option>`;
        }
        const remaining = s.remainingSlots !== undefined ? s.remainingSlots : (s.maxSlots - (s.currentBooked || 0));
        return `<option value="${s.timeSlot}">${s.timeSlot} [Available - ${remaining} slots remaining]</option>`;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching availability:', err);
  }
};

function sanitizeFocusLabel(label) {
  if (!label) return '';
  return label.replace(/\s*\([^)]*(Dr\.|Elena|Santos|RGC)[^)]*\)/gi, '').trim();
}

function validateBookingDateInterval(selectedDateStr) {
  if (!selectedDateStr) return { valid: true };
  const targetDate = new Date(selectedDateStr);
  const currentUser = state.currentUser || {};
  const pool = (currentUser.role === 'student')
    ? (state.appointments || []).filter(a => isStudentAppointmentOwner(a, currentUser))
    : (state.appointments || []);
  const activeAppts = pool.filter(a => ['Approved', 'Confirmed', 'Pending'].includes(a.status));

  for (const appt of activeAppts) {
    const existingDate = new Date(appt.date);
    const diffInDays = Math.abs((targetDate - existingDate) / (1000 * 60 * 60 * 24));
    if (diffInDays < 14) {
      return {
        valid: false,
        conflictingAppt: appt,
        days: Math.round(diffInDays),
        message: `Consultation Scheduling Notice: To allow adequate time to apply wellness guidance and ensure availability for all students, appointments must be scheduled at least 2 weeks apart from an existing consultation (Selected: ${selectedDateStr}, Existing active: ${appt.date} &bull; ${appt.status}).`
      };
    }
  }
  return { valid: true };
}
window.validateBookingDateInterval = validateBookingDateInterval;

function initStudentBookingForm() {
  const form = document.getElementById('formStudentBookingPage');
  const bookDateInput = document.getElementById('bookDate');
  const warningBox = document.getElementById('bookingIntervalWarning');
  const warningText = document.getElementById('bookingIntervalWarningText');

  // Sanitize all category options present in the DOM for counseling focus selectors
  const focusSelects = [
    document.getElementById('bookType'),
    document.getElementById('appointmentCounselingType'),
    document.getElementById('counselingFocus')
  ];
  focusSelects.forEach(sel => {
    if (sel && sel.options) {
      Array.from(sel.options).forEach(opt => {
        opt.text = sanitizeFocusLabel(opt.text);
      });
    }
  });

  // Real-time 2-Week Interval validation on date picker change
  if (bookDateInput) {
    bookDateInput.addEventListener('change', () => {
      const check = validateBookingDateInterval(bookDateInput.value);
      if (!check.valid) {
        if (warningBox) {
          warningBox.style.display = 'block';
          warningBox.classList.remove('hidden');
          if (warningText) warningText.innerHTML = check.message;
        }
        showToast(check.message, 'warning');
      } else {
        if (warningBox) {
          warningBox.style.display = 'none';
          warningBox.classList.add('hidden');
        }
      }
    });
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;

    // Gate 1: Universal Dual Screening Check (PHQ-9 & GAD-7)
    const allAssessments = (state.studentAssessments || []).concat(state.assessments || []);
    const hasPHQ9 = allAssessments.some(a => (a.assessment_type || a.type) === 'PHQ-9');
    const hasGAD7 = allAssessments.some(a => (a.assessment_type || a.type) === 'GAD-7');
    if (!hasPHQ9 || !hasGAD7) {
      showToast("In accordance with CGCS clinical protocol, please complete your foundational wellness inventories (Personal Well-Being & Stress Coping) before scheduling a consultation.", "warning");
      switchTab('student-assessments');
      return;
    }

    const rawType = document.getElementById('bookType')?.value || '';
    const payload = {
      studentId: state.currentUser.studentId || 'K120-44921',
      studentName: state.currentUser.name,
      email: state.currentUser.email,
      contactNumber: document.getElementById('bookContact')?.value.trim() || state.currentUser.contactNumber || 'N/A',
      college: state.currentUser.college || 'CCIS',
      program: state.currentUser.program || 'Undergraduate Program',
      yearLevel: state.currentUser.yearLevel || '1st Year',
      counselingType: sanitizeFocusLabel(rawType),
      date: document.getElementById('bookDate').value,
      timeSlot: document.getElementById('bookTime').value,
      mode: document.getElementById('bookMode').value,
      reason: document.getElementById('bookReason').value.trim()
    };

    // Gate 2: 2-Week Interval Booking Cadence validation
    const intervalCheck = validateBookingDateInterval(payload.date);
    if (!intervalCheck.valid) {
      if (warningBox) {
        warningBox.style.display = 'block';
        warningBox.classList.remove('hidden');
        if (warningText) warningText.innerHTML = intervalCheck.message;
      }
      showToast(intervalCheck.message, 'warning');
      return;
    }

    try {
      const res = await authFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Your consultation request has been confirmed for ${payload.date} at ${payload.timeSlot}. A guidance specialist has been assigned to your case.`, 'success');
        form.reset();
        if (warningBox) {
          warningBox.style.display = 'none';
          warningBox.classList.add('hidden');
        }
        await fetchAppointments();
      } else {
        showToast(data.message || 'Failed to schedule.', 'error');
      }
    } catch (err) {
      showToast('Network error scheduling session.', 'error');
    }
  });
}

// Client datetime parser for appointment time windows
function getAppointmentTimeRange(dateStr, timeSlotStr) {
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

  function parseTime(dStr, tStr) {
    const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    const d = new Date(dStr + 'T00:00:00');
    if (!match) return d;
    let [_, hStr, mStr, meridian] = match;
    let hours = parseInt(hStr, 10);
    const mins = parseInt(mStr, 10);
    if (meridian) {
      const mer = meridian.toUpperCase();
      if (mer === 'PM' && hours < 12) hours += 12;
      if (mer === 'AM' && hours === 12) hours = 0;
    }
    d.setHours(hours, mins, 0, 0);
    return d;
  }

  const startTime = parseTime(dateStr, startTimeStr);
  const endTime = parseTime(dateStr, endTimeStr);
  if (endTime.getTime() <= startTime.getTime()) {
    endTime.setTime(startTime.getTime() + 60 * 60 * 1000);
  }
  return { startTime, endTime };
}

// ====================================================
// STUDENT TRANSACTION ENHANCEMENTS (RESCHEDULE, EXCUSE SLIP, & APPOINTMENT TRACKER)
// ====================================================

function switchStudentBookingSubtab(subtab) {
  const bookView = document.getElementById('subviewStudentBook');
  const historyView = document.getElementById('subviewStudentHistory');
  const btnBook = document.getElementById('btnStudentSubtabBook');
  const btnHistory = document.getElementById('btnStudentSubtabHistory');

  if (subtab === 'history') {
    if (bookView) bookView.style.display = 'none';
    if (historyView) historyView.style.display = 'block';
    if (btnBook) {
      btnBook.classList.remove('btn-gold', 'active');
      btnBook.classList.add('btn-outline-gold');
    }
    if (btnHistory) {
      btnHistory.classList.remove('btn-outline-gold');
      btnHistory.classList.add('btn-gold', 'active');
    }
    renderStudentMyBookings();
  } else {
    if (bookView) bookView.style.display = 'block';
    if (historyView) historyView.style.display = 'none';
    if (btnBook) {
      btnBook.classList.remove('btn-outline-gold');
      btnBook.classList.add('btn-gold', 'active');
    }
    if (btnHistory) {
      btnHistory.classList.remove('btn-gold', 'active');
      btnHistory.classList.add('btn-outline-gold');
    }
    renderActiveAppointments();
  }
  if (state.currentUser?.role === 'student' && typeof fetchStudentAppointments === 'function') {
    fetchStudentAppointments();
  }
}
window.switchStudentBookingSubtab = switchStudentBookingSubtab;

function isStudentAppointmentOwner(appt, currentUser) {
  if (!appt || !currentUser) return false;
  const currentId = String(currentUser.id || '').trim().toLowerCase();
  const currentSchoolId = String(currentUser.student_id || currentUser.studentId || '').trim().toLowerCase();
  const currentEmail = String(currentUser.email || '').trim().toLowerCase();
  const apptStudentId = String(appt.student_id || '').trim().toLowerCase();
  const apptEmail = String(appt.email || '').trim().toLowerCase();
  return (
    (apptStudentId && (apptStudentId === currentId || apptStudentId === currentSchoolId)) ||
    (apptEmail && apptEmail === currentEmail)
  );
}
window.isStudentAppointmentOwner = isStudentAppointmentOwner;

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Approved':
    case 'Confirmed':
      return 'badge-green';
    case 'Pending':
      return 'badge-gold';
    case 'Pending Reschedule':
    case 'Rescheduled':
      return 'badge-info';
    case 'Completed':
    case 'Concluded':
      return 'badge-green';
    case 'Cancelled':
    case 'Declined':
    case 'No-Show':
      return 'badge-danger';
    default:
      return 'badge-navy';
  }
}
window.getStatusBadgeClass = getStatusBadgeClass;

function renderActiveAppointmentsSummary() {
  const quickList = document.getElementById('studentQuickBookingsList');
  if (!quickList) return;

  const rawAppointments = Array.isArray(state.appointments) ? state.appointments : [];
  const currentUser = state.currentUser || {};
  const studentAppointments = (currentUser.role === 'student')
    ? rawAppointments.filter(a => isStudentAppointmentOwner(a, currentUser))
    : rawAppointments;

  const activeAppts = studentAppointments.filter(a =>
    ['Pending', 'Pending Reschedule', 'Approved', 'Confirmed', 'Rescheduled'].includes(a.status)
  );

  // Sort appointments: Earliest upcoming first (FIFO)
  activeAppts.sort((a, b) => {
    const parseSlot = (s) => (s ? s.split('-')[0].trim() : '00:00');
    const dateA = new Date(`${a.date} ${parseSlot(a.time_slot)}`);
    const dateB = new Date(`${b.date} ${parseSlot(b.time_slot)}`);
    const tA = isNaN(dateA.getTime()) ? new Date(a.date).getTime() : dateA.getTime();
    const tB = isNaN(dateB.getTime()) ? new Date(b.date).getTime() : dateB.getTime();
    return tA - tB; // Ascending: Earliest session appears first
  });

  if (activeAppts.length === 0) {
    quickList.innerHTML = `<div class="text-muted text-center p-3" style="font-size: 13px;">No active appointments scheduled. Use the form to book a consultation.</div>`;
    return;
  }

  quickList.innerHTML = activeAppts.map(appt => {
    const counselorName = escapeHtml(appt.counselor_name || appt.counselor_display || 'Assigned CGCS Licensed Counselor');
    const counselingType = escapeHtml(appt.counseling_type || 'Guidance Consultation');
    const mode = String(appt.mode || '');
    const isOnline = mode.includes('Online') || mode.includes('Video');

    return `
      <div class="active-appointment-card border">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge ${appt.status === 'Approved' ? 'badge-green' : 'badge-gold'} font-weight-bold">
            ${escapeHtml(appt.status)}
          </span>
          <span class="appointment-ref-code"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(appt.id)}</span>
        </div>
        <h5 class="mb-1 font-weight-bold appointment-focus">${counselingType}</h5>
        <p class="mb-1 text-sm counselor-name">
          <i class="fa-solid fa-user-doctor text-gold me-1"></i> ${counselorName}
        </p>
        <p class="mb-2 text-sm appointment-time">
          <i class="fa-solid fa-calendar-day text-gold me-1"></i> <strong>${escapeHtml(appt.date)}</strong> &bull; ${escapeHtml(appt.time_slot)}
        </p>
        <div class="d-flex gap-2 appointment-location">
          ${isOnline ? `
            <button class="btn btn-xs btn-gold" onclick="viewSoonestVideoRoom('${escapeHtml(appt.id)}')">
              <i class="fa-solid fa-video"></i> Join Video Room
            </button>
          ` : `
            <span class="text-xs text-muted"><i class="fa-solid fa-location-dot"></i> Admin Bldg Rm 304</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}
window.renderActiveAppointmentsSummary = renderActiveAppointmentsSummary;
window.renderActiveAppointments = renderActiveAppointmentsSummary;

function renderStudentMyBookings() {
  const tbody = document.getElementById('studentMyBookingsTableBody');
  const pillCount = document.getElementById('studentAppointmentsCountPill');

  const rawAppointments = Array.isArray(state.appointments) ? state.appointments : [];
  const currentUser = state.currentUser || {};
  const appointments = (currentUser.role === 'student')
    ? rawAppointments.filter(a => isStudentAppointmentOwner(a, currentUser))
    : rawAppointments;

  // Sort appointments: Earliest upcoming first (FIFO)
  appointments.sort((a, b) => {
    const parseSlot = (s) => (s ? s.split('-')[0].trim() : '00:00');
    const dateA = new Date(`${a.date} ${parseSlot(a.time_slot)}`);
    const dateB = new Date(`${b.date} ${parseSlot(b.time_slot)}`);
    const tA = isNaN(dateA.getTime()) ? new Date(a.date).getTime() : dateA.getTime();
    const tB = isNaN(dateB.getTime()) ? new Date(b.date).getTime() : dateB.getTime();
    return tA - tB; // Ascending: Earliest session appears first
  });

  if (pillCount) {
    pillCount.textContent = appointments.length;
  }

  // Update quick list summary on Subview A
  renderActiveAppointmentsSummary();

  if (!tbody) return;

  if (appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-muted">No appointments booked yet. Click "Book New Consultation" to request a session.</td></tr>`;
    return;
  }

  tbody.innerHTML = appointments.map(appt => {
    const counselorName = escapeHtml(appt.counselor_name || appt.counselor_display || 'Assigned CGCS Licensed Counselor');
    const counselingType = escapeHtml(appt.counseling_type || 'Guidance Consultation');
    const mode = String(appt.mode || '');
    const isOnline = mode.includes('Video') || mode.includes('Online');
    const todayString = (typeof getPhilippineISOString === 'function') ? getPhilippineISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    let effectiveStatus = appt.status;
    if ((effectiveStatus === 'Completed' || effectiveStatus === 'Concluded') && appt.date > todayString) {
      effectiveStatus = 'Approved';
    }

    let actionsHtml = `<div class="action-buttons-group">`;
    if (effectiveStatus === 'Approved' || effectiveStatus === 'Confirmed') {
      // Slot 1: Location or View Room Button
      if (isOnline) {
        actionsHtml += `
          <div class="action-slot-room">
            <button class="btn btn-xs btn-gold w-100" onclick="viewSoonestVideoRoom('${escapeHtml(appt.id)}')">
              <i class="fa-solid fa-video"></i> View Room
            </button>
          </div>`;
      } else {
        actionsHtml += `
          <div class="action-slot-room">
            <span class="room-badge-pill w-100">
              <i class="fa-solid fa-location-dot"></i> Rm 304
            </span>
          </div>`;
      }
      // Slot 2: Request Reschedule Button
      actionsHtml += `
        <div class="action-slot-reschedule">
          <button class="btn btn-xs btn-outline-gold w-100" onclick="openStudentRescheduleModal('${escapeHtml(appt.id)}')">
            <i class="fa-solid fa-calendar-days"></i> Request Reschedule
          </button>
        </div>`;
      // Slot 3: Empty spacer for alignment
      actionsHtml += `<div class="action-slot-cancel"></div>`;
    } else if (effectiveStatus === 'Pending' || effectiveStatus === 'Pending Reschedule') {
      // Slot 1: Spacer
      actionsHtml += `<div class="action-slot-room"></div>`;
      // Slot 2: Request Reschedule Button
      actionsHtml += `
        <div class="action-slot-reschedule">
          <button class="btn btn-xs btn-outline-gold w-100" onclick="openStudentRescheduleModal('${escapeHtml(appt.id)}')">
            <i class="fa-solid fa-calendar-days"></i> Request Reschedule
          </button>
        </div>`;
      // Slot 3: Cancel Button
      actionsHtml += `
        <div class="action-slot-cancel">
          <button class="btn btn-xs btn-outline-danger w-100" onclick="cancelStudentAppointment('${escapeHtml(appt.id)}')">
            <i class="fa-solid fa-xmark"></i> Cancel
          </button>
        </div>`;
    } else if (effectiveStatus === 'Completed' || effectiveStatus === 'Concluded') {
      actionsHtml += `
        <div style="flex: 1; text-align: right;">
          <button class="btn btn-xs btn-outline-green" onclick="generateAttendanceSlip('${escapeHtml(appt.id)}')">
            <i class="fa-solid fa-file-arrow-down"></i> Download Excuse Slip
          </button>
        </div>`;
    } else {
      actionsHtml += `<div style="flex: 1; text-align: right; color: #94a3b8;">&mdash;</div>`;
    }
    actionsHtml += `</div>`;

    return `
      <tr>
        <td><code>${escapeHtml(appt.id)}</code></td>
        <td>${counselingType}</td>
        <td>${counselorName}</td>
        <td><strong>${escapeHtml(appt.date)}</strong><br><small class="text-muted">${escapeHtml(appt.time_slot)}</small></td>
        <td>${isOnline ? '<i class="fa-solid fa-video text-blue-400"></i> Online Video' : '<i class="fa-solid fa-building text-amber-400"></i> Face-to-Face'}</td>
        <td><span class="badge ${getStatusBadgeClass(effectiveStatus)}">${escapeHtml(effectiveStatus)}</span></td>
        <td class="text-right">${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}
window.renderStudentMyBookings = renderStudentMyBookings;

// ====================================================
// TELE-COUNSELING VIDEO ROOM FLOW & REFRESH PERSISTENCE
// ====================================================

function parseAppointmentDateRange(dateStr, timeSlotStr) {
  return getAppointmentTimeRange(dateStr, timeSlotStr);
}
window.parseAppointmentDateRange = parseAppointmentDateRange;

window.enterWebRtcRoom = function(apptId) {
  if (typeof launchVideoRoom === 'function') {
    launchVideoRoom(apptId);
  } else if (typeof joinActiveVideoSession === 'function') {
    joinActiveVideoSession(apptId);
  }
};
window.joinActiveVideoSession = window.enterWebRtcRoom;

// View Room Navigation & Video Room View Enhancement
window.viewSoonestVideoRoom = async function (apptId) {
  if (apptId) {
    sessionStorage.setItem('cgcs_active_video_appointment_id', apptId);
  }
  let appt = (state.appointments || []).find(a => a.id === apptId);
  if (!appt && typeof fetchStudentAppointments === 'function') {
    await fetchStudentAppointments();
    appt = (state.appointments || []).find(a => a.id === apptId);
  }
  if (!appt) {
    const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
    const pool = isStudent ? (state.appointments || []).filter(a => isStudentAppointmentOwner(a, state.currentUser)) : (state.appointments || []);
    const videoAppts = pool.filter(a =>
      ['Approved', 'Confirmed', 'Rescheduled'].includes(a.status) &&
      a.mode && (a.mode.includes('Video') || a.mode.includes('Online'))
    );
    if (videoAppts.length > 0) {
      appt = videoAppts[0];
      sessionStorage.setItem('cgcs_active_video_appointment_id', appt.id);
    }
  }

  switchTab('video-room-view');

  if (appt) {
    renderVideoRoomAppointmentDetails(appt);
  } else {
    restoreActiveVideoSessionOnLoad();
  }
};

window.downloadExcuseSlip = function (id) {
  if (typeof generateAttendanceSlip === 'function') {
    generateAttendanceSlip(id);
  }
};

function renderVideoRoomDetails(apptId) {
  let appt = (state.appointments || []).find(a => a.id === apptId);
  if (!appt && typeof apptId === 'object' && apptId !== null) {
    appt = apptId;
  }
  if (!appt) {
    const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
    const pool = isStudent ? (state.appointments || []).filter(a => isStudentAppointmentOwner(a, state.currentUser)) : (state.appointments || []);
    const videoAppts = pool.filter(a =>
      ['Approved', 'Confirmed', 'Rescheduled'].includes(a.status) &&
      a.mode && (a.mode.includes('Video') || a.mode.includes('Online'))
    );
    if (videoAppts.length > 0) {
      appt = videoAppts[0];
    }
  }
  if (appt) {
    renderVideoRoomAppointmentDetails(appt);
  }
}
window.renderVideoRoomDetails = renderVideoRoomDetails;

function renderVideoRoomAppointmentDetails(appt) {
  if (!appt) return;

  const container = document.getElementById('videoUpcomingStateContainer');
  const activeStage = document.getElementById('videoActiveStageContainer');
  const waitingCard = document.getElementById('videoPreCallWaitingRoom');

  if (activeStage) activeStage.style.display = 'none';
  if (waitingCard) waitingCard.classList.add('hidden');
  if (container) container.style.display = 'block';

  // Save to sessionStorage for refresh persistence
  sessionStorage.setItem('cgcs_active_video_appointment_id', appt.id);

  const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
  const counselorName = appt.counselor_name || appt.counselor_display || 'Assigned Guidance Counselor';
  const studentDisplay = `${appt.student_name || 'Student'} (${appt.student_id || ''}) - ${appt.college || 'UMak'}`;
  const peerLabel = isStudent ? 'ASSIGNED GUIDANCE COUNSELOR' : 'STUDENT';
  const peerName = isStudent ? counselorName : studentDisplay;

  // Populate header strip
  const apptIdEl = document.getElementById('videoRoomApptId');
  if (apptIdEl) apptIdEl.textContent = appt.id;
  const sessionCodeEl = document.getElementById('videoRoomSessionCode');
  if (sessionCodeEl) sessionCodeEl.textContent = appt.meeting_link || `UMAK-ROOM-${appt.id}`;
  const focusEl = document.getElementById('videoRoomFocus');
  if (focusEl) focusEl.textContent = appt.counseling_type || 'General Guidance';

  const peerNameEl = document.getElementById('videoRoomPeerName');
  if (peerNameEl) peerNameEl.textContent = isStudent ? counselorName : (appt.student_name || 'Student');
  const feedPeerEl = document.getElementById('videoFeedPeerName');
  if (feedPeerEl) feedPeerEl.textContent = isStudent ? counselorName : (appt.student_name || 'Student');

  // Calculate opening time: 10 minutes prior to session start
  const { startTime, endTime } = getAppointmentTimeRange(appt.date, appt.time_slot);
  const now = new Date();
  const opensAt = startTime ? new Date(startTime.getTime() - 10 * 60 * 1000) : null;

  const isWithinWindow = opensAt && endTime && (now.getTime() >= opensAt.getTime() && now.getTime() <= endTime.getTime());
  const isPast = endTime && now.getTime() > endTime.getTime();

  let joinButtonHtml = '';
  if (isPast) {
    joinButtonHtml = `<button class="btn btn-secondary disabled" id="btnJoinVideoRoom" disabled><i class="fa-solid fa-lock"></i> Session Ended</button>`;
  } else if (isWithinWindow) {
    joinButtonHtml = `<button class="btn btn-gold" id="btnJoinVideoRoom" onclick="enterWebRtcRoom('${escapeHtml(appt.id)}')"><i class="fa-solid fa-video"></i> Join Video Call Now</button>`;
  } else {
    joinButtonHtml = `<button class="btn btn-secondary disabled" id="btnJoinVideoRoom" disabled><i class="fa-solid fa-lock"></i> Join Video Call (Locked)</button>`;
  }

  if (container) {
    container.innerHTML = `
      <div class="card p-5 rounded-2xl shadow-xl mb-4" style="border: 2px solid var(--border-color); background: var(--sub-card-bg); border-radius: 16px; padding: 28px; text-align: left;">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-2">
          <div>
            <span class="badge badge-gold mb-2" style="font-size: 12px; padding: 5px 12px; letter-spacing: 0.5px; text-transform: uppercase;">
              <i class="fa-solid fa-calendar-check"></i> CONFIRMED TELE-COUNSELING APPOINTMENT
            </span>
            <h3 style="font-size: 22px; font-weight: 700; color: var(--umak-navy); margin: 6px 0 4px 0;">
              Upcoming Confidential Tele-Counseling Session
            </h3>
            <p style="font-size: 13.5px; color: var(--text-muted); margin: 0;">
              Confidential Guidance &amp; Psychological Support via Secured WebRTC Channel (RA 9258 / RA 10173)
            </p>
          </div>
          <div style="background: var(--card-bg); border: 1.5px solid var(--umak-gold); border-radius: 12px; padding: 8px 16px; text-align: center;">
            <span style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: var(--text-muted); display: block;">Appointment Ref</span>
            <span style="font-size: 15px; font-weight: 800; color: var(--umak-gold); font-family: monospace;">${escapeHtml(appt.id)}</span>
          </div>
        </div>

        <!-- Prominent Live Countdown Box -->
        <div class="countdown-unlock-box" style="margin: 18px 0; border: 1.5px solid var(--umak-gold); background: rgba(245, 158, 11, 0.05); border-radius: 12px; padding: 20px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px;">
            ROOM UNLOCKS IN
          </div>
          <div id="videoRoomLiveCountdown" style="font-family: monospace; font-size: 38px; font-weight: 800; color: #f59e0b; letter-spacing: 2px;">
            --:--:--
          </div>
        </div>

        <!-- Info Cards Grid (3 Columns) -->
        <div class="portal-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px;">
          <div class="p-3 rounded-xl" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px;">
            <span class="text-muted" style="font-size: 11px; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 4px;">${escapeHtml(peerLabel)}</span>
            <strong style="font-size: 14px; color: var(--text-main);">${escapeHtml(peerName)}</strong>
          </div>
          <div class="p-3 rounded-xl" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px;">
            <span class="text-muted" style="font-size: 11px; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 4px;">SCHEDULED DATE &amp; TIME</span>
            <strong style="font-size: 14px; color: var(--text-main);"><i class="fa-solid fa-calendar-day text-gold me-1"></i> ${escapeHtml(appt.date)} &bull; ${escapeHtml(appt.time_slot)}</strong>
          </div>
          <div class="p-3 rounded-xl" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px;">
            <span class="text-muted" style="font-size: 11px; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 4px;">COUNSELING FOCUS &amp; URGENCY</span>
            <strong style="font-size: 14px; color: var(--text-main);"><i class="fa-solid fa-bullseye text-green me-1"></i> ${escapeHtml(appt.counseling_type || 'General Guidance')}</strong>
            <span class="badge ${appt.urgency === 'High' ? 'badge-danger' : appt.urgency === 'Medium' ? 'badge-gold' : 'badge-green'} ml-2" style="font-size: 11px;">${escapeHtml(appt.urgency || 'Normal')}</span>
          </div>
        </div>

        <!-- Room Opening Notice -->
        <div class="alert-notice alert-info mb-4" style="background: rgba(0, 106, 78, 0.1); border: 1px solid var(--umak-green); border-radius: 10px; padding: 14px 16px; font-size: 13.5px; color: var(--text-main);">
          <i class="fa-solid fa-lock text-gold me-2"></i>
          <span><strong>Room Opening Notice:</strong> 🔒 Room will automatically unlock 10 minutes prior to the scheduled consultation time.</span>
        </div>

        <!-- Action Buttons Row -->
        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <button class="btn btn-outline-gold" onclick="openHardwareTestModal()">
            <i class="fa-solid fa-sliders"></i> Test Mic &amp; Camera
          </button>
          ${joinButtonHtml}
        </div>
      </div>
    `;
  }

  startVideoRoomCountdown(appt.id);
}
window.renderVideoRoomAppointmentDetails = renderVideoRoomAppointmentDetails;

function startVideoRoomCountdown(apptId) {
  if (window.videoCountdownInterval) clearInterval(window.videoCountdownInterval);
  if (state.upcomingSessionInterval) clearInterval(state.upcomingSessionInterval);

  let appt = (state.appointments || []).find(a => a.id === apptId);
  if (!appt && typeof apptId === 'object' && apptId !== null) {
    appt = apptId;
  }
  if (!appt) return;

  const { startTime, endTime } = getAppointmentTimeRange(appt.date, appt.time_slot);
  const unlockTime = startTime ? new Date(startTime.getTime() - 10 * 60 * 1000) : new Date(Date.now() + 3600000); // 10 minutes prior

  function updateTimer() {
    const now = new Date();
    const diff = unlockTime.getTime() - now.getTime();
    const isPastEnd = endTime && now.getTime() > endTime.getTime();
    const countdownEl = document.getElementById('videoRoomLiveCountdown') || document.getElementById('teleCountdownText');
    const btnJoin = document.getElementById('btnJoinVideoRoom');

    if (isPastEnd) {
      if (countdownEl) countdownEl.textContent = 'SESSION ENDED';
      if (btnJoin) {
        btnJoin.className = 'btn btn-secondary disabled';
        btnJoin.disabled = true;
        btnJoin.innerHTML = '<i class="fa-solid fa-lock"></i> Session Ended';
      }
      if (window.videoCountdownInterval) clearInterval(window.videoCountdownInterval);
      return;
    }

    if (diff <= 0) {
      if (countdownEl) countdownEl.textContent = 'ROOM OPEN';
      if (btnJoin) {
        btnJoin.className = 'btn btn-gold';
        btnJoin.disabled = false;
        btnJoin.onclick = () => enterWebRtcRoom(appt.id);
        btnJoin.innerHTML = '<i class="fa-solid fa-video"></i> Join Video Call Now';
      }
      if (window.videoCountdownInterval) clearInterval(window.videoCountdownInterval);
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (countdownEl) {
        countdownEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }
  }

  updateTimer();
  window.videoCountdownInterval = setInterval(updateTimer, 1000);
  state.upcomingSessionInterval = window.videoCountdownInterval;
}
window.startVideoRoomCountdown = startVideoRoomCountdown;

async function restoreActiveVideoSessionOnLoad() {
  let savedApptId = sessionStorage.getItem('cgcs_active_video_appointment_id');

  if ((!state.appointments || state.appointments.length === 0) && typeof fetchAppointments === 'function') {
    await fetchAppointments();
  }

  // Fallback: If not in sessionStorage or invalid, automatically find the soonest upcoming video appointment
  if ((!savedApptId || !(state.appointments || []).some(a => a.id === savedApptId)) && state.appointments && state.appointments.length > 0) {
    const isStudent = (state.currentUser?.role || '').toLowerCase() === 'student';
    const pool = isStudent ? state.appointments.filter(a => isStudentAppointmentOwner(a, state.currentUser)) : state.appointments;
    const soonestVideoAppt = pool
      .filter(a => ['Approved', 'Confirmed', 'Rescheduled'].includes(a.status) && (a.mode && (a.mode.includes('Video') || a.mode.includes('Online'))))
      .sort((a, b) => {
        const slotA = a.time_slot ? a.time_slot.split('-')[0].trim() : '00:00';
        const slotB = b.time_slot ? b.time_slot.split('-')[0].trim() : '00:00';
        return new Date(`${a.date} ${slotA}`) - new Date(`${b.date} ${slotB}`);
      })[0];
    if (soonestVideoAppt) {
      savedApptId = soonestVideoAppt.id;
      sessionStorage.setItem('cgcs_active_video_appointment_id', savedApptId);
    }
  }

  if (savedApptId) {
    renderVideoRoomDetails(savedApptId);
    startVideoRoomCountdown(savedApptId);
  } else if (typeof loadUpcomingVideoRoomState === 'function') {
    loadUpcomingVideoRoomState();
  }
}
window.restoreActiveVideoSessionOnLoad = restoreActiveVideoSessionOnLoad;

// FEATURE 1: Student-Initiated Reschedule Logic
function openStudentRescheduleModal(appointmentId) {
  const appt = (state.appointments || []).find(a => a.id === appointmentId);
  if (!appt) {
    showToast('Appointment details could not be found.', 'warning');
    return;
  }

  const idInput = document.getElementById('rescheduleStudentApptId');
  if (idInput) idInput.value = appointmentId;

  const currentText = document.getElementById('rescheduleCurrentScheduleText');
  if (currentText) {
    currentText.innerHTML = `<strong>${escapeHtml(appt.date)}</strong> at <strong>${escapeHtml(appt.time_slot)}</strong> &bull; Counselor: ${escapeHtml(appt.counselor_name || 'Assigned CGCS Counselor')}`;
  }

  const subtitle = document.getElementById('studentRescheduleSubtitle');
  if (subtitle) {
    subtitle.textContent = `Proposing new session schedule for Ref: ${appointmentId} (${appt.counseling_type || 'Consultation'})`;
  }

  // Pre-fill date to tomorrow min
  const newDateInput = document.getElementById('rescheduleNewDate');
  if (newDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    newDateInput.min = tomorrowStr;
    newDateInput.value = appt.date || tomorrowStr;
  }

  const newTimeSelect = document.getElementById('rescheduleNewTime');
  if (newTimeSelect) {
    newTimeSelect.value = appt.time_slot || '';
  }

  const reasonInput = document.querySelector('#modalStudentReschedule #rescheduleReason') || document.getElementById('rescheduleReason');
  if (reasonInput) {
    reasonInput.value = '';
  }

  openModal('modalStudentReschedule');
}
window.openStudentRescheduleModal = openStudentRescheduleModal;

async function submitStudentReschedule(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const apptId = document.getElementById('rescheduleStudentApptId')?.value;
  const newDate = document.getElementById('rescheduleNewDate')?.value;
  const newTime = document.getElementById('rescheduleNewTime')?.value;
  const reasonElem = document.querySelector('#modalStudentReschedule #rescheduleReason') || document.getElementById('rescheduleReason');
  const reason = reasonElem?.value.trim();

  if (!apptId) {
    showToast('Missing appointment reference ID.', 'danger');
    return;
  }
  if (!newDate || !newTime) {
    showToast('Please select both a proposed new date and time slot.', 'warning');
    return;
  }
  if (!reason) {
    showToast('Please provide a reason for your reschedule request.', 'warning');
    return;
  }

  const btnSubmit = document.getElementById('btnSubmitStudentReschedule');
  const origBtnText = btnSubmit ? btnSubmit.innerHTML : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> Submitting Request...`;
  }

  try {
    const res = await authFetch(`/api/appointments/${apptId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate, newTime, reason })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Reschedule request submitted successfully. Your counselor has been notified.', 'success');
      closeModal('modalStudentReschedule');
      await fetchAppointments();
      renderStudentMyBookings();
    } else {
      showToast(data.message || 'Failed to submit reschedule request.', 'warning');
    }
  } catch (err) {
    console.error('Error submitting student reschedule:', err);
    showToast('Network error while submitting reschedule request.', 'danger');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnText;
    }
  }
}
window.submitStudentReschedule = submitStudentReschedule;

async function cancelStudentAppointment(appointmentId) {
  if (!confirm('Are you sure you want to cancel this appointment? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await authFetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Cancelled',
        reason: 'Student cancelled consultation request'
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Appointment has been successfully cancelled.', 'info');
      await fetchAppointments();
      renderStudentMyBookings();
    } else {
      showToast(data.message || 'Failed to cancel appointment.', 'warning');
    }
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    showToast('Network error while cancelling appointment.', 'danger');
  }
}
window.cancelStudentAppointment = cancelStudentAppointment;

// FEATURE 2: Privacy-Preserving Downloadable Attendance / Excuse Slip
async function generateAttendanceSlip(appointmentId) {
  try {
    const res = await authFetch(`/api/appointments/${appointmentId}/attendance-slip`);
    const json = await res.json();

    if (!res.ok || !json.success) {
      showToast(json.message || 'Unable to retrieve excuse slip.', 'warning');
      return;
    }

    const d = json.data;
    const setElemText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '---';
    };

    setElemText('slipRefCode', d.certificateId || appointmentId);
    setElemText('slipCertId', d.certificateId || appointmentId);
    setElemText('slipStudentName', d.studentName);
    setElemText('slipStudentId', d.studentId);
    setElemText('slipCollegeProgram', `${d.college || 'UMak'} - ${d.program || 'Undergraduate'}${d.yearLevel ? ` (${d.yearLevel})` : ''}`);
    setElemText('slipModality', d.modality || 'Face-to-Face Consultation');
    setElemText('slipAttendanceDate', d.attendanceDate);
    setElemText('slipTimeWindow', d.timeSlot);
    setElemText('slipDateIssued', d.issuedAt || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    setElemText('slipCounselorName', d.counselorName);
    setElemText('slipCounselorTitle', d.counselorTitle || 'Registered Guidance Counselor (RGC)');

    openModal('modalExcuseSlip');
  } catch (err) {
    console.error('Error fetching attendance slip:', err);
    showToast('Failed to load excuse slip. Please check your network connection.', 'danger');
  }
}
window.generateAttendanceSlip = generateAttendanceSlip;

window.printExcuseSlipIsolated = function () {
  const excuseDoc = document.getElementById('officialExcuseDocument') || document.querySelector('.official-excuse-document');
  if (!excuseDoc) {
    showToast("Excuse slip document not found.", "error");
    return;
  }
  // Create an invisible iframe to print strictly the Excuse Slip
  let printFrame = document.getElementById('excusePrintFrame');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'excusePrintFrame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
  }
  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Certificate of Counseling Attendance</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { 
            font-family: 'Times New Roman', Georgia, serif; 
            margin: 0; 
            padding: 20px; 
            color: #000; 
            background: #fff; 
            line-height: 1.6;
          }
          * { box-sizing: border-box; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          td { border: 1px solid #cbd5e1; padding: 6px 12px; font-size: 13px; font-family: Arial, sans-serif; }
          .bg-label { background: #f8fafc; font-weight: bold; width: 35%; }
        </style>
      </head>
      <body>
        ${excuseDoc.innerHTML}
      </body>
    </html>
  `);
  doc.close();
  // Print strictly the iframe content
  setTimeout(() => {
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
  }, 250);
};
window.printAttendanceSlip = window.printExcuseSlipIsolated;

function renderStudentAppointments() {
  const countEl = document.getElementById('studentUpcomingCount');
  if (countEl && Array.isArray(state.appointments)) {
    const currentUser = state.currentUser || {};
    const studentAppts = (currentUser.role === 'student')
      ? state.appointments.filter(a => isStudentAppointmentOwner(a, currentUser))
      : state.appointments;
    const upcoming = studentAppts.filter(a => ['Pending', 'Pending Reschedule', 'Approved', 'Confirmed', 'Rescheduled'].includes(a.status));
    countEl.textContent = upcoming.length;
  }
}
window.renderStudentAppointments = renderStudentAppointments;

// ====================================================
// 5. COUNSELOR AVAILABILITY & SCHEDULE MANAGEMENT
// ====================================================

function initCounselorScheduleForm() {
  const form = document.getElementById('formAddCounselorSchedule');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      counselorId: state.currentUser?.id,
      counselorName: state.currentUser?.name,
      dayOfWeek: document.getElementById('schedInputDay').value,
      timeSlot: document.getElementById('schedInputTime').value,
      maxSlots: parseInt(document.getElementById('schedInputMaxSlots').value, 10) || 4,
      status: document.getElementById('schedInputStatus')?.value || 'Available'
    };

    try {
      const res = await authFetch('/api/counselors/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Duty schedule saved successfully.', 'success');
        await loadCounselorSchedules();
      } else {
        showToast(data.message || 'Error saving schedule.', 'error');
      }
    } catch (e) {
      showToast('Error saving schedule.', 'error');
    }
  });
}

async function loadCounselorSchedules() {
  try {
    const res = await authFetch('/api/counselor/schedules');
    const data = await res.json();
    if (data.success && (data.data || data.schedules)) {
      state.counselorSchedules = data.data || data.schedules || [];
      renderCounselorSchedulesTable();
    }
  } catch (e) {
    console.error('Error loading counselor schedules:', e);
  }
}

function renderCounselorSchedulesTable() {
  const tbody = document.getElementById('counselorSchedulesTableBody');
  if (!tbody) return;

  if (state.counselorSchedules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-3 text-muted">No custom schedule slots set yet. Add a slot using the form.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.counselorSchedules.map(s => {
    const statusClass = s.status === 'Available' ? 'status-available' : s.status === 'Unavailable' ? 'status-unavailable' : 'status-fully-booked';
    return `
      <tr>
        <td><strong>${s.day_of_week}</strong></td>
        <td>${s.time_slot}</td>
        <td>${s.max_slots || 4} slots</td>
        <td><span class="status-pill ${statusClass}">${s.status}</span></td>
        <td class="text-right">
          <button class="btn btn-xs btn-outline-gold" onclick="toggleCounselorScheduleStatus('${s.id}', '${s.status}')" title="Rotate status: Available / Unavailable / Fully Booked">
            <i class="fa-solid fa-repeat"></i> Toggle
          </button>
          <button class="btn btn-xs btn-outline-green" style="color: #EF4444; border-color: #EF4444;" onclick="deleteCounselorSchedule('${s.id}')" title="Delete slot">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleCounselorScheduleStatus = async function (id, currentStatus) {
  let nextStatus = 'Available';
  if (currentStatus === 'Available') nextStatus = 'Unavailable';
  else if (currentStatus === 'Unavailable') nextStatus = 'Fully Booked';
  else if (currentStatus === 'Fully Booked') nextStatus = 'Available';

  try {
    const res = await authFetch(`/api/counselor/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Slot status set to ${nextStatus}`, 'success');
      await loadCounselorSchedules();
    }
  } catch (e) {
    showToast('Failed to update slot status.', 'error');
  }
};

window.deleteCounselorSchedule = async function (id) {
  if (!confirm('Are you sure you want to remove this duty schedule slot?')) return;
  try {
    const res = await authFetch(`/api/counselor/schedules/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Schedule slot removed.', 'info');
      await loadCounselorSchedules();
    }
  } catch (e) {
    showToast('Failed to delete schedule slot.', 'error');
  }
};

// ====================================================
// 6. SEPARATED USER DIRECTORY IN DIRECTOR PORTAL
// ====================================================

window.switchAdminUserSubTab = function (subTab) {
  state.adminSubTab = subTab;
  const btnCounselors = document.getElementById('btnSubTabCounselors');
  const btnStudents = document.getElementById('btnSubTabStudents');
  const viewCounselors = document.getElementById('viewAdminCounselors');
  const viewStudents = document.getElementById('viewAdminStudents');

  if (subTab === 'counselors') {
    btnCounselors?.classList.add('active');
    btnStudents?.classList.remove('active');
    viewCounselors?.classList.remove('hidden');
    viewStudents?.classList.add('hidden');
  } else {
    btnStudents?.classList.add('active');
    btnCounselors?.classList.remove('active');
    viewStudents?.classList.remove('hidden');
    viewCounselors?.classList.add('hidden');
  }
};

async function loadAdminData() {
  if (state.currentUser?.role !== 'superadmin' && state.currentUser?.role !== 'director') return;

  try {
    const [usersRes, auditRes] = await Promise.all([
      authFetch('/api/admin/users'),
      authFetch('/api/admin/audit-logs')
    ]);

    const usersData = await usersRes.json();
    const auditData = await auditRes.json();

    if (usersData.data) {
      state.adminCounselors = usersData.counselors || usersData.data.filter(u => u.role === 'counselor' || u.role === 'admin');
      state.adminStudents = usersData.students || usersData.data.filter(u => u.role === 'student');
      renderAdminUsersTables();
    }
    if (auditData.data) {
      state.auditLogs = auditData.data;
      renderAdminAuditTable();
    }
  } catch (e) {
    console.error('Error loading admin data:', e);
  }
}

function renderAdminUsersTables() {
  const tbodyCounselors = document.getElementById('adminCounselorsTableBody');
  const tbodyStudents = document.getElementById('adminStudentsTableBody');
  const countCounselors = document.getElementById('countAdminCounselors');
  const countStudents = document.getElementById('countAdminStudents');

  if (countCounselors) countCounselors.textContent = state.adminCounselors.length;
  if (countStudents) countStudents.textContent = state.adminStudents.length;

  // 1. Render Counselors Table
  if (tbodyCounselors) {
    if (state.adminCounselors.length === 0) {
      tbodyCounselors.innerHTML = `<tr><td colspan="8" class="text-center p-3 text-muted">No counselor records found.</td></tr>`;
    } else {
      tbodyCounselors.innerHTML = state.adminCounselors.map(c => `
        <tr>
          <td><code>${c.id}</code></td>
          <td>
            <div class="student-meta">
              <span class="student-name">${escapeHtml(c.name)}</span>
              <span class="student-sub">${escapeHtml(c.title || 'Guidance Counselor')}</span>
            </div>
          </td>
          <td>
            ${escapeHtml(c.email)}<br>
            <small class="text-muted">${c.contact_number ? `<i class="fa-solid fa-phone"></i> ${escapeHtml(c.contact_number)}` : 'No phone listed'}</small>
          </td>
          <td><strong>${escapeHtml(c.department || 'CGCS')}</strong></td>
          <td><span class="badge badge-gold font-weight-bold">${c.activeCases || 0} Cases</span></td>
          <td><span class="badge ${c.status === 'Active' ? 'badge-green' : 'badge-danger'}">${c.status}</span></td>
          <td><small>${c.last_login ? new Date(c.last_login).toLocaleDateString() : 'Never'}</small></td>
          <td class="text-right">
            ${c.id === state.currentUser.id ? '<small class="text-muted">(Current)</small>' : `
              <button class="btn btn-xs btn-light" onclick="toggleUserStatus('${c.id}', '${c.status}')">
                ${c.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <button class="btn btn-xs btn-outline-green" style="color: #EF4444; border-color: #EF4444;" onclick="deleteUser('${c.id}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            `}
          </td>
        </tr>
      `).join('');
    }
  }

  // 2. Render Students Table
  if (tbodyStudents) {
    if (state.adminStudents.length === 0) {
      tbodyStudents.innerHTML = `<tr><td colspan="9" class="text-center p-3 text-muted">No student accounts registered yet.</td></tr>`;
    } else {
      tbodyStudents.innerHTML = state.adminStudents.map(s => `
        <tr>
          <td><code>${s.id}</code></td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td><span class="badge badge-navy">${s.student_id || 'N/A'}</span></td>
          <td>
            <strong>${s.college || 'N/A'}</strong><br>
            <small class="text-muted">${escapeHtml(s.program || 'Undergraduate')}</small>
          </td>
          <td>${s.year_level || '1st Year'}</td>
          <td>${escapeHtml(s.email)}</td>
          <td><small>${new Date(s.created_at).toLocaleDateString()}</small></td>
          <td><span class="badge ${s.status === 'Active' ? 'badge-green' : 'badge-danger'}">${s.status}</span></td>
          <td class="text-right">
            <button class="btn btn-xs btn-light" onclick="toggleUserStatus('${s.id}', '${s.status}')">
              ${s.status === 'Active' ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-xs btn-outline-green" style="color: #EF4444; border-color: #EF4444;" onclick="deleteUser('${s.id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }
  }
}

function renderAdminAuditTable() {
  const tbody = document.getElementById('adminAuditTableBody');
  if (!tbody) return;

  const validActions = new Set([
    'DPA_PHI_ACCESS',
    'DPA_DUTY_ASSIGN',
    'DPA_USER_MUTATE',
    'DPA_AUTH_LOGIN',
    'DPA_AUTH_LOCKOUT'
  ]);

  const filteredLogs = (state.auditLogs || []).filter(l => {
    if (!l || !l.action) return false;
    const act = l.action.trim();
    const id = String(l.id || '').toLowerCase();
    const details = String(l.details || '').toLowerCase();
    if (id.includes('mock') || details.includes('mock') || details.includes('dummy')) return false;
    return validActions.has(act) || act.startsWith('DPA_');
  });

  if (filteredLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-3 text-muted">No compliance audit logs recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredLogs.map(l => {
    const d = new Date(l.timestamp);
    const timeFormatted = isNaN(d.getTime()) 
      ? (l.timestamp || '') 
      : `${d.toLocaleDateString()} ${d.toLocaleTimeString('en-US', { hour12: true, second: '2-digit' })}`;

    return `
      <tr>
        <td><code>${escapeHtml(l.id || '')}</code></td>
        <td><small class="font-mono">${timeFormatted}</small></td>
        <td><strong>${escapeHtml(l.actor_name || 'System')}</strong></td>
        <td><span class="badge badge-navy">${escapeHtml((l.actor_role || '').toUpperCase())}</span></td>
        <td><span class="badge badge-gold">${escapeHtml(l.action || '')}</span></td>
        <td style="max-width: 320px; font-size: 12px;">${escapeHtml(l.details || '')}</td>
        <td><code>${escapeHtml(l.ip_address || '127.0.0.1')}</code></td>
      </tr>
    `;
  }).join('');
}

window.toggleUserStatus = async function (id, current) {
  const newStatus = current === 'Active' ? 'Deactivated' : 'Active';
  try {
    const res = await authFetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`User status updated to ${newStatus}`, 'success');
      await loadAdminData();
    }
  } catch (e) { }
};

window.deleteUser = async function (id) {
  if (!confirm('Are you sure you want to delete this user account?')) return;
  try {
    const res = await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await loadAdminData();
    }
  } catch (e) { }
};

// ====================================================
// 7. COUNSELOR TRIAGE WORKFLOW & QUEUE
// ====================================================

// Expose unified filter function
window.filterCounselorAppointments = function() {
  const searchInput = document.getElementById('counselorApptSearch') || document.getElementById('queueSearch') || document.getElementById('queueSearchInput') || document.getElementById('filterQueueConcern') || document.querySelector('input[placeholder*="Search appointments by student name"]');
  const concernInput = document.getElementById('filterQueueConcern');
  const dateInput = document.getElementById('queueDateFilter');
  const statusSelect = document.getElementById('filterQueueStatus') || document.getElementById('counselorApptStatusFilter') || document.querySelector('select[name="apptStatusFilter"]');
  const collegeSelect = document.getElementById('filterQueueCollege') || document.getElementById('counselorApptCollegeFilter') || document.querySelector('select[name="apptCollegeFilter"]');

  const term = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const concernTerm = (concernInput ? concernInput.value : '').toLowerCase().trim();
  const dateVal = (dateInput ? dateInput.value : '').trim();
  const status = (statusSelect ? statusSelect.value : '').toLowerCase().trim();
  const college = (collegeSelect ? collegeSelect.value : '').toLowerCase().trim();

  const rows = document.querySelectorAll('#counselorAppointmentsTableBody tr, #counselorQueueTableBody tr');

  rows.forEach(row => {
    // Skip empty state rows
    if (row.querySelector('.empty-state') || row.classList?.contains('empty-state-row') || row.children.length <= 1) return;

    const text = row.textContent.toLowerCase();
    const rowCollege = (row.dataset.college || row.children[2]?.textContent || '').toLowerCase();
    const rowStatus = (row.dataset.status || row.children[6]?.textContent || '').toLowerCase();
    const rowDate = (row.dataset.date || row.children[4]?.textContent || '');
    const rowConcern = (row.children[3]?.textContent || '').toLowerCase();

    const matchesSearch = !term || text.includes(term);
    const matchesConcern = !concernTerm || rowConcern.includes(concernTerm) || text.includes(concernTerm);
    const matchesDate = !dateVal || rowDate.includes(dateVal);
    const matchesStatus = !status || status === 'all' || rowStatus.includes(status);
    const matchesCollege = !college || college === 'all' || rowCollege.includes(college);

    if (matchesSearch && matchesConcern && matchesDate && matchesStatus && matchesCollege) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
};

function initCounselorAppointmentFilters() {
  const searchInput = document.getElementById('queueSearchInput') || document.querySelector('input[placeholder*="Search appointments by student name"]') || document.getElementById('counselorApptSearch') || document.getElementById('queueSearch');
  const concernInput = document.getElementById('filterQueueConcern');
  const dateInput = document.getElementById('queueDateFilter');
  const statusSelect = document.getElementById('filterQueueStatus') || document.getElementById('counselorApptStatusFilter') || document.querySelector('select[name="apptStatusFilter"]');
  const collegeSelect = document.getElementById('filterQueueCollege') || document.getElementById('counselorApptCollegeFilter') || document.querySelector('select[name="apptCollegeFilter"]');
  const btnReset = document.getElementById('btnResetQueueFilter');

  if (searchInput && !searchInput.dataset.filterBound) {
    searchInput.dataset.filterBound = 'true';
    searchInput.addEventListener('input', () => {
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
  if (concernInput && !concernInput.dataset.filterBound) {
    concernInput.dataset.filterBound = 'true';
    concernInput.addEventListener('input', () => {
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
  if (dateInput && !dateInput.dataset.filterBound) {
    dateInput.dataset.filterBound = 'true';
    dateInput.addEventListener('change', () => {
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
  if (statusSelect && !statusSelect.dataset.filterBound) {
    statusSelect.dataset.filterBound = 'true';
    statusSelect.addEventListener('change', () => {
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
  if (collegeSelect && !collegeSelect.dataset.filterBound) {
    collegeSelect.dataset.filterBound = 'true';
    collegeSelect.addEventListener('change', () => {
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
  if (btnReset && !btnReset.dataset.filterBound) {
    btnReset.dataset.filterBound = 'true';
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (concernInput) concernInput.value = '';
      if (dateInput) dateInput.value = '';
      if (statusSelect) statusSelect.value = '';
      if (collegeSelect) collegeSelect.value = '';
      if (typeof window.filterCounselorAppointments === 'function') window.filterCounselorAppointments();
    });
  }
}
window.initCounselorAppointmentFilters = initCounselorAppointmentFilters;

function renderCounselorQueue() {
  const tbodyPending = document.getElementById('counselorPendingTableBody');
  const tbodyAll = document.getElementById('counselorQueueTableBody');
  const badgePending = document.getElementById('pendingApprovalsBadge');

  if (!tbodyPending || !tbodyAll) return;

  // Store in-memory cache
  window.counselorAppointmentsCache = state.appointments || [];

  const pendingList = (state.appointments || []).filter(a => a.status === 'Pending' || a.status === 'Pending Reschedule');
  if (badgePending) badgePending.textContent = `${pendingList.length} Awaiting Review`;

  const todayString = (typeof getPhilippineISOString === 'function') ? getPhilippineISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  // 1. Render Pending Approvals Table (New Requests & Student Reschedule Requests)
  if (pendingList.length === 0) {
    tbodyPending.innerHTML = `<tr><td colspan="7" class="text-center p-3 text-muted">No pending appointment requests. All caught up!</td></tr>`;
  } else {
    tbodyPending.innerHTML = pendingList.map(a => {
      const isToday = a.isToday || (a.date === todayString);
      const isResched = a.status === 'Pending Reschedule';

      let typeHtml = `<span class="badge badge-gold">${escapeHtml(a.counseling_type || 'Counseling')}</span>`;
      if (isResched) {
        typeHtml = `
          <div class="mb-1">
            <span class="badge badge-info" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9; border: 1px solid #0ea5e9;">
              <i class="fa-solid fa-clock-rotate-left"></i> Reschedule Requested
            </span>
          </div>
          <span class="badge badge-gold">${escapeHtml(a.counseling_type || 'Counseling')}</span>
        `;
      }

      let slotHtml = `${isToday ? '<span class="badge-today me-1">TODAY</span>' : ''}${escapeHtml(a.date)}<br><small class="text-muted">${escapeHtml(a.time_slot)}</small>`;
      if (isResched) {
        slotHtml = `
          <div class="fw-bold text-info">${escapeHtml(a.proposed_date || a.date)}</div>
          <small class="text-info fw-semibold">${escapeHtml(a.proposed_time_slot || a.time_slot)}</small>
          <div class="text-muted mt-1" style="font-size: 11px;">Orig: ${escapeHtml(a.original_date || a.date)} (${escapeHtml(a.original_time_slot || a.time_slot)})</div>
        `;
      }

      const reasonHtml = isResched && (a.reschedule_reason || a.reason)
        ? `<div class="text-muted small mt-1" style="font-size: 11px; max-width: 230px;" title="Student Reason: ${escapeHtml(a.reschedule_reason || a.reason)}"><i class="fa-solid fa-quote-left text-info text-xs me-1"></i><em>${escapeHtml(a.reschedule_reason || a.reason)}</em></div>`
        : '';

      let actionButtons = '';
      if (isResched) {
        actionButtons = `
          <button class="btn btn-xs btn-green" onclick="handleApproveReschedule('${a.id}')" title="Approve Reschedule">
            <i class="fa-solid fa-check"></i> Approve Reschedule
          </button>
          <button class="btn btn-xs btn-outline-green" style="border-color: #EF4444; color: #EF4444;" onclick="openDeclineRescheduleModal('${a.id}', '${escapeHtml(a.student_name)}')" title="Decline Reschedule">
            <i class="fa-solid fa-ban"></i> Decline
          </button>
        `;
      } else {
        actionButtons = `
          <button class="btn btn-xs btn-green" onclick="handleApproveAppointment('${a.id}')" title="Approve Request">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button class="btn btn-xs btn-outline-gold" onclick="openRescheduleModal('${a.id}', '${a.date}', '${a.time_slot}', '${escapeHtml(a.student_name)}')" title="Reschedule Request">
            <i class="fa-solid fa-calendar-days"></i> Reschedule
          </button>
          <button class="btn btn-xs btn-outline-green" style="border-color: #EF4444; color: #EF4444;" onclick="openDeclineModal('${a.id}', '${escapeHtml(a.student_name)}')" title="Decline Request">
            <i class="fa-solid fa-ban"></i> Decline
          </button>
        `;
      }

      return `
      <tr id="appt-row-${a.id}" class="${isToday ? 'table-row-today' : ''}" data-college="${escapeHtml(a.college || '')}" data-status="${escapeHtml(a.status || '')}" data-date="${escapeHtml(a.proposed_date || a.date || '')}">
        <td><strong>${a.id}</strong></td>
        <td>
          <div class="student-meta">
            <span class="student-name">${escapeHtml(a.student_name)}</span>
            <span class="student-sub">${a.student_id} • ${escapeHtml(a.email)}</span>
            ${reasonHtml}
          </div>
        </td>
        <td><strong>${a.college}</strong></td>
        <td>${typeHtml}</td>
        <td>${slotHtml}</td>
        <td><small>${escapeHtml(a.mode || 'Face-to-Face')}</small></td>
        <td class="text-right">
          <div class="action-btn-group d-flex justify-content-end gap-1 flex-wrap">
            ${actionButtons}
          </div>
        </td>
      </tr>
      `;
    }).join('');
  }

  // 2. Render All Appointments & History Table
  const allList = state.appointments || [];
  const now = new Date();

  if (allList.length === 0) {
    tbodyAll.innerHTML = `<tr><td colspan="8" class="text-center p-3 text-muted empty-state">No appointments found in records.</td></tr>`;
  } else {
    tbodyAll.innerHTML = allList.map(a => {
      const isApproved = a.status === 'Approved' || a.status === 'Confirmed' || a.status === 'Rescheduled';
      const isVideo = a.mode && (a.mode.includes('Virtual') || a.mode.includes('Video') || a.mode.includes('Online'));
      const { startTime, endTime } = getAppointmentTimeRange(a.date, a.time_slot);
      const isToday = a.isToday || (a.date === todayString);

      let videoBtnHtml = '';
      if (isApproved && isVideo) {
        const currentCounselorName = (state.currentUser?.name || '').trim().toLowerCase();
        const currentCounselorId = (state.currentUser?.id || '').trim();
        const userRole = (state.currentUser?.role || '').toLowerCase();
        const isDirector = ['director', 'superadmin'].includes(userRole);
        const apptCounselorName = (a.counselor_name || '').trim().toLowerCase();
        const apptCounselorId = (a.counselor_id || '').trim();

        const isAssignedToMe = isDirector ||
                               (apptCounselorId && apptCounselorId === currentCounselorId) ||
                               (apptCounselorName && (apptCounselorName === currentCounselorName || apptCounselorName.includes(currentCounselorName) || currentCounselorName.includes(apptCounselorName)));

        if (!isAssignedToMe) {
          videoBtnHtml = `
            <span class="badge badge-light" title="Confidential: Assigned to ${escapeHtml(a.counselor_name || 'Another Counselor')}" style="opacity: 0.75; font-size: 11px;">
              <i class="fa-solid fa-user-lock"></i> ${escapeHtml(a.counselor_name || 'Other Counselor')}
            </span>
          `;
        } else {
          const tenMinsBeforeStart = startTime ? new Date(startTime.getTime() - 10 * 60 * 1000) : null;
          const isPastSession = endTime && now.getTime() > endTime.getTime();
          const isTooEarly = tenMinsBeforeStart && now.getTime() < tenMinsBeforeStart.getTime();

          if (isPastSession) {
            videoBtnHtml = `<span class="badge badge-navy"><i class="fa-solid fa-clock-rotate-left"></i> Concluded</span>`;
          } else if (isTooEarly) {
            const diffMs = tenMinsBeforeStart.getTime() - now.getTime();
            const diffMins = Math.ceil(diffMs / (60 * 1000));
            videoBtnHtml = `
              <button class="btn btn-xs btn-light" onclick="launchVideoRoom('${a.id}')" title="Opens 10 mins before start time">
                <i class="fa-solid fa-lock text-gold"></i> Opens in ${diffMins > 60 ? Math.floor(diffMins / 60) + 'h ' + (diffMins % 60) + 'm' : diffMins + 'm'}
              </button>
            `;
          } else {
            videoBtnHtml = `
              <button class="btn btn-xs btn-green" onclick="launchVideoRoom('${a.id}')" title="Launch Video Consultation">
                <i class="fa-solid fa-video"></i> Video
              </button>
            `;
          }
        }
      }

      const isFuture = a.date > todayString;
      const isPast = a.date < todayString;

      // 1. Frontend Validation: Prevent Premature "Completed" Display
      // A session cannot be displayed as Completed unless the database status is genuinely 'Completed'
      // AND the appointment date/time has arrived/taken place. Future appointments display as 'Approved'.
      let effectiveStatus = a.status || 'Pending';
      if (effectiveStatus === 'Completed' || effectiveStatus === 'Concluded') {
        if (isFuture) {
          effectiveStatus = 'Approved';
        } else if (isToday) {
          const sessionConcluded = endTime && now.getTime() >= endTime.getTime();
          const hasSoap = Boolean(a.has_soap || a.soap_note_id || a.hasSoap);
          if (!sessionConcluded && !hasSoap) {
            effectiveStatus = 'Approved';
          }
        }
      }

      const statusClass = effectiveStatus ? effectiveStatus.toLowerCase().replace(/\s+/g, '-') : 'pending';

      // Status pill badge with explicit No-Show and Pending Reschedule display
      let statusBadgeHtml = '';
      if (effectiveStatus === 'No-Show') {
        statusBadgeHtml = `<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b;"><i class="fa-solid fa-user-clock"></i> No-Show</span>`;
      } else if (effectiveStatus === 'Pending Reschedule') {
        statusBadgeHtml = `<span class="badge badge-info" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9; border: 1px solid #0ea5e9;"><i class="fa-solid fa-clock-rotate-left"></i> Reschedule Requested</span>`;
      } else if (effectiveStatus === 'Completed' || effectiveStatus === 'Concluded') {
        statusBadgeHtml = `<span class="status-pill status-completed"><i class="fa-solid fa-circle-check"></i> Completed</span>`;
      } else {
        statusBadgeHtml = `<span class="status-pill status-${statusClass}">${effectiveStatus}</span>`;
      }

      // Action buttons depending on session state & day-of-schedule locking
      let actionButtonsHtml = '';
      if (['Approved', 'Confirmed', 'Rescheduled', 'Ongoing'].includes(effectiveStatus)) {
        if (isFuture) {
          // Future Appointment: Lock Complete, No-Show, and SOAP until scheduled date arrives
          actionButtonsHtml = `
            ${videoBtnHtml}
            <span class="badge-locked" style="opacity: 0.6; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.25); color: #94a3b8;">
              <i class="fa-solid fa-lock"></i> Available on session date
            </span>
            <button class="btn btn-xs btn-light" disabled title="Locked: SOAP notes can only be documented on or after the scheduled session date" style="opacity: 0.5; cursor: not-allowed;">
              <i class="fa-solid fa-lock text-gold"></i> SOAP
            </button>
          `;
        } else {
          // Day-of-Schedule or Past Unresolved Appointment: Actions are active
          actionButtonsHtml = `
            ${videoBtnHtml}
            <button class="btn btn-xs btn-outline-green" onclick="handleMarkCompleted('${a.id}')" title="Mark Consultation Completed & File SOAP Notes">
              <i class="fa-solid fa-circle-check"></i> Complete
            </button>
            <button class="btn btn-xs btn-outline-warning" onclick="handleMarkNoShow('${a.id}')" title="Mark student as No-Show">
              <i class="fa-solid fa-user-slash"></i> No-Show
            </button>
            <button class="btn btn-xs btn-outline-green" onclick="openSOAPModal('${a.id}', '${a.student_id}', '${escapeHtml(a.student_name)}', '${escapeHtml(a.counseling_type)}')" title="File SOAP Case Notes">
              <i class="fa-solid fa-notes-medical"></i> SOAP
            </button>
          `;
        }
      } else if (effectiveStatus === 'Pending Reschedule') {
        actionButtonsHtml = `
          <button class="btn btn-xs btn-green" onclick="handleApproveReschedule('${a.id}')" title="Approve Reschedule">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button class="btn btn-xs btn-outline-green" style="border-color: #EF4444; color: #EF4444;" onclick="openDeclineRescheduleModal('${a.id}', '${escapeHtml(a.student_name)}')" title="Decline Reschedule">
            <i class="fa-solid fa-ban"></i> Decline
          </button>
        `;
      } else if (effectiveStatus === 'Completed' || effectiveStatus === 'Concluded') {
        actionButtonsHtml = `
          <button class="btn btn-xs btn-outline-green" onclick="openSOAPModal('${a.id}', '${a.student_id}', '${escapeHtml(a.student_name)}', '${escapeHtml(a.counseling_type)}')" title="View/Edit SOAP Case Notes">
            <i class="fa-solid fa-notes-medical"></i> SOAP
          </button>
        `;
      } else if (effectiveStatus === 'Pending') {
        actionButtonsHtml = `
          <button class="btn btn-xs btn-green" onclick="handleApproveAppointment('${a.id}')" title="Approve Request">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button class="btn btn-xs btn-outline-gold" onclick="openRescheduleModal('${a.id}', '${a.date}', '${a.time_slot}', '${escapeHtml(a.student_name)}')" title="Reschedule Request">
            <i class="fa-solid fa-calendar-days"></i> Reschedule
          </button>
          <button class="btn btn-xs btn-outline-green" style="border-color: #EF4444; color: #EF4444;" onclick="openDeclineModal('${a.id}', '${escapeHtml(a.student_name)}')" title="Decline Request">
            <i class="fa-solid fa-ban"></i> Decline
          </button>
        `;
      } else {
        actionButtonsHtml = `<span class="text-muted small">&mdash;</span>`;
      }

      return `
        <tr id="appt-row-${a.id}" class="${isToday ? 'table-row-today' : ''}" data-college="${escapeHtml(a.college || '')}" data-status="${escapeHtml(effectiveStatus)}" data-date="${escapeHtml(a.date || '')}">
          <td><strong>${a.id}</strong></td>
          <td>
            <div class="student-meta">
              <span class="student-name">${escapeHtml(a.student_name)}</span>
              <span class="student-sub">${a.student_id}</span>
            </div>
          </td>
          <td><strong>${a.college}</strong></td>
          <td><span class="badge badge-gold">${escapeHtml(a.counseling_type)}</span></td>
          <td>${isToday ? '<span class="badge-today me-1">TODAY</span>' : ''}${a.date} (${a.time_slot})</td>
          <td><small>${escapeHtml(a.mode)}</small></td>
          <td>${statusBadgeHtml}</td>
          <td class="text-right">
            <div class="action-btn-group d-flex justify-content-end gap-1 flex-wrap">
              ${actionButtonsHtml}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Re-apply filters after API fetch/render
  if (typeof window.filterCounselorAppointments === 'function') {
    window.filterCounselorAppointments();
  }
}

window.handleApproveAppointment = async function (apptId) {
  try {
    const res = await authFetch(`/api/appointments/${apptId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Approved' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await fetchAppointments();
    } else {
      showToast(data.message || 'Error approving appointment.', 'error');
    }
  } catch (err) {
    showToast('Network error approving appointment.', 'error');
  }
};

// FEATURE 1: Handle Mark No-Show
window.handleMarkNoShow = async function (apptId) {
  if (!apptId) return;

  const appt = (state.appointments || []).find(x => x.id === apptId);
  const phtNow = new Date(Date.now() + (8 * 60 * 60 * 1000));
  const todayPhtStr = phtNow.toISOString().slice(0, 10);
  const apptDateStr = String(appt?.date || '').slice(0, 10);
  const todayString = (typeof getPhilippineISOString === 'function') ? getPhilippineISOString().split('T')[0] : todayPhtStr;
  if (apptDateStr && apptDateStr > todayPhtStr) {
    showToast('Cannot mark future appointments as No-Show before the scheduled session date.', 'error');
    alert('Cannot mark future appointments as No-Show before the scheduled session date.');
    return;
  }

  const confirmed = confirm("Are you sure you want to mark this consultation as No-Show? This will notify the student and update official guidance metrics.");
  if (!confirmed) return;

  const reason = prompt("Optional remarks for No-Show record (e.g. Student did not join within 15 minutes of scheduled time):", "Student did not join within 15 minutes of scheduled time");
  if (reason === null) return; // Counselor cancelled prompt

  try {
    const res = await authFetch(`/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'No-Show',
        reason: reason.trim() || 'Student did not attend scheduled consultation'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Appointment marked as No-Show. Gentle notification sent to student.', 'warning');
      await fetchAppointments();
    } else {
      showToast(data.message || 'Error marking appointment as No-Show.', 'error');
    }
  } catch (err) {
    showToast('Network error marking appointment as No-Show.', 'error');
  }
};

// FEATURE 2: Handle Approve Reschedule
window.handleApproveReschedule = async function (apptId) {
  if (!apptId) return;
  try {
    const res = await authFetch(`/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_reschedule', status: 'Approved' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Reschedule request approved successfully.', 'success');
      await fetchAppointments();
    } else {
      showToast(data.message || 'Error approving reschedule request.', 'error');
    }
  } catch (err) {
    showToast('Network error approving reschedule request.', 'error');
  }
};

// FEATURE 2: Open Decline Reschedule Modal
window.openDeclineRescheduleModal = function (apptId, studentName) {
  document.getElementById('declineApptId').value = apptId;
  const titleEl = document.querySelector('#modalDecline .modal-title');
  const subtitleEl = document.getElementById('declineModalSubtitle');
  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-ban text-danger"></i> Decline Reschedule Request';
  if (subtitleEl) subtitleEl.textContent = `Declining requested reschedule for ${studentName} (${apptId})`;
  const selectElem = document.getElementById('declineReasonSelect');
  if (selectElem) {
    selectElem.value = 'Conflict with office duty hours; please choose another slot';
  }
  if (document.getElementById('declineReasonRemarks')) document.getElementById('declineReasonRemarks').value = '';
  const formDecline = document.getElementById('formSubmitDecline');
  if (formDecline) formDecline.dataset.isReschedule = 'true';
  openModal('modalDecline');
};

// FEATURE 3: Direct Post-Session Link (Mark Completed -> Auto-Launch SOAP Notes)
window.handleMarkCompleted = async function (apptId) {
  if (!apptId) return;

  const appt = (state.appointments || []).find(x => x.id === apptId);
  const todayString = (typeof getPhilippineISOString === 'function') ? getPhilippineISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  if (appt && appt.date && appt.date > todayString) {
    showToast('Cannot mark future appointments as completed before the scheduled session date.', 'error');
    alert('Cannot mark future appointments as completed before the scheduled session date.');
    return;
  }

  try {
    const res = await authFetch(`/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Consultation marked as completed.', 'success');
      // Immediately and automatically pop up existing Clinical SOAP Notes Modal
      if (typeof openSoapModal === 'function') {
        openSoapModal(apptId);
      } else if (typeof window.openSOAPModal === 'function') {
        window.openSOAPModal(apptId);
      } else if (typeof openClinicalSoapModal === 'function') {
        openClinicalSoapModal(apptId);
      }
      await fetchAppointments();
    } else {
      showToast(data.message || 'Error completing appointment.', 'error');
    }
  } catch (err) {
    showToast('Network error updating appointment status.', 'error');
  }
};

// Toggles the custom textarea visibility when 'Other' is selected
function toggleCustomRescheduleReason(val) {
  const wrapper = document.getElementById('customRescheduleReasonWrapper');
  const customInput = document.getElementById('customRescheduleReason');
  if (wrapper) {
    if (val === 'Other') {
      wrapper.style.display = 'block';
      if (customInput) customInput.focus();
    } else {
      wrapper.style.display = 'none';
      if (customInput) customInput.value = '';
    }
  }
}
window.toggleCustomRescheduleReason = toggleCustomRescheduleReason;

// Extracts the selected reason or the custom input value for form submission
function getSelectedRescheduleReason() {
  const selectElem = document.querySelector('#modalReschedule #rescheduleReason') || document.getElementById('rescheduleReason');
  const customElem = document.getElementById('customRescheduleReason');
  if (!selectElem) return '';

  if (selectElem.value === 'Other' && customElem && customElem.value.trim()) {
    return customElem.value.trim();
  }
  return selectElem.value;
}
window.getSelectedRescheduleReason = getSelectedRescheduleReason;

window.openRescheduleModal = function (apptId, currentDate, currentTime, studentName) {
  document.getElementById('rescheduleApptId').value = apptId;
  document.getElementById('rescheduleDate').value = currentDate;
  document.getElementById('rescheduleTime').value = currentTime;
  document.getElementById('rescheduleModalSubtitle').textContent = `Proposing new session time for ${studentName} (${apptId})`;
  const selectElem = document.querySelector('#modalReschedule #rescheduleReason') || document.getElementById('rescheduleReason');
  if (selectElem) selectElem.value = '';
  toggleCustomRescheduleReason('');
  openModal('modalReschedule');
};

window.openDeclineModal = function (apptId, studentName) {
  document.getElementById('declineApptId').value = apptId;
  const titleEl = document.querySelector('#modalDecline .modal-title');
  const subtitleEl = document.getElementById('declineModalSubtitle');
  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-ban text-danger"></i> Decline Consultation Request';
  if (subtitleEl) subtitleEl.textContent = `Declining session request for ${studentName} (${apptId})`;
  if (document.getElementById('declineReasonSelect')) document.getElementById('declineReasonSelect').value = '';
  if (document.getElementById('declineReasonRemarks')) document.getElementById('declineReasonRemarks').value = '';
  if (document.getElementById('declineReason')) document.getElementById('declineReason').value = '';
  const formDecline = document.getElementById('formSubmitDecline');
  if (formDecline) formDecline.dataset.isReschedule = 'false';
  openModal('modalDecline');
};

function initTriageWorkflowModals() {
  // Student Reschedule Form
  const formStudentResched = document.getElementById('formStudentReschedule');
  formStudentResched?.addEventListener('submit', (e) => submitStudentReschedule(e));

  // Submit Reschedule (Counselor)
  const formResched = document.getElementById('formSubmitReschedule');
  formResched?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apptId = document.getElementById('rescheduleApptId').value;
    const date = document.getElementById('rescheduleDate').value;
    const timeSlot = document.getElementById('rescheduleTime').value;
    const reason = getSelectedRescheduleReason();

    if (!reason) {
      showToast('Please select or specify a reason for rescheduling.', 'warning');
      return;
    }

    try {
      const res = await authFetch(`/api/appointments/${apptId}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          status: 'Rescheduled', 
          date, 
          timeSlot, 
          reason: reason,
          remarks: reason 
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Appointment rescheduled and student notified.', 'success');
        closeModal('modalReschedule');
        await fetchAppointments();
      } else {
        showToast(data.message || 'Error rescheduling appointment.', 'error');
      }
    } catch (e) {
      showToast('Error rescheduling.', 'error');
    }
  });

  // Submit Decline (handles both regular appointment decline and student reschedule decline)
  const formDecline = document.getElementById('formSubmitDecline');
  formDecline?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apptId = document.getElementById('declineApptId').value;
    const selectedReason = document.getElementById('declineReasonSelect')?.value;
    const remarks = document.getElementById('declineReasonRemarks')?.value?.trim();

    if (!selectedReason) {
      if (typeof showAlert === 'function') showAlert('Please select an official reason for declining.', 'warning');
      else showToast('Please select an official reason for declining.', 'warning');
      return;
    }

    const finalDeclineReason = remarks ? `${selectedReason} - ${remarks}` : selectedReason;
    if (document.getElementById('declineReason')) {
      document.getElementById('declineReason').value = finalDeclineReason;
    }

    const isReschedule = formDecline.dataset?.isReschedule === 'true';

    try {
      const res = await authFetch(`/api/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'Declined', 
          reason: finalDeclineReason,
          action: isReschedule ? 'decline_reschedule' : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(isReschedule ? 'Reschedule request declined and student notified.' : 'Appointment declined and student notified.', 'info');
        closeModal('modalDecline');
        formDecline.dataset.isReschedule = 'false';
        await fetchAppointments();
      } else {
        showToast(data.message || 'Error declining appointment.', 'error');
      }
    } catch (e) {
      showToast('Error declining.', 'error');
    }
  });
}

window.checkSOAPFormValidity = function () {
  const s = document.getElementById('soapSubjective')?.value?.trim();
  const o = document.getElementById('soapObjective')?.value?.trim();
  const a = document.getElementById('soapAssessment')?.value?.trim();
  const p = document.getElementById('soapPlan')?.value?.trim();
  const submitBtn = document.getElementById('btnSubmitSOAP') || document.querySelector('#modalSOAP button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = !(s && o && a && p);
  }
};

// Universal SOAP Modal Opener
window.openSoapModal = function(appointmentId, studentName = '', studentId = '', refCode = '', isReadOnly = false) {
  // If arguments passed as (apptId, studentId, studentName, focus) from legacy callers:
  if (studentName && /^[AKM\d]\d{6,}/i.test(String(studentName).trim()) && studentId && !/^[AKM\d]\d{6,}/i.test(String(studentId).trim())) {
    const temp = studentName;
    studentName = studentId;
    studentId = temp;
  }

  // Day-of-Schedule Guard: Lock SOAP documentation until the scheduled date arrives or session is completed
  const appt = (state.appointments || []).find(x => x.id === appointmentId);
  const todayString = (typeof getPhilippineISOString === 'function') ? getPhilippineISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  if (appt && appt.date && appt.date > todayString && appt.status !== 'Completed') {
    const msg = 'Clinical SOAP documentation is locked until the scheduled session date arrives.';
    if (typeof showToast === 'function') showToast(msg, 'warning');
    else alert(msg);
    return;
  }

  // Find modal by canonical ID or alternate alias
  const modalEl = document.getElementById('modalClinicalSheet') || document.getElementById('modalSoapNotes');
  if (!modalEl) {
    console.error('SOAP Notes modal element not found in DOM.');
    if (typeof showAlert === 'function') showAlert('Unable to open SOAP notes modal. Please refresh the page.', 'danger');
    else alert('Unable to open SOAP notes modal. Please refresh the page.');
    return;
  }

  // Pre-fill hidden IDs
  const inputApptId = document.getElementById('soapAppointmentId');
  const inputLegacyApptId = document.getElementById('soapApptId');
  const inputStudId = document.getElementById('soapStudentId');
  if (inputApptId) inputApptId.value = appointmentId || '';
  if (inputLegacyApptId) inputLegacyApptId.value = appointmentId || '';
  if (inputStudId) inputStudId.value = studentId || '';

  // Pre-fill counselor display
  const counselorDisp = document.getElementById('soapCounselorNameDisplay');
  if (counselorDisp) {
    counselorDisp.textContent = state.currentUser?.name || 'Licensed Counselor';
  }

  // Pre-fill header indicators if provided
  const nameDisp = document.getElementById('soapStudentNameDisplay');
  const idDisp = document.getElementById('soapStudentIdDisplay');
  const refDisp = document.getElementById('soapRefCodeDisplay');
  const collegeDisp = document.getElementById('soapCollegeDisplay');
  const focusDisp = document.getElementById('soapFocusDisplay');
  const schedDisp = document.getElementById('soapSchedDisplay');
  const diagCond = document.getElementById('soapDiagCond');
  const currMeds = document.getElementById('soapCurrMeds');
  const pastMeds = document.getElementById('soapPastMeds');

  if (nameDisp) nameDisp.textContent = studentName || 'Consultation Student';
  if (idDisp) idDisp.textContent = studentId || 'N/A';
  if (refDisp) refDisp.textContent = refCode || `APPT-${appointmentId}`;

  // If student details were not passed, attempt lookup in cached appointments or state
  const apptsList = (window.cachedAppointments && Array.isArray(window.cachedAppointments))
    ? window.cachedAppointments
    : (typeof state !== 'undefined' && Array.isArray(state.appointments) ? state.appointments : []);
  if (apptsList.length > 0) {
    const appt = apptsList.find(a => String(a.id) === String(appointmentId));
    if (appt) {
      if (nameDisp) nameDisp.textContent = appt.student_name || studentName || 'Consultation Student';
      if (idDisp) idDisp.textContent = appt.student_id || studentId || 'N/A';
      if (refDisp) refDisp.textContent = appt.reference_code || refCode || `APPT-${appt.id}`;
      if (inputStudId) inputStudId.value = appt.student_id || '';
      if (collegeDisp) collegeDisp.textContent = appt.college || appt.student_college || 'CCIS';
      if (focusDisp) focusDisp.textContent = appt.counseling_type || appt.concern || 'Academic & Thesis Stress';
      if (schedDisp) schedDisp.textContent = appt.time_slot || (appt.date ? `${appt.date} ${appt.time || ''}` : '08:30 AM - 09:30 AM');
      if (diagCond) diagCond.textContent = appt.diagnosed_conditions || 'None reported';
      if (currMeds) currMeds.textContent = appt.current_medications || 'None reported';
      if (pastMeds) pastMeds.textContent = appt.past_psychiatric_medications || 'None reported';
      if (counselorDisp) counselorDisp.textContent = state.currentUser?.name || appt.counselor_name || 'Licensed Counselor';
    }
  }

  // Clear previous field values & configure edit vs view-only state (Item 5)
  const subj = document.getElementById('soapSubjective');
  const obj = document.getElementById('soapObjective');
  const assess = document.getElementById('soapAssessment');
  const plan = document.getElementById('soapPlan');
  const submitBtn = document.getElementById('btnSubmitSoapNote') || document.querySelector('#formSoapNotes button[type="submit"]');
  const lockedBadge = document.getElementById('soapLockedBadge');

  if (subj) { subj.value = ''; subj.readOnly = isReadOnly; subj.disabled = isReadOnly; }
  if (obj) { obj.value = ''; obj.readOnly = isReadOnly; obj.disabled = isReadOnly; }
  if (assess) { assess.value = ''; assess.readOnly = isReadOnly; assess.disabled = isReadOnly; }
  if (plan) { plan.value = ''; plan.readOnly = isReadOnly; plan.disabled = isReadOnly; }

  if (submitBtn) {
    submitBtn.style.display = isReadOnly ? 'none' : 'inline-flex';
  }
  if (lockedBadge) {
    if (isReadOnly) {
      lockedBadge.classList.remove('d-none');
      lockedBadge.style.display = 'inline-flex';
    } else {
      lockedBadge.classList.add('d-none');
      lockedBadge.style.display = 'none';
    }
  }

  // Optionally load existing note draft if on server
  if (appointmentId) {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    if (token) {
      fetch(`/api/soap/${encodeURIComponent(appointmentId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).then(data => {
        if (data && data.data) {
          if (subj && (!subj.value || isReadOnly)) subj.value = data.data.subjective || '';
          if (obj && (!obj.value || isReadOnly)) obj.value = data.data.objective || '';
          if (assess && (!assess.value || isReadOnly)) assess.value = data.data.assessment || '';
          if (plan && (!plan.value || isReadOnly)) plan.value = data.data.plan || '';
        }
      }).catch(() => {});
    }
  }

  // Clinical Supervision & Case Conference Addendum (RA 9258)
  const supervisorySec = document.getElementById('directorSupervisorySection');
  if (supervisorySec) {
    const userRole = (state.currentUser?.role || '').toLowerCase();
    const isAuthorizedStaff = userRole === 'director' || userRole === 'superadmin' || userRole === 'counselor';
    supervisorySec.style.display = isAuthorizedStaff ? 'block' : 'none';
    const supAppt = document.getElementById('supervisoryAppointmentId');
    const supStud = document.getElementById('supervisoryStudentId');
    if (supAppt) supAppt.value = appointmentId || '';
    if (supStud) supStud.value = studentId || '';
    if (appointmentId && typeof loadSupervisoryNotes === 'function') {
      loadSupervisoryNotes(appointmentId);
    }
  }

  // Show Modal using Bootstrap API
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: 'static',
      keyboard: false
    });
    modalInstance.show();
  } else {
    modalEl.classList.remove('fade');
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
  }
};

// Aliases for compatibility
window.openSOAPModal = window.openSoapModal;
window.openSoapDocumentationDesk = window.openSoapModal;
window.openClinicalSoapModal = window.openSoapModal;

// Form Submission Event
function initSoapNotesForm() {
  const formSoap = document.getElementById('formSoapNotes') || document.getElementById('formSaveSOAP');
  if (formSoap && !formSoap.dataset?.bound) {
    if (!formSoap.dataset) formSoap.dataset = {};
    formSoap.dataset.bound = 'true';
    formSoap.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmitSoapNote') || document.getElementById('btnSubmitSOAP');
      if (btn) btn.disabled = true;

      const payload = {
        appointmentId: document.getElementById('soapAppointmentId')?.value || document.getElementById('soapApptId')?.value,
        studentId: document.getElementById('soapStudentId')?.value,
        subjective: document.getElementById('soapSubjective')?.value.trim(),
        objective: document.getElementById('soapObjective')?.value.trim(),
        assessment: document.getElementById('soapAssessment')?.value.trim(),
        plan: document.getElementById('soapPlan')?.value.trim()
      };

      try {
        const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
        const res = await fetch('/api/soap-notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
          showToast('SOAP Notes documented and encrypted successfully', 'success');

          const modalEl = document.getElementById('modalClinicalSheet') || document.getElementById('modalSoapNotes');
          if (modalEl) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
              bootstrap.Modal.getInstance(modalEl)?.hide();
            } else {
              modalEl.classList.remove('show');
              modalEl.style.display = 'none';
            }
          }
          if (typeof fetchAppointments === 'function') fetchAppointments();
          if (typeof loadCounselorQueue === 'function') loadCounselorQueue();
          if (typeof renderCounselorQueue === 'function') renderCounselorQueue();
          if (typeof fetchCompletedCases === 'function') fetchCompletedCases();
        } else {
          if (typeof showAlert === 'function') showAlert(data.message || 'Failed to file SOAP note.', 'danger');
          else if (typeof showToast === 'function') showToast(data.message || 'Failed to file SOAP note.', 'error');
          else alert(data.message || 'Failed to file SOAP note.');
        }
      } catch (err) {
        if (typeof showAlert === 'function') showAlert('Network error saving SOAP note.', 'danger');
        else if (typeof showToast === 'function') showToast('Network error saving SOAP note.', 'error');
        else alert('Network error saving SOAP note.');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSoapNotesForm);
} else {
  initSoapNotesForm();
}

function renderDocumentedSoapTable(recordsList) {
  const tbody = document.getElementById('documentedSoapTableBody') || document.getElementById('completedCasesTableBody');
  if (!tbody) return;

  if (!recordsList || recordsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 table-empty-state">
          <i class="bi bi-journal-x fs-4 d-block mb-1 text-muted"></i>
          <span class="text-muted">No documented clinical SOAP notes found matching your criteria.</span>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = recordsList.map(r => `
    <tr>
      <td>
        <span class="soap-ref-code">${escapeHtml(r.reference_code || `UMAK-CGCS-2026-${r.appointment_id}`)}</span>
      </td>
      <td>
        <div class="soap-student-name fw-bold">${escapeHtml(r.student_name)}</div>
        <div class="soap-student-id text-muted small">${escapeHtml(r.student_id)}</div>
      </td>
      <td><span class="soap-focus-text">${escapeHtml(r.counseling_focus || 'General Counseling')}</span></td>
      <td><span class="soap-counselor-text">${escapeHtml(r.counselor_name || 'Assigned Counselor')}</span></td>
      <td><span class="soap-date-text text-muted small">${escapeHtml(r.date_concluded ? r.date_concluded.substring(0, 10) : '2026-09-26')}</span></td>
      <td class="text-end">
        <button type="button" class="btn btn-view-soap" onclick="viewSoapDetailsModal('${r.appointment_id || r.soap_id}')">
          <i class="bi bi-eye"></i>
          <span>View SOAP Record</span>
        </button>
      </td>
    </tr>
  `).join('');
}

window.filterSoapNotes = function() {
  const query = (document.getElementById('inputSearchSoapNotes')?.value || '').toLowerCase().trim();
  const userRole = (state.currentUser?.role || '').toLowerCase();
  const currentUserId = state.currentUser?.id;
  const currentUserName = (state.currentUser?.name || '').toLowerCase();

  let baseRecords = (state.allSoapRecords || []);
  if (userRole !== 'director' && userRole !== 'superadmin') {
    baseRecords = baseRecords.filter(r => 
      r.counselor_id === currentUserId || 
      (r.counselor_name && r.counselor_name.toLowerCase().includes(currentUserName))
    );
  }

  if (!query) {
    renderDocumentedSoapTable(baseRecords);
    return;
  }

  const filtered = baseRecords.filter(r => {
    const name = (r.student_name || '').toLowerCase();
    const studId = (r.student_id || '').toLowerCase();
    const date = (r.date_concluded || r.scheduled_date || '').toLowerCase();
    const focus = (r.counseling_focus || '').toLowerCase();
    const cName = (r.counselor_name || '').toLowerCase();
    const subj = (r.subjective || '').toLowerCase();
    const obj = (r.objective || '').toLowerCase();
    const assess = (r.assessment || '').toLowerCase();
    const plan = (r.plan || '').toLowerCase();
    return name.includes(query) || studId.includes(query) || date.includes(query) || focus.includes(query) || cName.includes(query) || subj.includes(query) || obj.includes(query) || assess.includes(query) || plan.includes(query);
  });
  renderDocumentedSoapTable(filtered);
};
window.filterCounselorSoapNotes = window.filterSoapNotes;

async function loadDocumentedClinicalSessions() {
  const tbody = document.getElementById('documentedSoapTableBody') || document.getElementById('completedCasesTableBody');
  if (!tbody) return;

  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/counselor/soap-records', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const records = data.records || [];

    // Strictly filter out any entries lacking documentation content
    const verifiedRecords = records.filter(r => 
      (r.subjective && r.subjective.trim() !== '') || 
      (r.assessment && r.assessment.trim() !== '')
    );

    state.allSoapRecords = verifiedRecords;

    const userRole = (state.currentUser?.role || '').toLowerCase();
    const currentUserId = state.currentUser?.id;
    const currentUserName = (state.currentUser?.name || '').toLowerCase();

    // Enforce patient list scoping: Counselors only see notes for students they have actively counseled
    const scopedRecords = (userRole === 'director' || userRole === 'superadmin')
      ? verifiedRecords
      : verifiedRecords.filter(r => 
          r.counselor_id === currentUserId || 
          (r.counselor_name && r.counselor_name.toLowerCase().includes(currentUserName))
        );

    renderDocumentedSoapTable(scopedRecords);
  } catch (err) {
    console.error('Failed to load documented sessions:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Error loading documented session records.</td></tr>`;
  }
}

async function fetchCompletedCases() {
  await loadDocumentedClinicalSessions();
}

window.loadDocumentedClinicalSessions = loadDocumentedClinicalSessions;
window.fetchCompletedCases = fetchCompletedCases;
window.viewSoapDetailsModal = function (appointmentIdOrSoapId) {
  const record = (state.allSoapRecords || []).find(r => 
    String(r.appointment_id) === String(appointmentIdOrSoapId) || 
    String(r.soap_id) === String(appointmentIdOrSoapId) ||
    String(r.reference_code) === String(appointmentIdOrSoapId)
  );

  if (record) {
    // Open in strictly view-only mode (isReadOnly = true)
    openSoapModal(record.appointment_id || record.soap_id, record.student_name, record.student_id, record.reference_code, true);
    const subj = document.getElementById('soapSubjective');
    const obj = document.getElementById('soapObjective');
    const assess = document.getElementById('soapAssessment');
    const plan = document.getElementById('soapPlan');
    if (subj) subj.value = record.subjective || '';
    if (obj) obj.value = record.objective || '';
    if (assess) assess.value = record.assessment || '';
    if (plan) plan.value = record.plan || '';
  } else {
    openSoapModal(appointmentIdOrSoapId, '', '', '', true);
  }
};


// Non-Diagnostic Severity Wording Helpers (Task 4)
function formatNonDiagnosticSeverity(severity, score) {
  const s = String(severity || '').toLowerCase();
  const num = Number(score || 0);
  if (s.includes('severe') || num >= 15) {
    return 'High Concern';
  } else if (s.includes('moderate') || num >= 10) {
    return 'Moderate Concern';
  } else if (s.includes('mild') || num >= 5) {
    return 'Mild Concern';
  }
  return 'Minimal Concern';
}
window.formatNonDiagnosticSeverity = formatNonDiagnosticSeverity;

function getSeverityBadge(severity, score) {
  const label = formatNonDiagnosticSeverity(severity, score);
  if (label === 'High Concern') {
    return '<span class="badge-severity-high" style="background:#fee2e2; color:#b91c1c; padding:3px 7px; border-radius:6px; font-weight:600; font-size:11px; white-space:nowrap; display:inline-block;">High Concern</span>';
  } else if (label === 'Moderate Concern') {
    return '<span class="badge-severity-med" style="background:#fef3c7; color:#b45309; padding:3px 7px; border-radius:6px; font-weight:600; font-size:11px; white-space:nowrap; display:inline-block;">Moderate Concern</span>';
  }
  return '<span class="badge-severity-low" style="background:#dcfce7; color:#15803d; padding:3px 7px; border-radius:6px; font-weight:600; font-size:11px; white-space:nowrap; display:inline-block;">Mild Concern</span>';
}
window.getSeverityBadge = getSeverityBadge;

// Crisis & Triage Alerts Loader
async function loadCrisisAlerts() {
  try {
    const res = await authFetch('/api/crisis-alerts');
    const data = await res.json();
    if (!data.success || !data.data) return;

    const { flaggedAssessments, crisisNotifications } = data.data;

    // Counselor Crisis Screenings Table
    const tbodyCounselor = document.getElementById('crisisScreeningsTableBody');
    if (tbodyCounselor) {
      if (!flaggedAssessments || flaggedAssessments.length === 0) {
        tbodyCounselor.innerHTML = `<tr><td colspan="7" class="text-center p-3 text-muted">No mental health screenings recorded yet.</td></tr>`;
      } else {
        tbodyCounselor.innerHTML = flaggedAssessments.map(f => {
          const isHigh = f.severity?.toLowerCase().includes('severe') || f.crisis_flag == 1;
          const isMod = f.severity?.toLowerCase().includes('moderate');
          const badgeClass = isHigh ? 'badge-danger' : isMod ? 'badge-gold' : 'badge-green';
          
          const dateTaken = f.created_at ? new Date(f.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }) : 'N/A';

          const hasSent = Number(f.outreach_sent) === 1;

          const actionButtonHtml = hasSent ? `
            <button 
              type="button" 
              disabled
              class="btn btn-sm btn-action-triage"
              style="background: #10b981 !important; color: #ffffff !important; font-weight: 600 !important; font-size: 11px !important; padding: 4px 8px !important; border-radius: 6px !important; border: none !important; opacity: 0.95; cursor: default !important; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"
              title="Start Triage (Outreach Sent)"
              aria-label="Start Triage"
            >
              <i class="fa-solid fa-check"></i> Start Triage<!-- <i class="fa-solid fa-check"></i> Sent -->
            </button>
          ` : `
            <button 
              type="button" 
              onclick="window.sendCounselorCheckIn('${f.student_id || f.user_id}', '${escapeHtml(f.student_name || 'Student')}', '${escapeHtml(f.assessment_type)}', '${f.id}', this)"
              class="btn btn-sm btn-action-talk"
              style="background: #f59e0b; color: #0f172a; font-weight: 600; font-size: 11px; padding: 4px 8px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"
              title="Send check-in notification to student"
              aria-label="Want to Talk"
            >
              <i class="fa-solid fa-comment-dots"></i> Want to Talk
            </button>
          `;

          return `
            <tr>
              <td style="text-align: left; padding: 8px 6px;">
                <div class="student-name-line" style="font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25;" title="${escapeHtml(f.student_name || 'Student')}">${escapeHtml(f.student_name || 'Student')}</div>
                <div class="student-id-line text-muted font-mono" style="font-size: 11px; white-space: nowrap; line-height: 1.2;">${escapeHtml(f.student_id || 'N/A')}</div>
              </td>
              <td style="text-align: center; padding: 8px 6px;">
                <span class="badge badge-navy badge-college" style="padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 12px; display: inline-block;">${escapeHtml(f.college || 'CCIS')}</span>
              </td>
              <td style="text-align: center; padding: 8px 6px;">
                <strong class="screening-type-text" style="font-size: 12px; white-space: nowrap;">${escapeHtml(f.assessment_type)}</strong>
              </td>
              <td style="text-align: center; padding: 8px 6px;">
                <span class="badge ${badgeClass} badge-score" style="padding: 3px 6px; font-size: 11px; font-weight: 700; border-radius: 6px; display: inline-block;">${f.score} pts</span>
              </td>
              <td style="text-align: center; padding: 8px 6px;">
                ${getSeverityBadge(f.severity, f.score)}
              </td>
              <td class="date-taken-cell" style="text-align: center; padding: 8px 6px; white-space: nowrap; font-size: 11.5px; color: var(--text-secondary, #94a3b8);">
                ${dateTaken}
              </td>
              <td class="text-right" style="text-align: right; padding: 8px 8px 8px 6px; white-space: nowrap;">
                ${actionButtonHtml}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Counselor Crisis Notifications Stream
    const notifStream = document.getElementById('crisisNotificationsList');
    if (notifStream) {
      if (!crisisNotifications || crisisNotifications.length === 0) {
        notifStream.innerHTML = `<div class="p-3 text-muted text-center">No active crisis notifications.</div>`;
      } else {
        notifStream.innerHTML = crisisNotifications.map(n => `
          <div style="padding: 10px 14px; background: #FEF2F2; border-left: 3px solid #EF4444; border-radius: 6px; margin-bottom: 8px;">
            <div class="d-flex justify-content-between">
              <strong style="color: #991B1B;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(n.title)}</strong>
              <small class="text-muted">${new Date(n.created_at).toLocaleTimeString()}</small>
            </div>
            <p style="font-size: 12.5px; margin-top: 4px; color: #7F1D1D;">${escapeHtml(n.message)}</p>
          </div>
        `).join('');
      }
    }

    // Super Admin Directorate Crisis Feed
    const tbodyAdmin = document.getElementById('adminCrisisFeedTableBody');
    if (tbodyAdmin) {
      if (!flaggedAssessments || flaggedAssessments.length === 0) {
        tbodyAdmin.innerHTML = `<tr><td colspan="6" class="text-center p-3 text-muted">No mental health screenings recorded yet.</td></tr>`;
      } else {
        tbodyAdmin.innerHTML = flaggedAssessments.map(f => {
          const isHigh = f.severity?.toLowerCase().includes('severe') || f.crisis_flag == 1;
          const isMod = f.severity?.toLowerCase().includes('moderate');
          const badgeClass = isHigh ? 'badge-danger' : isMod ? 'badge-gold' : 'badge-green';
          
          return `
            <tr>
              <td><strong>${escapeHtml(f.student_name || 'Student')}</strong><br><small class="text-muted font-mono">${f.student_id || 'N/A'}</small></td>
              <td><span class="badge badge-navy">${f.college || 'CCIS'}</span></td>
              <td><strong>${f.assessment_type}</strong></td>
              <td><span class="badge ${badgeClass} font-bold">${f.score} pts</span></td>
              <td>${getSeverityBadge(f.severity, f.score)}</td>
              <td><small class="text-muted">${new Date(f.created_at).toLocaleString()}</small></td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('Crisis alert load error:', e);
  }
}

window.sendCounselorCheckIn = async function(studentId, studentName, assessmentType, assessmentId, btn) {
  // Backward compatibility: if assessmentId is HTML element (btn)
  if (assessmentId && typeof assessmentId === 'object' && assessmentId.nodeType) {
    btn = assessmentId;
    assessmentId = null;
  }

  const cleanTest = (assessmentType || '').toUpperCase().includes('PHQ') ? 'PHQ-9' : ((assessmentType || '').toUpperCase().includes('GAD') ? 'GAD-7' : 'Mental Health Screening');

  if (!confirm(`Send a "Want to talk? Book an appointment" notification to ${studentName} for their recent ${cleanTest}?`)) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
  }

  try {
    const res = await authFetch('/api/counselor/reach-out', {
      method: 'POST',
      body: JSON.stringify({ studentId, studentName, assessmentType: cleanTest, assessmentId })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast(`Notification sent to ${studentName}!`, 'success');
      if (btn) {
        btn.style.background = '#10b981';
        btn.style.color = '#ffffff';
        btn.style.cursor = 'default';
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Start Triage<!-- <i class="fa-solid fa-check"></i> Sent -->';
        btn.setAttribute('title', 'Start Triage (Outreach Sent)');
        btn.setAttribute('aria-label', 'Start Triage');
      }
    } else {
      alert(data.message || 'Failed to send notification.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-comment-dots"></i> Want to Talk';
      }
    }
  } catch (err) {
    console.error('Reach out error:', err);
    alert('Network error sending notification.');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-comment-dots"></i> Want to Talk';
    }
  }
};

async function fetchReferrals() {
  try {
    if (typeof loadFacultyReferralsDesk === 'function') {
      await loadFacultyReferralsDesk();
    }
  } catch (e) { }
}

function updateMetrics(stats) {
  const total = state.appointments.length;
  const pending = state.appointments.filter(a => a.status === 'Pending').length;
  const confirmed = state.appointments.filter(a => a.status === 'Approved' || a.status === 'Confirmed').length;
  const completed = state.appointments.filter(a => a.status === 'Completed').length;

  if (document.getElementById('metricQueueTotal')) document.getElementById('metricQueueTotal').textContent = total;
  if (document.getElementById('metricQueuePending')) document.getElementById('metricQueuePending').textContent = pending;
  if (document.getElementById('metricQueueConfirmed')) document.getElementById('metricQueueConfirmed').textContent = confirmed;
  if (document.getElementById('metricQueueCompleted')) document.getElementById('metricQueueCompleted').textContent = completed;
  if (document.getElementById('queueBadge')) document.getElementById('queueBadge').textContent = pending;

  const elActiveStudentsKpi = document.getElementById('kpiActiveSessionStudents');
  if (elActiveStudentsKpi) {
    if (stats && typeof stats.totalActiveStudentsTakingSessions !== 'undefined') {
      elActiveStudentsKpi.textContent = stats.totalActiveStudentsTakingSessions;
    } else if (Array.isArray(state.appointments)) {
      const activeStudentIds = new Set(
        state.appointments
          .filter(a => ['Approved', 'Confirmed', 'Rescheduled', 'Ongoing'].includes(a.status))
          .map(a => a.student_id || a.studentId || a.email || a.student_name)
      );
      elActiveStudentsKpi.textContent = activeStudentIds.size;
    }
  }
}

// ====================================================
// 8. STUDENT MOOD TRACKER & MENTAL HEALTH ASSESSMENTS
// ====================================================

function updateDailyMoodState() {
  const today = new Date().toISOString().split('T')[0];
  const hasLoggedToday = Array.isArray(state.moodLogs) && state.moodLogs.some(log => log.logged_date === today);
  const moodContainer = document.getElementById('dailyMoodSection');
  if (!moodContainer) return;

  const existingBadge = document.getElementById('dailyMoodLoggedAlert');
  if (hasLoggedToday) {
    if (!existingBadge) {
      const badge = document.createElement('div');
      badge.id = 'dailyMoodLoggedAlert';
      badge.className = 'alert alert-info text-center p-2 mb-3';
      badge.innerHTML = '<i class="fa-solid fa-check-circle text-success me-1"></i> You have already recorded your emotional pulse today. See you tomorrow!';
      const form = moodContainer.querySelector('#formLogMood');
      if (form) {
        moodContainer.insertBefore(badge, form);
      } else {
        moodContainer.prepend(badge);
      }
    }
    // Disable mood options & buttons for the rest of today
    moodContainer.querySelectorAll('.mood-choice-card, .mood-choice-card input, .mood-btn, #formLogMood button[type="submit"], #moodIntensityRange, #moodNoteText').forEach(b => {
      b.disabled = true;
      b.classList.add('disabled');
      b.style.pointerEvents = 'none';
      b.style.opacity = '0.65';
    });
  } else {
    if (existingBadge) existingBadge.remove();
    moodContainer.querySelectorAll('.mood-choice-card, .mood-choice-card input, .mood-btn, #formLogMood button[type="submit"], #moodIntensityRange, #moodNoteText').forEach(b => {
      b.disabled = false;
      b.classList.remove('disabled');
      b.style.pointerEvents = 'auto';
      b.style.opacity = '1';
    });
  }
}
window.updateDailyMoodState = updateDailyMoodState;

function initMoodTracker() {
  const slider = document.getElementById('moodIntensityRange');
  const valDisplay = document.getElementById('intensityValDisplay');
  slider?.addEventListener('input', () => {
    valDisplay.textContent = `${slider.value} / 10`;
  });

  const form = document.getElementById('formLogMood');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const today = new Date().toISOString().split('T')[0];
    const hasLoggedToday = Array.isArray(state.moodLogs) && state.moodLogs.some(log => log.logged_date === today);
    if (hasLoggedToday) {
      showToast("You have already logged your emotional wellness pulse for today. Thank you for checking in!", "warning");
      updateDailyMoodState();
      return;
    }

    const selectedMood = document.querySelector('input[name="moodChoice"]:checked')?.value || 'Good';
    const intensity = parseInt(slider.value, 10);
    const note = document.getElementById('moodNoteText').value.trim();

    try {
      const res = await authFetch('/api/mood', {
        method: 'POST',
        body: JSON.stringify({ mood: selectedMood, intensity, note })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('moodNoteText').value = '';
        await fetchMoodHistory();
        updateDailyMoodState();
      } else {
        showToast(data.message || 'Failed to log mood.', 'error');
      }
    } catch (err) {
      showToast('Network error logging mood.', 'error');
    }
  });

  updateDailyMoodState();
}

async function fetchMoodHistory() {
  try {
    const res = await authFetch('/api/mood');
    const data = await res.json();
    if (data.success && data.data) {
      state.moodLogs = data.data;
      renderWeeklyMoodChart(data.data);
      updateDailyMoodState();
    }
  } catch (err) {
    console.error('Error loading mood logs:', err);
  }
}

function renderWeeklyMoodChart(logs) {
  const ctx = document.getElementById('chartWeeklyMood')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const labels = (logs || []).map(l => l.logged_date ? l.logged_date.slice(5) : '');
  const scores = (logs || []).map(l => l.score);

  if (state.charts.weeklyMood) state.charts.weeklyMood.destroy();

  state.charts.weeklyMood = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Mood Level (1: Low to 5: Joyful)',
        data: scores,
        borderColor: isDark ? '#34D399' : '#006A4E',
        backgroundColor: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(0, 106, 78, 0.12)',
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#FFB800',
        pointBorderColor: isDark ? '#10B981' : '#006A4E',
        pointRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: isDark ? '#94A3B8' : '#64748B' },
          grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }
        },
        y: {
          min: 1,
          max: 5,
          ticks: {
            stepSize: 1,
            color: isDark ? '#94A3B8' : '#64748B',
            callback: (v) => {
              const map = { 1: '😫 Burnout', 2: '😰 Stressed', 3: '😐 Neutral', 4: '😊 Good', 5: '🤩 Joyful' };
              return map[v] || v;
            }
          },
          grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}
// ====================================================
// MANDATORY INTAKE & MEDICAL DISCLOSURE MODULE
// ====================================================

function checkStudentIntakeStatus() {
  if (!state.currentUser || state.currentUser.role !== 'student') return;
  const hasCompleted = Boolean(state.currentUser.has_completed_intake);
  const banner = document.getElementById('consultationBookingLockedBanner') || document.getElementById('studentIntakeBanner');
  if (banner) {
    banner.style.display = hasCompleted ? 'none' : 'block';
  }
  const lockedOverlay = document.getElementById('bookingIntakeLockedOverlay');
  if (lockedOverlay) {
    lockedOverlay.style.display = hasCompleted ? 'none' : 'block';
  }
  const formBooking = document.getElementById('formStudentBookingPage');
  if (formBooking) {
    const inputs = formBooking.querySelectorAll('input, select, textarea, button[type="submit"]');
    inputs.forEach(el => {
      el.disabled = !hasCompleted;
    });
    formBooking.style.opacity = hasCompleted ? '1' : '0.5';
    formBooking.style.pointerEvents = hasCompleted ? 'auto' : 'none';
  }
}
window.checkStudentIntakeStatus = checkStudentIntakeStatus;

window.handleScheduleCounselingClick = function () {
  if (state.currentUser?.role === 'student' && !state.currentUser.has_completed_intake) {
    showToast('Please complete your intake assessment and health disclosure first before booking an appointment.', 'warning');
    openIntakeModal();
    return;
  }
  const allAssessments = (state.studentAssessments || []).concat(state.assessments || []);
  const hasPHQ9 = allAssessments.some(a => (a.assessment_type || a.type) === 'PHQ-9');
  const hasGAD7 = allAssessments.some(a => (a.assessment_type || a.type) === 'GAD-7');
  if (!hasPHQ9 || !hasGAD7) {
    showToast("In accordance with CGCS clinical protocol, please complete your foundational wellness inventories (Personal Well-Being & Stress Coping) before scheduling a consultation.", "warning");
    switchTab('student-assessments');
    return;
  }
  switchTab('student-booking');
};

// State storage for both scales so switching never wipes previous answers
window.intakeAnswers = {
  phq9: {},
  gad7: {}
};

const PHQ9_QUESTIONS = [
  "Little interest or pleasure in doing things?",
  "Feeling down, depressed, or hopeless?",
  "Trouble falling or staying asleep, or sleeping too much?",
  "Feeling tired or having little energy?",
  "Poor appetite or overeating?",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down?",
  "Trouble concentrating on things, such as reading the newspaper or watching television?",
  "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless?",
  "Thoughts that you would be better off dead, or of hurting yourself in some way?"
];

const GAD7_QUESTIONS = [
  "Feeling nervous, anxious, or on edge?",
  "Not being able to stop or control worrying?",
  "Worrying too much about different things?",
  "Trouble relaxing?",
  "Being so restless that it is hard to sit still?",
  "Becoming easily annoyed or irritable?",
  "Feeling afraid, as if something awful might happen?"
];

const SCALE_OPTIONS = [
  { label: "Not at all", score: 0 },
  { label: "Several days", score: 1 },
  { label: "More than half the days", score: 2 },
  { label: "Nearly every day", score: 3 }
];

// Initialize Question Renderers
function initIntakeQuestions() {
  const phqBox = document.getElementById('containerPhq9Questions');
  const gadBox = document.getElementById('containerGad7Questions');

  if (phqBox) {
    phqBox.innerHTML = PHQ9_QUESTIONS.map((q, idx) => `
      <div class="intake-q-card">
        <p class="intake-q-title">${idx + 1}. ${q}</p>
        <div class="intake-options-grid">
          ${SCALE_OPTIONS.map(opt => `
            <label class="intake-option-label">
              <input type="radio" name="phq9_q_${idx}" value="${opt.score}" ${window.intakeAnswers && window.intakeAnswers.phq9 && window.intakeAnswers.phq9[idx] === opt.score ? 'checked' : ''} onchange="recordIntakeAnswer('phq9', ${idx}, ${opt.score})">
              <span>${opt.label} (${opt.score})</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  if (gadBox) {
    gadBox.innerHTML = GAD7_QUESTIONS.map((q, idx) => `
      <div class="intake-q-card">
        <p class="intake-q-title">${idx + 1}. ${q}</p>
        <div class="intake-options-grid">
          ${SCALE_OPTIONS.map(opt => `
            <label class="intake-option-label">
              <input type="radio" name="gad7_q_${idx}" value="${opt.score}" ${window.intakeAnswers && window.intakeAnswers.gad7 && window.intakeAnswers.gad7[idx] === opt.score ? 'checked' : ''} onchange="recordIntakeAnswer('gad7', ${idx}, ${opt.score})">
              <span>${opt.label} (${opt.score})</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }
}
window.initIntakeQuestions = initIntakeQuestions;

// Record and Persist Answers in Memory
window.recordIntakeAnswer = function(scale, qIndex, score) {
  if (!window.intakeAnswers) window.intakeAnswers = { phq9: {}, gad7: {} };
  if (!window.intakeAnswers[scale]) window.intakeAnswers[scale] = {};
  window.intakeAnswers[scale][qIndex] = score;
  updateIntakeProgressBadges();
};

// Switch Display Without Losing Data
window.switchIntakeScale = function(scale) {
  const phqBox = document.getElementById('containerPhq9Questions');
  const gadBox = document.getElementById('containerGad7Questions');

  if (scale === 'phq9') {
    if (phqBox) phqBox.style.display = 'block';
    if (gadBox) gadBox.style.display = 'none';
  } else {
    if (phqBox) phqBox.style.display = 'none';
    if (gadBox) gadBox.style.display = 'block';
  }
};

// Update Completion Badges
function updateIntakeProgressBadges() {
  if (!window.intakeAnswers) window.intakeAnswers = { phq9: {}, gad7: {} };
  const phqCount = Object.keys(window.intakeAnswers.phq9 || {}).length;
  const gadCount = Object.keys(window.intakeAnswers.gad7 || {}).length;

  const phqBadge = document.getElementById('badgeStatusPhq9');
  const gadBadge = document.getElementById('badgeStatusGad7');

  if (phqBadge) {
    phqBadge.textContent = phqCount === 9 ? 'PHQ-9: ✓ Complete' : `PHQ-9: ${phqCount}/9`;
    phqBadge.className = phqCount === 9 ? 'badge rounded-pill bg-success' : 'badge rounded-pill bg-secondary';
  }

  if (gadBadge) {
    gadBadge.textContent = gadCount === 7 ? 'GAD-7: ✓ Complete' : `GAD-7: ${gadCount}/7`;
    gadBadge.className = gadCount === 7 ? 'badge rounded-pill bg-success' : 'badge rounded-pill bg-secondary';
  }
}
window.updateIntakeProgressBadges = updateIntakeProgressBadges;

window.openIntakeModal = function () {
  const modalEl = document.getElementById('modalStudentIntake') || document.getElementById('modalIntakeScreening');
  if (!modalEl) return;
  initIntakeQuestions();
  updateIntakeProgressBadges();

  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    let bsModal = bootstrap.Modal.getInstance(modalEl);
    if (!bsModal) bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    bsModal.show();
  } else {
    modalEl.style.display = 'block';
  }
};
window.openStudentIntakeModal = window.openIntakeModal;

window.closeIntakeModal = function () {
  const modalEl = document.getElementById('modalStudentIntake') || document.getElementById('modalIntakeScreening');
  if (!modalEl) return;
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }
  modalEl.style.display = 'none';
};

function initIntakeFormHandler() {
  initIntakeQuestions();

  const formIntake = document.getElementById('formStudentMandatoryIntake') || document.getElementById('formSubmitIntake');
  if (!formIntake || formIntake._intakeBound) return;
  formIntake._intakeBound = true;

  formIntake.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!window.intakeAnswers) window.intakeAnswers = { phq9: {}, gad7: {} };
    const phqCount = Object.keys(window.intakeAnswers.phq9 || {}).length;
    const gadCount = Object.keys(window.intakeAnswers.gad7 || {}).length;

    // 1. Enforce Both Scales
    if (phqCount < 9) {
      alert('Please complete all 9 questions of the PHQ-9 Depression Index before submitting.');
      const selector = document.getElementById('intakeScaleSelector');
      if (selector) selector.value = 'phq9';
      switchIntakeScale('phq9');
      return;
    }

    if (gadCount < 7) {
      alert('Please complete all 7 questions of the GAD-7 Anxiety Index before submitting.');
      const selector = document.getElementById('intakeScaleSelector');
      if (selector) selector.value = 'gad7';
      switchIntakeScale('gad7');
      return;
    }

    // 2. Enforce Medical History
    const diagnosed = (document.getElementById('intakeDiagnosedConditions')?.value || '').trim();
    const currentMeds = (document.getElementById('intakeCurrentMeds')?.value || '').trim();
    const pastMeds = (document.getElementById('intakePastMeds')?.value || '').trim();

    if (!diagnosed || !currentMeds || !pastMeds) {
      alert('Please fill out all medical and medication history questions (or enter "None").');
      return;
    }

    // Calculate Scores
    const phqScore = Object.values(window.intakeAnswers.phq9).reduce((a, b) => a + b, 0);
    const gadScore = Object.values(window.intakeAnswers.gad7).reduce((a, b) => a + b, 0);

    const payload = {
      phq9: { answers: window.intakeAnswers.phq9, total_score: phqScore },
      gad7: { answers: window.intakeAnswers.gad7, total_score: gadScore },
      medical_history: {
        diagnosed_conditions: diagnosed,
        current_medications: currentMeds,
        past_psychiatric_meds: pastMeds
      }
    };

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
      const res = await fetch('/api/student/intake-disclosure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        alert('Intake and Health Disclosure submitted successfully! Appointment booking is now unlocked.');

        // Unlock session booking UI
        const modalEl = document.getElementById('modalStudentIntake') || document.getElementById('modalIntakeScreening');
        if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }
        if (modalEl) modalEl.style.display = 'none';

        const bookingLockedBanner = document.getElementById('consultationBookingLockedBanner') || document.getElementById('studentIntakeBanner');
        if (bookingLockedBanner) bookingLockedBanner.style.display = 'none';

        const bookBtn = document.getElementById('btnOpenBookAppointment');
        if (bookBtn) {
          bookBtn.removeAttribute('disabled');
          bookBtn.classList.remove('btn-secondary');
          bookBtn.classList.add('btn-primary');
        }

        if (typeof state !== 'undefined' && state.currentUser) {
          state.currentUser.has_completed_intake = 1;
          state.currentUser.hasCompletedIntake = 1;
          state.currentUser.intake_completed = 1;
        }

        try {
          const storedUser = JSON.parse(localStorage.getItem('umak_cgcs_user') || '{}');
          storedUser.has_completed_intake = 1;
          storedUser.hasCompletedIntake = 1;
          storedUser.intake_completed = 1;
          localStorage.setItem('umak_cgcs_user', JSON.stringify(storedUser));
        } catch (e) { }

        try {
          const sessUser = JSON.parse(sessionStorage.getItem('umak_cgcs_user') || '{}');
          sessUser.has_completed_intake = 1;
          sessUser.hasCompletedIntake = 1;
          sessUser.intake_completed = 1;
          sessionStorage.setItem('umak_cgcs_user', JSON.stringify(sessUser));
        } catch (e) { }

        checkStudentIntakeStatus();
        if (typeof loadAppointments === 'function') loadAppointments();
        if (typeof fetchAssessments === 'function') await fetchAssessments();
        if (typeof switchTab === 'function') switchTab('student-booking');
      } else {
        alert(data.message || 'Failed to submit intake disclosure.');
      }
    } catch (err) {
      console.error('Intake submission error:', err);
      alert('Network error submitting clinical disclosure.');
    }
  });
}

window.activeAssessmentAnswers = {};

window.openAssessmentModal = function (type) {
  window.activeAssessmentAnswers = {};
  document.getElementById('currentAssessmentType').value = type;

  if (type === 'PHQ-9') {
    document.getElementById('assessmentModalTitle').textContent = 'Personal Well-Being & Mood Rhythm Inventory (PHQ-9)';
    document.getElementById('assessmentModalSubtitle').textContent = 'Over the last 2 weeks, how often have you experienced any of the following life rhythms?';
  } else {
    document.getElementById('assessmentModalTitle').textContent = 'Daily Stress & Coping Screener (GAD-7)';
    document.getElementById('assessmentModalSubtitle').textContent = 'Over the last 2 weeks, how often have you felt overwhelmed by daily pressures or tension?';
  }

  const questions = type === 'PHQ-9' ? PHQ9_QUESTIONS : GAD7_QUESTIONS;
  const container = document.getElementById('assessmentQuestionsBody');

  container.innerHTML = questions.map((q, idx) => `
    <div class="question-item assessment-question-card" id="q-card-${idx + 1}">
      <div class="question-text fw-bold mb-2" style="font-size: 14.5px;">${idx + 1}. ${q}</div>
      <div class="options-grid scale-options">
        <label class="option-pill-label scale-option-label">
          <input type="radio" name="q_${idx}" value="0" onchange="handleAssessmentAnswerChange(${idx + 1}, 0, this)">
          <span>Not at all (0)</span>
        </label>
        <label class="option-pill-label scale-option-label">
          <input type="radio" name="q_${idx}" value="1" onchange="handleAssessmentAnswerChange(${idx + 1}, 1, this)">
          <span>Several days (1)</span>
        </label>
        <label class="option-pill-label scale-option-label">
          <input type="radio" name="q_${idx}" value="2" onchange="handleAssessmentAnswerChange(${idx + 1}, 2, this)">
          <span>More than half (2)</span>
        </label>
        <label class="option-pill-label scale-option-label">
          <input type="radio" name="q_${idx}" value="3" onchange="handleAssessmentAnswerChange(${idx + 1}, 3, this)">
          <span>Nearly every day (3)</span>
        </label>
      </div>
    </div>
  `).join('');

  openModal('modalAssessment');
};

window.handleAssessmentAnswerChange = function(qNum, val, radioEl) {
  window.activeAssessmentAnswers[qNum] = parseInt(val, 10);
  const card = document.getElementById(`q-card-${qNum}`);
  if (card) {
    card.style.border = '';
    card.querySelectorAll('.option-pill-label, .scale-option-label').forEach(lbl => lbl.classList.remove('active'));
    if (radioEl) {
      const parentLabel = radioEl.closest('label');
      if (parentLabel) parentLabel.classList.add('active');
    }
  }
};

document.getElementById('formSubmitAssessment')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentAssessmentType = document.getElementById('currentAssessmentType').value;
  const totalExpected = currentAssessmentType === 'PHQ-9' ? 9 : 7;
  const activeAnswers = window.activeAssessmentAnswers || {};
  const answeredQuestions = Object.keys(activeAnswers);

  if (answeredQuestions.length < totalExpected) {
    // Highlight unanswered cards
    for (let i = 1; i <= totalExpected; i++) {
      const card = document.getElementById(`q-card-${i}`);
      if (!activeAnswers[i] && activeAnswers[i] !== 0) {
        if (card) card.style.border = '1.5px solid #ef4444';
      } else {
        if (card) card.style.border = '';
      }
    }
    showToast(`Please answer all ${totalExpected} questions before submitting (Completed: ${answeredQuestions.length}/${totalExpected}).`, 'warning');
    return;
  }

  const answers = [];
  for (let i = 1; i <= totalExpected; i++) {
    answers.push(activeAnswers[i]);
  }

  try {
    const res = await authFetch('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({ 
        assessmentType: currentAssessmentType, 
        answers,
        dataPrivacyConsent: true 
      })
    });
    const result = await res.json();

    if (result.success) {
      closeModal('modalAssessment');
      showAssessmentResult(result.data);
      await fetchAssessments();
    } else {
      showToast(result.message || 'Error submitting assessment.', 'error');
    }
  } catch (err) {
    showToast('Network error processing assessment.', 'error');
  }
});

function getStudentFriendlySeverity(assessmentType, rawSeverity, score) {
  const s = (rawSeverity || '').toLowerCase();
  
  if (assessmentType === 'PHQ-9') {
    if (s.includes('minimal') || score <= 4) {
      return {
        badgeClass: 'badge-green',
        title: 'Healthy Emotional Balance',
        description: 'Your responses indicate a stable emotional baseline with normal day-to-day fluctuations.'
      };
    } else if (s.includes('mild') || score <= 9) {
      return {
        badgeClass: 'badge-info',
        title: 'Mild Situational Stress',
        description: 'You may be encountering temporary academic or routine fatigue. Gentle self-care and sleep pacing are recommended.'
      };
    } else if (s.includes('moderately severe') || score >= 15) {
      return {
        badgeClass: 'badge-danger',
        title: 'Elevated Emotional Strain — Counselor Care Recommended',
        description: 'You are carrying significant emotional weight. Connecting with your assigned guidance counselor will provide you with a safe, confidential space to unpack this.'
      };
    } else if (s.includes('moderate') || score <= 14) {
      return {
        badgeClass: 'badge-warning',
        title: 'Moderate Stress Load',
        description: 'Noticeable stress is impacting your daily focus. Speaking with a guidance specialist can help you develop coping routines.'
      };
    }
  } else {
    // GAD-7 Framing
    if (s.includes('minimal') || score <= 4) {
      return {
        badgeClass: 'badge-green',
        title: 'Calm & Adaptive Coping',
        description: 'Your stress resilience is currently well-managed.'
      };
    } else if (s.includes('mild') || score <= 9) {
      return {
        badgeClass: 'badge-info',
        title: 'Mild Tension / Routine Pressure',
        description: 'Everyday deadlines may be creating mild tension. Grounding exercises and breaks can help restore calm.'
      };
    } else if (s.includes('moderate') || score <= 14) {
      return {
        badgeClass: 'badge-warning',
        title: 'Heightened Tension & Pressure',
        description: 'You are experiencing persistent worry. A consultation with your counselor can help reframe these stressors.'
      };
    } else {
      return {
        badgeClass: 'badge-danger',
        title: 'High Stress Alert — Counselor Support Recommended',
        description: 'Your tension levels are substantially elevated. We strongly encourage talking with your counselor for structured calming strategies.'
      };
    }
  }
}
window.getStudentFriendlySeverity = getStudentFriendlySeverity;

function showAssessmentResult(data) {
  const scoreNumEl = document.getElementById('resultScoreNum');
  const scoreTypeEl = document.getElementById('resultScoreType');
  const severityBadgeEl = document.getElementById('resultSeverityBadge');
  const recsTextEl = document.getElementById('resultRecommendationsText');

  // Completely hide raw clinical score number and severity badge from student view
  if (scoreNumEl) {
    scoreNumEl.textContent = '';
    scoreNumEl.style.display = 'none';
  }
  if (severityBadgeEl) {
    severityBadgeEl.textContent = '';
    severityBadgeEl.style.display = 'none';
  }

  const friendly = getStudentFriendlySeverity(data?.assessmentType, data?.severity, data?.score);
  if (scoreTypeEl) {
    scoreTypeEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <span class="badge ${friendly.badgeClass} severity-status-pill" style="font-size: 12px; padding: 8px 16px; border-radius: 9999px; font-weight: 700;">
          <i class="fa-solid fa-heart-pulse me-1"></i> ${escapeHtml(friendly.title)}
        </span>
        <strong class="recorded-subtext" style="font-size: 13.5px; margin-top: 4px;">${escapeHtml(data?.assessmentType || 'Mental Health')} Check-in Recorded</strong>
      </div>
    `;
  }

  if (recsTextEl) {
    const supportiveMsg = "Thank you for checking in. Your responses have been securely received by our guidance team. You can book an appointment anytime if you would like supportive counseling.";
    recsTextEl.innerHTML = `
      <p style="font-size: 13.5px; line-height: 1.6; font-weight: 500; margin-bottom: 8px;"><strong>${escapeHtml(friendly.title)}:</strong> ${escapeHtml(friendly.description)}</p>
      <p style="font-size: 12.5px; line-height: 1.5; margin-bottom: 6px;">${supportiveMsg}</p>
      <p style="font-size: 12px; line-height: 1.5;">${escapeHtml(data?.recommendations || 'CGCS guidance counselors are available if you wish to talk.')}</p>
    `;
  }

  const crisisNotice = document.getElementById('resultCrisisNotice');
  if (crisisNotice) {
    if (data && data.crisisFlag) {
      // Show the supportive inline alert/card inside the modal only — DO NOT trigger an automatic popup
      crisisNotice.classList.remove('hidden');
    } else {
      crisisNotice.classList.add('hidden');
    }
  }

  openModal('modalAssessmentResult');
}

// ====================================================
// ====================================================
// CONFIDENTIAL 3-QUESTION POST-SESSION CSAT FEEDBACK
// ====================================================
window.activeRatings = { helpfulness: 0, empathy: 0, ease: 0 };
window.csatRatings = window.activeRatings; // Alias for backward compatibility
window.activeFeedbackAppointmentId = null;
window.feedbackTargetAppointmentId = null;

function initStarRatingHandlers() {
  document.querySelectorAll('.star-rating-row').forEach(row => {
    const field = row.dataset.ratingField;
    const buttons = row.querySelectorAll('.star-btn');
    buttons.forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.value, 10);
        window.activeRatings[field] = val;
        window.csatRatings[field] = val;
        // Highlight stars up to selected value
        buttons.forEach(b => {
          const bVal = parseInt(b.dataset.value, 10);
          if (bVal <= val) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      };
    });
  });
}
window.initStarRatingHandlers = initStarRatingHandlers;

// Call this ONLY when the video session ends
function handleVideoConferenceEnded(appointmentId) {
  // Check if student already gave feedback for this specific appointment
  const alreadyReviewed = sessionStorage.getItem(`csat_given_${appointmentId}`);
  if (alreadyReviewed) {
    if (typeof switchTab === 'function') switchTab('student-booking');
    return;
  }
  // Set the target appointment ID and show modal
  window.feedbackTargetAppointmentId = appointmentId;
  window.activeFeedbackAppointmentId = appointmentId;
  openFeedbackModal(appointmentId);
}
window.handleVideoConferenceEnded = handleVideoConferenceEnded;

function openFeedbackModal(appointmentId) {
  window.activeFeedbackAppointmentId = appointmentId;
  window.feedbackTargetAppointmentId = appointmentId;
  window.activeRatings = { helpfulness: 0, empathy: 0, ease: 0 };
  window.csatRatings = window.activeRatings;
  
  // Reset star button states
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
  const commentsInput = document.getElementById('csatReflectionText');
  if (commentsInput) commentsInput.value = '';
  const modal = document.getElementById('modalSessionFeedback');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.classList.remove('hidden');
    initStarRatingHandlers();
  }
}
window.openFeedbackModal = openFeedbackModal;

function closeFeedbackModal() {
  const modal = document.getElementById('modalSessionFeedback');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
    modal.classList.add('hidden');
  }
  const targetId = window.activeFeedbackAppointmentId || window.feedbackTargetAppointmentId;
  if (targetId) {
    sessionStorage.setItem(`csat_given_${targetId}`, 'skipped');
    sessionStorage.setItem(`csat_skipped_${targetId}`, 'true');
  }
}
window.closeFeedbackModal = closeFeedbackModal;

async function submitSessionFeedback() {
  const { helpfulness, empathy, ease } = window.activeRatings;
  if (!helpfulness || !empathy || !ease) {
    showToast("Please select a 1 to 5 star rating for all 3 questions.", "warning");
    return;
  }
  const apptId = window.activeFeedbackAppointmentId || window.feedbackTargetAppointmentId;
  const reflection = document.getElementById('csatReflectionText')?.value || '';
  try {
    const res = await authFetch(`/api/appointments/${apptId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratingHelpfulness: helpfulness,
        ratingEmpathy: empathy,
        ratingEase: ease,
        studentReflection: reflection,
        helpfulness: helpfulness,
        empathy: empathy,
        ease: ease,
        comments: reflection
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Thank you! Your feedback was submitted anonymously.", "success");
      if (apptId) {
        sessionStorage.setItem(`csat_given_${apptId}`, 'submitted');
        sessionStorage.setItem(`csat_completed_${apptId}`, 'true');
      }
      closeFeedbackModal();
      if (typeof fetchStudentAppointments === 'function') {
        await fetchStudentAppointments();
      }
    } else {
      showToast(data.message || "Failed to submit feedback.", "error");
    }
  } catch (e) {
    showToast("Network error submitting feedback.", "error");
  }
}
window.submitSessionFeedback = submitSessionFeedback;

async function openCounselorFeedbackModal() {
  const modal = document.getElementById('modalCounselorFeedback');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.classList.remove('hidden');
  }
  const listEl = document.getElementById('counselorFeedbackList');
  if (listEl) {
    listEl.innerHTML = `<div class="text-center p-4 text-muted small csat-empty-state"><i class="fa-solid fa-spinner fa-spin me-2"></i> Loading feedback records...</div>`;
  }
  try {
    const res = await authFetch('/api/counselor/feedbacks');
    const data = await res.json();
    if (!data.success) {
      if (listEl) {
        listEl.innerHTML = `<div class="text-center p-4 text-danger small csat-empty-state">${escapeHtml(data.message || 'Failed to load feedback records.')}</div>`;
      }
      return showToast(data.message || 'Failed to load feedback records.', 'error');
    }
    // Populate Stats
    const elOverall = document.getElementById('csatOverallScore');
    const elHelp = document.getElementById('csatHelpfulnessScore');
    const elEmpathy = document.getElementById('csatEmpathyScore');
    const elTotal = document.getElementById('csatTotalCount');
    if (elOverall) elOverall.textContent = `${data.stats?.overallRating ?? '0.0'}★`;
    if (elHelp) elHelp.textContent = `${data.stats?.helpfulnessRating ?? '0.0'}★`;
    if (elEmpathy) elEmpathy.textContent = `${data.stats?.empathyRating ?? '0.0'}★`;
    if (elTotal) elTotal.textContent = data.stats?.totalEvaluations ?? 0;
    if (listEl) {
      if (!data.feedbacks || data.feedbacks.length === 0) {
        listEl.innerHTML = `<div class="text-center p-4 text-muted small csat-empty-state">No session evaluations received yet.</div>`;
      } else {
        listEl.innerHTML = data.feedbacks.map(f => {
          const avgScore = Number(f.average_score) || 0;
          const roundedScore = Math.min(5, Math.max(0, Math.round(avgScore)));
          const starsFilled = '★'.repeat(roundedScore);
          const starsEmpty = '☆'.repeat(Math.max(0, 5 - roundedScore));
          const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'Recent';
          const reflection = f.student_reflection ? escapeHtml(f.student_reflection) : 'The student rated this session without written comments.';
          const helpfulness = f.rating_helpfulness ?? 0;
          const empathy = f.rating_empathy ?? 0;
          const ease = f.rating_ease ?? 0;
          return `
          <div class="csat-feedback-card feedback-card p-3 rounded mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <div class="text-gold font-weight-bold" style="font-size: 13px;">
                ${starsFilled}${starsEmpty}
                <span class="csat-score-badge ms-1 text-xs">${avgScore.toFixed(1)} / 5.0</span>
              </div>
              <small class="csat-date text-muted" style="font-size: 11px;">
                <i class="fa-regular fa-clock me-1"></i>${dateStr}
              </small>
            </div>
            <p class="csat-comment mb-1 text-sm" style="font-style: italic;">
              "${reflection}"
            </p>
            <div class="csat-breakdown d-flex gap-3 text-xs text-muted mt-2">
              <span>Helpfulness: <strong>${helpfulness}/5</strong></span>
              <span>Empathy: <strong>${empathy}/5</strong></span>
              <span>Scheduling: <strong>${ease}/5</strong></span>
            </div>
          </div>
        `;
        }).join('');
      }
    }
    openModal('modalCounselorFeedback');
  } catch (err) {
    console.error('Error opening counselor feedback modal:', err);
    if (listEl) {
      listEl.innerHTML = `<div class="text-center p-4 text-danger small csat-empty-state">Failed to load feedback records.</div>`;
    }
    showToast('Failed to load feedback records.', 'error');
  }
}
window.openCounselorFeedbackModal = openCounselorFeedbackModal;
window.viewStudentFeedback = openCounselorFeedbackModal;

window.openEmergencyCrisisOverlay = function () {
  openModal('modalEmergencyCrisis');
};

function renderStudentAssessmentsHistory() {
  const tbody = document.getElementById('studentAssessmentsHistoryBody');
  const countEl = document.getElementById('studentAssessmentsCount');
  if (!tbody) return;

  if (countEl) countEl.textContent = state.assessments.length;

  if (!state.assessments || state.assessments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-muted">No assessments completed yet. Take a screening above when you feel ready.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.assessments.map(a => `
    <tr>
      <td><strong>${escapeHtml(a.assessment_type)}</strong></td>
      <td>
        <span class="badge badge-green" style="font-size: 11px; padding: 4px 10px; border-radius: 9999px;">
          <i class="fa-solid fa-circle-check"></i> Completed
        </span>
      </td>
      <td style="max-width: 420px; font-size: 12.5px; line-height: 1.5; color: var(--text-primary);">
        ${escapeHtml(a.recommendations || 'Response recorded. CGCS counselors are available if you wish to talk.')}
      </td>
      <td><small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small></td>
    </tr>
  `).join('');
}

// ====================================================
// 9. SECURE UNIQUE WEBRTC VIDEO CONFERENCING ROOM
// ====================================================

state.sessionCountdownInterval = null;
state.waitingRoomCountdownInterval = null;
state.upcomingSessionInterval = null;

// Hardware camera and microphone media stream state
let localStream = null;

async function startCameraAndMic() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });

    const videoElements = [
      document.getElementById('localVideoPreview'),
      document.querySelector('#modalVideoRoom video')
    ].filter(Boolean);

    for (const videoElement of videoElements) {
      videoElement.srcObject = localStream;
      videoElement.muted = true; // Mute local feedback
      try {
        await videoElement.play();
      } catch (playErr) {
        console.warn('Video preview play warning:', playErr);
      }
    }

    const selfPlaceholder = document.getElementById('localVideoSelfPlaceholder');
    if (selfPlaceholder) selfPlaceholder.style.display = 'none';

    state.video.micOn = true;
    state.video.camOn = true;
    updateMediaControlUI();
  } catch (err) {
    console.error('Media device error:', err);
    alert('Unable to access camera or microphone. Please allow camera and mic permissions in your browser settings.');
  }
}

function stopCameraAndMic() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  const videoElements = [
    document.getElementById('localVideoPreview'),
    document.querySelector('#modalVideoRoom video')
  ].filter(Boolean);

  for (const videoElement of videoElements) {
    videoElement.srcObject = null;
  }

  const selfPlaceholder = document.getElementById('localVideoSelfPlaceholder');
  if (selfPlaceholder) selfPlaceholder.style.display = 'flex';
}

function updateMediaControlUI() {
  const micBtns = [document.getElementById('btnToggleMic'), document.getElementById('modalBtnToggleMic')].filter(Boolean);
  micBtns.forEach(btn => {
    btn.classList.toggle('active-off', !state.video.micOn);
    btn.innerHTML = state.video.micOn
      ? '<i class="fa-solid fa-microphone"></i>'
      : '<i class="fa-solid fa-microphone-slash text-danger"></i>';
  });

  const camBtns = [document.getElementById('btnToggleCam'), document.getElementById('modalBtnToggleCam')].filter(Boolean);
  camBtns.forEach(btn => {
    btn.classList.toggle('active-off', !state.video.camOn);
    btn.innerHTML = state.video.camOn
      ? '<i class="fa-solid fa-video"></i>'
      : '<i class="fa-solid fa-video-slash text-danger"></i>';
  });
}

window.loadUpcomingVideoRoomState = async function () {
  const container = document.getElementById('videoUpcomingStateContainer');
  const activeStage = document.getElementById('videoActiveStageContainer');
  const waitingCard = document.getElementById('videoPreCallWaitingRoom');

  if (!container) return;

  // If in an active video session, keep active stage visible and hide upcoming state container
  if (state.activeSession && state.activeSession.isWithinWindow) {
    container.style.display = 'none';
    if (activeStage) activeStage.style.display = 'block';
    if (waitingCard) waitingCard.classList.add('hidden');
    return;
  }

  if (activeStage) activeStage.style.display = 'none';
  if (waitingCard) waitingCard.classList.add('hidden');
  container.style.display = 'block';

  try {
    const res = await authFetch('/api/video-room/upcoming');
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `
        <div class="card p-4 text-center">
          <p class="text-danger font-medium"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(data.message || 'Failed to fetch appointment status.')}</p>
        </div>
      `;
      return;
    }

    if (state.upcomingSessionInterval) {
      clearInterval(state.upcomingSessionInterval);
      state.upcomingSessionInterval = null;
    }

    const isCounselor = state.currentUser?.role === 'counselor' || state.currentUser?.role === 'director' || state.currentUser?.role === 'admin';

    // Case A: Active Session Found (Within Window)
    if (data.hasActiveSession && data.activeSession) {
      const s = data.activeSession;
      const peer = isCounselor ? `${s.student_name} (${s.student_id})` : (s.counselor_display || 'Assigned CGCS Specialist');
      container.innerHTML = `
        <div class="card p-4 border-2 border-emerald-500 bg-emerald-500/10 rounded-2xl shadow-xl mb-4" style="border: 2px solid #10B981; background: rgba(16, 185, 129, 0.08); border-radius: 16px; padding: 24px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="badge badge-green" style="font-size: 12px; padding: 6px 12px;"><i class="fa-solid fa-circle text-green pulse-icon"></i> ACTIVE CONSULTATION STAGE</span>
                <span class="badge badge-gold" style="font-size: 12px; padding: 6px 12px;"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(s.id)}</span>
              </div>
              <h3 style="font-size: 20px; font-weight: 700; margin: 4px 0 6px 0; color: var(--text-main);">
                Live Session with ${escapeHtml(peer)}
              </h3>
              <p style="font-size: 13.5px; color: var(--text-muted); margin: 0;">
                <i class="fa-solid fa-calendar-day text-gold"></i> <strong>${escapeHtml(s.date)}</strong> (${escapeHtml(s.time_slot)}) &bull; <i class="fa-solid fa-bullseye text-green"></i> ${escapeHtml(s.counseling_type || 'General Guidance')}
              </p>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-outline-warning btn-sm fw-semibold d-flex align-items-center gap-1 shadow-sm px-3" onclick="openHardwareCheckModal()" style="height: 44px;">
                <i class="bi bi-gear-wide-connected"></i> <span>Test Mic & Camera</span>
              </button>
              <button class="btn btn-green px-5 py-3 shadow-lg" onclick="launchVideoRoom('${s.id}')" style="font-size: 15px; font-weight: 700; border-radius: 10px; padding: 12px 24px;">
                <i class="fa-solid fa-video"></i> 🟢 Join Video Consultation
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Case B: No Active Session, Next Appointment Exists
    if (data.nextAppointment) {
      const appt = data.nextAppointment;
      sessionStorage.setItem('cgcs_active_video_appointment_id', appt.id);
      renderVideoRoomAppointmentDetails(appt);
      return;
    }

    // Case C: No Upcoming Bookings
    container.innerHTML = `
      <div class="card p-5 text-center rounded-2xl shadow-md mb-4" style="border: 1px solid var(--border-color); background: var(--sub-card-bg); border-radius: 16px; padding: 48px 24px;">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(148, 163, 184, 0.15); display: flex; align-items: center; justify-content: center; font-size: 32px; color: var(--text-muted); margin: 0 auto 16px;">
          <i class="fa-solid fa-calendar-xmark"></i>
        </div>
        <h3 style="font-size: 19px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          No scheduled tele-counseling appointments found.
        </h3>
        <p style="font-size: 13.5px; color: var(--text-muted); max-width: 480px; margin: 0 auto 20px;">
          ${isCounselor ? 'You currently have no approved online tele-counseling consultations pending on your schedule.' : 'You have no confirmed virtual video consultations at this time. Book a session with a guidance counselor to get started.'}
        </p>
        <div class="mt-3 d-flex justify-content-center gap-2">
          ${!isCounselor ? `
            <button class="btn btn-gold px-4 py-2.5 font-bold" onclick="switchTab('student-booking')" style="border-radius: 8px;">
              <i class="fa-solid fa-calendar-plus"></i> Book Tele-Counseling Session
            </button>
          ` : ''}
          <button type="button" class="btn btn-outline-warning btn-sm fw-semibold d-inline-flex align-items-center gap-1 shadow-sm px-3" onclick="openHardwareDiagnosticModal()" style="height: 38px;">
            <i class="bi bi-gear-wide-connected"></i> <span>Test Mic & Camera</span>
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in loadUpcomingVideoRoomState:', err);
  }
};

window.launchVideoRoom = async function (appointmentId) {
  try {
    const res = await authFetch(`/api/video-room/verify/${appointmentId}`);
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Access denied to video room.', 'error');
      if (data.isExpired) {
        await fetchAppointments();
      }
      return;
    }

    state.activeSession = {
      ...data.data,
      isWithinWindow: true
    };

    // Clear previous timers
    if (state.sessionCountdownInterval) clearInterval(state.sessionCountdownInterval);
    if (state.waitingRoomCountdownInterval) clearInterval(state.waitingRoomCountdownInterval);

    // Update UI elements
    const apptIdEl = document.getElementById('videoRoomApptId');
    if (apptIdEl) apptIdEl.textContent = data.data.appointmentId;
    const sessionCodeEl = document.getElementById('videoRoomSessionCode');
    if (sessionCodeEl) sessionCodeEl.textContent = data.data.meetingLink;
    const focusEl = document.getElementById('videoRoomFocus');
    if (focusEl) focusEl.textContent = data.data.counselingType;

    const isStudent = state.currentUser?.role === 'student';
    const peerName = isStudent ? data.data.counselorName : `${data.data.studentName} (${data.data.studentId})`;
    const peerNameEl = document.getElementById('videoRoomPeerName');
    if (peerNameEl) peerNameEl.textContent = peerName;
    const feedPeerEl = document.getElementById('videoFeedPeerName');
    if (feedPeerEl) feedPeerEl.textContent = peerName;

    // Update modal elements if present
    const modalPeerEl = document.getElementById('modalVideoPeerDisplay');
    if (modalPeerEl) modalPeerEl.textContent = `Consultation with ${peerName}`;
    const modalRoomBadge = document.getElementById('modalVideoRoomIdBadge');
    if (modalRoomBadge) modalRoomBadge.textContent = data.data.meetingLink;

    switchTab('video-room-view');

    const waitingCard = document.getElementById('videoPreCallWaitingRoom');
    const activeStage = document.getElementById('videoActiveStageContainer');
    const remainingEl = document.getElementById('videoRoomTimeRemaining');
    const upcomingContainer = document.getElementById('videoUpcomingStateContainer');

    if (upcomingContainer) upcomingContainer.style.display = 'none';

    // Case 1: Pre-Call Waiting Room (Entered before -10m access window)
    if (data.data.isWaitingRoom && data.data.opensAt) {
      if (waitingCard) waitingCard.classList.remove('hidden');
      if (activeStage) activeStage.style.display = 'none';

      const opensAt = new Date(data.data.opensAt).getTime();

      function updateWaitingTimer() {
        const now = Date.now();
        const diffMs = opensAt - now;
        const timerEl = document.getElementById('preCallCountdownTimer');

        if (diffMs <= 0) {
          clearInterval(state.waitingRoomCountdownInterval);
          if (timerEl) timerEl.textContent = '00:00';
          showToast('Consultation stage is now unlocked! Entering active room...', 'success');
          launchVideoRoom(appointmentId);
          return;
        }

        const totalSecs = Math.floor(diffMs / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        if (timerEl) {
          timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
      }

      updateWaitingTimer();
      state.waitingRoomCountdownInterval = setInterval(updateWaitingTimer, 1000);
      showToast('Entered Pre-Call Waiting Room. Countdown active.', 'info');
      return;
    }

    // Case 2: Active Video Consultation Stage
    if (waitingCard) waitingCard.classList.add('hidden');
    if (activeStage) activeStage.style.display = 'block';

    // Initialize browser camera & microphone hardware streams
    await startCameraAndMic();
    window.currentActiveAppointmentId = appointmentId;
    if (typeof onVideoCallConnected === 'function') {
      onVideoCallConnected();
    } else if (typeof setVideoMeetingState === 'function') {
      setVideoMeetingState(true);
    }

    const endsAt = data.data.endTime ? new Date(data.data.endTime).getTime() : (Date.now() + 3600000);

    function updateSessionTimer() {
      const now = Date.now();
      const diffMs = endsAt - now;

      if (diffMs <= 0) {
        clearInterval(state.sessionCountdownInterval);
        if (remainingEl) {
          remainingEl.textContent = '00:00';
          remainingEl.classList.remove('time-warning');
        }
        handleAutoDisconnectSession();
        return;
      }

      const totalSecs = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      if (remainingEl) {
        remainingEl.textContent = hours > 0
          ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        remainingEl.classList.toggle('time-warning', totalSecs <= 300);
      }
    }

    updateSessionTimer();
    state.sessionCountdownInterval = setInterval(updateSessionTimer, 1000);

    showToast(`Joined confidential session room: ${data.data.meetingLink}`, 'success');
  } catch (err) {
    console.error('Video room connection error:', err);
    showToast('Failed to connect to video room.', 'error');
  }
};

function handleAutoDisconnectSession() {
  stopCameraAndMic();
  openModal('modalSessionExpired');
}

window.acknowledgeSessionExpired = function () {
  const currentApptId = window.currentActiveAppointmentId || (state && state.activeSession && (state.activeSession.appointmentId || state.activeSession.id)) || null;
  const userRole = localStorage.getItem('user_role') || state.currentUser?.role || 'student';
  closeModal('modalSessionExpired');
  exitVideoRoom();
  if (userRole === 'student' && currentApptId && typeof handleVideoConferenceEnded === 'function') {
    handleVideoConferenceEnded(currentApptId);
  }
};

window.exitVideoRoom = function () {
  if (state.sessionCountdownInterval) clearInterval(state.sessionCountdownInterval);
  if (state.waitingRoomCountdownInterval) clearInterval(state.waitingRoomCountdownInterval);
  stopCameraAndMic();
  window.activeCallConnected = false;
  if (typeof setMeetingExitButtonVisibility === 'function') {
    setMeetingExitButtonVisibility(false);
  } else if (typeof setVideoMeetingState === 'function') {
    setVideoMeetingState(false);
  }
  state.activeSession = null;
  const modal = document.getElementById('modalVideoRoom');
  if (modal) modal.style.display = 'none';

  loadUpcomingVideoRoomState();
};

function initVideoRoomControls() {
  const chatInput = document.getElementById('sessionChatInput');
  const chatBtn = document.getElementById('btnSendSessionChat');
  const chatBox = document.getElementById('sessionChatMessages');

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    const msg = document.createElement('div');
    msg.className = 'chat-msg self';
    msg.textContent = `${state.currentUser?.name || 'You'}: ${text}`;
    chatBox.appendChild(msg);
    chatInput.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  chatBtn?.addEventListener('click', sendChat);
  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

window.toggleMic = function () {
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    const current = audioTracks.length > 0 ? audioTracks[0].enabled : true;
    audioTracks.forEach(t => { t.enabled = !current; });
    state.video.micOn = !current;
  } else {
    state.video.micOn = !state.video.micOn;
  }
  updateMediaControlUI();
  showToast(state.video.micOn ? 'Microphone unmuted' : 'Microphone muted', 'info');
};

window.toggleCam = function () {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    const current = videoTracks.length > 0 ? videoTracks[0].enabled : true;
    videoTracks.forEach(t => { t.enabled = !current; });
    state.video.camOn = !current;
    const selfPlaceholder = document.getElementById('localVideoSelfPlaceholder');
    if (selfPlaceholder) selfPlaceholder.style.display = state.video.camOn ? 'none' : 'flex';
  } else {
    state.video.camOn = !state.video.camOn;
  }
  updateMediaControlUI();
  showToast(state.video.camOn ? 'Camera turned on' : 'Camera turned off', 'info');
};

window.toggleScreenShare = function () {
  state.video.screenShareOn = !state.video.screenShareOn;
  const btn = document.getElementById('btnToggleScreen');
  if (btn) btn.classList.toggle('btn-gold', state.video.screenShareOn);
  showToast(state.video.screenShareOn ? 'Screen sharing active' : 'Screen sharing stopped', 'info');
};

window.endCall = function () {
  if (!confirm('Are you sure you want to exit this tele-counseling session?')) return;
  const apptId = state.activeSession?.appointmentId || state.activeSession?.id || window.currentActiveAppointmentId;
  window.activeCallConnected = false;
  if (typeof setMeetingExitButtonVisibility === 'function') {
    setMeetingExitButtonVisibility(false);
  } else if (typeof setVideoMeetingState === 'function') {
    setVideoMeetingState(false);
  }
  if (typeof handleVideoMeetingEnded === 'function') {
    handleVideoMeetingEnded(apptId);
  } else {
    stopCameraAndMic();
    showToast('Tele-counseling session ended.', 'info');
    exitVideoRoom();
    const userRole = localStorage.getItem('user_role') || state.currentUser?.role || 'student';
    if (userRole === 'student' && apptId && typeof handleVideoConferenceEnded === 'function') {
      handleVideoConferenceEnded(apptId);
    }
  }
};

// ====================================================
// 10. HERONCARE "KUMUSTAHAN" AI COMPANION & LIVE ESCALATION
// ====================================================

state.chatTranscript = [];
state.activeLiveChat = null; // For student
state.counselorActiveLiveChat = null; // For counselor
state.liveChatPollInterval = null;

// Accurate Philippine Time (Asia/Manila UTC+8) Formatter
function formatPhilippineTime(dateInput) {
  if (!dateInput) return '';
  let d;
  if (typeof dateInput === 'string') {
    // If SQLite stored UTC string without Z (e.g., "2026-09-27 06:53:12"), treat as UTC
    if (!dateInput.includes('T') && !dateInput.endsWith('Z')) {
      d = new Date(dateInput.replace(' ', 'T') + 'Z');
    } else {
      d = new Date(dateInput);
    }
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) d = new Date();
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
window.formatPhilippineTime = formatPhilippineTime;

function initChatbot() {
  const btnSend = document.getElementById('btnSendAIChat');
  const input = document.getElementById('aiInputText');

  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;

    // 1. ACTIVE LIVE COUNSELOR CONSULTATION ROUTE
    if (state.activeLiveChat && state.activeLiveChat.status === 'Active') {
      input.value = '';
      try {
        const res = await authFetch(`/api/counselor/live-chat/${state.activeLiveChat.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        if (data.success && data.data) {
          // Render only ONCE with msg ID so background polling skips it
          const history = document.getElementById('aiChatHistory');
          if (history && !document.getElementById(`live-msg-${data.data.id}`)) {
            const msgDiv = document.createElement('div');
            msgDiv.id = `live-msg-${data.data.id}`;
            msgDiv.className = 'ai-msg ai-user'; // Student on the right in Student view
            msgDiv.innerHTML = `
              <div class="ai-avatar"><i class="fa-solid fa-user-graduate"></i></div>
              <div class="ai-bubble">
                <div class="ai-msg-sender">${escapeHtml(data.data.senderName || state.currentUser?.name)}:</div>
                <div class="ai-msg-body">${escapeHtml(data.data.message).replace(/\n/g, '<br>')}</div>
                <div class="ai-msg-time">${formatPhilippineTime(data.data.createdAt || new Date())}</div>
              </div>
            `;
            history.appendChild(msgDiv);
            history.scrollTop = history.scrollHeight;
          }
        } else {
          showToast('Failed to send live message.', 'error');
        }
      } catch (err) {
        showToast('Network error sending message to counselor.', 'error');
      }
      return;
    }

    // 2. HERONCARE AI CHATBOT ROUTE
    state.chatTranscript.push({ sender: 'user', text, time: new Date().toISOString() });
    appendAIMessage(text, 'user');
    input.value = '';
    input.disabled = true;
    btnSend.disabled = true;
    const originalBtnHtml = btnSend.innerHTML;
    btnSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    showAITypingIndicator();
    try {
      state.heronChatHistory = state.heronChatHistory || [];
      const res = await authFetch('/api/chatbot/message', {
        method: 'POST',
        body: JSON.stringify({ message: text, history: state.heronChatHistory })
      });
      const data = await res.json();
      if (data.reply) {
        state.heronChatHistory.push({ role: 'user', text });
        state.heronChatHistory.push({ role: 'model', text: data.reply });
        state.heronChatHistory = state.heronChatHistory.slice(-8);
        state.chatTranscript.push({ sender: 'bot', text: data.reply, time: new Date().toISOString() });
        appendAIMessage(data.reply, 'bot', data.isCrisis, data.suggestCounselor);
      }
    } catch (err) {
      appendAIMessage('Paumanhin Heron, medyo mabagal ang koneksyon ngayon. Nandito pa rin ako; subukan muli o bumisita sa CGCS Room 304.', 'bot');
    } finally {
      removeAITypingIndicator();
      input.disabled = false;
      btnSend.disabled = false;
      btnSend.innerHTML = originalBtnHtml;
      input.focus();
    }
  }

  btnSend?.addEventListener('click', handleSend);
  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  // Student typing indicator broadcaster (debounced)
  let studentTypingTimer = null;
  input?.addEventListener('input', () => {
    if (state.activeLiveChat && state.activeLiveChat.status === 'Active') {
      if (!studentTypingTimer) {
        authFetch(`/api/counselor/live-chat/${state.activeLiveChat.id}/typing`, { method: 'POST' }).catch(() => {});
        studentTypingTimer = setTimeout(() => { studentTypingTimer = null; }, 2500);
      }
    }
  });

  // Counselor typing indicator broadcaster (debounced)
  let counselorTypingTimer = null;
  const counselorInput = document.getElementById('counselorLiveChatInput');
  counselorInput?.addEventListener('input', () => {
    if (state.counselorActiveLiveChat) {
      if (!counselorTypingTimer) {
        authFetch(`/api/counselor/live-chat/${state.counselorActiveLiveChat.id}/typing`, { method: 'POST' }).catch(() => {});
        counselorTypingTimer = setTimeout(() => { counselorTypingTimer = null; }, 2500);
      }
    }
  });

  // Counselor Live Chat form send handler
  const formCounselorLive = document.getElementById('formCounselorLiveChatSend');
  formCounselorLive?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cInput = document.getElementById('counselorLiveChatInput');
    const msg = cInput?.value?.trim();
    if (!msg || !state.counselorActiveLiveChat) return;

    try {
      const res = await authFetch(`/api/counselor/live-chat/${state.counselorActiveLiveChat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      if (data.success) {
        cInput.value = '';
        await fetchCounselorLiveMessages(state.counselorActiveLiveChat.id);
      }
    } catch (err) {
      showToast('Error sending message.', 'error');
    }
  });
}

// Typing Indicator Helpers
function showAITypingIndicator() {
  const history = document.getElementById('aiChatHistory');
  if (!history || document.getElementById('aiTypingIndicator')) return;
  const typingDiv = document.createElement('div');
  typingDiv.className = 'ai-msg ai-bot';
  typingDiv.id = 'aiTypingIndicator';
  typingDiv.innerHTML = `
    <div class="ai-avatar"><i class="fa-solid fa-feather-pointed"></i></div>
    <div class="ai-typing-bubble">
      <span>Nag-iisip si HeronCare</span>
      <span class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </span>
    </div>
  `;
  history.appendChild(typingDiv);
  history.scrollTop = history.scrollHeight;
}

function removeAITypingIndicator() {
  const indicator = document.getElementById('aiTypingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

// Clear Chat / Start Fresh Topic
window.clearHeronChat = function() {
  state.heronChatHistory = [];
  const history = document.getElementById('aiChatHistory');
  if (history) {
    history.innerHTML = `
      <div class="ai-msg ai-bot">
        <div class="ai-avatar"><i class="fa-solid fa-feather-pointed"></i></div>
        <div class="ai-bubble">
          Kumusta muli, Heron! Ako si <strong>HeronCare</strong>. May bago ka bang gustong pag-usapan o ibahagi? Nandito lang ako at handang makinig.
        </div>
      </div>
    `;
  }
  const input = document.getElementById('aiInputText');
  if (input) input.focus();
  showToast('Nagsimula ng bagong usapan si HeronCare.', 'info');
};

function formatHeronText(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);
  // Bold: **text** -> <strong>text</strong>
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Bullets: * or - at start of line -> bullet
  formatted = formatted.replace(/(?:^|\n)[*-]\s+(.+)/g, '<br>&bull; $1');
  // Newlines -> <br>
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

window.sendQuickPrompt = function (promptText) {
  document.getElementById('aiInputText').value = promptText;
  document.getElementById('btnSendAIChat').click();
};

function appendAIMessage(content, sender, isCrisis = false, suggestCounselor = false) {
  const history = document.getElementById('aiChatHistory');
  if (!history) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ai-${sender} ${isCrisis ? 'crisis-flag' : ''}`;

  const studentAvatar = state.currentUser?.avatar || state.currentUser?.avatar_url;
  const isStudent = sender !== 'bot' && sender !== 'counselor';
  const hasStudentAvatar = isStudent && studentAvatar && typeof studentAvatar === 'string' && (studentAvatar.length > 50 || studentAvatar.startsWith('data:') || studentAvatar.startsWith('http') || studentAvatar.startsWith('/'));

  const icon = sender === 'bot'
    ? '<i class="fa-solid fa-feather-pointed"></i>'
    : sender === 'counselor'
      ? '<i class="fa-solid fa-user-doctor"></i>'
      : (hasStudentAvatar
          ? `<div class="chat-avatar-circle"><img src="${studentAvatar}" alt="Avatar" /></div>`
          : '<i class="fa-solid fa-user-graduate"></i>');

  let escalationActionHtml = '';
  if (suggestCounselor) {
    escalationActionHtml = `
      <div class="mt-3 p-2" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px;">
        <div style="font-weight: 700; color: var(--umak-navy); font-size: 12.5px;"><i class="fa-solid fa-headset text-gold"></i> Live Counselor Available</div>
        <p style="font-size: 12px; margin: 4px 0 8px 0;">Would you like to connect directly with an on-duty Guidance Counselor right now?</p>
        <button class="btn btn-xs btn-gold font-weight-bold" onclick="requestLiveCounselorEscalation()">
          <i class="fa-solid fa-comments"></i> Connect to a Real Counselor
        </button>
      </div>
    `;
  }

  msgDiv.innerHTML = `
    <div class="ai-avatar" style="${hasStudentAvatar ? 'padding: 0; background: transparent; border: none;' : ''}">${icon}</div>
    <div class="ai-bubble">
      ${formatHeronText(content)}
      ${escalationActionHtml}
    </div>
  `;

  history.appendChild(msgDiv);
  history.scrollTop = history.scrollHeight;
}

// ----------------------------------------------------
// STUDENT LIVE COUNSELOR ESCALATION HANDLERS
// ----------------------------------------------------

window.requestLiveCounselorEscalation = async function () {
  if (!state.currentUser) {
    showToast('Please sign in to connect with a guidance counselor.', 'error');
    return;
  }

  const lastUserMsg = state.chatTranscript.filter(m => m.sender === 'user').slice(-3).map(m => m.text).join(' | ');
  const summary = lastUserMsg || 'Student requested live counseling consultation via HeronCare Kumustahan chatbot.';

  try {
    const res = await authFetch('/api/counselor/live-chat-request', {
      method: 'POST',
      body: JSON.stringify({
        recentSummary: summary,
        chatTranscript: state.chatTranscript
      })
    });
    const data = await res.json();

    if (data.success && data.data) {
      state.activeLiveChat = data.data;

      // Reveal in-chat status banner
      const banner = document.getElementById('liveCounselorStatusBanner');
      const title = document.getElementById('liveEscalationTitle');
      const sub = document.getElementById('liveEscalationSubtitle');
      const spinner = document.getElementById('liveEscalationSpinner');
      const btnEnd = document.getElementById('btnEndLiveChatSession');

      if (banner) {
        banner.classList.remove('hidden');
        banner.classList.remove('active-counselor');
      }
      if (title) title.textContent = 'Connecting you to an available UMak Guidance Counselor...';
      if (sub) sub.textContent = 'Please stay in this window. A duty counselor is reviewing your request.';
      if (spinner) spinner.style.display = 'block';
      if (btnEnd) btnEnd.style.display = 'none';

      showToast('Live counselor escalation requested. Connecting...', 'info');

      // Start Polling for Counselor Acceptance
      startStudentLiveChatPolling(data.data.id || data.data.requestId);
    } else {
      showToast(data.message || 'Failed to dispatch live chat request.', 'error');
    }
  } catch (err) {
    showToast('Network error requesting counselor escalation.', 'error');
  }
};

function startStudentLiveChatPolling(sessionId) {
  if (state.liveChatPollInterval) clearInterval(state.liveChatPollInterval);

  state.liveChatPollInterval = setInterval(async () => {
    if (!state.activeLiveChat) {
      clearInterval(state.liveChatPollInterval);
      return;
    }

    try {
      const res = await authFetch(`/api/counselor/live-chat/${sessionId}/messages`);
      const data = await res.json();

      if (data.success && data.session) {
        const session = data.session;
        state.activeLiveChat = session;

        // If counselor accepted and session is Active
        if (session.status === 'Active') {
          const banner = document.getElementById('liveCounselorStatusBanner');
          const title = document.getElementById('liveEscalationTitle');
          const sub = document.getElementById('liveEscalationSubtitle');
          const spinner = document.getElementById('liveEscalationSpinner');
          const btnEnd = document.getElementById('btnEndLiveChatSession');
          const chatInput = document.getElementById('aiInputText');

          if (banner) {
            banner.classList.add('active-counselor');
            banner.classList.remove('hidden');
          }
          if (title) title.innerHTML = `🟢 <strong>Live with ${escapeHtml(session.counselor_name || 'Counselor')}</strong> (Licensed RGC)`;
          if (sub) sub.textContent = 'Confidential 1-on-1 Session Active. Type below to converse in real-time.';
          if (spinner) spinner.style.display = 'none';
          if (btnEnd) btnEnd.style.display = 'inline-block';

          if (chatInput) {
            chatInput.placeholder = `Type your message directly to Counselor ${session.counselor_name || ''}...`;
          }

        // 1. Peer Typing Indicator for Student
        const typingElId = 'counselorTypingBubble';
        let typingEl = document.getElementById(typingElId);
        if (data.isPeerTyping) {
          if (!typingEl) {
            const history = document.getElementById('aiChatHistory');
            typingEl = document.createElement('div');
            typingEl.id = typingElId;
            typingEl.className = 'ai-msg ai-bot';
            typingEl.innerHTML = `
              <div class="ai-avatar"><i class="fa-solid fa-user-doctor"></i></div>
              <div class="ai-bubble" style="border-left: 3px solid var(--umak-green);">
                <span style="font-size: 12px; font-weight: 600; color: #10b981;">Nagsusulat si Counselor...</span>
                <span class="typing-dots ms-1"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>
              </div>
            `;
            history?.appendChild(typingEl);
            history.scrollTop = history.scrollHeight;
          }
        } else if (typingEl) {
          typingEl.remove();
        }

        // 2. Render Incoming Messages
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(msg => {
            const alreadyRendered = document.getElementById(`live-msg-${msg.id}`);
            if (!alreadyRendered) {
              const history = document.getElementById('aiChatHistory');
              if (history) {
                const isCounselor = msg.sender_role === 'counselor';
                const msgDiv = document.createElement('div');
                msgDiv.id = `live-msg-${msg.id}`;
                msgDiv.className = `ai-msg ${isCounselor ? 'ai-bot' : 'ai-user'}`;

                const studentAvatar = msg.avatar || state.currentUser?.avatar || state.currentUser?.avatar_url;
                const hasStudentAvatar = !isCounselor && studentAvatar && typeof studentAvatar === 'string' && (studentAvatar.length > 50 || studentAvatar.startsWith('data:') || studentAvatar.startsWith('http') || studentAvatar.startsWith('/'));

                const icon = isCounselor
                  ? '<i class="fa-solid fa-user-doctor"></i>'
                  : (hasStudentAvatar
                      ? `<div class="chat-avatar-circle"><img src="${studentAvatar}" alt="Avatar" /></div>`
                      : '<i class="fa-solid fa-user-graduate"></i>');

                msgDiv.innerHTML = `
                  <div class="ai-avatar" style="${hasStudentAvatar ? 'padding: 0; background: transparent; border: none;' : ''}">${icon}</div>
                  <div class="ai-bubble" style="${isCounselor ? 'border-left: 3px solid var(--umak-green);' : ''}">
                    <div class="ai-msg-sender">${escapeHtml(msg.sender_name)}:</div>
                    <div class="ai-msg-body">${escapeHtml(msg.message).replace(/\n/g, '<br>')}</div>
                    <div class="ai-msg-time">${formatPhilippineTime(msg.created_at)}</div>
                  </div>
                `;
                // Ensure typing bubble stays at bottom
                if (typingEl) history.insertBefore(msgDiv, typingEl);
                else history.appendChild(msgDiv);
                history.scrollTop = history.scrollHeight;
              }
            }
          });
        }
      } else if (session.status === 'Completed') {
        // 3. Prominent Consultation Concluded Banner for Student
        clearInterval(state.liveChatPollInterval);
        state.activeLiveChat = null;
        document.getElementById('liveCounselorStatusBanner')?.classList.add('hidden');
        document.getElementById('aiInputText').placeholder = "Ibahagi ang iyong nararamdaman o mag-check-in kay HeronCare...";
        const history = document.getElementById('aiChatHistory');
        if (history && !document.getElementById('consultationConcludedBanner')) {
          const banner = document.createElement('div');
          banner.id = 'consultationConcludedBanner';
          banner.className = 'my-3 p-3 rounded-3 text-center';
          banner.style.cssText = 'background: rgba(16, 185, 129, 0.12); border: 1.5px solid #10b981; border-radius: 14px;';
          banner.innerHTML = `
            <div style="font-weight: 700; color: #10b981; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <i class="fa-solid fa-circle-check fs-5"></i>
              <span>Live Consultation Concluded by Counselor</span>
            </div>
            <p style="font-size: 12.5px; margin: 6px 0 0 0; color: var(--text-main); line-height: 1.5;">
              Natapos na ang inyong 1-on-1 consultation session kasama si <strong>${escapeHtml(session.counselor_name || 'Counselor')}</strong>. Naka-save na nang kumpidensyal ang record na ito. Maaari kang mag-vent o mag-grounding muli kasama si <strong>HeronCare AI</strong>.
            </p>
          `;
          history.appendChild(banner);
          history.scrollTop = history.scrollHeight;
        }
        showToast('Live consultation concluded. HeronCare AI is now active.', 'info');
      }
      }
    } catch (e) { }
  }, 3000);
}

window.endStudentLiveChatSession = async function () {
  if (!state.activeLiveChat) return;
  if (!confirm('Are you sure you want to end this live counselor consultation?')) return;

  try {
    await authFetch(`/api/counselor/live-chat/${state.activeLiveChat.id}/end`, { method: 'POST' });
    if (state.liveChatPollInterval) clearInterval(state.liveChatPollInterval);
    state.activeLiveChat = null;
    document.getElementById('liveCounselorStatusBanner')?.classList.add('hidden');
    document.getElementById('aiInputText').placeholder = "Share what is on your mind or type 'help me ground'...";
    showToast('Live counseling session ended.', 'info');
  } catch (err) {
    showToast('Error ending chat session.', 'error');
  }
};

// ----------------------------------------------------
// COUNSELOR LIVE CHAT DESK HANDLERS
// ----------------------------------------------------

async function loadLiveChatRequests() {
  const isCounselor = state.currentUser?.role === 'counselor' || state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'admin';
  if (!isCounselor) return;

  try {
    const res = await authFetch('/api/counselor/live-chat-requests');
    const data = await res.json();
    if (data.success && data.data) {
      state.counselorLiveChatRequests = data.data;

      // Auto-detect if active consultation concluded by student
      if (state.counselorActiveLiveChat) {
        const found = data.data.find(r => r.id === state.counselorActiveLiveChat.id);
        if (!found || found.status === 'Completed' || found.status === 'Concluded' || found.status === 'Ended' || found.status === 'Closed') {
          const modal = document.getElementById('modalCounselorLiveChat');
          if (modal && (modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block')) {
            if (state.counselorLivePollInterval) clearInterval(state.counselorLivePollInterval);
            state.counselorActiveLiveChat = null;
            closeModal('modalCounselorLiveChat');
            showToast('Natapos na ng estudyante ang live chat consultation session.', 'info');
          }
        }
      }

      renderCounselorLiveChatDesk();
    }
  } catch (e) {
    console.error('Error loading live chat requests:', e);
  }
}

function renderCounselorLiveChatDesk() {
  const tbody = document.getElementById('counselorLiveChatRequestsBody');
  const badge = document.getElementById('liveChatRequestsBadge');
  if (!tbody) return;

  // Filter: Show pending requests OR active requests assigned strictly to this counselor
  const myQueue = (state.counselorLiveChatRequests || []).filter(r => 
    r.status === 'Pending' || (r.status === 'Active' && r.counselor_id === state.currentUser?.id)
  );
  const pendingCount = myQueue.filter(r => r.status === 'Pending').length;
  if (badge) {
    badge.textContent = `${pendingCount} Pending`;
    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  if (myQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-3 text-muted">No pending live student chat requests. Desk is standby.</td></tr>`;
    return;
  }

  tbody.innerHTML = myQueue.map(req => {
    const isPending = req.status === 'Pending';
    return `
      <tr style="${isPending ? 'background: rgba(239, 68, 68, 0.04);' : ''}">
        <td><strong>${escapeHtml(req.id)}</strong></td>
        <td>
          <div class="student-meta">
            <span class="student-name">${escapeHtml(req.student_name)}</span>
            <span class="student-sub">${escapeHtml(req.student_id)} &bull; ${escapeHtml(req.student_email)}</span>
          </div>
        </td>
        <td><span class="badge badge-navy">${escapeHtml(req.college)}</span></td>
        <td style="max-width: 260px; font-size: 12px; color: var(--text-primary);">${escapeHtml(req.initial_summary || 'Live guidance request')}</td>
        <td><small>${formatPhilippineTime(req.created_at)}</small></td>
        <td><span class="badge ${isPending ? 'badge-danger font-weight-bold' : 'badge-green'}">${escapeHtml(req.status)}</span></td>
        <td class="text-right">
          ${isPending ? `
            <button class="btn btn-xs btn-green font-weight-bold" onclick="acceptCounselorLiveChat('${req.id}')">
              <i class="fa-solid fa-headset"></i> Accept Chat
            </button>
          ` : `
            <button class="btn btn-xs btn-gold font-weight-bold" onclick="openCounselorLiveChatModal('${req.id}')">
              <i class="fa-solid fa-comments"></i> Resume Chat
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

window.acceptCounselorLiveChat = async function (requestId) {
  try {
    const res = await authFetch('/api/counselor/live-chat-accept', {
      method: 'POST',
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || 'Connected to live student consultation!', 'success');
      await openCounselorLiveChatModal(requestId);
      await loadLiveChatRequests();
    } else {
      // If already claimed by another counselor, show warning and immediately refresh queue to remove it
      showToast(data.message || 'Hindi na available ang request na ito.', 'warning');
      await loadLiveChatRequests();
    }
  } catch (err) {
    showToast('Network error accepting chat.', 'error');
  }
};

// Start auto-refreshing Live Chat Requests desk every 4 seconds for logged-in counselors
if (!window.counselorDeskPollInterval) {
  window.counselorDeskPollInterval = setInterval(() => {
    const isCounselor = state.currentUser?.role === 'counselor' || state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'admin';
    if (isCounselor) {
      loadLiveChatRequests();
    }
  }, 4000);
}

// Synchronizes Counselor Live Chat Modal with active theme (Light vs Dark)
function syncCounselorChatTheme() {
  const modal = document.getElementById('modalCounselorLiveChat');
  if (!modal) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light' ||
                  document.body.classList.contains('light-theme') ||
                  localStorage.getItem('umak_cgcs_theme') === 'light';
  const shell = modal.querySelector('.counselor-chat-modal-shell');
  const header = modal.querySelector('.counselor-modal-header');
  const body = document.getElementById('counselorLiveChatMessages');
  const footer = modal.querySelector('.counselor-modal-footer');
  const peerName = document.getElementById('liveChatPeerName');
  const peerSub = document.getElementById('liveChatPeerSub');
  const input = document.getElementById('counselorLiveChatInput');
  if (shell) {
    shell.style.setProperty('background-color', isLight ? '#ffffff' : '#0b1329', 'important');
    shell.style.setProperty('border-color', isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.14)', 'important');
    shell.style.setProperty('color', isLight ? '#0f172a' : '#f8fafc', 'important');
  }
  if (header) {
    header.style.setProperty('background-color', isLight ? '#f8fafc' : '#0f1a2e', 'important');
    header.style.setProperty('border-bottom-color', isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)', 'important');
  }
  if (body) {
    body.style.setProperty('background-color', isLight ? '#f1f5f9' : '#070d19', 'important');
  }
  if (footer) {
    footer.style.setProperty('background-color', isLight ? '#f8fafc' : '#0f1a2e', 'important');
    footer.style.setProperty('border-top-color', isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)', 'important');
  }
  if (peerName) {
    peerName.style.setProperty('color', isLight ? '#0f172a' : '#f8fafc', 'important');
  }
  if (peerSub) {
    peerSub.style.setProperty('color', isLight ? '#64748b' : '#94a3b8', 'important');
  }
  const summaryBox = document.getElementById('liveChatSummaryBox');
  const summaryText = document.getElementById('liveChatSummaryText');
  if (summaryBox) {
    summaryBox.style.setProperty('background-color', isLight ? '#fffbeb' : 'rgba(245, 158, 11, 0.1)', 'important');
    summaryBox.style.setProperty('border-color', isLight ? '#fcd34d' : 'rgba(245, 158, 11, 0.25)', 'important');
    summaryBox.style.setProperty('color', isLight ? '#92400e' : '#fde68a', 'important');
  }
  if (summaryText) {
    summaryText.style.setProperty('color', isLight ? '#92400e' : '#fde68a', 'important');
  }
  if (input) {
    input.style.setProperty('background-color', isLight ? '#ffffff' : '#0f172a', 'important');
    input.style.setProperty('color', isLight ? '#0f172a' : '#ffffff', 'important');
    input.style.setProperty('border-color', isLight ? '#cbd5e1' : '#334155', 'important');
  }
}
window.syncCounselorChatTheme = syncCounselorChatTheme;

window.openCounselorLiveChatModal = async function (requestId) {
  state.counselorActiveLiveChat = { id: requestId };
  openModal('modalCounselorLiveChat');
  
  // Guarantee theme sync on open
  syncCounselorChatTheme();
  await fetchCounselorLiveMessages(requestId);

  // Start live polling for counselor messages
  if (state.counselorLivePollInterval) clearInterval(state.counselorLivePollInterval);
  state.counselorLivePollInterval = setInterval(() => {
    if (state.counselorActiveLiveChat) {
      fetchCounselorLiveMessages(requestId);
    } else {
      clearInterval(state.counselorLivePollInterval);
    }
  }, 2500);
};

async function fetchCounselorLiveMessages(sessionId) {
  try {
    const res = await authFetch(`/api/counselor/live-chat/${sessionId}/messages`);
    const data = await res.json();

    if (data.success) {
      const { session, messages } = data;
      state.counselorActiveLiveChat = session;

      // 0. Auto-close counselor live chat modal if student ended/concluded session
      if (session && (session.status === 'Completed' || session.status === 'Concluded' || session.status === 'Ended' || session.status === 'Closed')) {
        if (state.counselorLivePollInterval) clearInterval(state.counselorLivePollInterval);
        state.counselorActiveLiveChat = null;
        closeModal('modalCounselorLiveChat');
        showToast('Natapos na ng estudyante ang live chat consultation session.', 'info');
        if (typeof loadLiveChatRequests === 'function') loadLiveChatRequests();
        return;
      }

      document.getElementById('liveChatPeerName').textContent = session.student_name;
      document.getElementById('liveChatPeerSub').textContent = `${session.college} • ${session.student_id} • Active 1-on-1 Consultation`;

      // 1. Render Header Avatar (Image if available, fallback to initials)
      const peerAvatarEl = document.getElementById('liveChatPeerAvatar');
      const studentAvatar = session.student_avatar || session.avatar || session.avatar_url;
      const initials = session.student_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
      if (peerAvatarEl) {
        if (studentAvatar && studentAvatar.length > 20) {
          peerAvatarEl.innerHTML = `<img src="${studentAvatar}" alt="${escapeHtml(session.student_name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
          peerAvatarEl.style.overflow = 'hidden';
          peerAvatarEl.style.padding = '0';
        } else {
          peerAvatarEl.textContent = initials;
        }
      }

      document.getElementById('liveChatSummaryText').textContent = session.initial_summary || 'Live guidance consultation';

      const msgContainer = document.getElementById('counselorLiveChatMessages');
      if (msgContainer) {
        if (!messages || messages.length === 0) {
          msgContainer.innerHTML = `<div class="ai-msg ai-bot"><div class="ai-avatar"><i class="fa-solid fa-user-doctor"></i></div><div class="ai-bubble" style="border-left: 3px solid var(--umak-green);">Consultation room connected. Send your response to the student below.</div></div>`;
        } else {
          msgContainer.innerHTML = messages.map(m => {
            // Counselor = SELF (RIGHT), Student = PEER (LEFT)
            const isSelf = m.sender_role === 'counselor';
            const roleClass = isSelf ? 'chat-msg-self' : 'chat-msg-peer';
            
            // Student bubble shows actual avatar picture if available
            const effectiveStudentAvatar = studentAvatar || m.sender_avatar || m.avatar;
            const hasStudentAvatar = !isSelf && effectiveStudentAvatar && typeof effectiveStudentAvatar === 'string' && (effectiveStudentAvatar.length > 50 || effectiveStudentAvatar.startsWith('data:') || effectiveStudentAvatar.startsWith('http') || effectiveStudentAvatar.startsWith('/'));

            const icon = isSelf
              ? '<i class="fa-solid fa-user-doctor"></i>'
              : (hasStudentAvatar
                  ? `<div class="chat-avatar-circle"><img src="${effectiveStudentAvatar}" alt="${escapeHtml(m.sender_name || 'Student')}" /></div>`
                  : '<i class="fa-solid fa-user-graduate"></i>');
            const timeStr = formatPhilippineTime(m.created_at);
            return `
              <div class="ai-msg ${roleClass}">
                <div class="ai-avatar" style="${hasStudentAvatar ? 'padding: 0; background: transparent; border: none;' : ''}">${icon}</div>
                <div class="ai-bubble">
                  <div class="ai-msg-sender">${escapeHtml(m.sender_name)}:</div>
                  <div class="ai-msg-body">${escapeHtml(m.message).replace(/\n/g, '<br>')}</div>
                  <div class="ai-msg-time">${timeStr}</div>
                </div>
              </div>
            `;
          }).join('');
          msgContainer.scrollTop = msgContainer.scrollHeight;
        }

        // 2. Peer Typing Indicator with Student Avatar
        const cTypingId = 'studentTypingBubble';
        let cTypingEl = document.getElementById(cTypingId);
        if (data.isPeerTyping) {
          const typingAvatar = (studentAvatar && studentAvatar.length > 20)
            ? `<img src="${studentAvatar}" alt="Student" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
            : '<i class="fa-solid fa-user-graduate"></i>';
          if (!cTypingEl) {
            cTypingEl = document.createElement('div');
            cTypingEl.id = cTypingId;
            cTypingEl.className = 'ai-msg chat-msg-peer';
            cTypingEl.innerHTML = `
              <div class="ai-avatar" style="overflow: hidden;">${typingAvatar}</div>
              <div class="ai-bubble" style="border-left: 3px solid var(--umak-green);">
                <span style="font-size: 12px; font-weight: 600; color: #0284c7;">Nagsusulat si ${escapeHtml(session.student_name)}...</span>
                <span class="typing-dots ms-1"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>
              </div>
            `;
            msgContainer.appendChild(cTypingEl);
            msgContainer.scrollTop = msgContainer.scrollHeight;
          }
        } else if (cTypingEl) {
          cTypingEl.remove();
        }
      }
    }
  } catch (e) { }
}

window.refreshLiveChatAiSummary = async function() {
  if (!state.counselorActiveLiveChat?.id) return;
  const summaryEl = document.getElementById('liveChatSummaryText');
  const btn = document.getElementById('btnRefreshAiSummary');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    const res = await authFetch(`/api/counselor/live-chat/${state.counselorActiveLiveChat.id}/ai-summary`, { method: 'POST' });
    const data = await res.json();
    if (data.success && data.summary) {
      if (summaryEl) summaryEl.textContent = data.summary;
      showToast('AI Clinical Summary updated.', 'success');
    }
  } catch (err) {
    showToast('Failed to generate AI summary.', 'error');
  } finally {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI Summary';
  }
};

window.endCounselorLiveChatSession = async function () {
  if (!state.counselorActiveLiveChat) return;
  if (!confirm('Are you sure you want to conclude this live student counseling session?')) return;

  try {
    await authFetch(`/api/counselor/live-chat/${state.counselorActiveLiveChat.id}/end`, { method: 'POST' });
    if (state.counselorLivePollInterval) clearInterval(state.counselorLivePollInterval);

    closeModal('modalCounselorLiveChat');
    showToast('Live consultation concluded successfully.', 'success');
    state.counselorActiveLiveChat = null;
    await loadLiveChatRequests();
  } catch (err) {
    showToast('Error concluding chat session.', 'error');
  }
};

// ====================================================
// 11. WORKLOAD, BROADCASTS & EXECUTIVE ANALYTICS
// ====================================================

window.populateAssignCounselorDropdown = async function () {
  const selectEl = document.getElementById('schedAssignCounselor');
  if (!selectEl) return;
  try {
    const res = await fetch('/api/counselors/list');
    const data = await res.json();
    const counselors = (data.success && data.counselors) ? data.counselors : [];
    if (counselors.length > 0) {
      selectEl.innerHTML = counselors.map(c => `
        <option value="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.department || 'CGCS'})</option>
      `).join('');
    }
  } catch (err) {
    console.error('Error populating counselor dropdown:', err);
  }
};

function initWorkloadManager() {
  populateAssignCounselorDropdown();

  const form = document.getElementById('formAssignSchedule') || document.getElementById('formDutySchedule');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sel = document.getElementById('schedAssignCounselor');
    if (!sel) return;
    const counselorId = sel.value;
    const counselorName = sel.selectedOptions[0]?.getAttribute('data-name') || sel.selectedOptions[0]?.text.split('(')[0].trim();

    const payload = {
      counselorId,
      counselorName,
      dayOfWeek: document.getElementById('schedAssignDay').value,
      timeSlot: document.getElementById('schedAssignTime').value,
      maxSlots: parseInt(document.getElementById('schedAssignCaseload')?.value || '4', 10),
      status: 'Available'
    };

    try {
      const res = await authFetch('/api/counselors/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Duty schedule assigned successfully.', 'success');

        // Reset form inputs (except counselor select) so ready for next assignment
        const daySelect = document.getElementById('schedAssignDay');
        const timeSelect = document.getElementById('schedAssignTime');
        const caseloadInput = document.getElementById('schedAssignCaseload');
        if (daySelect) daySelect.selectedIndex = 0;
        if (timeSelect) timeSelect.selectedIndex = 0;
        if (caseloadInput) caseloadInput.value = '4';

        await loadWorkloadData();
        await loadCounselorSchedules();
      } else {
        showToast(data.message || 'Failed to save schedule', 'error');
      }
    } catch (err) {
      showToast('Failed to save schedule', 'error');
    }
  });
}

async function loadWorkloadData() {
  try {
    if (typeof populateAssignCounselorDropdown === 'function') populateAssignCounselorDropdown();
    const res = await authFetch('/api/counselor/workload');
    const data = await res.json();
    if (data.success && (data.data || data.schedules)) {
      const payload = data.data || data;
      state.workload = payload.workload || [];
      const schedules = payload.schedules || [];
      renderWorkloadTable();
      renderActiveSchedules(schedules);
    }
  } catch (e) {
    console.error('Workload load error:', e);
  }
}
window.loadWorkloadData = loadWorkloadData;

function renderWorkloadTable() {
  const tbody = document.getElementById('counselorWorkloadTableBody');
  if (!tbody) return;

  if (state.workload.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center p-3 text-muted">No counselors currently configured.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.workload.map(w => `
    <tr>
      <td><strong>${escapeHtml(w.name)}</strong><br><small class="text-muted">${escapeHtml(w.email)}</small></td>
      <td>${escapeHtml(w.assignedCluster)}</td>
      <td><span class="badge badge-gold font-weight-bold">${w.activeCases} Active Cases</span></td>
      <td><span class="badge ${w.status === 'Active' ? 'badge-green' : 'badge-navy'}">${w.status}</span></td>
    </tr>
  `).join('');
}

function renderActiveSchedules(schedules) {
  const container = document.getElementById('activeSchedulesList');
  if (!container) return;

  if (!schedules || schedules.length === 0) {
    container.innerHTML = `<div class="text-muted p-3 text-center">No active duty slots recorded. Assign a schedule above.</div>`;
    return;
  }

  container.innerHTML = schedules.map(s => {
    const counselorName = s.counselor_name || s.counselorName || 'Assigned Counselor';
    const day = s.day_of_week || s.dayOfWeek || 'Day';
    const time = s.time_slot || s.timeSlot || 'Time';
    const max = s.max_slots || s.maxSlots || s.caseloadLimit || 4;
    const status = s.status || 'Available';
    const statusBadge = status === 'Available' ? 'badge-green' : 'badge-navy';

    return `
      <div style="padding: 10px 14px; background: var(--sub-card-bg); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--text-primary); font-size: 13.5px;">${escapeHtml(counselorName)}</strong> &bull; 
          <span class="text-gold" style="font-weight: 600;">${day}</span> 
          <small class="text-muted">(${time})</small>
          <br><small class="text-muted">Max Caseload Capacity: <strong>${max} students</strong></small>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge ${statusBadge}">${status}</span>
          <button type="button" class="btn btn-xs btn-outline-green" style="color: #ef4444; border-color: #ef4444;" onclick="deleteDutyScheduleSlot('${s.id}')" title="Remove Duty Slot">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}
window.renderActiveSchedules = renderActiveSchedules;

window.deleteDutyScheduleSlot = async function(id) {
  if (!confirm('Are you sure you want to remove this assigned duty slot?')) return;
  try {
    const res = await authFetch(`/api/counselor/schedules/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Duty slot removed.', 'info');
      await loadWorkloadData();
    }
  } catch (e) {
    showToast('Error removing duty slot.', 'error');
  }
};

async function fetchBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      state.broadcasts = data.data;
      const latest = data.data[0];
      const bTitle = document.getElementById('broadcastTitle');
      const bMsg = document.getElementById('broadcastMessage');
      if (bTitle) bTitle.textContent = latest.title;
      if (bMsg) bMsg.textContent = latest.message;
      document.getElementById('campusBroadcastBanner')?.classList.remove('hidden');
      renderBroadcastsList();
    }
  } catch (e) { }
}

function initBroadcasts() {
  const form = document.getElementById('formPostBroadcast');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('broadcastInputTitle')?.value?.trim();
    const category = document.getElementById('broadcastInputCategory')?.value;
    const message = document.getElementById('broadcastInputMessage')?.value?.trim();

    try {
      const res = await authFetch('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ title, category, message })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        form.reset();
        await fetchBroadcasts();
      }
    } catch (e) { }
  });
}

function renderBroadcastsList() {
  const container = document.getElementById('broadcastsList');
  if (!container) return;

  container.innerHTML = state.broadcasts.map(b => `
    <div style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 10px; background: var(--card-bg);">
      <div class="d-flex justify-content-between">
        <strong>${escapeHtml(b.title)}</strong>
        <span class="badge badge-gold">${escapeHtml(b.category)}</span>
      </div>
      <p class="mt-1" style="font-size: 13px;">${escapeHtml(b.message)}</p>
      <small class="text-muted">Posted by ${escapeHtml(b.author)} on ${new Date(b.created_at).toLocaleDateString()}</small>
    </div>
  `).join('');
}

// ----------------------------------------------------
// DIRECTOR / SUPER ADMIN PORTAL DATA & DIRECTORY
// ----------------------------------------------------

window.switchAdminUserSubTab = function (subTab) {
  state.adminSubTab = subTab;
  const btnCounselors = document.getElementById('btnSubTabCounselors');
  const btnStudents = document.getElementById('btnSubTabStudents');
  const viewCounselors = document.getElementById('viewAdminCounselors');
  const viewStudents = document.getElementById('viewAdminStudents');

  if (subTab === 'counselors') {
    btnCounselors?.classList.add('active');
    btnStudents?.classList.remove('active');
    viewCounselors?.classList.remove('hidden');
    viewStudents?.classList.add('hidden');
  } else {
    btnStudents?.classList.add('active');
    btnCounselors?.classList.remove('active');
    viewStudents?.classList.remove('hidden');
    viewCounselors?.classList.add('hidden');
  }
};

window.loadAdminData = async function () {
  const isSuperAdmin = state.currentUser?.role === 'superadmin' || state.currentUser?.role === 'director';
  const isCounselor = state.currentUser?.role === 'counselor' || state.currentUser?.role === 'admin';
  if (!isSuperAdmin && !isCounselor) return;

  try {
    // 1. Executive Analytics
    await renderInstitutionalAnalytics();

    // 2. User Directory
    if (isSuperAdmin) {
      try {
        const [counselorRes, studentRes] = await Promise.all([
          authFetch('/api/users/counselors'),
          authFetch('/api/users/students')
        ]);
        const counselorData = await counselorRes.json();
        const studentData = await studentRes.json();
        if (counselorData.success) state.adminCounselors = counselorData.counselors || [];
        if (studentData.success) state.adminStudents = studentData.students || [];
      } catch (e) {
        const userRes = await authFetch('/api/admin/users');
        const userData = await userRes.json();
        if (userData.success) {
          state.adminCounselors = userData.counselors || userData.data?.filter(u => u.role === 'counselor' || u.role === 'admin') || [];
          state.adminStudents = userData.students || userData.data?.filter(u => u.role === 'student') || [];
        }
      }
      renderAdminUserDirectory();

      // 3. Audit Logs
      const auditRes = await authFetch('/api/admin/audit-logs');
      const auditData = await auditRes.json();
      if (auditData.success && auditData.data) {
        state.auditLogs = auditData.data;
        renderAdminAuditTable();
      }
    }

    // 4. Caseload & Broadcasts
    await loadWorkloadData();
    await fetchBroadcasts();
  } catch (err) {
    console.error('Error in loadAdminData:', err);
  }
};

function renderAdminUserDirectory() {
  // Update Subtab Count Badges
  const countC = document.getElementById('countAdminCounselors');
  const countS = document.getElementById('countAdminStudents');
  if (countC) countC.textContent = state.adminCounselors.length;
  if (countS) countS.textContent = state.adminStudents.length;

  // Render Counselors Table
  const tbodyC = document.getElementById('adminCounselorsTableBody');
  if (tbodyC) {
    if (state.adminCounselors.length === 0) {
      tbodyC.innerHTML = `<tr><td colspan="8" class="text-center p-3 text-muted">No registered guidance counselors found.</td></tr>`;
    } else {
      tbodyC.innerHTML = state.adminCounselors.map(c => `
        <tr>
          <td><strong>${c.id}</strong></td>
          <td>
            <div class="student-meta">
              <span class="student-name">${escapeHtml(c.name)}</span>
              <span class="student-sub">${escapeHtml(c.title || 'Guidance Counselor')}</span>
              <small class="text-gold" style="display:block; font-size:11px; margin-top:2px;">${escapeHtml(c.specialization || 'General Guidance & Counseling')}</small>
            </div>
          </td>
          <td>${escapeHtml(c.email)}<br><small class="text-muted">${c.contact_number || 'N/A'}</small></td>
          <td><span class="badge badge-navy">${escapeHtml(c.department || 'CGCS Guidance')}</span></td>
          <td><span class="badge badge-gold font-weight-bold">${c.activeCases || 0} Cases</span></td>
          <td><span class="badge ${c.status === 'Active' ? 'badge-green' : 'badge-danger'}">${c.status || 'Active'}</span></td>
          <td><small>${c.last_login ? new Date(c.last_login).toLocaleDateString() : 'Active'}</small></td>
          <td class="text-right">
            <div class="action-btn-group">
              <button class="btn btn-xs btn-outline-gold" onclick="editCounselor('${c.id}')" title="Edit Specializations">
                <i class="fa-solid fa-pen-to-square"></i> Edit
              </button>
              <button class="btn btn-xs btn-outline-gold" onclick="toggleUserStatus('${c.id}', '${c.status === 'Active' ? 'Inactive' : 'Active'}')">
                ${c.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <button class="btn btn-xs btn-outline-green" style="color: #EF4444; border-color: #EF4444;" onclick="deleteAdminUser('${c.id}', '${escapeHtml(c.name)}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  // Render Students Table
  const tbodyS = document.getElementById('adminStudentsTableBody');
  if (tbodyS) {
    if (state.adminStudents.length === 0) {
      tbodyS.innerHTML = `<tr><td colspan="9" class="text-center p-3 text-muted">No students registered yet.</td></tr>`;
    } else {
      tbodyS.innerHTML = state.adminStudents.map(s => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>
            <div class="student-meta">
              <span class="student-name">${escapeHtml(s.name)}</span>
              <span class="student-sub">${s.contact_number || 'No contact provided'}</span>
            </div>
          </td>
          <td><strong>${s.student_id || 'N/A'}</strong></td>
          <td><span class="badge badge-navy">${s.college || 'CCIS'}</span><br><small class="text-muted">${escapeHtml(s.program || '')}</small></td>
          <td><small>${s.year_level || '1st Year'}</small></td>
          <td>${escapeHtml(s.email)}</td>
          <td><small>${new Date(s.created_at).toLocaleDateString()}</small></td>
          <td><span class="badge ${s.status === 'Active' ? 'badge-green' : 'badge-danger'}">${s.status || 'Active'}</span></td>
          <td class="text-right">
            <button 
              type="button" 
              class="btn btn-warning btn-xs mr-1" 
              onclick="window.openUniversalProfile('${s.id || s.student_id}')"
              data-user-id="${s.id || s.student_id}"
              style="margin-right: 4px; padding: 4px 8px; font-size: 11px; font-weight: 700;"
              title="View Student Profile"
            >
              <i class="fa-solid fa-user"></i> Profile
            </button>
            <button class="btn btn-xs btn-outline-green" style="color: #EF4444; border-color: #EF4444;" onclick="deleteAdminUser('${s.id}', '${escapeHtml(s.name)}')">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `).join('');
    }
  }
}

function renderAdminAuditTable() {
  const tbody = document.getElementById('adminAuditTableBody');
  if (!tbody) return;

  const validActions = new Set([
    'DPA_PHI_ACCESS',
    'DPA_DUTY_ASSIGN',
    'DPA_USER_MUTATE',
    'DPA_AUTH_LOGIN',
    'DPA_AUTH_LOCKOUT'
  ]);

  const filteredLogs = (state.auditLogs || []).filter(l => {
    if (!l || !l.action) return false;
    const act = l.action.trim();
    const id = String(l.id || '').toLowerCase();
    const details = String(l.details || '').toLowerCase();
    if (id.includes('mock') || details.includes('mock') || details.includes('dummy')) return false;
    return validActions.has(act) || act.startsWith('DPA_');
  });

  if (filteredLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-3 text-muted">No compliance audit logs recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredLogs.map(l => {
    const d = new Date(l.timestamp);
    const timeFormatted = isNaN(d.getTime()) 
      ? (l.timestamp || '') 
      : `${d.toLocaleDateString()} ${d.toLocaleTimeString('en-US', { hour12: true, second: '2-digit' })}`;

    return `
      <tr>
        <td><code>${escapeHtml(l.id || '')}</code></td>
        <td><small class="font-mono">${timeFormatted}</small></td>
        <td><strong>${escapeHtml(l.actor_name || 'System')}</strong></td>
        <td><span class="badge badge-navy">${escapeHtml((l.actor_role || '').toUpperCase())}</span></td>
        <td><span class="badge badge-gold">${escapeHtml(l.action || '')}</span></td>
        <td style="max-width: 320px; font-size: 12px;">${escapeHtml(l.details || '')}</td>
        <td><code>${escapeHtml(l.ip_address || '127.0.0.1')}</code></td>
      </tr>
    `;
  }).join('');
}

window.toggleUserStatus = async function (userId, newStatus) {
  try {
    const res = await authFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await loadAdminData();
    } else {
      showToast(data.message || 'Failed to update user status.', 'error');
    }
  } catch (err) {
    showToast('Error updating user.', 'error');
  }
};

window.deleteAdminUser = async function (userId, userName) {
  if (!confirm(`Are you sure you want to permanently delete user account: ${userName}?`)) return;

  try {
    const res = await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await loadAdminData();
    } else {
      showToast(data.message || 'Failed to delete user.', 'error');
    }
  } catch (err) {
    showToast('Error deleting user.', 'error');
  }
};

window.initDirectorPortal = function () {
  // Bind User Registration Modal Button
  const openModalBtn = document.getElementById('btnOpenCreateUserModal') || document.getElementById('openCreateUserBtn');
  const formAdminUser = document.getElementById('formAdminCreateUser') || document.getElementById('registerUserForm');

  openModalBtn?.addEventListener('click', () => {
    if (formAdminUser) {
      delete formAdminUser.dataset.editingId;
      formAdminUser.reset();
    }
    const modalTitle = document.querySelector('#modalCreateUser .modal-title');
    if (modalTitle) {
      modalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-gold"></i> Register New User Account`;
    }
    const submitBtn = document.querySelector('#modalCreateUser button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerHTML = `<i class="fa-solid fa-save"></i> Create User Account`;
    }
    const passInput = document.getElementById('adminNewUserPassword');
    if (passInput) {
      passInput.required = true;
      passInput.placeholder = 'Min. 6 chars';
    }
    const roleSelect = document.getElementById('adminNewUserRole');
    if (roleSelect) roleSelect.disabled = false;

    openModal('modalCreateUser');
    const specContainer = document.getElementById('counselorSpecializationsContainer');
    if (specContainer && roleSelect) {
      specContainer.style.display = (roleSelect.value === 'counselor') ? 'block' : 'none';
    }
    // Reset specialization dropdowns to default
    if (document.getElementById('counselorSpecializationPrimary')) document.getElementById('counselorSpecializationPrimary').value = '';
    if (document.getElementById('counselorSpecializationSecondary')) document.getElementById('counselorSpecializationSecondary').value = '';
    if (document.getElementById('counselorSpecializationTertiary')) document.getElementById('counselorSpecializationTertiary').value = '';
  });

  // Edit / Pre-populate Counselor Modal with 3 Specializations
  window.populateCounselorSpecializations = function (specializationStr) {
    const specs = (specializationStr || '').split('|').map(s => s.trim());
    if (document.getElementById('counselorSpecializationPrimary')) {
      document.getElementById('counselorSpecializationPrimary').value = specs[0] || '';
    }
    if (document.getElementById('counselorSpecializationSecondary')) {
      document.getElementById('counselorSpecializationSecondary').value = specs[1] || '';
    }
    if (document.getElementById('counselorSpecializationTertiary')) {
      document.getElementById('counselorSpecializationTertiary').value = specs[2] || '';
    }
  };

  // Edit Counselor Modal Opener
  window.editCounselor = function (counselorId) {
    const counselor = (state.adminCounselors || []).find(c => c.id === counselorId);
    if (!counselor) return;

    if (formAdminUser) {
      formAdminUser.dataset.editingId = counselor.id;
    }

    const modalTitle = document.querySelector('#modalCreateUser .modal-title');
    if (modalTitle) {
      modalTitle.innerHTML = `<i class="fa-solid fa-user-pen text-gold"></i> Edit Counselor Account`;
    }
    const submitBtn = document.querySelector('#modalCreateUser button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerHTML = `<i class="fa-solid fa-save"></i> Update Counselor`;
    }

    const roleSelect = document.getElementById('adminNewUserRole');
    if (roleSelect) {
      roleSelect.value = 'counselor';
      roleSelect.disabled = true;
    }

    const nameInput = document.getElementById('adminNewUserName');
    if (nameInput) nameInput.value = counselor.name || '';

    const emailInput = document.getElementById('adminNewUserEmail');
    if (emailInput) emailInput.value = counselor.email || '';

    const passInput = document.getElementById('adminNewUserPassword');
    if (passInput) {
      passInput.required = false;
      passInput.placeholder = '(Leave blank to keep unchanged)';
      passInput.value = '';
    }

    const deptInput = document.getElementById('adminNewUserDept');
    if (deptInput) deptInput.value = counselor.department || '';

    const titleInput = document.getElementById('adminNewUserTitle');
    if (titleInput) titleInput.value = counselor.title || '';

    const specContainer = document.getElementById('counselorSpecializationsContainer');
    if (specContainer) specContainer.style.display = 'block';

    window.populateCounselorSpecializations(counselor.specialization);

    openModal('modalCreateUser');
  };

  const roleSelect = document.getElementById('adminNewUserRole');
  roleSelect?.addEventListener('change', (e) => {
    const selectedRole = e.target.value;
    const specContainer = document.getElementById('counselorSpecializationsContainer');
    if (specContainer) {
      specContainer.style.display = (selectedRole === 'counselor') ? 'block' : 'none';
    }
    
    const titleGroup = document.getElementById('groupAdminNewUserTitle');
    const titleInput = document.getElementById('adminNewUserTitle');
    if (titleGroup) {
      if (selectedRole === 'student') {
        titleGroup.style.display = 'none';
        if (titleInput) titleInput.value = '';
      } else {
        titleGroup.style.display = 'block';
      }
    }
  });

  // Attach User Registration / Edit Form Submit Handler
  formAdminUser?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editingId = formAdminUser.dataset.editingId;
    const role = document.getElementById('adminNewUserRole')?.value || 'counselor';
    const name = (document.getElementById('adminNewUserName')?.value || '').trim();
    const email = (document.getElementById('adminNewUserEmail')?.value || '').trim();
    const password = document.getElementById('adminNewUserPassword')?.value || '';
    const department = (document.getElementById('adminNewUserDept')?.value || '').trim();
    const title = (document.getElementById('adminNewUserTitle')?.value || '').trim();

    let specialization = 'General Guidance & Counseling';
    if (role === 'counselor') {
      const primary = document.getElementById('counselorSpecializationPrimary')?.value || '';
      const secondary = document.getElementById('counselorSpecializationSecondary')?.value || '';
      const tertiary = document.getElementById('counselorSpecializationTertiary')?.value || '';
      const specs = [primary, secondary, tertiary].filter(Boolean);
      specialization = specs.length > 0 ? specs.join(' | ') : 'General Guidance & Counseling';
    }

    if (!editingId && (!name || !email || !password)) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (editingId && (!name || !email)) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const cleanName = name.trim();
    if (/\d/.test(cleanName)) {
      alert("Numbers are not allowed in the Name field.");
      showToast("Numbers are not allowed in the Name field.", "error");
      document.getElementById('adminNewUserName')?.focus();
      return false;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@umak.edu.ph')) {
      alert("Only official UMak email addresses (@umak.edu.ph) are permitted.");
      showToast("Only official UMak email addresses (@umak.edu.ph) are permitted.", "error");
      document.getElementById('adminNewUserEmail')?.focus();
      return false;
    }

    try {
      const url = editingId ? `/api/admin/users/${editingId}` : '/api/admin/users';
      const method = editingId ? 'PATCH' : 'POST';
      const payload = { role, name, email, department, title, specialization };
      if (role === 'student') {
        payload.title = null;
        payload.studentId = cleanEmail.split('@')[0].toUpperCase();
        payload.college = department;
      }
      if (password) payload.password = password;

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || (editingId ? 'Counselor profile updated successfully!' : `User account created successfully for ${name}!`), 'success');
        formAdminUser.reset();
        delete formAdminUser.dataset.editingId;
        const roleSel = document.getElementById('adminNewUserRole');
        if (roleSel) {
          roleSel.disabled = false;
          roleSel.dispatchEvent(new Event('change'));
        }
        closeModal('modalCreateUser');
        await loadAdminData();
      } else {
        showToast(data.message || (editingId ? 'Failed to update counselor profile.' : 'Failed to create user account.'), 'error');
      }
    } catch (err) {
      showToast(editingId ? 'Error updating counselor profile.' : 'Error registering user account.', 'error');
    }
  });

  loadAdminData();
};

async function renderInstitutionalAnalytics() {
  try {
    let userStats = {};
    let appointmentStats = {};
    let studentsByCollege = [];
    let studentStatusBreakdown = [];
    let phqCounts = {};
    let typeCounts = {};

    const res = await authFetch('/api/analytics/director');
    const data = await res.json();
    if (data.success) {
      userStats = data.userStats || {};
      appointmentStats = data.appointmentStats || {};
      studentsByCollege = data.studentsByCollege || [];
      studentStatusBreakdown = data.studentStatusBreakdown || [];
      phqCounts = data.phqCounts || {};
      typeCounts = data.typeCounts || {};
    } else {
      const fallbackRes = await authFetch('/api/admin/analytics');
      const fallbackData = await fallbackRes.json();
      if (fallbackData.success && fallbackData.data) {
        userStats = {
          total_students: fallbackData.data.totalStudents || 0,
          total_counselors: fallbackData.data.activeCounselors || 0
        };
        appointmentStats = {
          completed_sessions: fallbackData.data.completedSessions || 0,
          total_appointments: fallbackData.data.totalAppointments || 0
        };
        studentsByCollege = Object.entries(fallbackData.data.collegeCounts || {}).map(([college, count]) => ({ college, count }));
        phqCounts = fallbackData.data.phqCounts || {};
        typeCounts = fallbackData.data.typeCounts || {};
      }
    }

    // Rewire Director/Counselor metric cards
    const totalStudents = userStats.total_students || 0;
    const activeCounselors = userStats.total_counselors || 0;
    const completedSessions = appointmentStats.completed_sessions || 0;

    // "Total Students"
    const elStudents = document.getElementById('adminTotalScreenings') || document.getElementById('adminTotalStudents');
    if (elStudents) elStudents.textContent = totalStudents;
    const elTotalStudentsAlt = document.getElementById('adminTotalStudents');
    if (elTotalStudentsAlt) elTotalStudentsAlt.textContent = totalStudents;

    // "Active Counselors"
    const elCounselors = document.getElementById('adminActiveCounselors');
    if (elCounselors) elCounselors.textContent = activeCounselors;

    // "Completed Sessions"
    const elConsultations = document.getElementById('adminTotalConsultations');
    if (elConsultations) elConsultations.textContent = completedSessions;
    const elQueueCompleted = document.getElementById('metricQueueCompleted');
    if (elQueueCompleted) elQueueCompleted.textContent = completedSessions;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#F1F5F9' : '#1C2833';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    const colors = {
      green: isDark ? '#34D399' : '#006A4E',
      greenLight: isDark ? '#10B981' : '#0B8764',
      gold: '#FFB800',
      navy: isDark ? '#93C5FD' : '#0B1B2B',
      red: '#EF4444',
      blue: '#3B82F6',
      purple: '#8B5CF6'
    };

    // 1. Live Appointment & Case Session Distribution (Zero Mock Data)
    const ctxPeak = document.getElementById('chartPeakStress')?.getContext('2d');
    if (ctxPeak) {
      if (state.charts.peak) state.charts.peak.destroy();

      const totalApts = appointmentStats.total_appointments || 0;
      const peakLabels = totalApts > 0 ? ['Completed Sessions', 'Pending Sessions', 'Cancelled Sessions'] : [];
      const peakData = totalApts > 0 ? [
        appointmentStats.completed_sessions || 0,
        appointmentStats.pending_sessions || 0,
        appointmentStats.cancelled_sessions || 0
      ] : [];

      state.charts.peak = new Chart(ctxPeak, {
        type: 'bar',
        data: {
          labels: peakLabels,
          datasets: [{
            label: 'Sessions Count',
            data: peakData,
            backgroundColor: [colors.greenLight, colors.gold, colors.red],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // 2. PHQ-9 Depression Severity Breakdown (Zero Mock Data)
    const ctxPHQ = document.getElementById('chartPHQ')?.getContext('2d');
    if (ctxPHQ) {
      if (state.charts.phq) state.charts.phq.destroy();

      const phqCounselorTerms = {
        'Minimal Depression': 'Minimal Concern',
        'Minimal': 'Minimal Concern',
        'Mild Depression': 'Mild Concern',
        'Mild': 'Mild Concern',
        'Moderate Depression': 'Moderate Concern',
        'Moderate': 'Moderate Concern',
        'Moderately Severe Depression': 'High Concern',
        'Moderately Severe': 'High Concern',
        'Severe Depression': 'Severe Concern',
        'Severe': 'Severe Concern'
      };

      const phqEntries = Object.entries(phqCounts).filter(([_, c]) => c > 0);
      const phqLabels = phqEntries.map(([k]) => phqCounselorTerms[k] || k.replace(/Depression/gi, 'Concern').trim());
      const phqData = phqEntries.map(([_, v]) => v);

      state.charts.phq = new Chart(ctxPHQ, {
        type: 'doughnut',
        data: {
          labels: phqLabels,
          datasets: [{
            data: phqData,
            backgroundColor: [colors.greenLight, colors.gold, '#F97316', colors.red],
            borderColor: isDark ? '#131F33' : '#FFFFFF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor }
            }
          }
        }
      });
    }

    // 3. Live Registered Students Grouped by Academic College (Zero Mock Data)
    const ctxCollege = document.getElementById('chartCollege')?.getContext('2d');
    if (ctxCollege) {
      if (state.charts.college) state.charts.college.destroy();

      const collegeFiltered = (studentsByCollege || []).filter(c => c.count > 0);
      const collegeLabels = collegeFiltered.map(c => c.college);
      const collegeData = collegeFiltered.map(c => c.count);

      state.charts.college = new Chart(ctxCollege, {
        type: 'pie',
        data: {
          labels: collegeLabels,
          datasets: [{
            data: collegeData,
            backgroundColor: [colors.green, colors.gold, colors.navy, colors.blue, colors.purple, '#EC4899', '#F97316'],
            borderColor: isDark ? '#131F33' : '#FFFFFF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor }
            }
          }
        }
      });
    }

    // 4. Counseling Categories / Student Status Breakdown (Zero Mock Data)
    const ctxTypes = document.getElementById('chartTypes')?.getContext('2d');
    if (ctxTypes) {
      if (state.charts.types) state.charts.types.destroy();

      const typeEntries = Object.entries(typeCounts).filter(([_, c]) => c > 0);
      let finalLabels = [];
      let finalData = [];
      let datasetLabel = 'Consultations by Focus Area';

      if (typeEntries.length > 0) {
        finalLabels = typeEntries.map(([t]) => t);
        finalData = typeEntries.map(([_, c]) => c);
      } else {
        const statusFiltered = (studentStatusBreakdown || []).filter(s => s.count > 0);
        if (statusFiltered.length > 0) {
          finalLabels = statusFiltered.map(s => s.status);
          finalData = statusFiltered.map(s => s.count);
          datasetLabel = 'Student Status Distribution';
        }
      }

      state.charts.types = new Chart(ctxTypes, {
        type: 'bar',
        data: {
          labels: finalLabels,
          datasets: [{
            label: datasetLabel,
            data: finalData,
            backgroundColor: colors.greenLight,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  } catch (e) {
    console.error('Error rendering institutional analytics:', e);
  }
}

// ====================================================
// 12. MODAL CONTROLLER
// ====================================================
function initModals() {
  document.getElementById('btnOpenCreateUserModal')?.addEventListener('click', () => openModal('modalCreateUser'));
  document.getElementById('openCreateUserBtn')?.addEventListener('click', () => openModal('modalCreateUser'));
  document.getElementById('closeForgotModal')?.addEventListener('click', () => closeForgotPasswordModal());
  document.getElementById('btnCancelForgotModal')?.addEventListener('click', () => closeForgotPasswordModal());

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.close;
      if (target === 'modalForgotPassword') {
        closeForgotPasswordModal();
      } else {
        closeModal(target);
      }
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        if (m.id === 'modalForgotPassword') {
          closeForgotPasswordModal();
        } else {
          closeModal(m.id);
        }
      }
    });
  });

  // Admin Create User Form listener
  initDirectorPortal();

  // Save SOAP Notes Form
  const formSOAP = document.getElementById('formSaveSOAP');
  formSOAP?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const appointmentId = document.getElementById('soapApptId')?.value;
    const studentId = document.getElementById('soapStudentId')?.value;
    const subjective = document.getElementById('soapSubjective')?.value?.trim();
    const objective = document.getElementById('soapObjective')?.value?.trim();
    const assessment = document.getElementById('soapAssessment')?.value?.trim();
    const plan = document.getElementById('soapPlan')?.value?.trim();
    const remarks = document.getElementById('soapRemarks')?.value?.trim();

    try {
      const res = await authFetch('/api/soap', {
        method: 'POST',
        body: JSON.stringify({ appointmentId, studentId, subjective, objective, assessment, plan, remarks })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        closeModal('modalClinicalSheet');
        closeModal('modalSOAP');
        await fetchAppointments();
        await fetchCompletedCases();
      } else {
        showToast(data.message || 'Failed to save SOAP notes.', 'error');
      }
    } catch (err) {
      showToast('Error saving SOAP notes.', 'error');
    }
  });
}

function openModal(id) {
  let el = document.getElementById(id);
  if (!el && (id === 'modalCrisisLifelines' || id === 'modalCrisisIntervention')) {
    el = document.getElementById('modalEmergencyCrisis');
  }
  if (!el) return;
  if (el.classList.contains('crisis-modal-card') && el.closest('.modal-backdrop')) {
    el = el.closest('.modal-backdrop');
  }
  el.classList.remove('hidden');
  el.classList.add('show');
  el.style.display = 'flex';
  if (id === 'modalCreateUser') {
    const roleSelect = document.getElementById('adminNewUserRole');
    if (roleSelect) {
      roleSelect.dispatchEvent(new Event('change'));
    }
  }
  if (typeof setupNameAndEmailValidation === 'function') {
    setupNameAndEmailValidation();
  }
}
function closeModal(id) {
  if (id === 'modalClinicalMonitoringSheet' || id === 'modalClinicalSheet') {
    if (typeof window.closeClinicalMonitoringSheet === 'function') {
      window.closeClinicalMonitoringSheet();
      return;
    }
  }
  let el = document.getElementById(id);
  if (!el && (id === 'modalCrisisLifelines' || id === 'modalCrisisIntervention')) {
    el = document.getElementById('modalEmergencyCrisis');
  }
  if (!el) return;
  if (el.classList.contains('crisis-modal-card') && el.closest('.modal-backdrop')) {
    el = el.closest('.modal-backdrop');
  }
  el.classList.remove('show');
  el.classList.add('hidden');
  el.style.display = 'none';
}
window.openModal = openModal;
window.closeModal = closeModal;

// XSS Escape Helper
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
window.escapeHtml = escapeHtml;

// ====================================================
// 13. COUNSELOR STUDENT DIRECTORY CONTROLLER
// ====================================================

state.studentDirectory = [];
state.studentDirectoryByCollege = {};

window.loadCounselorStudents = async function () {
  await window.loadCounselorStudentDirectory();
};

window.loadCounselorStudentDirectory = async function () {
  const container = document.getElementById('counselorStudentDirectoryContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="card p-4 text-center">
      <i class="fa-solid fa-spinner fa-spin text-gold" style="font-size: 28px; margin-bottom: 12px;"></i>
      <div class="text-muted">Loading Student Directory grouped by Academic College...</div>
    </div>
  `;

  try {
    const res = await authFetch('/api/counselor/students');
    const data = await res.json();

    if (data.success) {
      state.studentDirectory = data.students || [];
      state.studentDirectoryByCollege = data.byCollege || {};

      // Update Summary Metrics
      const totalStudents = state.studentDirectory.length;
      const totalColleges = Object.keys(state.studentDirectoryByCollege).length;
      const consultedStudents = state.studentDirectory.filter(s => s.total_sessions > 0).length;

      const elTotal = document.getElementById('dirMetricTotalStudents');
      const elColleges = document.getElementById('dirMetricTotalColleges');
      const elConsulted = document.getElementById('dirMetricConsultedStudents');

      if (elTotal) elTotal.textContent = totalStudents;
      if (elColleges) elColleges.textContent = totalColleges;
      if (elConsulted) elConsulted.textContent = consultedStudents;

      renderStudentDirectory(state.studentDirectory, state.studentDirectoryByCollege);
    } else {
      container.innerHTML = `<div class="alert-notice alert-danger p-3">${data.message || 'Failed to load student directory.'}</div>`;
    }
  } catch (err) {
    console.error('Error loading counselor student directory:', err);
    container.innerHTML = `<div class="alert-notice alert-danger p-3">Network error loading student directory.</div>`;
  }
};

window.renderStudentDirectory = function (students, byCollege) {
  const container = document.getElementById('counselorStudentDirectoryContainer');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = `
      <div class="card p-0" style="border: 1px solid var(--border-color); overflow: hidden;">
        <div class="table-responsive">
          <table class="data-table mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Student ID</th>
                <th>Email</th>
                <th>Verification</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center py-4 text-slate-400">No registered students found.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  const collegeNames = {
    'CCIS': 'College of Computing & Information Sciences (CCIS)',
    'CBFS': 'College of Business & Financial Science (CBFS)',
    'CAL': 'College of Arts & Letters (CAL)',
    'COED': 'College of Education (COED)',
    'CAHS': 'College of Allied Health Sciences (CAHS)',
    'CIT': 'College of Industrial Technology (CIT)',
    'CLov': 'College of Law & Governance (CLov)'
  };

  let html = '';

  Object.entries(byCollege).forEach(([collegeCode, collegeStudents]) => {
    if (!collegeStudents || collegeStudents.length === 0) return;

    const fullCollegeName = collegeNames[collegeCode] || `${collegeCode} Department`;
    const collegeIdSafe = collegeCode.replace(/[^a-zA-Z0-9]/g, '');

    html += `
      <div class="card mb-3" style="border: 1px solid var(--border-color); overflow: hidden;">
        <div class="card-header d-flex justify-content-between align-items-center" style="cursor: pointer; background: var(--sub-card-bg); padding: 14px 18px;" onclick="toggleCollegeCollapse('${collegeIdSafe}')">
          <div class="d-flex align-items-center gap-2">
            <span class="badge badge-primary" style="font-weight: 700; font-size: 12px; padding: 4px 10px;">${collegeCode}</span>
            <strong style="font-size: 14.5px;">${fullCollegeName}</strong>
            <span class="badge badge-info" style="font-size: 11px;">${collegeStudents.length} student${collegeStudents.length > 1 ? 's' : ''}</span>
          </div>
          <div class="d-flex align-items-center gap-2 text-muted" style="font-size: 13px;">
            <span id="collapseIcon-${collegeIdSafe}"><i class="fa-solid fa-chevron-up"></i></span>
          </div>
        </div>

        <div id="collegeSection-${collegeIdSafe}" class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Student ID</th>
                <th>Email</th>
                <th>Verification</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    collegeStudents.forEach(s => {
      const student = s;
      const phoneText = student.contact_number ? `<br><small class="text-muted"><i class="fa-solid fa-phone" style="font-size: 10px;"></i> ${escapeHtml(student.contact_number)}</small>` : '';
      const isVerified = student.is_verified || student.isVerified;
      const initials = (student.name || 'Student').split(' ').filter(n => n.length > 0).map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const avatarHtml = (student.avatar && student.avatar.length > 50)
        ? `<img src="${student.avatar}" alt="" class="rounded-circle shadow-sm" style="width: 36px; height: 36px; border-radius: 50% !important; object-fit: cover; border: 1.5px solid #f59e0b; flex-shrink: 0;">`
        : `<div class="rounded-circle shadow-sm" style="width: 36px; height: 36px; border-radius: 50% !important; background-color: #0b1329; border: 1.5px solid #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #f59e0b; flex-shrink: 0;">${initials}</div>`;

      html += `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-2" style="display: flex; align-items: center; gap: 10px;">
              ${avatarHtml}
              <div>
                <strong>${escapeHtml(student.name)}</strong>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(student.college || 'CCIS')} &bull; ${escapeHtml(student.program || 'Undergraduate Degree')}</div>
              </div>
            </div>
          </td>
          <td><strong style="font-family: monospace; font-size: 12.5px;">${escapeHtml(student.student_id || student.id)}</strong></td>
          <td>
            <span style="font-size: 12.5px;">${escapeHtml(student.email)}</span>
            ${phoneText}
          </td>
          <td>
            ${isVerified ? '<span class="badge badge-green" style="font-size: 11px;"><i class="fa-solid fa-circle-check"></i> Verified</span>' : '<span class="badge badge-secondary" style="font-size: 11px; opacity: 0.75;"><i class="fa-solid fa-clock"></i> Unverified</span>'}
          </td>
          <td>
            <select class="select-control" style="width: auto; padding: 4px 8px; font-size: 12px; font-weight: 600; cursor: pointer;" onchange="updateStudentStatus('${student.id}', this.value)">
              <option value="Active" ${(student.status || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Under Counseling" ${student.status === 'Under Counseling' ? 'selected' : ''}>Under Counseling</option>
              <option value="Completed" ${student.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="Flagged" ${student.status === 'Flagged' ? 'selected' : ''}>Flagged</option>
            </select>
          </td>
          <td class="text-right" style="white-space: nowrap;">
            <button 
              type="button" 
              class="btn btn-warning btn-xs"
              data-user-id="${student.id || student.student_id}"
              onclick="window.openUniversalProfile('${student.id || student.student_id}')"
              data-name="${escapeHtml(student.name || '')}"
              data-id="${escapeHtml(student.student_id || student.id || '')}"
              data-college="${escapeHtml(student.college || 'CCIS')}"
              data-email="${escapeHtml(student.email || '')}"
              data-role="Student"
              data-status="${student.is_verified || student.isVerified ? 'Active' : 'Pending'}"
              style="background: #f59e0b; color: #020617; font-weight: 700; font-size: 11px; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; margin-right: 4px;"
            >
              <i class="fa-solid fa-user"></i> View Profile
            </button>
            <button type="button" class="btn btn-xs btn-outline-info mr-1" onclick="openStudentHealthModal('${student.id || student.student_id}', '${escapeHtml(student.name)}')" title="View Health & Medical Intake" style="padding: 5px 10px; font-size: 11px; margin-right: 4px;">
              <i class="fa-solid fa-heart-pulse"></i> Medical
            </button>
            <button type="button" class="btn btn-xs btn-outline-gold mr-1" onclick="openStudentSoapHistoryModal('${student.id}', '${escapeHtml(student.name)}')" title="View Clinical SOAP Case History" style="padding: 5px 10px; font-size: 11px; margin-right: 4px;">
              <i class="fa-solid fa-folder-medical"></i> SOAP
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary mr-1" onclick="openClinicalMonitoringSheet('${student.id || student.student_id}')" title="Confidential Clinical Monitoring Sheet" style="padding: 5px 10px; font-size: 11px; margin-right: 4px;">
              <i class="fa-solid fa-clipboard-list"></i> Clinical Sheet
            </button>
            ${((state.currentUser?.role || '').toLowerCase() === 'director' || (state.currentUser?.role || '').toLowerCase() === 'superadmin') ? `
            <button 
              type="button" 
              onclick="window.removeStudentRecord('${student.id || student.student_id}', '${escapeHtml(student.name || 'Student')}', this)"
              style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; font-size: 11px; padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.4); cursor: pointer;"
              title="Permanently delete student record"
            >
              <i class="fa-solid fa-trash"></i> Remove
            </button>` : ''}
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
};


window.updateStudentStatus = async function (id, newStatus) {
  try {
    const res = await authFetch(`/api/counselor/students/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Student status updated successfully.', 'success');
      const target = state.studentDirectory.find(s => s.id === id || s.student_id === id);
      if (target) target.status = newStatus;
    } else {
      showToast(data.error || data.message || 'Failed to update student status.', 'error');
      await loadCounselorStudents();
    }
  } catch (err) {
    console.error('Error updating student status:', err);
    showToast('Network error updating student status.', 'error');
    await loadCounselorStudents();
  }
};

window.removeUserRecord = async function(id, name, role, btnEl) {
  const userRole = (state.currentUser?.role || localStorage.getItem('user_role') || '').toLowerCase();
  if (userRole !== 'director' && userRole !== 'superadmin') {
    alert('Access denied: Only the Guidance Director has permission to remove user accounts.');
    return;
  }
  const roleLabel = (role || 'user').toLowerCase() === 'student' ? 'Student' : 'Staff / Counselor';
  if (!confirm(`Are you sure you want to permanently delete the ${roleLabel} account for "${name}" (${id})? This cannot be undone.`)) {
    return;
  }
  const row = btnEl ? btnEl.closest('tr') : null;
  if (row) {
    row.style.opacity = '0.3';
    row.style.pointerEvents = 'none';
  }
  try {
    // Both counselors, directors, and students can be deleted through the admin endpoint
    const res = await authFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      if (typeof showToast === 'function') {
        showToast(data.message || `Account for "${name}" successfully deleted.`, 'success');
      }
      if (row) row.remove();
      if (typeof loadDirectorData === 'function') await loadDirectorData();
    } else {
      alert(data.message || `Failed to remove ${roleLabel} account.`);
      if (row) {
        row.style.opacity = '1';
        row.style.pointerEvents = 'auto';
      }
    }
  } catch (err) {
    console.error('Error deleting user record:', err);
    alert('Network error while deleting account.');
    if (row) {
      row.style.opacity = '1';
      row.style.pointerEvents = 'auto';
    }
  }
};
// Backward compatibility alias
window.removeStudentRecord = window.removeUserRecord;
window.confirmDeleteStudent = window.removeStudentRecord;

window.toggleCollegeCollapse = function (collegeIdSafe) {
  const section = document.getElementById(`collegeSection-${collegeIdSafe}`);
  const icon = document.getElementById(`collapseIcon-${collegeIdSafe}`);
  if (!section) return;

  if (section.style.display === 'none') {
    section.style.display = 'block';
    if (icon) icon.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
  } else {
    section.style.display = 'none';
    if (icon) icon.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
  }
};

window.filterStudentDirectory = function () {
  const query = (document.getElementById('directorySearchInput')?.value || '').trim().toLowerCase();
  const selectedCollege = document.getElementById('directoryCollegeSelect')?.value || 'ALL';

  let filtered = state.studentDirectory.filter(s => {
    const matchesCollege = (selectedCollege === 'ALL') || (s.college && s.college.toUpperCase() === selectedCollege.toUpperCase());
    if (!matchesCollege) return false;

    if (!query) return true;
    const nameMatch = (s.name || '').toLowerCase().includes(query);
    const idMatch = (s.student_id || '').toLowerCase().includes(query);
    const emailMatch = (s.email || '').toLowerCase().includes(query);
    const progMatch = (s.program || '').toLowerCase().includes(query);
    return nameMatch || idMatch || emailMatch || progMatch;
  });

  // Regroup filtered
  const byCollege = {};
  filtered.forEach(s => {
    const col = s.college || 'General';
    if (!byCollege[col]) byCollege[col] = [];
    byCollege[col].push(s);
  });

  renderStudentDirectory(filtered, byCollege);
};

// Render student profile with avatar in Counselor/Director view
window.renderCounselorStudentProfile = function(student) {
  const avatarImg = document.getElementById('counselorViewStudentAvatar');
  const initialsSpan = document.getElementById('counselorViewStudentInitials');
  const nameEl = document.getElementById('counselorViewStudentName');
  const idEl = document.getElementById('counselorViewStudentId');
  const collegeEl = document.getElementById('counselorViewStudentCollege');
  const programEl = document.getElementById('counselorViewStudentProgram');

  if (nameEl) nameEl.textContent = student.name || 'Unknown Student';
  if (idEl) idEl.textContent = `ID: ${student.student_id || student.id_number || 'N/A'}`;
  if (collegeEl) collegeEl.textContent = student.college || 'UMak';
  if (programEl) programEl.textContent = student.program || 'Undergraduate';

  const initials = (student.name || 'Student')
    .split(' ')
    .filter(n => n.length > 0)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (student.avatar && student.avatar.length > 50) {
    if (avatarImg) {
      avatarImg.src = student.avatar;
      avatarImg.classList.remove('d-none');
    }
    if (initialsSpan) initialsSpan.classList.add('d-none');
  } else {
    if (avatarImg) {
      avatarImg.src = '';
      avatarImg.classList.add('d-none');
    }
    if (initialsSpan) {
      initialsSpan.textContent = initials;
      initialsSpan.classList.remove('d-none');
    }
  }
};

// Hook into Counselor's student view triggers
window.viewStudentClinicalRecord = async function(studentId) {
  try {
    const res = await fetch(`/api/counselor/student/${studentId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken)}` }
    });
    const data = await res.json();
    if (data.success && data.student) {
      renderCounselorStudentProfile(data.student);
      const modal = document.getElementById('modalStudentDetails');
      if (modal) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          (bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal)).show();
        } else if (typeof openModal === 'function') {
          openModal('modalStudentDetails');
        }
      }
    } else {
      alert(data.message || 'Unable to open student record.');
    }
  } catch (err) {
    console.error('Error opening student record:', err);
  }
};

window.openStudentProfileModal = function (studentId) {
  const student = state.studentDirectory.find(s => s.id === studentId || s.student_id === studentId);
  if (!student) {
    showToast('Student details not found.', 'error');
    return;
  }

  // Populate avatar and initials in student profile modal
  const profAvatar = document.getElementById('profModalAvatar');
  const profInitials = document.getElementById('profModalInitials');
  const initials = (student.name || 'Student').split(' ').filter(n => n.length > 0).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  if (student.avatar && student.avatar.length > 50) {
    if (profAvatar) {
      profAvatar.src = student.avatar;
      profAvatar.style.display = 'block';
    }
    if (profInitials) profInitials.style.display = 'none';
  } else {
    if (profAvatar) {
      profAvatar.src = '';
      profAvatar.style.display = 'none';
    }
    if (profInitials) {
      profInitials.textContent = initials;
      profInitials.style.display = 'flex';
    }
  }

  document.getElementById('profModalName').textContent = student.name || 'Unknown Student';
  document.getElementById('profModalStudentId').textContent = student.student_id || '-';
  document.getElementById('profModalCollege').textContent = student.college || 'General';
  document.getElementById('profModalEmail').textContent = student.email || '-';
  document.getElementById('profModalContact').textContent = student.contact_number || 'None provided';
  document.getElementById('profModalProgram').textContent = student.program || 'Undergraduate Degree';
  document.getElementById('profModalYear').textContent = student.year_level || '1st Year';
  document.getElementById('profModalFirstSession').textContent = student.first_session_date || 'No sessions yet';
  document.getElementById('profModalTotalSessions').textContent = `${student.total_sessions || 0} consultation(s)`;

  const soapBtn = document.getElementById('profModalViewSoapBtn');
  if (soapBtn) {
    soapBtn.onclick = () => {
      closeModal('modalStudentProfile');
      openStudentSoapHistoryModal(student.id, student.name);
    };
  }

  openModal('modalStudentProfile');
};

window.openStudentSoapHistoryModal = async function (studentId, studentName) {
  const titleEl = document.getElementById('soapHistModalTitle');
  if (titleEl) titleEl.textContent = `SOAP Clinical History: ${studentName || 'Student'}`;

  const container = document.getElementById('soapHistoryTimelineContainer');
  if (container) {
    container.innerHTML = `
      <div class="text-center p-3">
        <i class="fa-solid fa-spinner fa-spin text-gold" style="font-size: 24px; margin-bottom: 8px;"></i>
        <div class="text-muted">Loading decrypted clinical case notes...</div>
      </div>
    `;
  }

  try {
    const res = await authFetch(`/api/counselor/students/${studentId}/soap-history`);
    const data = await res.json();

    if (!res.ok && data.requiresDelegation) {
      window.openRequestAccessModal({
        studentId: data.studentId || studentId,
        studentName: data.studentName || studentName,
        targetCounselorId: data.targetCounselorId,
        targetCounselorName: data.targetCounselorName
      });
      return;
    }

    openModal('modalStudentSoapHistory');

    if (data.success && data.notes && data.notes.length > 0) {
      let notesHtml = '';
      if (data.isDelegatedReadOnly) {
        notesHtml += `
          <div class="alert-notice alert-warning mb-3" style="background: rgba(245, 158, 11, 0.15); border: 1px solid var(--umak-gold); padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #f8fafc;">
            <i class="fa-solid fa-eye text-gold"></i> <strong>Temporary Delegated Read-Only Access (24h)</strong> - Authorized by ${escapeHtml(data.student?.name || 'Staff')}
          </div>
        `;
      }
      notesHtml += '<div class="timeline" style="display: flex; flex-direction: column; gap: 14px;">';

      data.notes.forEach((n, idx) => {
        notesHtml += `
          <div class="card p-3" style="background: var(--sub-card-bg); border-left: 4px solid var(--umak-green);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <strong style="font-size: 14px;"><i class="fa-solid fa-calendar-day text-gold"></i> Session Date: ${n.appointment_date || 'Undated'} (${n.time_slot || 'Regular'})</strong>
                <span class="text-muted" style="font-size: 12px; margin-left: 8px;">Documented by: <em>${escapeHtml(n.counselor_name || n.session_counselor || 'Counselor')}</em></span>
              </div>
              <span class="badge badge-primary" style="font-size: 11px;">Record #${data.notes.length - idx}</span>
            </div>

            <div class="soap-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12.5px;">
              <div style="background: rgba(0,0,0,0.08); padding: 8px 10px; border-radius: var(--radius-sm);">
                <strong class="text-gold">S (Subjective):</strong>
                <p style="margin: 4px 0 0 0;">${escapeHtml(n.subjective || 'None recorded')}</p>
              </div>
              <div style="background: rgba(0,0,0,0.08); padding: 8px 10px; border-radius: var(--radius-sm);">
                <strong class="text-gold">O (Objective):</strong>
                <p style="margin: 4px 0 0 0;">${escapeHtml(n.objective || 'None recorded')}</p>
              </div>
              <div style="background: rgba(0,0,0,0.08); padding: 8px 10px; border-radius: var(--radius-sm);">
                <strong class="text-gold">A (Assessment):</strong>
                <p style="margin: 4px 0 0 0;">${escapeHtml(n.assessment || 'None recorded')}</p>
              </div>
              <div style="background: rgba(0,0,0,0.08); padding: 8px 10px; border-radius: var(--radius-sm);">
                <strong class="text-gold">P (Plan):</strong>
                <p style="margin: 4px 0 0 0;">${escapeHtml(n.plan || 'None recorded')}</p>
              </div>
            </div>

            ${n.remarks ? `<div class="mt-2 text-muted" style="font-size: 12px;"><strong>Counselor Remarks:</strong> ${escapeHtml(n.remarks)}</div>` : ''}
          </div>
        `;
      });

      notesHtml += '</div>';
      container.innerHTML = notesHtml;
    } else {
      container.innerHTML = `
        <div class="card p-4 text-center">
          <i class="fa-solid fa-notes-medical text-muted" style="font-size: 32px; margin-bottom: 10px;"></i>
          <h4 style="margin: 0 0 6px 0;">No SOAP Case Records</h4>
          <p class="text-muted" style="font-size: 13px;">No clinical SOAP notes have been documented for this student yet.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error fetching SOAP notes history:', err);
    container.innerHTML = `<div class="alert-notice alert-danger p-3">Failed to load SOAP case history.</div>`;
  }
};

// Medical & Medication Health Intake Guarded Modal
window.openStudentHealthModal = async function (studentId, studentName) {
  try {
    const res = await authFetch(`/api/counselor/students/${studentId}/health-intake`);
    const data = await res.json();

    if (!res.ok && data.requiresDelegation) {
      window.openRequestAccessModal({
        studentId: data.studentId || studentId,
        studentName: data.studentName || studentName,
        targetCounselorId: data.targetCounselorId,
        targetCounselorName: data.targetCounselorName
      });
      return;
    }

    if (data.success && data.data) {
      const d = data.data;
      const titleEl = document.getElementById('healthModalTitle');
      if (titleEl) titleEl.textContent = `Medical & Intake History: ${studentName || d.studentName || 'Student'}`;

      const badgeEl = document.getElementById('healthModalDelegatedBadge');
      if (badgeEl) badgeEl.style.display = data.isDelegatedReadOnly ? 'block' : 'none';

      const contentEl = document.getElementById('healthModalContent');
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="p-3 mb-3" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px;">
            <div class="mb-2"><strong>Student:</strong> ${escapeHtml(d.studentName || studentName)} (${escapeHtml(d.studentId || studentId)})</div>
            <div class="mb-2"><strong>College:</strong> ${escapeHtml(d.college || 'N/A')}</div>
            <div class="mb-2"><strong>Intake Completed:</strong> <span class="badge ${d.hasCompletedIntake ? 'badge-green' : 'badge-danger'}">${d.hasCompletedIntake ? 'Yes (' + (d.intakeCompletedAt ? new Date(d.intakeCompletedAt).toLocaleDateString() : 'Recorded') + ')' : 'Pending'}</span></div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div class="p-3" style="background: rgba(0,0,0,0.1); border-radius: 6px; border-left: 3px solid var(--umak-gold);">
              <strong class="text-gold"><i class="fa-solid fa-notes-medical"></i> Physical Illness / Chronic Medical Conditions:</strong>
              <p class="mt-1 mb-0" style="font-size: 13px;">${escapeHtml(d.medicalConditions || 'None reported')}</p>
            </div>
            <div class="p-3" style="background: rgba(0,0,0,0.1); border-radius: 6px; border-left: 3px solid #10b981;">
              <strong class="text-green"><i class="fa-solid fa-pills"></i> Current Maintenance Medications:</strong>
              <p class="mt-1 mb-0" style="font-size: 13px;">${escapeHtml(d.currentMedications || 'None reported')}</p>
            </div>
            <div class="p-3" style="background: rgba(0,0,0,0.1); border-radius: 6px; border-left: 3px solid #38bdf8;">
              <strong style="color: #38bdf8;"><i class="fa-solid fa-brain"></i> Previous Psychiatric Diagnosis & Medication History:</strong>
              <p class="mt-1 mb-0" style="font-size: 13px;">${escapeHtml(d.previousMedications || 'None reported')}</p>
            </div>
          </div>
        `;
      }
      openModal('modalStudentHealthIntake');
    } else {
      showToast(data.message || 'Unable to retrieve medical history.', 'error');
    }
  } catch (err) {
    showToast('Error loading medical health history.', 'error');
  }
};

// Delegated Access Request Modal Opener
window.openRequestAccessModal = function (info) {
  const modal = document.getElementById('modalRequestAccess');
  if (!modal) return;
  document.getElementById('reqAccessStudentId').value = info.studentId || '';
  document.getElementById('reqAccessTargetCounselorId').value = info.targetCounselorId || '';
  document.getElementById('reqAccessStudentName').textContent = info.studentName || info.studentId || 'Selected Student';
  document.getElementById('reqAccessTargetCounselorName').textContent = info.targetCounselorName || 'Assigned Counselor / Directorate';
  document.getElementById('reqAccessNoticeText').textContent = `🔒 Confidential Record: Request authorization from primary counselor ${info.targetCounselorName || 'Assigned Counselor'} or Director to view SOAP notes and health history.`;
  document.getElementById('reqAccessReason').value = '';
  openModal('modalRequestAccess');
};

// Form Handler for Delegated Access Request
document.getElementById('formRequestDelegatedAccess')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = document.getElementById('reqAccessStudentId')?.value;
  const targetCounselorId = document.getElementById('reqAccessTargetCounselorId')?.value;
  const reason = document.getElementById('reqAccessReason')?.value?.trim();
  if (!studentId || !reason) {
    showToast('Please provide a clinical justification reason.', 'error');
    return;
  }
  try {
    const res = await authFetch('/api/delegated-access/request', {
      method: 'POST',
      body: JSON.stringify({ studentId, targetCounselorId, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Access authorization request submitted to primary counselor and Director.', 'success');
      closeModal('modalRequestAccess');
      if (typeof loadDelegatedAccessRequests === 'function') {
        loadDelegatedAccessRequests();
      }
    } else {
      showToast(data.message || 'Failed to submit access request.', 'error');
    }
  } catch (err) {
    showToast('Error submitting access request.', 'error');
  }
});

// Delegated Access Requests Loader, Filter & Review
window._delegatedRequestsCache = [];

function renderDelegatedRequestsRows(list) {
  if (!list || list.length === 0) {
    return `<tr><td colspan="6" class="text-center py-4 table-empty-state">No delegated access requests found.</td></tr>`;
  }
  return list.map(req => {
    const statusRaw = (req.status || 'Pending').trim();
    const statusLower = statusRaw.toLowerCase();

    let badgeHtml = '';
    if (statusLower === 'approved') {
      badgeHtml = `
        <span class="status-indicator-badge status-badge-approved">
          <i class="bi bi-check-circle-fill"></i> Approved
        </span>`;
    } else if (statusLower === 'declined') {
      badgeHtml = `
        <span class="status-indicator-badge status-badge-declined">
          <i class="bi bi-x-circle-fill"></i> Declined
        </span>`;
    } else {
      badgeHtml = `
        <div class="d-flex align-items-center gap-2">
          <span class="status-indicator-badge status-badge-pending">
            <i class="bi bi-clock-history"></i> Pending Review
          </span>
          ${typeof handleReviewDelegatedAccess === 'function' ? `
          <div class="delegated-action-group d-inline-flex gap-1">
            <button type="button" class="btn btn-xs btn-outline-success rounded-pill px-2 py-0" style="font-size: 0.72rem;" onclick="handleReviewDelegatedAccess(${req.id}, 'Approved', '${escapeHtml(req.requester_name || req.requesting_counselor_name || 'Counselor').replace(/'/g, "\\'")}', '${escapeHtml(req.student_name || 'Student').replace(/'/g, "\\'")}')">
              <i class="bi bi-check2"></i> Approve
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger rounded-pill px-2 py-0" style="font-size: 0.72rem;" onclick="handleReviewDelegatedAccess(${req.id}, 'Declined', '${escapeHtml(req.requester_name || req.requesting_counselor_name || 'Counselor').replace(/'/g, "\\'")}', '${escapeHtml(req.student_name || 'Student').replace(/'/g, "\\'")}')">
              <i class="bi bi-x-lg"></i> Decline
            </button>
          </div>` : ''}
        </div>`;
    }

    return `
      <tr class="align-middle">
        <td>
          <strong class="text-warning" style="font-size: 0.84rem;">#REQ-${req.id}</strong>
        </td>
        <td>
          <div class="delegated-requester-name fw-semibold">${escapeHtml(req.requester_name || req.requesting_counselor_name || 'Prof. Alan Reyes, RGC')}</div>
          <div class="text-muted small">Target: ${escapeHtml(req.target_counselor || req.target_counselor_name || req.counselor_name || 'Dr. Ma. Elena Santos, RGC')}</div>
        </td>
        <td>
          <div class="delegated-student-name fw-medium">${escapeHtml(req.student_name || 'Student')}</div>
          <div class="text-muted small">ID: ${escapeHtml(req.student_id || req.student_school_id || 'N/A')}</div>
        </td>
        <td>
          <div class="delegated-reason-text small text-truncate" style="max-width: 320px;" title="${escapeHtml(req.reason_narrative || req.purpose || req.reason || '')}">
            ${escapeHtml(req.reason_narrative || req.purpose || req.reason || 'Inter-departmental case review for student welfare')}
          </div>
        </td>
        <td>
          <small class="text-muted">${req.created_at ? new Date(req.created_at).toLocaleString() : '9/25/2026, 5:16 PM'}</small>
        </td>
        <td>
          ${badgeHtml}
        </td>
      </tr>
    `;
  }).join('');
}

window.filterDelegatedRequests = function (statusFilter) {
  const tbody = document.getElementById('tbodyDelegatedRequests') || document.getElementById('delegatedAccessTableBody') || document.getElementById('delegatedAccessRequestsTableBody') || document.querySelector('#delegatedAccessRequestsTable tbody');
  if (!tbody) return;

  const filtered = !statusFilter || statusFilter === 'All'
    ? (window._delegatedRequestsCache || [])
    : (window._delegatedRequestsCache || []).filter(r => (r.status || 'Pending').toLowerCase() === statusFilter.toLowerCase());

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 table-empty-state">No ${statusFilter ? statusFilter.toLowerCase() : ''} delegated access requests found.</td></tr>`;
    return;
  }
  tbody.innerHTML = renderDelegatedRequestsRows(filtered);
};

window.loadDelegatedAccessRequests = async function () {
  const tbody = document.getElementById('tbodyDelegatedRequests') || document.getElementById('delegatedAccessTableBody') || document.getElementById('delegatedAccessRequestsTableBody') || document.querySelector('#delegatedAccessRequestsTable tbody');
  if (!tbody) return;

  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/delegated-access/requests', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const list = data.requests || data.data || [];
    window._delegatedRequestsCache = list;

    // Tally totals for summary counter badges
    let approved = 0, declined = 0, pending = 0;
    list.forEach(req => {
      const st = (req.status || '').toLowerCase();
      if (st === 'approved') approved++;
      else if (st === 'declined') declined++;
      else pending++;
    });

    ['cntApproved', 'countApprovedRequests', 'badgeApprovedCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = approved;
    });
    ['cntDeclined', 'countDeclinedRequests', 'badgeDeclinedCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = declined;
    });
    ['cntPending', 'countPendingRequests', 'badgePendingCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = pending;
    });

    tbody.innerHTML = renderDelegatedRequestsRows(list);
  } catch (err) {
    console.error('Failed to load delegated access requests:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Error loading access requests.</td></tr>`;
  }
};


window.handleReviewDelegatedAccess = async function (requestId, action, counselorName, studentName) {
  const isApprove = action === 'Approved';
  const confirmMessage = isApprove
    ? `GRANT TEMPORARY CLEARANCE?\n\nAuthorize Counselor ${counselorName} to access confidential records of ${studentName} for a strict 24-hour read-only period?`
    : `DECLINE ACCESS REQUEST?\n\nReject Counselor ${counselorName}'s request to access records of ${studentName}?`;

  if (!confirm(confirmMessage)) return;

  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || state.authToken;
    const res = await fetch(`/api/delegated-access/review/${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    });

    const result = await res.json();

    if (result.success) {
      // Post-action confirmation feedback
      const postMsg = isApprove
        ? `Clearance Approved: Counselor ${counselorName} has been granted 24-hour read-only access to ${studentName}'s records.`
        : `Clearance Declined: The request from Counselor ${counselorName} has been rejected.`;

      if (typeof showAlert === 'function') {
        showAlert(postMsg, isApprove ? 'success' : 'info');
      } else if (typeof showToast === 'function') {
        showToast(postMsg, isApprove ? 'success' : 'info');
      } else {
        alert(postMsg);
      }

      // Refresh active tables
      if (typeof loadDelegatedAccessRequests === 'function') loadDelegatedAccessRequests();
      if (typeof loadDirectorDelegatedAccessRequests === 'function') loadDirectorDelegatedAccessRequests();
    } else {
      const errMsg = result.message || 'Failed to update access clearance.';
      if (typeof showAlert === 'function') showAlert(errMsg, 'danger');
      else if (typeof showToast === 'function') showToast(errMsg, 'error');
      else alert(errMsg);
    }
  } catch (err) {
    console.error('Error reviewing delegated access:', err);
    if (typeof showAlert === 'function') showAlert('Network error processing clearance decision.', 'danger');
    else if (typeof showToast === 'function') showToast('Network error processing clearance decision.', 'error');
    else alert('Network error processing clearance decision.');
  }
};

window.reviewDelegatedAccess = window.handleReviewDelegatedAccess;

async function loadDirectorDelegatedAccessRequests() {
  const tbody = document.getElementById('directorDelegatedAccessTableBody');
  const countBadge = document.getElementById('directorPendingDelegatedCountBadge');
  if (!tbody) return;

  try {
    const res = await authFetch('/api/delegated-access/requests');
    const data = await res.json();
    const requests = Array.isArray(data.requests) ? data.requests : (Array.isArray(data.data) ? data.data : []);

    const pending = requests.filter(r => r.status === 'Pending').length;
    if (countBadge) {
      countBadge.textContent = `${pending} Pending Clearance`;
      countBadge.className = pending > 0 
        ? 'badge bg-danger text-light px-2 py-1 fw-semibold' 
        : 'badge bg-secondary text-light px-2 py-1 fw-semibold';
    }

    if (requests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted" style="padding: 45px 20px !important; text-align: center !important; font-size: 0.95rem; width: 100%;">
            <div style="max-width: 440px; margin: 0 auto; text-align: center;">
              <i class="fa-solid fa-shield-cat mb-2" style="font-size: 2rem; opacity: 0.35; display: block; margin: 0 auto 10px;"></i>
              <strong style="display: block; font-size: 14px; margin-bottom: 4px; color: var(--text-main);">No Delegated Clinical Access Requests Recorded</strong>
              <span style="font-size: 12px; color: var(--text-muted); line-height: 1.5; display: block;">All clinical files remain isolated within primary counselor silos under RA 9258. Temporary cross-counselor access requests will appear here for Directorate review.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = requests.map(req => {
      const isApproved = req.status === 'Approved';
      const isDeclined = req.status === 'Declined';
      const statusClass = isApproved ? 'badge-status-approved' : (isDeclined ? 'badge-status-declined' : 'badge-status-pending');

      return `
        <tr>
          <td><span class="fw-bold text-warning">#REQ-${req.id}</span></td>
          <td>
            <div class="fw-semibold text-light">${escapeHtml(req.requesting_counselor_name || 'Counselor')}</div>
            <small class="text-muted" style="font-size: 0.72rem;">ID: ${escapeHtml(String(req.requesting_counselor_id || 'N/A'))}</small>
          </td>
          <td>
            <div class="text-light">${escapeHtml(req.target_counselor_name || 'Primary RGC')}</div>
            <small class="text-muted" style="font-size: 0.72rem;">ID: ${escapeHtml(String(req.target_counselor_id || 'Auto-Resolved'))}</small>
          </td>
          <td>
            <div class="fw-semibold text-light">${escapeHtml(req.student_name || 'Student')}</div>
            <small class="text-muted" style="font-size: 0.72rem;">ID: ${escapeHtml(String(req.student_school_id || req.student_id || 'N/A'))}</small>
          </td>
          <td>
            <div class="text-light small text-wrap" style="max-width: 260px; line-height: 1.35;">
              ${escapeHtml(req.reason)}
            </div>
          </td>
          <td>
            <div class="small text-light">${new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <small class="text-muted" style="font-size: 0.72rem;">${new Date(req.created_at).toLocaleDateString()}</small>
          </td>
          <td class="cell-clearance-status" style="padding: 14px 12px; text-align: center; white-space: nowrap;">
            <span class="${statusClass}">
              ${escapeHtml(req.status)}
            </span>
          </td>
          <td class="text-end" style="padding: 14px 14px; text-align: right; white-space: nowrap;">
            ${req.status === 'Pending' ? `
              <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: nowrap;">
                <button 
                  type="button" 
                  class="btn-approve-clearance" 
                  onclick="handleDirectorAccessAction(${req.id}, 'Approved')" 
                  title="Grant 24-hour temporary read-only access"
                >
                  <i class="fa-solid fa-check"></i> Approve
                </button>
                <button 
                  type="button" 
                  class="btn-decline-clearance" 
                  onclick="handleDirectorAccessAction(${req.id}, 'Declined')" 
                  title="Decline access request"
                >
                  <i class="fa-solid fa-xmark"></i> Decline
                </button>
              </div>
            ` : `
              <div style="display: inline-block; text-align: right; line-height: 1.3;">
                <small class="text-muted d-block" style="font-size: 0.72rem; opacity: 0.8;">Reviewed by:</small>
                <strong style="color: var(--text-main); font-size: 0.8rem; font-weight: 600;">${escapeHtml(req.reviewed_by_name || 'Director')}</strong>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load director access desk:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">Error retrieving access requests.</td></tr>`;
  }
}
window.loadDirectorDelegatedAccessRequests = loadDirectorDelegatedAccessRequests;

async function handleDirectorAccessAction(requestId, action) {
  if (!confirm(`Are you sure you want to mark request #REQ-${requestId} as ${action}?`)) return;
  try {
    const res = await authFetch(`/api/delegated-access/review/${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action })
    });
    const result = await res.json();
    if (result.success) {
      if (typeof showAlert === 'function') showAlert(`Request #REQ-${requestId} marked as ${action}.`, 'success');
      else showToast(`Request #REQ-${requestId} marked as ${action}.`, 'success');
      loadDirectorDelegatedAccessRequests();
      if (typeof loadDelegatedAccessRequests === 'function') loadDelegatedAccessRequests();
    } else {
      if (typeof showAlert === 'function') showAlert(result.message || 'Action failed', 'danger');
      else showToast(result.message || 'Action failed', 'error');
    }
  } catch (e) {
    if (typeof showAlert === 'function') showAlert('Network error processing clearance', 'danger');
    else showToast('Network error processing clearance', 'error');
  }
}
window.handleDirectorAccessAction = handleDirectorAccessAction;

// Universal Notification & Alert Helper
window.showAlert = function(msg, type = 'info') {
  if (typeof showToast === 'function') {
    const toastType = type === 'danger' ? 'error' : (type === 'success' ? 'success' : 'info');
    showToast(msg, toastType);
  } else {
    alert(msg);
  }
};

// =========================================================
// UNIVERSAL COUNSELOR QUEUE FILTER & TOOLBAR
// =========================================================
async function loadCounselorQueue(filterParams = {}) {
  try {
    let url = '/api/appointments';
    const params = [];
    if (filterParams.search) params.push(`search=${encodeURIComponent(filterParams.search)}`);
    if (filterParams.date) params.push(`date=${encodeURIComponent(filterParams.date)}`);
    if (filterParams.status && filterParams.status !== 'all') params.push(`status=${encodeURIComponent(filterParams.status)}`);
    if (filterParams.college && filterParams.college !== 'all') params.push(`college=${encodeURIComponent(filterParams.college)}`);
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const res = await authFetch(url);
    const data = await res.json();
    if (data && data.success) {
      state.appointments = data.data;
      window.counselorAppointmentsCache = data.data;
      renderCounselorQueue();
      updateMetrics(data);
      if (typeof window.filterCounselorAppointments === 'function') {
        window.filterCounselorAppointments();
      }
    }
  } catch (err) {
    console.error('Error fetching filtered queue appointments:', err);
  }
}
window.loadCounselorQueue = loadCounselorQueue;

// Universal Queue Filter Listener
function setupUnifiedQueueFilter() {
  const searchInput = document.getElementById('queueSearchInput');
  const concernInput = document.getElementById('filterQueueConcern') || document.getElementById('counselorApptSearch');
  const dateInput = document.getElementById('queueDateFilter');
  const statusSelect = document.getElementById('filterQueueStatus');
  const collegeSelect = document.getElementById('filterQueueCollege');
  const btnReset = document.getElementById('btnResetQueueFilter');

  function triggerFilteredQueueFetch() {
    const searchVal = searchInput?.value.trim() || '';
    const concernVal = concernInput?.value.trim() || '';
    const dateVal = dateInput?.value || '';
    const statusVal = statusSelect?.value || '';
    const collegeVal = collegeSelect?.value || '';

    const combinedSearch = [searchVal, concernVal].filter(Boolean).join(' ');

    // Re-fetch appointments passing query params to backend
    if (typeof loadCounselorQueue === 'function') {
      loadCounselorQueue({
        search: combinedSearch,
        date: dateVal,
        status: statusVal,
        college: collegeVal
      });
    } else if (typeof window.filterCounselorAppointments === 'function') {
      window.filterCounselorAppointments();
    }
  }

  // Debounced input search
  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerFilteredQueueFetch, 300);
  });

  concernInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerFilteredQueueFetch, 300);
  });

  dateInput?.addEventListener('change', triggerFilteredQueueFetch);
  statusSelect?.addEventListener('change', triggerFilteredQueueFetch);
  collegeSelect?.addEventListener('change', triggerFilteredQueueFetch);

  btnReset?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (concernInput) concernInput.value = '';
    if (dateInput) dateInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (collegeSelect) collegeSelect.value = '';
    triggerFilteredQueueFetch();
  });

  // Hook into Reports Tab click/activation
  const reportsTabBtn = document.querySelector('[data-bs-target="#tab-director-reports"], [href="#tab-director-reports"], #tab-director-reports-btn, [data-tab="admin-workload"], button[data-tab="admin-workload"]');
  if (reportsTabBtn && !reportsTabBtn.dataset.boundDirectorReports) {
    reportsTabBtn.dataset.boundDirectorReports = 'true';
    reportsTabBtn.addEventListener('click', () => {
      setTimeout(() => {
        if (typeof loadDirectorDelegatedAccessRequests === 'function') loadDirectorDelegatedAccessRequests();
      }, 100);
    });
  }
}
window.setupUnifiedQueueFilter = setupUnifiedQueueFilter;
window.initQueueSearchAndFilters = setupUnifiedQueueFilter;

// Clean dismissal for Faculty Referral modal
function dismissFacultyModalCleanly() {
  const modalEl = document.getElementById('modalFacultyReferral');
  if (modalEl) {
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    }
    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
  }
  // Clean up any remaining backdrops
  setTimeout(() => {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');
  }, 200);
}
window.dismissFacultyModalCleanly = dismissFacultyModalCleanly;

// Relocate system modals directly to <body> to prevent entrapment within hidden tabs
function attachModalsToBody() {
  const modalIds = ['modalFacultyReferral', 'modalHardwareCheck', 'modalClinicalSheet', 'modalCounselorOutreach'];
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });
}
window.attachModalsToBody = attachModalsToBody;

// Initialize modal placement immediately on load
document.addEventListener('DOMContentLoaded', attachModalsToBody);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  attachModalsToBody();
}

// Open Faculty Student Endorsement Modal:
function openFacultyReferralModal() {
  attachModalsToBody();
  const modalEl = document.getElementById('modalFacultyReferral');
  if (!modalEl) {
    alert('Faculty referral modal not found.');
    return;
  }

  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: true,
      keyboard: true
    });
    modalInstance.show();
  } else {
    modalEl.style.display = 'block';
    modalEl.classList.add('show');
  }
}
window.openFacultyReferralModal = openFacultyReferralModal;

// =========================================================
// FACULTY STUDENT ENDORSEMENT SUBMISSION
// =========================================================
function setupFacultyReferralForm() {
  attachModalsToBody();
  const form = document.getElementById('formFacultyReferral');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitFacultyRef');
    if (btn) btn.disabled = true;

    const payload = {
      facultyName: document.getElementById('facultyName')?.value.trim(),
      facultyEmail: document.getElementById('facultyEmail')?.value.trim(),
      facultyDept: document.getElementById('facultyDept')?.value,
      studentQuery: document.getElementById('facultyStudentQuery')?.value.trim(),
      studentEmail: (document.getElementById('referralStudentEmail')?.value || '').trim(),
      urgencyLevel: document.getElementById('facultyUrgencyLevel')?.value,
      behaviorCategory: document.getElementById('facultyBehaviorCategory')?.value,
      objectiveNarrative: document.getElementById('facultyNarrative')?.value.trim()
    };

    try {
      const res = await fetch('/api/public/faculty-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        if (typeof showAlert === 'function') {
          showAlert('Endorsement submitted successfully. Assigned counselor notified.', 'success');
        } else {
          alert('Endorsement submitted successfully.');
        }
        form.reset();
        dismissFacultyModalCleanly();
      } else {
        if (typeof showAlert === 'function') {
          showAlert(data.message || 'Submission failed.', 'danger');
        } else {
          alert(data.message || 'Submission failed.');
        }
      }
    } catch (err) {
      console.error('Endorsement submission error:', err);
      if (typeof showAlert === 'function') showAlert('Network error submitting endorsement.', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
window.setupFacultyReferralForm = setupFacultyReferralForm;

// =========================================================
// VIDEO MEETING CONTROLS VISIBILITY & ROLE SEPARATION
// =========================================================
// Universal Visibility Manager for Exit / End Meeting Button
function setMeetingExitButtonVisibility(isActive) {
  const exitButtons = [
    document.getElementById('btnExitVideoRoom'),
    document.getElementById('btnEndMeetingSession'),
    document.getElementById('modalBtnEndCall'),
    document.getElementById('btnEndCall')
  ].filter(Boolean);

  exitButtons.forEach(btn => {
    if (isActive) {
      btn.classList.remove('d-none');
      btn.classList.add('meeting-active');
      btn.style.setProperty('display', 'inline-flex', 'important');
    } else {
      btn.classList.add('d-none');
      btn.classList.remove('meeting-active');
      btn.style.setProperty('display', 'none', 'important');
    }
  });
}
window.setMeetingExitButtonVisibility = setMeetingExitButtonVisibility;

// Legacy and cross-role compatibility alias
function setVideoMeetingState(isActive) {
  setMeetingExitButtonVisibility(isActive);
}
window.setVideoMeetingState = setVideoMeetingState;

// 1. Ensure it is hidden immediately on DOM ready and tab changes
document.addEventListener('DOMContentLoaded', () => {
  setMeetingExitButtonVisibility(false);
});

// Hook into tab switching: hide button whenever navigating between tabs
function initTabExitButtonGuards() {
  document.querySelectorAll('[data-bs-toggle="tab"], .nav-link, .nav-item button, [data-tab]').forEach(tab => {
    if (!tab.dataset.exitGuardBound) {
      tab.dataset.exitGuardBound = 'true';
      tab.addEventListener('click', () => {
        // If not actively connected to a live WebRTC call, ensure button is hidden
        if (!window.activeCallConnected) {
          setMeetingExitButtonVisibility(false);
        }
      });
    }
  });
}

// 2. Call when a video room successfully connects (e.g., inside joinVideoRoom, startCall, or peer open)
function onVideoCallConnected() {
  window.activeCallConnected = true;
  setMeetingExitButtonVisibility(true);
}
window.onVideoCallConnected = onVideoCallConnected;

// 3. Call when leaving, concluding, or disconnecting the room
function handleExitVideoSession() {
  window.activeCallConnected = false;
  setMeetingExitButtonVisibility(false);

  // Trigger standard session end teardown
  const currentApptId = window.currentActiveAppointmentId || (state && state.activeSession && (state.activeSession.appointmentId || state.activeSession.id)) || null;
  if (typeof handleSessionEnded === 'function') {
    handleSessionEnded(currentApptId);
  } else if (typeof handleVideoMeetingEnded === 'function') {
    handleVideoMeetingEnded(currentApptId);
  } else if (typeof window.endCall === 'function') {
    window.endCall();
  }
}
window.handleExitVideoSession = handleExitVideoSession;

function handleVideoMeetingEnded(appointmentId) {
  appointmentId = appointmentId || window.currentActiveAppointmentId || (state && state.activeSession && (state.activeSession.appointmentId || state.activeSession.id)) || null;
  window.activeCallConnected = false;
  setMeetingExitButtonVisibility(false);
  const userRole = localStorage.getItem('user_role') || state.currentUser?.role || 'student';

  // Stop local camera/mic stream
  if (window.activeLocalStream) {
    window.activeLocalStream.getTracks().forEach(track => track.stop());
    window.activeLocalStream = null;
  }
  if (typeof stopCameraAndMic === 'function') {
    stopCameraAndMic();
  }

  // Counselor: Conclude session and open mandatory SOAP documentation
  if (userRole === 'counselor' || userRole === 'director' || userRole === 'superadmin') {
    if (appointmentId) {
      authFetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' })
      }).then(() => {
        if (typeof fetchAppointments === 'function') fetchAppointments();
      }).catch(err => console.error('Error updating appointment to Completed on session end:', err));
    }

    const modalVideo = document.getElementById('modalVideoRoom');
    if (modalVideo) {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalVideo)?.hide();
      }
      modalVideo.style.display = 'none';
      modalVideo.classList.remove('show');
    }
    if (typeof openSoapModal === 'function') {
      openSoapModal(appointmentId);
    } else if (typeof window.openSOAPModal === 'function') {
      window.openSOAPModal(appointmentId);
    } else if (typeof openClinicalSoapModal === 'function') {
      openClinicalSoapModal(appointmentId);
    } else if (typeof openSoapDocumentationDesk === 'function') {
      openSoapDocumentationDesk(appointmentId);
    }
    if (typeof showToast === 'function') {
      showToast('Session completed. Please document your clinical SOAP notes.', 'info');
    } else if (typeof showAlert === 'function') {
      showAlert('Session completed. Please document your clinical SOAP notes.', 'info');
    }
  }
  // Student: Just close room and return to appointments
  else {
    const modalVideo = document.getElementById('modalVideoRoom');
    if (modalVideo) {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalVideo)?.hide();
      }
      modalVideo.style.display = 'none';
      modalVideo.classList.remove('show');
    }
    const tabAppts = document.querySelector('[data-bs-target="#tab-student-appointments"], #navStudentAppointments, [data-tab="student-appointments"]');
    if (tabAppts) tabAppts.click();
    else if (typeof switchTab === 'function') switchTab('student-appointments');

    if (typeof showAlert === 'function') {
      showAlert('Your counseling session has ended. Thank you!', 'success');
    }

    // Trigger feedback modal strictly upon video conference conclusion
    if (appointmentId && typeof handleVideoConferenceEnded === 'function') {
      handleVideoConferenceEnded(appointmentId);
    }
  }
}
window.handleVideoMeetingEnded = handleVideoMeetingEnded;
window.endWebRtcSession = typeof handleExitVideoSession === 'function' ? handleExitVideoSession : handleVideoMeetingEnded;
window.leaveVideoRoom = typeof handleExitVideoSession === 'function' ? handleExitVideoSession : handleVideoMeetingEnded;

// =========================================================
// =========================================================
// PRE-FLIGHT HARDWARE DIAGNOSTIC (INDEPENDENT CAMERA & MIC GATING)
// =========================================================
let hardwareVideoTrack = null;
let hardwareAudioTrack = null;
let hardwareAudioCtx = null;
let hardwareAnalyser = null;
let hardwareAnimationId = null;

// Backwards compatibility variable aliases
let hardwareStream = null;
let hardwareTestStream = null;
let hardwareAudioContext = null;
let hardwareAudioAnalyser = null;
let hardwareAnimId = null;
let hardwareAnimFrame = null;

// Open Hardware Diagnostic Modal
window.openHardwareCheckModal = async function() {
  if (typeof attachModalsToBody === 'function') {
    attachModalsToBody();
  }
  const modalEl = document.getElementById('modalHardwareCheck') || document.getElementById('modalHardwareDiagnostic');
  if (!modalEl) return;

  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: 'static',
      keyboard: false
    }).show();
  } else {
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
  }

  await startHardwareMediaTracks();
};

async function startHardwareMediaTracks() {
  const videoEl = document.getElementById('testVideoPreview') || document.getElementById('diagnosticVideoPreview');
  const placeholder = document.getElementById('testCamPlaceholder') || document.getElementById('diagnosticVideoLoading');
  const camStatusText = document.getElementById('testCamStatusText');
  const camContainer = document.getElementById('camStatusContainer');
  const micContainer = document.getElementById('micStatusContainer');
  const camDot = document.getElementById('camStatusDot');
  const micDot = document.getElementById('micStatusDot');
  const liveIndicator = document.getElementById('micLiveIndicator');
  const meter = document.getElementById('micInputMeter') || document.getElementById('diagnosticAudioMeter');

  if (meter) meter.style.width = '0%';
  if (liveIndicator) {
    liveIndicator.style.display = 'none';
    liveIndicator.textContent = 'Inactive';
  }

  // Set checking state
  if (camContainer) {
    camContainer.innerHTML = `<span id="camStatusDot" class="badge rounded-pill px-3 py-1" style="font-size: 0.74rem; background-color: rgba(148, 163, 184, 0.15); color: #64748b; border: 1px solid #cbd5e1;"><i class="fa-solid fa-circle-notch fa-spin me-1"></i> Checking...</span>`;
  }
  if (micContainer) {
    micContainer.innerHTML = `<span id="micStatusDot" class="badge rounded-pill px-3 py-1" style="font-size: 0.74rem; background-color: rgba(148, 163, 184, 0.15); color: #64748b; border: 1px solid #cbd5e1;"><i class="fa-solid fa-circle-notch fa-spin me-1"></i> Checking...</span>`;
  }

  // 1. INDEPENDENT CAMERA CHECK (Does not block or fail microphone)
  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });

    const vTracks = videoStream.getVideoTracks();
    if (vTracks.length > 0 && vTracks[0].readyState === 'live') {
      hardwareVideoTrack = vTracks[0];
      if (!window.currentTestStream) {
        window.currentTestStream = new MediaStream();
      }
      window.currentTestStream.addTrack(hardwareVideoTrack);

      if (videoEl) {
        videoEl.srcObject = new MediaStream([hardwareVideoTrack]);
        videoEl.style.display = 'block';
        videoEl.onloadedmetadata = () => {
          if (placeholder) placeholder.style.display = 'none';
          videoEl.play().catch(e => console.warn('Preview play warning:', e));
        };
      }
      const setCamActive = () => {
        const activeHtml = `<span id="camStatusDot" class="badge badge-green rounded-pill px-3 py-1" style="font-size: 0.74rem; background-color: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid #22c55e;"><i class="fa-solid fa-video me-1"></i> Active</span>`;
        const c = document.getElementById('camStatusContainer');
        if (c) c.innerHTML = activeHtml;
        else if (document.getElementById('camStatusDot')) document.getElementById('camStatusDot').outerHTML = activeHtml;
      };
      const setCamInactive = () => {
        const inactHtml = `<span id="camStatusDot" class="badge badge-danger rounded-pill px-3 py-1" style="font-size: 0.74rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444;"><i class="fa-solid fa-video-slash me-1"></i> Inactive</span>`;
        const c = document.getElementById('camStatusContainer');
        if (c) c.innerHTML = inactHtml;
        else if (document.getElementById('camStatusDot')) document.getElementById('camStatusDot').outerHTML = inactHtml;
      };

      hardwareVideoTrack.onmute = setCamInactive;
      hardwareVideoTrack.onunmute = setCamActive;
      setCamActive();
    } else {
      throw new Error('Camera track not live');
    }
  } catch (camErr) {
    console.warn('Camera independent check failed:', camErr);
    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.srcObject = null;
    }
    if (placeholder) {
      placeholder.style.display = 'block';
      if (camStatusText) camStatusText.textContent = 'Camera is blocked, inactive, or disabled';
    }
    const blockedCamHtml = `<span id="camStatusDot" class="badge badge-danger rounded-pill px-3 py-1" style="font-size: 0.74rem; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid #ef4444;"><i class="fa-solid fa-video-slash me-1"></i> Blocked / Inactive</span>`;
    const c = document.getElementById('camStatusContainer');
    if (c) {
      c.innerHTML = blockedCamHtml;
    } else if (document.getElementById('camStatusDot')) {
      document.getElementById('camStatusDot').outerHTML = blockedCamHtml;
    }
  }

  // 2. INDEPENDENT MICROPHONE CHECK (Does not block or fail camera)
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const aTracks = audioStream.getAudioTracks();

    if (aTracks.length > 0 && aTracks[0].readyState === 'live') {
      hardwareAudioTrack = aTracks[0];
      if (!window.currentTestStream) {
        window.currentTestStream = new MediaStream();
      }
      window.currentTestStream.addTrack(hardwareAudioTrack);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      hardwareAudioCtx = new AudioCtx();
      hardwareAudioContext = hardwareAudioCtx;

      if (hardwareAudioCtx.state === 'suspended') {
        await hardwareAudioCtx.resume();
      }

      const setMicActive = () => {
        const activeMicHtml = `<span id="micStatusDot" class="badge badge-green rounded-pill px-3 py-1" style="font-size: 0.74rem; background-color: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid #22c55e;"><i class="fa-solid fa-microphone me-1"></i> Active</span>`;
        const mc = document.getElementById('micStatusContainer');
        if (mc) mc.innerHTML = activeMicHtml;
        else if (document.getElementById('micStatusDot')) document.getElementById('micStatusDot').outerHTML = activeMicHtml;

        const li = document.getElementById('micLiveIndicator');
        if (li) {
          li.style.display = 'inline-block';
          li.className = 'badge rounded-pill px-2 py-0';
          li.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
          li.style.color = '#22c55e';
          li.style.border = '1px solid #22c55e';
          li.textContent = 'Active';
        }
      };

      const setMicMuted = () => {
        const mutedMicHtml = `<span id="micStatusDot" class="badge badge-danger rounded-pill px-3 py-1" style="font-size: 0.74rem; background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444;"><i class="fa-solid fa-microphone-slash me-1"></i> Inactive</span>`;
        const mc = document.getElementById('micStatusContainer');
        if (mc) mc.innerHTML = mutedMicHtml;
        else if (document.getElementById('micStatusDot')) document.getElementById('micStatusDot').outerHTML = mutedMicHtml;

        const li = document.getElementById('micLiveIndicator');
        if (li) {
          li.style.display = 'inline-block';
          li.className = 'badge rounded-pill px-2 py-0';
          li.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
          li.style.color = '#ef4444';
          li.style.border = '1px solid #ef4444';
          li.textContent = 'Inactive';
        }
        const m = document.getElementById('micInputMeter') || document.getElementById('diagnosticAudioMeter');
        if (m) m.style.width = '0%';
      };

      hardwareAudioTrack.onmute = setMicMuted;
      hardwareAudioTrack.onunmute = setMicActive;

      const source = hardwareAudioCtx.createMediaStreamSource(new MediaStream([hardwareAudioTrack]));
      hardwareAnalyser = hardwareAudioCtx.createAnalyser();
      hardwareAudioAnalyser = hardwareAnalyser;
      hardwareAnalyser.fftSize = 128;
      hardwareAnalyser.smoothingTimeConstant = 0.4;
      source.connect(hardwareAnalyser);

      const bufferLength = hardwareAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      setMicActive();

      function updateMicLevel() {
        if (!hardwareAnalyser) return;
        hardwareAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const volumePercent = Math.min(100, Math.round((avg / 110) * 100));

        const m = document.getElementById('micInputMeter') || document.getElementById('diagnosticAudioMeter');
        if (m) {
          m.style.width = volumePercent + '%';
        }

        hardwareAnimationId = requestAnimationFrame(updateMicLevel);
        hardwareAnimId = hardwareAnimationId;
        hardwareAnimFrame = hardwareAnimationId;
      }
      updateMicLevel();

    } else {
      throw new Error('Audio track not live');
    }
  } catch (micErr) {
    console.warn('Microphone independent check failed:', micErr);
    const m = document.getElementById('micInputMeter') || document.getElementById('diagnosticAudioMeter');
    if (m) m.style.width = '0%';

    const li = document.getElementById('micLiveIndicator');
    if (li) {
      li.style.display = 'inline-block';
      li.className = 'badge rounded-pill px-2 py-0 badge-danger';
      li.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      li.style.color = '#ef4444';
      li.style.border = '1px solid #ef4444';
      li.textContent = 'Inactive';
    }

    const blockedMicHtml = `<span id="micStatusDot" class="badge badge-danger rounded-pill px-3 py-1" style="font-size: 0.74rem; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid #ef4444;"><i class="fa-solid fa-microphone-slash me-1"></i> Blocked / Inactive</span>`;
    const mc = document.getElementById('micStatusContainer');
    if (mc) {
      mc.innerHTML = blockedMicHtml;
    } else if (document.getElementById('micStatusDot')) {
      document.getElementById('micStatusDot').outerHTML = blockedMicHtml;
    }
  }
}

// In-Place Device Retry (Smooth, No Hard Page Reload)
async function reloadTestDevicesSmoothly() {
  const btn = document.getElementById('btnReloadTestDevices') || document.getElementById('btnRetryHardwareDevices');
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking Devices...';
    btn.disabled = true;
  }

  if (window.currentTestStream) {
    try {
      window.currentTestStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    window.currentTestStream = null;
  }
  stopHardwareMediaTracks();
  await initHardwareTesting();

  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Reload &amp; Retry Devices';
    btn.disabled = false;
  }
}

// Teardown Active Hardware Media
function stopHardwareMediaTracks() {
  if (hardwareAnimationId) {
    cancelAnimationFrame(hardwareAnimationId);
    hardwareAnimationId = null;
    hardwareAnimId = null;
    hardwareAnimFrame = null;
  }
  if (hardwareAudioCtx) {
    try {
      hardwareAudioCtx.close().catch(() => {});
    } catch (e) {}
    hardwareAudioCtx = null;
    hardwareAudioContext = null;
  }
  if (hardwareVideoTrack) {
    try { hardwareVideoTrack.stop(); } catch (e) {}
    hardwareVideoTrack = null;
  }
  if (hardwareAudioTrack) {
    try { hardwareAudioTrack.stop(); } catch (e) {}
    hardwareAudioTrack = null;
  }
  if (window.currentTestStream) {
    try {
      window.currentTestStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    window.currentTestStream = null;
  }
  if (hardwareStream) {
    try {
      hardwareStream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    hardwareStream = null;
    hardwareTestStream = null;
  }

  const videoEl = document.getElementById('testVideoPreview') || document.getElementById('diagnosticVideoPreview');
  if (videoEl) {
    videoEl.srcObject = null;
    videoEl.style.display = 'none';
  }
  const placeholder = document.getElementById('testCamPlaceholder') || document.getElementById('diagnosticVideoLoading');
  if (placeholder) placeholder.style.display = 'block';

  const meter = document.getElementById('micInputMeter') || document.getElementById('diagnosticAudioMeter');
  if (meter) meter.style.width = '0%';

  const liveIndicator = document.getElementById('micLiveIndicator');
  if (liveIndicator) liveIndicator.style.display = 'none';
}

// Close Modal
window.closeHardwareCheckModal = function() {
  stopHardwareMediaTracks();
  const modalEl = document.getElementById('modalHardwareCheck') || document.getElementById('modalHardwareDiagnostic');
  if (modalEl) {
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
  }
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('overflow');
};

// Global exports and backward compatibility aliases
window.startHardwareMediaTracks = startHardwareMediaTracks;
window.initHardwareTesting = startHardwareMediaTracks;
window.initHardwareTestStreams = startHardwareMediaTracks;
window.reloadTestDevicesSmoothly = reloadTestDevicesSmoothly;
window.retryHardwareDevicesOnly = reloadTestDevicesSmoothly;
window.restartHardwareTest = reloadTestDevicesSmoothly;
window.stopHardwareMediaTracks = stopHardwareMediaTracks;
window.stopHardwareTestStreams = stopHardwareMediaTracks;
window.testHardware = window.openHardwareCheckModal;
window.openHardwareTestModal = window.openHardwareCheckModal;
window.openHardwareDiagnosticModal = window.openHardwareCheckModal;
window.closeHardwareDiagnosticModal = window.closeHardwareCheckModal;


// Universal Modal Click Handler for Bootstrap-compatible modals
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-bs-toggle="modal"]');
  if (trigger) {
    const targetSelector = trigger.getAttribute('data-bs-target');
    if (targetSelector) {
      const modalEl = document.querySelector(targetSelector);
      if (modalEl) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          bootstrap.Modal.getOrCreateInstance(modalEl).show();
        } else {
          modalEl.classList.add('show');
          modalEl.style.display = 'block';
          modalEl.removeAttribute('aria-hidden');
        }
      }
    }
  }
  const dismiss = e.target.closest('[data-bs-dismiss="modal"]');
  if (dismiss) {
    const modalEl = dismiss.closest('.modal');
    if (modalEl) {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }
      modalEl.classList.remove('show');
      modalEl.style.display = 'none';
      modalEl.setAttribute('aria-hidden', 'true');
    }
  }
});

// =========================================================
// 3-STEP FORGOT PASSWORD FLOW & MASKED OTP CONTROLLERS
// =========================================================
let forgotFlowState = { email: '', otp: '' };

window.toggleOtpMask = function () {
  const otpInput = document.getElementById('forgotOtpInput');
  const toggleText = document.getElementById('otpToggleIcon');
  if (!otpInput || !toggleText) return;
  if (otpInput.type === 'password') {
    otpInput.type = 'text';
    toggleText.textContent = 'Hide';
  } else {
    otpInput.type = 'password';
    toggleText.textContent = 'Show';
  }
};

window.openForgotPasswordModal = function () {
  forgotFlowState = { email: '', otp: '' };
  const stepEmail = document.getElementById('forgotStepEmail');
  const stepOtp = document.getElementById('forgotStepOtp');
  const stepNew = document.getElementById('forgotStepNewPassword');
  if (stepEmail) stepEmail.classList.remove('hidden');
  if (stepOtp) stepOtp.classList.add('hidden');
  if (stepNew) stepNew.classList.add('hidden');
  const alert1 = document.getElementById('forgotStep1Alert');
  if (alert1) alert1.className = 'text-sm font-medium hidden';
  const alert2 = document.getElementById('forgotStep2Alert');
  if (alert2) alert2.className = 'text-sm font-medium hidden';
  const alert3 = document.getElementById('forgotStep3Alert');
  if (alert3) alert3.className = 'text-sm font-medium hidden';
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
};
window.openForgotModal = window.openForgotPasswordModal;

window.closeForgotPasswordModal = function () {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};
window.closeForgotModal = window.closeForgotPasswordModal;

window.handleSendResetCode = async function (e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmailInput').value.trim();
  const alertBox = document.getElementById('forgotStep1Alert');
  if (alertBox) {
    alertBox.textContent = 'Sending verification code...';
    alertBox.className = 'text-sm text-slate-400 block mb-2';
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok) {
      forgotFlowState.email = email;
      document.getElementById('forgotStepEmail').classList.add('hidden');
      document.getElementById('forgotStepOtp').classList.remove('hidden');
    } else {
      if (alertBox) {
        alertBox.textContent = data.error || 'Failed to dispatch code.';
        alertBox.className = 'text-sm text-red-500 block mb-2';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = 'Network error. Please try again.';
      alertBox.className = 'text-sm text-red-500 block mb-2';
    }
  }
};

window.handleVerifyResetCode = async function (e) {
  e.preventDefault();
  const otp = document.getElementById('forgotOtpInput').value.trim();
  const alertBox = document.getElementById('forgotStep2Alert');

  try {
    const res = await fetch('/api/auth/verify-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotFlowState.email, otp })
    });
    const data = await res.json();
    if (res.ok) {
      forgotFlowState.otp = otp;
      document.getElementById('forgotStepOtp').classList.add('hidden');
      document.getElementById('forgotStepNewPassword').classList.remove('hidden');
    } else {
      if (alertBox) {
        alertBox.textContent = data.error || 'Invalid code.';
        alertBox.className = 'text-sm text-red-500 block mb-2';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = 'Network error.';
      alertBox.className = 'text-sm text-red-500 block mb-2';
    }
  }
};

window.handleSetNewPassword = async function (e) {
  e.preventDefault();
  const newPass = document.getElementById('forgotNewPass').value;
  const confirmPass = document.getElementById('forgotConfirmPass').value;
  const alertBox = document.getElementById('forgotStep3Alert');

  if (newPass !== confirmPass) {
    if (alertBox) {
      alertBox.textContent = 'Passwords do not match.';
      alertBox.className = 'text-sm text-red-500 block mb-2';
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: forgotFlowState.email,
        otp: forgotFlowState.otp,
        newPassword: newPass
      })
    });
    const data = await res.json();
    if (res.ok) {
      if (alertBox) {
        alertBox.textContent = 'Password updated successfully! Redirecting to login...';
        alertBox.className = 'text-sm text-emerald-500 block mb-2';
      }
      setTimeout(() => {
        closeForgotPasswordModal();
        window.location.reload();
      }, 1400);
    } else {
      if (alertBox) {
        alertBox.textContent = data.error || 'Password update failed.';
        alertBox.className = 'text-sm text-red-500 block mb-2';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = 'Network error.';
      alertBox.className = 'text-sm text-red-500 block mb-2';
    }
  }
};

// =========================================================
// RESET PASSWORD URL PARAMETER LISTENER & SUBMIT HANDLER
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('reset_token');
  const email = urlParams.get('email');

  if (token && email) {
    const modal = document.getElementById('resetPasswordModal');
    const tokenInput = document.getElementById('resetTokenInput');
    const emailInput = document.getElementById('resetEmailInput');

    if (modal && tokenInput && emailInput) {
      tokenInput.value = token;
      emailInput.value = email;
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  }
});

// Also trigger immediately if document is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('reset_token');
  const email = urlParams.get('email');

  if (token && email) {
    const modal = document.getElementById('resetPasswordModal');
    const tokenInput = document.getElementById('resetTokenInput');
    const emailInput = document.getElementById('resetEmailInput');

    if (modal && tokenInput && emailInput) {
      tokenInput.value = token;
      emailInput.value = email;
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  }
}

window.handlePasswordResetSubmit = async function (e) {
  e.preventDefault();
  const token = document.getElementById('resetTokenInput').value;
  const email = document.getElementById('resetEmailInput').value;
  const newPassword = document.getElementById('newResetPassword').value;
  const confirmPassword = document.getElementById('confirmResetPassword').value;
  const feedback = document.getElementById('resetFeedback');

  feedback.classList.remove('hidden', 'text-red-500', 'text-green-500');

  if (newPassword !== confirmPassword) {
    feedback.classList.add('text-red-500');
    feedback.textContent = 'Passwords do not match.';
    return;
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword })
    });
    const data = await res.json();

    if (res.ok) {
      feedback.classList.add('text-green-500');
      feedback.textContent = 'Password reset successfully! Redirecting to login...';
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById('resetPasswordModal').style.display = 'none';
        window.location.reload();
      }, 2000);
    } else {
      feedback.classList.add('text-red-500');
      feedback.textContent = data.error || 'Failed to reset password. Link may be expired.';
    }
  } catch (err) {
    feedback.classList.add('text-red-500');
    feedback.textContent = 'Network error. Please try again.';
  }
};

// ====================================================
// DIRECT STUDENT REGISTRATION CONTROLLER
// ====================================================
window.executeStudentRegistration = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  console.log("[REGISTER DEBUG] executeStudentRegistration fired!");

  // Grab all registration field values directly
  const nameInput = document.querySelector('input[name="name"], #regName, #name, #signUpName');
  const studentIdInput = document.querySelector('input[name="student_id"], input[name="studentId"], #regStudentId, #studentId, #signUpStudentId');
  const emailInput = document.querySelector('input[name="email"], #regEmail, #email, #signUpEmail');
  const collegeSelect = document.querySelector('select[name="college"], #regCollege, #college, #signUpCollege');
  const contactInput = document.querySelector('input[name="contact"], #regContact, #contact, #signUpContact');
  const passInput = document.querySelector('input[name="password"], #regPassword, #signUpPassword');
  const confirmPassInput = document.querySelector('input[name="confirmPassword"], #regConfirmPassword, #signUpConfirmPassword');

  const name = nameInput ? nameInput.value.trim() : '';
  const studentId = studentIdInput ? studentIdInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const college = collegeSelect ? collegeSelect.value : '';
  const contact = contactInput ? contactInput.value.trim() : '';
  const password = passInput ? passInput.value : '';
  const confirmPassword = confirmPassInput ? confirmPassInput.value : '';

  console.log("[REGISTER DEBUG] Data collected:", { name, studentId, email, college, contact });

  if (!name || !studentId || !email || !password) {
    alert("Please fill in all required registration fields.");
    return false;
  }

  const cleanEmail = (emailInput ? emailInput.value : email).trim().toLowerCase();
  if (!cleanEmail.endsWith('@umak.edu.ph')) {
    alert("Only official UMak email addresses (@umak.edu.ph) are permitted.");
    if (emailInput) emailInput.focus();
    return false;
  }

  const cleanName = (nameInput ? nameInput.value : name).trim();
  if (/\d/.test(cleanName)) {
    alert("Numbers are not allowed in the Name field.");
    if (nameInput) nameInput.focus();
    return false;
  }

  if (password.length < 8) {
    alert("Password must be at least 8 characters long.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const consentBox = document.getElementById('signUpConsent');
  if (!consentBox || !consentBox.checked) {
    alert("Declaration and clinical consent under RA 10173 and RA 9258 is mandatory to create a student account.");
    if (consentBox) consentBox.focus();
    return false;
  }

  const btn = document.getElementById('btnRegisterSubmit') || document.getElementById('signUpBtn') || document.getElementById('btnSubmitSignUp');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending OTP...';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, studentId, email, college, contact, contactNumber: contact, password, dataPrivacyConsent: true })
    });
    const data = await res.json();

    console.log("[REGISTER DEBUG] Server response:", data);

    if (res.ok) {
      alert("Verification code sent to " + email);
      // Show OTP container
      const formContainer = document.getElementById('regFormStep') || document.getElementById('registerForm') || document.getElementById('studentRegisterForm') || document.getElementById('regFieldsContainer');
      const otpContainer = document.getElementById('regOtpStep') || document.getElementById('registrationOtpContainer') || document.getElementById('regOtpContainer');

      if (otpContainer) {
        if (formContainer) {
          formContainer.classList.add('hidden');
          formContainer.style.display = 'none';
        }
        otpContainer.classList.remove('hidden');
        otpContainer.style.display = 'block';

        const outerOtp = document.getElementById('regOtpContainer') || document.getElementById('registrationOtpContainer');
        if (outerOtp) {
          outerOtp.classList.remove('hidden');
          outerOtp.style.display = 'block';
        }

        const targetEmailEl = document.getElementById('regOtpTargetEmail');
        if (targetEmailEl) targetEmailEl.textContent = email;

        window.pendingVerificationEmail = email;
        window.registeringEmail = email;

        const otpInput = document.getElementById('regOtpInput');
        if (otpInput) {
          otpInput.value = '';
          setTimeout(() => otpInput.focus(), 150);
        }
      }
    } else {
      alert(data.error || "Registration failed on server.");
    }
  } catch (err) {
    console.error("[REGISTER DEBUG] Network error:", err);
    alert("Failed to connect to registration server.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Register Account';
    }
  }
};

window.handleRegisterSubmit = window.executeStudentRegistration;
window.handleUserSignUp = window.executeStudentRegistration;
window.handleRegister = window.executeStudentRegistration;

// Explicit Counselor Registration Handler
window.handleCounselorRegister = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const nameInput = document.querySelector('#counselorNameInput, #counselorName, #regCounselorName, #adminNewUserName');
  const emailInput = document.querySelector('#counselorEmailInput, #counselorEmail, #regCounselorEmail, #adminNewUserEmail');
  const passInput = document.querySelector('#counselorPasswordInput, #counselorPassword, #regCounselorPassword, #adminNewUserPassword');

  const cleanName = (nameInput ? nameInput.value : '').trim();
  if (/\d/.test(cleanName)) {
    alert("Numbers are not allowed in the Name field.");
    if (nameInput) nameInput.focus();
    return false;
  }

  const cleanEmail = (emailInput ? emailInput.value : '').trim().toLowerCase();
  if (!cleanEmail.endsWith('@umak.edu.ph')) {
    alert("Only official UMak email addresses (@umak.edu.ph) are permitted.");
    if (emailInput) emailInput.focus();
    return false;
  }

  const password = passInput ? passInput.value : '';
  if (!cleanName || !cleanEmail || !password) {
    alert("Please fill in all required fields.");
    return false;
  }

  try {
    const res = await fetch('/api/counselor/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, email: cleanEmail, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message || "Counselor registered successfully.");
      return true;
    } else {
      alert(data.message || data.error || "Counselor registration failed.");
      return false;
    }
  } catch (err) {
    alert("Failed to submit counselor registration.");
    return false;
  }
};

// ====================================================
// STUDENT & COUNSELOR DIRECTORY CONTROLLER
// ====================================================
let currentDirectorRoleFilter = 'student';
let dirSearchDebounceTimer;

window.setDirectorViewRole = function (role) {
  currentDirectorRoleFilter = role;
  const btnStudents = document.getElementById('btnDirStudents');
  const btnCounselors = document.getElementById('btnDirCounselors');
  const collegeWrapper = document.getElementById('dirCollegeDropdownWrapper');
  const deptHeader = document.getElementById('dirHeaderDept');

  if (role === 'student') {
    if (btnStudents) {
      btnStudents.style.background = '#f59e0b';
      btnStudents.style.color = '#0f172a';
    }
    if (btnCounselors) {
      btnCounselors.style.background = 'transparent';
      btnCounselors.style.color = '#94a3b8';
    }
    if (collegeWrapper) collegeWrapper.style.display = 'block';
    if (deptHeader) deptHeader.textContent = 'College';
  } else {
    if (btnCounselors) {
      btnCounselors.style.background = '#f59e0b';
      btnCounselors.style.color = '#0f172a';
    }
    if (btnStudents) {
      btnStudents.style.background = 'transparent';
      btnStudents.style.color = '#94a3b8';
    }
    if (collegeWrapper) collegeWrapper.style.display = 'none';
    if (deptHeader) deptHeader.textContent = 'Department';
  }
  loadDirectorData();
};

window.triggerDirectorSearch = function () {
  clearTimeout(dirSearchDebounceTimer);
  dirSearchDebounceTimer = setTimeout(loadDirectorData, 300);
};

window.loadDirectorData = async function () {
  const tbodies = document.querySelectorAll('#directorDirectoryTableBody, .director-directory-table-body, #directorDirectoryTableBodyStudent');
  const tbody = document.getElementById('directorDirectoryTableBody');
  if (!tbody && tbodies.length === 0) return;

  const search = document.getElementById('directorLiveSearch')?.value
    || document.getElementById('directorLiveSearchStudent')?.value
    || document.getElementById('directorySearchField')?.value
    || document.getElementById('counsSearchInput')?.value
    || '';
  const college = currentDirectorRoleFilter === 'student'
    ? (document.getElementById('directorCollegeSelect')?.value
      || document.getElementById('directorCollegeSelectStudent')?.value
      || document.getElementById('directoryCollegeSelect')?.value
      || document.getElementById('counsCollegeSelect')?.value
      || 'ALL')
    : 'ALL';

  const loadingHtml = '<tr><td colspan="6" style="text-align: center; padding: 24px; opacity: 0.6; font-size: 13px;">Loading records...</td></tr>';
  if (tbody) tbody.innerHTML = loadingHtml;
  tbodies.forEach(tb => { tb.innerHTML = loadingHtml; });

  try {
    const query = new URLSearchParams({ role: currentDirectorRoleFilter, college, search });
    const res = await fetch(`/api/users?${query.toString()}`);
    const data = await res.json();
    const users = data.users || [];

    if (users.length === 0) {
      const emptyHtml = '<tr><td colspan="6" style="text-align: center; padding: 24px; opacity: 0.5; font-size: 13px;">No matching records found.</td></tr>';
      if (tbody) tbody.innerHTML = emptyHtml;
      tbodies.forEach(tb => { tb.innerHTML = emptyHtml; });
      return;
    }

    users.forEach(u => {
      u._displayStudentId = u.student_id;
      if (typeof u.id === 'string') {
        u.id = u.id.replace(/^['"]|['"]$/g, '');
      }
    });

    function buildUserStatusActions(u) {
      const status = (u.status || '').toLowerCase();
      const isPending = status === 'pending' || (!u.is_verified && status !== 'declined' && status !== 'inactive');
      const isActive = status === 'active' && Boolean(u.is_verified);
      const isInactive = status === 'inactive';

      if (isPending) {
        const userRole = (state.currentUser?.role || localStorage.getItem('user_role') || '').toLowerCase();
        const canDecline = userRole === 'director' || userRole === 'superadmin' || userRole === 'admin';

        return `
          <button 
            type="button" 
            onclick="window.handleAccountStatusChange('${u.id || u.user_id || u.student_id}', '${escapeHtml(u.name)}', 'approve', this)"
            style="background-color: #10b981 !important; color: #ffffff !important; font-weight: 700 !important; font-size: 11px !important; padding: 5px 10px !important; border-radius: 6px !important; border: none !important; cursor: pointer !important; margin-right: 4px !important;"
            title="Approve and Verify Account"
          >
            <i class="fa-solid fa-check"></i> Verify
          </button>
          ${canDecline ? `
          <button 
            type="button" 
            onclick="window.handleAccountStatusChange('${u.id || u.user_id || u.student_id}', '${escapeHtml(u.name)}', 'decline', this)"
            style="background-color: rgba(239, 68, 68, 0.2) !important; color: #ef4444 !important; font-weight: 700 !important; font-size: 11px !important; padding: 5px 10px !important; border-radius: 6px !important; border: 1px solid rgba(239, 68, 68, 0.5) !important; cursor: pointer !important; margin-right: 4px !important;"
            title="Decline Account"
          >
            <i class="fa-solid fa-xmark"></i> Decline
          </button>
          ` : ''}
        `;
      }

      if (isActive) {
        return `
          <button 
            type="button" 
            onclick="window.handleAccountStatusChange('${u.id || u.user_id || u.student_id}', '${escapeHtml(u.name)}', 'deactivate', this)"
            style="background-color: rgba(245, 158, 11, 0.15) !important; color: #f59e0b !important; font-weight: 600 !important; font-size: 11px !important; padding: 5px 10px !important; border-radius: 6px !important; border: 1px solid rgba(245, 158, 11, 0.4) !important; cursor: pointer !important; margin-right: 4px !important;"
            title="Deactivate Account"
          >
            Deactivate
          </button>
        `;
      }

      if (isInactive) {
        return `
          <button 
            type="button" 
            onclick="window.handleAccountStatusChange('${u.id || u.user_id || u.student_id}', '${escapeHtml(u.name)}', 'activate', this)"
            style="background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; font-weight: 600 !important; font-size: 11px !important; padding: 5px 10px !important; border-radius: 6px !important; border: 1px solid rgba(16, 185, 129, 0.4) !important; cursor: pointer !important; margin-right: 4px !important;"
            title="Reactivate Account"
          >
            <i class="fa-solid fa-rotate-left"></i> Reactivate
          </button>
        `;
      }

      return '';
    }
    window.buildUserStatusActions = buildUserStatusActions;

    const rowsHtml = users.map(u => {
      const student = u;
      const isVerified = student.is_verified == 1 || student.is_verified === true;
      const status = (student.status || '').toLowerCase();
      const isActive = status === 'active' && Boolean(student.is_verified);
      const statusActionButtons = buildUserStatusActions(student);

      return `
        <tr data-id="${student.id || student.user_id}" data-user-id="${student.id || student.user_id}" data-student-id="${student._displayStudentId || ''}" style="border-bottom: 1px solid rgba(148, 163, 184, 0.15); transition: background 0.15s;" onmouseover="this.style.background='rgba(148, 163, 184, 0.06)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 14px 16px; font-family: monospace; font-size: 12px; font-weight: 700; color: #d97706;">${student._displayStudentId || student.student_id || '-'}</td>
          <td style="padding: 14px 16px; font-weight: 600; color: inherit;">${student.name}</td>
          <td style="padding: 14px 16px; font-size: 12px; opacity: 0.85;">${student.college || (student.role === 'counselor' ? 'CGCS Guidance' : 'Unassigned')}</td>
          <td style="padding: 14px 16px; font-family: monospace; font-size: 12px; opacity: 0.7;">${student.email}</td>
          <td style="padding: 14px 16px;">
            <span style="display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 1px solid ${isActive ? 'rgba(16, 185, 129, 0.4)' : (student.status === 'Declined' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)')}; background: ${isActive ? 'rgba(16, 185, 129, 0.1)' : (student.status === 'Declined' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)')}; color: ${isActive ? '#059669' : (student.status === 'Declined' ? '#ef4444' : '#d97706')};">
              <span style="width: 5px; height: 5px; border-radius: 50%; background: ${isActive ? '#10b981' : (student.status === 'Declined' ? '#ef4444' : '#f59e0b')}; margin-right: 5px;"></span>
              ${student.status || (isVerified ? 'Active' : 'Pending')}
            </span>
          </td>
          <td class="py-3.5 px-4 text-right" style="white-space: nowrap;">
            ${statusActionButtons}
            <button 
              type="button" 
              class="btn btn-warning btn-xs"
              data-user-id="${student.id || student.student_id}"
              onclick="window.openUniversalProfile('${student.id || student.student_id}')"
              data-name="${escapeHtml(student.name || '')}"
              data-id="${escapeHtml(student.student_id || student.id || '')}"
              data-college="${escapeHtml(student.college || 'CCIS')}"
              data-email="${escapeHtml(student.email || '')}"
              data-role="Student"
              data-status="${student.status || (student.is_verified ? 'Active' : 'Pending')}"
              style="background-color: #f59e0b !important; color: #020617 !important; font-weight: 700 !important; font-size: 11px !important; padding: 5px 12px !important; border-radius: 6px !important; border: 1px solid #d97706 !important; cursor: pointer !important; margin-right: 6px !important; display: inline-block !important;"
            >
              View Profile
            </button>
            ${((state.currentUser?.role || '').toLowerCase() === 'director' || (state.currentUser?.role || '').toLowerCase() === 'superadmin') ? `
            <button 
              type="button" 
              onclick="window.removeUserRecord('${student.id || student.user_id || student.student_id}', '${escapeHtml(student.name || 'User')}', '${student.role || currentDirectorRoleFilter}', this)"
              style="background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; font-weight: 700 !important; font-size: 11px !important; padding: 5px 12px !important; border-radius: 6px !important; border: 1px solid rgba(239, 68, 68, 0.4) !important; cursor: pointer !important; display: inline-block !important;"
              title="Permanently remove ${student.role || 'user'} record"
            >
              <i class="fa-solid fa-trash"></i> Remove
            </button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    if (tbody) tbody.innerHTML = rowsHtml;
    tbodies.forEach(tb => { tb.innerHTML = rowsHtml; });
  } catch (err) {
    const errorHtml = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: #ef4444; font-size: 13px;">Error fetching records from server.</td></tr>';
    if (tbody) tbody.innerHTML = errorHtml;
    tbodies.forEach(tb => { tb.innerHTML = errorHtml; });
  }
};

// ====================================================
// UNIVERSAL PROFILE MODAL CONTROLLER
// ====================================================
window.openUniversalProfile = async function(param) {
  let studentId = (param instanceof HTMLElement)
    ? (param.dataset.userId || param.dataset.id || param.getAttribute('data-user-id') || param.getAttribute('data-id') || '')
    : (param && typeof param === 'object' ? (param.student_id || param.id || param.userId || '') : String(param || '').trim());
  console.log('>>> [FRESH CODE RUNNING] openUniversalProfile triggered for:', studentId);
  // Also trigger a visible test alert so the user knows the button is registering:
  // alert('Profile clicked for: ' + studentId);

  let targetId = studentId;
  let name = '';
  let college = '';
  let email = '';
  let role = 'STUDENT';
  let status = 'Active';
  let contact = '';

  let cached = null;
  if (param instanceof HTMLElement) {
    targetId = param.dataset.userId || param.dataset.id || param.getAttribute('data-user-id') || param.getAttribute('data-id');
    name = param.dataset.name || param.getAttribute('data-name') || '';
    studentId = param.dataset.id || param.getAttribute('data-id') || targetId || '';
    college = param.dataset.college || param.getAttribute('data-college') || 'CCIS';
    email = param.dataset.email || param.getAttribute('data-email') || '';
    role = (param.dataset.role || param.getAttribute('data-role') || 'STUDENT').toUpperCase();
    status = param.dataset.status || param.getAttribute('data-status') || 'Active';
    contact = param.dataset.contact || param.getAttribute('data-contact') || '';
  } else if (param && typeof param === 'object') {
    cached = param;
    targetId = param.id || param.student_id || param.userId || param.user_id;
    name = param.name || '';
    studentId = param.student_id || param.id || targetId || '';
    college = param.college || 'CCIS';
    email = param.email || '';
    role = (param.role || 'STUDENT').toUpperCase();
    status = param.status || (param.is_verified ? 'Active' : 'Pending');
    contact = param.contact_number || param.contact || param.phone || '';
  } else if (typeof param === 'string' || typeof param === 'number') {
    targetId = String(param).trim();
    studentId = targetId;
    cached = (state.studentDirectory || []).find(s => s.id === targetId || s.student_id === targetId) ||
             (state.adminStudents || []).find(s => s.id === targetId || s.student_id === targetId) ||
             (window.counselorAppointmentsCache || []).map(a => a.student).find(s => s && (s.id === targetId || s.student_id === targetId));
    if (cached) {
      name = cached.name || '';
      studentId = cached.student_id || cached.id || targetId;
      college = cached.college || 'CCIS';
      email = cached.email || '';
      role = (cached.role || 'STUDENT').toUpperCase();
      status = cached.status || (cached.is_verified ? 'Active' : 'Pending');
      contact = cached.contact_number || cached.contact || cached.phone || '';
    }
  }

  const modal = document.getElementById('universalProfileModal');
  if (!modal) {
    console.error('[UniversalProfile] Modal container #universalProfileModal not found in DOM.');
    return;
  }

  // Inside openUniversalProfile: render avatar img or initials fallback
  const avatarImg = document.getElementById('upModalAvatar');
  const initialsEl = document.getElementById('upModalInitials');
  function renderModalAvatar(avatarUrl, displayName) {
    const initText = (displayName || name || 'ST').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'ST';
    if (avatarUrl && avatarUrl.length > 20) {
      if (avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.setProperty('display', 'block', 'important');
      }
      if (initialsEl) {
        initialsEl.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (avatarImg) {
        avatarImg.src = '';
        avatarImg.style.setProperty('display', 'none', 'important');
      }
      if (initialsEl) {
        initialsEl.textContent = initText;
        initialsEl.style.setProperty('display', 'flex', 'important');
      }
    }
  }

  // Initial render from cached directory item:
  const cachedAvatar = cached?.avatar || cached?.avatar_url || null;
  renderModalAvatar(cachedAvatar, name);

  // Populate immediate UI elements
  const initials = (name || 'ST').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'ST';
  const nameEl = document.getElementById('upModalName');
  const idEl = document.getElementById('upModalId');
  const badgeEl = document.getElementById('upModalBadge');
  const collegeEl = document.getElementById('upModalCollege');
  const roleEl = document.getElementById('upModalRole');
  const emailEl = document.getElementById('upModalEmail');
  const contactEl = document.getElementById('upModalContact');
  const clinicalContentEl = document.getElementById('upModalClinicalContent');

  if (initialsEl && (!cachedAvatar || cachedAvatar.length <= 20)) initialsEl.textContent = initials;
  if (nameEl) nameEl.textContent = name || 'Student Profile';
  if (idEl) idEl.textContent = studentId ? `ID: ${studentId}` : 'ID: --';
  if (badgeEl) {
    const isAct = status === 'Active' || status === 'Verified';
    badgeEl.textContent = status || 'Active';
    badgeEl.className = isAct
      ? 'ml-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
      : 'ml-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
  }
  if (collegeEl) collegeEl.textContent = college || '--';
  if (roleEl) roleEl.textContent = role || 'STUDENT';
  if (emailEl) emailEl.textContent = email || '--';
  if (contactEl) contactEl.textContent = contact || 'None provided';
  if (clinicalContentEl) {
    clinicalContentEl.innerHTML = '<span style="color: #94a3b8; font-style: italic;"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Checking screening records...</span>';
  }

  // Force the modal to be visible immediately
  modal.style.setProperty('display', 'flex', 'important');
  modal.classList.add('show', 'active');
  modal.classList.remove('hidden');
  modal.style.setProperty('z-index', '99999', 'important');
  modal.removeAttribute('aria-hidden');

  // Background fetch for detailed profile and clinical screening assessments
  const lookupId = targetId || studentId;
  if (!lookupId) return;

  try {
    const fetchFn = typeof authFetch === 'function' ? authFetch : fetch;
    let res = await fetchFn(`/api/users/${encodeURIComponent(lookupId)}/full-profile`);
    if (!res.ok) {
      res = await fetchFn(`/api/users/${encodeURIComponent(lookupId)}`);
    }
    if (res.ok) {
      const data = await res.json();
      const u = data.user || data.student || data;
      if (u) {
        const liveAvatar = u.avatar || u.avatar_url || u.avatarUrl || cachedAvatar;
        renderModalAvatar(liveAvatar, u.name);

        const uInitials = (u.name || name || 'ST').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'ST';
        if (initialsEl && (!liveAvatar || liveAvatar.length <= 20)) initialsEl.textContent = uInitials;
        if (nameEl) nameEl.textContent = u.name || name || 'Student Profile';
        if (idEl) idEl.textContent = `ID: ${u.student_id || u.id || studentId || '--'}`;
        if (collegeEl) collegeEl.textContent = u.college || college || 'CCIS';
        if (roleEl) roleEl.textContent = (u.role || role || 'STUDENT').toUpperCase();
        if (emailEl) emailEl.textContent = u.email || email || '--';
        const phoneVal = u.phone || u.contact_number || u.contact || contact;
        const finalContact = (phoneVal && phoneVal !== 'N/A') ? phoneVal : (u.contact_number || 'None provided');
        if (contactEl) contactEl.textContent = finalContact;
        [
          document.getElementById('profileContactNumber'),
          document.getElementById('profileContact'),
          document.getElementById('profModalContact')
        ].filter(Boolean).forEach(el => { el.textContent = finalContact; });

        const isVerified = u.is_verified == 1 || u.is_verified === true || u.status === 'Active';
        if (badgeEl) {
          badgeEl.textContent = isVerified ? 'Active' : (u.status || 'Pending');
          badgeEl.className = isVerified
            ? 'ml-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
            : 'ml-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
        }

        // Render Public Student Lifecycle Timeline (Account Created / First Session)
        const firstSignIn = data.firstSignInDate || u.created_at || u.first_login_at;
        const firstSession = data.firstSessionDate;

        const elFirstSignIn = document.getElementById('profileFirstSignInDate') || document.getElementById('profModalFirstSignInDate');
        const elFirstSession = document.getElementById('profileFirstSessionDate') || document.getElementById('profModalFirstSessionDate');

        if (elFirstSignIn) {
          elFirstSignIn.textContent = (firstSignIn && firstSignIn !== 'Not recorded')
            ? (typeof formatDate === 'function' ? formatDate(firstSignIn) : firstSignIn)
            : 'Not recorded';
        }
        if (elFirstSession) {
          elFirstSession.textContent = (firstSession && firstSession !== 'No completed sessions yet')
            ? (typeof formatDate === 'function' ? formatDate(firstSession) : firstSession)
            : 'No completed sessions yet';
        }

        // Wire Clinical Sheet button & Delegated Access Action Guard
        const btnSheet = document.getElementById('btnStudentProfileClinicalSheet') || document.getElementById('btnOpenClinicalSheet');
        const btnUniversalSheet = document.getElementById('btnUniversalOpenClinicalSheet');
        const sheetButtons = [btnSheet, btnUniversalSheet].filter(Boolean);

        const delegatedAction = document.getElementById('profileDelegatedAccessAction');
        const profModalDelegatedAction = document.getElementById('profModalDelegatedAccessAction');
        const actionContainers = [delegatedAction, profModalDelegatedAction].filter(Boolean);

        const studentTargetId = u.id || studentId;
        const studentTargetName = u.name || name;

        if (data.canAccessClinicalRecords) {
          sheetButtons.forEach(btn => {
            btn.classList.remove('d-none');
            btn.style.display = 'inline-flex';
            btn.onclick = () => openClinicalMonitoringSheet(studentTargetId);
          });
          actionContainers.forEach(container => {
            container.innerHTML = `<span class="badge bg-success py-1 px-2" role="button" onclick="openClinicalMonitoringSheet('${escapeHtml(studentTargetId)}')" style="font-size: 11.5px; border-radius: 6px; background-color: #10b981; color: white; cursor: pointer;" title="Open Clinical Monitoring Sheet"><i class="bi bi-shield-check me-1 fa-solid fa-circle-check"></i> Authorized Clinical Access</span>`;
          });
        } else {
          sheetButtons.forEach(btn => {
            btn.classList.add('d-none');
            btn.style.display = 'none';
            btn.onclick = null;
          });
          actionContainers.forEach(container => {
            if (data.hasPendingRequest) {
              container.innerHTML = `
                <span class="badge bg-warning text-dark py-1 px-2" style="font-size: 11.5px; border-radius: 6px;">
                  <i class="bi bi-hourglass-split me-1 fa-solid fa-hourglass-half"></i> Access Request Pending Review
                </span>
              `;
            } else {
              container.innerHTML = `
                <button type="button" class="btn btn-outline-warning btn-sm fw-bold" onclick="openDelegatedAccessModal('${escapeHtml(studentTargetId)}')" style="font-size: 12px; border-radius: 6px; padding: 6px 14px;">
                  <i class="bi bi-key me-1 fa-solid fa-key"></i> Request Delegated Access
                </button>
              `;
            }
          });
        }

        // Clinical Screening Privacy Guard (ONLY clinical assessment results are guarded, contact info is public)
        if (!data.canAccessClinicalRecords) {
          if (clinicalContentEl) {
            clinicalContentEl.innerHTML = `<span style="color: #f59e0b; font-style: italic;"><i class="bi bi-shield-lock me-1 fa-solid fa-shield-halved"></i> Confidential Clinical Assessments: Request authorization to view</span>`;
          }
        } else {
          // Render assessments
          const assessments = data.assessments || [];
          if (clinicalContentEl) {
            if (assessments.length > 0) {
              const primary = assessments[0];
              const aType = primary.assessment_type || 'Screening';
              const aScore = primary.score ?? '—';
              const aSev = (primary.severity || 'Minimal').toUpperCase();
              let sevStyle = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);';
              if (aSev.includes('SEVERE')) sevStyle = 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);';
              else if (aSev.includes('MODERATE')) sevStyle = 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);';

              clinicalContentEl.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span><strong>${escapeHtml(aType)}:</strong></span>
                    <span style="color: #f59e0b; font-weight: 700;">${aScore} pts</span>
                    <span style="padding: 2px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; ${sevStyle}">${escapeHtml(formatNonDiagnosticSeverity(primary.severity, primary.score))}</span>
                  </div>
                  <span style="color: #94a3b8; font-size: 11px;">${assessments.length} assessment${assessments.length > 1 ? 's' : ''}</span>
                </div>
              `;
            } else {
              clinicalContentEl.innerHTML = '<span style="color: #94a3b8; font-style: italic;">No screening completed</span>';
            }
          }
        }
      }
    } else {
      if (clinicalContentEl) clinicalContentEl.innerHTML = '<span style="color: #94a3b8; font-style: italic;">No screening completed</span>';
    }
  } catch (err) {
    console.warn('[UniversalProfile] Assessment fetch error:', err);
    if (clinicalContentEl) clinicalContentEl.innerHTML = '<span style="color: #94a3b8; font-style: italic;">No screening completed</span>';
  }

  // Guarantee display stays flex
  modal.style.setProperty('display', 'flex', 'important');
};

// Open Request Profile Access Modal
window.openRequestProfileAccessModal = function(studentId, studentName, targetCounselorName, targetCounselorId) {
  const modal = document.getElementById('modalRequestProfileAccess');
  if (!modal) return;
  const idInput = document.getElementById('reqAccessStudentId');
  if (idInput) idInput.value = studentId;

  const reasonSelect = document.getElementById('reqAccessReasonSelect');
  if (reasonSelect) reasonSelect.value = '';

  const detailsInput = document.getElementById('reqAccessReasonDetails');
  if (detailsInput) detailsInput.value = '';

  modal.style.setProperty('display', 'flex', 'important');
  modal.classList.add('show', 'active');
  modal.classList.remove('hidden');
  modal.removeAttribute('aria-hidden');
};

// Handle Request Profile Access Submission
window.handleProfileAccessRequestSubmit = async function(event) {
  if (event) event.preventDefault();
  const studentId = document.getElementById('reqAccessStudentId')?.value;
  const reasonCategory = document.getElementById('reqAccessReasonSelect')?.value;
  const reasonDetails = document.getElementById('reqAccessReasonDetails')?.value;

  if (!studentId || !reasonCategory) {
    showToast('Please select an official reason for your access request.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitProfileAccessReq');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Submitting...';
  }

  try {
    const res = await authFetch('/api/delegated-access/request', {
      method: 'POST',
      body: JSON.stringify({
        studentId,
        reasonCategory,
        reasonDetails
      })
    });
    const result = await res.json();

    if (result.success) {
      showToast(result.message || 'Access authorization request submitted successfully.', 'success');
      closeModal('modalRequestProfileAccess');

      const actionContainers = [
        document.getElementById('profileDelegatedAccessAction'),
        document.getElementById('profModalDelegatedAccessAction')
      ].filter(Boolean);
      actionContainers.forEach(container => {
        container.innerHTML = `
          <span class="badge bg-warning text-dark py-2 px-3" style="font-size: 11.5px; border-radius: 6px;">
            <i class="bi bi-hourglass-split me-1 fa-solid fa-hourglass-half"></i> Access Request Pending Review
          </span>
        `;
      });

      if (typeof loadDelegatedAccessRequests === 'function') {
        loadDelegatedAccessRequests();
      }
    } else {
      showToast(result.message || 'Failed to submit access request.', 'error');
    }
  } catch (err) {
    console.error('Error submitting profile access request:', err);
    showToast('Network error submitting access request.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-send me-1 fa-solid fa-paper-plane"></i> Send Request';
    }
  }
};

window.closeUniversalProfile = function() {
  const modal = document.getElementById('universalProfileModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('show', 'active');
    modal.style.setProperty('display', 'none', 'important');
    modal.setAttribute('aria-hidden', 'true');
  }
  const oldModal = document.getElementById('userProfileModal');
  if (oldModal) { oldModal.style.setProperty('display', 'none', 'important'); oldModal.classList.add('hidden'); }
  const cgcsModal = document.getElementById('cgcsProfileModal');
  if (cgcsModal) { cgcsModal.style.setProperty('display', 'none', 'important'); cgcsModal.classList.add('hidden'); }
};

// ====================================================
// CLINICAL MONITORING SHEET & NATIVE LOCAL DEVICE PRINT
// ====================================================
let activeMonitoringSheetPayload = null;

async function loadStudentMonitoringData(studentId) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    let res = await fetch(`/api/counselor/clinical-monitoring/${encodeURIComponent(studentId)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`/api/students/${encodeURIComponent(studentId)}/clinical-monitoring-sheet`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    const data = await res.json();
    if (!data.success) {
      if (typeof showAlert === 'function') showAlert(data.message || 'Cannot access clinical sheet.', 'danger');
      else if (typeof showToast === 'function') showToast(data.message || 'Cannot access clinical sheet.', 'error');
      else alert(data.message || 'Cannot access clinical sheet.');
      return;
    }

    activeMonitoringSheetPayload = data;

    // Populate Details
    const genDateEl = document.getElementById('sheetGeneratedDate');
    if (genDateEl) genDateEl.textContent = new Date().toLocaleString();
    const nameEl = document.getElementById('sheetStudentName');
    if (nameEl) nameEl.textContent = (data.student && data.student.name) || '---';
    const idEl = document.getElementById('sheetStudentId');
    if (idEl) idEl.textContent = (data.student && (data.student.student_id || data.student.id)) || '---';
    const collegeEl = document.getElementById('sheetCollege');
    if (collegeEl) collegeEl.textContent = (data.student && data.student.college) || '---';
    const programYearEl = document.getElementById('sheetProgramYear');
    if (programYearEl) {
      const prog = (data.student && data.student.program) || 'Undergraduate';
      const yr = (data.student && data.student.year_level) || '1st Year';
      programYearEl.textContent = `${prog} (${yr})`;
    }
    const statusEl = document.getElementById('sheetStatus');
    if (statusEl) statusEl.textContent = (data.student && data.student.status) || 'Active';
    const totalSessionsEl = document.getElementById('sheetTotalSessions');
    if (totalSessionsEl) totalSessionsEl.textContent = `${(data.sessions && data.sessions.length) || 0} consultation(s)`;
    const contactEl = document.getElementById('sheetContact');
    if (contactEl) contactEl.textContent = (data.student && data.student.contact_number) || '---';
    const emailEl = document.getElementById('sheetEmail');
    if (emailEl) emailEl.textContent = (data.student && data.student.email) || '---';
    const firstSessionEl = document.getElementById('sheetFirstSessionDate');
    if (firstSessionEl) firstSessionEl.textContent = data.firstSessionDate || 'No completed sessions yet';

    // Medications & Health Intake
    const med = data.healthData || {};
    const medBlock = document.getElementById('sheetMedicationBlock');
    if (medBlock) {
      medBlock.innerHTML = `
        <div class="row g-2">
          <div class="col-md-4"><strong>Diagnosed Conditions:</strong> ${escapeHtml(med.diagnosed_conditions || 'None reported')}</div>
          <div class="col-md-4"><strong>Current Medications:</strong> ${escapeHtml(med.current_medications || 'None reported')}</div>
          <div class="col-md-4"><strong>Psychiatric History:</strong> ${escapeHtml(med.psychiatric_history || 'None reported')}</div>
        </div>
      `;
    }

    // Sessions
    const tbody = document.getElementById('sheetSessionsTableBody');
    if (tbody) {
      if (!data.sessions || data.sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No recorded counseling sessions or clinical notes on file.</td></tr>`;
      } else {
        tbody.innerHTML = data.sessions.map(s => `
          <tr>
            <td><strong>${escapeHtml(s.session_date || '')}</strong><br><small class="text-muted">${escapeHtml(s.time_slot || '')}</small></td>
            <td><span class="badge bg-light text-dark border">${escapeHtml(s.focus || 'General')}</span></td>
            <td>${escapeHtml(s.counselor_name || 'Counselor')}</td>
            <td>${escapeHtml(s.subjective || '---')}</td>
            <td>${escapeHtml(s.objective || '---')}</td>
            <td>${escapeHtml(s.assessment || '---')}</td>
            <td>${escapeHtml(s.plan || '---')}</td>
          </tr>
        `).join('');
      }
    }

    // Wire export and print handlers (Isolated Iframe Document Print Engine)
    window.printClinicalMonitoringSheet = function() {
      const printArea = document.getElementById('clinicalSheetPrintArea');
      if (!printArea) {
        console.error('Element #clinicalSheetPrintArea not found!');
        return;
      }

      // Remove existing print iframe if any
      const oldIframe = document.getElementById('clinicalSheetPrintIframe');
      if (oldIframe) oldIframe.remove();

      // Create an invisible iframe for isolated printing
      const iframe = document.createElement('iframe');
      iframe.id = 'clinicalSheetPrintIframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Confidential Clinical Monitoring Sheet - UMak CGCS</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 15mm 15mm 15mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: 'Times New Roman', Times, serif, 'Segoe UI', Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #000000 !important;
              background: #ffffff !important;
              margin: 0;
              padding: 0;
            }
            .no-print, button, .btn {
              display: none !important;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 14px;
              page-break-inside: avoid;
            }
            th, td {
              border: 1px solid #333333 !important;
              padding: 6px 10px !important;
              font-size: 10pt !important;
              text-align: left;
              color: #000000 !important;
              background: #ffffff !important;
            }
            th {
              background-color: #f1f5f9 !important;
              font-weight: bold !important;
            }
            #sheetMedicationBlock {
              border: 1px solid #666666 !important;
              padding: 10px 12px !important;
              font-size: 9.5pt !important;
              margin-bottom: 14px !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          ${printArea.innerHTML}
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          iframe.remove();
        }, 2500);
      }, 300);
    };

    const btnPrint = document.getElementById('btnPrintSheetPDF');
    if (btnPrint) {
      btnPrint.onclick = window.printClinicalMonitoringSheet;
    }
    const btnExport = document.getElementById('btnExportSheetCSV');
    if (btnExport) {
      btnExport.onclick = () => exportClinicalSheetCSV(studentId);
    }
  } catch (err) {
    console.error('Error loading clinical monitoring data:', err);
    if (typeof showAlert === 'function') showAlert('Failed to retrieve monitoring sheet.', 'danger');
    else if (typeof showToast === 'function') showToast('Failed to retrieve monitoring sheet.', 'error');
  }
}

// Universal Helper to cleanly switch from the Profile modal to any secondary modal
window.transitionFromProfileModal = function(targetModalId, onOpenCallback) {
  // 1. Force close the Profile Modal
  const profileModal = document.getElementById('modalUniversalProfile') || document.getElementById('modalStudentProfile') || document.getElementById('universalProfileModal');
  if (profileModal) {
    profileModal.classList.remove('show');
    profileModal.style.display = 'none';
    profileModal.setAttribute('aria-hidden', 'true');
  }
  const uModal = document.getElementById('universalProfileModal');
  if (uModal) {
    uModal.classList.remove('show', 'active');
    uModal.classList.add('hidden');
    uModal.style.setProperty('display', 'none', 'important');
    uModal.setAttribute('aria-hidden', 'true');
  }
  if (typeof window.closeUniversalProfile === 'function') {
    window.closeUniversalProfile();
  }

  // 2. Clear out all stale backdrops
  document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  // 3. Find target modal and ensure it lives in document.body
  const targetModal = document.getElementById(targetModalId);
  if (!targetModal) {
    console.error(`Target modal #${targetModalId} not found!`);
    return;
  }
  if (targetModal.parentElement !== document.body) {
    document.body.appendChild(targetModal);
  }

  // 4. Launch target modal cleanly
  setTimeout(() => {
    // Single fresh backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade show';
    backdrop.style.zIndex = '10050';
    document.body.appendChild(backdrop);

    // Show target modal
    targetModal.style.zIndex = '10080';
    targetModal.style.display = 'flex';
    targetModal.classList.add('show');
    targetModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // Click backdrop to close
    backdrop.onclick = function() {
      window.forceCloseModal(targetModalId);
    };

    if (typeof onOpenCallback === 'function') {
      onOpenCallback();
    }
  }, 50);
};

// Universal force close helper
window.forceCloseModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show', 'active');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.style.setProperty('display', 'none', 'important');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
};

// 1. Hook for Clinical Monitoring Sheet
window.openClinicalMonitoringSheet = function(studentId) {
  window.transitionFromProfileModal('modalClinicalMonitoringSheet', () => {
    if (typeof loadStudentMonitoringData === 'function') {
      loadStudentMonitoringData(studentId);
    }
  });
};

// 2. Hook for Authorized / Delegated Clinical Access Request
window.openDelegatedAccessModal = function(studentId) {
  // Find the exact delegated access request modal ID in index.html (e.g. modalRequestDelegatedAccess)
  const targetId = document.getElementById('modalRequestDelegatedAccess') ? 'modalRequestDelegatedAccess' : (document.getElementById('modalRequestProfileAccess') ? 'modalRequestProfileAccess' : 'modalDelegatedAccessRequest');
  window.transitionFromProfileModal(targetId, () => {
    if (typeof populateDelegatedAccessForm === 'function') {
      populateDelegatedAccessForm(studentId);
    }
  });
};

// Form population helper for delegated access request modal
window.populateDelegatedAccessForm = function(studentId) {
  const idInputs = document.querySelectorAll('#reqAccessStudentId');
  idInputs.forEach(inp => { inp.value = studentId || ''; });

  const nameEl = document.getElementById('reqAccessStudentName');
  if (nameEl) nameEl.textContent = studentId || 'Selected Student';

  const reasonSelect = document.getElementById('reqAccessReasonSelect');
  if (reasonSelect) reasonSelect.value = '';

  const reasonText = document.getElementById('reqAccessReason');
  if (reasonText) reasonText.value = '';

  const reasonDetails = document.getElementById('reqAccessReasonDetails');
  if (reasonDetails) reasonDetails.value = '';
};

window.closeClinicalMonitoringSheet = function() {
  window.forceCloseModal('modalClinicalMonitoringSheet');
};

window.requestDelegatedAccess = function(studentId) {
  return window.openDelegatedAccessModal(studentId);
};

window.openRequestProfileAccessModal = function(studentId, studentName, targetCounselorName, targetCounselorId) {
  window.openDelegatedAccessModal(studentId);
  const nameEl = document.getElementById('reqAccessStudentName');
  if (nameEl && studentName) nameEl.textContent = studentName;
  const counselorEl = document.getElementById('reqAccessTargetCounselorName');
  if (counselorEl && targetCounselorName) counselorEl.textContent = targetCounselorName;
  const counselorIdInput = document.getElementById('reqAccessTargetCounselorId');
  if (counselorIdInput && targetCounselorId) counselorIdInput.value = targetCounselorId;
};

window.openRequestAccessModal = function(info) {
  const sId = (info && info.studentId) || info;
  window.openDelegatedAccessModal(sId);
  if (info && typeof info === 'object') {
    if (info.studentName) {
      const nameEl = document.getElementById('reqAccessStudentName');
      if (nameEl) nameEl.textContent = info.studentName;
    }
    if (info.targetCounselorName) {
      const counselorEl = document.getElementById('reqAccessTargetCounselorName');
      if (counselorEl) counselorEl.textContent = info.targetCounselorName;
    }
    if (info.targetCounselorId) {
      const counselorIdInput = document.getElementById('reqAccessTargetCounselorId');
      if (counselorIdInput) counselorIdInput.value = info.targetCounselorId;
    }
  }
};

window.handleDelegatedAccessSubmit = async function(event) {
  if (event) event.preventDefault();
  const studentId = document.getElementById('reqAccessStudentId')?.value;
  const targetCounselorId = document.getElementById('reqAccessTargetCounselorId')?.value;
  const reasonCategory = document.getElementById('reqAccessReasonSelect')?.value || '';
  const reasonText = document.getElementById('reqAccessReason')?.value?.trim() || '';
  const reason = reasonCategory ? (reasonCategory + (reasonText ? ' - ' + reasonText : '')) : reasonText;

  if (!studentId || !reason) {
    if (typeof showToast === 'function') showToast('Please select or provide a clinical justification reason.', 'warning');
    else alert('Please provide a clinical justification reason.');
    return;
  }

  try {
    const token = localStorage.getItem('token') || localStorage.getItem('umak_cgcs_token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/delegated-access/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ studentId, targetCounselorId, reason, reasonCategory, reasonDetails: reasonText })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast('Access authorization request submitted to primary counselor and Director.', 'success');
      else alert('Access authorization request submitted.');
      window.forceCloseModal('modalRequestDelegatedAccess');
      if (typeof loadDelegatedAccessRequests === 'function') {
        loadDelegatedAccessRequests();
      }
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Failed to submit access request.', 'error');
      else alert(data.message || 'Failed to submit access request.');
    }
  } catch (err) {
    console.error('Error submitting access request:', err);
    if (typeof showToast === 'function') showToast('Error submitting access request.', 'error');
  }
};
window.handleProfileAccessRequestSubmit = window.handleDelegatedAccessSubmit;

function openClinicalMonitoringSheet(studentId) {
  return window.openClinicalMonitoringSheet(studentId);
}

function exportMonitoringSheetToCSV() {
  if (!activeMonitoringSheetPayload) return;
  const clean = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

  const student = activeMonitoringSheetPayload.student || {};
  const med = activeMonitoringSheetPayload.healthData || {};
  const sessions = activeMonitoringSheetPayload.sessions || [];

  const studentName = student.name || 'Student';
  const studentId = student.student_id || student.id || 'N/A';
  const college = student.college || 'Unassigned';
  const prog = student.program || 'Undergraduate';
  const yr = student.year_level || '1st Year';
  const email = student.email || 'N/A';
  const contact = student.contact_number || 'N/A';
  const status = student.status || 'Active';
  const firstSession = activeMonitoringSheetPayload.firstSessionDate || 'None';
  const generatedAt = new Date().toLocaleString();

  // Formal Institutional Header & Complete Student Info Block
  let csvContent = `UNIVERSITY OF MAKATI - CENTER FOR GUIDANCE AND COUNSELING SERVICES (CGCS)\n`;
  csvContent += `CONFIDENTIAL CLINICAL MONITORING SHEET & SOAP LOG\n`;
  csvContent += `Generated At,${clean(generatedAt)}\n`;
  csvContent += `Data Classification,"STRICTLY CONFIDENTIAL - RA 10173 PROTECTED"\n\n`;

  csvContent += `--- STUDENT CLINICAL PROFILE ---\n`;
  csvContent += `Student Name,${clean(studentName)}\n`;
  csvContent += `Student ID Number,${clean(studentId)}\n`;
  csvContent += `College / Department,${clean(college)}\n`;
  csvContent += `Program & Year Level,${clean(prog + ' (' + yr + ')')}\n`;
  csvContent += `Official UMak Email,${clean(email)}\n`;
  csvContent += `Contact Phone Number,${clean(contact)}\n`;
  csvContent += `Academic / Account Status,${clean(status)}\n`;
  csvContent += `First Counseling Session,${clean(firstSession)}\n`;
  csvContent += `Total Documented SOAP Sessions,${clean(sessions.length + ' consultation(s)')}\n\n`;

  csvContent += `--- INTAKE HEALTH & PSYCHIATRIC DISCLOSURES ---\n`;
  csvContent += `Diagnosed Conditions,${clean(med.diagnosed_conditions || 'None reported')}\n`;
  csvContent += `Current Medications,${clean(med.current_medications || 'None reported')}\n`;
  csvContent += `Psychiatric History,${clean(med.psychiatric_history || 'None reported')}\n\n`;

  csvContent += `--- LONGITUDINAL SESSION HISTORY & SOAP CLINICAL NOTES ---\n`;
  csvContent += `Session Date,Time Slot,Nature / Focus,Counselor,Subjective (S),Objective (O),Assessment (A),Plan (P)\n`;

  if (sessions.length === 0) {
    csvContent += `"No recorded counseling sessions or clinical notes on file.","","","","","","",""\n`;
  } else {
    sessions.forEach(s => {
      csvContent += `${clean(s.session_date)},${clean(s.time_slot)},${clean(s.focus || 'General')},${clean(s.counselor_name || 'Counselor')},${clean(s.subjective || '---')},${clean(s.objective || '---')},${clean(s.assessment || '---')},${clean(s.plan || '---')}\n`;
    });
  }

  // Prepend UTF-8 BOM so Microsoft Excel correctly displays all characters and accents
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Sanitized file name with Student Name and ID
  const sanitizedName = studentName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
  const sanitizedId = String(studentId).replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  a.download = `Clinical_Monitoring_Sheet_${sanitizedName}_${sanitizedId}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportClinicalSheetCSV(studentId) {
  if (!activeMonitoringSheetPayload && studentId) {
    await loadStudentMonitoringData(studentId);
  }
  exportMonitoringSheetToCSV();
}

window.loadStudentMonitoringData = loadStudentMonitoringData;
window.exportMonitoringSheetToCSV = exportMonitoringSheetToCSV;
window.exportClinicalSheetCSV = exportClinicalSheetCSV;

// Aliases ensuring every possible caller successfully opens and closes the profile modal
window.closeUserProfileModal = function () {
  return window.closeUniversalProfile();
};
window.openUserProfileModal = window.openUniversalProfile;
window.viewUserProfile = window.openUniversalProfile;
window.openStudentProfileModal = window.openUniversalProfile;
window.showStudentModal = window.openUniversalProfile;
window.openDirectorProfileModal = window.openUniversalProfile;
window.closeDirectorProfileModal = window.closeUniversalProfile;
window.openGlobalProfile = window.openUniversalProfile;
window.closeGlobalProfileModal = window.closeUniversalProfile;
window.openCgcsProfile = window.openUniversalProfile;
window.closeCgcsProfileModal = window.closeUniversalProfile;
window.viewStudentProfile = window.openUniversalProfile;

window.exportStudentSummaryPDF = window.exportStudentSummaryPDF || function(userId) {
  window.print();
};

// Global click safety fallback: if any dynamic "View Profile" button lacks inline onclick, catch it cleanly
document.addEventListener('click', function(e) {
  const btn = e.target.closest('button, a');
  if (!btn) return;
  
  // If button already has its own onclick handler, let it run normally
  if (btn.hasAttribute('onclick')) return;

  const text = (btn.textContent || '').trim().toLowerCase();
  if (text.includes('view profile')) {
    let userId = btn.dataset.userId || btn.dataset.id || btn.getAttribute('data-id') || btn.getAttribute('data-user-id');
    if (!userId) {
      const row = btn.closest('tr');
      if (row) {
        userId = row.dataset.userId || row.dataset.id || row.getAttribute('data-id') || row.getAttribute('data-user-id');
        if (!userId) {
          const firstCellText = row.children[0]?.textContent?.trim();
          if (firstCellText && firstCellText !== '-') userId = firstCellText;
        }
      }
    }
    if (userId) {
      window.openUniversalProfile(userId);
    }
  }
}, false);

// Hook into Director tab switches
const existingDirTabHook = window.onDirectorTabChange;
window.onDirectorTabChange = function (tabName) {
  if (typeof existingDirTabHook === 'function') existingDirTabHook(tabName);
  if (tabName === 'user-management' || tabName === 'student-directory') {
    loadDirectorData();
  }
};

// Backward compatibility bindings for existing test suites
window.switchDirectorRole = window.setDirectorViewRole;
window.switchDirectorTab = window.setDirectorViewRole;
window.loadDirectorUsers = window.loadDirectorData;
window.loadAdminUsers = window.loadDirectorData;
window.debounceDirSearch = window.triggerDirectorSearch;
window.loadCounselorDirectory = window.loadDirectorData;
window.debounceCounsSearch = window.triggerDirectorSearch;
window.openDirectorProfileModal = window.openUserProfileModal;
window.closeDirectorProfileModal = window.closeUserProfileModal;
window.openGlobalProfile = window.openUserProfileModal;
window.closeGlobalProfileModal = window.closeUserProfileModal;
window.openCgcsProfile = window.openUserProfileModal;
window.closeCgcsProfileModal = window.closeUserProfileModal;
window.viewStudentProfile = window.openUserProfileModal;
window.showStudentModal = window.showStudentModal || window.openUserProfileModal;

async function fetchAndRenderUsers(tableBodyId, role, college, search) {
  currentDirectorRoleFilter = role || 'student';
  await window.loadDirectorData();
}

window.renderStudentAssessmentsHistory = renderStudentAssessmentsHistory;
window.showAssessmentResult = showAssessmentResult;

// Account Status Moderation Dispatcher
window.handleAccountStatusChange = async function(userId, userName, action, btn) {
  const isDecline = action === 'decline' || action === 'reject';
  const userRole = (state.currentUser?.role || localStorage.getItem('user_role') || '').toLowerCase();
  if (isDecline && userRole === 'counselor') {
    alert('Guidance Counselors are not authorized to decline accounts. Only the Director or Administrator may decline registrations.');
    return;
  }
  const confirmPrompt = isDecline 
    ? `Are you sure you want to DECLINE and permanently remove "${userName}" from the system?`
    : (action === 'deactivate' 
        ? `Are you sure you want to deactivate the account for "${userName}"?` 
        : (action === 'activate' 
            ? `Are you sure you want to reactivate the account for "${userName}"?` 
            : `Are you sure you want to verify and activate "${userName}"?`));

  if (!confirm(confirmPrompt)) return;

  const row = btn ? btn.closest('tr') : null;
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }

  if (row && isDecline) {
    row.style.transition = 'opacity 0.3s ease';
    row.style.opacity = '0.3';
  }

  try {
    // Attempt /api/users/:id/status first (accessible to all authorized roles including counselors), fallback to /api/admin/users/:id/status
    let res = await authFetch(`/api/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ action })
    });
    if (!res.ok && res.status === 404) {
      res = await authFetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action })
      });
    }
    const data = await res.json();

    if (res.ok && data.success) {
      showToast(data.message || `Account updated successfully.`, 'success');

      if (isDecline && row) {
        row.remove();
      }

      // Refresh directory data in background across all views
      if (typeof loadDirectorData === 'function') loadDirectorData();
      if (typeof loadCounselorStudents === 'function') loadCounselorStudents();
      if (typeof loadCounselorStudentDirectory === 'function') loadCounselorStudentDirectory();
      if (typeof loadDirectorUsers === 'function') loadDirectorUsers();
      if (typeof loadAdminUsers === 'function') loadAdminUsers();
    } else {
      alert(data.message || 'Failed to update account status.');
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      if (row && isDecline) {
        row.style.opacity = '1';
      }
    }
  } catch (err) {
    console.error('Status change error:', err);
    alert('Network error while processing request.');
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
    if (row && isDecline) {
      row.style.opacity = '1';
    }
  }
};

// Global initialization for Unified Toolbar, Faculty Referral, and Video Controls
document.addEventListener('DOMContentLoaded', () => {
  if (typeof attachModalsToBody === 'function') attachModalsToBody();
  if (typeof setupFacultyReferralForm === 'function') setupFacultyReferralForm();
  if (typeof setupUnifiedQueueFilter === 'function') setupUnifiedQueueFilter();
  if (typeof setMeetingExitButtonVisibility === 'function') setMeetingExitButtonVisibility(false);
  if (typeof setVideoMeetingState === 'function') setVideoMeetingState(false);
  if (typeof initTabExitButtonGuards === 'function') initTabExitButtonGuards();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (typeof attachModalsToBody === 'function') attachModalsToBody();
  if (typeof setupFacultyReferralForm === 'function') setupFacultyReferralForm();
  if (typeof setupUnifiedQueueFilter === 'function') setupUnifiedQueueFilter();
  if (typeof setMeetingExitButtonVisibility === 'function') setMeetingExitButtonVisibility(false);
  if (typeof setVideoMeetingState === 'function') setVideoMeetingState(false);
  if (typeof initTabExitButtonGuards === 'function') initTabExitButtonGuards();
}

// =========================================================
// COUNSELOR FACULTY REFERRALS DESK & OUTREACH ACTIONS
// =========================================================

// Dropdown Toggle & Single-Active Enforcement for Faculty Referrals
window.toggleReferralActionMenu = function(event, refId) {
  if (event) {
    event.stopPropagation();
  }
  const targetMenu = document.getElementById(`actionMenu-${refId}`);
  const isAlreadyOpen = targetMenu?.classList.contains('show');

  // Close all open referral action menus across the entire table
  document.querySelectorAll('.referral-action-list.show').forEach(el => el.classList.remove('show'));

  // Toggle the clicked menu
  if (targetMenu && !isAlreadyOpen) {
    targetMenu.classList.add('show');
  }
};

// Close menu when clicking anywhere else on the document
document.addEventListener('click', () => {
  document.querySelectorAll('.referral-action-list.show').forEach(el => el.classList.remove('show'));
});

// Load all referrals directly into the existing Faculty Referrals table
async function loadFacultyReferralsDesk() {
  const tbody = document.getElementById('facultyReferralsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/counselor/faculty-referrals', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    const items = data.referrals || [];

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="bi bi-clipboard2-check fs-4 d-block mb-1 text-secondary"></i>
            No faculty referrals submitted yet.
          </td>
        </tr>`;
      return;
    }

    const currentUserId = state.currentUser?.id;
    tbody.innerHTML = items.map(ref => {
      const urgencyClass = ref.urgency_level === 'Immediate Safety Concern' 
        ? 'bg-danger text-light' 
        : ref.urgency_level === 'Priority' 
          ? 'bg-warning text-dark' 
          : 'bg-info text-dark';

      const sName = (escapeHtml(ref.student_name) || '').replace(/'/g, "\\'");
      const sId = (ref.student_id || '').replace(/'/g, "\\'");
      const fName = (escapeHtml(ref.faculty_name) || '').replace(/'/g, "\\'");
      const fDept = (ref.faculty_dept || '').replace(/'/g, "\\'");

      const isClaimedByOther = ref.assigned_counselor_id && String(ref.assigned_counselor_id) !== String(currentUserId);
      const isClaimedByMe = ref.assigned_counselor_id && String(ref.assigned_counselor_id) === String(currentUserId);

      // Status Badge
      let statusBadge = `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Open Pool (Unclaimed)</span>`;
      if (isClaimedByOther) {
        statusBadge = `<span class="badge bg-secondary text-light" title="Actioned by ${escapeHtml(ref.assigned_counselor_name || 'another counselor')}"><i class="bi bi-person-check me-1"></i>Actioned by ${escapeHtml(ref.assigned_counselor_name || 'Counselor')}</span>`;
      } else if (isClaimedByMe) {
        statusBadge = `<span class="badge bg-success text-light"><i class="bi bi-check2-circle me-1"></i>Claimed by You (${escapeHtml(ref.status)})</span>`;
      }

      // Action Button
      let actionColumnHtml = '';
      if (isClaimedByOther) {
        actionColumnHtml = `
          <button class="btn btn-outline-secondary btn-sm py-1 px-2" disabled title="Already handled by ${escapeHtml(ref.assigned_counselor_name || 'another counselor')}">
            <i class="bi bi-lock-fill me-1"></i>Locked
          </button>
        `;
      } else {
        actionColumnHtml = `
          <div class="referral-action-wrapper" id="referralActionWrapper-${ref.id}">
            <button class="btn btn-sm dropdown-toggle py-1.5 px-3 btn-follow-up" type="button" onclick="toggleReferralActionMenu(event, ${ref.id})" aria-expanded="false">
              ${isClaimedByMe ? '<i class="bi bi-arrow-repeat me-1"></i> Follow Up' : '<i class="bi bi-lightning-charge me-1"></i> Take Action'}
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow referral-action-list" id="actionMenu-${ref.id}">
              <li>
                <a class="dropdown-item referral-action-link small d-flex align-items-center gap-2" href="#" onclick="openOutreachModal(${ref.id}, 'student', '${sName}', '${sId}'); toggleReferralActionMenu(event, ${ref.id});">
                  <i class="bi bi-envelope-heart"></i> Email Student (Guidance Check-in)
                </a>
              </li>
              <li>
                <a class="dropdown-item referral-action-link small d-flex align-items-center gap-2" href="#" onclick="openOutreachModal(${ref.id}, 'faculty', '${fName}', '${fDept}'); toggleReferralActionMenu(event, ${ref.id});">
                  <i class="bi bi-building"></i> Contact Dept Head / Faculty
                </a>
              </li>
            </ul>
          </div>
        `;
      }

      return `
        <tr id="ref-row-${ref.id}">
          <td style="width: 8%; min-width: 90px; white-space: nowrap; padding: 10px 10px; vertical-align: middle;"><span class="badge bg-dark border border-secondary text-warning font-mono">REF-${String(ref.id).padStart(4, '0')}</span></td>
          <td style="width: 14%; min-width: 140px; padding: 10px 10px; vertical-align: middle;">
            <strong class="text-light">${escapeHtml(ref.faculty_name)}</strong>
            <div class="small text-muted">${escapeHtml(ref.faculty_email)}</div>
          </td>
          <td style="width: 14%; min-width: 140px; padding: 10px 10px; vertical-align: middle;">
            <strong class="text-light">${escapeHtml(ref.student_name)}</strong>
            <div class="small text-muted font-mono">ID: ${escapeHtml(ref.student_id)}</div>
          </td>
          <td style="width: 6%; min-width: 70px; text-align: center; padding: 10px 10px; vertical-align: middle;"><span class="badge bg-secondary">${escapeHtml(ref.student_college || ref.faculty_dept || '---')}</span></td>
          <td style="width: 24%; min-width: 260px; max-width: 340px; word-break: break-word; padding: 10px 10px; vertical-align: middle;">
            <div class="fw-semibold text-light">${escapeHtml(ref.behavior_category)}</div>
            <div class="small text-muted" style="white-space: normal; word-break: break-word; line-height: 1.4; margin-top: 4px;" title="${escapeHtml(ref.objective_narrative)}">
              ${escapeHtml(ref.objective_narrative)}
            </div>
          </td>
          <td style="width: 8%; min-width: 85px; text-align: center; padding: 10px 10px; vertical-align: middle;"><span class="badge ${urgencyClass}">${escapeHtml(ref.urgency_level)}</span></td>
          <td style="width: 13%; min-width: 130px; padding: 10px 10px; vertical-align: middle; white-space: nowrap;">${statusBadge}</td>
          <td class="text-end" style="width: 13%; min-width: 130px; text-align: right; padding: 10px 10px; vertical-align: middle; position: relative !important; overflow: visible !important;">
            ${actionColumnHtml}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading faculty referrals:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Failed to load referrals data.</td></tr>`;
  }
}

// Open Action Modal with Pre-filled Context
function openOutreachModal(refId, targetType, targetName, targetMeta) {
  const modalEl = document.getElementById('modalCounselorOutreach');
  if (!modalEl) return;

  document.getElementById('outreachReferralId').value = refId;
  document.getElementById('outreachTargetType').value = targetType;

  if (targetType === 'student') {
    document.getElementById('outreachModalTitle').innerHTML = `<i class="bi bi-envelope-heart text-warning me-2"></i>Outreach to Student`;
    document.getElementById('outreachRecipientDisplay').value = `${targetName} (Student ID: ${targetMeta})`;
    document.getElementById('outreachSubject').value = `CGCS Guidance & Counseling Check-in: Support Services Availability`;
    document.getElementById('outreachMessage').value = `Dear ${targetName},\n\nWe hope this message finds you well. The Center for Guidance & Counseling Services (CGCS) is reaching out to invite you for a routine consultation check-in to support your academic and personal well-being.\n\nPlease log into the CGCS Portal to view our available consultation hours and schedule a voluntary appointment at your earliest convenience.\n\nWarm regards,\nCenter for Guidance and Counseling Services`;
  } else {
    document.getElementById('outreachModalTitle').innerHTML = `<i class="bi bi-building text-info me-2"></i>Coordination with Faculty / Dept Head`;
    document.getElementById('outreachRecipientDisplay').value = `Prof. ${targetName} (${targetMeta})`;
    document.getElementById('outreachSubject').value = `Update on Student Referral (Case REF-${String(refId).padStart(4, '0')})`;
    document.getElementById('outreachMessage').value = `Dear Prof. ${targetName},\n\nThank you for your student endorsement. CGCS has ingested your non-clinical observation into our active case docket. Our guidance counselors have initiated reach-out protocols under university counseling standards.\n\nBest regards,\nCGCS Guidance Center`;
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

window.loadFacultyReferralsDesk = loadFacultyReferralsDesk;
window.openOutreachModal = openOutreachModal;

// Action Form Submission Handler
document.addEventListener('DOMContentLoaded', () => {
  const outreachForm = document.getElementById('formCounselorOutreach');
  if (outreachForm) {
    outreachForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSendOutreach');
      btn.disabled = true;

      const refId = document.getElementById('outreachReferralId').value;
      const targetType = document.getElementById('outreachTargetType').value;
      const subject = document.getElementById('outreachSubject').value;
      const message = document.getElementById('outreachMessage').value;
      const updateStatus = document.getElementById('outreachUpdateStatus').checked;

      try {
        const res = await fetch('/api/counselor/faculty-referrals/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ refId, targetType, subject, message, updateStatus })
        });
        const data = await res.json();

        // 409 Conflict: Already claimed by another counselor
        if (res.status === 409 || data.code === 'ALREADY_CLAIMED') {
          bootstrap.Modal.getInstance(document.getElementById('modalCounselorOutreach'))?.hide();
          if (typeof showAlert === 'function') {
            showAlert(data.message || 'Na-aksyunan na ito ng ibang counselor.', 'warning');
          } else if (typeof showToast === 'function') {
            showToast(data.message || 'Na-aksyunan na ito ng ibang counselor.', 'warning');
          } else {
            alert(data.message || 'Na-aksyunan na ito ng ibang counselor.');
          }
          await loadFacultyReferralsDesk();
          if (typeof fetchNotifications === 'function') fetchNotifications();
          return;
        }

        if (data.success) {
          if (typeof showAlert === 'function') {
            showAlert('Official communication logged and dispatched.', 'success');
          } else if (typeof showToast === 'function') {
            showToast('Official communication logged and dispatched.', 'success');
          } else {
            alert('Official communication logged and dispatched.');
          }
          bootstrap.Modal.getInstance(document.getElementById('modalCounselorOutreach'))?.hide();
          await loadFacultyReferralsDesk();
          if (typeof fetchNotifications === 'function') fetchNotifications();
        } else {
          if (typeof showAlert === 'function') {
            showAlert(data.message || 'Action dispatch failed.', 'danger');
          } else if (typeof showToast === 'function') {
            showToast(data.message || 'Action dispatch failed.', 'error');
          } else {
            alert(data.message || 'Action dispatch failed.');
          }
        }
      } catch (err) {
        if (typeof showAlert === 'function') {
          showAlert('Network error sending outreach.', 'danger');
        } else if (typeof showToast === 'function') {
          showToast('Network error sending outreach.', 'error');
        } else {
          alert('Network error sending outreach.');
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Auto-load when viewing Counselor dashboard or switching to the tab
  const facultyTabBtn = document.querySelector('[data-bs-target="#tab-counselor-referrals"], [data-bs-target="#tab-faculty-referrals"], #navFacultyReferrals');
  if (facultyTabBtn) {
    facultyTabBtn.addEventListener('click', loadFacultyReferralsDesk);
  }
});

// =========================================================
// CRISIS HOTLINES MOBILE DIALER & DESKTOP CLICK-TO-COPY
// =========================================================
window.handleCrisisCall = function(event, phoneNumber, hotlineName) {
  // Check if device is likely a mobile phone
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (!isMobile) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    // Prevent confusing system protocol error on desktops without a dialer app
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phoneNumber.replace(/[^0-9]/g, ''));
      if (typeof showToast === 'function') {
        showToast(`Copied ${hotlineName} number (${phoneNumber}) to clipboard! Dial from your phone.`, 'info');
      } else if (typeof window.showToast === 'function') {
        window.showToast(`Copied ${hotlineName} number (${phoneNumber}) to clipboard! Dial from your phone.`, 'info');
      }
    }
  }
};

// ==============================================================================
// GUIDANCE DIRECTORATE ENHANCEMENTS: REPORTING, OVERVIEW, TELEMETRY & GRIEVANCES
// ==============================================================================

// 1. CHED ACCREDITATION REPORT MODAL & DATA POPULATION
let activeAccreditationData = null;

async function openAccreditationReportModal() {
  const modalEl = document.getElementById('modalAccreditationReport');
  if (!modalEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  const tsEl = document.getElementById('accreditationGeneratedTimestamp');
  if (tsEl) {
    tsEl.textContent = `Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (Philippine Standard Time)`;
  }

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/admin/reports/accreditation', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to fetch accreditation metrics');

    activeAccreditationData = data;
    renderAccreditationMetrics(data);
  } catch (err) {
    console.error('Error loading accreditation report:', err);
    if (typeof showToast === 'function') showToast('Failed to load accreditation report: ' + err.message, 'error');
  }
}
window.openAccreditationReportModal = openAccreditationReportModal;

function renderAccreditationMetrics(data) {
  const { userStats, byCollege, phqDistribution, totalConsultations, studentToCounselorRatio } = data;

  const totalStudEl = document.getElementById('accredTotalStudents');
  const totalCounsEl = document.getElementById('accredTotalCounselors');
  const ratioEl = document.getElementById('accredRatio');
  const totalConsultEl = document.getElementById('accredTotalConsultations');

  if (totalStudEl) totalStudEl.textContent = (userStats?.total_students || 0).toLocaleString();
  if (totalCounsEl) totalCounsEl.textContent = (userStats?.total_counselors || 0).toLocaleString();
  if (ratioEl) ratioEl.textContent = studentToCounselorRatio || '1:0';
  if (totalConsultEl) totalConsultEl.textContent = (totalConsultations || 0).toLocaleString();

  // Render Table 1: College Caseloads
  const collegeTbody = document.getElementById('accredCollegeTableBody');
  if (collegeTbody) {
    const totalCases = (byCollege || []).reduce((acc, c) => acc + (c.completed_sessions || 0), 0) || 1;
    collegeTbody.innerHTML = (byCollege || []).map(c => `
      <tr>
        <td style="padding: 8px 14px; font-weight: 600;">${escapeHtml(c.college || 'Unspecified')}</td>
        <td style="padding: 8px 14px;">${c.student_count || 0}</td>
        <td style="padding: 8px 14px;">${c.completed_sessions || 0}</td>
        <td style="padding: 8px 14px;">${escapeHtml(c.assigned_counselors || 'General Pool')}</td>
        <td style="padding: 8px 14px;">${((c.completed_sessions / totalCases) * 100).toFixed(1)}%</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No college data available</td></tr>';
  }

  // Render Table 2: PHQ-9 Screenings Breakdown
  const phqTbody = document.getElementById('accredPhqTableBody');
  if (phqTbody) {
    const phqTotal = Object.values(phqDistribution || {}).reduce((a, b) => a + b, 0) || 1;
    const phqTiers = [
      { name: 'Minimal Concern', range: '0 - 4', key: 'Minimal', action: 'Psychoeducational wellness resources' },
      { name: 'Mild Concern', range: '5 - 9', key: 'Mild', action: 'Peer counseling & supportive check-ins' },
      { name: 'Moderate Concern', range: '10 - 14', key: 'Moderate', action: 'Individual counseling intervention' },
      { name: 'High Concern', range: '15 - 19', key: 'Moderately Severe', action: 'High-priority clinical casework' },
      { name: 'Severe Concern', range: '20 - 27', key: 'Severe', action: 'Immediate clinical triage & NCMH referral' }
    ];

    phqTbody.innerHTML = phqTiers.map(t => {
      const cnt = phqDistribution?.[t.key] || 0;
      return `
        <tr>
          <td style="padding: 8px 14px; font-weight: 600;">${t.name}</td>
          <td style="padding: 8px 14px;">${t.range}</td>
          <td style="padding: 8px 14px;">${cnt}</td>
          <td style="padding: 8px 14px;">${((cnt / phqTotal) * 100).toFixed(1)}%</td>
          <td style="padding: 8px 14px; font-size: 0.8rem; color: var(--text-muted);">${t.action}</td>
        </tr>
      `;
    }).join('');
  }
}
window.renderAccreditationMetrics = renderAccreditationMetrics;

// 2. CSV EXPORT FOR CHED REPORT
function exportAccreditationReportCSV() {
  if (!activeAccreditationData) return;
  const d = activeAccreditationData;
  const clean = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

  let csv = `UNIVERSITY OF MAKATI - CENTER FOR GUIDANCE AND COUNSELING SERVICES\n`;
  csv += `INSTITUTIONAL ACCREDITATION REPORT (CHED CMO NO. 09 S. 2013)\n`;
  csv += `Generated At,${clean(new Date().toLocaleString())}\n\n`;

  csv += `--- INSTITUTIONAL SUMMARY METRICS ---\n`;
  csv += `Total Enrolled Students,${clean(d.userStats?.total_students || 0)}\n`;
  csv += `Total Registered Counselors,${clean(d.userStats?.total_counselors || 0)}\n`;
  csv += `Student-to-Counselor Ratio,${clean(d.studentToCounselorRatio || 'N/A')}\n`;
  csv += `Total Consultations Completed,${clean(d.totalConsultations || 0)}\n\n`;

  csv += `--- COLLEGE CASELOAD DISTRIBUTION ---\n`;
  csv += `College,Enrolled Students,Completed Sessions,Assigned Counselors\n`;
  (d.byCollege || []).forEach(c => {
    csv += `${clean(c.college)},${clean(c.student_count)},${clean(c.completed_sessions)},${clean(c.assigned_counselors || 'General Pool')}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `UMak_CGCS_Accreditation_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.exportAccreditationReportCSV = exportAccreditationReportCSV;

function printAccreditationReportDocument() {
  document.body.classList.add('printing-accreditation-report');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-accreditation-report');
  }, 1000);
}
window.printAccreditationReportDocument = printAccreditationReportDocument;

async function exportExecutiveReportDocument() {
  const tsEl = document.getElementById('execReportGeneratedTimestamp');
  if (tsEl) {
    tsEl.textContent = `Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (Philippine Standard Time)`;
  }
  
  // Sync top stats
  const cComp = document.getElementById('adminTotalConsultations')?.textContent || '0';
  const cStud = document.getElementById('adminTotalScreenings')?.textContent || '0';
  const cCoun = document.getElementById('adminActiveCounselors')?.textContent || '0';
  if (document.getElementById('printExecCompleted')) document.getElementById('printExecCompleted').textContent = cComp;
  if (document.getElementById('printExecStudents')) document.getElementById('printExecStudents').textContent = cStud;
  if (document.getElementById('printExecCounselors')) document.getElementById('printExecCounselors').textContent = cCoun;
  // Mirror PHQ concern distribution table
  const accredPhq = document.getElementById('accredPhqTableBody');
  const execPhq = document.getElementById('printExecPhqTableBody');
  if (accredPhq && execPhq) execPhq.innerHTML = accredPhq.innerHTML;
  // Mirror College caseload table
  const accredCol = document.getElementById('accredCollegeTableBody');
  const execCol = document.getElementById('printExecCollegeTableBody');
  if (accredCol && execCol) execCol.innerHTML = accredCol.innerHTML;
  // Fetch deduplicated student roster
  const rosterTbody = document.getElementById('printExecStudentRosterTableBody');
  if (rosterTbody) {
    try {
      const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
      const res = await fetch('/api/admin/reports/executive-roster', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const students = data.students || [];
      // Severity terminology map
      const severityMap = {
        'Minimal Depression': 'Minimal Concern',
        'Minimal': 'Minimal Concern',
        'Mild Depression': 'Mild Concern',
        'Mild': 'Mild Concern',
        'Moderate Depression': 'Moderate Concern',
        'Moderate': 'Moderate Concern',
        'Moderately Severe Depression': 'High Concern',
        'Moderately Severe': 'High Concern',
        'Severe Depression': 'Severe Concern',
        'Severe': 'Severe Concern'
      };
      // Strict client-side deduplication safeguard by unique ID
      const seenIds = new Set();
      const uniqueStudents = students.filter(s => {
        const key = (s.student_id || s.id || s.email).toLowerCase();
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });
      if (uniqueStudents.length === 0) {
        rosterTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 8px;">No registered students on record.</td></tr>';
      } else {
        rosterTbody.innerHTML = uniqueStudents.map(s => {
          const rawSev = s.latest_phq_severity || '';
          const mappedSev = severityMap[rawSev] || (rawSev ? rawSev.replace(/Depression/gi, 'Concern').trim() : 'No Assessment Recorded');
          const isAct = (s.status || 'Active').toLowerCase() === 'active';
          
          return `
            <tr>
              <td style="padding: 5px 8px; font-weight: 600;">${escapeHtml(s.student_id)}</td>
              <td style="padding: 5px 8px;">${escapeHtml(s.name)}</td>
              <td style="padding: 5px 8px;">${escapeHtml(s.college)}</td>
              <td style="padding: 5px 8px; text-align: center;">
                <span style="font-weight: 600; color: ${isAct ? '#059669' : '#dc2626'};">${isAct ? 'Active' : 'Inactive'}</span>
              </td>
              <td style="padding: 5px 8px;">
                <strong>${escapeHtml(mappedSev)}</strong>
                ${s.latest_phq_date ? `<span style="color: #6b7280; font-size: 10px; display: block;">Screened: ${new Date(s.latest_phq_date).toLocaleDateString()}</span>` : ''}
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Failed to populate student roster in executive report:', err);
      rosterTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626;">Error loading student roster.</td></tr>';
    }
  }
  document.body.classList.add('printing-executive-report');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-executive-report');
  }, 1000);
}
window.exportExecutiveReportDocument = exportExecutiveReportDocument;

// 3. EXECUTIVE FACULTY REFERRAL OVERSIGHT DESK
async function loadDirectorFacultyReferralsDesk() {
  const tbody = document.getElementById('directorFacultyReferralsTableBody');
  if (!tbody) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/admin/faculty-referrals/oversight', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const referrals = result.data || [];
    let overdueCount = 0;

    if (referrals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No faculty student endorsements currently on file.</td></tr>';
      return;
    }

    tbody.innerHTML = referrals.map(r => {
      const hours = Number(r.ageHours || 0);
      const isOverdue = (r.status === 'Pending' || r.status === 'Received by CGCS') && hours > 48;
      if (isOverdue) overdueCount++;
      // Clean and deduplicate Student Name & Student ID
      let rawName = (r.student_name || '').trim();
      let rawId = (r.student_id || '').trim();
      // If student_name is already in format "Name (ID)", separate them
      const parenMatch = rawName.match(/^(.*?)\s*\(([^)]+)\)$/);
      if (parenMatch) {
        rawName = parenMatch[1].trim();
        if (!rawId || rawId === r.student_name) {
          rawId = parenMatch[2].trim();
        }
      }
      // If rawId is identical to rawName, suppress rawId
      if (rawId.toLowerCase() === rawName.toLowerCase()) {
        rawId = '';
      }
      return `
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; color: var(--umak-gold);">#${String(r.id).slice(-6)}</td>
          <td style="padding: 12px 14px;">
            <span style="font-weight: 600; color: var(--text-main);">${escapeHtml(rawName)}</span>
            ${rawId ? `<small class="text-muted d-block" style="font-size: 0.8rem; margin-top: 2px;">(${escapeHtml(rawId)})</small>` : ''}
          </td>
          <td style="padding: 12px 14px;">${escapeHtml(r.department || 'General')}</td>
          <td style="padding: 12px 14px;">${escapeHtml(r.faculty_name)}</td>
          <td style="padding: 12px 14px;">
            ${isOverdue 
              ? `<span class="badge-aging-critical"><i class="fa-solid fa-triangle-exclamation"></i> ${Math.floor(hours)}h Overdue</span>`
              : `<span class="badge-aging-normal">${Math.floor(hours)}h ago</span>`
            }
          </td>
          <td style="padding: 12px 14px;">${escapeHtml(r.assigned_counselor_name || 'Unassigned')}</td>
          <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
            <button class="btn btn-outline-gold btn-xs me-1" onclick="promptReassignCounselor('${r.id}')" title="Reassign Counselor">
              <i class="fa-solid fa-user-pen"></i> Reassign
            </button>
            <button class="btn btn-outline-danger btn-xs" onclick="deleteFacultyReferral('${r.id}', '${escapeHtml(rawName)}')" title="Remove Referral">
              <i class="fa-solid fa-trash-can"></i> Remove
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const overdueBadge = document.getElementById('badgeOverdueReferralsCount');
    if (overdueBadge) overdueBadge.textContent = `${overdueCount} Overdue (>48h)`;
  } catch (err) {
    console.error('Error in director faculty referrals desk:', err);
  }
}
window.loadDirectorFacultyReferralsDesk = loadDirectorFacultyReferralsDesk;

async function deleteFacultyReferral(referralId, studentName) {
  const confirmed = confirm(`Are you sure you want to remove the faculty referral for ${studentName || 'this student'}? This record will be permanently cleared from the oversight desk.`);
  if (!confirmed) return;
  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch(`/api/admin/faculty-referrals/${referralId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to remove referral.');
    if (typeof showToast === 'function') {
      showToast(`Referral #${referralId} successfully removed.`, 'success');
    }
    await loadDirectorFacultyReferralsDesk();
  } catch (err) {
    console.error('Delete faculty referral error:', err);
    if (typeof showToast === 'function') {
      showToast(err.message || 'Error deleting faculty referral.', 'error');
    }
  }
}
window.deleteFacultyReferral = deleteFacultyReferral;

// Reassign Counselor Modal Handler
async function promptReassignCounselor(referralId) {
  const modalEl = document.getElementById('modalReassignCounselor');
  if (!modalEl) return;

  const idInput = document.getElementById('reassignReferralId');
  if (idInput) idInput.value = referralId;

  // Populate counselor select options
  const select = document.getElementById('reassignTargetCounselorSelect');
  if (select) {
    select.innerHTML = '<option value="" disabled selected>-- Select Counselor --</option>';
    try {
      const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
      const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const counselors = (data.counselors || data.data || []).filter(u => u.role === 'counselor');
      counselors.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.college || 'General')})</option>`;
      });
    } catch (e) {
      if (state.adminCounselors && state.adminCounselors.length) {
        state.adminCounselors.forEach(c => {
          select.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
        });
      }
    }
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
window.promptReassignCounselor = promptReassignCounselor;

async function submitReassignCounselor(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const referralId = document.getElementById('reassignReferralId')?.value;
  const select = document.getElementById('reassignTargetCounselorSelect');
  const counselorId = select?.value;
  const counselorName = select?.options[select.selectedIndex]?.text || '';
  const directiveNotes = document.getElementById('reassignDirectorNotes')?.value || '';

  if (!referralId || !counselorId) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch(`/api/admin/faculty-referrals/${encodeURIComponent(referralId)}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ counselorId, counselorName, directiveNotes })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    if (typeof showToast === 'function') showToast(result.message || 'Referral reassigned.', 'success');
    const modalEl = document.getElementById('modalReassignCounselor');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    loadDirectorFacultyReferralsDesk();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Reassignment error: ' + err.message, 'error');
  }
}
window.submitReassignCounselor = submitReassignCounselor;

// 4. REAL-TIME COUNSELOR PRESENCE TELEMETRY RENDERER
async function updateCounselorPresenceTelemetry() {
  const tbody = document.getElementById('counselorWorkloadTableBody');
  if (!tbody) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/admin/counselors/presence', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) return;

    const counselors = result.data || [];
    tbody.innerHTML = counselors.map(c => `
      <tr>
        <td style="padding: 12px 14px; font-weight: 600;">${escapeHtml(c.name)}</td>
        <td style="padding: 12px 14px;">${escapeHtml(c.assigned_cluster || 'General')}</td>
        <td style="padding: 12px 14px;">${c.active_cases || 0} Cases</td>
        <td style="padding: 12px 14px;">
          <span class="presence-pill presence-${c.statusClass}">
            <span class="presence-dot"></span>
            ${escapeHtml(c.statusLabel)}
          </span>
          <div class="capacity-meter-wrapper">
            <div class="capacity-meter-bar">
              <div class="capacity-meter-fill" style="width: ${c.utilizationPercent}%;"></div>
            </div>
            <span class="text-muted" style="font-size: 0.7rem;">${c.bookedSlotsToday}/${c.totalSlotsToday} Slots Booked</span>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="text-center text-muted py-3">No registered counselors found.</td></tr>';
  } catch (err) {
    console.error('Error updating counselor telemetry:', err);
  }
}
window.updateCounselorPresenceTelemetry = updateCounselorPresenceTelemetry;

// 5. DIRECTOR SUPERVISORY REVIEW SUBMISSION & RETRIEVAL
async function handleSaveSupervisoryReview(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const appointmentId = document.getElementById('supervisoryAppointmentId')?.value;
  const studentId = document.getElementById('supervisoryStudentId')?.value;
  const reviewType = document.getElementById('supervisoryReviewType')?.value || 'Supervisory Guidance';
  const recommendations = document.getElementById('supervisoryRecommendations')?.value || '';
  const notes = document.getElementById('supervisoryNotesText')?.value || '';

  if (!notes.trim()) {
    if (typeof showToast === 'function') showToast('Please enter supervisory notes.', 'warning');
    return;
  }

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/soap/supervisory-note', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ appointmentId, studentId, reviewType, recommendations, supervisoryNotes: notes })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    if (typeof showToast === 'function') showToast('Supervisory case endorsement saved.', 'success');
    const noteField = document.getElementById('supervisoryNotesText');
    const recField = document.getElementById('supervisoryRecommendations');
    if (noteField) noteField.value = '';
    if (recField) recField.value = '';
    loadSupervisoryNotes(appointmentId);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Failed to save supervisory note: ' + err.message, 'error');
  }
}
window.handleSaveSupervisoryReview = handleSaveSupervisoryReview;

async function loadSupervisoryNotes(appointmentId) {
  const timeline = document.getElementById('supervisoryNotesTimeline');
  if (!timeline || !appointmentId) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch(`/api/soap/supervisory-notes/${encodeURIComponent(appointmentId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    const notes = result.notes || [];

    if (notes.length === 0) {
      timeline.innerHTML = '<div class="text-muted small py-2 fst-italic">No supervisory addenda on record for this session.</div>';
      return;
    }

    timeline.innerHTML = notes.map(n => `
      <div class="supervisory-entry-item">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <strong class="text-gold" style="font-size: 0.85rem;"><i class="fa-solid fa-stamp me-1"></i>${escapeHtml(n.review_type || 'Supervisory Review')}</strong>
          <small class="text-muted" style="font-size: 0.75rem;">${new Date(n.created_at).toLocaleString()}</small>
        </div>
        <div class="text-main small mb-1" style="font-size: 0.85rem;">${escapeHtml(n.supervisory_notes)}</div>
        ${n.recommendations ? `<div class="small text-muted"><strong class="text-success">Directive:</strong> ${escapeHtml(n.recommendations)}</div>` : ''}
        <div class="small text-muted mt-1" style="font-size: 0.75rem;"><em>Endorsed by: ${escapeHtml(n.director_name)}</em></div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading supervisory notes:', err);
  }
}
window.loadSupervisoryNotes = loadSupervisoryNotes;

// 6. CONFIDENTIAL GRIEVANCE & STUDENT INCIDENT INTAKE
function openStudentGrievanceModal() {
  const modalEl = document.getElementById('modalStudentGrievance');
  if (!modalEl) return;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
window.openStudentGrievanceModal = openStudentGrievanceModal;

async function submitStudentGrievance(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const category = document.getElementById('grievanceCategory')?.value;
  const urgency = document.getElementById('grievanceUrgency')?.value;
  const subject = document.getElementById('grievanceSubject')?.value;
  const details = document.getElementById('grievanceDetails')?.value;

  if (!category || !subject || !details) {
    if (typeof showToast === 'function') showToast('Please complete all required fields.', 'warning');
    return;
  }

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/student/grievance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ category, urgency, subject, details })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    if (typeof showToast === 'function') {
      showToast(`Confidential report submitted. Ticket #${result.ticket_number}`, 'success');
    }
    const modalEl = document.getElementById('modalStudentGrievance');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    document.getElementById('formStudentGrievance')?.reset();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Failed to submit report: ' + err.message, 'error');
  }
}
window.submitStudentGrievance = submitStudentGrievance;

// 7. DIRECTOR GRIEVANCE DESK & RESOLUTION
async function loadDirectorGrievancesDesk() {
  const tbody = document.getElementById('directorGrievancesTableBody');
  if (!tbody) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch('/api/admin/grievances', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    const reports = result.data || [];

    if (reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No grievances or incident reports on file.</td></tr>';
      return;
    }

    tbody.innerHTML = reports.map(g => `
      <tr>
        <td style="padding: 12px 14px; font-weight: 600;"><code>${escapeHtml(g.ticket_number)}</code></td>
        <td style="padding: 12px 14px;">${new Date(g.created_at).toLocaleDateString()}</td>
        <td style="padding: 12px 14px;">${escapeHtml(g.category)}</td>
        <td style="padding: 12px 14px;">${escapeHtml(g.subject)}</td>
        <td style="padding: 12px 14px;">
          <span class="badge ${g.urgency === 'Critical Safety' ? 'bg-danger' : g.urgency === 'Urgent' ? 'bg-warning text-dark' : 'bg-secondary'}">
            ${escapeHtml(g.urgency)}
          </span>
        </td>
        <td style="padding: 12px 14px;">
          <span class="badge ${g.status === 'Resolved' ? 'bg-success' : 'bg-info'}">${escapeHtml(g.status)}</span>
        </td>
        <td style="padding: 12px 14px; text-align: right;">
          <button class="btn btn-outline-gold btn-xs" onclick="promptResolveGrievance('${g.ticket_number}')">
            <i class="fa-solid fa-gavel"></i> Action
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading director grievances:', err);
  }
}
window.loadDirectorGrievancesDesk = loadDirectorGrievancesDesk;

function promptResolveGrievance(ticketNumber) {
  const modalEl = document.getElementById('modalResolveGrievance');
  if (!modalEl) return;
  const idInput = document.getElementById('resolveGrievanceId');
  if (idInput) idInput.value = ticketNumber;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
window.promptResolveGrievance = promptResolveGrievance;

async function submitResolveGrievance(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const ticketId = document.getElementById('resolveGrievanceId')?.value;
  const status = document.getElementById('resolveGrievanceStatus')?.value;
  const resolutionNotes = document.getElementById('resolveGrievanceNotes')?.value;

  if (!ticketId || !status) return;

  try {
    const token = sessionStorage.getItem('cgcs_token') || localStorage.getItem('token') || (typeof state !== 'undefined' && state.authToken);
    const res = await fetch(`/api/admin/grievances/${encodeURIComponent(ticketId)}/resolve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status, resolutionNotes })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    if (typeof showToast === 'function') showToast(result.message || 'Grievance updated.', 'success');
    const modalEl = document.getElementById('modalResolveGrievance');
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    loadDirectorGrievancesDesk();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Failed to resolve: ' + err.message, 'error');
  }
}
window.submitResolveGrievance = submitResolveGrievance;


