const AssetsPage = (() => {
  let _assets = [];
  let _filter = '';
  let _tagFilter = '';
  let _sort = 'name-asc';
  let _view = 'list';
  let _scanStatus = {};
  let _pendingCdn = { cover: null, screenshots: [] };

  function fixUrl(u) { return u && u.startsWith('//') ? 'https:' + u : u; }

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
        <div style="display:flex;gap:2px">
          <button class="icon-btn${_view==='list'?' active':''}" id="view-list" title="List view"><i class="ti ti-list"></i></button>
          <button class="icon-btn${_view==='grid'?' active':''}" id="view-grid" title="Grid view"><i class="ti ti-layout-grid"></i></button>
        </div>
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
      sortedAssets().forEach(a => scanAsset(a));
    });
    document.getElementById('asset-sort').addEventListener('change', e => {
      _sort = e.target.value;
      renderList();
      sortedAssets().forEach(a => scanAsset(a));
    });
    document.getElementById('view-list').addEventListener('click', () => {
      _view = 'list'; renderList(); sortedAssets().forEach(a => scanAsset(a));
      document.getElementById('view-list')?.classList.add('active');
      document.getElementById('view-grid')?.classList.remove('active');
    });
    document.getElementById('view-grid').addEventListener('click', () => {
      _view = 'grid'; renderList(); sortedAssets().forEach(a => scanAsset(a));
      document.getElementById('view-grid')?.classList.add('active');
      document.getElementById('view-list')?.classList.remove('active');
    });

    await loadAssets();
  }

  async function loadAssets() {
    try {
      const index = await GitHub.readGist(CONFIG.GIST_INDEX_ID, 'index.json');
      _assets = index.assets || [];
      renderTagFilters();
      renderList();
      _assets.forEach(a => scanAsset(a));
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
        sortedAssets().forEach(a => scanAsset(a));
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

    const html = _view === 'grid'
      ? `<div class="asset-grid" id="asset-list">${list.map(cardHtml).join('')}</div>`
      : `<div class="asset-list" id="asset-list">${list.map(rowHtml).join('')}</div>`;
    wrap.innerHTML = html;
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

  function cardHtml(a) {
    const tags = (a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const hasStore  = !!a.asset_store_url;
    const hasFolder = !!a.drive_folder_id;
    const color = thumbColor(a.name);

    return `
      <div class="asset-card" data-id="${esc(a.id)}">
        <div class="asset-card-thumb thumb-${color}" id="thumb-${esc(a.id)}">${esc(initials(a.name))}</div>
        <div class="asset-card-body">
          <div class="asset-card-name">${esc(a.name)}</div>
          <div class="asset-card-pub">${esc(a.publisher || '')}</div>
          <div class="asset-card-tags">${tags}</div>
        </div>
        <div class="asset-card-strip" id="strip-${esc(a.id)}">
          <div class="img-preview loading"></div>
        </div>
        <div class="asset-card-footer">
          <span class="badge badge-missing" id="status-${esc(a.id)}">
            <i class="ti ti-loader"></i> Scanning
          </span>
          <div class="actions">
            <button class="icon-btn${!hasStore ? ' dim' : ''}" data-action="store" title="Asset Store">
              <i class="ti ti-external-link"></i>
            </button>
            <button class="icon-btn${!hasFolder ? ' dim' : ''}" data-action="drive" title="Drive folder">
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

  // ── Scanning & image fallback chain ───────────────────
  async function scanAsset(asset, { forceRefresh = false } = {}) {
    if (!asset.drive_folder_id) {
      // No Drive folder — use CDN data if available
      if (asset.cdn_cover) loadUrlCover(asset.id, asset.cdn_cover);
      else clearThumb(asset.id);

      if (asset.cdn_screenshots?.length) updateStripUrls(asset.id, asset.cdn_screenshots);
      else clearStrip(asset.id);

      const statusEl = document.getElementById(`status-${asset.id}`);
      if (statusEl) {
        statusEl.className = 'badge badge-missing';
        statusEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No Drive folder`;
      }
      return;
    }

    try {
      const files = await Drive.listFilesInFolder(asset.drive_folder_id, { forceRefresh });
      const cover       = Drive.findCover(files);
      const screenshots = Drive.findScreenshots(files);
      const packages    = Drive.findPackages(files);

      // Cover: Drive → CDN fallback
      if (cover) {
        loadDriveCover(asset.id, cover.id);
      } else if (asset.cdn_cover) {
        loadUrlCover(asset.id, asset.cdn_cover);
      }

      // Screenshots: Drive → CDN fallback
      if (screenshots.length) {
        updateStrip(asset.id, screenshots);
      } else if (asset.cdn_screenshots?.length) {
        updateStripUrls(asset.id, asset.cdn_screenshots);
      } else {
        clearStrip(asset.id);
      }

      const status = packages.length ? 'ready' : 'missing';
      _scanStatus[asset.id] = status;
      const statusEl = document.getElementById(`status-${asset.id}`);
      if (statusEl) {
        statusEl.className = `badge badge-${status}`;
        statusEl.innerHTML = status === 'ready'
          ? `<i class="ti ti-circle-check"></i> Ready`
          : `<i class="ti ti-alert-triangle"></i> Missing package`;
      }
    } catch {
      // Drive error — fall back to CDN
      if (asset.cdn_cover) loadUrlCover(asset.id, asset.cdn_cover);
      if (asset.cdn_screenshots?.length) updateStripUrls(asset.id, asset.cdn_screenshots);
      else clearStrip(asset.id);

      const statusEl = document.getElementById(`status-${asset.id}`);
      if (statusEl) {
        statusEl.className = 'badge badge-error';
        statusEl.innerHTML = `<i class="ti ti-x"></i> Scan failed`;
      }
    }
  }

  function loadDriveCover(assetId, fileId) {
    Drive.getImageBlobUrl(fileId).then(url => {
      if (!url) return;
      const el = document.getElementById(`thumb-${assetId}`);
      if (!el) return;
      const img = document.createElement('img');
      img.onload = () => {
        const current = document.getElementById(`thumb-${assetId}`);
        if (current) { current.innerHTML = ''; current.appendChild(img); }
      };
      img.src = url;
    });
  }

  function loadUrlCover(assetId, url) {
    const el = document.getElementById(`thumb-${assetId}`);
    if (!el || !url) return;
    const img = document.createElement('img');
    img.onload = () => {
      const current = document.getElementById(`thumb-${assetId}`);
      if (current) { current.innerHTML = ''; current.appendChild(img); }
    };
    img.src = fixUrl(url);
  }

  function clearThumb(assetId) {
    // Leave initials — nothing to do, row already renders initials by default
  }

  function updateStrip(assetId, screenshots) {
    const el = document.getElementById(`strip-${assetId}`);
    if (!el) return;
    const show  = screenshots.slice(0, 2);
    const extra = screenshots.length - 2;
    el.innerHTML = show.map((_, i) =>
      `<div class="img-preview loading" id="ss-${assetId}-${i}"></div>`
    ).join('') + (extra > 0 ? `<div class="img-more">+${extra}</div>` : '');
    show.forEach((f, i) => {
      Drive.getImageBlobUrl(f.id).then(url => {
        loadIntoPreview(`ss-${assetId}-${i}`, url);
      }).catch(() => {
        const ph = document.getElementById(`ss-${assetId}-${i}`);
        if (ph) ph.classList.remove('loading');
      });
    });
  }

  function updateStripUrls(assetId, urls) {
    const el = document.getElementById(`strip-${assetId}`);
    if (!el) return;
    const show  = urls.slice(0, 2);
    const extra = urls.length - 2;
    el.innerHTML = show.map((_, i) =>
      `<div class="img-preview loading" id="ss-${assetId}-${i}"></div>`
    ).join('') + (extra > 0 ? `<div class="img-more">+${extra}</div>` : '');
    show.forEach((url, i) => loadIntoPreview(`ss-${assetId}-${i}`, fixUrl(url)));
  }

  function clearStrip(assetId) {
    const el = document.getElementById(`strip-${assetId}`);
    if (el) el.innerHTML = `<div class="img-none"><i class="ti ti-photo-off"></i></div>`;
  }

  function loadIntoPreview(phId, url) {
    const ph = document.getElementById(phId);
    if (!ph) return;
    if (!url) { ph.classList.remove('loading'); return; }
    const img = document.createElement('img');
    img.alt = '';
    img.onload = () => {
      const current = document.getElementById(phId);
      if (current) { current.classList.remove('loading'); current.appendChild(img); }
    };
    img.onerror = () => {
      const current = document.getElementById(phId);
      if (current) current.classList.remove('loading');
    };
    img.src = url;
  }

  // ── Auto-fill ─────────────────────────────────────────

  // Matches Unity Asset Store CDN image URLs in raw HTML text
  const UNITY_CDN_RE = /https?:\/\/[^\s"'<>\\]*(?:cdn\.assetstore\.unity3d\.com|assetstorev\d[^\s"'<>\\]*\.unity3d\.com|d2ujflorbtfzji\.cloudfront\.net)[^\s"'<>\\]*/g;

  function extractCdnUrls(rawHtml) {
    const seen = new Set();
    const urls = [];
    for (const m of rawHtml.matchAll(UNITY_CDN_RE)) {
      // Unescape JSON forward-slashes, strip trailing junk chars
      const u = m[0].replace(/\\\/|\\u[0-9a-f]{4}/gi, c =>
        c.startsWith('\\u') ? String.fromCharCode(parseInt(c.slice(2), 16)) : '/'
      ).replace(/[^\w\-./:%?=&]+$/, '');
      if (!seen.has(u) && /\.(png|jpe?g|webp)(\?|$)/i.test(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
    return urls;
  }

  async function fetchViaProxy(targetUrl) {
    const encoded = encodeURIComponent(targetUrl);
    const TIMEOUT = 10000;

    const proxies = [
      {
        url: `https://corsproxy.io/?${encoded}`,
        extract: async r => r.text()
      },
      {
        url: `https://api.allorigins.win/get?url=${encoded}`,
        extract: async r => { const d = await r.json(); return d.contents || ''; }
      },
      {
        url: `https://api.codetabs.com/v1/proxy?quest=${encoded}`,
        extract: async r => r.text()
      }
    ];

    for (const proxy of proxies) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        const res = await fetch(proxy.url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await proxy.extract(res);
        if (html && html.length > 500) {
          console.log(`[auto-fill] ${proxy.url.split('?')[0]} succeeded (${html.length} bytes)`);
          return html;
        }
        throw new Error('Empty response');
      } catch (e) {
        console.warn(`[auto-fill] Proxy failed (${proxy.url.split('?')[0]}):`, e.message);
      }
    }
    return null;
  }

  async function autoFillFromAssetStore() {
    const urlInput = document.getElementById('af-url');
    const url = urlInput?.value.trim();
    if (!url) { App.toast('Enter Asset Store URL first', 'warning'); return; }

    const btn = document.getElementById('af-autofill');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> Fetching…';

    try {
      const contents = await fetchViaProxy(url);
      if (!contents) {
        App.toast('Could not fetch. Fill in manually.', 'warning');
        return;
      }
      const doc = new DOMParser().parseFromString(contents, 'text/html');
      let name, publisher, description, price, coverUrl, screenshotUrls = [];

      // 1. Try __NEXT_DATA__ (Unity Asset Store is Next.js — best source)
      try {
        const nd = JSON.parse(doc.querySelector('#__NEXT_DATA__')?.textContent || 'null');
        console.log('[auto-fill] __NEXT_DATA__ keys:', nd ? Object.keys(nd?.props?.pageProps ?? {}) : 'not found');
        const pp  = nd?.props?.pageProps;
        // Try every known property path Unity has used
        const pkg = pp?.package ?? pp?.packageDetails ?? pp?.assetDetails
                  ?? pp?.initialProps?.package ?? pp?.dehydratedState?.queries?.[0]?.state?.data;
        if (pkg) {
          name        = pkg.title ?? pkg.name;
          publisher   = pkg.publisher?.name ?? pkg.publisherLabel ?? pkg.publisher;
          description = pkg.description ?? pkg.keyFeatures;
          price       = pkg.salePrice ?? pkg.price ?? pkg.displayPrice;
          const imgs  = pkg.images ?? pkg.screenshots ?? pkg.mainImages ?? [];
          coverUrl    = pkg.mainImage?.url ?? pkg.keyImage?.url ?? imgs[0]?.url ?? imgs[0]?.imageUrl;
          screenshotUrls = imgs
            .slice(coverUrl ? 0 : 1)
            .map(i => i.url ?? i.imageUrl ?? i.src)
            .filter(u => u && u !== coverUrl);
        }
      } catch (e) { console.warn('[auto-fill] __NEXT_DATA__ parse error:', e.message); }

      // 2. Try JSON-LD
      if (!name) {
        try {
          const ld    = JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent || 'null');
          const items = Array.isArray(ld) ? ld : (ld?.['@graph'] ?? [ld]);
          const prod  = items.find(i => i?.['@type'] === 'Product') ?? items[0];
          if (prod) {
            name        = prod.name;
            publisher   = prod.brand?.name;
            description = prod.description;
            price       = prod.offers?.price ?? prod.offers?.[0]?.price;
            if (prod.image) {
              const imgs = Array.isArray(prod.image) ? prod.image : [prod.image];
              coverUrl       = coverUrl ?? imgs[0];
              screenshotUrls = screenshotUrls.length ? screenshotUrls : imgs.slice(1);
            }
          }
        } catch {}
      }

      // 3. og: meta tag fallbacks
      name        = name        || doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
      description = description || doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
                                || doc.querySelector('meta[name="description"]')?.getAttribute('content');
      coverUrl    = coverUrl    || doc.querySelector('meta[property="og:image"]')?.getAttribute('content');

      // 4. CDN URL regex scan of raw HTML — catches gallery images missed by JS-rendering
      const cdnUrls = extractCdnUrls(contents);
      console.log(`[auto-fill] CDN URLs found via regex: ${cdnUrls.length}`, cdnUrls);

      if (cdnUrls.length) {
        if (!coverUrl) {
          // Prefer key-image URL as cover
          coverUrl = cdnUrls.find(u => /key[-_]image/i.test(u)) ?? cdnUrls[0];
        }
        if (!screenshotUrls.length) {
          screenshotUrls = cdnUrls.filter(u => u !== coverUrl);
        }
      }

      // Fill form fields
      const nameEl = document.getElementById('af-name');
      if (name && nameEl && !nameEl.readOnly) nameEl.value = name;

      const pubEl = document.getElementById('af-publisher');
      if (publisher && pubEl) pubEl.value = publisher;

      const descEl = document.getElementById('af-desc');
      if (description && descEl) descEl.value = description;

      const priceEl = document.getElementById('af-price');
      if (price != null && priceEl) {
        priceEl.value = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
      }

      // Store CDN data
      _pendingCdn = { cover: fixUrl(coverUrl) || null, screenshots: screenshotUrls.map(fixUrl) };
      updateCdnIndicator();

      const filled = [name, publisher, description, price].filter(Boolean).length;
      App.toast(
        filled ? `Auto-filled ${filled} field${filled !== 1 ? 's' : ''}` : 'Could not extract data — check URL',
        filled ? 'success' : 'warning'
      );
    } catch (err) {
      App.toast(`Auto-fill failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Auto-fill';
    }
  }

  function updateCdnIndicator() {
    const el = document.getElementById('af-cdn-status');
    if (!el) return;
    const parts = [];
    if (_pendingCdn.cover) parts.push('cover');
    if (_pendingCdn.screenshots?.length) parts.push(`${_pendingCdn.screenshots.length} screenshot${_pendingCdn.screenshots.length !== 1 ? 's' : ''}`);
    if (parts.length) {
      el.textContent = `CDN images stored: ${parts.join(', ')}`;
      el.style.color = 'var(--green-text)';
    } else {
      el.textContent = '';
    }
  }

  function attachAutofill() {
    document.getElementById('af-autofill')?.addEventListener('click', autoFillFromAssetStore);
  }

  // ── Form ──────────────────────────────────────────────
  function buildForm(existing = null) {
    const versions = existing?.versions?.length
      ? existing.versions
      : [{ version: '', notes: '' }];

    const cdnParts = [];
    if (_pendingCdn.cover) cdnParts.push('cover');
    if (_pendingCdn.screenshots?.length) cdnParts.push(`${_pendingCdn.screenshots.length} screenshot${_pendingCdn.screenshots.length !== 1 ? 's' : ''}`);
    const cdnInitText = cdnParts.length ? `CDN images stored: ${cdnParts.join(', ')}` : '';

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
        <div style="display:flex;gap:6px">
          <input class="input" type="url" id="af-url" value="${esc(existing?.asset_store_url || '')}" style="flex:1">
          <button class="btn btn-sm" type="button" id="af-autofill">Auto-fill</button>
        </div>
        <div id="af-cdn-status" class="form-hint" style="color:var(--green-text)">${cdnInitText}</div>
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
    _pendingCdn = { cover: null, screenshots: [] };
    App.showModal('Add asset', buildForm(), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Create folder & save', cls: 'btn-primary', action: submitAdd }
    ], true);
    attachVersionButtons();
    attachAutofill();
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
        versions:        data.versions,
        ..._pendingCdn.cover        && { cdn_cover:       _pendingCdn.cover },
        ..._pendingCdn.screenshots?.length && { cdn_screenshots: _pendingCdn.screenshots }
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
    _pendingCdn = {
      cover:       asset.cdn_cover       || null,
      screenshots: asset.cdn_screenshots || []
    };
    App.showModal('Edit asset', buildForm(asset), [
      { label: 'Cancel', cls: 'btn-secondary', action: () => App.closeModal() },
      { label: 'Save', cls: 'btn-primary', action: () => submitEdit(asset) }
    ], true);
    attachVersionButtons();
    attachAutofill();
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
        versions:        data.versions,
        ..._pendingCdn.cover        && { cdn_cover:       _pendingCdn.cover },
        ..._pendingCdn.screenshots?.length && { cdn_screenshots: _pendingCdn.screenshots }
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
