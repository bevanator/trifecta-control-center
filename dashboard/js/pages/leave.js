const LeavePage = (() => {
  let _data = { balances: [], requests: [] };
  let _users = [];
  let _calYear  = new Date().getFullYear();
  let _calMonth = new Date().getMonth();
  let _tab = 'requests'; // 'requests' | 'calendar'

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const LEAVE_COLORS = { casual: '#f59e0b', sick: '#ef4444', annual: '#22c55e' };

  const USER_COLORS = ['#8b5cf6','#3b82f6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899'];
  function userColor(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return USER_COLORS[Math.abs(h) % USER_COLORS.length];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function daysBetween(from, to) {
    const a = new Date(from), b = new Date(to);
    return Math.round((b - a) / 86400000) + 1;
  }

  async function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Leave</div>
            <div class="page-subtitle">Requests, approvals, and balances</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" id="manage-balances-btn">Manage Balances</button>
            <button class="btn btn-primary" id="request-leave-btn">+ Request Leave</button>
          </div>
        </div>
        <div id="leave-body"><div class="loading">Loading…</div></div>
      </div>`;

    document.getElementById('request-leave-btn').addEventListener('click', showRequestModal);
    document.getElementById('manage-balances-btn').addEventListener('click', showBalancesModal);

    await loadData();
  }

  async function loadData() {
    try {
      const [leaveData, credsData] = await Promise.all([
        GitHub.readGist(CONFIG.GIST_LEAVE_ID, 'leave.json'),
        GitHub.readGist(CONFIG.GIST_CREDENTIALS_ID, 'credentials.json').catch(() => ({ users: [] }))
      ]);
      _data = { balances: leaveData.balances || [], requests: leaveData.requests || [] };
      _users = (credsData.users || []).map(u => u.username);
      renderLeave();
    } catch (err) {
      document.getElementById('leave-body').innerHTML =
        `<div class="empty-state"><p class="text-danger">Failed to load: ${esc(err.message)}</p></div>`;
    }
  }

  function renderLeave() {
    const body = document.getElementById('leave-body');
    body.innerHTML = `
      <div class="balance-grid" id="balance-grid"></div>
      <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid var(--border)">
        <button class="game-tab${_tab==='requests'?' active':''}" id="tab-requests">Requests</button>
        <button class="game-tab${_tab==='calendar'?' active':''}" id="tab-calendar">Calendar</button>
      </div>
      <div id="tab-content"></div>`;

    renderBalances();

    document.getElementById('tab-requests').addEventListener('click', () => { _tab = 'requests'; renderTabs(); });
    document.getElementById('tab-calendar').addEventListener('click', () => { _tab = 'calendar'; renderTabs(); });
    renderTabs();
  }

  function renderBalances() {
    const grid = document.getElementById('balance-grid');
    if (!grid) return;
    const allUsers = [...new Set([..._users, ..._data.balances.map(b => b.username)])];
    if (!allUsers.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = allUsers.map(u => {
      const bal = _data.balances.find(b => b.username === u) || { casual:10, sick:10, annual:10 };
      return `
        <div class="balance-card">
          <div class="balance-name" style="color:${userColor(u)}">${esc(u)}</div>
          <div class="balance-row"><span>Casual</span><span>${bal.casual} days</span></div>
          <div class="balance-row"><span>Sick</span><span>${bal.sick} days</span></div>
          <div class="balance-row"><span>Annual</span><span>${bal.annual} days</span></div>
        </div>`;
    }).join('');
  }

  function renderTabs() {
    const el = document.querySelector('.game-tab:first-child');
    document.getElementById('tab-requests').classList.toggle('active', _tab === 'requests');
    document.getElementById('tab-calendar').classList.toggle('active', _tab === 'calendar');
    const content = document.getElementById('tab-content');
    if (_tab === 'requests') renderRequestsTable(content);
    else renderCalendar(content);
  }

  function renderRequestsTable(container) {
    if (!_data.requests.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◷</div><p>No leave requests</p></div>`;
      return;
    }
    const sorted = [..._data.requests].sort((a, b) => new Date(b.from) - new Date(a.from));
    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(r => `
              <tr>
                <td><span style="color:${userColor(r.username)};font-weight:600">${esc(r.username)}</span></td>
                <td><span class="badge" style="background:${LEAVE_COLORS[r.type]}22;color:${LEAVE_COLORS[r.type]}">${esc(r.type)}</span></td>
                <td>${esc(r.from)}</td>
                <td>${esc(r.to)}</td>
                <td>${daysBetween(r.from, r.to)}</td>
                <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.reason || '—')}</td>
                <td><span class="badge badge-${r.status}">${esc(r.status)}</span></td>
                <td>
                  <div class="td-actions">
                    ${r.status === 'pending' ? `
                      <button class="btn btn-sm btn-success" data-approve="${r.id}">✓</button>
                      <button class="btn btn-sm btn-danger" data-reject="${r.id}">✕</button>` : ''}
                    <button class="btn btn-sm btn-secondary" data-delete="${r.id}">Delete</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    container.querySelectorAll('[data-approve]').forEach(btn =>
      btn.addEventListener('click', () => setStatus(btn.dataset.approve, 'approved')));
    container.querySelectorAll('[data-reject]').forEach(btn =>
      btn.addEventListener('click', () => setStatus(btn.dataset.reject, 'rejected')));
    container.querySelectorAll('[data-delete]').forEach(btn =>
      btn.addEventListener('click', () => deleteRequest(btn.dataset.delete)));
  }

  function renderCalendar(container) {
    const now = new Date();
    const firstDay = new Date(_calYear, _calMonth, 1);
    const lastDay  = new Date(_calYear, _calMonth + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday-first

    const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    // Build day map: date-str → [{ username, type }]
    const dayMap = {};
    _data.requests.filter(r => r.status === 'approved').forEach(r => {
      let cur = new Date(r.from);
      const end = new Date(r.to);
      while (cur <= end) {
        const key = cur.toISOString().split('T')[0];
        if (!dayMap[key]) dayMap[key] = [];
        dayMap[key].push({ username: r.username, type: r.type });
        cur.setDate(cur.getDate() + 1);
      }
    });

    // Cells
    const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
    let cellsHtml = '';
    for (let i = 0; i < totalCells; i++) {
      const offset = i - startDow;
      const date = new Date(_calYear, _calMonth, offset + 1);
      const inMonth = date.getMonth() === _calMonth;
      const isToday = date.toDateString() === now.toDateString();
      const key = date.toISOString().split('T')[0];
      const entries = dayMap[key] || [];
      const dots = entries.map(e =>
        `<span class="cal-dot" style="background:${LEAVE_COLORS[e.type]||'#666'}" title="${esc(e.username)} – ${esc(e.type)}"></span>`
      ).join('');
      cellsHtml += `
        <div class="cal-cell${!inMonth?' other-month':''}${isToday?' today':''}">
          <div class="cal-num">${date.getDate()}</div>
          <div class="cal-leave-dots">${dots}</div>
        </div>`;
    }

    // Unique users in approved requests this month
    const monthStart = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-01`;
    const monthEnd   = lastDay.toISOString().split('T')[0];
    const activeUsers = [...new Map(
      _data.requests
        .filter(r => r.status === 'approved' && r.to >= monthStart && r.from <= monthEnd)
        .map(r => [r.username, r])
    ).values()];

    container.innerHTML = `
      <div class="calendar-wrap">
        <div class="cal-header">
          <button class="btn btn-secondary btn-sm" id="cal-prev">← Prev</button>
          <span class="cal-title">${monthName}</span>
          <button class="btn btn-secondary btn-sm" id="cal-next">Next →</button>
        </div>
        <div class="cal-grid">
          ${days.map(d => `<div class="cal-day-label">${d}</div>`).join('')}
          ${cellsHtml}
        </div>
        ${activeUsers.length ? `
          <div class="cal-legend">
            ${[...new Set(activeUsers.map(r => r.username))].map(u =>
              `<div class="cal-legend-item">
                <span class="cal-legend-dot" style="background:${userColor(u)}"></span>
                <span>${esc(u)}</span>
              </div>`
            ).join('')}
          </div>` : ''}
      </div>`;

    document.getElementById('cal-prev').addEventListener('click', () => {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
      renderCalendar(container);
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
      renderCalendar(container);
    });
  }

  // ── Modals ────────────────────────────────────────────
  function showRequestModal() {
    const allUsers = [...new Set([..._users, ..._data.balances.map(b => b.username)])];
    App.showModal('Request Leave', `
      <div class="form-group">
        <label class="form-label">Team Member *</label>
        <select class="form-select" id="lr-user">
          ${allUsers.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Leave Type *</label>
        <select class="form-select" id="lr-type">
          <option value="annual">Annual</option>
          <option value="casual">Casual</option>
          <option value="sick">Sick</option>
        </select>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">From *</label>
          <input class="form-input" type="date" id="lr-from">
        </div>
        <div class="form-group">
          <label class="form-label">To *</label>
          <input class="form-input" type="date" id="lr-to">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <textarea class="form-textarea" id="lr-reason" rows="2"></textarea>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Submit', cls: 'btn-primary', action: submitRequest }
    ]);
  }

  async function submitRequest() {
    const username = document.getElementById('lr-user').value;
    const type     = document.getElementById('lr-type').value;
    const from     = document.getElementById('lr-from').value;
    const to       = document.getElementById('lr-to').value;
    const reason   = document.getElementById('lr-reason').value.trim();

    if (!from || !to) { App.toast('Dates required', 'error'); return; }
    if (new Date(from) > new Date(to)) { App.toast('"From" must be before "To"', 'error'); return; }

    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      _data.requests.push({ id: uid(), username, type, from, to, reason, status: 'pending' });
      await saveData();
      App.closeModal();
      App.toast('Leave request submitted', 'success');
      renderLeave();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = 'Submit';
    }
  }

  async function setStatus(id, status) {
    const req = _data.requests.find(r => r.id === id);
    if (!req) return;
    req.status = status;
    try {
      await saveData();
      App.toast(`Request ${status}`, 'success');
      renderTabs();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  }

  async function deleteRequest(id) {
    if (!confirm('Delete this leave request?')) return;
    _data.requests = _data.requests.filter(r => r.id !== id);
    try {
      await saveData();
      App.toast('Request deleted', 'success');
      renderTabs();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  }

  function showBalancesModal() {
    const allUsers = [...new Set([..._users, ..._data.balances.map(b => b.username)])];
    const rows = allUsers.map(u => {
      const bal = _data.balances.find(b => b.username === u) || { casual:10, sick:10, annual:10 };
      return `
        <tr data-user="${esc(u)}">
          <td style="font-weight:600;color:${userColor(u)}">${esc(u)}</td>
          <td><input class="form-input" type="number" min="0" value="${bal.casual}" data-field="casual" style="width:80px"></td>
          <td><input class="form-input" type="number" min="0" value="${bal.sick}"   data-field="sick"   style="width:80px"></td>
          <td><input class="form-input" type="number" min="0" value="${bal.annual}" data-field="annual" style="width:80px"></td>
        </tr>`;
    }).join('');

    App.showModal('Manage Balances', `
      <div class="table-wrap">
        <table>
          <thead><tr><th>User</th><th>Casual</th><th>Sick</th><th>Annual</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Save', cls: 'btn-primary', action: saveBalances }
    ], true);
  }

  async function saveBalances() {
    const rows = document.querySelectorAll('[data-user]');
    const balances = [];
    rows.forEach(row => {
      balances.push({
        username: row.dataset.user,
        casual:   Number(row.querySelector('[data-field="casual"]').value),
        sick:     Number(row.querySelector('[data-field="sick"]').value),
        annual:   Number(row.querySelector('[data-field="annual"]').value)
      });
    });
    _data.balances = balances;
    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await saveData();
      App.closeModal();
      App.toast('Balances saved', 'success');
      renderBalances();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  async function saveData() {
    await GitHub.writeGist(CONFIG.GIST_LEAVE_ID, 'leave.json', _data);
  }

  return { render };
})();
