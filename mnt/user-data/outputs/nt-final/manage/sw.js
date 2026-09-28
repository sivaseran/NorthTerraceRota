// Manage North Terrace's own service worker — separate file from the
// staff app's, per-app cache namespace, deliberately does no caching.
// This app depends on live Firestore data (schedules, PINs, timesheets),
// so caching responses here risks serving stale data. Exists purely to
// satisfy Chrome's installability requirement (a service worker that
// controls the page with a fetch handler).
const CACHE_NAME = 'manage-north-terrace-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
