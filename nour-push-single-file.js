// notif-logic.js — منطق إشعارات "نور" المشترك
// يُحمَّل في الصفحة عبر <script src="notif-logic.js"></script>
// وفي الـ Service Worker عبر importScripts('./notif-logic.js')
// أي تعديل هنا (نصوص/توقيتات) بينطبق على الحالتين مرة واحدة.

(function (root) {
  'use strict';

  var COOLDOWN_MS = 20 * 60 * 60 * 1000; // إشعار واحد بحد أقصى كل ~20 ساعة (عشان ميبقاش رخم)
  var QUIET_START = 23; // مفيش إشعارات من 11 بالليل
  var QUIET_END   = 7;  // لحد 7 الصبح

  function isQuietHour(hour) {
    if (QUIET_START > QUIET_END) return hour >= QUIET_START || hour < QUIET_END;
    return hour >= QUIET_START && hour < QUIET_END;
  }

  // بيتحقق إن الساعة الحالية "وصلت" لوقت الإشعار اللي المستخدم اختاره (مش لازم تطابق حرفي).
  // ★ اتغيّرت من تطابق حرفي (hour === prefHour) لنافذة مفتوحة (hour >= prefHour) لسببين:
  //   1) لو الفحص (tick كل 5 دقايق، أو periodicsync اللي توقيته مش مضمون) فاته توقيت
  //      الساعة بالظبط، كان الإشعار بيتلغي لليوم كله. دلوقتي أي فحص بعد الساعة المختارة
  //      لسه صالح (وبيتحكم فيه COOLDOWN_MS عشان يتبعت مرة واحدة بس في اليوم).
  //   2) كانت بتعمل تعارض منطقي مع شرط streakRisk (hour >= 18): لو المستخدم مختار وقته
  //      المفضل قبل الساعة 6 مساءً، إشعار خطر السلسلة كان مستحيل يوصله أبداً لأن البوابة
  //      كانت بترفض أي ساعة غير الساعة المختارة بالظبط.
  function isPreferredHour(hour, notifTime) {
    if (!notifTime || typeof notifTime !== 'string') return true; // مفيش وقت محدد = مفيش قيد
    var parts = notifTime.split(':');
    var prefHour = parseInt(parts[0], 10);
    if (isNaN(prefHour)) return true;
    return hour >= prefHour;
  }

  function ayaW(n) { return (n >= 3 && n <= 10) ? 'آيات' : 'آية'; }
  function dayW(n) { return (n === 1 || n > 10) ? 'يوم' : 'أيام'; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var MESSAGES = {
    rankDrop: {
      titles: ['📉 ترتيبك محتاج لمسة', '🔥 ارجع لمكانك', 'وحشتنا يا بطل'],
      bodies: [
        function (c) { return 'ترتيبك بقى #' + c.rank + '. خمس دقايق دلوقتي كفاية ترجّعلك مكانك 💪'; },
        function (c) { return 'حد سبقك في الترتيب 👀 افتح التطبيق وارجع احتل مكانك تاني.'; },
        function (c) { return 'ترتيبك اتغيّر شوية — تحدي بسيط دلوقتي يرجّعك زي الأول.'; }
      ]
    },
    rankHold: {
      titles: ['🏆 شغل رائع', '⭐ استمر كده', '👏 محافظ على مكانك'],
      bodies: [
        function (c) { return 'لسه في المركز #' + c.rank + '! تحدي سريع النهارده يثبّتلك مكانك.'; },
        function (c) { return 'ترتيبك ثابت وقوي 🌟 استمرارك بسيط بس هو السر.'; },
        function (c) { return 'مكانك في القمة يستاهل تفضل فيه — خمس دقايق وكفاية.'; }
      ]
    },
    streakRisk: {
      titles: ['🔥 السلسلة في خطر', 'لا تسيب السلسلة تقف', '⏳ باقي شوية بس'],
      bodies: [
        function (c) { return 'معاك سلسلة ' + c.streak + ' يوم متواصل 🔥 متسيبهاش توقف — خمس دقايق وكفاية.'; },
        function (c) { return 'يوم كمان هيخلص وسلسلتك (' + c.streak + ' يوم) مستنية منك آية أو اتنين بس.'; }
      ]
    },
    daily: {
      titles: ['📖 تحدي اليوم', '🌙 كمّل من حيث وقفت', '✨ خطوة صغيرة النهارده'],
      bodies: [
        function (c, s) { return 'كمّل حفظ سورة ' + s.name + ' — واصل ' + s.pct + '٪ منها، ٥ دقايق بس وتقرّب أكتر 🌙'; },
        function (c, s) { return 'سورة ' + s.name + ' مستنيّاك — تحدي بسيط النهارده يقرّبك من ختمها.'; },
        function (c, s) { return 'خطوة صغيرة في سورة ' + s.name + ' النهارده أحسن من ولا خطوة 🤍'; }
      ]
    }
  };

  function buildSurahInfo(s) {
    var pct = (s.total > 0) ? Math.round((s.nextIdx / s.total) * 100) : 0;
    return { name: s.surah, pct: pct };
  }

  // ★ v117: وقت التذكير الفعّال — اختيار المستخدم، أو «تلقائي» = ساعته المعتادة في اللعب (٢٠ لو لسه معرفناش)
  var WINDOW_H = 5;   // التذكير العادي بيفضل صالح ٥ ساعات بعد وقته بس (مش لآخر اليوم) عشان ما يجيش في وقت مش مناسب
  function effHour(prefs, usual) {
    var t = prefs && prefs.notifTime;
    if (t && t !== 'auto') { var h = parseInt(String(t).split(':')[0], 10); if (!isNaN(h)) return h; }
    if (usual != null && usual >= 7 && usual <= 22) return usual;
    return 20;
  }
  // ★ v121: وقت التذكير بالدقايق من أول اليوم (بيدعم وقت مخصّص زي ٨:٣٠، مش ساعات كاملة بس)
  function effMin(prefs, usual) {
    var t = prefs && prefs.notifTime;
    if (t && t !== 'auto') {
      var p = String(t).split(':'), h = parseInt(p[0], 10), m = parseInt(p[1], 10);
      if (!isNaN(h)) return h * 60 + (isNaN(m) ? 0 : m);
    }
    return effHour(prefs, usual) * 60;
  }
  function minW(m) { return m <= 1 ? 'دقيقة' : (m === 2 ? 'دقيقتين' : (m <= 10 ? m + ' دقايق' : m + ' دقيقة')); }
  function effort(left) { return minW(Math.max(1, Math.ceil(left * 20 / 60))); }   // ~٢٠ ثانية للآية الواحدة

  // ★ v118: سطر تشجيعي قصير بيتحط تحت رسالة الإشعار — حسب حالة المستخدم (لسه / في النص / قرّب يخلّص / سلسلة)
  var CHEERS = {
    start:   ['ابدأ بسم الله، والباقي يسهل 🤍', 'خطوة النهارده بتفرق 🌙', 'ربنا يفتح عليك 🤍'],
    mid:     ['كمّل، إنت أقرب مما تتخيّل 💪', 'شغل جميل لحد دلوقتي ✨', 'ربنا يبارك فيك 🤍'],
    almost:  ['آخر خطوة، تقبّل الله منك 🤍', 'خلّصها وارتاح 🏁', 'قربت جدًا 🌟'],
    big:     ['القليل الدائم خير من الكثير المنقطع 🤍', 'وزّعه على اليوم وهيعدّي بسهولة 🌙'],
    streak:  ['سلسلتك تستاهل تكمل 🔥', 'الاستمرار هو السر 🤍', 'يوم كمان وتفرح بنفسك ✨']
  };
  function cheer(kind) { return '\n' + pick(CHEERS[kind] || CHEERS.start); }

  // رسالة تحدي اليوم حسب هدف الورد وتقدّم المستخدم النهارده
  function dailyMessage(c, s, left) {
    var goal = c.goal || 0, done = c.doneToday || 0;
    if (!goal || c.wirdDone == null) return { title: pick(MESSAGES.daily.titles), body: pick(MESSAGES.daily.bodies)(c, s) };
    if (done > 0 && left > 0 && left <= 3) {
      return { title: '🏁 قربت تخلّص وردك', body: 'باقي ' + (left === 1 ? 'آية واحدة' : left + ' ' + ayaW(left)) + ' وتتم وردك النهارده ✅ — كمّل في سورة ' + s.name + cheer('almost') };
    }
    if (done > 0 && left > 0) {
      return { title: '🌙 كمّل وردك', body: 'عملت ' + done + ' من ' + goal + ' — باقي ' + left + ' ' + ayaW(left) + ' (حوالي ' + effort(left) + ') في سورة ' + s.name + cheer('mid') };
    }
    if (goal >= 20) {
      var half = Math.ceil(goal / 2);
      return { title: '✨ وردك النهارده كبير', body: 'هدفك ' + goal + ' ' + ayaW(goal) + ' — ابدأ بنصفه (' + half + ') دلوقتي وكمّل بعدين، في سورة ' + s.name + cheer('big') };
    }
    return { title: '📖 وردك النهارده', body: 'هدفك ' + goal + ' ' + ayaW(goal) + ' — حوالي ' + effort(goal) + ' بس، في سورة ' + s.name + ' 🌙' + cheer('start') };
  }

  // ctx: { rank, prevRank, streak, playedToday, wirdDone, remaining, surahs, prefs, hour, goal, doneToday, usualHour, rankOk }
  function decideNotification(ctx) {
    if (!ctx || !ctx.prefs || !ctx.prefs.enabled) return null;
    var prefs = ctx.prefs, hour = ctx.hour;
    // ★ v124: لو المستخدم اختار وقت بنفسه (مش «تلقائي») نحترمه في أي ساعة — الليل الهادي (١١ م–٧ ص) بس للوضع التلقائي
    var explicit = !!(prefs.notifTime && prefs.notifTime !== 'auto');
    if (!explicit && isQuietHour(ctx.hour)) return null;
    var startMin = effMin(prefs, ctx.usualHour), start = Math.floor(startMin / 60);
    var nowMin = hour * 60 + (ctx.minute || 0);
    var inMain = ((nowMin - startMin + 1440) % 1440) <= WINDOW_H * 60;   // ★ v124: بيدعم وقت قبل منتصف الليل بنافذة بتعدّي بعده
    // ★ "خلّص" = حقق هدف الورد (مش بس لعب سؤال). ctx قديم من غير الحقل ده → نرجع للسلوك القديم.
    var finished = (ctx.wirdDone != null) ? ctx.wirdDone : ctx.playedToday;
    var left = ctx.remaining > 0 ? ctx.remaining : 0;
    var rankOk = ctx.rankOk !== false;   // تنبيهات الترتيب بحد أقصى مرة كل ٣ أيام

    // 1) تراجع واضح في الترتيب
    if (inMain && rankOk && prefs.rankAlerts && ctx.rank != null && ctx.prevRank != null) {
      var droppedOutTop10 = ctx.prevRank <= 10 && ctx.rank > 10;
      var droppedALot = (ctx.rank - ctx.prevRank) >= 3;
      if (droppedOutTop10 || droppedALot) {
        return { tag: 'rank_drop', title: pick(MESSAGES.rankDrop.titles), body: pick(MESSAGES.rankDrop.bodies)(ctx), data: { deeplink: 'leaderboard' } };
      }
    }

    // 2) خطر انقطاع السلسلة — بس لو السلسلة يومين فأكتر (سلسلة يوم واحد مش تستاهل إزعاج) ومساءً
    if (prefs.streakReminder && ctx.streak >= 2 && !finished && nowMin >= Math.max(18 * 60, startMin) && (explicit || hour <= 22)) {
      var streakSurah = (ctx.surahs && ctx.surahs.length) ? ctx.surahs[0].surah : null;
      return {
        tag: 'streak_risk',
        title: pick(MESSAGES.streakRisk.titles),
        body: left > 0 ? ('باقي ' + left + ' ' + ayaW(left) + ' بس على وردك (حوالي ' + effort(left) + ') وسلسلتك (' + ctx.streak + ' ' + dayW(ctx.streak) + ') تفضل مكملة 🔥' + cheer('streak')) : pick(MESSAGES.streakRisk.bodies)(ctx) + cheer('streak'),
        data: streakSurah ? { deeplink: 'surah', surah: streakSurah } : { deeplink: 'home' }
      };
    }

    // 3) تحدي اليوم المخصص بهدفه وتقدّمه والسورة اللي بيحفظها دلوقتي
    if (inMain && prefs.dailyChallenge && !finished && ctx.surahs && ctx.surahs.length) {
      var sInfo = buildSurahInfo(ctx.surahs[0]);
      var dm = dailyMessage(ctx, sInfo, left);
      return { tag: 'daily_challenge', title: dm.title, body: dm.body, data: { deeplink: 'surah', surah: sInfo.name } };
    }

    // 4) تشجيع الترتيب العالي — بس لو لسه ما خلّصش ورده (مش بعد ما يخلّص) ومفيش حاجة أهم
    if (inMain && rankOk && !finished && prefs.rankAlerts && ctx.rank != null && ctx.rank <= 10 && ctx.prevRank != null && ctx.rank <= ctx.prevRank) {
      return { tag: 'rank_hold', title: pick(MESSAGES.rankHold.titles), body: pick(MESSAGES.rankHold.bodies)(ctx), data: { deeplink: 'leaderboard' } };
    }

    return null;
  }

  // ★ v117: الكبح الذكي — بيمنع الإزعاج:
  //  • لو آخر إشعارات اتجاهلت (من غير ما يفتح التطبيق) نفرّق المسافة: ٢ ← ٣ ← ٥ ← ٧ ← ١٤ يوم
  //  • حد أقصى ٤ إشعارات في الأسبوع
  // st: { last, lastOpen, ignored, log:[timestamps] } — بيرجّع { ok, ignored }
  function throttle(st, now) {
    st = st || {};
    var last = st.last || 0, lastOpen = st.lastOpen || 0;
    var ig = (last && lastOpen <= last) ? (st.ignored || 0) + 1 : 0;
    var gapDays = ig === 0 ? COOLDOWN_MS / 86400000 : (ig === 1 ? 2 : (ig === 2 ? 3 : (ig === 3 ? 5 : (ig < 8 ? 7 : 14))));
    if (last && now - last < gapDays * 86400000) return { ok: false, ignored: ig };
    var recent = (st.log || []).filter(function (t) { return now - t < 7 * 86400000; });
    if (recent.length >= 4) return { ok: false, ignored: ig };
    return { ok: true, ignored: ig };
  }

  // ---------- IndexedDB storage (متاحة في الصفحة وفي الـ Service Worker) ----------
  var DB_NAME = 'nour_notif_db';
  var STORE = 'state';

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); try { db.close(); } catch (e) {} };   // ★ قفل الاتصال (كان بيتراكم مع كل قراءة)
        r.onerror = function () { reject(r.error); try { db.close(); } catch (e) {} };
      });
    });
  }

  function idbSet(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); try { db.close(); } catch (e) {} };
        tx.onerror = function () { reject(tx.error); try { db.close(); } catch (e) {} };
      });
    });
  }

  // ---------- فحص مشترك: بيشتغل في الـ Service Worker (periodicsync) وفي الصفحة (لو مخفية) ----------
  function dayKey(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // ★ v122: القرار النهائي كدالة نقية (من غير IndexedDB ولا عرض إشعار) — مشتركة بين الصفحة/الـ SW وبين Worker السيرفر (Cron)
  //   c = سياق المستخدم (نفس اللي wird.js بيكتبه) · st = { last, lastOpen, ignored, log, lastRankAt }
  //   now = Date بتوقيت المستخدم المحلي (getHours/getMinutes) · nowMs = الوقت الفعلي بالمللي ثانية
  //   بيرجّع { n: {tag,title,body,data}, ignored } أو null
  function evaluate(c, st, now, nowMs) {
    if (!c || !c.prefs || !c.prefs.enabled) return null;
    st = st || {};
    var th = throttle({ last: st.last || 0, lastOpen: st.lastOpen || 0, ignored: st.ignored || 0, log: Array.isArray(st.log) ? st.log : [] }, nowMs);
    if (!th.ok) return null;
    var today = dayKey(now), yest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
    var streak = (c.streakLastDay === today || c.streakLastDay === yest) ? (c.streak || 0) : 0;
    // ★ الورد: اتحقق النهارده؟ وباقي كام آية (الأرقام بتتحسب بس لو آخر لعب كان النهارده، غير كده الهدف كامل)
    var hasWird = ('doneDay' in c);
    var doneNow = (c.playedDay === today) ? (c.doneToday || 0) : 0;
    var n = decideNotification({
      rank: c.rank, prevRank: c.prevRank, streak: streak,
      playedToday: c.playedDay === today, surahs: c.surahs || [],
      wirdDone: hasWird ? (c.doneDay === today) : null,
      remaining: hasWird ? Math.max(0, (c.goal || 0) - doneNow) : 0,
      goal: c.goal || 0, doneToday: doneNow, usualHour: (c.usualHour != null ? c.usualHour : null),
      rankOk: (nowMs - (st.lastRankAt || 0)) > 3 * 86400000,
      prefs: c.prefs, hour: now.getHours(), minute: now.getMinutes()
    });
    return n ? { n: n, ignored: th.ignored } : null;
  }

  // ★ v122: لو الإشعارات واصلة من السيرفر (FCM) نوقف الفحص المحلي عشان الإشعار ما يتكررش.
  //   push.js بيكتب pushOkAt كل ما يسجّل التوكن بنجاح؛ لو عدّى أكتر من ٣ أيام من غير تجديد نرجع للفحص المحلي كاحتياطي.
  var PUSH_FRESH_MS = 3 * 86400000;

  // ctx بتكتبه الصفحة في IndexedDB تحت المفتاح 'ctx' (wird.js → syncCtx)
  function runCheck() {
    return Promise.all([idbGet('ctx'), idbGet('lastNotifAt'), idbGet('lastOpenAt'), idbGet('ignored'), idbGet('sentLog'), idbGet('lastRankAt'), idbGet('pushOkAt')]).then(function (r) {
      var c = r[0], last = r[1] || 0, lastOpen = r[2] || 0, ignoredStored = r[3] || 0, log = Array.isArray(r[4]) ? r[4] : [], lastRankAt = r[5] || 0, pushOkAt = r[6] || 0;
      if (!c || !c.prefs || !c.prefs.enabled) return null;
      var nowMs = Date.now();
      if (pushOkAt && nowMs - pushOkAt < PUSH_FRESH_MS) return null;   // السيرفر هو اللي بيبعت
      var now = new Date();
      var ev = evaluate(c, { last: last, lastOpen: lastOpen, ignored: ignoredStored, log: log, lastRankAt: lastRankAt }, now, nowMs);
      if (!ev) return null;
      var n = ev.n, th = { ignored: ev.ignored };
      var regP = root.registration ? Promise.resolve(root.registration)
               : (root.navigator && navigator.serviceWorker ? navigator.serviceWorker.ready : Promise.resolve(null));
      return regP.then(function (reg) {
        if (!reg) return null;
        var base = (reg.scope || '/nourquran/');
        return reg.showNotification(n.title, {
          body: n.body, tag: n.tag, dir: 'rtl', lang: 'ar',
          icon: base + 'icon-192.png', badge: base + 'icon-192.png',
          data: n.data, renotify: false
        });
      }).then(function () {
        var keep = log.filter(function (t) { return nowMs - t < 7 * 86400000; }); keep.push(nowMs);
        var jobs = [idbSet('lastNotifAt', nowMs), idbSet('ignored', th.ignored), idbSet('sentLog', keep)];
        if (n.tag === 'rank_drop' || n.tag === 'rank_hold') jobs.push(idbSet('lastRankAt', nowMs));
        return Promise.all(jobs);
      }).then(function () { return n; });
    }).catch(function () { return null; });
  }

  function markOpen() { return idbSet('lastOpenAt', Date.now()).catch(function () {}); }

  root.NourNotif = {
    COOLDOWN_MS: COOLDOWN_MS,
    isQuietHour: isQuietHour,
    isPreferredHour: isPreferredHour,
    decideNotification: decideNotification,
    throttle: throttle,
    evaluate: evaluate,
    effHour: effHour,
    effMin: effMin,
    markOpen: markOpen,
    runCheck: runCheck,
    dayKey: dayKey,
    idbGet: idbGet,
    idbSet: idbSet
  };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

// nour-push-worker.js — Cloudflare Worker (Cron): بيبعت إشعارات "نور" كـ Push حقيقي عبر FCM HTTP v1
// حتى لو التطبيق مقفول. بيستخدم Firebase Service Account كسر في Cloudflare (مفيش مفاتيح في الكود).
//
// الفكرة:
//   • التطبيق (push.js) بيسجّل توكن FCM + سياق المستخدم (ورده/سلسلته/ترتيبه/تفضيلاته) في  pushDevices/<deviceId>
//   • كل دقيقة الـ Cron بيقرا الأجهزة، بيطبّق نفس منطق notif-logic.js بالظبط (مصدر واحد للحقيقة)
//     بتوقيت كل مستخدم، وبيبعت للي محتاج إشعار، وبيسجّل حالة الكبح في pushDevices/<id>/srv
//   • توكن منتهي (UNREGISTERED) بيتمسح تلقائيًا
//
// حدود الخطة المجانية اللي مراعيها: ٥٠ طلب خارجي للتشغيلة (بنحدّ الإرسال بـ MAX_SENDS) — اللي زاد بيكمل في التشغيلة اللي بعدها.

const NN = globalThis.NourNotif;

const MAX_SENDS = 38;                      // + طلب توكن + قراءة + كتابة = تحت حد الـ ٥٠
const STALE_DEVICE_MS = 60 * 86400000;     // جهاز ما فتحش التطبيق ٦٠ يوم → نمسحه
const SCOPES = [
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ───────── OAuth: Service Account → Access Token (JWT RS256 بـ WebCrypto) ─────────
let tokenCache = { value: null, exp: 0 };

const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlStr = (str) => b64url(new TextEncoder().encode(str));

function parseSA(env) {
  let sa;
  try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT مش JSON صالح'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT ناقص (client_email/private_key/project_id)');
  return sa;
}

async function getAccessToken(sa) {
  const nowS = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 120 > nowS) return tokenCache.value;
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({
    iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: nowS, exp: nowS + 3600,
  }));
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + b64url(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('OAuth فشل: ' + (j.error_description || j.error || res.status));
  tokenCache = { value: j.access_token, exp: nowS + (j.expires_in || 3600) };
  return tokenCache.value;
}

// ───────── توقيت المستخدم: Date "حائط" — حقوله المحلية = ساعة المستخدم (الـ Worker بيشتغل UTC فالـ getHours() بتطلّع ساعته هو) ─────────
function wallClock(tz, nowMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Africa/Cairo', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(nowMs));
    const g = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    return new Date(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  } catch (e) {
    return new Date(nowMs + 3 * 3600000 - (new Date(nowMs).getTimezoneOffset() * 60000)); // احتياطي: القاهرة تقريبًا
  }
}

// ───────── Realtime Database (REST) + FCM ─────────
async function dbGet(env, token, path) {
  const res = await fetch(env.FIREBASE_DB_URL + '/' + path + '.json', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('DB read ' + res.status);
  return res.json();
}
// تحديث متعدد المسارات في طلب واحد (null = مسح)
async function dbMultiUpdate(env, token, updates) {
  if (!Object.keys(updates).length) return;
  const res = await fetch(env.FIREBASE_DB_URL + '/.json', {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('DB write ' + res.status);
}

async function sendFcm(sa, token, deviceToken, n, base, platform) {
  const data = { title: n.title, body: n.body, tag: n.tag || 'nour' };
  if (n.data) { if (n.data.deeplink) data.deeplink = n.data.deeplink; if (n.data.surah) data.surah = n.data.surah; }
  const res = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: platform === 'android'
        ? {
            // تطبيق أندرويد أصلي: لازم notification block عشان النظام يعرضه والتطبيق مقفول (رسائل data بس ما بتظهرش لوحدها)
            token: deviceToken,
            notification: { title: n.title, body: n.body },
            data,
            android: { priority: 'HIGH', ttl: '21600s', notification: { channel_id: 'nour', icon: 'ic_stat_nour', color: '#C9973A', tag: n.tag || 'nour' } },
          }
        : {
            token: deviceToken,
            data,   // ويب: الـ SW (sw.js → push) هو اللي بيعرض الإشعار بنفس شكل الإشعار المحلي
            webpush: { headers: { Urgency: 'normal', TTL: '21600' }, fcm_options: { link: base } },
          },
    }),
  });
  if (res.ok) return { ok: true };
  const j = await res.json().catch(() => ({}));
  const status = (j.error && j.error.status) || '';
  const dead = res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED' || (res.status === 400 && status === 'INVALID_ARGUMENT');
  return { ok: false, dead, status: res.status, msg: (j.error && j.error.message) || '' };
}

// ───────── التشغيلة الأساسية ─────────
async function run(env, opts) {
  opts = opts || {};
  const sa = parseSA(env);
  const token = await getAccessToken(sa);
  const devices = (await dbGet(env, token, 'pushDevices')) || {};
  const base = env.SITE_BASE || '/nourquran/';
  const nowMs = Date.now();
  const updates = {};
  const stats = { devices: 0, sent: 0, skipped: 0, dead: 0, errors: 0, deferred: 0 };

  // الأقدم إرسالًا أولًا — عشان لو في زحمة محدّش يتأخر على طول
  const ids = Object.keys(devices).sort((a, b) => ((devices[a].srv || {}).lastNotifAt || 0) - ((devices[b].srv || {}).lastNotifAt || 0));
  for (const id of ids) {
    const d = devices[id]; stats.devices++;
    if (!d || typeof d !== 'object' || !d.token) { updates['pushDevices/' + id] = null; continue; }
    if (d.updated && nowMs - d.updated > STALE_DEVICE_MS) { updates['pushDevices/' + id] = null; stats.dead++; continue; }
    const c = d.ctx;
    if (!c || !c.prefs || !c.prefs.enabled) { stats.skipped++; continue; }
    if (!('doneDay' in c)) c.doneDay = null;   // Realtime DB بيشيل القيم null — المنطق بيعتمد على وجود الحقل
    const srv = d.srv || {};
    const now = wallClock(d.tz, nowMs);
    const ev = NN.evaluate(c, {
      last: srv.lastNotifAt || 0, lastOpen: d.openAt || 0, ignored: srv.ignored || 0, log: srv.sentLog || [], lastRankAt: srv.lastRankAt || 0,
    }, now, nowMs);
    if (!ev) { stats.skipped++; continue; }
    if (stats.sent >= MAX_SENDS) { stats.deferred++; continue; }
    if (opts.dry) { stats.sent++; continue; }

    const r = await sendFcm(sa, token, d.token, ev.n, base, d.platform);
    if (r.ok) {
      stats.sent++;
      const keep = (Array.isArray(srv.sentLog) ? srv.sentLog : []).filter((t) => nowMs - t < 7 * 86400000); keep.push(nowMs);
      updates['pushDevices/' + id + '/srv'] = {
        lastNotifAt: nowMs, ignored: ev.ignored, sentLog: keep,
        lastRankAt: (ev.n.tag === 'rank_drop' || ev.n.tag === 'rank_hold') ? nowMs : (srv.lastRankAt || 0),
      };
    } else if (r.dead) { stats.dead++; updates['pushDevices/' + id] = null; }
    else { stats.errors++; console.warn('FCM', id, r.status, r.msg); }
  }
  if (!opts.dry) await dbMultiUpdate(env, token, updates);
  return stats;
}

// إرسال تجريبي فوري لجهاز واحد (أو كل الأجهزة) — بيتحمي بـ ADMIN_KEY
async function testPush(env, deviceId) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const devices = (await dbGet(env, token, 'pushDevices')) || {};
  const out = [];
  for (const id of Object.keys(devices).filter((k) => !deviceId || k === deviceId).slice(0, 20)) {
    const d = devices[id]; if (!d || !d.token) continue;
    const r = await sendFcm(sa, token, d.token, { tag: 'nour_test', title: '🔔 اختبار إشعارات نور', body: 'لو شايف الرسالة دي يبقى الإشعار من السيرفر شغّال ✅', data: { deeplink: 'home' } }, env.SITE_BASE || '/nourquran/', d.platform);
    out.push({ id, ok: r.ok, status: r.status, msg: r.msg });
    if (r.dead) await dbMultiUpdate(env, token, { ['pushDevices/' + id]: null });
  }
  return out;
}

// ★ v126: اختبار ذاتي من التطبيق — بيبعت إشعار تجريبي لجهاز واحد بس (المعرّف العشوائي بتاعه هو الإذن) مع حد ١ كل ٢٠ ثانية
async function selfTest(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://nourquranofficial.github.io').split(',').map((x) => x.trim());
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  const h = { 'Access-Control-Allow-Origin': ok ? origin : allowed[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const out = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST' || !ok) return out({ error: 'forbidden' }, 403);
  let id = ''; try { id = String((await req.json()).device || ''); } catch (e) {}
  if (!/^[a-z0-9]{16,64}$/.test(id)) return out({ error: 'BAD_DEVICE' }, 400);
  const sa = parseSA(env), token = await getAccessToken(sa);
  const d = await dbGet(env, token, 'pushDevices/' + id);
  if (!d || !d.token) return out({ error: 'الجهاز مش مسجّل في pushDevices (التسجيل لسه ما تمّش)' }, 404);
  const now = Date.now();
  if (d.srv && d.srv.lastTestAt && now - d.srv.lastTestAt < 20000) return out({ error: 'استنى ٢٠ ثانية بين كل تجربة' }, 429);
  const r = await sendFcm(sa, token, d.token, { tag: 'nour_test', title: '🔔 اختبار إشعارات نور', body: 'لو شايف الرسالة دي يبقى الإشعار من السيرفر شغّال ✅', data: { deeplink: 'home' } }, env.SITE_BASE || '/nourquran/', d.platform);
  await dbMultiUpdate(env, token, r.dead ? { ['pushDevices/' + id]: null } : { ['pushDevices/' + id + '/srv/lastTestAt']: now });
  return out(r.ok ? { ok: true } : { ok: false, error: 'FCM ' + r.status + ' ' + (r.msg || ''), dead: !!r.dead }, r.ok ? 200 : 502);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env).then((s) => console.log('nour-push', JSON.stringify(s))).catch((e) => console.error('nour-push FAILED:', e && e.message)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (url.pathname === '/self-test') { try { return await selfTest(env, req); } catch (e) { return json({ error: String(e && e.message) }, 500); } }
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'nour-push' });
    const authed = env.ADMIN_KEY && req.headers.get('X-Admin-Key') === env.ADMIN_KEY;
    if (!authed) return json({ error: 'unauthorized' }, 401);
    try {
      if (url.pathname === '/test' && req.method === 'POST') return json({ results: await testPush(env, url.searchParams.get('device')) });
      if (url.pathname === '/dry-run' && req.method === 'POST') return json(await run(env, { dry: true }));   // يحسب مين هيوصله إشعار من غير ما يبعت
      if (url.pathname === '/run' && req.method === 'POST') return json(await run(env));
    } catch (e) { return json({ error: String(e && e.message) }, 500); }
    return json({ error: 'not_found' }, 404);
  },
};
