const AnalyticsPage = (() => {
  let _activeGame = 0;
  let _gameData   = {};

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  function fmtTime(seconds) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }

  function render(container) {
    const games = CONFIG.GAMES || [];
    if (!games.length) {
      container.innerHTML = `
        <div class="topbar">
          <span class="topbar-title">Analytics</span>
        </div>
        <div class="content">
          <div class="empty-state">
            <i class="ti ti-chart-bar"></i>
            <p>No games configured. Add entries to CONFIG.GAMES in config.js.</p>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="topbar">
        <div>
          <span class="topbar-title">Analytics</span>
          <span class="topbar-count">Last 30 days</span>
        </div>
        <button class="btn" id="refresh-btn"><i class="ti ti-refresh"></i> Refresh</button>
      </div>
      <div class="game-tabs" id="game-tabs">
        ${games.map((g, i) =>
          `<button class="game-tab${i===_activeGame?' active':''}" data-gi="${i}">${esc(g.name)}</button>`
        ).join('')}
      </div>
      <div class="content" id="analytics-content">
        <div class="loading">Loading metrics…</div>
      </div>`;

    document.getElementById('refresh-btn').addEventListener('click', () => fetchGame(_activeGame));
    document.getElementById('game-tabs').querySelectorAll('.game-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeGame = +btn.dataset.gi;
        document.querySelectorAll('.game-tab').forEach(b => b.classList.toggle('active', b === btn));
        renderGameData(_activeGame);
      });
    });

    fetchGame(_activeGame);
  }

  async function fetchGame(idx) {
    const game = (CONFIG.GAMES || [])[idx];
    if (!game) return;

    const content = document.getElementById('analytics-content');
    if (content) content.innerHTML = '<div class="loading">Fetching metrics…</div>';

    try {
      const [metrics, retention] = await Promise.all([
        AnalyticsAPI.getMetrics(game.ga_game_key, game.ga_secret_key),
        AnalyticsAPI.getRetention(game.ga_game_key, game.ga_secret_key).catch(() => null)
      ]);
      _gameData[idx] = { metrics, retention };
    } catch (err) {
      _gameData[idx] = { error: err.message };
    }

    renderGameData(idx);
  }

  function renderGameData(idx) {
    const content = document.getElementById('analytics-content');
    if (!content) return;
    const gd = _gameData[idx];
    if (!gd) { fetchGame(idx); return; }

    if (gd.error) {
      content.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title text-danger">API Error</div>
          </div>
          <p style="font-size:13px;color:var(--text-secondary)">${esc(gd.error)}</p>
          <p class="form-hint mt-1">
            GameAnalytics REST API may require specific endpoint configuration.
            Check the GA documentation for your plan's query API endpoints.
          </p>
        </div>`;
      return;
    }

    const m = gd.metrics?.data || gd.metrics || {};
    const r = gd.retention?.data || gd.retention || {};

    const dau  = m.dau ?? m.DAU ?? sumLast(m, 'dau', 1);
    const mau  = m.mau ?? m.MAU ?? sumLast(m, 'mau', 30);
    const sess = m.sessions ?? sumLast(m, 'sessions', 30);
    const avgLen = m.session_length ?? m.avg_session_length ?? null;

    const d1  = extractRetention(r, 1);
    const d7  = extractRetention(r, 7);
    const d30 = extractRetention(r, 30);

    content.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">DAU</div>
          <div class="metric-value">${fmt(dau)}</div>
          <div class="metric-sub">Daily active users</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">MAU</div>
          <div class="metric-value">${fmt(mau)}</div>
          <div class="metric-sub">Monthly active users</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sessions</div>
          <div class="metric-value">${fmt(sess)}</div>
          <div class="metric-sub">Last 30 days</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Session</div>
          <div class="metric-value">${fmtTime(avgLen)}</div>
          <div class="metric-sub">Session length</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Retention</div></div>
        <div class="retention-row">
          <span class="retention-label">D1</span>
          <div class="retention-bar-wrap"><div class="retention-bar" style="width:${d1??0}%"></div></div>
          <span class="retention-pct">${d1 != null ? d1 + '%' : '—'}</span>
        </div>
        <div class="retention-row">
          <span class="retention-label">D7</span>
          <div class="retention-bar-wrap"><div class="retention-bar" style="width:${d7??0}%"></div></div>
          <span class="retention-pct">${d7 != null ? d7 + '%' : '—'}</span>
        </div>
        <div class="retention-row">
          <span class="retention-label">D30</span>
          <div class="retention-bar-wrap"><div class="retention-bar" style="width:${d30??0}%"></div></div>
          <span class="retention-pct">${d30 != null ? d30 + '%' : '—'}</span>
        </div>
      </div>

      ${renderDailyChart(m)}`;
  }

  function extractRetention(r, day) {
    if (!r) return null;
    if (Array.isArray(r)) {
      const entry = r.find(e => e.day === day || e.retention_day === day);
      if (entry) return Math.round(entry.retention_percentage ?? entry.value ?? 0);
    }
    const key = `d${day}`;
    if (r[key] != null) return Math.round(r[key] * 100);
    return null;
  }

  function sumLast(m, field, days) {
    if (Array.isArray(m)) {
      const slice = m.slice(-days);
      const vals = slice.map(e => e[field] ?? 0);
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0);
    }
    return null;
  }

  function renderDailyChart(m) {
    if (!Array.isArray(m) || !m.length) return '';
    const field = m[0]?.dau != null ? 'dau' : m[0]?.sessions != null ? 'sessions' : null;
    if (!field) return '';

    const values = m.map(e => e[field] ?? 0);
    const max = Math.max(...values, 1);
    const bars = values.slice(-30).map((v, i) => {
      const pct = Math.round((v / max) * 100);
      const date = m[i]?.date ?? m[i]?.day ?? '';
      return `<div title="${esc(String(date))}: ${fmt(v)}"
        style="flex:1;height:${pct}%;min-height:2px;background:var(--accent);border-radius:2px 2px 0 0;opacity:0.8"></div>`;
    }).join('');

    return `
      <div class="card mt-2">
        <div class="card-header"><div class="card-title">${field.toUpperCase()} — last 30 days</div></div>
        <div style="display:flex;align-items:flex-end;height:100px;gap:2px;padding:0 4px">
          ${bars}
        </div>
      </div>`;
  }

  return { render };
})();
