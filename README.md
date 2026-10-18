# إشعارات نور من السيرفر (Cloudflare Cron + FCM)

الـ Worker ده بيشتغل كل دقيقة (مجاني، من غير كارت) فالإشعار بيوصل في دقته تقريبًا وبيبعت الإشعارات للأجهزة حتى والتطبيق مقفول.
بيستخدم **نفس منطق `notif-logic.js`** (الأوقات، الليل الهادي، الكبح الذكي) فأي تعديل في النصوص بيتطبق هنا والتطبيق مرة واحدة.

## الإعداد (مرة واحدة)

### ١) Firebase
1. **Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair** → انسخ المفتاح العام وحطه في `index.html`:
   `window.NOUR_VAPID_KEY = '...';`
2. تأكد إن **Firebase Cloud Messaging API (V1)** مفعّل (Project settings ← Cloud Messaging).
3. **Project settings ← Service accounts ← Generate new private key** → هينزل ملف JSON. **متحطوش في الريبو ولا في الكود.**
4. **Realtime Database ← Rules**: ضيف القاعدة دي جنب باقي القواعد (الـ Worker بيقرا ويكتب بصلاحية الـ Service Account فمش محتاج قواعد):
```json
"pushDevices": {
  ".read": false,
  "$deviceId": {
    ".write": "auth != null",
    "token": { ".validate": "newData.isString() && newData.val().length < 400" },
    "srv": { ".write": false }
  }
}
```

### ٢) Cloudflare (من فولدر `push-worker`)
```bash
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # الصق محتوى ملف الـ JSON كامل
npx wrangler secret put ADMIN_KEY                  # أي كلمة سر طويلة (لاختبار /test)
npx wrangler deploy
```
الـ Cron بيتفعّل تلقائيًا من `wrangler.toml` (`* * * * *`).

### ٣) اختبار
فعّل التذكير في التطبيق (الورد ← 🔔) ثم:
```bash
curl -X POST https://nour-push.<حسابك>.workers.dev/test -H "X-Admin-Key: <ADMIN_KEY>"   # إشعار تجريبي فوري
curl -X POST https://nour-push.<حسابك>.workers.dev/dry-run -H "X-Admin-Key: <ADMIN_KEY>" # مين هيوصله إشعار دلوقتي (من غير إرسال)
```
اللوج المباشر: `npx wrangler tail`.

## ملاحظات
- الخطة المجانية: ٥٠ طلب خارجي للتشغيلة → الـ Worker بيبعت ٣٨ إشعار كحد أقصى كل تشغيلة والباقي بيكمل في اللي بعدها.
- لو التطبيق مسجّل توكن شغّال، الفحص المحلي بيسكت تلقائيًا (مفيش تكرار). لو التوكن ما اتجدّدش ٣ أيام يرجع الفحص المحلي كاحتياطي.
- توكن منتهي أو جهاز مقفول من ٦٠ يوم بيتمسح تلقائيًا.
- كل تشغيلة بتقرا قائمة الأجهزة من Realtime Database (حوالي ١ كيلوبايت للجهاز). حصة الخطة المجانية (١٠ جيجا/شهر) تكفي لحوالي ٣٠٠ جهاز؛ لو زادوا عن كده نضيف فهرس ونقرا اللي محتاج بس.
