const AssetsPage = (() => {
  let _assets = [];
  let _filter = '';
  let _tagFilter = '';
  let _sort = 'name-asc';
  let _scanStatus = {};

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function initials(name) {
    return (name || '?').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  }

  function thumbColor(name) {
    const colors = ['blue', 'purple', 'green', 'amber', 'red', 'teal'];
    return colors[(name || '?').toUpperCase().charCodeAt(0) % colors.length];
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Page ──────────────────────────────────────────────
  async function render(container) {
    container.innerHTML = `
      <div class="topbar">
        <div>
          <span class="topbar-title">Asset library</span>
          <span class="topbar-count" id="asset-count"></span>
        </div>
        <button class="btn btn-primary" id="add-asset-btn">
          <i class="ti ti-plus"></i> Add asset
        </button>
      </div>
      <div class="filter-row">
        <input class="input input-search" id="asset-search" placeholder="Search assets…" value="${_filter}">
        <select class="input" id="asset-sort">
          <option value="name-asc"      ${_sort==='name-asc'      ?'selected':''}>Name A–Z</option>
          <option value="name-desc"     ${_sort==='name-desc'     ?'selected':''}>Name Z–A</option>
          <option value="newest"        ${_sort==='newest'        ?'selected':''}>Newest first</option>
          <option value="oldest"        ${_sort==='oldest'        ?'selected':''}>Oldest first</option>
          <option value="ready-first"   ${_sort==='ready-first'   ?'selected':''}>Ready first</option>
          <option value="missing-first" ${_sort==='missing-first' ?'selected':''}>Missing first</option>
        </select>
        <div id="tag-filters" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      </div>
      <div class="content" id="asset-list-wrap">
        <div class="loading">Loading assets…</div>
      </div>`;

    document.getElementById('add-asset-btn').addEventListener('click', showAddModal);

    document.getElementById('asset-search').addEventListener('input', e => {
      _filter = e.target.value.toLowerCase();
      renderTagFilters();
      renderList();
      sortedAssets().forEach(a => a.drive_folder_id && scanAsset(a));
    });

    document.getElementById('asset-sort').addEventListener('change', e => {
      _sort = e.target.value;
      renderList();
      sortedAssets().forEach(a => a.drive_folder_id && scanAsset(a));
    });

    await loadAssets();
  }

  async function loadAssets() {
    try {
      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      _assets = index.assets || [];
      renderTagFilters();
      renderList();
      _assets.forEach(a => a.drive_folder_id && scanAsset(a));
    } catch (err) {
      const wrap = document.getElementById('asset-list-wrap');
      if (wrap) wrap.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-alert-circle"></i>
          <p>Failed to load: ${esc(err.message)}</p>
        </div>`;
    }
  }

  function allTags() {
    const tags = new Set();
    _assets.forEach(a => (a.tags || []).forEach(t => tags.add(t)));
    return [...tags].sort();
  }

  function renderTagFilters() {
    const wrap = document.getElementById('tag-filters');
    if (!wrap) return;
    wrap.innerHTML = allTags().map(t =>
      `<span class="tag tag-filter${_tagFilter === t ? ' active' : ''}" data-tag="${esc(t)}">${esc(t)}</span>`
    ).join('');
    wrap.querySelectorAll('.tag-filter').forEach(el => {
      el.addEventListener('click', () => {
        _tagFilter = _tagFilter === el.dataset.tag ? '' : el.dataset.tag;
        renderTagFilters();
        renderList();
        sortedAssets().forEach(a => a.drive_folder_id && scanAsset(a));
      });
    });
  }

  function filteredAssets() {
    return _assets.filter(a => {
      if (_filter) {
        const hay = `${a.name} ${a.publisher || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(_filter)) return false;
      }
      if (_tagFilter && !(a.tags || []).includes(_tagFilter)) return false;
      return true;
    });
  }

  function sortedAssets() {
    return filteredAssets().sort((a, b) => {
      switch (_sort) {
        case 'name-asc':      return a.name.localeCompare(b.name);
        case 'name-desc':     return b.name.localeCompare(a.name);
        case 'newest':        return b.id.localeCompare(a.id);
        case 'oldest':        return a.id.localeCompare(b.id);
        case 'ready-first': {
          const ra = _scanStatus[a.id] === 'ready' ? 0 : 1;
          const rb = _scanStatus[b.id] === 'ready' ? 0 : 1;
          return ra - rb || a.name.localeCompare(b.name);
        }
        case 'missing-first': {
          const ma = _scanStatus[a.id] === 'missing' ? 0 : 1;
          const mb = _scanStatus[b.id] === 'missing' ? 0 : 1;
          return ma - mb || a.name.localeCompare(b.name);
        }
        default: return 0;
      }
    });
  }

  // ── List render ───────────────────────────────────────
  function renderList() {
    const wrap = document.getElementById('asset-list-wrap');
    if (!wrap) return;
    const list = sortedAssets();

    const countEl = document.getElementById('asset-count');
    if (countEl) countEl.textContent = `${list.length} asset${list.length !== 1 ? 's' : ''}`;

    if (!list.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-package-off"></i>
          <p>No assets found</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `<div class="asset-list" id="asset-list">${list.map(rowHtml).join('')}</div>`;
    document.getElementById('asset-list').addEventListener('click', handleRowClick);
  }

  function rowHtml(a) {
    const tags = (a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const hasStore  = !!a.asset_store_url;
    const hasFolder = !!a.drive_folder_id;
    const color = thumbColor(a.name);

    return `
      <div class="asset-row" data-id="${esc(a.id)}">
        <div class="asset-thumb thumb-${color}" id="thumb-${esc(a.id)}">${esc(initials(a.name))}</div>
        <div class="asset-info">
          <div class="asset-name">${esc(a.name)}</div>
          <div class="asset-pub">${esc(a.publisher || '')}</div>
          <div class="asset-tags">${tags}</div>
        </div>
        <div class="img-strip" id="strip-${esc(a.id)}">
          <div class="img-preview loading"></div>
        </div>
        <div class="vdivider"></div>
        <span class="badge badge-missing" id="status-${esc(a.id)}">
          <i class="ti ti-loader"></i> Scanning
        </span>
        <div class="vdivider"></div>
        <div class="actions">
          <button class="icon-btn${!hasStore ? ' dim' : ''}" data-action="store" title="View on Asset Store">
            <i class="ti ti-external-link"></i>
          </button>
          <button class="icon-btn${!hasFolder ? ' dim' : ''}" data-action="drive" title="Open Drive folder">
            <i class="ti ti-upload"></i>
          </button>
          <button class="icon-btn${!hasFolder ? ' dim' : ''}" data-action="refresh" title="Refresh">
            <i class="ti ti-refresh"></i>
          </button>
          <button class="icon-btn" data-action="edit" title="Edit">
            <i class="ti ti-edit"></i>
          </button>
          <button class="icon-btn icon-btn-danger" data-action="delete" title="Delete">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>`;
  }

  function handleRowClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.classList.contains('dim')) return;

    const row = btn.closest('.asset-row');
    const asset = _assets.find(a => a.id === row?.dataset.id);
    if (!asset) return;

    const action = btn.dataset.action;
    if (action === 'store') {
      const url = /^https?:\/\//i.test(asset.asset_store_url)
        ? asset.asset_store_url
        : 'https://' + asset.asset_store_url;
      window.open(url, '_blank');
    } else if (action === 'drive') {
      window.open(`https://drive.google.com/drive/folders/${asset.drive_folder_id}`, '_blank');
    } else if (action === 'refresh') {
      Drive.invalidateCache(asset.drive_folder_id);
      scanAsset(asset, { forceRefresh: true });
    } else if (action === 'edit') {
      showEditModal(asset);
    } else if (action === 'delete') {
      showDeleteModal(asset);
    }
  }

  function showDeleteModal(asset) {
    App.showModal(`Delete "${esc(asset.name)}"?`, `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px">
        <div style="padding:10px 12px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);font-size:12px">
          <div style="font-weight:500;margin-bottom:2px">Index only</div>
          <div style="color:var(--text-secondary);font-size:11px">Removes from the asset list. Drive folder and files remain untouched.</div>
        </div>
        <div style="padding:10px 12px;border:1px solid var(--red-border);border-radius:var(--radius-md);font-size:12px;background:var(--red-bg)">
          <div style="font-weight:500;color:var(--red-text);margin-bottom:2px">Index + Trash Drive folder</div>
          <div style="color:var(--red-text);font-size:11px;opacity:0.8">Removes from list AND moves Drive folder to trash (recoverable).</div>
        </div>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Index only', cls: 'btn-secondary', action: () => deleteAsset(asset, false) },
      { label: 'Index + Trash Drive folder', cls: 'btn-danger', action: () => deleteAsset(asset, true) }
    ]);
  }

  async function deleteAsset(asset, trashDrive) {
    try {
      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      index.assets = (index.assets || []).filter(a => a.id !== asset.id);
      await GitHub.writeGist(CONFIG.GIST_INDEX_ID, 'index.json', index);

      if (trashDrive && asset.drive_folder_id) {
        await Drive.trashFolder(asset.drive_folder_id);
      }

      delete _scanStatus[asset.id];
      Drive.invalidateCache(asset.drive_folder_id);
      App.closeModal();
      App.toast(`"${asset.name}" deleted`, 'success');
      await loadAssets();
    } catch (err) {
      App.toast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ── Scanning ──────────────────────────────────────────
  async function scanAsset(asset, { forceRefresh = false } = {}) {
    if (!asset.drive_folder_id) return;
    try {
      const files = await Drive.listFilesInFolder(asset.drive_folder_id, { forceRefresh });
      const cover       = Drive.findCover(files);
      const screenshots = Drive.findScreenshots(files);
      const packages    = Drive.findPackages(files);

      if (cover) {
        Drive.getImageBlobUrl(cover.id).then(url => {
          const el = document.getElementById(`thumb-${asset.id}`);
          if (!el || !url) return;
          const img = document.createElement('img');
          img.onload = () => {
            const current = document.getElementById(`thumb-${asset.id}`);
            if (current) { current.innerHTML = ''; current.appendChild(img); }
          };
          img.onerror = () => {};
          img.src = url;
        });
      }

      updateStrip(asset.id, screenshots);

      const status = packages.length ? 'ready' : 'missing';
      _scanStatus[asset.id] = status;
      const statusEl = document.getElementById(`status-${asset.id}`);
      if (statusEl) {
        if (status === 'ready') {
          statusEl.className = 'badge badge-ready';
          statusEl.innerHTML = `<i class="ti ti-circle-check"></i> Ready`;
        } else {
          statusEl.className = 'badge badge-missing';
          statusEl.innerHTML = `<i class="ti ti-alert-triangle"></i> Missing package`;
        }
      }
    } catch {
      const statusEl = document.getElementById(`status-${asset.id}`);
      if (statusEl) {
        statusEl.className = 'badge badge-error';
        statusEl.innerHTML = `<i class="ti ti-x"></i> Scan failed`;
      }
    }
  }

  function updateStrip(assetId, screenshots) {
    const el = document.getElementById(`strip-${assetId}`);
    if (!el) return;

    if (!screenshots.length) {
      el.innerHTML = `<div class="img-none"><i class="ti ti-photo-off"></i></div>`;
      return;
    }

    const show  = screenshots.slice(0, 2);
    const extra = screenshots.length - 2;

    el.innerHTML = show.map((_, i) =>
      `<div class="img-preview loading" id="ss-${assetId}-${i}"></div>`
    ).join('') + (extra > 0 ? `<div class="img-more">+${extra}</div>` : '');

    show.forEach((f, i) => {
      const phId = `ss-${assetId}-${i}`;
      Drive.getImageBlobUrl(f.id).then(url => {
        const ph = document.getElementById(phId);
        if (!ph) return;
        if (!url) { ph.classList.remove('loading'); return; }

        const img = document.createElement('img');
        img.alt = '';
        img.onload = () => {
          const current = document.getElementById(phId);
          if (current) {
            current.classList.remove('loading');
            current.appendChild(img);
          }
        };
        img.onerror = () => {
          const current = document.getElementById(phId);
          if (current) current.classList.remove('loading');
        };
        img.src = url;
      }).catch(() => {
        const ph = document.getElementById(phId);
        if (ph) ph.classList.remove('loading');
      });
    });
  }

  // ── Form ──────────────────────────────────────────────
  function buildForm(existing = null) {
    const versions = existing?.versions?.length
      ? existing.versions
      : [{ version: '', notes: '' }];

    return `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Asset Name *</label>
          <input class="input" id="af-name" value="${esc(existing?.name || '')}" ${existing ? 'readonly' : ''} style="width:100%">
        </div>
        <div class="form-group">
          <label class="form-label">Publisher</label>
          <input class="input" id="af-publisher" value="${esc(existing?.publisher || '')}" style="width:100%">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="input" id="af-desc" style="width:100%">${esc(existing?.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tags <span class="text-tertiary text-xs" style="font-weight:400">comma separated</span></label>
          <input class="input" id="af-tags" value="${esc((existing?.tags || []).join(', '))}" style="width:100%">
        </div>
        <div class="form-group">
          <label class="form-label">Price USD (0 = free)</label>
          <input class="input" type="number" min="0" id="af-price" value="${existing?.price_usd ?? ''}" style="width:100%">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Asset Store URL</label>
        <input class="input" type="url" id="af-url" value="${esc(existing?.asset_store_url || '')}" style="width:100%">
      </div>
      <div class="form-group">
        <label class="form-label">Versions</label>
        <div id="versions-list">
          ${versions.map((v, i) => versionEntryHtml(i, v)).join('')}
        </div>
        <button class="btn btn-sm mt-2" type="button" id="add-ver-btn">+ Add Version</button>
      </div>`;
  }

  function versionEntryHtml(i, v = {}) {
    return `
      <div class="version-entry" data-vi="${i}">
        <div class="form-row" style="margin-bottom:8px">
          <div class="form-group" style="margin-bottom:0">
            <input class="input ver-version" placeholder="e.g. 1.2.0" value="${esc(v.version || '')}" style="width:100%">
          </div>
          <div class="form-group" style="margin-bottom:0;display:flex;gap:6px;align-items:center">
            <input class="input ver-notes" placeholder="Release notes (optional)" value="${esc(v.notes || '')}" style="flex:1">
            <button class="icon-btn icon-btn-danger" data-remove-ver="${i}" style="flex-shrink:0">
              <i class="ti ti-x"></i>
            </button>
          </div>
        </div>
      </div>`;
  }

  function attachVersionButtons() {
    let count = document.querySelectorAll('.version-entry').length;
    document.getElementById('add-ver-btn').addEventListener('click', () => {
      const list = document.getElementById('versions-list');
      const div = document.createElement('div');
      div.innerHTML = versionEntryHtml(count++);
      list.appendChild(div.firstElementChild);
      attachRemoveVerButtons();
    });
    attachRemoveVerButtons();
  }

  function attachRemoveVerButtons() {
    document.querySelectorAll('[data-remove-ver]').forEach(btn => {
      btn.onclick = () => btn.closest('.version-entry').remove();
    });
  }

  function collectFormData() {
    const priceVal = document.getElementById('af-price').value;
    return {
      name:            document.getElementById('af-name').value.trim(),
      publisher:       document.getElementById('af-publisher').value.trim(),
      description:     document.getElementById('af-desc').value.trim(),
      tags:            document.getElementById('af-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      price_usd:       priceVal !== '' ? Number(priceVal) : null,
      asset_store_url: document.getElementById('af-url').value.trim(),
      versions:        [...document.querySelectorAll('.version-entry')]
                         .map(el => ({
                           version: el.querySelector('.ver-version').value.trim(),
                           notes:   el.querySelector('.ver-notes').value.trim()
                         }))
                         .filter(v => v.version)
    };
  }

  // ── Add ───────────────────────────────────────────────
  function showAddModal() {
    App.showModal('Add asset', buildForm(), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Create folder & save', cls: 'btn-primary', action: submitAdd }
    ], true);
    attachVersionButtons();
  }

  async function submitAdd() {
    const data = collectFormData();
    if (!data.name) { App.toast('Asset name required', 'error'); return; }

    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
      const folder = await Drive.createFolder(data.name, CONFIG.DRIVE_ROOT_FOLDER_ID);

      const asset = {
        id:              genId(),
        name:            data.name,
        publisher:       data.publisher,
        description:     data.description,
        tags:            data.tags,
        price_usd:       data.price_usd,
        asset_store_url: data.asset_store_url,
        drive_folder_id: folder.id,
        versions:        data.versions
      };

      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      if (!index.assets) index.assets = [];
      index.assets.push(asset);
      await GitHub.writeGist(CONFIG.GIST_INDEX_ID, 'index.json', index);

      App.closeModal();

      const driveUrl = `https://drive.google.com/drive/folders/${folder.id}`;
      App.showModal(`"${esc(data.name)}" created`, `
        <div class="empty-state" style="padding:8px 0 16px">
          <i class="ti ti-circle-check" style="font-size:28px;color:var(--green-text)"></i>
          <p>Drive folder created. Upload <strong>cover.png</strong>, screenshots, and
             <strong>.unitypackage</strong> files directly in Drive.</p>
          <a href="${esc(driveUrl)}" target="_blank" class="btn btn-primary" style="margin-top:12px">
            <i class="ti ti-folder-open"></i> Open Drive Folder
          </a>
        </div>
      `, [{ label: 'Done', cls: 'btn-secondary', action: () => App.closeModal() }]);

      await loadAssets();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = 'Create folder & save';
    }
  }

  // ── Edit ──────────────────────────────────────────────
  function showEditModal(asset) {
    App.showModal('Edit asset', buildForm(asset), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Save', cls: 'btn-primary', action: () => submitEdit(asset) }
    ], true);
    attachVersionButtons();
  }

  async function submitEdit(asset) {
    const data = collectFormData();
    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      const updated = {
        id:              asset.id,
        name:            asset.name,
        drive_folder_id: asset.drive_folder_id,
        publisher:       data.publisher,
        description:     data.description,
        tags:            data.tags,
        price_usd:       data.price_usd,
        asset_store_url: data.asset_store_url,
        versions:        data.versions
      };

      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      const idx = index.assets.findIndex(a => a.id === asset.id);
      if (idx === -1) throw new Error('Asset not found in index');
      index.assets[idx] = updated;
      await GitHub.writeGist(CONFIG.GIST_INDEX_ID, 'index.json', index);

      App.closeModal();
      App.toast(`"${updated.name}" saved`, 'success');
      await loadAssets();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  return { render };
})();
