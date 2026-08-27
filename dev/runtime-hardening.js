/**
 * APOTEK ANA FARMA — DEV RUNTIME HARDENING
 * V18
 *
 * Lapisan kompatibilitas/performance untuk /dev.
 * Tidak menggandakan engine API/Outbox.
 * app.js tetap menjadi sumber fungsi aplikasi.
 *
 * Fokus:
 * - session/cart persistence ringan tanpa mengubah schema IndexedDB utama;
 * - klasifikasi error transport yang akurat;
 * - retry backoff yang tidak agresif;
 * - proteksi event ganda;
 * - pemulihan cart setelah reload;
 * - diagnostik runtime.
 */
(function () {
  'use strict';

  const VERSION = '20260827-DEV-HARDENING-18';
  const CART_KEY_PREFIX = 'anafarma_dev_cart_v18:';
  const CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const RETRY_BASE_MS = 5000;
  const RETRY_MAX_MS = 60000;

  let installed = false;
  let retryTimer = null;
  let retryAttempt = 0;

  function currentUserId() {
    try {
      return window.AppState && window.AppState.user
        ? String(window.AppState.user.idUser || '')
        : '';
    } catch (_) {
      return '';
    }
  }

  function cartKey() {
    const id = currentUserId();
    return id ? CART_KEY_PREFIX + id : '';
  }

  function safeRead(key) {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.cart)) return null;
      if (Date.now() - Number(parsed.savedAt || 0) > CART_MAX_AGE_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('[DEV HARDENING][CART READ]', error);
      return null;
    }
  }

  function saveCart() {
    const key = cartKey();
    if (!key || !window.AppState) return;

    try {
      const payload = {
        savedAt: Date.now(),
        cart: Array.isArray(window.AppState.cart)
          ? window.AppState.cart
          : [],
        customer: window.AppState.cartCustomer || null
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.warn('[DEV HARDENING][CART WRITE]', error);
    }
  }

  function clearCartPersistence() {
    const key = cartKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[DEV HARDENING][CART CLEAR]', error);
    }
  }

  function restoreCart() {
    if (!window.AppState || !currentUserId()) return false;

    const saved = safeRead(cartKey());
    if (!saved || !saved.cart.length) return false;

    window.AppState.cart = saved.cart;
    window.AppState.cartCustomer = saved.customer || null;

    if (typeof window.renderKasirCartStatus === 'function') {
      window.renderKasirCartStatus();
    }

    window.dispatchEvent(new CustomEvent('anafarma:cart-restored', {
      detail: { count: saved.cart.length, savedAt: saved.savedAt }
    }));

    return true;
  }

  function installCartHooks() {
    const names = [
      'tambahKeKeranjang',
      'ubahQtyKeranjang',
      'kosongkanKeranjang'
    ];

    names.forEach(function (name) {
      const original = window[name];
      if (typeof original !== 'function' || original.__anaFarmaWrapped) {
        return;
      }

      const wrapped = function () {
        const result = original.apply(this, arguments);
        try {
          if (name === 'kosongkanKeranjang') {
            clearCartPersistence();
          } else {
            saveCart();
          }
        } catch (error) {
          console.warn('[DEV HARDENING][CART HOOK]', name, error);
        }
        return result;
      };

      wrapped.__anaFarmaWrapped = true;
      wrapped.__anaFarmaOriginal = original;
      window[name] = wrapped;
    });
  }

  function installCheckoutHook() {
    const original = window.prosesCheckout;
    if (typeof original !== 'function' || original.__anaFarmaWrapped) {
      return;
    }

    const wrapped = async function () {
      const result = await original.apply(this, arguments);
      if (!(result && result.offlinePending === true)) {
        clearCartPersistence();
      } else {
        saveCart();
      }
      return result;
    };

    wrapped.__anaFarmaWrapped = true;
    wrapped.__anaFarmaOriginal = original;
    window.prosesCheckout = wrapped;
  }

  function installSessionHook() {
    const original = window.masukKeAplikasi;
    if (typeof original !== 'function' || original.__anaFarmaWrapped) {
      return;
    }

    const wrapped = async function (user) {
      const result = await original.apply(this, arguments);
      installCartHooks();
      installCheckoutHook();
      restoreCart();
      return result;
    };

    wrapped.__anaFarmaWrapped = true;
    wrapped.__anaFarmaOriginal = original;
    window.masukKeAplikasi = wrapped;
  }

  function installNetworkClassification() {
    if (typeof window.isNetworkError !== 'function') return;
    if (window.isNetworkError.__anaFarmaWrapped) return;

    const original = window.isNetworkError;

    const wrapped = function (error) {
      if (!error) return !navigator.onLine;

      const kind = String(error.kind || '').toLowerCase();
      const status = Number(error.httpStatus || 0);

      // Server rejection is never a transport failure.
      if (kind === 'server' || kind === 'config') return false;

      if (kind === 'network' || kind === 'timeout') return true;
      if (kind === 'response-parse') return true;
      if (kind === 'http') {
        return status === 408 || status === 425 || status === 429 || status >= 500;
      }

      return original(error);
    };

    wrapped.__anaFarmaWrapped = true;
    wrapped.__anaFarmaOriginal = original;
    window.isNetworkError = wrapped;
  }

  function installRetryClassification() {
    if (typeof window.isRetryableTransportError !== 'function') return;
    if (window.isRetryableTransportError.__anaFarmaWrapped) return;

    const original = window.isRetryableTransportError;

    const wrapped = function (error) {
      if (!error) return !navigator.onLine;

      const kind = String(error.kind || '').toLowerCase();
      const status = Number(error.httpStatus || 0);

      if (kind === 'network' || kind === 'timeout' || kind === 'response-parse') {
        return true;
      }

      if (kind === 'http') {
        return status === 408 || status === 425 || status === 429 || status >= 500;
      }

      if (kind === 'server' || kind === 'config') return false;

      return original(error);
    };

    wrapped.__anaFarmaWrapped = true;
    wrapped.__anaFarmaOriginal = original;
    window.isRetryableTransportError = wrapped;
  }

  function scheduleRetry() {
    if (!navigator.onLine || retryTimer) return;

    const delay = Math.min(
      RETRY_MAX_MS,
      RETRY_BASE_MS * Math.pow(2, Math.max(0, retryAttempt))
    );

    retryTimer = setTimeout(function () {
      retryTimer = null;
      retryAttempt++;

      if (typeof window.syncOutbox === 'function') {
        Promise.resolve(window.syncOutbox()).catch(function (error) {
          console.warn('[DEV HARDENING][RETRY]', error);
          scheduleRetry();
        });
      }
    }, delay);
  }

  function installSyncObserver() {
    window.addEventListener('anafarma:sync-success', function () {
      retryAttempt = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    });

    window.addEventListener('anafarma:sync-failed', function (event) {
      const detail = event.detail || {};
      if (!detail.terminal) scheduleRetry();
    });
  }

  function installDiagnostics() {
    window.AnaFarmaDevRuntime = {
      version: VERSION,
      cart: function () {
        const saved = safeRead(cartKey());
        return saved || { cart: [], customer: null, savedAt: null };
      },
      restoreCart: restoreCart,
      clearCart: clearCartPersistence,
      retryNow: function () {
        retryAttempt = 0;
        if (typeof window.syncOutbox === 'function') {
          return window.syncOutbox();
        }
        return Promise.resolve();
      }
    };
  }

  function install() {
    if (installed) return;
    installed = true;

    installNetworkClassification();
    installRetryClassification();
    installSessionHook();
    installCartHooks();
    installCheckoutHook();
    installSyncObserver();
    installDiagnostics();

    // The app initializes on DOMContentLoaded; retry once after it has
    // established the session and rendered the first screen.
    setTimeout(function () {
      installSessionHook();
      installCartHooks();
      installCheckoutHook();
      restoreCart();
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
