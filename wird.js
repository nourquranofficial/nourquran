// wird.js — «الورد اليومي» + التذكير الذكي + زر التثبيت + المشاركة
// هدف الملف: يحوّل نور من لعبة بتتفتح مرة لعادة يومية (ورد) — ده اللي بيرفع الاحتفاظ بالمستخدمين
// وبيخلي التطبيق صدقة جارية فعلاً (استمرار + مشاركة).
// بيعتمد على: currentUser, toArabicNum, openGameSheet, _surahDropdownSelect, SURAHS_META (موجودين في index.html)
(function () {
  'use strict';

  var GOALS = [5, 10, 20, 40];
  var DEFAULT_GOAL = 10;
  var SHARE_URL = 'https://nourquranofficial.github.io/nourquran/';
  var deferredInstall = null;

  // ---------- أدوات ----------
  function ar(n) { try { return typeof toArabicNum === 'function' ? toArabicNum(n) : String(n); } catch (e) { return String(n); } }
  // عدّ عربي صح: ١ يوم، ٣–١٠ أيام، ١١+ يوم
  function dayWord(n) { return (n === 1 || n > 10) ? 'يوم' : 'أيام'; }
  function ayaWord(n) { return (n >= 3 && n <= 10) ? 'آيات' : 'آية'; }
  function dayKey(d) { return NourNotif.dayKey(d || new Date()); }
  // ★ إزاحة بالأيام على التقويم (مش ٢٤ ساعة ثابتة) — مع التوقيت الصيفي كان اليوم بيتعدّى وبتتكسر السلسلة
  function shiftDay(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  // عدّ عربي صح للأيام: يوم / يومان / ٣–١٠ أيام / ١١+ يوم
  function dayText(n) { return n === 2 ? 'يومان' : ar(n) + ' ' + dayWord(n); }
  function user() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function uname() { var u = user(); return (u && u.username) ? u.username : 'guest'; }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function isStandalone() {
    try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
  }

  // ---------- حالة الورد ----------
  function wKey() { return 'nour_wird_' + uname(); }
  function load() {
    var w = lsGet(wKey(), null) || {};
    if (!w.goal) w.goal = DEFAULT_GOAL;
    if (!w.hist) w.hist = {};        // { 'YYYY-MM-DD': {d: عدد الإجابات, g: الهدف وقتها} }
    if (!w.prefs) w.prefs = { enabled: false, notifTime: 'auto', rankAlerts: true, streakReminder: true, dailyChallenge: true };
    if (!w.celebrated) w.celebrated = '';
    if (!w.goalAt) w.goalAt = 0;
    return w;
  }
  function save(w) {
    // احتفظ بآخر ٤٠٠ يوم (السجل خفيف) — كان ٩٠ وبيقطع السلسلة الطويلة
    var keys = Object.keys(w.hist).sort();
    while (keys.length > 400) delete w.hist[keys.shift()];
    lsSet(wKey(), w);
  }
  function todayRec(w) {
    var k = dayKey();
    if (!w.hist[k]) w.hist[k] = { d: 0, g: w.goal };
    return w.hist[k];
  }
  function reached(rec) { return rec && rec.d >= (rec.g || DEFAULT_GOAL); }

  // سلسلة الأيام المتتالية اللي اتحقق فيها الورد. لو النهارده لسه ما اتحققش، بنعدّ من امبارح (لسه ممكن تكمّل النهارده)
  function streakInfo(w) {
    var d = new Date(), n = 0, lastDay = null;
    if (!reached(w.hist[dayKey(d)])) d = shiftDay(d, -1);
    while (reached(w.hist[dayKey(d)])) { if (!lastDay) lastDay = dayKey(d); n++; d = shiftDay(d, -1); }
    var best = 0, run = 0, prev = null;
    Object.keys(w.hist).sort().forEach(function (k) {
      if (!reached(w.hist[k])) { run = 0; prev = null; return; }
      var t = new Date(k + 'T00:00:00').getTime();
      run = (prev !== null && Math.round((t - prev) / 86400000) === 1) ? run + 1 : 1;
      prev = t; if (run > best) best = run;
    });
    return { streak: n, lastDay: lastDay, best: Math.max(w.best || 0, best, n) };
  }

  // ---------- ★ v117: وقتك المعتاد في اللعب (محلي على الجهاز) — بيتستخدم لاختيار وقت التذكير تلقائيًا ----------
  function noteHour(w) {
    var h = new Date().getHours(), hr = w.hrs || (w.hrs = {}), tot = 0, k;
    hr[h] = (hr[h] || 0) + 1;
    for (k in hr) tot += hr[k];
    if (tot > 300) for (k in hr) hr[k] = Math.floor(hr[k] / 2);   // الأحدث أهم من القديم
  }
  function usualHour(w) {
    var hr = w.hrs || {}, tot = 0, k, best = null, bs = 0, h;
    for (k in hr) tot += hr[k];
    if (tot < 8) return null;            // لسه معرفناش عادته
    for (h = 0; h < 24; h++) {
      var s = (hr[h] || 0) + 0.5 * ((hr[(h + 23) % 24] || 0) + (hr[(h + 1) % 24] || 0));
      if (s > bs) { bs = s; best = h; }
    }
    if (best == null) return null;
    return Math.min(22, Math.max(7, best));   // مفيش تذكير بين ١١ م و٧ ص
  }

  // ---------- تسجيل الإجابات (بيتنادى من handleResult) ----------
  function onAnswer(isRight) {
    try {
      var w = load(), rec = todayRec(w), was = reached(rec);
      rec.d++;
      if (isRight) { w.totalRight = (w.totalRight || 0) + 1; }
      w.totalAnswers = (w.totalAnswers || 0) + 1;
      noteHour(w);
      var now = reached(rec);
      if (now) { var si0 = streakInfo(w); if (si0.streak > (w.best || 0)) w.best = si0.streak; }
      save(w);
      renderCard();
      syncCtx();
      // وسط اللعب: إشعار خفيف بس — شاشة الاحتفال بتظهر لما يرجع للرئيسية
      if (!was && now) toast('🏆 أتممت وردك اليوم — تقبّل الله منك');
      dirtyAt = Date.now();
      scheduleSync(now && !was ? 800 : 4000); // لحظة تحقيق الورد أهم حاجة تتأمّن
    } catch (e) { console.warn('wird.onAnswer', e); }
  }

  // ---------- الكارت في الرئيسية ----------
  var css = [
    '#wirdCard{margin:0 0 12px;padding:9px 12px;border-radius:18px;direction:rtl;font-family:"Cairo",sans-serif;display:flex;align-items:center;gap:11px;background:linear-gradient(145deg,rgba(201,151,58,.14),rgba(27,107,74,.16));border:1px solid rgba(201,151,58,.3);transition:border-color .4s,background .4s}',
    '#wirdCard.is-done{border-color:rgba(125,255,201,.42);background:linear-gradient(145deg,rgba(46,175,120,.2),rgba(201,151,58,.1))}',
    '#wirdCard .w-ring{position:relative;width:46px;height:46px;flex:none}',
    '#wirdCard .w-ring svg{width:100%;height:100%;transform:rotate(-90deg)}',
    '#wirdCard .w-ring circle{fill:none;stroke-width:10;stroke-linecap:round}',
    '#wirdCard .w-ring .bg{stroke:rgba(255,255,255,.1)}',
    '#wirdCard .w-ring .fg{stroke:url(#wirdGrad);transition:stroke-dashoffset .7s cubic-bezier(.3,.7,.2,1)}',
    '#wirdCard .w-ring-c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:#fff}',
    '#wirdCard.is-done .w-ring-c{color:#7DFFC9}',
    '#wirdCard .w-body{flex:1;min-width:0;cursor:pointer;line-height:1.35}',
    '#wirdCard .w-t1{font-size:14.5px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#wirdCard.is-done .w-t1{color:#7DFFC9}',
    '#wirdCard .w-t2{display:flex;align-items:center;gap:8px;margin-top:3px;font-size:11.5px;color:rgba(245,217,139,.78)}',
    '#wirdCard .w-dots{display:flex;gap:4px}',
    '#wirdCard .w-dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.14)}',
    '#wirdCard .w-dots i.part{background:rgba(201,151,58,.6)}',
    '#wirdCard .w-dots i.ok{background:#2EAF78}',
    '#wirdCard .w-dots i.today{box-shadow:0 0 0 1.5px rgba(245,217,139,.7)}',
    '#wirdCard .w-go{width:40px;height:40px;flex:none;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;background:linear-gradient(135deg,#C9973A,#E8B84B);color:#1A1208;box-shadow:0 3px 10px rgba(201,151,58,.3);padding:0}',
    '#wirdCard .w-go:active{transform:scale(.94)}',
    '#wirdCard.is-done .w-go{background:rgba(255,255,255,.08);border:1px solid rgba(245,217,139,.35);color:var(--gold-light,#F5D98B);box-shadow:none}',
    '#wirdCard .w-more{width:32px;height:40px;flex:none;border:none;background:transparent;color:rgba(245,217,139,.75);font-size:20px;line-height:1;cursor:pointer;padding:0}',
    '.w-goals{display:flex;gap:6px;align-items:center;margin:8px 0 2px}',
    '.w-goals button{flex:1;min-height:38px;border-radius:10px;border:1px solid rgba(245,217,139,.25);background:transparent;color:#F5D98B;font-family:inherit;font-size:14px;cursor:pointer}',
    '.w-goals button.on{background:rgba(201,151,58,.3);border-color:#C9973A;font-weight:800}',
    '.w-lbl{font-size:12px;color:rgba(245,217,139,.7);text-align:right;margin-top:10px}',
    '.w-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl;font-family:"Cairo",sans-serif}',
    '.w-box{width:100%;max-width:360px;background:#1d1409;border:1px solid rgba(201,151,58,.5);border-radius:20px;padding:20px 18px;color:#F5D98B;text-align:center;max-height:88vh;overflow:auto}',
    '.w-box h3{margin:0 0 6px;font-size:19px;color:#F5D98B}',
    '.w-box p{margin:6px 0;font-size:13px;line-height:1.8;color:rgba(245,217,139,.8)}',
    '.w-box .w-btn{display:block;width:100%;margin-top:10px;padding:11px;border-radius:12px;border:none;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#C9973A,#E8B84B);color:#1A1208}',
    '.w-box .w-btn.alt{background:transparent;border:1px solid rgba(245,217,139,.35);color:#F5D98B;font-weight:600}',
    '.w-set{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 4px;border-bottom:1px dashed rgba(245,217,139,.18);font-size:13px;text-align:right}',
    '.w-set select{background:#2a1c0c;color:#F5D98B;border:1px solid rgba(245,217,139,.3);border-radius:8px;padding:5px 8px;font-family:inherit}',
    '.w-set input[type=checkbox]{width:20px;height:20px;accent-color:#2EAF78}',
    '.w-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 2px;justify-content:center}',
    '.w-chip{min-height:40px;padding:6px 12px;border-radius:999px;border:1px solid rgba(245,217,139,.3);background:transparent;color:#F5D98B;font-family:inherit;font-size:13px;cursor:pointer}',
    '.w-chip.on{background:rgba(201,151,58,.35);border-color:#C9973A;font-weight:800}',
    '.w-set input[type=time]{background:#2a1c0c;color:#F5D98B;border:1px solid rgba(245,217,139,.3);border-radius:8px;padding:6px 8px;font-family:inherit;color-scheme:dark}',
    '.w-hint{font-size:12px;color:rgba(245,217,139,.7);margin:6px 0 4px;min-height:18px}',
    '@media (prefers-reduced-motion:reduce){#wirdCard,#wirdCard .w-ring .fg{transition:none}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('wirdStyle')) return;
    var s = document.createElement('style'); s.id = 'wirdStyle'; s.textContent = css; document.head.appendChild(s);
  }

  function mount() {
    var card = document.getElementById('wirdCard');
    if (card) return card;
    var anchor = document.querySelector('#homeScreen .stats-row');
    if (!anchor) return null;
    card = document.createElement('div'); card.id = 'wirdCard';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    return card;
  }

  var RING_C = 251.33;      // محيط الدايرة (نق = ٤٠)
  var lastPct = null;       // عشان الحلقة تتحرك من آخر نسبة مش تتصفّر

  function homeVisible() {
    var h = document.getElementById('homeScreen');
    return !!(h && h.classList.contains('show')) && !document.querySelector('.w-modal');
  }
  // الاحتفال بيظهر في الرئيسية بس (مش في نص السؤال) — ولو التطبيق اتقفل قبل كده بيظهر أول ما يفتح
  var celTimer = null;
  function tryCelebrate() {
    if (celTimer) return;
    celTimer = setTimeout(function () {
      celTimer = null;
      var w = load(), k = dayKey();
      if (reached(w.hist[k]) && w.celebrated !== k && homeVisible()) celebrate();
    }, 900);
  }

  // لقطة صغيرة للودجت (widget.html بيقراها) — نفس الأصل (origin) فبتتشارك عبر localStorage
  function writeWidgetSnap(w, rec, si) {
    try {
      localStorage.setItem('nour_widget_snap', JSON.stringify({
        day: dayKey(), d: rec ? rec.d : 0, g: rec ? (rec.g || w.goal) : w.goal,
        streak: si.streak, lastDay: si.lastDay, t: Date.now()
      }));
    } catch (e) {}
  }

  function renderCard() {
    injectStyle();
    var card = mount(); if (!card || !user()) return;
    var w = load(), rec = todayRec(w), si = streakInfo(w);
    var goal = rec.g = (rec.d === 0 ? w.goal : (rec.g || w.goal)); // الهدف يتغيّر بحرية قبل ما تبدأ النهارده
    var pct = Math.min(100, Math.round(rec.d / goal * 100)), done = rec.d >= goal;
    var left = Math.max(0, goal - rec.d);
    writeWidgetSnap(w, rec, si);

    var dots = '';
    for (var i = 6; i >= 0; i--) {
      var dt = shiftDay(new Date(), -i), r = w.hist[dayKey(dt)];
      dots += '<i class="' + (reached(r) ? 'ok' : ((r && r.d > 0) ? 'part' : '')) + (i === 0 ? ' today' : '') + '"></i>';
    }
    var t1 = done ? 'أتممت وردك اليوم ✅' : (rec.d === 0 ? 'وردك اليوم · ' + ar(goal) + ' ' + ayaWord(goal) : 'باقي ' + ar(left) + ' ' + ayaWord(left));
    var t2 = '<span class="w-dots" aria-label="آخر ٧ أيام">' + dots + '</span>' +
      '<span>' + (si.streak > 0 ? '🔥 ' + dayText(si.streak) : 'ابدأ سلسلتك') + '</span>';

    card.className = done ? 'is-done' : '';
    card.innerHTML =
      '<div class="w-ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="تقدم الورد">' +
        '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="wirdGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2EAF78"/><stop offset="1" stop-color="#F5D98B"/></linearGradient></defs>' +
        '<circle class="bg" cx="50" cy="50" r="40"/><circle class="fg" cx="50" cy="50" r="40" stroke-dasharray="' + RING_C + '" stroke-dashoffset="' + RING_C + '"/></svg>' +
        '<div class="w-ring-c">' + (done ? '✓' : ar(Math.min(rec.d, 9999))) + '</div>' +
      '</div>' +
      '<div class="w-body" id="wirdBody"><div class="w-t1">' + t1 + '</div><div class="w-t2">' + t2 + '</div></div>' +
      '<button type="button" class="w-go" id="wirdGo" aria-label="' + (done ? 'زوّد وردك' : 'ابدأ وردك') + '">' + (done ? '＋' : '▶') + '</button>' +
      '<button type="button" class="w-more" id="wirdMore" aria-label="خيارات الورد">⋯</button>';

    // حركة الحلقة من آخر نسبة لحد النسبة الجديدة
    var fg = card.querySelector('.fg');
    if (fg) {
      var to = RING_C * (1 - pct / 100);
      if (lastPct === pct) { fg.style.strokeDashoffset = to; }
      else {
        fg.style.strokeDashoffset = RING_C * (1 - (lastPct || 0) / 100);
        requestAnimationFrame(function () { requestAnimationFrame(function () { fg.style.strokeDashoffset = to; }); });
      }
    }
    lastPct = pct;

    card.querySelector('#wirdGo').onclick = startWird;
    card.querySelector('#wirdBody').onclick = startWird;
    card.querySelector('#wirdMore').onclick = openOptions;

    if (done && w.celebrated !== dayKey()) tryCelebrate();
  }

  // ---------- قائمة «⋯»: الهدف / التذكير / المشاركة / التثبيت / الودجت ----------
  function openOptions() {
    var w = load(), notifOn = w.prefs.enabled && ('Notification' in window) && Notification.permission === 'granted';
    var canInstall = !!deferredInstall && !isStandalone();
    var goalsHtml = GOALS.map(function (g) { return '<button type="button" data-g="' + g + '" class="' + (g === w.goal ? 'on' : '') + '">' + ar(g) + '</button>'; }).join('');
    var m = modal(
      '<h3>🌙 خيارات الورد</h3>' +
      '<div class="w-lbl">الهدف اليومي (آيات)</div><div class="w-goals">' + goalsHtml + '</div>' +
      '<button class="w-btn alt" id="woBell">' + (notifOn ? '🔔 التذكير شغّال — تعديل' : '🔕 فعّل التذكير') + '</button>' +
      '<button class="w-btn alt" id="woWidget">📱 أضف ودجت للشاشة الرئيسية</button>' +
      (canInstall ? '<button class="w-btn alt" id="woInstall">📲 ثبّت التطبيق</button>' : '') +
      '<button class="w-btn alt" id="woShare">🤍 شارك نور</button>' +
      '<button class="w-btn alt" id="woX">إغلاق</button>');
    Array.prototype.forEach.call(m.querySelectorAll('.w-goals button'), function (b) {
      b.onclick = function () {
        var ww = load(), ng = +b.getAttribute('data-g'); ww.goal = ng; ww.goalAt = Date.now();
        var r = todayRec(ww);
        // قبل ما يحقق وردك النهارده: الهدف الجديد بيتطبق فوراً (رفع أو تخفيض). بعد ما يتحقق: من بكرة عشان السلسلة متتكسرش.
        if (!reached(r)) r.g = ng;
        else if (ng !== r.g) toast('الهدف الجديد هيبدأ من بكرة 🌙');
        save(ww); m.remove(); renderCard(); syncCtx(); scheduleSync(1500);
      };
    });
    m.querySelector('#woBell').onclick = function () { m.remove(); openSettings(); };
    m.querySelector('#woWidget').onclick = function () { m.remove(); openWidgetHelp(); };
    m.querySelector('#woShare').onclick = share;
    var ib = m.querySelector('#woInstall'); if (ib) ib.onclick = function () { m.remove(); install(); };
    m.querySelector('#woX').onclick = function () { m.remove(); };
  }

  // ---------- شرح إضافة الودجت ----------
  function widgetUrl() { try { return new URL('widget.html', location.href).href; } catch (e) { return 'widget.html'; } }
  function openWidgetHelp() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var steps = ios
      ? '١) افتح صفحة الودجت (الزر تحت) في Safari<br>٢) اضغط زر المشاركة ⬆️<br>٣) اختر «إضافة إلى الشاشة الرئيسية»'
      : '١) افتح صفحة الودجت (الزر تحت) في Chrome<br>٢) اضغط ⋮ من فوق<br>٣) اختر «إضافة إلى الشاشة الرئيسية»';
    var m = modal(
      '<div style="font-size:38px">📱</div><h3>ودجت الورد</h3>' +
      '<p>بطاقة صغيرة بتعرض تقدمك وسلسلتك، وبضغطة تكمل وردك — بتتحدّث لوحدها وبتشتغل من الشاشة الرئيسية.</p>' +
      '<p style="text-align:right;background:rgba(0,0,0,.25);border-radius:12px;padding:10px 12px">' + steps + '</p>' +
      '<button class="w-btn" id="wwOpen">افتح صفحة الودجت</button><button class="w-btn alt" id="wwX">إغلاق</button>');
    m.querySelector('#wwOpen').onclick = function () { m.remove(); window.open(widgetUrl(), '_blank'); };
    m.querySelector('#wwX').onclick = function () { m.remove(); };
  }

  // ---------- زر البدء: يكمل آخر سورة بدأها، وإلا يفتح اختيار التحدي ----------
  function inProgressSurahs() {
    var out = [];
    try {
      var prog = lsGet('nour_surahprog_' + uname(), {});
      var rev = lsGet('nour_revprog_' + uname(), {});
      var totals = {};
      if (typeof QURAN_DB !== 'undefined') Object.keys(QURAN_DB).forEach(function (k) { QURAN_DB[k].forEach(function (q) { if (q.surah) totals[q.surah] = (totals[q.surah] || 0) + 1; }); });
      Object.keys(prog).forEach(function (s) { if (prog[s] > 0 && totals[s] && prog[s] < totals[s]) out.push({ surah: s, nextIdx: prog[s], total: totals[s] }); });
      Object.keys(rev).forEach(function (s) {
        var p = rev[s]; if (p && p.inProgress && totals[s] && !out.some(function (o) { return o.surah === s; })) out.push({ surah: s, nextIdx: p.done || 0, total: p.total || totals[s], last: p.lastPlay || 0 });
      });
    } catch (e) {}
    return out;
  }
  function openSurah(name) {
    try {
      if (typeof _surahDropdownSelect === 'function' && typeof SURAHS_META !== 'undefined') {
        var idx = SURAHS_META.findIndex(function (s) { return s[0] === name; });
        if (idx >= 0) _surahDropdownSelect(name, (idx + 1) + '. سورة ' + name);
      }
    } catch (e) {}
    if (typeof openGameSheet === 'function') openGameSheet();
  }
  function startWird() {
    var list = inProgressSurahs();
    if (list.length) { openSurah(list[0].surah); } else if (typeof openGameSheet === 'function') { openGameSheet(); }
  }

  // ---------- احتفال بإتمام الورد ----------
  function modal(html) {
    var m = document.createElement('div'); m.className = 'w-modal';
    m.innerHTML = '<div class="w-box" role="dialog" aria-modal="true">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    // Escape بيقفل النافذة (كان الإغلاق بالنقر بس)
    var onEsc = function (e) { if (!document.body.contains(m)) { document.removeEventListener('keydown', onEsc); return; } if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', onEsc); } };
    document.addEventListener('keydown', onEsc);
    document.body.appendChild(m);
    var fb = m.querySelector('button'); if (fb) { try { fb.focus({ preventScroll: true }); } catch (e) {} }
    return m;
  }
  function celebrate() {
    var w = load(); var k = dayKey(); if (w.celebrated === k) return; w.celebrated = k; save(w);
    var si = streakInfo(w);
    var needBell = !(w.prefs.enabled && ('Notification' in window) && Notification.permission === 'granted') && ('Notification' in window) && Notification.permission !== 'denied';
    var m = modal(
      '<div style="font-size:46px">🏆</div><h3>أتممت وردك اليوم!</h3>' +
      '<p>🔥 سلسلتك ' + dayText(si.streak) + (si.best > si.streak ? ' — أفضل سلسلة لك ' + ar(si.best) : '') + '</p>' +
      '<p>«خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ»<br>شارك التطبيق مع من تحب — كل حافظ بسببك يصلك أجره بإذن الله 🤍</p>' +
      '<button class="w-btn" id="wcShare">🤍 شارك نور — صدقة جارية</button>' +
      (needBell ? '<button class="w-btn alt" id="wcBell">🔔 ذكّرني بوردي كل يوم</button>' : '') +
      '<button class="w-btn alt" id="wcClose">تقبّل الله منا ومنكم</button>');
    m.querySelector('#wcShare').onclick = share;
    var b = m.querySelector('#wcBell'); if (b) b.onclick = function () { m.remove(); enableReminders(); };
    m.querySelector('#wcClose').onclick = function () { m.remove(); };
  }

  // ---------- المشاركة ----------
  function share() {
    var w = load(), si = streakInfo(w);
    var text = 'أحفظ القرآن وأراجعه كل يوم مع تطبيق «نور» 🌙' + (si.streak > 1 ? ' — وردي ' + ar(si.streak) + ' أيام متتالية 🔥' : '') +
      '\nمجاني وبدون إعلانات — وكل من يحفظ بسببك لك مثل أجره بإذن الله 🤍\n' + SHARE_URL;
    if (navigator.share) { navigator.share({ title: 'نور — حفظ القرآن', text: text }).catch(function () {}); return; }
    try { navigator.clipboard.writeText(text).then(function () { toast('اتنسخ رابط المشاركة 🤍'); }, function () { window.prompt('انسخ الرسالة:', text); }); } catch (e) { window.prompt('انسخ الرسالة:', text); }
  }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }

  // ---------- التثبيت ----------
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; renderCard(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; renderCard(); });
  function install() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(function () { deferredInstall = null; renderCard(); });
  }

  // ---------- التذكير ----------
  function openSettings() {
    var w = load(), p = w.prefs;
    // ★ v121: اختيار الوقت بأزرار جاهزة + وقت مخصّص (أي وقت) بدل قايمة طويلة
    var PRESETS = [['auto', '🤖 تلقائي'], ['08:00', '🌅 ٨ ص'], ['13:00', '☀️ ١ ظهرًا'], ['17:00', '🌇 ٥ عصرًا'], ['20:00', '🌙 ٨ م'], ['22:00', '😴 ١٠ م']];
    var curT = (!p.notifTime || p.notifTime === 'auto') ? 'auto' : p.notifTime;
    var isPreset = PRESETS.some(function (x) { return x[0] === curT; });
    var chips = PRESETS.map(function (x) { return '<button type="button" class="w-chip' + (x[0] === curT ? ' on' : '') + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    var customVal = (curT !== 'auto') ? curT : '';
    var denied = ('Notification' in window) && Notification.permission === 'denied';
    var unsupported = !('Notification' in window);
    var m = modal(
      '<h3>🔔 تذكير الورد</h3>' +
      '<p>تذكير مخصّص لهدفك وتقدّمك في الورد، بحد أقصى ٤ في الأسبوع، وبيهدى لوحده لو ما فتحتش التطبيق. في الوضع التلقائي مفيش إشعارات بين ١١ م و٧ ص، ولو اخترت وقت بنفسك بيجيلك فيه بالظبط.</p>' +
      (unsupported ? '<p style="color:#ffb784">المتصفح ده مش بيدعم الإشعارات.</p>' : '') +
      (denied ? '<p style="color:#ffb784">الإشعارات متقفلة من إعدادات المتصفح/التطبيق — فعّلها من هناك الأول.</p>' : '') +
      '<div class="w-set"><span>تفعيل التذكير</span><input type="checkbox" id="wsOn"' + (p.enabled ? ' checked' : '') + '></div>' +
      '<div class="w-lbl">⏰ وقت التذكير</div>' +
      '<div class="w-chips" id="wsChips">' + chips + '</div>' +
      '<div class="w-set"><span>أو اختار وقت تاني</span><input type="time" id="wsTimeCustom" value="' + customVal + '"></div>' +
      '<div class="w-hint" id="wsHint"></div>' +
      '<div class="w-set"><span>تنبيه لما سلسلتي تكون في خطر</span><input type="checkbox" id="wsStreak"' + (p.streakReminder ? ' checked' : '') + '></div>' +
      '<div class="w-set"><span>تحدي اليوم (كمّل سورتك)</span><input type="checkbox" id="wsDaily"' + (p.dailyChallenge ? ' checked' : '') + '></div>' +
      '<div class="w-set"><span>تنبيهات الترتيب</span><input type="checkbox" id="wsRank"' + (p.rankAlerts ? ' checked' : '') + '></div>' +
      '<button class="w-btn alt" id="wsDiagBtn" type="button">🩺 فحص الإشعارات / تجربة</button>' +
      '<div id="wsDiag" style="display:none;white-space:pre-wrap;direction:rtl;text-align:right;font-size:12px;line-height:1.9;background:rgba(0,0,0,.25);border-radius:10px;padding:10px;margin:8px 0;max-height:220px;overflow:auto"></div>' +
      '<button class="w-btn" id="wsSave">حفظ</button><button class="w-btn alt" id="wsX">إغلاق</button>');
    var selT = curT, hintEl = m.querySelector('#wsHint'), customEl = m.querySelector('#wsTimeCustom');
    function fmt(v) { var a = String(v).split(':'), h = parseInt(a[0], 10), mm = a[1] || '00'; return ar(h > 12 ? h - 12 : (h === 0 ? 12 : h)) + ':' + ar(mm) + (h >= 12 ? ' م' : ' ص'); }
    function showHint() {
      if (selT === 'auto') { var uh = usualHour(load()); hintEl.textContent = uh != null ? 'هيجيلك تقريبًا حوالي ' + fmt(('0' + uh).slice(-2) + ':00') + ' (وقتك المعتاد)' : 'هيجيلك حوالي ٨ م لحد ما التطبيق يتعلّم وقتك المعتاد'; }
      else hintEl.textContent = 'هيجيلك حوالي ' + fmt(selT);
    }
    function mark(v) { [].forEach.call(m.querySelectorAll('.w-chip'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); }
    [].forEach.call(m.querySelectorAll('.w-chip'), function (b) {
      b.onclick = function () { selT = b.getAttribute('data-v'); mark(selT); customEl.value = (selT === 'auto') ? '' : selT; showHint(); };
    });
    customEl.onchange = function () {
      var v = customEl.value; if (!v) return;
      selT = v; mark(v); showHint();
    };
    showHint();
    m.querySelector('#wsX').onclick = function () { m.remove(); };
    m.querySelector('#wsDiagBtn').onclick = function () {
      var box = m.querySelector('#wsDiag'); box.style.display = 'block'; box.textContent = '⏳ بنفحص…\n';
      if (!window.NourPush) { box.textContent += '❌ push.js مش متحمّل — التطبيق على نسخة قديمة'; return; }
      NourPush.diagnose(function (ok, txt) { box.textContent += (ok === true ? '✅ ' : (ok === false ? '❌ ' : 'ℹ️ ')) + txt + '\n'; box.scrollTop = box.scrollHeight; });
    };
    m.querySelector('#wsSave').onclick = function () {
      var ww = load();
      ww.prefs.notifTime = selT;
      ww.prefs.streakReminder = m.querySelector('#wsStreak').checked;
      ww.prefs.dailyChallenge = m.querySelector('#wsDaily').checked;
      ww.prefs.rankAlerts = m.querySelector('#wsRank').checked;
      var want = m.querySelector('#wsOn').checked;
      save(ww); m.remove();
      if (want) enableReminders(); else { ww = load(); ww.prefs.enabled = false; save(ww); renderCard(); syncCtx(); toast('اتقفل التذكير'); }
    };
  }

  function enableReminders() {
    if (!('Notification' in window)) { toast('المتصفح ده مش بيدعم الإشعارات'); return; }
    var go = function (perm) {
      var w = load();
      if (perm === 'granted') {
        w.prefs.enabled = true; save(w); registerPeriodic(); renderCard(); syncCtx(); toast('اتفعّل التذكير 🔔');
        try { if (window.NourPush) NourNotif.idbGet('ctx').then(function (c) { if (c) NourPush.sync(c, true); }); } catch (e) {}
      } else {
        w.prefs.enabled = false; save(w); renderCard();
        toast('محتاج تسمح بالإشعارات من إعدادات الجهاز');
      }
    };
    if (Notification.permission === 'granted') go('granted');
    else if (Notification.permission === 'denied') go('denied');
    else {
      // ★ المتصفحات الحديثة بترجّع Promise وبتنادي الـ callback كمان — كان go بتتنفذ مرتين (توست مكرر)
      var called = false, once = function (p) { if (called) return; called = true; go(p); };
      var r = Notification.requestPermission(once); if (r && r.then) r.then(once);
    }
  }

  function registerPeriodic() {
    try {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg.periodicSync) reg.periodicSync.register('nour-daily', { minInterval: 6 * 60 * 60 * 1000 }).catch(function () {});
      });
    } catch (e) {}
  }

  // ---------- مزامنة السياق مع الـ Service Worker (IndexedDB) ----------
  function currentRank() {
    var el = document.getElementById('grcRank'); if (!el) return null;
    var n = parseInt((el.textContent || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }), 10);
    return isNaN(n) ? null : n;
  }
  function syncCtx() {
    try {
      if (!user()) return;
      var w = load(), si = streakInfo(w), rec = w.hist[dayKey()];
      var rk = currentRank(), rkey = 'nour_rank_' + uname(), rr = lsGet(rkey, {}), t = dayKey();
      if (rk != null) { if (rr.day !== t) { rr.prev = rr.rank; rr.day = t; } rr.rank = rk; lsSet(rkey, rr); }
      var last = null, lastReached = null;
      Object.keys(w.hist).sort().forEach(function (k) { if (w.hist[k].d > 0) last = k; if (reached(w.hist[k])) lastReached = k; });
      var ctxObj = {
        prefs: w.prefs, streak: si.streak, streakLastDay: si.lastDay,
        playedDay: last, doneDay: lastReached, goal: rec ? (rec.g || w.goal) : w.goal, doneToday: rec ? rec.d : 0, rank: rk, prevRank: rr.prev != null ? rr.prev : null,
        surahs: inProgressSurahs().slice(0, 3), usualHour: usualHour(w), updated: Date.now()
      };
      NourNotif.idbSet('ctx', ctxObj);
      if (window.NourPush) NourPush.sync(ctxObj);   // ★ v122: نسخة للسيرفر (إشعارات FCM)
    } catch (e) {}
  }

  // أثناء فتح التطبيق في الخلفية (تاب مخفي) نفحص كل ٥ دقايق
  setInterval(function () {
    var w = load();
    if (document.hidden && w.prefs.enabled && ('Notification' in window) && Notification.permission === 'granted') { syncCtx(); NourNotif.runCheck(); }
  }, 5 * 60 * 1000);

  // ---------- ★ المزامنة مع حساب الإيميل (Firebase) ----------
  // الورد بيتخزن محلياً (يشتغل أوفلاين) وبيتدمج مع نسخة الحساب: لكل يوم الأعلى بيكسب ومفيش يوم بيتحقق وبعدين يرجع ناقص.
  // الضيف (مفيش إيميل) مش بيتزامن. التفضيلات (إشعارات/وقت) خاصة بكل جهاز فمش بتتزامن.
  var dirtyAt = 0, lastSyncAt = 0, syncing = false, syncTimer = null, pulledFor = null;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function canSync() {
    var u = user();
    return !!(u && !u.isGuest && u.username && typeof window.fbLoadWird === 'function' && typeof window.fbSaveWird === 'function' && navigator.onLine !== false);
  }
  function mergeDay(a, b) {
    if (!a) return b; if (!b) return a;
    var ra = reached(a), rb = reached(b), d = Math.max(a.d, b.d), g;
    if (ra && rb) g = Math.min(a.g, b.g); else if (ra) g = a.g; else if (rb) g = b.g; else g = (a.d >= b.d ? a.g : b.g);
    return { d: d, g: g };
  }
  // بيدمج نسخة السحابة (r) جوه النسخة المحلية (l). بيتحقق من شكل الداتا لأنها جاية من برا.
  function mergeWird(l, r) {
    if (!r || typeof r !== 'object') return l;
    var rh = (r.hist && typeof r.hist === 'object') ? r.hist : {};
    Object.keys(rh).forEach(function (k) {
      var x = rh[k]; if (!DATE_RE.test(k) || !x || typeof x !== 'object') return;
      var d = Math.max(0, Math.min(9999, parseInt(x.d, 10) || 0)), g = parseInt(x.g, 10);
      if (GOALS.indexOf(g) < 0) g = DEFAULT_GOAL;
      l.hist[k] = mergeDay(l.hist[k], { d: d, g: g });
    });
    l.best = Math.max(l.best || 0, parseInt(r.best, 10) || 0);
    l.totalRight = Math.max(l.totalRight || 0, parseInt(r.totalRight, 10) || 0);
    l.totalAnswers = Math.max(l.totalAnswers || 0, parseInt(r.totalAnswers, 10) || 0);
    var rg = parseInt(r.goal, 10), rat = +r.goalAt || 0;
    if (GOALS.indexOf(rg) >= 0 && rat > (l.goalAt || 0)) { l.goal = rg; l.goalAt = rat; }
    if (typeof r.celebrated === 'string' && DATE_RE.test(r.celebrated) && r.celebrated > (l.celebrated || '')) l.celebrated = r.celebrated;
    return l;
  }
  function sig(o) {
    if (!o) return '';
    var h = (o.hist && typeof o.hist === 'object') ? o.hist : {};
    return [o.goal, o.goalAt || 0, o.best || 0, o.totalRight || 0, o.totalAnswers || 0, o.celebrated || '',
      Object.keys(h).sort().map(function (k) { return k + ':' + h[k].d + '/' + h[k].g; }).join(',')].join('|');
  }
  function payload(w) {
    return { goal: w.goal, goalAt: w.goalAt || 0, best: w.best || 0, hist: w.hist, totalRight: w.totalRight || 0,
             totalAnswers: w.totalAnswers || 0, celebrated: w.celebrated || '', updated: Date.now() };
  }
  function scheduleSync(delay) {
    if (!canSync()) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(sync, delay == null ? 4000 : delay);
  }
  function sync() {
    if (!canSync() || syncing) return;
    syncing = true;
    var name = uname(), guard = setTimeout(function () { syncing = false; }, 20000);
    function done() { clearTimeout(guard); syncing = false; }
    window.fbLoadWird(name, function (remote, ok) {
      try {
        if (!ok) { pulledFor = null; return done(); }        // فشل شبكة: هنحاول تاني في أقرب فرصة
        if (name !== uname()) return done();                  // المستخدم اتبدّل أثناء الطلب
        var local = load(), before = sig(local);
        var merged = mergeWird(local, remote);
        if (sig(merged) !== before) { save(merged); renderCard(); syncCtx(); }
        lastSyncAt = Date.now();
        if (sig(merged) === sig(remote)) return done();       // السحابة بالفعل مطابقة
        Promise.resolve(window.fbSaveWird(name, payload(merged))).then(function (okSave) {
          if (okSave === false) pulledFor = null; done();
        }, function () { pulledFor = null; done(); });
      } catch (e) { console.warn('wird.sync', e); done(); }
    });
  }
  function ensurePulled() {
    var u = user(); if (!u || u.isGuest || pulledFor === u.username) return;
    pulledFor = u.username; sync();
  }
  try { NourNotif.markOpen(); } catch (e) {}
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { try { NourNotif.markOpen(); } catch (e) {} }
    if (!canSync()) return;
    if (document.hidden) { if (dirtyAt > lastSyncAt) sync(); }
    else if (Date.now() - lastSyncAt > 10 * 60 * 1000) sync();   // رجع للتطبيق بعد فترة: هات آخر نسخة من أي جهاز تاني
  });
  window.addEventListener('online', function () { pulledFor = null; ensurePulled(); });

  // ---------- فتح من إشعار ----------
  function handleDeeplink(d) {
    if (!d || !d.deeplink) return;
    if (d.deeplink === 'surah' && d.surah) openSurah(d.surah);
    else if (d.deeplink === 'leaderboard') { var lb = document.getElementById('leaderboard'); if (lb && lb.scrollIntoView) lb.scrollIntoView({ behavior: 'smooth' }); }
    else if (d.deeplink === 'wird') startWird();
    else if (d.deeplink === 'home') { /* الرئيسية فيها كارت الورد */ }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'NOUR_DEEPLINK') handleDeeplink(e.data.data); });
  }
  function coldStartDeeplink() {
    try {
      var q = new URLSearchParams(location.search), dl = q.get('dl');
      if (dl) { history.replaceState(history.state, '', location.pathname); setTimeout(function () { handleDeeplink({ deeplink: dl, surah: q.get('s') }); }, 1500); }
    } catch (e) {}
  }

  // ---------- تشغيل ----------
  window.NourWird = { deeplink: handleDeeplink, onAnswer: onAnswer, render: function () { renderCard(); syncCtx(); ensurePulled(); }, share: share, sync: sync };

  function init() {
    renderCard(); syncCtx(); ensurePulled(); coldStartDeeplink();
    var w = load(); if (w.prefs.enabled) registerPeriodic();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 800); });
  else setTimeout(init, 800);
})();
