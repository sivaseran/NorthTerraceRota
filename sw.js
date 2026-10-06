// Shift North Terrace service worker.
// Network-first/no asset cache: Firestore data must remain live.
const CACHE_NAME = 'shift-north-terrace-v2';

self.addEventListener('install', () => {
  // Do not skip waiting automatically. The app will show
  // “Update available – Reload” and activate on user request.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
