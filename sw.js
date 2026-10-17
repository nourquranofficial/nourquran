// ★ غيّر الرقم عند كل تحديث جديد
const CACHE = 'nour-v18';
// ★ المسار الأساسي بيتحدد من مكان تسجيل الـ SW نفسه (يشتغل على /nourquran/ أو أي مسار تاني من غير تعديل)
const BASE = (function () { try { return new URL(self.registration.scope).pathname; } catch (e) { return '/nourquran/'; } })();
const PRECACHE = [BASE, BASE + 'index.html', BASE + 'notif-logic.js', BASE + 'wird.js', BASE + 'nour-stt.js?v=113', BASE + 'quran-local.js?v=113', BASE + 'widget.html', BASE + 'manifest-widget.json', BASE + 'leitner.js', BASE + 'report.js', BASE + 'a11y.js', BASE + 'ux.js', BASE + 'meaning.js', BASE + 'changelog.js', BASE + 'manifest.json', BASE + 'icon-192.png', BASE + 'icon-512.png'];

// ★ الشبكة الضعيفة: لو الرد اتأخر أكتر من كده والنسخة المحفوظة موجودة نفتح منها فوراً بدل ما الصفحة تفضل بيضا
const NET_TIMEOUT_MS = 4000;

importScripts(BASE + 'notif-logic.js'); // منطق الإشعارات المشترك مع الصفحة

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))) // فشل ملف واحد ما يوقفش التثبيت
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// الشبكة أولاً (التحديثات تظهر فوراً) مع مهلة، وبعدها الكاش — والكاش بيتحدّث في الخلفية
function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled) { settled = true; resolve(r); } };
    const fromCache = () => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match(BASE + 'index.html') : undefined));

    // مهلة: لو الشبكة بطيئة وعندنا نسخة محفوظة نستخدمها (الشبكة تكمّل وتحدّث الكاش للمرة الجاية)
    const timer = setTimeout(() => { fromCache().then(r => { if (r) finish(r); }); }, NET_TIMEOUT_MS);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(r => finish(r || Response.error()));
    });
  });
}

// ★ الصوت (everyayah) وفيربيس خارج النطاق فمش بنتدخل فيهم
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // طلبات الصوت/الفيديو بتيجي بـ Range — الكاش مش بيدعمها صح فنسيبها للمتصفح
  if (req.headers.has('range')) return;
  // نص القرآن ثابت (الرقم ?v= بيتغيّر لو اتعدّل) → كاش أولاً: فتح أسرع وأوفلاين
  if (url.pathname.endsWith('/quran-local.js')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(req, c)).catch(() => {}); } return res; })));
    return;
  }
  e.respondWith(networkFirst(req));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── تذكير ذكي في الخلفية (Chrome/Android للتطبيق المثبّت) ───
self.addEventListener('periodicsync', e => {
  if (e.tag === 'nour-daily') e.waitUntil(NourNotif.runCheck());
});

// ─── الضغط على الإشعار: افتح التطبيق على المكان المناسب ───
self.addEventListener('notificationclick', e => {
  e.notification.close();
  try { NourNotif.markOpen(); } catch (err) {}   // الضغط على الإشعار = تفاعل (بيوقف تخفيف التذكيرات)
  const d = e.notification.data || {};
  const q = d.deeplink ? ('?dl=' + encodeURIComponent(d.deeplink) + (d.surah ? '&s=' + encodeURIComponent(d.surah) : '')) : '';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf(BASE) !== -1 && 'focus' in c) { c.postMessage({ type: 'NOUR_DEEPLINK', data: d }); return c.focus(); }
      }
      return self.clients.openWindow(BASE + q);
    })
  );
});
