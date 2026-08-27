/**
 * APOTEK ANA FARMA — lightweight logo manifest for /dev
 * V18.6
 */
const LOGO_EMBLEM_B64 = './icon-192.png';
const LOGO_FULL_B64 = './icon-512.png';

/*
 * Login screen participates in the common .screen router.
 * The compatibility rule prevents the login selector from overriding
 * .screen/.screen.active after a successful login.
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
  const layers = [
    ['./api-context.js?v=20260827-DEV-API-CONTEXT-18-4', 'api-context'],
    ['./feature-compat.js?v=20260827-DEV-COMPAT-18-4', 'compat'],
    ['./features-runtime.js?v=20260827-DEV-FEATURES-18-4', 'features'],
    ['./navigation-shell.js?v=20260827-DEV-SHELL-18-4', 'navigation-shell'],
    ['./performance-hotfix.js?v=20260827-DEV-HOTFIX-18-6', 'performance-hotfix']
  ];

  layers.forEach(([src, id]) => {
    if (document.querySelector(`script[data-dev-layer="${id}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.devLayer = id;
    document.head.appendChild(script);
  });
})();
