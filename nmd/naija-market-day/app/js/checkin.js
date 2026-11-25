/* Check-in for staff at the entrance: phone and tablet first (CHK-01 to CHK-09). */
(function () {
  'use strict';
  const { h, api, toast, alertBox, badge, table, formFields, onSubmit, modal, timeAgo } = window.UI;
  const root = document.getElementById('root');
  const MKT_KEY = 'nmd-checkin-market';
  let me = null;
  let markets = [];
  let marketId = null;
  let stream = null;
  let detector = null;
  let scanning = false;
  let resultBox = null;
  let tab = 'scan';

  function say(kind, title, body, actions) {
    resultBox = h('div', { class: 'result ' + kind, role: 'status', 'aria-live': 'assertive' }, h('h2', null, title), body ? h('p', null, body) : null, actions || null);
    return resultBox;
  }

  // Handle any code: scanned, typed or pasted.
  async function handleCode(code) {
    code = String(code || '').trim();
    if (!code || !marketId) return;
    try {
      const info = await api('/staff/scan', { method: 'POST', body: { market_id: marketId, code } });
      showInfo(code, info);
    } catch (err) {
      showResult('bad', 'Could not read that code', err.message);
    }
  }

  function showResult(kind, title, body) {
    const node = say(kind, title, body);
    const slot = document.getElementById('result-slot');
    if (slot) slot.replaceChildren(node);
  }

  function showInfo(code, info) {
    const who = info.kind === 'vendor'
      ? [info.name || 'Vendor', info.booth ? `Booth ${info.booth}${info.tier ? ' · ' + info.tier : ''}` : 'Booth to be confirmed']
      : [info.name, info.guests_count > 1 ? `${info.guests_count} people` : 'Guest'];
    if (info.result === 'ready') {
      const btn = h('button', { class: 'btn big-btn green', type: 'button', onclick: async () => {
        btn.disabled = true;
        try {
          const r = info.kind === 'vendor' && info.attendance === 'checked_in' ? null : await api('/staff/checkin', { method: 'POST', body: { market_id: marketId, code } });
          const after = r || info;
          showResult('ready', 'Checked in: ' + (who[0]), info.kind === 'vendor' ? `Booth ${(after.booth || info.booth) || '—'}` : who[1]);
          toast('Checked in');
        } catch (err) { toast(err.message, true); btn.disabled = false; }
      } }, info.kind === 'vendor' ? 'Check in vendor' : 'Check in guest');
      const checkout = info.kind === 'vendor' && info.attendance === 'checked_in'
        ? h('button', { class: 'btn ghost big-btn', type: 'button', onclick: () => checkOut(code) }, 'Check out vendor') : null;
      showResult('ready', who[0], who[1] + (info.kind === 'vendor' ? '' : ''));
      document.getElementById('result-slot').appendChild(h('div', { class: 'stack', style: 'margin-top:12px' }, btn, checkout));
      return;
    }
    if (info.result === 'duplicate') {
      showResult('warn', 'Already checked in', info.message || 'This QR was used before and was not counted again.');
      return;
    }
    if (info.result === 'wrong_market') {
      showResult('bad', 'Wrong market', info.message);
      return;
    }
    if (info.result === 'not_approved') {
      showResult('bad', 'Not approved for this market', info.message);
      return;
    }
    showResult('bad', 'Not recognised', info.message || 'This code is not a Naija Market Day code.');
  }

  async function checkOut(code) {
    try {
      await api('/staff/checkout', { method: 'POST', body: { market_id: marketId, code } });
      showResult('ready', 'Checked out', 'The vendor has left the market.');
      toast('Checked out');
    } catch (err) { toast(err.message, true); }
  }

  // ---------- camera scanning (uses the browser's barcode detector where available) ----------
  async function startCamera(videoEl) {
    if (!('BarcodeDetector' in window)) {
      const frame = videoEl.closest('.big-scan') || videoEl;
      frame.replaceWith(h('div', { class: 'alert warn', id: 'no-camera' }, 'This browser cannot scan QR codes with the camera. Type or paste the code below, or search by name.'));
      return;
    }
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      scanning = true;
      tick(videoEl);
    } catch (err) {
      const frame = videoEl.closest('.big-scan') || videoEl;
      frame.replaceWith(h('div', { class: 'alert warn' }, 'The camera is not available (' + (err.name || 'error') + '). Allow camera access, or type the code below.'));
    }
  }
  async function tick(videoEl) {
    if (!scanning || !detector) return;
    try {
      const codes = await detector.detect(videoEl);
      if (codes.length && !tick.busy) {
        tick.busy = true;
        await handleCode(codes[0].rawValue);
        setTimeout(() => { tick.busy = false; }, 2500);
      }
    } catch { /* keep scanning */ }
    if (scanning) requestAnimationFrame(() => tick(videoEl));
  }
  function stopCamera() {
    scanning = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // ---------- screens ----------
  function marketPicker() {
    if (!markets.length) return alertBox('No markets are assigned to you yet. Ask the admin to assign you to a market.', 'warn');
    const sel = h('select', { 'aria-label': 'Market', style: 'font-size:17px;min-height:52px' },
      markets.map((m) => h('option', { value: m.id, selected: m.id === marketId }, `${m.name} · ${m.city}`)));
    sel.addEventListener('change', () => {
      marketId = Number(sel.value);
      try { sessionStorage.setItem(MKT_KEY, String(marketId)); } catch { /* ignore */ }
      stopCamera();
      draw();
    });
    return h('div', { class: 'field' }, h('label', null, 'Market today'), sel);
  }

  function scanPanel() {
    const video = h('video', { playsinline: true, muted: true, 'aria-label': 'Camera preview' });
    const frame = h('div', { class: 'big-scan', style: 'margin-bottom:14px' }, video);
    const manual = h('form', { class: 'card stack', style: 'margin-top:14px' },
      h('div', { class: 'field' }, h('label', null, 'Type or paste a code'), h('input', { name: 'code', placeholder: 'NMD-G-… or NMD-V-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' })),
      h('button', { class: 'btn big-btn', type: 'submit' }, 'Look up code'));
    onSubmit(manual, async (v) => { await handleCode(v.code); manual.reset(); return ''; }, { success: '' });
    const scanBtn = h('button', { class: 'btn ghost big-btn', type: 'button', onclick: () => { if (!stream) startCamera(video); } }, 'Start camera');
    setTimeout(() => startCamera(video), 0);
    return h('div', { class: 'phone-pad stack' }, frame, h('div', { id: 'result-slot' }, resultBox || h('p', { class: 'muted small' }, 'Point the camera at a QR code. Results appear here.')), manual, scanBtn);
  }

  function lookupPanel() {
    const q = h('input', { type: 'search', placeholder: 'Name or email', 'aria-label': 'Name or email', style: 'font-size:17px;min-height:52px' });
    const out = h('div', { class: 'stack' });
    const find = async () => {
      if (!q.value.trim()) return;
      const rows = await api('/staff/lookup?market_id=' + marketId + '&q=' + encodeURIComponent(q.value));
      out.replaceChildren(...(rows.length ? rows.map((r) => h('div', { class: 'card' },
        h('div', { class: 'spread' }, h('strong', null, r.name || r.email), r.kind === 'vendor' ? badge(r.attendance) : badge(r.checked_in ? 'checked_in' : 'not_arrived')),
        h('div', { class: 'small muted' }, (r.kind === 'vendor' ? 'Vendor' + (r.booth ? ' · booth ' + r.booth : '') : 'Guest') + ' · ' + (r.email || '')),
        h('button', { class: 'btn big-btn', style: 'margin-top:10px', onclick: async () => {
          if (r.kind === 'guest' && r.checked_in) return toast('Already checked in', true);
          if (r.kind === 'vendor' && r.attendance === 'checked_in') return toast('Already checked in', true);
          try {
            await api('/staff/checkin', { method: 'POST', body: { market_id: marketId, code: r.code } });
            toast('Checked in');
            find();
          } catch (err) { toast(err.message, true); }
        } }, r.kind === 'vendor' ? 'Check in vendor' : 'Check in guest'))) : [h('p', { class: 'muted' }, 'No match. Try the first few letters, or register a walk-in.')]));
    };
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(find, 300); });
    return h('div', { class: 'phone-pad stack' }, h('div', { class: 'field' }, h('label', null, 'Find someone who cannot scan'), q), out);
  }

  function walkinPanel() {
    const f = h('form', { class: 'card stack' }, h('h2', null, 'Register a walk-in'),
      formFields([
        { name: 'name', label: 'Name', required: true, autocomplete: 'off' },
        { name: 'email', label: 'Email (optional)', type: 'email' },
        { name: 'phone', label: 'Phone (optional)', type: 'tel' },
        { name: 'guests_count', label: 'People', type: 'number', min: 1, max: 10, value: 1 },
      ]),
      h('button', { class: 'btn big-btn', type: 'submit' }, 'Check in walk-in'));
    onSubmit(f, async (v) => {
      await api('/staff/walkin', { method: 'POST', body: { market_id: marketId, ...v } });
      return 'Walk-in checked in';
    }, { success: (x) => x, reset: true });
    return h('div', { class: 'phone-pad' }, f);
  }

  function checkoutPanel() {
    const f = h('form', { class: 'card stack' }, h('h2', null, 'Check out a vendor'),
      h('p', { class: 'small muted' }, 'Scan the vendor QR on the Scan tab, or type the code here.'),
      h('div', { class: 'field' }, h('label', null, 'Vendor code'), h('input', { name: 'code', placeholder: 'NMD-V-…', autocomplete: 'off' })),
      h('button', { class: 'btn big-btn', type: 'submit' }, 'Check out'));
    onSubmit(f, async (v) => {
      await api('/staff/checkout', { method: 'POST', body: { market_id: marketId, code: v.code } });
      return 'Checked out';
    }, { success: (x) => x, reset: true });
    return h('div', { class: 'phone-pad' }, f);
  }

  function tabs() {
    const defs = [['scan', 'Scan'], ['lookup', 'Look up'], ['walkin', 'Walk-in'], ['checkout', 'Check out']];
    return h('div', { class: 'tabs', role: 'tablist', style: 'overflow-x:auto' }, defs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': tab === k, class: tab === k ? 'on' : '', onclick: () => { stopCamera(); tab = k; resultBox = null; draw(); } }, l)));
  }

  function draw() {
    const body = tab === 'scan' ? scanPanel() : tab === 'lookup' ? lookupPanel() : tab === 'walkin' ? walkinPanel() : checkoutPanel();
    root.replaceChildren(h('div', { class: 'stack', style: 'padding-top:14px;padding-bottom:40px' },
      h('div', { class: 'spread' }, h('h1', { style: 'font-size:22px' }, 'Check-in'), h('button', { class: 'btn ghost small-btn', onclick: async () => {
        stopCamera();
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        location.href = '/app/admin-login.html';
      } }, 'Sign out')),
      marketPicker(),
      tabs(),
      body));
  }

  async function boot() {
    try {
      const r = await api('/auth/me');
      if (!r.user || !(r.user.roles || []).some((x) => x === 'staff' || x === 'admin')) {
        location.replace('/app/admin-login.html');
        return;
      }
      me = r.user;
    } catch {
      location.replace('/app/admin-login.html');
      return;
    }
    markets = await api('/staff/markets');
    try { marketId = Number(sessionStorage.getItem(MKT_KEY)) || null; } catch { marketId = null; }
    if (!markets.some((m) => m.id === marketId)) marketId = markets.length ? markets[0].id : null;
    draw();
  }
  boot();
})();
