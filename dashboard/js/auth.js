async function hashPassword(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = enc.encode('trifecta-static-salt');
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function verifyPassword(password, hash) {
  return await hashPassword(password) === hash;
}

const Auth = (() => {
  const SESSION_KEY = 'tcc_session';
  const TTL = 24 * 60 * 60 * 1000;

  return {
    isLoggedIn() {
      try {
        const s = localStorage.getItem(SESSION_KEY);
        if (!s) return false;
        return Date.now() < JSON.parse(s).expiry;
      } catch { return false; }
    },

    login(password) {
      if (password !== CONFIG.ADMIN_PASSWORD) return false;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ expiry: Date.now() + TTL }));
      return true;
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
    }
  };
})();
