// meaning.js — تحديث ٨: «معاني الآيات + قرّاء متعددين + تكرار وتحكم في السرعة»
// - زر «معنى الآية» بعد كل إجابة (التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف، عبر api.alquran.cloud)
// - اختيار القارئ (أسماء المجلدات من everyayah.com) مع رجوع تلقائي للعفاسي لو الملف مش متاح
// - تكرار الآية ×٣ وسرعة ٠٫٧٥× / ١× / ١٫٢٥×
// بيعتمد على: state, SURAH_NAME_TO_NUM, getAyahNum, showToast, toArabicNum (موجودين في index.html)
(function () {
  'use strict';

  var DEFAULT = 'Alafasy_128kbps';
  var RECITERS = [
    { id: 'Alafasy_128kbps', name: 'مشاري راشد العفاسي' },
    { id: 'Husary_128kbps', name: 'محمود خليل الحصري (مرتّل)' },
    { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي (مرتّل)' },
    { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد (مرتّل)' },
    { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس' },
    { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم' },
    { id: 'MaherAlMuaiqly128kbps', name: 'ماهر المعيقلي' },
    { id: 'Hani_Rifai_192kbps', name: 'هاني الرفاعي' }
  ];
  var RATES = [0.75, 1, 1.25];
  var TAFSIR_URL = 'https://api.alquran.cloud/v1/ayah/';
  var CACHE_MAX = 400;

  function ar(n) { try { return toArabicNum(n); } catch (e) { return String(n); } }
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var cfg = {
    reciter: get('nour_reciter', DEFAULT),
    rate: parseFloat(get('nour_rate', '1')) || 1,
    repeat: parseInt(get('nour_repeat', '1'), 10) === 3 ? 3 : 1
  };
  if (!RECITERS.some(function (r) { return r.id === cfg.reciter; })) cfg.reciter = DEFAULT;
  if (RATES.indexOf(cfg.rate) < 0) cfg.rate = 1;
  function reciterName() { return RECITERS.filter(function (r) { return r.id === cfg.reciter; })[0].name; }
  function ayahUrl(folder, s, a) { return 'https://everyayah.com/data/' + folder + '/' + String(s).padStart(3, '0') + String(a).padStart(3, '0') + '.mp3'; }

  // ============ واجهة الصوت اللي بيستخدمها _playMp3 في index.html ============
  window.NourAudio = {
    // حوّل رابط العفاسي للقارئ المختار
    url: function (u) { return cfg.reciter === DEFAULT ? u : u.replace('/data/' + DEFAULT + '/', '/data/' + cfg.reciter + '/'); },
    // اضبط السرعة وعدد مرات التكرار لعنصر الصوت
    setup: function (audio) {
      audio._rep = cfg.repeat - 1;
      var apply = function () { try { audio.preservesPitch = true; audio.playbackRate = cfg.rate; } catch (e) {} };
      apply(); audio.addEventListener('loadedmetadata', apply); audio.addEventListener('play', apply);
    },
    // لو لسه فيه تكرار: ارجع لأول الآية وكمّل (بيرجع true لو كرّر)
    again: function (audio) {
      if (audio._rep > 0) { audio._rep--; try { audio.currentTime = 0; var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { return false; } return true; }
      return false;
    },
    // خطأ تحميل: جرّب العفاسي مرة واحدة قبل ما نيأس
    onError: function (audio, url) {
      if (cfg.reciter === DEFAULT || audio._fb) return false;
      audio._fb = true;
      toast('ملف القارئ ده مش متاح للآية دي — شغّلنا العفاسي');
      try { audio.src = url.replace('/data/' + cfg.reciter + '/', '/data/' + DEFAULT + '/'); var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { return false; }
      return true;
    }
  };

  // ============ الأنماط ============
  var css = '' +
    '.nm-modal{position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center;direction:rtl;font-family:"Cairo",sans-serif}' +
    '.nm-sheet{width:100%;max-width:480px;max-height:86vh;overflow:auto;background:#1d1409;border:1px solid rgba(201,151,58,.5);border-bottom:none;border-radius:22px 22px 0 0;padding:18px 18px 22px;color:#F5D98B}' +
    '.nm-sheet h3{margin:0 0 4px;font-size:18px;text-align:center}' +
    '.nm-ayah{margin:10px 0;padding:12px;border-radius:12px;background:rgba(255,255,255,.05);font-family:"Amiri","Cairo",serif;font-size:21px;line-height:2.1;text-align:center;color:#fff}' +
    '.nm-lbl{font-size:12px;color:rgba(245,217,139,.65);margin:8px 0 4px}' +
    '.nm-text{font-size:15px;line-height:2;color:#f3ead2;text-align:right}' +
    '.nm-src{margin-top:10px;font-size:10.5px;color:rgba(245,217,139,.5);text-align:center;line-height:1.7}' +
    '.nm-btn{display:block;width:100%;margin-top:10px;padding:11px;border-radius:12px;border:none;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#C9973A,#E8B84B);color:#1A1208}' +
    '.nm-btn.alt{background:transparent;border:1px solid rgba(245,217,139,.35);color:#F5D98B;font-weight:600}' +
    '.nm-row{display:flex;gap:8px;margin-top:6px}' +
    '.nm-chip{flex:1;padding:9px 4px;border-radius:10px;border:1px solid rgba(245,217,139,.28);background:transparent;color:#F5D98B;font-family:inherit;font-size:13px;cursor:pointer}' +
    '.nm-chip.on{background:rgba(201,151,58,.32);border-color:#C9973A;font-weight:800}' +
    '.nm-rec{display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px dashed rgba(245,217,139,.16);font-size:14px;cursor:pointer}' +
    '.nm-rec input{accent-color:#2EAF78;width:18px;height:18px}' +
    '.nm-open{display:block;width:100%;margin:10px 0 0;padding:11px;border-radius:12px;border:1px solid rgba(46,175,120,.55);background:rgba(46,175,120,.12);color:#7DFFC9;font-family:"Cairo",sans-serif;font-size:14px;font-weight:700;cursor:pointer}' +
    '.nm-gear{background:none;border:1px solid rgba(245,217,139,.3);border-radius:10px;color:#F5D98B;font-family:"Cairo",sans-serif;font-size:12px;padding:5px 9px;cursor:pointer;margin-inline-start:8px}' +
    '.nm-spin{text-align:center;padding:24px;color:rgba(245,217,139,.7)}';
  function injectStyle() {
    if (document.getElementById('nmStyle')) return;
    var s = document.createElement('style'); s.id = 'nmStyle'; s.textContent = css; document.head.appendChild(s);
  }
  function sheet(html) {
    injectStyle();
    var m = document.createElement('div'); m.className = 'nm-modal';
    m.innerHTML = '<div class="nm-sheet" role="dialog" aria-modal="true">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    // Escape بيقفل النافذة
    var onEsc = function (e) { if (!document.body.contains(m)) { document.removeEventListener('keydown', onEsc); return; } if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', onEsc); } };
    document.addEventListener('keydown', onEsc);
    document.body.appendChild(m); return m;
  }

  // ============ إعدادات الصوت ============
  function openAudioSettings() {
    var recs = RECITERS.map(function (r) {
      return '<label class="nm-rec"><input type="radio" name="nmRec" value="' + r.id + '"' + (r.id === cfg.reciter ? ' checked' : '') + '><span>' + r.name + '</span></label>';
    }).join('');
    var RLBL = { '0.75': '٠٫٧٥×', '1': 'عادية', '1.25': '١٫٢٥×' };
    var rates = RATES.map(function (r) { return '<button type="button" class="nm-chip' + (r === cfg.rate ? ' on' : '') + '" data-r="' + r + '">' + RLBL[String(r)] + '</button>'; }).join('');
    var m = sheet(
      '<h3>🎧 إعدادات الصوت</h3>' +
      '<div class="nm-lbl">القارئ</div>' + recs +
      '<div class="nm-lbl">سرعة التلاوة</div><div class="nm-row" id="nmRates">' + rates + '</div>' +
      '<div class="nm-lbl">تكرار الآية</div><div class="nm-row" id="nmRep">' +
      '<button type="button" class="nm-chip' + (cfg.repeat === 1 ? ' on' : '') + '" data-n="1">مرة</button>' +
      '<button type="button" class="nm-chip' + (cfg.repeat === 3 ? ' on' : '') + '" data-n="3">٣ مرات</button></div>' +
      '<button class="nm-btn" id="nmTry">🔊 جرّب الصوت</button><button class="nm-btn alt" id="nmClose">تم</button>');
    var tryAudio = null;
    function stopTry() { if (tryAudio) { try { tryAudio.pause(); } catch (e) {} tryAudio = null; } }
    m.querySelectorAll('input[name=nmRec]').forEach(function (i) { i.onchange = function () { cfg.reciter = i.value; set('nour_reciter', i.value); refreshCredit(); }; });
    m.querySelectorAll('#nmRates .nm-chip').forEach(function (b) { b.onclick = function () { cfg.rate = parseFloat(b.getAttribute('data-r')); set('nour_rate', String(cfg.rate)); m.querySelectorAll('#nmRates .nm-chip').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    m.querySelectorAll('#nmRep .nm-chip').forEach(function (b) { b.onclick = function () { cfg.repeat = parseInt(b.getAttribute('data-n'), 10); set('nour_repeat', String(cfg.repeat)); m.querySelectorAll('#nmRep .nm-chip').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    m.querySelector('#nmTry').onclick = function () {
      stopTry(); if (typeof stopCurrentAudio === 'function') stopCurrentAudio();
      var a = new Audio(ayahUrl(cfg.reciter, 1, 2)); tryAudio = a; NourAudio.setup(a);
      a.onerror = function () { if (!NourAudio.onError(a, a.src)) toast('تعذّر تشغيل الصوت — تأكد من الإنترنت'); };
      var p = a.play(); if (p && p.catch) p.catch(function () { toast('تعذّر تشغيل الصوت'); });
    };
    m.querySelector('#nmClose').onclick = function () { stopTry(); m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m) stopTry(); });   // ★ الإغلاق بالنقر برا النافذة كان بيسيب الصوت شغّال
  }

  // ============ معنى الآية ============
  function currentAyah() {
    // ★ v118: التسميع الحر — الآية الحالية من طابور التسميع (مش من أسئلة الاختبار)
    try {
      var fs = document.getElementById('freeReciteScreen');
      if (fs && fs.style.display === 'block' && typeof _freeReciteQueue !== 'undefined' && typeof _freeReciteIdx !== 'undefined') {
        var it = _freeReciteQueue[_freeReciteIdx];
        if (it && it.surahNum && it.num) return { s: it.surahNum, a: it.num, surah: it.surahName, text: it.text || '' };
      }
    } catch (e) {}
    var st = (typeof state !== 'undefined') ? state : null; // state معرّف بـ let فمش على window
    var q = st && st.questions && st.questions[st.qIndex]; if (!q) return null;
    var s = q.surahNum || (typeof SURAH_NAME_TO_NUM !== 'undefined' ? SURAH_NAME_TO_NUM[q.surah] : null);
    var a = q.fromApi ? q.ayahNum : ((typeof getAyahNum === 'function' ? getAyahNum(q) : null) || q.ayahNum);
    return (s && a) ? { s: s, a: a, surah: q.surah, text: q.ayah || '' } : null;
  }
  function cacheGet(k) { try { var v = localStorage.getItem('nour_tafsir_' + k); return v; } catch (e) { return null; } }
  function cachePut(k, text) {
    try {
      var idx = JSON.parse(localStorage.getItem('nour_tafsir_idx') || '[]');
      if (idx.indexOf(k) < 0) idx.push(k);
      while (idx.length > CACHE_MAX) localStorage.removeItem('nour_tafsir_' + idx.shift());
      localStorage.setItem('nour_tafsir_' + k, text); localStorage.setItem('nour_tafsir_idx', JSON.stringify(idx));
    } catch (e) {}
  }
  function fetchTafsir(s, a) {
    var key = s + ':' + a, c = cacheGet(key);
    if (c) return Promise.resolve(c);
    var ctl = ('AbortController' in window) ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(TAFSIR_URL + key + '/ar.muyassar', ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      clearTimeout(t); if (!r.ok) throw new Error('http ' + r.status); return r.json();
    }).then(function (j) {
      var tx = j && j.data && j.data.text; if (!tx) throw new Error('empty'); cachePut(key, tx); return tx;
    });
  }
  function openMeaning() {
    var info = currentAyah(); if (!info) { toast('رقم الآية غير معروف'); return; }
    var m = sheet(
      '<h3>📖 معنى الآية</h3><div style="text-align:center;font-size:12px;color:rgba(245,217,139,.65)">سورة ' + esc(info.surah || '') + ' — آية ' + ar(info.a) + '</div>' +
      (info.text ? '<div class="nm-ayah">' + esc(info.text) + '</div>' : '') +
      '<div class="nm-lbl">التفسير الميسّر</div><div class="nm-text" id="nmBody"><div class="nm-spin">⏳ جاري التحميل…</div></div>' +
      '<div class="nm-src">التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف</div>' +
      '<button class="nm-btn" id="nmListen">🔊 استمع للآية</button><button class="nm-btn alt" id="nmX">إغلاق</button>');
    var body = m.querySelector('#nmBody'), gone = false;
    new MutationObserver(function (_, ob) { if (!document.body.contains(m)) { gone = true; ob.disconnect(); } }).observe(document.body, { childList: true });
    function load() {
      body.innerHTML = '<div class="nm-spin">⏳ جاري التحميل…</div>';
      fetchTafsir(info.s, info.a).then(function (tx) { if (!gone) body.textContent = tx; }).catch(function () {
        if (gone) return;
        body.innerHTML = '<div class="nm-spin">تعذّر تحميل التفسير — تأكد من الإنترنت.<br><button class="nm-chip" id="nmRetry" style="margin-top:10px;max-width:160px">إعادة المحاولة</button></div>';
        var rb = body.querySelector('#nmRetry'); if (rb) rb.onclick = load;
      });
    }
    load();
    var listenA = null;
    function stopListen() { if (listenA) { try { listenA.pause(); } catch (e) {} listenA.onended = listenA.onerror = null; listenA = null; } }
    m.querySelector('#nmX').onclick = function () { stopListen(); m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m) stopListen(); });
    m.querySelector('#nmListen').onclick = function () {
      stopListen();   // ★ الضغط أكتر من مرة كان بيشغّل الآية فوق بعضها
      if (typeof stopCurrentAudio === 'function') stopCurrentAudio();
      var a = new Audio(NourAudio.url(ayahUrl(DEFAULT, info.s, info.a))); NourAudio.setup(a); listenA = a;
      a.onended = function () { NourAudio.again(a); };
      a.onerror = function () { if (!NourAudio.onError(a, a.src)) toast('تعذّر تشغيل الصوت'); };
      var p = a.play(); if (p && p.catch) p.catch(function () { toast('تعذّر تشغيل الصوت'); });
    };
  }

  // ============ حقن الأزرار في الواجهة ============
  function refreshCredit() {
    var el = document.getElementById('nmCredit'); if (el) el.textContent = reciterName();
  }
  function decorateHome() {
    injectStyle();
    var hdr = document.querySelector('#homeScreen .header'); if (!hdr || document.getElementById('nmCredit')) return;
    var divs = hdr.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      if (d.textContent.indexOf('الصوت:') !== -1 && d.querySelector('a[href*="everyayah"]')) {
        d.innerHTML = '🔊 الصوت: <span id="nmCredit">' + reciterName() + '</span> — مقدَّم من <a href="https://everyayah.com" target="_blank" rel="noopener" style="color:rgba(201,151,58,0.8);text-decoration:underline;">everyayah.com</a>' +
          ' <button type="button" class="nm-gear" id="nmHomeGear">🎧 غيّر القارئ</button>';
        d.querySelector('#nmHomeGear').onclick = openAudioSettings; break;
      }
    }
  }
  function decorateQuestion() {
    var row = document.querySelector('.ayah-audio-row'); if (!row || document.getElementById('nmQGear')) return;
    injectStyle();
    var b = document.createElement('button'); b.type = 'button'; b.id = 'nmQGear'; b.className = 'nm-gear'; b.textContent = '🎧'; b.title = 'القارئ والسرعة والتكرار'; b.setAttribute('aria-label', 'إعدادات الصوت');
    b.onclick = openAudioSettings; row.appendChild(b);
  }
  // بعد ما المستخدم يجاوب: زر «معنى الآية» قبل زر «السؤال التالي»
  function onAnswered() {
    var old = document.getElementById('nmMeaningBtn'); if (old) old.remove();
    var next = document.getElementById('nextBtn'); if (!next || !currentAyah()) return;
    injectStyle();
    var b = document.createElement('button'); b.type = 'button'; b.id = 'nmMeaningBtn'; b.className = 'nm-open'; b.textContent = '📖 معنى الآية';
    b.onclick = openMeaning; next.parentNode.insertBefore(b, next);
  }
  function onQuestion() {
    var old = document.getElementById('nmMeaningBtn'); if (old) old.remove();
    decorateQuestion();
  }

  // زر «معنى الآية» تحت الآية في التسميع الحر (الشاشة بتتفتح بعد التحميل → نضيفه عند أول فتح)
  function decorateFree() {
    var d = document.getElementById('freeReciteAyahDisplay');
    if (!d || !d.parentNode || document.getElementById('nmFreeBtn')) return;
    injectStyle();
    var b = document.createElement('button'); b.type = 'button'; b.id = 'nmFreeBtn'; b.className = 'nm-open'; b.textContent = '📖 معنى الآية';
    b.onclick = openMeaning;
    d.parentNode.insertBefore(b, d.nextSibling);
  }

  window.NourMeaning = { onQuestion: onQuestion, onAnswered: function () { setTimeout(onAnswered, 60); }, openAudioSettings: openAudioSettings, openMeaning: openMeaning };

  function init() { decorateHome(); decorateQuestion(); decorateFree(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
  else setTimeout(init, 600);
})();
