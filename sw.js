// Service worker: rende BCW installabile e la apre anche offline.
// I dati del registro sono salvati a parte (IndexedDB) dall'app stessa.

const VERSION = 'bcw-v2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/bcw.css',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/api.js',
  'js/calendar-export.js',
  'js/charts.js',
  'js/components.js',
  'js/demo.js',
  'js/dom.js',
  'js/gradebook.js',
  'js/icons.js',
  'js/lock.js',
  'js/models.js',
  'js/pdf.js',
  'js/prefs.js',
  'js/reminders.js',
  'js/store.js',
  'js/util.js',
  'js/views/index.js',
  'js/views/sections-meta.js',
  'js/views/dashboard.js',
  'js/views/grades.js',
  'js/views/you.js',
  'js/views/noticeboard.js',
  'js/views/sections.js',
  'js/views/search.js',
  'js/views/settings.js',
  'js/views/login.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Le richieste al registro non passano mai dalla cache del service worker.
  if (request.method !== 'GET' || url.pathname.includes('/api/')) return;

  if (url.origin === location.origin) {
    // Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r ?? caches.match('index.html'))),
    );
    return;
  }

  // Font di Google: dalla cache se presenti.
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow('./#/dashboard');
    }),
  );
});
