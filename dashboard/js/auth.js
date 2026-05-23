const Auth = (() => {
  const SESSION_KEY = 'tcc_session';
  const TTL = 24 * 60 * 60 * 1000; // 24 h

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
