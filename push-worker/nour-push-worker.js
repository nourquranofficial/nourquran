// nour-push-worker.js — Cloudflare Worker (Cron): بيبعت إشعارات "نور" كـ Push حقيقي عبر FCM HTTP v1
// حتى لو التطبيق مقفول. بيستخدم Firebase Service Account كسر في Cloudflare (مفيش مفاتيح في الكود).
//
// الفكرة:
//   • التطبيق (push.js) بيسجّل توكن FCM + سياق المستخدم (ورده/سلسلته/ترتيبه/تفضيلاته) في  pushDevices/<deviceId>
//   • كل دقيقة الـ Cron بيقرا الأجهزة، بيطبّق نفس منطق notif-logic.js بالظبط (مصدر واحد للحقيقة)
//     بتوقيت كل مستخدم، وبيبعت للي محتاج إشعار، وبيسجّل حالة الكبح في pushDevices/<id>/srv
//   • توكن منتهي (UNREGISTERED) بيتمسح تلقائيًا
//
// حدود الخطة المجانية اللي مراعيها: ٥٠ طلب خارجي للتشغيلة (بنحدّ الإرسال بـ MAX_SENDS) — اللي زاد بيكمل في التشغيلة اللي بعدها.

import '../notif-logic.js';              // بيعرّف globalThis.NourNotif (نفس منطق الصفحة والـ SW)
const NN = globalThis.NourNotif;

const MAX_SENDS = 38;                      // + طلب توكن + قراءة + كتابة = تحت حد الـ ٥٠
const STALE_DEVICE_MS = 60 * 86400000;     // جهاز ما فتحش التطبيق ٦٠ يوم → نمسحه
const SCOPES = [
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ───────── OAuth: Service Account → Access Token (JWT RS256 بـ WebCrypto) ─────────
let tokenCache = { value: null, exp: 0 };

const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlStr = (str) => b64url(new TextEncoder().encode(str));

function parseSA(env) {
  let sa;
  try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT مش JSON صالح'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT ناقص (client_email/private_key/project_id)');
  return sa;
}

async function getAccessToken(sa) {
  const nowS = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 120 > nowS) return tokenCache.value;
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({
    iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: nowS, exp: nowS + 3600,
  }));
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + b64url(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('OAuth فشل: ' + (j.error_description || j.error || res.status));
  tokenCache = { value: j.access_token, exp: nowS + (j.expires_in || 3600) };
  return tokenCache.value;
}

// ───────── توقيت المستخدم: Date "حائط" — حقوله المحلية = ساعة المستخدم (الـ Worker بيشتغل UTC فالـ getHours() بتطلّع ساعته هو) ─────────
function wallClock(tz, nowMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Africa/Cairo', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(nowMs));
    const g = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    return new Date(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  } catch (e) {
    return new Date(nowMs + 3 * 3600000 - (new Date(nowMs).getTimezoneOffset() * 60000)); // احتياطي: القاهرة تقريبًا
  }
}

// ───────── Realtime Database (REST) + FCM ─────────
async function dbGet(env, token, path) {
  const res = await fetch(env.FIREBASE_DB_URL + '/' + path + '.json', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('DB read ' + res.status);
  return res.json();
}
// تحديث متعدد المسارات في طلب واحد (null = مسح)
async function dbMultiUpdate(env, token, updates) {
  if (!Object.keys(updates).length) return;
  const res = await fetch(env.FIREBASE_DB_URL + '/.json', {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('DB write ' + res.status);
}

async function sendFcm(sa, token, deviceToken, n, base, platform) {
  const data = { title: n.title, body: n.body, tag: n.tag || 'nour' };
  if (n.data) { if (n.data.deeplink) data.deeplink = n.data.deeplink; if (n.data.surah) data.surah = n.data.surah; }
  const res = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: platform === 'android'
        ? {
            // تطبيق أندرويد أصلي: لازم notification block عشان النظام يعرضه والتطبيق مقفول (رسائل data بس ما بتظهرش لوحدها)
            token: deviceToken,
            notification: { title: n.title, body: n.body },
            data,
            android: { priority: 'HIGH', ttl: '21600s', notification: { channel_id: 'nour', icon: 'ic_stat_nour', color: '#C9973A', tag: n.tag || 'nour' } },
          }
        : {
            token: deviceToken,
            data,   // ويب: الـ SW (sw.js → push) هو اللي بيعرض الإشعار بنفس شكل الإشعار المحلي
            webpush: { headers: { Urgency: 'normal', TTL: '21600' }, fcm_options: { link: base } },
          },
    }),
  });
  if (res.ok) return { ok: true };
  const j = await res.json().catch(() => ({}));
  const status = (j.error && j.error.status) || '';
  const dead = res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED' || (res.status === 400 && status === 'INVALID_ARGUMENT');
  return { ok: false, dead, status: res.status, msg: (j.error && j.error.message) || '' };
}

// ───────── التشغيلة الأساسية ─────────
async function run(env, opts) {
  opts = opts || {};
  const sa = parseSA(env);
  const token = await getAccessToken(sa);
  const devices = (await dbGet(env, token, 'pushDevices')) || {};
  const base = env.SITE_BASE || '/nourquran/';
  const nowMs = Date.now();
  const updates = {};
  const stats = { devices: 0, sent: 0, skipped: 0, dead: 0, errors: 0, deferred: 0 };

  // الأقدم إرسالًا أولًا — عشان لو في زحمة محدّش يتأخر على طول
  const ids = Object.keys(devices).sort((a, b) => ((devices[a].srv || {}).lastNotifAt || 0) - ((devices[b].srv || {}).lastNotifAt || 0));
  for (const id of ids) {
    const d = devices[id]; stats.devices++;
    if (!d || typeof d !== 'object' || !d.token) { updates['pushDevices/' + id] = null; continue; }
    if (d.updated && nowMs - d.updated > STALE_DEVICE_MS) { updates['pushDevices/' + id] = null; stats.dead++; continue; }
    const c = d.ctx;
    if (!c || !c.prefs || !c.prefs.enabled) { stats.skipped++; continue; }
    if (!('doneDay' in c)) c.doneDay = null;   // Realtime DB بيشيل القيم null — المنطق بيعتمد على وجود الحقل
    const srv = d.srv || {};
    const now = wallClock(d.tz, nowMs);
    const ev = NN.evaluate(c, {
      last: srv.lastNotifAt || 0, lastOpen: d.openAt || 0, ignored: srv.ignored || 0, log: srv.sentLog || [], lastRankAt: srv.lastRankAt || 0,
    }, now, nowMs);
    if (!ev) { stats.skipped++; continue; }
    if (stats.sent >= MAX_SENDS) { stats.deferred++; continue; }
    if (opts.dry) { stats.sent++; continue; }

    const r = await sendFcm(sa, token, d.token, ev.n, base, d.platform);
    if (r.ok) {
      stats.sent++;
      const keep = (Array.isArray(srv.sentLog) ? srv.sentLog : []).filter((t) => nowMs - t < 7 * 86400000); keep.push(nowMs);
      updates['pushDevices/' + id + '/srv'] = {
        lastNotifAt: nowMs, ignored: ev.ignored, sentLog: keep,
        lastRankAt: (ev.n.tag === 'rank_drop' || ev.n.tag === 'rank_hold') ? nowMs : (srv.lastRankAt || 0),
      };
    } else if (r.dead) { stats.dead++; updates['pushDevices/' + id] = null; }
    else { stats.errors++; console.warn('FCM', id, r.status, r.msg); }
  }
  if (!opts.dry) await dbMultiUpdate(env, token, updates);
  return stats;
}

// إرسال تجريبي فوري لجهاز واحد (أو كل الأجهزة) — بيتحمي بـ ADMIN_KEY
async function testPush(env, deviceId) {
  const sa = parseSA(env), token = await getAccessToken(sa);
  const devices = (await dbGet(env, token, 'pushDevices')) || {};
  const out = [];
  for (const id of Object.keys(devices).filter((k) => !deviceId || k === deviceId).slice(0, 20)) {
    const d = devices[id]; if (!d || !d.token) continue;
    const r = await sendFcm(sa, token, d.token, { tag: 'nour_test', title: '🔔 اختبار إشعارات نور', body: 'لو شايف الرسالة دي يبقى الإشعار من السيرفر شغّال ✅', data: { deeplink: 'home' } }, env.SITE_BASE || '/nourquran/', d.platform);
    out.push({ id, ok: r.ok, status: r.status, msg: r.msg });
    if (r.dead) await dbMultiUpdate(env, token, { ['pushDevices/' + id]: null });
  }
  return out;
}

// ★ v126: اختبار ذاتي من التطبيق — بيبعت إشعار تجريبي لجهاز واحد بس (المعرّف العشوائي بتاعه هو الإذن) مع حد ١ كل ٢٠ ثانية
async function selfTest(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://nourquranofficial.github.io').split(',').map((x) => x.trim());
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  const h = { 'Access-Control-Allow-Origin': ok ? origin : allowed[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const out = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST' || !ok) return out({ error: 'forbidden' }, 403);
  let id = ''; try { id = String((await req.json()).device || ''); } catch (e) {}
  if (!/^[a-z0-9]{16,64}$/.test(id)) return out({ error: 'BAD_DEVICE' }, 400);
  const sa = parseSA(env), token = await getAccessToken(sa);
  const d = await dbGet(env, token, 'pushDevices/' + id);
  if (!d || !d.token) return out({ error: 'الجهاز مش مسجّل في pushDevices (التسجيل لسه ما تمّش)' }, 404);
  const now = Date.now();
  if (d.srv && d.srv.lastTestAt && now - d.srv.lastTestAt < 20000) return out({ error: 'استنى ٢٠ ثانية بين كل تجربة' }, 429);
  const r = await sendFcm(sa, token, d.token, { tag: 'nour_test', title: '🔔 اختبار إشعارات نور', body: 'لو شايف الرسالة دي يبقى الإشعار من السيرفر شغّال ✅', data: { deeplink: 'home' } }, env.SITE_BASE || '/nourquran/', d.platform);
  await dbMultiUpdate(env, token, r.dead ? { ['pushDevices/' + id]: null } : { ['pushDevices/' + id + '/srv/lastTestAt']: now });
  return out(r.ok ? { ok: true } : { ok: false, error: 'FCM ' + r.status + ' ' + (r.msg || ''), dead: !!r.dead }, r.ok ? 200 : 502);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env).then((s) => console.log('nour-push', JSON.stringify(s))).catch((e) => console.error('nour-push FAILED:', e && e.message)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (url.pathname === '/self-test') { try { return await selfTest(env, req); } catch (e) { return json({ error: String(e && e.message) }, 500); } }
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'nour-push' });
    const authed = env.ADMIN_KEY && req.headers.get('X-Admin-Key') === env.ADMIN_KEY;
    if (!authed) return json({ error: 'unauthorized' }, 401);
    try {
      if (url.pathname === '/test' && req.method === 'POST') return json({ results: await testPush(env, url.searchParams.get('device')) });
      if (url.pathname === '/dry-run' && req.method === 'POST') return json(await run(env, { dry: true }));   // يحسب مين هيوصله إشعار من غير ما يبعت
      if (url.pathname === '/run' && req.method === 'POST') return json(await run(env));
    } catch (e) { return json({ error: String(e && e.message) }, 500); }
    return json({ error: 'not_found' }, 404);
  },
};
