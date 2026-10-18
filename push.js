// push.js — تسجيل جهاز المستخدم لإشعارات السيرفر (FCM) + مزامنة سياقه مع Worker الـ Cron
// الإشعار بيوصل حتى لو التطبيق مقفول. لو أي حاجة ناقصة (VAPID / متصفح مش بيدعم) → بنفضل على الإشعارات المحلية زي ما هي.
//
// إعداد مرة واحدة (في index.html قبل تحميل push.js):  window.NOUR_VAPID_KEY = '<Web Push certificate key pair>';
//   Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair
(function () {
  'use strict';

  var FCM_VER = '10.12.0';
  var MIN_GAP_MS = 15 * 1000;          // أقل فاصل بين كتابتين للسياق — قصير عشان السيرفر (بيفحص كل دقيقة) ما يبعتش تذكير بعد ما تخلّص ورددك
  var state = { lastErr: '', token: null, lastSig: '', lastAt: 0, lastPrefs: '', busy: false, timer: null };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ───────── ★ v127: تطبيق أندرويد أصلي (Capacitor) — إشعارات FCM الأصلية بدل Web Push ─────────
  //   جوه APK بيتحمّل نفس الموقع، وبيوفّر Capacitor.Plugins.PushNotifications. هنا بنعمل Notification «بديل» (polyfill)
  //   عشان wird.js يفضل شغّال زي ما هو (permission / requestPermission)، والتوكن بيتسجّل في نفس pushDevices.
  var nat = { perm: 'default', inited: false, regResolve: null };
  function native() { try { return !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function PN() { try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PushNotifications) || null; } catch (e) { return null; } }
  function mapPerm(v) { return v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'default'); }
  function errTxt(e) { return (e && (e.message || e.error || e.code)) || (typeof e === 'string' ? e : JSON.stringify(e || {})); }

  function nativeInit() {
    if (nat.inited) return; nat.inited = true;
    var P = PN(); if (!P) return;
    try { P.createChannel({ id: 'nour', name: 'تذكير الورد', description: 'تذكير يومي بوردك وسلسلتك', importance: 4, visibility: 1, vibration: true }); } catch (e) {}
    P.addListener('registration', function (t) {
      var v = t && t.value; if (!v) return;
      state.token = v;
      if (nat.regResolve) { nat.regResolve(v); nat.regResolve = null; return; }
      // تجديد توكن من النظام → نسجّله تاني
      try { NourNotif.idbGet('ctx').then(function (c) { if (c) sync(c, true); }); } catch (e) {}
    });
    P.addListener('registrationError', function (e) { state.lastErr = errTxt(e); if (nat.regResolve) { nat.regResolve(null); nat.regResolve = null; } });
    // الضغط على الإشعار → افتح المكان المناسب
    P.addListener('pushNotificationActionPerformed', function (a) {
      var d = (a && a.notification && a.notification.data) || {};
      setTimeout(function () { try { if (window.NourWird && NourWird.deeplink) NourWird.deeplink(d); } catch (e) {} }, 800);
    });
    // والتطبيق مفتوح قدامك مفيش داعي لإشعار (pushNotificationReceived بيتجاهل)
    P.checkPermissions().then(function (r) {
      nat.perm = mapPerm(r && r.receive);
      try { if (window.NourWird) NourWird.render(); } catch (e) {}
      if (nat.perm === 'granted') { try { P.register(); } catch (e) {} }   // بيجدّد التوكن كل تشغيل
    }).catch(function () {});
  }

  if (native()) {
    // بديل Notification: الـ WebView ما بيدعمهاش، فبنوصّل wird.js بإذن النظام الأصلي
    var NotifPoly = function () {};
    Object.defineProperty(NotifPoly, 'permission', { get: function () { return nat.perm; } });
    NotifPoly.requestPermission = function (cb) {
      var P = PN();
      var p = P ? P.requestPermissions().then(function (r) { nat.perm = mapPerm(r && r.receive); return nat.perm; }) : Promise.resolve('denied');
      if (typeof cb === 'function') p.then(cb);
      return p;
    };
    try { window.Notification = NotifPoly; } catch (e) {}
    nativeInit();
  }

  function getNativeToken() {
    var P = PN();
    if (!P) { state.lastErr = 'مفيش PushNotifications plugin (تأكد إنك فاتح من APK نور)'; return Promise.resolve(null); }
    nativeInit();
    return P.checkPermissions().then(function (r) { return (r && r.receive === 'granted') ? r : P.requestPermissions(); }).then(function (r) {
      nat.perm = mapPerm(r && r.receive);
      if (nat.perm !== 'granted') { state.lastErr = 'الإذن: ' + (r && r.receive); return null; }
      return new Promise(function (resolve) {
        var t = setTimeout(function () { nat.regResolve = null; resolve(null); }, 12000);
        nat.regResolve = function (v) { clearTimeout(t); resolve(v); };
        P.register().catch(function (e) { clearTimeout(t); nat.regResolve = null; state.lastErr = errTxt(e); resolve(null); });
      });
    }).then(function (t) { state.token = t || state.token; if (!t && !state.lastErr) state.lastErr = 'التوكن ما رجعش في ١٢ ثانية (تأكد من google-services.json)'; return state.token; })
      .catch(function (e) { state.lastErr = errTxt(e); return null; });
  }

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
    if (native()) return !!PN() && typeof window.fbSavePush === 'function' && !!window._fbApp;
    return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window) &&
           !!window.NOUR_VAPID_KEY && typeof window.fbSavePush === 'function' && !!window._fbApp;
  }

  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo'; } catch (e) { return 'Africa/Cairo'; } }

  // بيجيب توكن FCM (بيطلب الإذن لو لسه، لكن enableReminders بيكون طلبه بالفعل)
  function getToken() {
    if (native()) return state.token ? Promise.resolve(state.token) : getNativeToken();
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
      .catch(function (e) { state.lastErr = (e && (e.code || e.message)) || String(e); console.warn('push.getToken', state.lastErr); return null; });
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
        var rec = { ctx: slim(ctx), tz: tz(), openAt: now, updated: now, platform: native() ? 'android' : 'web' };
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


  // ★ v126: فحص خطوة بخطوة لحد ما نعرف الإشعارات واقفة فين — بيشتغل من زرار في إعدادات التذكير
  //   say(ok, نص) بيتنادى لكل خطوة (ok: true ✅ / false ❌ / null ℹ️)
  function diagnose(say) {
    var steps = Promise.resolve();
    function step(fn) { steps = steps.then(fn).catch(function (e) { say(false, 'خطأ غير متوقع: ' + ((e && (e.code || e.message)) || e)); }); }
    var NAT = native();
    step(function () { say(null, 'نسخة التطبيق: ' + (window.NOUR_VERSION || '؟') + (NAT ? ' — تطبيق أندرويد أصلي' : ' — متصفح')); });
    step(function () {
      say('Notification' in window, 'المتصفح بيدعم الإشعارات');
      say(NAT || ('serviceWorker' in navigator), 'Service Worker مدعوم');
      say(NAT || ('PushManager' in window), 'Push مدعوم' + ((NAT || ('PushManager' in window)) ? '' : ' (على الآيفون لازم التطبيق يكون مثبّت على الشاشة الرئيسية)'));
      say(NAT || !!window.NOUR_VAPID_KEY, NAT ? 'FCM الأصلي (مش محتاج VAPID)' : 'مفتاح VAPID موجود');
      say(!!window._fbApp && typeof window.fbSavePush === 'function', 'Firebase جاهز');
      var u = window._firebaseAuth && window._firebaseAuth.currentUser;
      say(!!u, 'تسجيل الدخول في Firebase' + (u ? (u.isAnonymous ? ' (مجهول)' : '') : ' — لسه ما اتسجّلش، استنى ثواني وجرّب تاني'));
      say(window.Notification && Notification.permission === 'granted', 'إذن الإشعارات: ' + (window.Notification ? Notification.permission : '؟') + (window.Notification && Notification.permission !== 'granted' ? ' — فعّله من إعدادات الجهاز/المتصفح' : ''));
    });
    step(function () {
      if (NAT) { say(null, 'Service Worker مش مطلوب في تطبيق الأندرويد'); return; }
      return Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(function () { r(null); }, 6000); })]).then(function (reg) {
        say(!!reg, 'Service Worker شغّال' + (reg ? ' (' + (reg.scope || '') + ')' : ' — ما جهّزش في ٦ ثواني'));
      });
    });
    step(function () {
      if (!supported() || Notification.permission !== 'granted') { say(false, 'مش هنكمل لتوكن FCM — الشروط اللي فوق لازم تكون ✅ الأول'); return; }
      state.token = null; state.lastErr = '';
      return getToken().then(function (t) {
        say(!!t, t ? 'توكن FCM اتجاب ✅ (' + t.slice(0, 12) + '…)' : 'توكن FCM فشل: ' + (state.lastErr || 'غير معروف'));
      });
    });
    step(function () {
      return NourNotif.idbGet('ctx').then(function (c) {
        if (!c) { say(false, 'مفيش سياق ورد محلي — افتح الورد وسجّل دخول بحسابك وجرّب تاني'); return; }
        if (!state.token) { say(false, 'مفيش توكن فمش هنكتب في Firebase'); return; }
        window._fbPushErr = '';
        var now = Date.now();
        return Promise.resolve(window.fbSavePush(deviceId(), { token: state.token, ctx: slim(c), tz: tz(), openAt: now, updated: now, platform: native() ? 'android' : 'web' })).then(function (ok) {
          say(ok !== false, ok !== false ? 'الجهاز اتسجّل في Firebase (pushDevices) ✅' : 'التسجيل في Firebase فشل: ' + (window._fbPushErr || 'غير معروف') + (/PERMISSION/i.test(window._fbPushErr || '') ? ' — القواعد (Rules) مش منشورة بـ Publish' : ''));
        });
      });
    });
    step(function () {
      var url = window.NOUR_PUSH_URL;
      if (!url) { say(null, 'رابط الـ Worker (NOUR_PUSH_URL) مش متحدد'); return; }
      return fetch(url.replace(/\/$/, '') + '/self-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: deviceId() }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { st: r.status, j: j }; }); })
        .then(function (o) {
          if (o.j && o.j.ok) say(true, 'السيرفر بعت إشعار تجريبي — لازم يظهر دلوقتي 🔔 (لو التطبيق مفتوح قدامك ممكن ما يظهرش، اقفله وجرّب تاني)');
          else say(false, 'السيرفر ردّ بخطأ: ' + ((o.j && (o.j.error || o.j.msg)) || o.st));
        }, function (e) { say(false, 'مقدرتش أوصل للـ Worker: ' + (e && e.message)); });
    });
    return steps;
  }

  // فتح التطبيق = تفاعل (السيرفر بيستخدمه في كبح الإشعارات المتجاهَلة)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    NourNotif.idbGet('ctx').then(function (c) { if (c) sync(c, true); }).catch(function () {});
  });

  window.NourPush = { diagnose: diagnose, sync: sync, getToken: getToken, supported: supported, deviceId: deviceId };
})();
