// sw.js — كاش بسيط لملفات التطبيق الأساسية بس (مفيش أي كود إشعارات هنا خالص)
//
// ليه محتاجينه؟
// من غير Service Worker، كل مرة تسيب التطبيق وترجعله (تقفل المتصفح/تبدّل
// تطبيقات والموبايل يفضّي الذاكرة) بيحصل fetch كامل من الشبكة للصفحة زي أي
// موقع عادي — يعني فلاش/ريفرش واضح. الكاش هنا بيخلي فتح التطبيق فوري من
// الجهاز نفسه (زي أبس حقيقي)، وفي نفس الوقت بيحدّث نسخته في الخلفية بهدوء
// عشان أي تحديث تعمله في index.html يوصل من غير ما تحتاج تعمل حاجة يدوية.
//
// ⚠️ لو عملت تحديث كبير وعايز تجبر كل الأجهزة تاخد النسخة الجديدة فورًا،
//    غيّر رقم النسخة في CACHE_NAME تحت (مثلاً v1 → v2).

const CACHE_NAME = 'nour-shell-v1';
const CORE_ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // فشل تحميل ملف واحد ما يوقفش تثبيت الـ SW
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// استراتيجية "Stale-While-Revalidate": رجّع النسخة المخزّنة فورًا (مفيش أي
// انتظار = مفيش ريفرش ظاهر)، وفي نفس الوقت اجيب نسخة جديدة من الشبكة وحدّث
// بيها الكاش عشان المرة الجاية تبقى أحدث.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // بس طلبات نفس الموقع — سيب طلبات Firebase/الخطوط/الصور الخارجية للمتصفح العادي
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached); // مفيش نت ومفيش كاش → الطلب يفشل عادي
        return cached || networkFetch;
      })
    )
  );
});
