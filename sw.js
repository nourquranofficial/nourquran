// sw.js — Service Worker لتطبيق نور
// المسؤوليات: (1) عرض الإشعارات المحلية اللي بتطلبها الصفحة و(هي شغالة/في الخلفية القريبة)
//            (2) محاولة فحص دوري في الخلفية البعيدة (Periodic Background Sync) — دعم محدود
//                (Chrome/Android بس، ومحتاج تفاعل قوي مع التطبيق) — مفيش ضمان 100%.
//            (3) فتح/تركيز التطبيق عند الضغط على الإشعار.
//
// ⚠️ عدّل مسارات الأيقونة تحت لو أيقونة تطبيقك اسمها/مكانها مختلف عن اللي في manifest.json

importScripts('./notif-logic.js');

const NOTIF_ICON  = './icon-192.png';
const NOTIF_BADGE = './icon-512.png';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// ★ Deep link: نحوّل بيانات الإشعار (data) لرابط استعلام بسيط
//   عشان نستخدمه لو التطبيق مقفول واحتجنا نفتح تاب جديد بيه.
function buildDeepLinkUrl(data) {
  if (!data || !data.deeplink) return './';
  const params = new URLSearchParams();
  params.set('deeplink', data.deeplink);
  if (data.surah) params.set('surah', data.surah);
  return './?' + params.toString();
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // ★ لو التطبيق مفتوح بالفعل في تاب: نركّز عليه ونبعتله السياق برسالة
      //   (postMessage) بدل ما نغيّر الرابط — أسرع وميعملش reload للتطبيق.
      for (const c of list) {
        if ('focus' in c) {
          if (data) c.postMessage({ type: 'NOUR_DEEPLINK', ...data });
          return c.focus();
        }
      }
      // ★ مفيش تاب مفتوح: نفتح واحد جديد ومعاه الديب لينك في الرابط نفسه،
      //   عشان الصفحة تقرأه بعد ما تخلص تسجيل الدخول التلقائي.
      if (self.clients.openWindow) return self.clients.openWindow(buildDeepLinkUrl(data));
    })
  );
});

// رسالة من الصفحة تطلب عرض إشعار فوري (مثلاً زر "جرّب إشعار الآن")
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SHOW_NOTIFICATION' && msg.title) {
    self.registration.showNotification(msg.title, {
      body: msg.body || '',
      icon: NOTIF_ICON,
      badge: NOTIF_BADGE,
      image: NOTIF_BADGE,
      tag: 'nour-daily',
      renotify: false,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [120, 60, 120],
      data: msg.data || null
    });
  }
});

// ★ Periodic Background Sync — best-effort فقط
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nour-daily-check') {
    event.waitUntil(runBackgroundCheck());
  }
});

// مسار احتياطي للاختبار اليدوي عبر Background Sync العادي
self.addEventListener('sync', (event) => {
  if (event.tag === 'nour-manual-check') {
    event.waitUntil(runBackgroundCheck());
  }
});

async function runBackgroundCheck() {
  try {
    const state = await self.NourNotif.idbGet('current');
    if (!state || !state.prefs || !state.prefs.enabled) return;

    const now = Date.now();
    if (state.lastNotifiedAt && (now - state.lastNotifiedAt) < self.NourNotif.COOLDOWN_MS) return;

    const ctx = {
      rank: state.rank,
      prevRank: state.prevRank,
      streak: state.streak,
      playedToday: state.playedToday,
      surahs: state.surahs,
      prefs: state.prefs,
      hour: new Date().getHours()
    };

    const decision = self.NourNotif.decideNotification(ctx);
    if (!decision) return;

    await self.registration.showNotification(decision.title, {
      body: decision.body,
      icon: NOTIF_ICON,
      badge: NOTIF_BADGE,
      image: NOTIF_BADGE,
      tag: 'nour-daily',
      renotify: false,
      dir: 'rtl',
      lang: 'ar',
      vibrate: [120, 60, 120],
      data: decision.data || null
    });

    state.lastNotifiedAt = now;
    if (state.rank != null) state.prevRank = state.rank;
    await self.NourNotif.idbSet('current', state);
  } catch (err) {
    // فشل صامت — الهدف إن التطبيق يفضل مستقر حتى لو فحص الخلفية فشل
  }
}
