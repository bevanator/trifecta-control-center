const AssetsPage = (() => {
  let _assets = [];
  let _filter = '';
  let _tagFilter = '';

  async function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Assets</div>
            <div class="page-subtitle">Unity packages hosted on Google Drive</div>
          </div>
          <button class="btn btn-primary" id="add-asset-btn">+ Add Asset</button>
        </div>
        <div class="asset-controls">
          <input class="form-input search-input" id="asset-search" placeholder="Search assets…" value="${_filter}">
          <div class="tag-filters" id="tag-filters"></div>
        </div>
        <div id="asset-grid-wrap">
          <div class="loading">Loading assets…</div>
        </div>
      </div>`;

    document.getElementById('add-asset-btn').addEventListener('click', showAddModal);
    document.getElementById('asset-search').addEventListener('input', e => {
      _filter = e.target.value.toLowerCase();
      renderGrid();
    });

    await loadAssets();
  }

  async function loadAssets() {
    try {
      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      const entries = index.assets || [];

      _assets = await Promise.all(entries.map(async e => {
        try {
          const info = await Drive.readJsonFile(e.info_file_id);
          return { name: e.name, info_file_id: e.info_file_id, info };
        } catch {
          return { name: e.name, info_file_id: e.info_file_id, info: null };
        }
      }));

      renderTagFilters();
      renderGrid();
    } catch (err) {
      document.getElementById('asset-grid-wrap').innerHTML =
        `<div class="empty-state"><p class="text-danger">Failed to load: ${err.message}</p></div>`;
    }
  }

  function allTags() {
    const tags = new Set();
    _assets.forEach(a => (a.info?.tags || []).forEach(t => tags.add(t)));
    return [...tags].sort();
  }

  function renderTagFilters() {
    const wrap = document.getElementById('tag-filters');
    if (!wrap) return;
    wrap.innerHTML = allTags().map(t =>
      `<span class="tag-filter${_tagFilter === t ? ' active' : ''}" data-tag="${t}">${t}</span>`
    ).join('');
    wrap.querySelectorAll('.tag-filter').forEach(el => {
      el.addEventListener('click', () => {
        _tagFilter = _tagFilter === el.dataset.tag ? '' : el.dataset.tag;
        renderTagFilters();
        renderGrid();
      });
    });
  }

  function filteredAssets() {
    return _assets.filter(a => {
      const info = a.info || {};
      if (_filter) {
        const hay = `${a.name} ${info.publisher || ''} ${(info.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(_filter)) return false;
      }
      if (_tagFilter && !(info.tags || []).includes(_tagFilter)) return false;
      return true;
    });
  }

  function renderGrid() {
    const wrap = document.getElementById('asset-grid-wrap');
    if (!wrap) return;
    const list = filteredAssets();
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⬡</div><p>No assets found</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="asset-grid" id="asset-grid"></div>`;
    const grid = document.getElementById('asset-grid');
    list.forEach(a => {
      const card = document.createElement('div');
      card.className = 'asset-card';
      const info = a.info || {};
      const tags = (info.tags || []).slice(0, 3).map(t =>
        `<span class="badge badge-tag">${t}</span>`).join('');
      const price = info.price_usd === 0 ? 'Free' : info.price_usd ? `$${info.price_usd}` : '';
      card.innerHTML = `
        <div class="asset-cover" id="cover-${sanitize(a.name)}">
          <span>⬡</span>
        </div>
        <div class="asset-info">
          <div class="asset-name">${esc(a.name)}</div>
          <div class="asset-publisher">${esc(info.publisher || '')}</div>
          ${price ? `<div class="asset-price">${esc(price)}</div>` : ''}
          <div class="asset-tags">${tags}</div>
        </div>`;
      card.addEventListener('click', () => showDetail(a));
      grid.appendChild(card);

      if (info.cover) {
        Drive.getImageBlobUrl(info.cover).then(url => {
          if (!url) return;
          const el = document.getElementById(`cover-${sanitize(a.name)}`);
          if (el) el.innerHTML = `<img src="${url}" alt="${esc(a.name)}">`;
        });
      }
    });
  }

  async function showDetail(asset) {
    const info = asset.info || {};

    const screenshotsHtml = (info.screenshots || []).map((_, i) =>
      `<img class="screenshot-thumb" id="ss-${i}" src="" alt="screenshot">`
    ).join('');

    const tagsHtml = (info.tags || []).map(t => `<span class="badge badge-tag">${esc(t)}</span>`).join(' ');

    App.showModal(`${esc(info.name || asset.name)}`, `
      <img class="asset-detail-cover" id="detail-cover" src="" alt="cover"
           style="background:var(--surface-3);display:block">
      ${info.screenshots?.length ? `<div class="screenshots-row">${screenshotsHtml}</div>` : ''}
      <div class="asset-meta">
        <div class="meta-item"><label>Publisher</label><span>${esc(info.publisher || '—')}</span></div>
        <div class="meta-item"><label>Price</label><span>${info.price_usd === 0 ? 'Free' : info.price_usd ? '$' + info.price_usd : '—'}</span></div>
        ${info.asset_store_url ? `<div class="meta-item"><label>Asset Store</label><span><a href="${esc(info.asset_store_url)}" target="_blank">View ↗</a></span></div>` : ''}
        <div class="meta-item"><label>Tags</label><span>${tagsHtml || '—'}</span></div>
      </div>
      ${info.description ? `<p style="font-size:13px;color:var(--text-muted)">${esc(info.description)}</p>` : ''}
      ${info.packages?.length ? `
        <div>
          <div class="form-label" style="margin-bottom:8px">Packages</div>
          ${info.packages.map(p => `
            <div class="version-row">
              <span class="version-tag">v${esc(p.version)}</span>
              <span class="version-notes">${esc(p.notes || '')}</span>
              <button class="btn btn-sm btn-primary" data-fileid="${esc(p.file_id)}">Download</button>
            </div>`).join('')}
        </div>` : ''}
    `, [
      { label: 'Edit', cls: 'btn-secondary', action: () => { App.closeModal(); showEditModal(asset); } },
      { label: 'Close', cls: 'btn-secondary', action: () => App.closeModal() }
    ]);

    if (info.cover) {
      Drive.getImageBlobUrl(info.cover).then(url => {
        const el = document.getElementById('detail-cover');
        if (el && url) el.src = url;
      });
    }

    (info.screenshots || []).forEach((id, i) => {
      Drive.getImageBlobUrl(id).then(url => {
        const el = document.getElementById(`ss-${i}`);
        if (el && url) el.src = url;
      });
    });

    document.querySelectorAll('[data-fileid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Getting link…';
        try {
          const url = await Drive.getDownloadUrl(btn.dataset.fileid);
          const a = document.createElement('a');
          a.href = url;
          a.download = '';
          a.click();
        } catch (err) {
          App.toast(`Download failed: ${err.message}`, 'error');
        }
        btn.disabled = false;
        btn.textContent = 'Download';
      });
    });
  }

  function buildAssetForm(existing = null) {
    const info = existing?.info || {};
    const packages = info.packages || [{ version: '', file_id: '', notes: '' }];

    return `
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Asset Name *</label>
          <input class="form-input" id="af-name" value="${esc(info.name || existing?.name || '')}" ${existing ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">Publisher</label>
          <input class="form-input" id="af-publisher" value="${esc(info.publisher || '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="af-desc">${esc(info.description || '')}</textarea>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Tags (comma separated)</label>
          <input class="form-input" id="af-tags" value="${esc((info.tags || []).join(', '))}">
        </div>
        <div class="form-group">
          <label class="form-label">Price USD (0 = free)</label>
          <input class="form-input" type="number" min="0" id="af-price" value="${info.price_usd ?? ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Asset Store URL</label>
        <input class="form-input" type="url" id="af-url" value="${esc(info.asset_store_url || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Cover Image ${existing ? '(upload to replace)' : ''}</label>
        <input class="form-input" type="file" id="af-cover" accept="image/*">
        ${existing && info.cover ? '<p class="form-hint">Current cover kept if no new file selected.</p>' : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Screenshots ${existing ? '(upload to replace all)' : ''}</label>
        <input class="form-input" type="file" id="af-screenshots" accept="image/*" multiple>
      </div>
      <div class="form-group">
        <label class="form-label">Packages</label>
        <div id="packages-list">
          ${packages.map((p, i) => packageEntryHtml(i, p)).join('')}
        </div>
        <button class="btn btn-secondary btn-sm mt-1" type="button" id="add-pkg-btn">+ Add Version</button>
      </div>`;
  }

  function packageEntryHtml(i, p = {}) {
    return `
      <div class="package-entry" data-pkg="${i}">
        <button class="btn btn-sm btn-danger btn-icon remove-btn" data-remove="${i}" title="Remove">✕</button>
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Version</label>
            <input class="form-input pkg-version" value="${esc(p.version || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">.unitypackage file</label>
            <input class="form-input pkg-file" type="file" accept=".unitypackage">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Release Notes</label>
          <input class="form-input pkg-notes" value="${esc(p.notes || '')}">
        </div>
        ${p.file_id ? `<p class="form-hint">Existing file_id: ${esc(p.file_id)} — upload new file to replace.</p>` : ''}
      </div>`;
  }

  function attachPkgButtons() {
    let pkgCount = document.querySelectorAll('.package-entry').length;
    document.getElementById('add-pkg-btn').addEventListener('click', () => {
      const list = document.getElementById('packages-list');
      const div = document.createElement('div');
      div.innerHTML = packageEntryHtml(pkgCount++);
      list.appendChild(div.firstElementChild);
      attachRemoveButtons();
    });
    attachRemoveButtons();
  }

  function attachRemoveButtons() {
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => btn.closest('.package-entry').remove();
    });
  }

  function showAddModal() {
    App.showModal('Add Asset', buildAssetForm(), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Upload & Save', cls: 'btn-primary', action: () => submitAsset(null) }
    ], true);
    attachPkgButtons();
  }

  function showEditModal(asset) {
    App.showModal('Edit Asset', buildAssetForm(asset), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Save Changes', cls: 'btn-primary', action: () => submitAsset(asset) }
    ], true);
    attachPkgButtons();
  }

  async function submitAsset(existing) {
    const name = document.getElementById('af-name').value.trim();
    if (!name) { App.toast('Asset name required', 'error'); return; }

    const btn = document.querySelector('.modal-footer .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Uploading…';

    try {
      const rootId = CONFIG.DRIVE_ROOT_FOLDER_ID;
      let assetFolderId, imagesFolderId;
      let existingInfoFileId = existing?.info_file_id;

      if (!existing) {
        const folder = await Drive.createFolder(name, rootId);
        assetFolderId = folder.id;
        const imgFolder = await Drive.createFolder('images', assetFolderId);
        imagesFolderId = imgFolder.id;
      } else {
        const folders = await Drive.listFolder(rootId);
        const af = folders.find(f => f.name === name && f.mimeType === 'application/vnd.google-apps.folder');
        if (!af) throw new Error('Asset folder not found on Drive');
        assetFolderId = af.id;
        const subFolders = await Drive.listFolder(assetFolderId);
        const imgF = subFolders.find(f => f.name === 'images');
        imagesFolderId = imgF?.id;
        if (!imagesFolderId) {
          const imgFolder = await Drive.createFolder('images', assetFolderId);
          imagesFolderId = imgFolder.id;
        }
      }

      const info = existing?.info ? { ...existing.info } : {};

      const coverFile = document.getElementById('af-cover').files[0];
      if (coverFile) {
        btn.textContent = 'Uploading cover…';
        const uploaded = await Drive.uploadFile(coverFile.name, coverFile, imagesFolderId);
        info.cover = uploaded.id;
      }

      const ssFiles = [...document.getElementById('af-screenshots').files];
      if (ssFiles.length) {
        btn.textContent = 'Uploading screenshots…';
        const ssIds = await Promise.all(ssFiles.map(f => Drive.uploadFile(f.name, f, imagesFolderId).then(r => r.id)));
        info.screenshots = ssIds;
      }

      const pkgEntries = [...document.querySelectorAll('.package-entry')];
      btn.textContent = 'Uploading packages…';
      const packages = [];
      for (const entry of pkgEntries) {
        const version = entry.querySelector('.pkg-version').value.trim();
        const notes   = entry.querySelector('.pkg-notes').value.trim();
        const file    = entry.querySelector('.pkg-file').files[0];
        const hint    = entry.querySelector('.form-hint');
        const existingFileId = hint?.textContent.match(/file_id: (\S+)/)?.[1];

        if (!version) continue;
        let fileId = existingFileId || '';
        if (file) {
          const uploaded = await Drive.uploadFile(file.name, file, assetFolderId);
          fileId = uploaded.id;
        }
        packages.push({ version, file_id: fileId, notes });
      }

      info.name        = name;
      info.publisher   = document.getElementById('af-publisher').value.trim();
      info.description = document.getElementById('af-desc').value.trim();
      info.tags        = document.getElementById('af-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      info.asset_store_url = document.getElementById('af-url').value.trim();
      const priceVal = document.getElementById('af-price').value;
      info.price_usd = priceVal !== '' ? Number(priceVal) : null;
      info.packages  = packages;

      btn.textContent = 'Saving metadata…';
      const infoBlob = new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' });

      if (existingInfoFileId) {
        await Drive.updateFile(existingInfoFileId, infoBlob);
      } else {
        const uploaded = await Drive.uploadFile('info.json', infoBlob, assetFolderId);
        existingInfoFileId = uploaded.id;

        const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
        index.assets.push({ name, info_file_id: existingInfoFileId });
        await GitHub.writeGist(CONFIG.GIST_INDEX_ID, 'index.json', index);
      }

      App.closeModal();
      App.toast(`Asset "${name}" saved`, 'success');
      await loadAssets();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = existing ? 'Save Changes' : 'Upload & Save';
    }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function sanitize(s) { return s.replace(/[^a-z0-9]/gi, '_'); }

  return { render };
})();
