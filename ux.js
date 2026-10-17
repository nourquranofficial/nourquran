// ux.js — تحسينات تجربة الاستخدام (بند ٤ في خارطة الطريق: رسالة «أنت أوفلاين» بدل الأخطاء الصامتة)
//  • شريط رفيع أعلى الشاشة لما النت يقطع: اللعب شغال، والصوت والتفسير والمزامنة محتاجين نت
//  • لما النت يرجع: «رجعت أونلاين ✅» ويختفي لوحده بعد ثواني
(function () {
  'use strict';
  var bar = null, hideT = null;

  function css() {
    if (document.getElementById('uxStyle')) return;
    var s = document.createElement('style'); s.id = 'uxStyle';
    s.textContent =
      '#uxNet{position:fixed;left:0;right:0;top:0;z-index:99999;padding:calc(6px + env(safe-area-inset-top,0px)) 12px 6px;text-align:center;font:600 12px/1.6 Cairo,sans-serif;direction:rtl;' +
      'background:#3a2a10;color:#F5D98B;border-bottom:1px solid rgba(201,151,58,.5);transform:translateY(-110%);transition:transform .25s ease;pointer-events:none}' +
      '#uxNet.show{transform:none}#uxNet.ok{background:#12301f;color:#9be7bf;border-color:rgba(46,175,120,.5)}' +
      '@media (prefers-reduced-motion:reduce){#uxNet{transition:none}}';
    document.head.appendChild(s);
  }
  function el() {
    if (bar) return bar;
    css();
    bar = document.createElement('div'); bar.id = 'uxNet'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite');
    document.body.appendChild(bar);
    return bar;
  }
  function show(text, ok, autoHide) {
    var b = el(); clearTimeout(hideT);
    b.textContent = text; b.className = (ok ? 'ok ' : '') + 'show';
    if (autoHide) hideT = setTimeout(function () { b.className = ok ? 'ok' : ''; }, autoHide);
  }
  function offline() { show('📡 أنت أوفلاين — اللعب شغال، لكن الصوت والتفسير والمزامنة محتاجين إنترنت', false, 0); }
  function online()  { show('رجعت أونلاين ✅', true, 2500); }

  function init() {
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    if (navigator.onLine === false) offline();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
