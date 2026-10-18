#!/usr/bin/env python3
"""يجهّز مشروع أندرويد (اللي طلع من `npx cap add android`) لنور:
  • ينسخ google-services.json (إشعارات FCM)
  • يعدّل AndroidManifest (صلاحيات + أيقونة/لون/قناة الإشعار)
  • يولّد الأيقونات وشاشة البداية وأيقونة الإشعار من icon-512.png بتاع الموقع
بيشتغل من فولدر android-app. أي خطأ بيوقف البناء برسالة واضحة."""
import os, re, shutil, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
APP = os.path.join(ROOT, 'android', 'app')
RES = os.path.join(APP, 'src', 'main', 'res')
MANIFEST = os.path.join(APP, 'src', 'main', 'AndroidManifest.xml')
ICON = os.path.join(ROOT, '..', 'icon-512.png')
BG = (12, 12, 12, 255)
GOLD = (201, 151, 58, 255)

def die(msg):
    print('❌ ' + msg); sys.exit(1)

# ── 1) google-services.json ──
gs = os.path.join(ROOT, 'google-services.json')
if not os.path.exists(gs):
    die('google-services.json مش موجود في android-app/. نزّله من Firebase (إضافة تطبيق Android باسم الحزمة com.nourquran.app) وارفعه جنب package.json.')
shutil.copy(gs, os.path.join(APP, 'google-services.json'))
txt = open(gs, encoding='utf-8').read()
if 'com.nourquran.app' not in txt:
    die('google-services.json مش لحزمة com.nourquran.app — لازم اسم الحزمة في Firebase يكون com.nourquran.app بالظبط.')
print('✅ google-services.json')

# ── 2) المانيفست ──
m = open(MANIFEST, encoding='utf-8').read()
perms = ['android.permission.POST_NOTIFICATIONS', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.VIBRATE']
add_perm = ''.join('    <uses-permission android:name="%s" />\n' % p for p in perms if p not in m)
m = m.replace('</manifest>', add_perm + '</manifest>', 1)
meta = '''
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_nour" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/nour_notification" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="nour" />
'''
if 'default_notification_icon' not in m:
    m = m.replace('</application>', meta + '    </application>', 1)
open(MANIFEST, 'w', encoding='utf-8').write(m)
if 'POST_NOTIFICATIONS' not in m or 'default_notification_icon' not in m:
    die('تعديل المانيفست ما نجحش')
print('✅ AndroidManifest')

# ألوان
vals = os.path.join(RES, 'values')
os.makedirs(vals, exist_ok=True)
open(os.path.join(vals, 'nour_colors.xml'), 'w', encoding='utf-8').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="nour_notification">#C9973A</color>\n</resources>\n')
open(os.path.join(vals, 'ic_launcher_background.xml'), 'w', encoding='utf-8').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0C0C0C</color>\n</resources>\n')

# ── 3) الأيقونات ──
src = Image.open(ICON).convert('RGBA')
# الهلال = البكسلات الصفرا (باقي الأيقونة خلفية غامقة)
def crescent_mask(size):
    s = src.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', s.size, 0)
    px, mp = s.load(), mask.load()
    for y in range(s.size[1]):
        for x in range(s.size[0]):
            r, g, b, a = px[x, y]
            mp[x, y] = max(0, min(255, int((r - 60) * 255 / 190))) if (r > g * 0.95 and g > b * 1.5) else 0
    return mask

def fg_layer(size, scale=0.62):
    """هلال دهبي على شفاف، متوسّط في آمن ٦٦٪ (للأيقونة المتكيّفة)"""
    inner = int(size * scale)
    mask = crescent_mask(inner)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gold = Image.new('RGBA', (inner, inner), GOLD[:3] + (255,))
    off = (size - inner) // 2
    layer.paste(gold, (off, off), mask)
    return layer

def legacy(size, round_=False):
    img = Image.new('RGBA', (size, size), BG)
    img.alpha_composite(fg_layer(size, 0.78))
    if round_:
        mk = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mk).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(img, (0, 0), mk); return out
    return img

def white_stat(size):
    inner = int(size * 0.8)
    mask = crescent_mask(inner)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    white = Image.new('RGBA', (inner, inner), (255, 255, 255, 255))
    off = (size - inner) // 2
    layer.paste(white, (off, off), mask)
    return layer

n = 0
for d in sorted(os.listdir(RES)):
    full = os.path.join(RES, d)
    if not os.path.isdir(full): continue
    for f in os.listdir(full):
        p = os.path.join(full, f)
        if not f.endswith('.png'): continue
        w, h = Image.open(p).size
        if d.startswith('mipmap-'):
            if f == 'ic_launcher_foreground.png': img = fg_layer(w)
            elif f == 'ic_launcher_round.png': img = legacy(w, True)
            elif f == 'ic_launcher.png': img = legacy(w)
            else: continue
        elif d.startswith('drawable') and f == 'splash.png':
            img = Image.new('RGBA', (w, h), BG)
            side = int(min(w, h) * 0.28)
            lg = fg_layer(side, 1.0)
            img.alpha_composite(lg, ((w - side) // 2, (h - side) // 2))
        else: continue
        img.save(p); n += 1
print('✅ أيقونات وشاشة بداية: %d ملف' % n)
if n < 10: die('عدد الأيقونات اللي اتبدّلت قليل جدًا — قالب Capacitor اتغيّر؟')

# أيقونة الإشعار (أبيض على شفاف) بكل الكثافات
for dens, sz in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    dd = os.path.join(RES, 'drawable-' + dens); os.makedirs(dd, exist_ok=True)
    white_stat(sz).save(os.path.join(dd, 'ic_stat_nour.png'))
print('✅ أيقونة الإشعار')
