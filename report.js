// report.js — «📊 تقريرك الأسبوعي»: أكتر آيات بتتغلط فيها، أضعف سورة، ورقم الجزء لكل آية (بند ٩ في خارطة الطريق)
// بيتعرض فوق قائمة الغلطات في شاشة «مراجعة الغلطات»، وبيشتغل على بيانات الجهاز (أوفلاين) من غير ما يغيّر أي بيانات.
// بيعتمد على: getMistakes, currentUser, SURAH_NAME_TO_NUM, QURAN_LOCAL, JUZ_SURAHS, toArabicNum (موجودين في index.html)
(function () {
  'use strict';

  var DAYS = 7, TOP = 5;

  function ar(n) { try { return typeof toArabicNum === 'function' ? toArabicNum(n) : String(n); } catch (e) { return String(n); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function norm(t) { try { return typeof _qNormWord === 'function' ? _qNormWord(t, true) : String(t); } catch (e) { return String(t); } }

  // رقم الآية من نصها داخل السورة (الغلطات المحفوظة فيها نص الآية واسم السورة بس)
  function ayahNo(surahNum, text) {
    try {
      var list = QURAN_LOCAL && QURAN_LOCAL[surahNum]; if (!list) return null;
      for (var i = 0; i < list.length; i++) if (list[i].t === text) return list[i].n;
      var nt = norm(text);
      for (var j = 0; j < list.length; j++) if (norm(list[j].t) === nt) return list[j].n;
    } catch (e) {}
    return null;
  }
  function juzOf(surahNum, ayah) {
    try {
      if (!surahNum || !ayah || typeof JUZ_SURAHS === 'undefined') return null;
      for (var j = 1; j <= 30; j++) {
        var rs = JUZ_SURAHS[j] || [];
        for (var k = 0; k < rs.length; k++) if (rs[k].s === surahNum && ayah >= rs[k].a && ayah <= rs[k].e) return j;
      }
    } catch (e) {}
    return null;
  }

  function collect() {
    var all = {}; try { all = (typeof getMistakes === 'function' ? getMistakes() : {}) || {}; } catch (e) {}
    var days = Object.keys(all).sort().reverse().slice(0, DAYS).reverse();
    var perDay = [], byAyah = {}, bySurah = {}, total = 0;
    days.forEach(function (d) {
      var arr = Array.isArray(all[d]) ? all[d] : [];
      perDay.push({ day: d, n: arr.length });
      arr.forEach(function (m) {
        if (!m || !m.surah || !m.ayah) return;
        total++;
        var key = m.surah + '|' + m.ayah;
        var o = byAyah[key] || (byAyah[key] = { surah: m.surah, ayah: m.ayah, n: 0, days: {} });
        o.n++; o.days[d] = 1;
        bySurah[m.surah] = (bySurah[m.surah] || 0) + 1;
      });
    });
    var top = Object.keys(byAyah).map(function (k) { return byAyah[k]; })
      .sort(function (a, b) { return b.n - a.n || Object.keys(b.days).length - Object.keys(a.days).length; }).slice(0, TOP);
    var weak = Object.keys(bySurah).sort(function (a, b) { return bySurah[b] - bySurah[a]; })[0] || null;
    return { perDay: perDay, top: top, weak: weak, weakN: weak ? bySurah[weak] : 0, total: total };
  }

  function leitnerStats() {
    try {
      var u = (typeof currentUser !== 'undefined' && currentUser && currentUser.username) ? currentUser.username : 'guest';
      var L = JSON.parse(localStorage.getItem('nour_leitner_' + u) || 'null');
      if (!L || !L.cards) return null;
      var m = 0, w = 0;
      Object.keys(L.cards).forEach(function (k) { if (L.cards[k].mastered) m++; else w++; });
      return (m || w) ? { mastered: m, waiting: w } : null;
    } catch (e) { return null; }
  }

  function css() {
    if (document.getElementById('nrStyle')) return;
    var s = document.createElement('style'); s.id = 'nrStyle';
    s.textContent =
      '#nourReport{margin:0 0 14px;padding:14px;border:1px solid rgba(201,151,58,.3);border-radius:16px;background:rgba(201,151,58,.07);color:rgba(245,217,139,.9);font-family:inherit}' +
      '#nourReport .nr-t{font-weight:800;font-size:15px;color:#F5D98B;margin-bottom:4px}' +
      '#nourReport .nr-s{font-size:12px;opacity:.75;margin-bottom:10px;line-height:1.7}' +
      '#nourReport .nr-bars{display:flex;align-items:flex-end;gap:6px;height:56px;margin:6px 0 12px}' +
      '#nourReport .nr-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%}' +
      '#nourReport .nr-bar i{display:block;width:100%;min-height:3px;border-radius:4px 4px 0 0;background:rgba(201,151,58,.75)}' +
      '#nourReport .nr-bar span{font-size:9px;opacity:.6}' +
      '#nourReport .nr-h{font-size:12px;font-weight:700;margin:10px 0 6px;color:#F5D98B}' +
      '#nourReport .nr-row{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;margin-bottom:6px;border-radius:10px;background:rgba(0,0,0,.2);font-size:13px;line-height:1.8}' +
      '#nourReport .nr-n{flex:none;min-width:26px;text-align:center;font-weight:800;color:#F5D98B}' +
      '#nourReport .nr-m{font-size:11px;opacity:.7}' +
      '#nourReport .nr-ay{font-size:15px;line-height:2;direction:rtl}';
    document.head.appendChild(s);
  }

  var DOW = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  function render() {
    try {
      var host = document.getElementById('mistakesList'); if (!host || !host.parentNode) return;
      var box = document.getElementById('nourReport');
      var d = collect();
      if (!d.total) { if (box) box.remove(); return; }   // مفيش غلطات = مفيش تقرير
      css();
      if (!box) { box = document.createElement('div'); box.id = 'nourReport'; host.parentNode.insertBefore(box, host); }

      var max = 1; d.perDay.forEach(function (x) { if (x.n > max) max = x.n; });
      var bars = d.perDay.map(function (x) {
        var dt = new Date(x.day + 'T00:00:00'), lab = isNaN(dt) ? '' : DOW[dt.getDay()];
        return '<div class="nr-bar" title="' + esc(x.day) + '"><i style="height:' + Math.max(6, Math.round(x.n / max * 100)) + '%"></i><span>' + esc(lab) + ' ' + ar(x.n) + '</span></div>';
      }).join('');

      var rows = d.top.map(function (t) {
        var sn = (typeof SURAH_NAME_TO_NUM !== 'undefined') ? SURAH_NAME_TO_NUM[t.surah] : null;
        var an = sn ? ayahNo(sn, t.ayah) : null, jz = juzOf(sn, an);
        var meta = esc(t.surah) + (an ? ' · آية ' + ar(an) : '') + (jz ? ' · الجزء ' + ar(jz) : '');
        return '<div class="nr-row"><div class="nr-n">×' + ar(t.n) + '</div><div><div class="nr-ay">' + esc(t.ayah) + '</div><div class="nr-m">' + meta + '</div></div></div>';
      }).join('');

      var L = leitnerStats();
      box.innerHTML =
        '<div class="nr-t">📊 تقريرك الأسبوعي</div>' +
        '<div class="nr-s">' + ar(d.total) + ' غلطة في آخر ' + ar(d.perDay.length) + ' ' + (d.perDay.length > 2 && d.perDay.length < 11 ? 'أيام' : 'يوم') +
        (d.weak ? ' — أضعف سورة عندك: <b>' + esc(d.weak) + '</b> (' + ar(d.weakN) + ')' : '') + '</div>' +
        '<div class="nr-bars" role="img" aria-label="عدد الغلطات في كل يوم">' + bars + '</div>' +
        '<div class="nr-h">🎯 أكتر آيات بتتغلط فيها</div>' + rows +
        (L ? '<div class="nr-s" style="margin:8px 0 0">🔁 المراجعة المتباعدة: 🌟 ثبتت ' + ar(L.mastered) + ' · ⏳ قيد المراجعة ' + ar(L.waiting) + '</div>' : '');
    } catch (e) { console.warn('NourReport', e); }
  }

  // showMistakesScreen بتعيد رسم #mistakesList كل مرة (فتح الشاشة / مسح الغلطات) → نراقب التغيير ونرسم التقرير فوقها
  function init() {
    var host = document.getElementById('mistakesList');
    if (!host) { document.addEventListener('DOMContentLoaded', init, { once: true }); return; }
    var t = null;
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(render, 30); }).observe(host, { childList: true });
  }
  init();
  window.NourReport = { render: render, collect: collect };
})();
