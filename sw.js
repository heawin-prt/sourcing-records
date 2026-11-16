// Service Worker：联网时总是向服务器确认最新文件（避免 GitHub Pages 10 分钟缓存导致新旧文件混用），
// 断网时用上次缓存的文件，App 仍能打开。只处理本站的 GET 请求（汇率接口等外站请求不经过这里）。

const CACHE = 'sourcing-records';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      // no-cache：每次都向服务器确认（文件没变时服务器只回 304，很快）
      const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req.url, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      throw err;
    }
  })());
});
