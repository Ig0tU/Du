(() => {
  if (typeof window.fetch !== 'function') {
    return;
  }

  let cachedToken = window.__TANDEM_TOKEN__ || '';
  let tokenPromise = null;

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadTokenWithRetry() {
    if (cachedToken) {
      return cachedToken;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const token = await window.tandem?.getApiToken?.();
        if (typeof token === 'string' && token.trim()) {
          cachedToken = token.trim();
          window.__TANDEM_TOKEN__ = cachedToken;
          return cachedToken;
        }
      } catch {
        // IPC handler may not be ready during the earliest startup phase.
      }

      await sleep(100);
    }

    return '';
  }

  async function getToken() {
    if (cachedToken) {
      return cachedToken;
    }

    if (!tokenPromise) {
      tokenPromise = loadTokenWithRetry().finally(() => {
        tokenPromise = null;
      });
    }

    return tokenPromise;
  }

  const isElectron = window.location.protocol === 'file:' || window.location.origin === 'null';
  window.TANDEM_API_BASE = isElectron ? 'http://localhost:8765' : '';

  function isLocalTandemApiUrl(input) {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url;

    if (!rawUrl) {
      return false;
    }

    // Relative URLs are always local
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
      return true;
    }

    try {
      const url = new URL(rawUrl, window.location.href);
      const isElectronLocal = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '8765';
      const isVercelLocal = url.origin === window.location.origin && !isElectron;
      return isElectronLocal || isVercelLocal;
    } catch {
      return false;
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let target = input;

    if (isLocalTandemApiUrl(input)) {
      const rawUrl = typeof input === 'string' ? input : input.url;
      if (isElectron && rawUrl.startsWith('/')) {
        // Redirect relative calls to localhost in Electron
        const newUrl = window.TANDEM_API_BASE + rawUrl;
        if (input instanceof Request) {
          target = new Request(newUrl, input);
        } else {
          target = newUrl;
        }
      }
    } else {
      return originalFetch(input, init);
    }

    const token = await getToken();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const auth = headers.get('Authorization')?.trim();

    if (token && (!auth || /^Bearer$/i.test(auth))) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (target instanceof Request) {
      return originalFetch(new Request(target, { ...init, headers }));
    }

    return originalFetch(target, { ...init, headers });
  };
})();
