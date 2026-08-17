/**
 * APOTEK ANA FARMA — Service Worker
 * Strategi: cache "app shell" (HTML/CSS/JS/ikon) supaya aplikasi tetap
 * bisa dibuka walau sinyal HP jelek, TAPI semua data (produk, transaksi,
 * dsb.) SELALU diambil langsung dari server (network-only) supaya kasir
 * tidak pernah melihat stok/harga basi. Naikkan CACHE_VERSION setiap kali
 * index.html/app.js diperbarui supaya HP pengguna otomatis mengambil versi baru.
 */
const CACHE_VERSION = 'ana-farma-v14';
const APP_SHELL = [
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jangan pernah cache panggilan ke Apps Script (selalu data terbaru).
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ ok: false, error: 'Tidak ada koneksi internet.' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // App shell: cache-first, lalu perbarui cache di latar belakang.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
