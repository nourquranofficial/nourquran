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

  // ctx: { rank, prevRank, streak, playedToday, surahs, prefs, hour }
  function decideNotification(ctx) {
    if (!ctx || !ctx.prefs || !ctx.prefs.enabled) return null;
    if (isQuietHour(ctx.hour)) return null;
    if (!isPreferredHour(ctx.hour, ctx.prefs.notifTime)) return null;

    var prefs = ctx.prefs;

    // 1) تراجع واضح في الترتيب
    if (prefs.rankAlerts && ctx.rank != null && ctx.prevRank != null) {
      var droppedOutTop10 = ctx.prevRank <= 10 && ctx.rank > 10;
      var droppedALot = (ctx.rank - ctx.prevRank) >= 3;
      if (droppedOutTop10 || droppedALot) {
        return {
          tag: 'rank_drop',
          title: pick(MESSAGES.rankDrop.titles),
          body: pick(MESSAGES.rankDrop.bodies)(ctx),
          data: { deeplink: 'leaderboard' }
        };
      }
    }

    // 2) خطر انقطاع السلسلة (مساءً ولسه ما لعبش النهارده)
    if (prefs.streakReminder && ctx.streak > 0 && !ctx.playedToday && ctx.hour >= 18) {
      // ★ لو معاه سورة شغال عليها دلوقتي، الديب لينك يوديه يكمّل فيها مباشرة
      var streakSurah = (ctx.surahs && ctx.surahs.length) ? ctx.surahs[0].surah : null;
      return {
        tag: 'streak_risk',
        title: pick(MESSAGES.streakRisk.titles),
        body: pick(MESSAGES.streakRisk.bodies)(ctx),
        data: streakSurah ? { deeplink: 'surah', surah: streakSurah } : { deeplink: 'home' }
      };
    }

    // 3) تحدي اليوم المخصص بالسورة اللي بيحفظها دلوقتي
    if (prefs.dailyChallenge && !ctx.playedToday && ctx.surahs && ctx.surahs.length) {
      var sInfo = buildSurahInfo(ctx.surahs[0]);
      return {
        tag: 'daily_challenge',
        title: pick(MESSAGES.daily.titles),
        body: pick(MESSAGES.daily.bodies)(ctx, sInfo),
        data: { deeplink: 'surah', surah: sInfo.name }
      };
    }

    // 4) تشجيع على الحفاظ على ترتيب عالي (بس لو مفيش حاجة أهم تتقال)
    if (prefs.rankAlerts && ctx.rank != null && ctx.rank <= 10 && ctx.prevRank != null && ctx.rank <= ctx.prevRank) {
      return {
        tag: 'rank_hold',
        title: pick(MESSAGES.rankHold.titles),
        body: pick(MESSAGES.rankHold.bodies)(ctx),
        data: { deeplink: 'leaderboard' }
      };
    }

    return null;
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
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function idbSet(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  root.NourNotif = {
    COOLDOWN_MS: COOLDOWN_MS,
    isQuietHour: isQuietHour,
    isPreferredHour: isPreferredHour,
    decideNotification: decideNotification,
    idbGet: idbGet,
    idbSet: idbSet
  };
})(typeof self !== 'undefined' ? self : this);
