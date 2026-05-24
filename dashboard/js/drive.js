const Drive = (() => {
  let _token = null;
  let _tokenExpiry = 0;
  let _folderCache = {}; // { folderId: { files, ts } }
  let _blobCache   = {}; // { fileId: objectUrl }
  const CACHE_TTL = 5 * 60 * 1000;

  function b64url(str) {
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function b64urlBytes(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async function importPrivateKey(pem) {
    const clean = pem
      .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
      .replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----/g, '')
      .replace(/\s/g, '');
    const der = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'pkcs8', der.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
  }

  async function getToken() {
    if (_token && Date.now() < _tokenExpiry - 60000) return _token;

    const sa = CONFIG.SERVICE_ACCOUNT;
    const now = Math.floor(Date.now() / 1000);

    const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss:   sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive',
      aud:   'https://oauth2.googleapis.com/token',
      exp:   now + 3600,
      iat:   now
    }));

    const signingInput = `${header}.${payload}`;
    const key = await importPrivateKey(sa.private_key);
    const sigBytes = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(signingInput)
    );
    const jwt = `${signingInput}.${b64urlBytes(new Uint8Array(sigBytes))}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    if (!tokenRes.ok) throw new Error(`Drive auth failed: ${tokenRes.status}`);
    const td = await tokenRes.json();
    _token = td.access_token;
    _tokenExpiry = Date.now() + td.expires_in * 1000;
    return _token;
  }

  async function authHeaders() {
    return { Authorization: `Bearer ${await getToken()}` };
  }

  return {
    async listFilesInFolder(folderId, { forceRefresh = false } = {}) {
      const cached = _folderCache[folderId];
      if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.files;
      }
      const h = await authHeaders();
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=200`,
        { headers: h }
      );
      if (!res.ok) throw new Error(`List folder failed: ${res.status}`);
      const d = await res.json();
      const files = d.files || [];
      _folderCache[folderId] = { files, ts: Date.now() };
      return files;
    },

    invalidateCache(folderId) {
      if (folderId) delete _folderCache[folderId];
      else _folderCache = {};
    },

    findCover(files) {
      return files.find(f => /^cover\.(png|jpe?g)$/i.test(f.name)) || null;
    },

    findScreenshots(files) {
      return files.filter(f =>
        !/^cover\.(png|jpe?g)$/i.test(f.name) &&
        /\.(png|jpe?g|gif|webp)$/i.test(f.name)
      );
    },

    findPackages(files) {
      return files.filter(f => /\.unitypackage$/i.test(f.name));
    },

    async getImageBlobUrl(fileId) {
      if (_blobCache[fileId]) return _blobCache[fileId];
      const h = await authHeaders();
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: h }
      );
      if (!res.ok) return null;
      const url = URL.createObjectURL(await res.blob());
      _blobCache[fileId] = url;
      return url;
    },

    async getFileDownloadUrl(fileId) {
      const token = await getToken();
      return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${encodeURIComponent(token)}`;
    },

    async trashFolder(folderId) {
      const h = await authHeaders();
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        { method: 'DELETE', headers: h }
      );
      if (!res.ok && res.status !== 204) throw new Error(`Drive delete failed: ${res.status}`);
    },

    async createFolder(name, parentId) {
      const h = await authHeaders();
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
      });
      if (!res.ok) throw new Error(`Create folder failed: ${res.status}`);
      return res.json();
    }
  };
})();
