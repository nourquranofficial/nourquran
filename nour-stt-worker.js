// nour-stt-worker.js — Cloudflare Worker: تحويل مقطع تلاوة قصير (WAV) لنص عربي بـ Whisper على Workers AI
// من غير أي مفتاح خارجي ومن غير Gemini — بيستخدم الـ AI binding بتاع حساب Cloudflare نفسه (فيه حصة مجانية يومية).
//
// النشر (مرة واحدة):
//   ١) wrangler.toml جنب الملف ده:
//        name = "nour-stt"
//        main = "nour-stt-worker.js"
//        compatibility_date = "2025-01-01"
//        [ai]
//        binding = "AI"
//        [vars]
//        ALLOWED_ORIGINS = "https://nourquranofficial.github.io"
//   ٢) wrangler deploy
//   ٣) حط رابط الـ worker في index.html:  window.NOUR_STT_URL = 'https://nour-stt.<حسابك>.workers.dev';
// متغيّرات اختيارية: STT_MODEL (الافتراضي @cf/openai/whisper-large-v3-turbo) · STT_IP_PER_MIN (الافتراضي 60)

const MAX_BYTES = 3 * 1024 * 1024;      // ~90 ثانية WAV 16kHz
const MIN_BYTES = 1600;                  // أقل من 50ms = مفيش كلام

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://nourquranofficial.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });

// عدّاد بسيط في الذاكرة لكل IP (best-effort لكل instance) — يحمي حصة Workers AI من الاستخدام الزايد
const hits = new Map();
function rate(ip, limit) {
  const now = Date.now();
  let e = hits.get(ip);
  if (!e || e.exp <= now) { e = { n: 0, exp: now + 60000 }; hits.set(ip, e); }
  e.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.exp <= now) hits.delete(k);
  return e.n <= limit;
}
function b64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// Whisper بيهلوس جمل جاهزة لما الصوت ضوضاء — بنتجاهلها
const HALLUCINATION = /اشترك|ترجمة|شكرا? (على|لك|لكم)|مشاهدة|نانسي|subscribe|thanks for watching/i;

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
    if (!env.AI) return json({ error: 'NO_AI_BINDING' }, 500, h);
    const ctype = String(req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(ctype)) return json({ error: 'BAD_TYPE' }, 415, h);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rate(ip, parseInt(env.STT_IP_PER_MIN, 10) || 60)) return json({ error: 'RATE' }, 429, { ...h, 'Retry-After': '30' });

    let buf;
    try { buf = await req.arrayBuffer(); } catch { return json({ error: 'BAD_BODY' }, 400, h); }
    if (buf.byteLength > MAX_BYTES) return json({ error: 'TOO_BIG' }, 413, h);
    if (buf.byteLength < MIN_BYTES) return json({ text: '' }, 200, h);

    let out;
    try {
      out = await env.AI.run(env.STT_MODEL || '@cf/openai/whisper-large-v3-turbo', { audio: b64(buf), language: 'ar', task: 'transcribe' });
    } catch (e) {
      const busy = /429|capacity|rate|limit|quota/i.test(String(e && e.message));
      return json({ error: busy ? 'BUSY' : 'UPSTREAM' }, busy ? 429 : 502, h);
    }
    let text = String((out && out.text) || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[؀-ۿ]/.test(text) || HALLUCINATION.test(text)) text = '';   // مفيش عربي أو هلوسة = مفيش تلاوة
    return json({ text: text.slice(0, 2000) }, 200, h);
  },
};
