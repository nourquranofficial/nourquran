// a11y.js — تحسينات إمكانية الوصول وقت التشغيل (بند ١٠ في خارطة الطريق)
// بيشتغل على العناصر الموجودة والمتولّدة ديناميكياً من غير ما نلمس منطق التطبيق:
//  • حقول الإدخال من غير اسم → aria-label من الـ placeholder
//  • عناصر قابلة للضغط (div/span فيها onclick) → role=button + تركيز بالكيبورد + Enter/Space
//  • رسائل التوست → aria-live عشان قارئ الشاشة يقرأها
//  • حلقة تركيز واضحة (focus-visible) واحترام «تقليل الحركة» في إعدادات الجهاز
(function () {
  'use strict';

  var css =
    ':focus-visible{outline:2px solid #F5D98B;outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}';
  var st = document.createElement('style'); st.id = 'a11yStyle'; st.textContent = css; (document.head || document.documentElement).appendChild(st);

  function label(el) {
    var p = (el.getAttribute('placeholder') || '').replace(/[^\u0600-\u06FFa-zA-Z0-9@.\s]/g, '').trim();
    return p || el.getAttribute('title') || '';
  }

  function scan(root) {
    try {
      root = root || document;
      var i, els;
      els = root.querySelectorAll('input:not([type=hidden]):not([type=range]):not([aria-label]):not([aria-labelledby]), textarea:not([aria-label]), select:not([aria-label])');
      for (i = 0; i < els.length; i++) {
        var e = els[i];
        if (e.id && document.querySelector('label[for="' + e.id + '"]')) continue;
        if (e.closest && e.closest('label')) continue;
        var l = label(e); if (l) e.setAttribute('aria-label', l);
      }
      els = root.querySelectorAll('div[onclick]:not([role]), span[onclick]:not([role]), li[onclick]:not([role])');
      for (i = 0; i < els.length; i++) {
        // ★ الحاويات اللي جواها أزرار/حقول (خلفيات النوافذ والكروت) ما تتحولش لزر — كانت بتتعلن وتاخد Tab وتقفل النافذة بـ Enter
        if (els[i].querySelector('button, a[href], input, select, textarea, [onclick], [role=button]')) continue;
        els[i].setAttribute('role', 'button'); els[i].setAttribute('data-a11y', '1');
        if (!els[i].hasAttribute('tabindex')) els[i].setAttribute('tabindex', '0');
      }
      var t = document.getElementById('toast');
      if (t && !t.hasAttribute('aria-live')) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); }
    } catch (e) { /* تحسين اختياري — ما يعطّلش التطبيق */ }
  }

  // Enter / Space على العناصر اللي حوّلناها لأزرار
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-a11y') === '1') { e.preventDefault(); t.click(); }
  });

  var timer = null;
  function later() { clearTimeout(timer); timer = setTimeout(function () { scan(); }, 150); }
  function init() {
    scan();
    try { new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.NourA11y = { scan: scan };
})();
