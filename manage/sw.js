// Manage North Terrace service worker.
// Network-first/no asset cache: Firestore data must remain live.
const CACHE_NAME = 'manage-north-terrace-v2';

self.addEventListener('install', () => {
  // Wait so the manager can explicitly accept an available update.
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
