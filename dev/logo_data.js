/**
 * APOTEK ANA FARMA — lightweight logo manifest for /dev
 * V18.1
 *
 * Logo tetap berupa asset PNG statis. Feature runtime dimuat sebelum
 * app.js menginisialisasi DOMContentLoaded agar renderer lengkap sudah
 * terpasang ketika aplikasi mulai.
 */
const LOGO_EMBLEM_B64 = './icon-192.png';
const LOGO_FULL_B64 = './icon-512.png';

(function loadDevFeaturesRuntime() {
  const script = document.createElement('script');
  script.src = './features-runtime.js?v=20260827-DEV-FEATURES-18-1';
  script.async = false;
  document.head.appendChild(script);
})();
