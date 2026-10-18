# تطبيق نور للأندرويد (Capacitor)

غلاف أصلي بيفتح الموقع الحي `https://nourquranofficial.github.io/nourquran/` — فأي رفع على GitHub بيظهر في التطبيق لوحده من غير APK جديد.
الإشعارات بتروح عن طريق FCM الأصلي وبتظهر باسم «نور» وأيقونته، حتى والتطبيق مقفول.

الـ APK بيتبني على GitHub (مش محتاج Android Studio): الـ workflow في `.github/workflows/build-apk.yml`.

## الإعداد (مرة واحدة)

### ١) Firebase — إضافة تطبيق Android
1. Firebase Console ← **Impostazioni progetto** ← تبويب **Generali** ← **I tuoi app** ← **Aggiungi app** ← أيقونة Android.
2. اسم الحزمة بالظبط: `com.nourquran.app` (باقي الخانات اختيارية) ← **Registra app**.
3. نزّل **google-services.json** وارفعه في المستودع جوه فولدر `android-app/` (جنب `package.json`).
4. باقي خطوات المعالج (Gradle وغيره) اتخطاها.

### ٢) GitHub Secrets (علشان التحديثات تتثبّت فوق بعض)
المستودع ← **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**:
- `ANDROID_KEYSTORE_B64` ← محتوى ملف `keystore.b64.txt`
- `ANDROID_KEYSTORE_PASSWORD` ← الباسورد
من غيرهم الـ APK بيشتغل بس كل نسخة جديدة لازم تمسح اللي قبلها قبل ما تثبّتها.

### ٣) البناء
- بيشتغل تلقائي أول ما ترفع الملفات، أو: **Actions** ← **Build Android APK** ← **Run workflow**.
- بعد ٥–١٠ دقايق الـ APK بيظهر في **Releases** باسم **android-latest** (`nour.apk`). نزّله على التليفون وثبّته.

## ملاحظات
- **تسجيل الدخول بجوجل/فيسبوك** بيستخدم نافذة منبثقة (popup) ومش بتشتغل جوه الـ WebView — استخدم الإيميل وكلمة المرور، أو نعمل تسجيل أصلي بعدين.
- بيانات التطبيق (localStorage) منفصلة عن Chrome: ادخل بحسابك علشان بياناتك تتزامن، وبيانات الضيف ما بتتنقلش.
- لو غيّرت `capacitor.config.json` أو الأيقونة، ارفع التعديل وهيتبني APK جديد.
- بعد التثبيت: افتح إعدادات التذكير ← فعّل التذكير ← وافق على إذن الإشعارات ← **🩺 فحص الإشعارات**.
