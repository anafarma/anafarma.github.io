/**
 * APOTEK ANA FARMA — lightweight logo manifest for /dev
 * V18.1
 */
const LOGO_EMBLEM_B64 = './icon-192.png';
const LOGO_FULL_B64 = './icon-512.png';

(function loadDevRuntimeLayers() {
  const apiContext = document.createElement('script');
  apiContext.src = './api-context.js?v=20260827-DEV-API-CONTEXT-18-1';
  apiContext.async = false;
  document.head.appendChild(apiContext);

  const features = document.createElement('script');
  features.src = './features-runtime.js?v=20260827-DEV-FEATURES-18-1';
  features.async = false;
  document.head.appendChild(features);
})();
