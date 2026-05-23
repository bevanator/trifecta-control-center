// ── Coming Soon page (inline — no separate file needed) ──
const ComingSoonPage = {
  render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="empty-state" style="padding-top:80px">
          <div class="empty-state-icon" style="font-size:44px">◎</div>
          <h2>Coming Soon</h2>
          <p>Leave management is under construction and will be available in a future update.</p>
        </div>
      </div>`;
  }
};

const App = (() => {
  const PAGES = {
    assets:      AssetsPage,
    credentials: CredentialsPage,
    analytics:   AnalyticsPage,
    leave:       ComingSoonPage   // still handles direct #leave navigation
  };

  // ── Init ──────────────────────────────────────────────
  function init() {
    if (typeof CONFIG === 'undefined') {
      document.body.innerHTML = '<p>config.js not found</p>';
      throw new Error('No config');
    }

    initDarkMode();

    if (Auth.isLoggedIn()) {
      showApp();
    } else {
      showLogin();
    }
  }

  // ── Dark mode ─────────────────────────────────────────
  function initDarkMode() {
    const saved = localStorage.getItem('tcc_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
    updateToggleLabel();
  }

  function updateToggleLabel() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.classList.contains('dark');
    btn.textContent = isDark ? '☀ Light mode' : '☾ Dark mode';
  }

  // ── Login ─────────────────────────────────────────────
  function showLogin() {
    const overlay = document.getElementById('login-overlay');
    overlay.removeAttribute('hidden');
    document.getElementById('app').setAttribute('hidden', '');

    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      const pw = document.getElementById('login-password').value;
      if (Auth.login(pw)) {
        overlay.setAttribute('hidden', '');
        showApp();
      } else {
        document.getElementById('login-error').textContent = 'Invalid password.';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      }
    });
  }

  // ── App ───────────────────────────────────────────────
  function showApp() {
    document.getElementById('login-overlay').setAttribute('hidden', '');
    document.getElementById('app').removeAttribute('hidden');
    setupNav();

    const hash = location.hash.slice(1);
    navigate(PAGES[hash] ? hash : 'assets');
  }

  function setupNav() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      location.reload();
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      const isDark = document.documentElement.classList.contains('dark');
      localStorage.setItem('tcc_theme', isDark ? 'dark' : 'light');
      updateToggleLabel();
    });
  }

  function navigate(page) {
    if (!PAGES[page]) page = 'assets';
    location.hash = page;

    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    const content = document.getElementById('content');
    content.scrollTop = 0;
    PAGES[page].render(content);
  }

  // ── Modal ─────────────────────────────────────────────
  function showModal(title, bodyHtml, buttons = [], wide = false) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');

    modal.className = `modal${wide ? ' modal-lg' : ''}`;
    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="btn-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        ${buttons.map(b => `<button class="btn ${b.cls}" data-action="${b.label}">${b.label}</button>`).join('')}
      </div>`;

    overlay.removeAttribute('hidden');
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { once: true });
    buttons.forEach(b => {
      modal.querySelector(`[data-action="${b.label}"]`)?.addEventListener('click', b.action);
    });
  }

  function closeModal() {
    document.getElementById('modal-overlay').setAttribute('hidden', '');
  }

  // ── Toast ─────────────────────────────────────────────
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, showModal, closeModal, toast };
})();
