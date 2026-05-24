const CredentialsPage = (() => {
  let _users = [];

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function render(container) {
    container.innerHTML = `
      <div class="topbar">
        <div>
          <span class="topbar-title">Team credentials</span>
          <span class="topbar-count" id="creds-count"></span>
        </div>
        <button class="btn btn-primary" id="add-user-btn">
          <i class="ti ti-user-plus"></i> Add user
        </button>
      </div>
      <div class="content">
        <div class="stat-grid" id="creds-stats" style="display:none">
          <div class="stat-card">
            <div class="stat-label">Total users</div>
            <div class="stat-value" id="stat-total">—</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Admins</div>
            <div class="stat-value" id="stat-admins">—</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Developers</div>
            <div class="stat-value" id="stat-devs">—</div>
          </div>
        </div>
        <div id="creds-body"><div class="loading">Loading…</div></div>
      </div>`;

    document.getElementById('add-user-btn').addEventListener('click', () => showUserModal(null));
    await loadUsers();
  }

  async function loadUsers() {
    try {
      const data = await GitHub.readGist(CONFIG.GIST_CREDENTIALS_ID, 'credentials.json');
      _users = data.users || [];
      renderTable();
    } catch (err) {
      document.getElementById('creds-body').innerHTML = `
        <div class="empty-state">
          <i class="ti ti-alert-circle"></i>
          <p>Failed to load: ${esc(err.message)}</p>
        </div>`;
    }
  }

  function renderTable() {
    const body = document.getElementById('creds-body');

    const stats = document.getElementById('creds-stats');
    const countEl = document.getElementById('creds-count');
    if (stats && _users.length) {
      stats.style.display = '';
      document.getElementById('stat-total').textContent = _users.length;
      document.getElementById('stat-admins').textContent = _users.filter(u => u.role === 'admin').length;
      document.getElementById('stat-devs').textContent = _users.filter(u => u.role === 'dev').length;
    }
    if (countEl) countEl.textContent = _users.length ? `${_users.length} user${_users.length !== 1 ? 's' : ''}` : '';

    if (!_users.length) {
      body.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-users"></i>
          <p>No users yet. Add the first one.</p>
        </div>`;
      return;
    }

    body.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Added</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${_users.map((u, i) => `
              <tr>
                <td class="font-medium">${esc(u.username)}</td>
                <td><span class="badge badge-${u.role}">${esc(u.role)}</span></td>
                <td class="text-muted">${u.added ? new Date(u.added).toLocaleDateString('en', {month:'short', year:'numeric'}) : '—'}</td>
                <td>
                  <div class="actions">
                    <button class="icon-btn" data-edit="${i}" title="Edit"><i class="ti ti-edit"></i></button>
                    <button class="icon-btn icon-btn-danger" data-del="${i}" title="Delete"><i class="ti ti-trash"></i></button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => showUserModal(_users[+btn.dataset.edit]));
    });
    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteUser(_users[+btn.dataset.del]));
    });
  }

  function showUserModal(existing) {
    App.showModal(existing ? 'Edit user' : 'Add user', `
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input class="input" id="u-name" value="${esc(existing?.username || '')}" ${existing ? 'readonly' : ''} placeholder="lowercase, no spaces" style="width:100%">
      </div>
      <div class="form-group">
        <label class="form-label">${existing ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
        <input class="input" type="password" id="u-pass" autocomplete="new-password" style="width:100%">
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="input" id="u-role" style="width:100%">
          <option value="dev" ${existing?.role === 'dev' ? 'selected' : ''}>dev</option>
          <option value="admin" ${existing?.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: existing ? 'Save' : 'Create', cls: 'btn-primary', action: () => saveUser(existing) }
    ]);
  }

  async function saveUser(existing) {
    const username = document.getElementById('u-name').value.trim().toLowerCase();
    const password = document.getElementById('u-pass').value;
    const role     = document.getElementById('u-role').value;

    if (!username) { App.toast('Username required', 'error'); return; }
    if (!existing && !password) { App.toast('Password required for new user', 'error'); return; }

    if (!existing && _users.find(u => u.username === username)) {
      App.toast('Username already exists', 'error'); return;
    }

    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      let hash = existing?.hash || '';
      if (password) {
        hash = await bcrypt.hash(password, 10);
      }

      if (existing) {
        const idx = _users.findIndex(u => u.username === existing.username);
        _users[idx] = { ...existing, role, hash };
      } else {
        _users.push({ username, hash, role, added: new Date().toISOString() });
      }

      await GitHub.writeGist(CONFIG.GIST_CREDENTIALS_ID, 'credentials.json', { users: _users });
      App.closeModal();
      App.toast(`User "${username}" saved`, 'success');
      renderTable();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = existing ? 'Save' : 'Create';
    }
  }

  function confirmDeleteUser(user) {
    App.showModal('Remove user?', `
      <div class="modal-sub">${esc(user.username)} will lose access immediately. This cannot be undone.</div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Remove', cls: 'btn-danger', action: () => deleteUser(user) }
    ]);
  }

  async function deleteUser(user) {
    try {
      _users = _users.filter(u => u.username !== user.username);
      await GitHub.writeGist(CONFIG.GIST_CREDENTIALS_ID, 'credentials.json', { users: _users });
      App.closeModal();
      App.toast(`User "${user.username}" deleted`, 'success');
      renderTable();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  }

  return { render };
})();
