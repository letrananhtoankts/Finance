// service-worker.js
// Mở nhanh và cài như app, nhưng LUÔN lấy bản mới nhất khi có mạng (network-first).
// Chỉ dùng bộ nhớ đệm khi mất mạng. KHÔNG cache dữ liệu Supabase.
// Muốn ép mọi máy bỏ bản cũ: tăng số phiên bản bên dưới (v2 -> v3 ...).

const CACHE_NAME = 'ttequip-shell-v2';
const SHELL_FILES = [
  './index.html',
  './login.html',
  './css/main.css',
  './js/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Không đụng tới Supabase và các tài nguyên bên ngoài (CDN): luôn đi mạng thật
  if (url.origin !== self.location.origin) return;

  // Network-first: có mạng thì lấy bản mới và lưu lại; mất mạng thì dùng bản đã lưu
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
