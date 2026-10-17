// nour-stt.js — تسميع صوتي من غير «بيب» الأندرويد
// نفس فكرة كادر: بنفتح الميكروفون مرة واحدة ونسيبه شغّال، وبنقطّع الكلام عند الوقفات (VAD) ونبعت كل مقطع
// لسيرفر (Cloudflare Worker ← Whisper) يرجّعه نص. فمفيش SpeechRecognition بيتقفل ويتعاد تشغيله → مفيش صوت.
//
// الاستخدام: بدل `new SpeechRecognition()` نكتب `NourSTT.create(SpeechRecognition)`.
//  • لو window.NOUR_STT_URL فاضي أو الجهاز مش بيدعم تسجيل الصوت الخام → بيرجّع SpeechRecognition العادي (سلوك زي ما هو).
//  • غير كده بيرجّع كائن شبيه بـ SpeechRecognition (start/stop/abort + onstart/onresult/onerror/onend…) فباقي الكود مش بيتغيّر.
//  • لو السيرفر مابيردش مرتين ورا بعض قبل أي نجاح → بيرجع تلقائي لـ SpeechRecognition (واحتياطي ٤٥ ثانية).
(function () {
  'use strict';

  var RATE = 16000;
  var WORKLET_SRC = "class P extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0;}process(i){var c=i[0]&&i[0][0];if(!c)return true;for(var k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===1024){this.port.postMessage(this.b.slice(0));this.n=0;}}return true;}}registerProcessor('nour-pcm',P);";
  var cloudBroken = false, cloudBrokenAt = 0;

  function url() { return String(window.NOUR_STT_URL || '').trim(); }
  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }
  function enabled() {
    if (!url() || !canRecord() || !window.isSecureContext) return false;
    if (cloudBroken && Date.now() - cloudBrokenAt > 45000) cloudBroken = false;
    return !cloudBroken;
  }

  // ---------- صوت ----------
  function downsample(f32, from, to) {
    if (!(from > to)) return f32;
    var ratio = from / to, n = Math.floor(f32.length / ratio), out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * ratio), b = Math.min(f32.length, Math.floor((i + 1) * ratio)), sum = 0;
      if (b <= a) b = a + 1;
      for (var k = a; k < b; k++) sum += f32[k];
      out[i] = sum / (b - a);
    }
    return out;
  }
  function wav(f32, rate) {
    var n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var j = 0; j < n; j++) { var s = Math.max(-1, Math.min(1, f32[j])); v.setInt16(44 + j * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    return buf;
  }
  function concat(chunks, total) {
    var out = new Float32Array(total), o = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }

  // كاشف الكلام: من أول كلام لحد وقفة endMs. الحد الأدنى للصوت بيتظبط على ضوضاء الأوضة. مقاطع أقصر من minVoiceMs بتتجاهل.
  function makeVad(rate, cfg) {
    cfg = cfg || {};
    var startMs = cfg.startMs || 90, endMs = cfg.endMs || 700, preMs = cfg.preMs || 350, minVoiceMs = cfg.minVoiceMs || 250, maxMs = cfg.maxMs || 20000, tailMs = cfg.tailMs || 300;
    var floor = 0.004, ring = [], ringN = 0, cur = null, curN = 0, voiced = 0, quiet = 0, loudRun = 0;
    function msOf(n) { return n * 1000 / rate; }
    function rmsOf(c) { var s = 0; for (var i = 0; i < c.length; i++) s += c[i] * c[i]; return Math.sqrt(s / (c.length || 1)); }
    function take(forced, stillLoud) {
      var out = null;
      if (voiced >= minVoiceMs) {
        var cut = Math.max(0, Math.floor((quiet - tailMs) * rate / 1000));
        out = concat(cur, curN); if (cut > 0 && cut < out.length) out = out.subarray(0, out.length - cut);
      }
      if (forced && stillLoud) { cur = []; curN = 0; voiced = 0; quiet = 0; }
      else { cur = null; curN = 0; voiced = 0; quiet = 0; loudRun = 0; }
      return out;
    }
    return {
      push: function (chunk) {
        var r = rmsOf(chunk), d = msOf(chunk.length), thr = Math.min(0.06, Math.max(0.012, floor * 3)), loud = r > thr, out = null;
        if (!cur) {
          if (!loud) floor = Math.max(0.0005, floor * 0.96 + r * 0.04);
          ring.push(chunk); ringN += chunk.length;
          while (ring.length > 1 && msOf(ringN - ring[0].length) >= preMs) { ringN -= ring.shift().length; }
          loudRun = loud ? loudRun + d : 0;
          if (loudRun >= startMs) { cur = ring; curN = ringN; ring = []; ringN = 0; voiced = loudRun; quiet = 0; }
        } else {
          cur.push(chunk); curN += chunk.length;
          if (loud) { voiced += d; quiet = 0; } else quiet += d;
          if (quiet >= endMs) out = take(false, false);
          else if (msOf(curN) >= maxMs) out = take(true, loud);
        }
        return { utterance: out, speaking: !!cur };
      },
      flush: function () { if (!cur) return null; var o = take(false, false); ring = []; ringN = 0; return o; }
    };
  }

  // بيفتح الميكروفون مرة واحدة ويبعت شرائح PCM. بيرجّع {rate, close}
  function openPcm(onChunk) {
    return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext, ctx, src, mute, node = null, closed = false;
      function close() {
        if (closed) return; closed = true;
        try { if (node) node.disconnect(); } catch (e) {} try { if (src) src.disconnect(); } catch (e) {} try { if (mute) mute.disconnect(); } catch (e) {}
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        try { if (ctx) ctx.close(); } catch (e) {}
      }
      try { ctx = new AC(); src = ctx.createMediaStreamSource(stream); mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination); }
      catch (e) { close(); throw e; }
      var h = { rate: ctx.sampleRate, close: close };
      return Promise.resolve(ctx.state === 'suspended' ? ctx.resume() : null).then(function () {
        if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
          var u = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
          return ctx.audioWorklet.addModule(u).then(function () { URL.revokeObjectURL(u); node = new AudioWorkletNode(ctx, 'nour-pcm'); node.port.onmessage = function (e) { if (!closed) onChunk(e.data); }; })
            .catch(function () { try { URL.revokeObjectURL(u); } catch (e) {} node = null; });
        }
      }).then(function () {
        if (!node) { node = ctx.createScriptProcessor(4096, 1, 1); node.onaudioprocess = function (e) { if (!closed) onChunk(new Float32Array(e.inputBuffer.getChannelData(0))); }; }
        src.connect(node); node.connect(mute);
        return h;
      }).catch(function (e) { close(); throw e; });
    });
  }

  // ---------- كائن شبيه بـ SpeechRecognition ----------
  var HANDLERS = ['onstart', 'onaudiostart', 'onspeechstart', 'onspeechend', 'onnomatch', 'onresult', 'onerror', 'onend'];
  function CloudRec(NativeSR) {
    this.isCloud = true;
    this.lang = 'ar-SA'; this.continuous = true; this.interimResults = true; this.maxAlternatives = 1;
    HANDLERS.forEach(function (n) { this[n] = null; }, this);
    this._NativeSR = NativeSR || null;
    this._native = null; this._running = false; this._closing = false; this._done = false;
    this._h = null; this._vad = null; this._speaking = false;
    this._results = []; this._pending = 0; this._fails = 0; this._okOnce = false;
    this._chain = Promise.resolve(); this._ac = (typeof AbortController === 'function') ? new AbortController() : null;
  }
  CloudRec.prototype._fire = function (name, ev) {
    var f = this[name]; if (typeof f !== 'function') return;
    try { f.call(this, ev || {}); } catch (e) { console.warn('NourSTT.' + name, e); }
  };
  CloudRec.prototype.start = function () {
    if (this._native) { try { this._native.start(); } catch (e) {} return; }
    if (this._running) throw new Error('InvalidStateError: already started');
    var self = this;
    if (this._done) {   // إعادة تشغيل بعد انتهاء الجلسة (زي SpeechRecognition): نصفّر الحالة
      this._done = false; this._closing = false; this._aborted = false; this._h = null; this._vad = null; this._speaking = false;
      this._results = []; this._pending = 0; this._chain = Promise.resolve();
      this._ac = (typeof AbortController === 'function') ? new AbortController() : null;
    }
    this._sid = (this._sid || 0) + 1; var sid = this._sid;
    this._running = true;
    openPcm(function (chunk) { self._chunk(chunk); }).then(function (h) {
      if (self._done || self._closing) { h.close(); return; }
      self._h = h; self._rate = h.rate; self._vad = makeVad(h.rate);
      self._fire('onstart'); self._fire('onaudiostart');
    }).catch(function (err) {
      if (self._done) return;
      var name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') return self._fatal('not-allowed');
      if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return self._fatal('audio-capture');
      self._fallback();   // الصوت الخام مش متاح لسبب تاني: نرجع للمتصفح
    });
  };
  CloudRec.prototype._fatal = function (code) { this._fire('onerror', { error: code }); this._end(); };
  CloudRec.prototype._end = function () {
    if (this._done) return; this._done = true; this._running = false;
    if (this._h) { this._h.close(); this._h = null; }
    this._fire('onend');
  };
  CloudRec.prototype._chunk = function (chunk) {
    if (this._done || this._closing || !this._vad) return;
    var r = this._vad.push(chunk);
    if (r.speaking !== this._speaking) { this._speaking = r.speaking; if (r.speaking) this._fire('onspeechstart'); else this._fire('onspeechend'); }
    if (r.utterance) this._send(r.utterance);
  };
  CloudRec.prototype._send = function (f32) {
    var self = this, rate = this._rate || (this._h ? this._h.rate : RATE);   // ★ بعد stop() الـ _h بيتقفل — لازم نفتكر معدل العينة الحقيقي
    var buf = wav(downsample(f32, rate, RATE), rate > RATE ? RATE : rate);
    this._pending++;
    this._chain = this._chain.then(function () {
      if (self._aborted) return null;
      return fetch(url(), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: new Blob([buf], { type: 'audio/wav' }), signal: self._ac ? self._ac.signal : undefined, cache: 'no-store' })
        .then(function (res) { return res.json().catch(function () { return null; }).then(function (j) { return { res: res, j: j }; }); });
    }).then(function (o) {
      if (!o || self._aborted) return;
      if (o.res.ok && o.j && typeof o.j.text === 'string') { self._fails = 0; self._okOnce = true; self._emit(o.j.text); return; }
      self._fail(o.res.status);
    }).catch(function (err) {
      if (self._aborted || (err && err.name === 'AbortError')) return;
      self._fail(0);
    }).then(function () { self._pending--; self._drain(); });
  };
  CloudRec.prototype._emit = function (text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); if (!t) return;
    var alt = [{ transcript: t, confidence: 1 }]; alt.isFinal = true;
    var idx = this._results.length; this._results.push(alt);
    this._fire('onresult', { resultIndex: idx, results: this._results });
  };
  CloudRec.prototype._fail = function (status) {
    if (status === 429) { this._fire('onerror', { error: 'busy' }); return; }
    this._fails++;
    if (!this._okOnce && this._fails >= 2 && this._NativeSR) { this._fallback(); return; }
    this._fire('onerror', { error: 'network' });
  };
  CloudRec.prototype._drain = function () { if (this._closing && !this._done && this._pending <= 0) this._end(); };
  // السيرفر مش شغّال: نكمّل بـ SpeechRecognition العادي (نفس الإعدادات والـ handlers)
  CloudRec.prototype._fallback = function () {
    if (this._done || this._native) return;
    if (!this._NativeSR) { this._fatal('network'); return; }
    cloudBroken = true; cloudBrokenAt = Date.now();
    this._closing = true; this._aborted = true; if (this._ac) { try { this._ac.abort(); } catch (e) {} }
    if (this._h) { this._h.close(); this._h = null; }
    var n;
    try { n = new this._NativeSR(); } catch (e) { this._fatal('service-not-allowed'); return; }
    var self = this;
    n.lang = this.lang; n.continuous = this.continuous; n.interimResults = this.interimResults;
    try { n.maxAlternatives = this.maxAlternatives; } catch (e) {}
    HANDLERS.forEach(function (h) { n[h] = function (ev) { var f = self[h]; if (typeof f === 'function') return f.call(self, ev); }; });
    this._native = n; this._running = false;
    try { n.start(); } catch (e) { this._fatal('service-not-allowed'); }
  };
  CloudRec.prototype.stop = function () {
    if (this._native) { try { this._native.stop(); } catch (e) {} return; }
    if (this._done || this._closing) return;
    this._closing = true;
    if (this._h) { this._h.close(); this._h = null; }
    var u = this._vad && this._vad.flush(); if (u) this._send(u);
    var self = this, sid = this._sid; setTimeout(function () { if (self._sid === sid) self._end(); }, 20000);   // أمان لو مقطع علّق
    this._drain();
  };
  CloudRec.prototype.abort = function () {
    if (this._native) { try { this._native.abort(); } catch (e) {} return; }
    if (this._done) return;
    this._closing = true; this._aborted = true;
    if (this._ac) { try { this._ac.abort(); } catch (e) {} }
    this._end();
  };

  window.NourSTT = {
    enabled: enabled,
    // لو الجهاز بيدعم SpeechRecognition أو التسجيل السحابي
    supported: function (NativeSR) { return !!NativeSR || enabled(); },
    create: function (NativeSR) { return enabled() ? new CloudRec(NativeSR) : new NativeSR(); },
    _internals: { makeVad: makeVad, wav: wav, downsample: downsample }   // للاختبار
  };
})();
