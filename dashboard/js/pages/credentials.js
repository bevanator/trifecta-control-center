const CredentialsPage = (() => {
  let _users = [];

  const AVATAR_COLORS = [
    '#8b5cf6','#3b82f6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'
  ];

  function avatarColor(username) {
    let hash = 0;
    for (const c of username) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Credentials</div>
            <div class="page-subtitle">Team logins for the Unity Asset Manager tool</div>
          </div>
          <button class="btn btn-primary" id="add-user-btn">+ Add User</button>
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
      document.getElementById('creds-body').innerHTML =
        `<div class="empty-state"><p class="text-danger">Failed to load: ${esc(err.message)}</p></div>`;
    }
  }

  function renderTable() {
    const body = document.getElementById('creds-body');
    if (!_users.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⊛</div><p>No users yet. Add the first one.</p></div>`;
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${_users.map((u, i) => `
              <tr>
                <td>
                  <div class="username-cell">
                    <div class="avatar" style="background:${avatarColor(u.username)};color:#fff">
                      ${esc(u.username[0].toUpperCase())}
                    </div>
                    <span>${esc(u.username)}</span>
                  </div>
                </td>
                <td><span class="badge badge-${u.role}">${esc(u.role)}</span></td>
                <td class="text-muted">${u.added ? new Date(u.added).toLocaleDateString() : '—'}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-sm btn-secondary" data-edit="${i}">Edit</button>
                    <button class="btn btn-sm btn-danger" data-del="${i}">Delete</button>
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
      btn.addEventListener('click', () => deleteUser(_users[+btn.dataset.del]));
    });
  }

  function showUserModal(existing) {
    App.showModal(existing ? 'Edit User' : 'Add User', `
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input class="form-input" id="u-name" value="${esc(existing?.username || '')}" ${existing ? 'readonly' : ''} placeholder="lowercase, no spaces">
      </div>
      <div class="form-group">
        <label class="form-label">${existing ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
        <input class="form-input" type="password" id="u-pass" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-select" id="u-role">
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

  async function deleteUser(user) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      _users = _users.filter(u => u.username !== user.username);
      await GitHub.writeGist(CONFIG.GIST_CREDENTIALS_ID, 'credentials.json', { users: _users });
      App.toast(`User "${user.username}" deleted`, 'success');
      renderTable();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  }

  return { render };
})();
