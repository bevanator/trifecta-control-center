const Drive = (() => {
  let _token = null;
  let _tokenExpiry = 0;

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
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
  }

  return {
    async readJsonFile(fileId) {
      const h = await authHeaders();
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: h }
      );
      if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
      return res.json();
    },

    async getImageBlobUrl(fileId) {
      const h = await authHeaders();
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: h }
      );
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },

    async getDownloadUrl(fileId) {
      const token = await getToken();
      return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${encodeURIComponent(token)}`;
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
    },

    async uploadFile(name, blob, folderId) {
      const h = await authHeaders();
      const meta = JSON.stringify({ name, parents: [folderId] });
      const form = new FormData();
      form.append('metadata', new Blob([meta], { type: 'application/json' }));
      form.append('file', blob instanceof Blob ? blob : new Blob([blob]));
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        { method: 'POST', headers: h, body: form }
      );
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json();
    },

    async updateFile(fileId, blob) {
      const h = await authHeaders();
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: blob }
      );
      if (!res.ok) throw new Error(`Update file failed: ${res.status}`);
      return res.json();
    },

    async listFolder(folderId) {
      const h = await authHeaders();
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=200`,
        { headers: h }
      );
      if (!res.ok) throw new Error(`List folder failed: ${res.status}`);
      const d = await res.json();
      return d.files || [];
    }
  };
})();
