/**
 * APOTEK ANA FARMA — lightweight logo manifest for /dev
 * V18.3
 */
const LOGO_EMBLEM_B64 = './icon-192.png';
const LOGO_FULL_B64 = './icon-512.png';

/*
 * Login screen must participate in the common .screen router.
 * The old #login-screen rule had higher CSS specificity than
 * .screen/.screen.active, so the login view remained visible even
 * after app.js activated the dashboard.
 *
 * This compatibility rule is intentionally injected here because
 * logo_data.js is loaded before app.js and before the body router runs.
 */
(function installScreenVisibilityGuard() {
  const style = document.createElement('style');
  style.id = 'ana-farma-screen-visibility-fix';
  style.textContent = `
    #login-screen.screen { display: none; }
    #login-screen.screen.active { display: flex; }
  `;
  document.head.appendChild(style);
})();

(function loadDevRuntimeLayers() {
  const apiContext = document.createElement('script');
  apiContext.src = './api-context.js?v=20260827-DEV-API-CONTEXT-18-3';
  apiContext.async = false;
  document.head.appendChild(apiContext);

  const compat = document.createElement('script');
  compat.src = './feature-compat.js?v=20260827-DEV-COMPAT-18-3';
  compat.async = false;
  document.head.appendChild(compat);

  const features = document.createElement('script');
  features.src = './features-runtime.js?v=20260827-DEV-FEATURES-18-3';
  features.async = false;
  document.head.appendChild(features);
})();
