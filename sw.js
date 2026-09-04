S
// ★ غيّر الرقم عند كل تحديث جديد (v2, v3, ...)
const CACHE = 'nour-v1';
 
// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['/nourquran/', '/nourquran/index.html']))
      .then(() => self.skipWaiting()) // تفعّل فوراً بدون انتظار
  );
});
 
// ─── Activate: امسح الكاشات القديمة ──────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // سيطر على كل الـ tabs فوراً
  );
});
 
// ─── Fetch: Network-First لـ index.html فقط ───────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isPage = url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
 
  if (isPage) {
    // index.html دايماً من النت عشان التحديثات تظهر فوراً
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
  } else {
    // باقي الملفات: من الكاش لو موجود، من النت لو لأ
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
 
// ─── رسالة من الصفحة لتفعيل التحديث فوراً ────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
 
