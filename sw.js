/*
 * sw.js - かんたん家計簿 Service Worker
 * オフラインでもアプリが開けるように、アプリ本体をキャッシュします。
 * データ自体は IndexedDB に保存されるため、このSWはあくまで「表示用ファイル」のキャッシュです。
 *
 * ★アプリを更新して公開し直したときは CACHE_VERSION の数字を1つ上げてください。
 *   上げないと、利用者の端末に古いキャッシュが残り続けて更新が反映されないことがあります。
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'kakeibo-cache-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const CDN_ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {})).concat(
          CDN_ASSETS.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => {}))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
