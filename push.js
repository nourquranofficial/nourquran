// push.js — تسجيل جهاز المستخدم لإشعارات السيرفر (FCM) + مزامنة سياقه مع Worker الـ Cron
// الإشعار بيوصل حتى لو التطبيق مقفول. لو أي حاجة ناقصة (VAPID / متصفح مش بيدعم) → بنفضل على الإشعارات المحلية زي ما هي.
//
// إعداد مرة واحدة (في index.html قبل تحميل push.js):  window.NOUR_VAPID_KEY = '<Web Push certificate key pair>';
//   Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair
(function () {
  'use strict';

  var FCM_VER = '10.12.0';
  var MIN_GAP_MS = 15 * 1000;          // أقل فاصل بين كتابتين للسياق — قصير عشان السيرفر (بيفحص كل دقيقة) ما يبعتش تذكير بعد ما تخلّص ورددك
  var state = { token: null, lastSig: '', lastAt: 0, lastPrefs: '', busy: false, timer: null };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // معرّف ثابت للجهاز/المتصفح ده (مش بيتغيّر لو المستخدم بدّل الحساب — السياق هو اللي بيتحدّث)
  function deviceId() {
    var id = lsGet('nour_push_dev');
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var a = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(a);
      id = ''; for (var i = 0; i < a.length; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'[a[i] % 36];
      lsSet('nour_push_dev', id);
    }
    return id;
  }

  function supported() {
    return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window) &&
           !!window.NOUR_VAPID_KEY && typeof window.fbSavePush === 'function' && !!window._fbApp;
  }

  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo'; } catch (e) { return 'Africa/Cairo'; } }

  // بيجيب توكن FCM (بيطلب الإذن لو لسه، لكن enableReminders بيكون طلبه بالفعل)
  function getToken() {
    if (state.token) return Promise.resolve(state.token);
    if (!supported() || Notification.permission !== 'granted') return Promise.resolve(null);
    var base = 'https://www.gstatic.com/firebasejs/' + FCM_VER + '/firebase-messaging.js';
    return Promise.all([import(base), navigator.serviceWorker.ready]).then(function (r) {
      var m = r[0], reg = r[1];
      return m.isSupported().then(function (ok) {
        if (!ok) return null;
        return m.getToken(m.getMessaging(window._fbApp), { vapidKey: window.NOUR_VAPID_KEY, serviceWorkerRegistration: reg });
      });
    }).then(function (t) { state.token = t || null; return state.token; })
      .catch(function (e) { console.warn('push.getToken', e && e.message); return null; });
  }

  // ctx: نفس الكائن اللي wird.js بيكتبه في IndexedDB. force = غصب الكتابة (فتح التطبيق / تغيير التفضيلات)
  function sync(ctx, force) {
    try {
      if (!ctx || !ctx.prefs) return;
      if (state.busy) { clearTimeout(state.timer); state.timer = setTimeout(function () { sync(ctx, true); }, 1500); return; }
      if (!supported()) return;
      var on = !!ctx.prefs.enabled && Notification.permission === 'granted';
      var sig = JSON.stringify([on, ctx.prefs, ctx.streak, ctx.streakLastDay, ctx.playedDay, ctx.doneDay, ctx.goal, ctx.doneToday, ctx.rank, ctx.prevRank, ctx.usualHour, (ctx.surahs && ctx.surahs[0]) ? ctx.surahs[0].surah + ':' + ctx.surahs[0].nextIdx : '']);
      var now = Date.now();
      if (!force && sig === state.lastSig && now - state.lastAt < 6 * 3600 * 1000) return;     // مفيش جديد
      if (!force && sig !== state.lastSig && now - state.lastAt < MIN_GAP_MS) {
        // لسه بدري على كتابة جديدة → نأجّلها ونبعت آخر حالة بعد الفاصل (عشان آخر تغيير ما يضيعش)
        clearTimeout(state.timer); state.timer = setTimeout(function () { sync(ctx, true); }, MIN_GAP_MS - (now - state.lastAt) + 200);
        return;
      }
      if (!on && !lsGet('nour_push_dev')) return;                                                // عمرنا ما سجّلنا + مقفول → مفيش داعي
      state.busy = true;
      // مفعّل → لازم توكن. مقفول → بنكتب السياق (enabled:false) من غير توكن عشان السيرفر يبطّل يبعت.
      (on ? getToken() : Promise.resolve(null)).then(function (token) {
        if (on && !token) { state.busy = false; return; }
        var rec = { ctx: slim(ctx), tz: tz(), openAt: now, updated: now };
        if (token) rec.token = token;
        return Promise.resolve(window.fbSavePush(deviceId(), rec)).then(function (ok) {
          state.busy = false;
          if (ok === false) return;
          state.lastSig = sig; state.lastAt = now; state.lastPrefs = JSON.stringify(ctx.prefs);
          // السيرفر شغّال → الفحص المحلي يسكت (notif-logic.js → runCheck بيقرا pushOkAt)
          try { NourNotif.idbSet('pushOkAt', on ? now : 0); } catch (e) {}
        });
      }).catch(function (e) { state.busy = false; console.warn('push.sync', e && e.message); });
    } catch (e) { state.busy = false; }
  }

  // بنبعت للسيرفر اللي محتاجه بس (من غير بيانات زايدة)
  function slim(c) {
    return {
      prefs: c.prefs, streak: c.streak || 0, streakLastDay: c.streakLastDay || null,
      playedDay: c.playedDay || null, doneDay: c.doneDay || null, goal: c.goal || 0, doneToday: c.doneToday || 0,
      rank: c.rank != null ? c.rank : null, prevRank: c.prevRank != null ? c.prevRank : null,
      surahs: (c.surahs || []).slice(0, 1), usualHour: c.usualHour != null ? c.usualHour : null
    };
  }

  // فتح التطبيق = تفاعل (السيرفر بيستخدمه في كبح الإشعارات المتجاهَلة)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    NourNotif.idbGet('ctx').then(function (c) { if (c) sync(c, true); }).catch(function () {});
  });

  window.NourPush = { sync: sync, getToken: getToken, supported: supported, deviceId: deviceId };
})();
