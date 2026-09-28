// Shift North Terrace's own service worker — separate from the Manage
// app's (which now lives in its own /manage/ folder with its own sw.js).
const CACHE_NAME = 'shift-north-terrace-v1';

// Minimal service worker — required for Android Chrome PWA installability.
// Deliberately does NOT cache anything: this app relies on live Firestore
// data (schedules, PINs, timesheets), and caching responses here risks
// serving stale data. This worker exists purely to satisfy Chrome's
// installability requirement of "a service worker that controls the page
// with a fetch handler" — every request just passes straight to the network.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
