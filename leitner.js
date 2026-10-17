// leitner.js — «🔁 مراجعة اليوم»: مراجعة متباعدة (Leitner) للآيات اللي اتغلطت فيها
// الفكرة: الغلطة مش بتتنسي بعد ٧ أيام — بترجعلك بعد يوم ← ٣ أيام ← أسبوع، وتتثبّت بعد ٣ إجابات صح متتالية.
// الشغل بيتم على جهاز المستخدم (يشتغل أوفلاين) وبيتزامن مع حساب الإيميل (زي الورد).
// بيعتمد على: state, renderQuestion, showScreen, currentUser (موجودين في index.html) + NourNotif (notif-logic.js)
(function () {
  'use strict';

  var STEPS = [1, 3, 7];     // أيام الانتظار: بعد الغلطة ← بعد أول إجابة صح ← بعد التانية
  var MASTER_AT = 3;         // ٣ إجابات صح متتالية = الآية «ثبتت»
  var SESSION_MAX = 10;      // أقصى عدد آيات في جلسة مراجعة واحدة
  var CARD_MAX = 300;        // حد أقصى للكروت المخزّنة (الأقدم المثبّت بيتشال الأول)
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- أدوات ----------
  function ar(n) { try { return typeof toArabicNum === 'function' ? toArabicNum(n) : String(n); } catch (e) { return String(n); } }
  function dayKey(d) { return NourNotif.dayKey(d || new Date()); }
  function inDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); }
  function user() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function uname() { var u = user(); return (u && u.username) ? u.username : 'guest'; }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function lKey() { return 'nour_leitner_' + uname(); }

  function load() {
    var L = lsGet(lKey(), null);
    if (!L || typeof L !== 'object' || !L.cards || typeof L.cards !== 'object') L = { cards: {} };
    return L;
  }
  function save(L) {
    var ids = Object.keys(L.cards);
    if (ids.length > CARD_MAX) {
      // الأولوية للمثبّت الأقدم ثم الأقدم تحديثاً
      ids.sort(function (a, b) {
        var x = L.cards[a], y = L.cards[b];
        if (!!x.mastered !== !!y.mastered) return x.mastered ? -1 : 1;
        return (x.upd || 0) - (y.upd || 0);
      });
      for (var i = 0; i < ids.length - CARD_MAX; i++) delete L.cards[ids[i]];
    }
    lsSet(lKey(), L);
  }

  // معرّف ثابت للسؤال (hash) — يصلح كمفتاح في Firebase ومتطابق على كل الأجهزة
  function h32(s, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function cardId(q) {
    var s = [q.surah, q.ayah, q.blank, q.qtype || ''].join('|');
    return h32(s, 2166136261) + h32(s, 374761393);
  }
  function reviewable(q) {
    return !!(q && typeof q.ayah === 'string' && q.ayah && q.blank != null && Array.isArray(q.wrong) && q.wrong.length >= 1);
  }
  function snap(q) {
    try { var s = JSON.parse(JSON.stringify(q)); return JSON.stringify(s).length <= 4000 ? s : null; } catch (e) { return null; }
  }

  // ---------- تسجيل الإجابات (بيتنادى من handleResult) ----------
  function onAnswer(q, isRight) {
    try {
      if (!user() || !reviewable(q)) return;
      var L = load(), id = cardId(q), c = L.cards[id], today = dayKey(), inSession = !!(typeof state !== 'undefined' && state.isDueReview);
      if (!isRight) {
        var s = snap(q); if (!s && !c) return;
        // غلطة جديدة أو غلطة تانية في آية موجودة: ابدأ من الأول (تتراجع لبكرة)
        L.cards[id] = { q: s || c.q, step: 0, ok: 0, due: inDays(STEPS[0]), mastered: false, upd: Date.now() };
      } else if (c && !c.mastered && (inSession || (c.due && c.due <= today))) {
        c.ok = (c.ok || 0) + 1;
        if (c.ok >= MASTER_AT) { c.mastered = true; c.due = null; }
        else { c.step = Math.min(c.ok, STEPS.length - 1); c.due = inDays(STEPS[c.step]); }
        c.upd = Date.now();
      } else { return; }   // إجابة صح على آية مش مستحقة لسه — ما بتغيّرش حاجة
      save(L); dirtyAt = Date.now(); render(); scheduleSync(5000);
    } catch (e) { console.warn('leitner.onAnswer', e); }
  }

  function lists(L) {
    var today = dayKey(), due = [], waiting = 0, mastered = 0, next = null;
    Object.keys(L.cards).forEach(function (id) {
      var c = L.cards[id];
      if (c.mastered) { mastered++; return; }
      if (c.due && c.due <= today) due.push(c); else { waiting++; if (c.due && (!next || c.due < next)) next = c.due; }
    });
    due.sort(function (a, b) { return (a.due < b.due ? -1 : a.due > b.due ? 1 : (a.upd || 0) - (b.upd || 0)); });
    return { due: due, waiting: waiting, mastered: mastered, next: next };
  }

  // ---------- بدء جلسة المراجعة ----------
  function startDue() {
    if (!user()) return;
    if (typeof state === 'undefined' || typeof renderQuestion !== 'function' || typeof showScreen !== 'function') return;
    var list = lists(load()).due.slice(0, SESSION_MAX);
    if (!list.length) { toast('مفيش آيات مستحقة للمراجعة دلوقتي 🌙'); return; }
    var qs = list.map(function (c) { return JSON.parse(JSON.stringify(c.q)); });
    qs.sort(function () { return Math.random() - 0.5; });
    state.reviewSurah = null; state.isReviewMode = false; state.isDueReview = true;
    state.questions = qs; state.qIndex = 0; state.score = 0; state.correct = 0;
    state.sessionHasanat = 0; state.answered = false; state.combo = 0;
    state.hints = { h1: 1, h2: 1, h3: 1 };
    state.pendingCompletionCheck = null;
    state._sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (typeof stopTimer === 'function') stopTimer();
    showScreen('gameScreen');
    var el;
    if ((el = document.getElementById('liveScore'))) el.textContent = '٠';
    if ((el = document.getElementById('timerWrap'))) el.style.display = 'none';
    if ((el = document.getElementById('levelBadgeGame'))) el.textContent = '🔁 مراجعة اليوم — ' + ar(qs.length) + ' آية';
    if ((el = document.getElementById('mcqWrap'))) el.innerHTML = '';
    if ((el = document.getElementById('nextBtn'))) el.className = 'next-btn';
    if ((el = document.getElementById('feedback'))) el.className = 'feedback';
    renderQuestion();
    toast('🔁 ' + ar(qs.length) + ' آية بتستناك — ركّز وهتثبت بإذن الله');
  }

  // ---------- الكارت في الرئيسية ----------
  var css = [
    '#dueCard{margin:0 0 14px;padding:13px 14px;border-radius:18px;direction:rtl;font-family:"Cairo",sans-serif;background:linear-gradient(145deg,rgba(26,82,118,.22),rgba(27,107,74,.14));border:1px solid rgba(110,180,230,.32)}',
    '#dueCard.is-clear{background:rgba(255,255,255,.04);border-color:rgba(245,217,139,.2)}',
    '#dueCard .d-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '#dueCard .d-title{font-size:15px;font-weight:800;color:var(--gold-light,#F5D98B)}',
    '#dueCard .d-chip{padding:3px 11px;border-radius:20px;font-size:13px;font-weight:900;color:#06281b;background:#7DFFC9}',
    '#dueCard .d-msg{margin-top:6px;font-size:13px;line-height:1.8;color:rgba(245,217,139,.85)}',
    '#dueCard .d-stats{margin-top:4px;font-size:11.5px;color:rgba(245,217,139,.6)}',
    '#dueCard .d-go{width:100%;min-height:44px;margin-top:10px;border:none;border-radius:13px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#4aa3df,#2EAF78);color:#fff}',
    '#dueCard .d-go:active{transform:scale(.98)}'
  ].join('');

  function mount() {
    var card = document.getElementById('dueCard');
    if (card) return card;
    var anchor = document.getElementById('wirdCard') || document.querySelector('#homeScreen .stats-row');
    if (!anchor) return null;
    card = document.createElement('div'); card.id = 'dueCard';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    if (!document.getElementById('dueStyle')) {
      var s = document.createElement('style'); s.id = 'dueStyle'; s.textContent = css; document.head.appendChild(s);
    }
    return card;
  }

  function whenWord(iso) {
    var t = new Date(iso + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0);
    var d = Math.round((t - n) / 86400000);
    return d <= 1 ? 'بكرة' : (d === 2 ? 'بعد يومين' : 'بعد ' + ar(d) + (d <= 10 ? ' أيام' : ' يوم'));
  }

  function render() {
    var card = mount(); if (!card) return;
    var u = user();
    if (!u) { card.style.display = 'none'; return; }
    var S = lists(load()), n = S.due.length, total = n + S.waiting + S.mastered;
    if (!total) { card.style.display = 'none'; return; }   // لسه مفيش غلطات — مفيش داعي للكارت
    card.style.display = '';
    card.className = n ? '' : 'is-clear';
    var stats = (S.mastered ? '🌟 ثبتت ' + ar(S.mastered) : '') + (S.mastered && S.waiting ? ' · ' : '') + (S.waiting ? '⏳ قيد المراجعة ' + ar(S.waiting) : '');
    card.innerHTML =
      '<div class="d-head"><div class="d-title">🔁 مراجعة اليوم</div>' + (n ? '<div class="d-chip">' + ar(n) + '</div>' : '') + '</div>' +
      (n
        ? '<div class="d-msg">عندك ' + ar(n) + ' ' + (n >= 3 && n <= 10 ? 'آيات' : 'آية') + ' جه وقت مراجعتها — الغلطة اللي بتتراجع في وقتها بتثبت.</div>'
        : '<div class="d-msg">✅ مفيش مراجعة مستحقة دلوقتي' + (S.next ? ' — الجاية ' + whenWord(S.next) : '') + '</div>') +
      (stats ? '<div class="d-stats">' + stats + '</div>' : '') +
      (n ? '<button type="button" class="d-go" id="dueGo">ابدأ المراجعة ▶' + (n > SESSION_MAX ? ' (' + ar(SESSION_MAX) + ' آيات)' : '') + '</button>' : '');
    var b = card.querySelector('#dueGo'); if (b) b.onclick = startDue;
  }

  // ---------- ★ المزامنة مع حساب الإيميل (نفس أسلوب الورد) ----------
  var dirtyAt = 0, lastSyncAt = 0, syncing = false, syncTimer = null, pulledFor = null;

  function canSync() {
    var u = user();
    return !!(u && !u.isGuest && u.username && typeof window.fbLoadLeitner === 'function' && typeof window.fbSaveLeitner === 'function' && navigator.onLine !== false);
  }
  function cleanStr(x) { return (typeof x === 'string' || typeof x === 'number'); }
  // بيتحقق من كارت جاي من السحابة قبل ما نصدّقه
  function cleanCard(id, c) {
    if (!/^[0-9a-f]{16}$/.test(id) || !c || typeof c !== 'object' || !c.q || typeof c.q !== 'object') return null;
    var q = c.q;
    if (typeof q.ayah !== 'string' || !cleanStr(q.blank) || !Array.isArray(q.wrong) || !q.wrong.length || q.wrong.length > 6 || !q.wrong.every(cleanStr)) return null;
    if (q.ayah.length > 1500 || cardId(q) !== id) return null;
    var upd = +c.upd || 0, mastered = !!c.mastered;
    var due = (typeof c.due === 'string' && DATE_RE.test(c.due)) ? c.due : null;
    if (!mastered && !due) return null;
    return { q: q, step: Math.max(0, Math.min(STEPS.length - 1, parseInt(c.step, 10) || 0)), ok: Math.max(0, Math.min(MASTER_AT, parseInt(c.ok, 10) || 0)),
             due: mastered ? null : due, mastered: mastered, upd: upd };
  }
  function mergeLeitner(L, remote) {
    if (!remote || typeof remote !== 'object') return L;
    var rc = (remote.cards && typeof remote.cards === 'object') ? remote.cards : {};
    Object.keys(rc).forEach(function (id) {
      var c = cleanCard(id, rc[id]); if (!c) return;
      var mine = L.cards[id];
      if (!mine || (c.upd || 0) > (mine.upd || 0)) L.cards[id] = c;   // أحدث تعديل على الكارت يكسب
    });
    return L;
  }
  function sig(L) {
    var cs = (L && L.cards && typeof L.cards === 'object') ? L.cards : {};
    return Object.keys(cs).sort().map(function (k) { var c = cs[k]; return k + ':' + (c.upd || 0) + ':' + (c.mastered ? 'm' : (c.due || '')); }).join(',');
  }
  function scheduleSync(delay) {
    if (!canSync()) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(sync, delay == null ? 5000 : delay);
  }
  function sync() {
    if (!canSync() || syncing) return;
    syncing = true;
    var name = uname(), guard = setTimeout(function () { syncing = false; }, 20000);
    function done() { clearTimeout(guard); syncing = false; }
    window.fbLoadLeitner(name, function (remote, ok) {
      try {
        if (!ok) { pulledFor = null; return done(); }
        if (name !== uname()) return done();
        var local = load(), before = sig(local);
        var merged = mergeLeitner(local, remote);
        if (sig(merged) !== before) { save(merged); render(); }
        lastSyncAt = Date.now();
        if (sig(merged) === sig(remote)) return done();
        Promise.resolve(window.fbSaveLeitner(name, { cards: merged.cards, updated: Date.now() })).then(function (okSave) {
          if (okSave === false) pulledFor = null; done();
        }, function () { pulledFor = null; done(); });
      } catch (e) { console.warn('leitner.sync', e); done(); }
    });
  }
  function ensurePulled() {
    var u = user(); if (!u || u.isGuest || pulledFor === u.username) return;
    pulledFor = u.username; sync();
  }
  document.addEventListener('visibilitychange', function () {
    if (!canSync()) return;
    if (document.hidden) { if (dirtyAt > lastSyncAt) sync(); }
    else if (Date.now() - lastSyncAt > 10 * 60 * 1000) sync();
  });
  window.addEventListener('online', function () { pulledFor = null; ensurePulled(); });

  // ---------- تشغيل ----------
  window.NourLeitner = {
    onAnswer: onAnswer,
    render: function () { render(); ensurePulled(); },
    start: startDue,
    sync: sync,
    _lists: function () { return lists(load()); }
  };

  function init() { render(); ensurePulled(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
  else setTimeout(init, 1000);
})();
