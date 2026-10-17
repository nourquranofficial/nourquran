// changelog.js — سجل التحديثات (بيظهر لما المستخدم يضغط على رقم الإصدار في الرئيسية)
// ★ عند كل إصدار جديد: ضيف عنصر جديد في أول مصفوفة CHANGELOG (الأحدث الأول)
//   وغيّر window.NOUR_VERSION في index.html. كل بند: { t: 'new' | 'fix' | 'imp', x: 'النص للمستخدم' }
//   ★ كل تعديل يتسلّم لازم يتسجّل هنا فورًا (في آخر إصدار لو لسه ما اتنشرش، أو إصدار جديد) — الزر «🆕 ما الجديد» بيعرض الملف ده كله.
//   new = ميزة جديدة ✨ | fix = إصلاح 🛠️ | imp = تحسين ⚡ — اكتب بلغة المستخدم، بدون مصطلحات تقنية.
(function () {
  'use strict';

  var CHANGELOG = [
    {
      v: 'v122', title: 'إشعارات توصل حتى والتطبيق مقفول',
      items: [
        { t: 'new', x: 'التذكيرات بقت بتوصلك من السيرفر في وقتها حتى لو التطبيق مقفول تمامًا (مش لازم يكون مفتوح في الخلفية).' },
        { t: 'imp', x: 'نفس الذكاء زي الأول: مفيش إشعارات بالليل، ولو تجاهلتها بتقلّ تلقائيًا.' }
      ]
    },
    {
      v: 'v121', title: 'اختيار وقت التذكير أسهل',
      items: [
        { t: 'new', x: 'وقت التذكير بقى بأزرار جاهزة (تلقائي، ٨ ص، ١ ظهرًا، ٥ عصرًا، ٨ م، ١٠ م) أو تختار أي وقت تحبه بالدقيقة.' },
        { t: 'imp', x: 'التذكير مابقاش بيتأجّل لو فتحت التطبيق من وقت قريب.' }
      ]
    },
    {
      v: 'v120', title: 'إصلاحات وثبات أكتر',
      items: [
        { t: 'fix', x: 'لو فتحت رابط استعادة كلمة المرور من إيميلك على جهاز جديد، بقت بتظهر لك شاشة كلمة المرور الجديدة بدل ما الصفحة تفضل فاضية.' },
        { t: 'fix', x: 'سلسلة الأيام مابقتش بتتكسر بالغلط ليلة تغيير التوقيت الصيفي.' },
        { t: 'fix', x: 'الضغط على Enter أو الضغط المزدوج على «السؤال التالي» مابقاش بيعدّي سؤال.' },
        { t: 'fix', x: 'رسائل التنبيه الصغيرة بقت بتفضل المدة الكاملة ومابتختفيش بدري لما تيجي رسالتين ورا بعض.' },
        { t: 'fix', x: 'آخر جملة في التسميع الصوتي كانت ساعات بتتفهم غلط — اتصلحت.' },
        { t: 'fix', x: 'الصوت في «معنى الآية» وإعدادات القارئ بقى بيقف لما تقفل النافذة، ومابقاش بيتشغل فوق بعضه.' },
        { t: 'imp', x: 'الفتح على النت الضعيف بقى أسرع (بيفتح من النسخة المحفوظة لو الاتصال اتأخر)، وزر Esc بيقفل النوافذ.' },
        { t: 'imp', x: 'أسماء اللاعبين بقت بتتعرض بأمان في لوحة الشرف واللعب الجماعي.' }
      ]
    },
    {
      v: 'v119', title: 'تجربة أسهل وتشجيع في الإشعارات',
      items: [
        { t: 'new', x: 'التذكيرات بقى فيها سطر تشجيعي قصير يناسب موقفك: لسه هتبدأ، في النص، أو قرّبت تخلّص.' },
        { t: 'imp', x: 'لما النت يقطع بتظهر رسالة «أنت أوفلاين» تفهّمك إيه شغال وإيه محتاج إنترنت بدل ما حاجات تقف من غير ما تعرف ليه.' },
        { t: 'imp', x: 'لما النت يرجع بتظهر «رجعت أونلاين ✅» وتختفي لوحدها.' }
      ]
    },
    {
      v: 'v118', title: 'معنى الآية في التسميع الحر',
      items: [
        { t: 'new', x: 'زر «📖 معنى الآية» بقى موجود كمان في التسميع الحر، تحت الآية مباشرة، تقدر تقرا التفسير الميسّر وانت بتسمّع.' }
      ]
    },
    {
      v: 'v117', title: 'إشعارات مخصّصة وأهدى',
      items: [
        { t: 'new', x: 'التذكير بقى على مقاس هدفك: بيقولك هدفك كام آية، وعملت كام، وباقي كام، وحوالي كام دقيقة تخلّصهم.' },
        { t: 'new', x: 'وقت التذكير «تلقائي»: التطبيق بيتعلّم الساعة اللي بتحفظ فيها عادةً ويفكّرك فيها.' },
        { t: 'imp', x: 'إشعارات أقل: أقصى حد ٤ في الأسبوع، ومفيش إشعار لو فاتح التطبيق من ساعتين، وبعد ما تخلّص ورد النهارده مفيش تذكير.' },
        { t: 'imp', x: 'لو ما بتفتحش التطبيق بعد الإشعارات، التذكير بيهدى لوحده (كل يومين ثم ٣ ثم ٥ ثم أسبوع) ويرجع طبيعي أول ما تفتح.' },
        { t: 'imp', x: 'تنبيه خطر السلسلة بقى بس لما سلسلتك يومين فأكتر، وتنبيهات الترتيب مرة كل ٣ أيام بحد أقصى.' }
      ]
    },
    {
      v: 'v116', title: 'إمكانية وصول أفضل',
      items: [
        { t: 'imp', x: 'التطبيق بقى أسهل لقارئات الشاشة: حقول الإدخال والأزرار ليها أسماء، والرسائل المنبثقة بتتقرأ بصوت.' },
        { t: 'imp', x: 'تقدر تتنقل بين الأزرار بالكيبورد وتشوف الزر المحدد بوضوح.' },
        { t: 'imp', x: 'لو مفعّل «تقليل الحركة» في جهازك، التطبيق بيقلّل الحركات والانتقالات تلقائيًا.' }
      ]
    },
    {
      v: 'v115', title: 'تقريرك الأسبوعي ونقاط الضعف',
      items: [
        { t: 'new', x: 'تقرير أسبوعي في شاشة «مراجعة الغلطات»: أكتر ٥ آيات بتغلط فيها، وأضعف سورة عندك، وغلطاتك يوم بيوم.' },
        { t: 'new', x: 'كل آية في التقرير مكتوب جنبها رقمها ورقم الجزء، عشان تساعد ذاكرتك في المكان.' },
        { t: 'imp', x: 'أزرار الأيقونات بقت متسمّاة لقارئات الشاشة (تحسين لإمكانية الوصول).' }
      ]
    },
    {
      v: 'v114', title: 'تسميع أدق وإصلاح الهيدر',
      items: [
        { t: 'imp', x: 'التسميع الصوتي بقى أدق مع الكلمات القرآنية الصعبة: التطبيق بيدّي لمحرك التعرف تلميح بكلمات الآية الحالية (على المتصفحات اللي بتدعم ده).' },
        { t: 'fix', x: 'رجع سطر «الصوت» وزر «🎧 غيّر القارئ» في أعلى الرئيسية بعد ما كانوا اختفوا.' }
      ]
    },
    {
      v: 'v113', title: 'ورد مصغّر وودجت وفتح أسرع',
      items: [
        { t: 'imp', x: 'كارت «وردك اليوم» بقى صغير وبسيط في سطر واحد: حلقة التقدم، باقي كام آية، وسلسلتك — وزر ▶ لإكمال الورد.' },
        { t: 'imp', x: 'الهدف والتذكير والمشاركة اتنقلوا لقائمة «⋯» عشان الرئيسية تبقى أنضف.' },
        { t: 'new', x: 'ودجت الورد: بطاقة صغيرة تضيفها للشاشة الرئيسية في موبايلك وتشوف منها تقدمك وسلسلتك وتكمل وردك بضغطة (من «⋯ ← أضف ودجت»).' },
        { t: 'imp', x: 'التطبيق بيفتح أسرع: نص القرآن اتفصل وبيتخزّن في الجهاز، فالصفحة بقت أخف بكتير (٠.٩ ميجا بدل ٢.٣) وبتشتغل أوفلاين.' },
        { t: 'imp', x: 'الرئيسية أخف: عنوان أصغر، وإحصائيات أكثر إحكاماً، وحقوق الصوت وسياسة الخصوصية نزلت تحت.' },
        { t: 'imp', x: 'رقم الإصدار في الأسفل بقى زر «🆕 ما الجديد»: تضغط عليه تشوف كل سجل التحديثات من الأحدث للأقدم.' },
        { t: 'imp', x: 'الجولة التعريفية بقت بتشرح «وردك اليومي»: الحلقة والسلسلة وزر ▶ وقائمة «⋯».' },
        { t: 'new', x: 'ضغطة مطوّلة على أيقونة نور (أندرويد) بتطلعلك اختصار «ابدأ وردك».' }
      ]
    },
    {
      v: 'v112', title: 'مراجعة اليوم',
      items: [
        { t: 'new', x: 'كارت «🔁 مراجعة اليوم» في الرئيسية: الآية اللي بتغلط فيها بترجعلك بعد يوم، ثم ٣ أيام، ثم أسبوع، وتثبت بعد ٣ إجابات صح متتالية.' },
        { t: 'new', x: 'المراجعة بتجمع الآيات المستحقة من كل السور في جلسة واحدة (لحد ١٠ آيات).' },
        { t: 'new', x: 'تقدّم المراجعة محفوظ على حسابك وبيتزامن مع كل أجهزتك.' }
      ]
    },
    {
      v: 'v111', title: 'تحسين الورد اليومي',
      items: [
        { t: 'imp', x: 'كارت «وردك اليوم» بتصميم جديد: حلقة تقدم متحركة، وباقي كام آية، وآخر ٧ أيام بشكل أوضح.' },
        { t: 'imp', x: 'شاشة الاحتفال بقت بتظهر في الرئيسية بدل ما تقاطعك في نص الأسئلة.' },
        { t: 'imp', x: 'التذكير بقى بيقولك باقي كام آية على وردك، وبيعتبر الورد خلص لما تحقق هدفك (مش لما تلعب سؤال واحد).' },
        { t: 'new', x: 'الورد والسلسلة بقوا محفوظين على حسابك — لو غيّرت الموبايل أو مسحت بيانات التطبيق، تدخل بإيميلك وتلاقي سلسلتك زي ما هي.' },
        { t: 'fix', x: 'سلسلة الأيام كانت بتقف عند ٩٠ يوم — دلوقتي بتكمل، وأفضل سلسلة ليك بتتحفظ.' },
        { t: 'fix', x: 'تغيير الهدف اليومي بقى بيتطبق فوراً قبل ما تكمل وردك، ومن بكرة بعد ما تكمله.' }
      ]
    },
    {
      v: 'v110', title: 'معاني الآيات والقرّاء',
      items: [
        { t: 'new', x: 'زر «📖 معنى الآية» بعد كل إجابة — يعرض التفسير الميسّر (مجمع الملك فهد) لما تفهم اللي بتحفظه.' },
        { t: 'new', x: 'اختيار القارئ: العفاسي، الحصري، المنشاوي، عبد الباسط، السديس، الشريم، ماهر المعيقلي، هاني الرفاعي.' },
        { t: 'new', x: 'تكرار الآية ٣ مرات والتحكم في سرعة التلاوة (٠٫٧٥× / عادية / ١٫٢٥×) للحفظ بتركيز.' },
        { t: 'new', x: 'سجل التحديثات: اضغط على رقم الإصدار أسفل الصفحة لتعرف الجديد في كل نسخة.' },
        { t: 'imp', x: 'التفسير اللي فتحته قبل كده بيتحفظ على جهازك فيفتح بسرعة حتى بدون نت.' },
        { t: 'fix', x: 'لو ملف صوت القارئ مش متاح لآية معينة، بيشتغل صوت العفاسي تلقائيًا بدل ما الصوت يقف.' }
      ]
    },
    {
      v: 'v109', title: 'الورد اليومي',
      items: [
        { t: 'new', x: 'كارت «🌙 وردك اليوم» في الرئيسية: حدد هدفك (٥ / ١٠ / ٢٠ / ٤٠ آية) وتابع تقدمك طول اليوم.' },
        { t: 'new', x: 'سلسلة الأيام المتتالية 🔥 وعرض آخر ٧ أيام، وشاشة احتفال لما تكمل وردك.' },
        { t: 'new', x: 'تذكير يومي ذكي (بإذنك): تختار الوقت ونوع التنبيهات، ومفيش أكتر من تنبيه واحد في اليوم ولا إزعاج بالليل.' },
        { t: 'new', x: 'زر «🤍 شارك الأجر» لمشاركة التطبيق، وزر «📲 ثبّت» لتثبيته على شاشتك الرئيسية.' },
        { t: 'imp', x: 'التطبيق بيتحدّث أسرع وبيفتح بدون نت في أغلب الأحيان.' },
        { t: 'fix', x: 'إصلاح تعارض في ملفات التحديث كان ممكن يخلي النسخة القديمة تفضل ظاهرة.' }
      ]
    },
    {
      v: 'v108', title: 'جولة تعريفية',
      items: [
        { t: 'new', x: 'زر «دليل التطبيق» — جولة بالتأشير بتشرح لك كل جزء في التطبيق خطوة بخطوة.' }
      ]
    },
    {
      v: 'v76 – v107', title: 'تحسينات لوحة الشرف والنقاط',
      items: [
        { t: 'fix', x: 'إصلاح ظهور اسمك أو نقاطك مكررة في لوحة الشرف، وتوحيد نقاطك بين الرئيسية واللوحة.' },
        { t: 'fix', x: 'ترتيب أدق: اللاعبين المتساوين في النقاط بياخدوا نفس المركز، وكارت ترتيبك العام بيتحدّث لحظيًا.' },
        { t: 'fix', x: 'تصفير النقاط بقى ثابت ومبيرجعش من نسخ قديمة على أجهزة تانية.' },
        { t: 'imp', x: 'أسماء العرض بقت فريدة وأوضح في اللوحة.' }
      ]
    },
    {
      v: 'v55 – v75', title: 'الحساب والمزامنة',
      items: [
        { t: 'new', x: 'مزامنة تقدمك لحظيًا (السور اللي بدأتها والمحفوظة والمراجعة) بين أجهزتك.' },
        { t: 'new', x: 'إمكانية تغيير كلمة المرور من داخل التطبيق.' },
        { t: 'imp', x: 'حماية أقوى لكلمات المرور، وتأكيد حفظ بياناتك قبل ما يظهر لك نجاح التسجيل أو الدخول.' },
        { t: 'fix', x: 'إصلاحات في تسجيل الدخول وتوحيد حسابك لما تدخل من أكتر من جهاز.' }
      ]
    }
  ];

  var ICON = { new: '✨', fix: '🛠️', imp: '⚡' };
  var LABEL = { new: 'جديد', fix: 'إصلاح', imp: 'تحسين' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function curVer() { return String(window.NOUR_VERSION || '').split(/\s+—\s+/)[0].trim(); }

  var css = '' +
    '.cl-modal{position:fixed;inset:0;z-index:99996;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;direction:rtl;font-family:"Cairo",sans-serif}' +
    '.cl-sheet{width:100%;max-width:480px;max-height:86vh;overflow:auto;background:#1d1409;border:1px solid rgba(201,151,58,.5);border-bottom:none;border-radius:22px 22px 0 0;padding:18px 18px 24px;color:#F5D98B}' +
    '.cl-sheet h2{margin:0 0 2px;font-size:19px;text-align:center}' +
    '.cl-sub{text-align:center;font-size:12px;color:rgba(245,217,139,.6);margin-bottom:10px}' +
    '.cl-rel{margin:14px 0 0;padding:12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(245,217,139,.14)}' +
    '.cl-rel.cur{border-color:rgba(201,151,58,.6);background:rgba(201,151,58,.1)}' +
    '.cl-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}' +
    '.cl-v{font-weight:900;font-size:14px;color:#1A1208;background:linear-gradient(135deg,#C9973A,#E8B84B);border-radius:8px;padding:2px 9px;direction:ltr}' +
    '.cl-title{font-weight:700;font-size:14px;color:#fff}' +
    '.cl-now{font-size:10px;color:#7DFFC9;border:1px solid rgba(46,175,120,.6);border-radius:8px;padding:1px 6px;margin-inline-start:auto}' +
    '.cl-it{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;line-height:1.85;color:#f3ead2;margin:3px 0}' +
    '.cl-it b{flex:none;font-size:10.5px;font-weight:700;margin-top:6px;padding:0 6px;border-radius:6px;line-height:1.7;border:1px solid}' +
    '.cl-it b.new{color:#7DFFC9;border-color:rgba(46,175,120,.6)}.cl-it b.fix{color:#ffb784;border-color:rgba(255,150,80,.6)}.cl-it b.imp{color:#9fd0ff;border-color:rgba(120,180,255,.55)}' +
    '.cl-close{display:block;width:100%;margin-top:16px;padding:11px;border-radius:12px;border:1px solid rgba(245,217,139,.35);background:transparent;color:#F5D98B;font-family:inherit;font-size:14px;cursor:pointer}' +
    '.cl-tap{cursor:pointer;text-decoration:underline;text-underline-offset:3px;-webkit-tap-highlight-color:transparent}';

  function open() {
    if (!document.getElementById('clStyle')) { var st = document.createElement('style'); st.id = 'clStyle'; st.textContent = css; document.head.appendChild(st); }
    if (document.querySelector('.cl-modal')) return;
    var cv = curVer();
    var html = '<h2>🌙 ما الجديد في نور</h2><div class="cl-sub">سجل التحديثات — الأحدث أولًا</div>';
    CHANGELOG.forEach(function (r, i) {
      html += '<div class="cl-rel' + (i === 0 ? ' cur' : '') + '"><div class="cl-head"><span class="cl-v">' + esc(r.v) + '</span><span class="cl-title">' + esc(r.title) + '</span>' +
        (r.v === cv ? '<span class="cl-now">نسختك</span>' : '') + '</div>';
      r.items.forEach(function (it) { html += '<div class="cl-it"><b class="' + it.t + '">' + ICON[it.t] + ' ' + LABEL[it.t] + '</b><span>' + esc(it.x) + '</span></div>'; });
      html += '</div>';
    });
    html += '<button type="button" class="cl-close">إغلاق</button>';
    var m = document.createElement('div'); m.className = 'cl-modal';
    m.innerHTML = '<div class="cl-sheet" role="dialog" aria-modal="true" aria-label="سجل التحديثات">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target === m || (e.target.classList && e.target.classList.contains('cl-close'))) m.remove(); });
    document.body.appendChild(m);
    try { localStorage.setItem('nour_seen_ver', cv); } catch (e) {}
  }

  // اجعل رقم الإصدار قابلاً للضغط (الرقم بيتكتب من سكربت تاني بعد التحميل → ربط بالتفويض)
  function mark() {
    ['appVerTag', 'appVerTagBottom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.textContent.replace(/[·\s]/g, '')) el.textContent = (id === 'appVerTag' ? '· ' : '') + '🆕 ما الجديد'; // احتياطي لو سكربت الإصدار ما اشتغلش
      if (el && !el.classList.contains('cl-tap')) {
        el.classList.add('cl-tap'); el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'ما الجديد — سجل التحديثات'); if (!el.title) el.title = 'ما الجديد؟';
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#appVerTag, #appVerTagBottom') : null;
    if (t) { e.preventDefault(); open(); }
  });

  // أول مرة بعد التحديث: تنويه صغير بدل ما نقاطع المستخدم
  function announce() {
    var cv = curVer(), seen = null;
    try { seen = localStorage.getItem('nour_seen_ver'); } catch (e) {}
    if (seen === null) { try { localStorage.setItem('nour_seen_ver', cv); } catch (e) {} return; } // مستخدم جديد: مفيش داعي
    if (cv && seen !== cv && typeof showToast === 'function') showToast('🌙 تحديث جديد ' + cv + ' — اضغط على «🆕 ما الجديد» تحت لتعرف التفاصيل', 6000);
    if (cv && seen !== cv) { try { localStorage.setItem('nour_seen_ver', cv); } catch (e) {} }
  }

  window.NourChangelog = { open: open, entries: CHANGELOG };
  function init() { mark(); setTimeout(mark, 1500); setTimeout(announce, 4000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
  else setTimeout(init, 600);
})();
