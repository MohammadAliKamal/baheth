const CACHE_NAME = 'baheth-ios-v24';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// v15 hot-patch: serves v13 index.html with quieter sounds, the moved skip link
// and the TTS controls until the v14 index.html commit can be published.
// Self-disables as soon as the served HTML already contains the v14 changes.
const PATCH_SCRIPT = `(function () {
  if (window.__bahethV15) return;
  window.__bahethV15 = 1;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // 1) Move the "last answer" skip link down next to the mic
  try {
    document.querySelectorAll('#skipLinks .skip-link').forEach(function (b) {
      if (b.textContent.indexOf('آخر إجابة') !== -1) b.remove();
    });
    var mic = $('micBtn');
    if (mic && !document.querySelector('.skip-link[data-v15]')) {
      var sk = document.createElement('button');
      sk.type = 'button';
      sk.className = 'skip-link';
      sk.setAttribute('data-v15', '1');
      sk.textContent = 'انتقل إلى آخر إجابة';
      sk.addEventListener('click', function () { if (window.a11yGoto) window.a11yGoto('last'); });
      mic.insertAdjacentElement('afterend', sk);
    }
  } catch (_) {}

  // 2) TTS voice / rate / volume settings
  var ttsVoices = [], ttsVoiceSig = '';
  function refreshTtsVoices() {
    if (!('speechSynthesis' in window)) return;
    var list = window.speechSynthesis.getVoices() || [];
    var sig = list.map(function (v) { return v.name + '|' + v.lang; }).join('~');
    var sel = $('voiceSelect');
    if (sig === ttsVoiceSig && sel && sel.options.length > 0) { ttsVoices = list; return; }
    ttsVoices = list; ttsVoiceSig = sig;
    if (!sel) return;
    var saved = localStorage.getItem('baheth_tts_voice') || '';
    var isAr = function (v) { return (v.lang || '').toLowerCase().replace('_', '-').indexOf('ar') === 0; };
    var ar = ttsVoices.filter(isAr), rest = ttsVoices.filter(function (v) { return !isAr(v); });
    var opt = function (v) {
      var name = String(v.name).replace(/"/g, '');
      return '<option value="' + esc(name) + '"' + (name === saved ? ' selected' : '') + '>' + esc(name + ' (' + v.lang + ')') + '</option>';
    };
    sel.innerHTML = '<option value="">الافتراضي للنظام</option>' +
      (ar.length ? '<optgroup label="أصوات عربية">' + ar.map(opt).join('') + '</optgroup>' : '') +
      (rest.length ? '<optgroup label="أصوات أخرى">' + rest.map(opt).join('') + '</optgroup>' : '');
  }
  window.refreshTtsVoices = refreshTtsVoices;
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = refreshTtsVoices;

  function applyTtsSettings(u) {
    u.lang = 'ar-SA';
    var r = parseFloat(localStorage.getItem('baheth_tts_rate') || '1');
    if (r >= 0.5 && r <= 2) u.rate = r;
    var vol = parseFloat(localStorage.getItem('baheth_tts_volume') || '1');
    if (vol >= 0 && vol <= 1) u.volume = vol;
    var vn = localStorage.getItem('baheth_tts_voice') || '';
    if (vn) {
      var list = ttsVoices.length ? ttsVoices : (window.speechSynthesis.getVoices() || []);
      var voice = null;
      for (var i = 0; i < list.length; i++) if (list[i].name === vn) { voice = list[i]; break; }
      if (voice) { u.voice = voice; u.lang = voice.lang; }
    }
    return u;
  }

  window.speakText = function (id) {
    var el = $(id);
    if (!el || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    var body = el.querySelector('.msg-body');
    var u = applyTtsSettings(new SpeechSynthesisUtterance(body ? body.innerText : el.innerText));
    window.speechSynthesis.speak(u);
  };
  window.stopSpeaking = function (silent) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (!silent && typeof window.announce === 'function') window.announce('توقفت القراءة الصوتية');
  };
  window.saveTtsSettings = function () {
    var vs = $('voiceSelect');
    if (vs && (vs.value || vs.options.length > 1)) localStorage.setItem('baheth_tts_voice', vs.value);
    var r = $('ttsRate'), v = $('ttsVolume');
    if (r) { localStorage.setItem('baheth_tts_rate', r.value); var rv = $('ttsRateVal'); if (rv) rv.textContent = r.value + 'x'; }
    if (v) { localStorage.setItem('baheth_tts_volume', v.value); var vv = $('ttsVolumeVal'); if (vv) vv.textContent = Math.round(parseFloat(v.value) * 100) + '٪'; }
  };
  window.testVoice = function () {
    if (!('speechSynthesis' in window)) { alert('القراءة الصوتية غير مدعومة على هذا الجهاز.'); return; }
    window.saveTtsSettings();
    window.speechSynthesis.cancel();
    var u = applyTtsSettings(new SpeechSynthesisUtterance('هذا اختبار لصوت القراءة في تطبيق باحث. يمكنك تغيير الصوت والسرعة ومستوى الصوت من هذه الإعدادات.'));
    window.speechSynthesis.speak(u);
  };

  // 3) Stop button next to every listen button
  function addStopButtons() {
    document.querySelectorAll('#chatContainer button').forEach(function (b) {
      if (b.getAttribute('data-v15stop')) return;
      if (b.textContent.indexOf('استماع') === -1 || b.textContent.indexOf('إيقاف') !== -1) return;
      if (b.nextElementSibling && b.nextElementSibling.getAttribute('data-v15stop')) return;
      var s = document.createElement('button');
      s.type = 'button';
      s.setAttribute('data-v15stop', '1');
      s.setAttribute('aria-label', 'إيقاف القراءة الصوتية');
      s.className = 'text-xs text-red-300 flex items-center gap-1 bg-slate-800 px-3.5 py-2.5 min-h-[44px] rounded-lg active:scale-95';
      s.textContent = '⏹ إيقاف';
      s.addEventListener('click', function () { window.stopSpeaking(); });
      b.insertAdjacentElement('afterend', s);
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'استماع إلى الإجابة صوتياً');
    });
  }
  if (window.updateMessage && !window.updateMessage.__v15wrapped) {
    var origUpdate = window.updateMessage;
    var wrapped = function () { var r = origUpdate.apply(this, arguments); try { addStopButtons(); } catch (_) {} return r; };
    wrapped.__v15wrapped = 1;
    window.updateMessage = wrapped;
  }
  addStopButtons();
  try {
    var mo = new MutationObserver(function () { addStopButtons(); });
    var cc = $('chatContainer');
    if (cc) mo.observe(cc, { childList: true, subtree: true });
  } catch (_) {}

  // 4) Settings card for TTS
  var anchor = $('chatSoundsToggle');
  if (anchor && !$('voiceSelect')) {
    var card = anchor.closest('.divide-y');
    if (card) card.insertAdjacentHTML('afterend',
      '<div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3" style="margin-top:12px">' +
      '<p class="text-xs font-bold text-white">صوت قراءة الإجابات</p>' +
      '<div class="space-y-1">' +
      '<label for="voiceSelect" class="text-[11px] font-bold text-slate-300">الصوت</label>' +
      '<select id="voiceSelect" onchange="saveTtsSettings()" onfocus="refreshTtsVoices()" aria-label="اختيار صوت قراءة الإجابات" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none">' +
      '<option value="">الافتراضي للنظام</option>' +
      '</select>' +
      '<p class="text-[10px] text-slate-400 leading-relaxed">يعرض الأصوات المثبتة على جهازك، ومنها أصوات أبل وأي أصوات أخرى. لإضافة أصوات عربية أفضل على الآيفون: الإعدادات، ثم تسهيلات الاستخدام، ثم المحتوى المنطوق، ثم الأصوات.</p>' +
      '</div>' +
      '<div class="space-y-1">' +
      '<label for="ttsRate" class="text-[11px] font-bold text-slate-300">سرعة القراءة: <span id="ttsRateVal">1x</span></label>' +
      '<input type="range" id="ttsRate" min="0.5" max="2" step="0.1" value="1" oninput="saveTtsSettings()" class="w-full accent-emerald-500" />' +
      '</div>' +
      '<div class="space-y-1">' +
      '<label for="ttsVolume" class="text-[11px] font-bold text-slate-300">مستوى صوت القراءة: <span id="ttsVolumeVal">100٪</span></label>' +
      '<input type="range" id="ttsVolume" min="0.1" max="1" step="0.05" value="1" oninput="saveTtsSettings()" class="w-full accent-emerald-500" />' +
      '</div>' +
      '<div class="flex gap-2">' +
      '<button type="button" onclick="testVoice()" class="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-600 active:bg-slate-700 font-bold text-xs text-emerald-300 transition">▶️ تجربة الصوت</button>' +
      '<button type="button" onclick="stopSpeaking()" class="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-600 active:bg-slate-700 font-bold text-xs text-red-300 transition">⏹ إيقاف القراءة</button>' +
      '</div>' +
      '</div>');
  }

  // 5) Init control values
  var ttsRateEl = $('ttsRate'), ttsVolEl = $('ttsVolume');
  if (ttsRateEl) { ttsRateEl.value = localStorage.getItem('baheth_tts_rate') || '1'; var rv2 = $('ttsRateVal'); if (rv2) rv2.textContent = ttsRateEl.value + 'x'; }
  if (ttsVolEl) { ttsVolEl.value = localStorage.getItem('baheth_tts_volume') || '1'; var vv2 = $('ttsVolumeVal'); if (vv2) vv2.textContent = Math.round(parseFloat(ttsVolEl.value) * 100) + '٪'; }
  refreshTtsVoices();
})();`;

function patchHtml(t) {
  if (t.indexOf('stopSpeaking') !== -1 || t.indexOf('__bahethV15') !== -1) return t;
  // old quiet tones instead of the loud ones
  t = t.split('vol: 0.95').join('vol: 0.11');
  t = t.split('vol: 0.9').join('vol: 0.12');
  t = t.split('vol: 0.35').join('vol: 0.05');
  t = t.split('const v = (Math.sin(2 * Math.PI * n.f * t) + 0.3 * Math.sin(4 * Math.PI * n.f * t)) * n.vol * env;').join('const v = Math.sin(2 * Math.PI * n.f * t) * n.vol * env;');
  t = t.split('Math.round(v * 32767 / 1.3)').join('Math.round(v * 32767)');
  t = t.split('g.gain.exponentialRampToValueAtTime(n.vol * 0.8, t0 + n.start + 0.01);').join('g.gain.exponentialRampToValueAtTime(n.vol, t0 + n.start + 0.01);');
  t = t.split('send: makeWav([{ f: 660, start: 0, dur: 0.12, vol: 0.12 }, { f: 990, start: 0.1, dur: 0.18, vol: 0.12 }])').join('send: makeWav([{ f: 520, start: 0, dur: 0.09, vol: 0.12 }, { f: 740, start: 0.07, dur: 0.1, vol: 0.12 }])');
  t = t.split('receive: makeWav([{ f: 784, start: 0, dur: 0.24, vol: 0.11 }, { f: 988, start: 0.17, dur: 0.24, vol: 0.11 }, { f: 1319, start: 0.34, dur: 0.5, vol: 0.11 }])').join('receive: makeWav([{ f: 880, start: 0, dur: 0.09, vol: 0.11 }, { f: 660, start: 0.09, dur: 0.16, vol: 0.11 }])');
  if (t.indexOf('</body>') === -1) return t;
  return t.replace('</body>', '<script>' + PATCH_SCRIPT + '</scr' + 'ipt></body>');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(async (res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          if (res.ok && ct.indexOf('text/html') !== -1) {
            const t = patchHtml(await res.text());
            const h = new Headers(res.headers);
            h.delete('content-length');
            h.delete('content-encoding');
            const out = new Response(t, { status: res.status, statusText: res.statusText, headers: h });
            const copy = out.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
            return out;
          }
        } catch (_) {}
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});

// build 15
