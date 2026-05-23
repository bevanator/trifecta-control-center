const AnalyticsAPI = (() => {
  const BASE = 'https://rest.gameanalytics.com/v2';

  async function hmacSign(message, secretKey) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  async function request(gameKey, secretKey, path, body = null) {
    const bodyStr = body ? JSON.stringify(body) : '';
    const sig = await hmacSign(bodyStr, secretKey);

    const res = await fetch(`${BASE}/${gameKey}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': `HMAC-SHA256 ${sig}`,
        'Content-Type':  'application/json'
      },
      body: bodyStr || undefined
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      throw new Error(`GA API ${res.status}: ${err}`);
    }
    return res.json();
  }

  return {
    async getMetrics(gameKey, secretKey) {
      const now = new Date();
      const d30ago = new Date(now - 30 * 86400000);
      const body = {
        start_ts:   Math.floor(d30ago / 1000),
        end_ts:     Math.floor(now / 1000),
        dimensions: ['day'],
        metrics:    ['dau', 'mau', 'sessions', 'session_length']
      };
      return request(gameKey, secretKey, '/metrics', body);
    },

    async getRetention(gameKey, secretKey) {
      const now = new Date();
      const d30ago = new Date(now - 30 * 86400000);
      const body = {
        start_ts:   Math.floor(d30ago / 1000),
        end_ts:     Math.floor(now / 1000),
        dimensions: ['retention_day']
      };
      return request(gameKey, secretKey, '/retention', body);
    }
  };
})();
