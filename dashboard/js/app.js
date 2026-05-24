if (typeof CONFIG === 'undefined') {
  document.body.innerHTML = '<h2 style="padding:40px;font-family:sans-serif">config.js not found. Copy config.example.js to config.js and fill in credentials.</h2>';
  throw new Error('CONFIG not defined');
}

// ── Coming Soon page ──────────────────────────────────────
const ComingSoonPage = {
  render(container) {
    container.innerHTML = `
      <div class="topbar">
        <span class="topbar-title">Coming Soon</span>
      </div>
      <div class="content">
        <div class="empty-state" style="padding-top:60px">
          <i class="ti ti-clock"></i>
          <p>This section is under construction and will be available in a future update.</p>
        </div>
      </div>`;
  }
};

const App = (() => {
  const PAGES = {
    assets:      AssetsPage,
    credentials: CredentialsPage,
    analytics:   AnalyticsPage,
    leave:       ComingSoonPage
  };

  const TOAST_ICONS = {
    success: 'ti-circle-check',
    error:   'ti-circle-x',
    info:    'ti-info-circle',
    warning: 'ti-alert-triangle'
  };

  function init() {
    initDarkMode();
    if (Auth.isLoggedIn()) {
      showApp();
    } else {
      showLogin();
    }
  }

  function initDarkMode() {
    if (localStorage.getItem('tcc_theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateToggleLabel();
  }

  function updateToggleLabel() {
    const icon  = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (!icon || !label) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    icon.className = `ti ${isDark ? 'ti-sun' : 'ti-moon'}`;
    label.textContent = isDark ? 'Light mode' : 'Dark mode';
  }

  function showLogin() {
    document.getElementById('login-page').removeAttribute('hidden');
    document.getElementById('app').setAttribute('hidden', '');

    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      const pw = document.getElementById('login-password').value;
      if (Auth.login(pw)) {
        document.getElementById('login-page').setAttribute('hidden', '');
        showApp();
      } else {
        document.getElementById('login-error').textContent = 'Incorrect password.';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      }
    });
  }

  function showApp() {
    document.getElementById('login-page').setAttribute('hidden', '');
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
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('tcc_theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('tcc_theme', 'dark');
      }
      updateToggleLabel();
    });
  }

  function navigate(page) {
    if (!PAGES[page]) page = 'assets';
    location.hash = page;

    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    const container = document.getElementById('content');
    PAGES[page].render(container);
    const scrollEl = container.querySelector('.content');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function showModal(title, bodyHtml, buttons = [], wide = false) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');

    modal.className = `modal${wide ? ' modal-lg' : ''}`;
    modal.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
        <div class="modal-title">${title}</div>
        <button class="icon-btn" id="modal-close-btn" style="flex-shrink:0;margin-left:8px"><i class="ti ti-x"></i></button>
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

  function toast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = TOAST_ICONS[type] || 'ti-info-circle';
    el.innerHTML = `
      <i class="ti ${icon} toast-icon"></i>
      <div class="toast-body"><div class="toast-title">${message}</div></div>
      <i class="ti ti-x toast-close"></i>`;
    el.querySelector('.toast-close').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, showModal, closeModal, toast };
})();
