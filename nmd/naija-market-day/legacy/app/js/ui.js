/* Shared helpers for every page. Plain DOM. User text is always inserted as text, never HTML.
   Markup and class names follow the mockups (index.html header and footer, admin-dashboard.html shell). */
(function () {
  'use strict';
  const SVG_TAGS = new Set(['svg', 'use', 'path', 'rect', 'circle', 'line', 'polyline', 'g']);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function h(tag, attrs, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (k === 'href' && SVG_TAGS.has(tag)) el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Icons from the mockup sprite (assets/icons.svg).
  function icon(name, cls = 'ic') {
    return h('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      h('use', { href: '/assets/icons.svg#' + name }));
  }

  class ApiError extends Error {
    constructor(status, message, data) { super(message); this.status = status; this.data = data; }
  }

  async function api(path, opts = {}) {
    const { method = 'GET', body, token } = opts;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers['x-apply-token'] = token;
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    } catch (e) {
      throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Something went wrong (${res.status}).`, data);
    return data;
  }

  function money(cents) {
    if (cents === null || cents === undefined) return '';
    return '$' + (Number(cents) / 100).toFixed(2);
  }
  function ymd(d) { return d ? String(d).slice(0, 10) : ''; }
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    return isNaN(dt) ? String(iso) : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return fmtDate(iso);
  }

  const STATUS = {
    draft: ['Draft', ''], waitlisted: ['Waitlisted', 'info'], offered: ['Booth offered', 'info'],
    under_review: ['Under review', 'warn'], more_info: ['More info requested', 'warn'], approved: ['Approved', 'ok'], declined: ['Declined', 'bad'],
    unpaid: ['Unpaid', ''], paid: ['Paid', 'ok'], refunded: ['Refunded', 'info'], failed: ['Payment failed', 'bad'],
    published: ['Published', 'ok'], closed: ['Closed', 'warn'], past: ['Past', ''],
    not_arrived: ['Not arrived', ''], checked_in: ['Checked in', 'ok'], checked_out: ['Checked out', 'info'], no_show: ['No show', 'bad'],
    active: ['Active', 'ok'], trial: ['Free period', 'info'], lapsed: ['Lapsed', 'bad'], cancelled: ['Cancelled', 'warn'], none: ['Not subscribed', ''],
    new: ['New', 'warn'], handled: ['Handled', 'ok'], invited: ['Invited', 'info'], suspended: ['Suspended', 'bad'], removed: ['Removed', 'bad'],
    available: ['Available', 'ok'], held: ['Held', 'warn'], reserved: ['Reserved', ''], confirmed: ['Confirmed', 'info'],
    'Vendor replied': ['Vendor replied', 'ok'], Sent: ['Sent', ''],
  };
  function badge(status, label) {
    const [text, kind] = STATUS[status] || [String(status || '').replace(/_/g, ' '), ''];
    return h('span', { class: 'badge ' + kind }, label || text);
  }

  // ---------- toast (uses the mockup toast) ----------
  let toastTimer = null;
  function toast(message, bad) {
    let el = document.querySelector('.toast');
    if (!el) { el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
    el.textContent = message;
    el.classList.toggle('bad', !!bad);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function alertBox(message, kind = '') {
    return h('div', { class: 'alert ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, message);
  }

  function modal(title, body, actions = []) {
    const close = () => {
      bg.style.opacity = '0';
      setTimeout(() => bg.remove(), 180);
    };
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×'),
        h('h2', null, title),
        body,
        h('div', { class: 'row', style: 'margin-top:18px;justify-content:flex-end' }, actions.map((a) => a(close)))));
    document.body.appendChild(bg);
    const first = bg.querySelector('input,select,textarea,button:not(.x)');
    if (first) setTimeout(() => first.focus(), 60);
    return { close };
  }

  function askText(title, label, { multiline = true, required = true, button = 'Save' } = {}) {
    return new Promise((resolve) => {
      const input = multiline ? h('textarea', { rows: 4 }) : h('input', { type: 'text' });
      let m;
      const submit = () => {
        const v = input.value.trim();
        if (required && !v) { input.classList.remove('invalid'); void input.offsetWidth; input.classList.add('invalid'); input.focus(); return; }
        m.close();
        resolve(v);
      };
      m = modal(title, h('div', { class: 'field' }, h('label', null, label), input), [
        (close) => h('button', { class: 'btn ghost', onclick: () => { close(); resolve(null); } }, 'Cancel'),
        () => h('button', { class: 'btn primary', onclick: submit }, button),
      ]);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) submit(); });
    });
  }

  function confirmAction(message) {
    return new Promise((resolve) => {
      modal('Please confirm', h('p', null, message), [
        (close) => h('button', { class: 'btn ghost', onclick: () => { close(); resolve(false); } }, 'Cancel'),
        (close) => h('button', { class: 'btn primary', onclick: () => { close(); resolve(true); } }, 'Yes, continue'),
      ]);
    });
  }

  // Table from column definitions: [{ label, render(row) => node|string }]. Rows animate in.
  function table(columns, rows, { empty = 'Nothing here yet.' } = {}) {
    if (!rows || !rows.length) return h('div', { class: 'card empty-state' }, empty);
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map((c) => h('th', null, c.label)))),
        h('tbody', null, rows.map((r) => h('tr', null, columns.map((c) => h('td', { 'data-label': c.label }, c.render ? c.render(r) : (r[c.key] ?? '')))))))); 
  }

  function readForm(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
      else out[el.name] = el.value;
    }
    return out;
  }

  function formFields(fields) {
    return fields.map((f) => {
      let input;
      if (f.type === 'select') {
        input = h('select', { name: f.name, id: f.name, required: f.required }, (f.options || []).map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o.value, o.label];
          return h('option', { value: val, selected: String(val) === String(f.value ?? '') }, text);
        }));
      } else if (f.type === 'textarea') {
        input = h('textarea', { name: f.name, id: f.name, rows: f.rows || 4, required: f.required, placeholder: f.placeholder }, f.value ?? '');
      } else if (f.type === 'checkbox') {
        return h('div', { class: 'field' }, h('label', { class: 'inline' }, h('input', { type: 'checkbox', name: f.name, checked: !!f.value }), f.label), f.help ? h('div', { class: 'help' }, f.help) : null);
      } else {
        input = h('input', { name: f.name, id: f.name, type: f.type || 'text', value: f.value ?? '', required: f.required, placeholder: f.placeholder, min: f.min, max: f.max, step: f.step, autocomplete: f.autocomplete, inputmode: f.inputmode });
      }
      return h('div', { class: 'field' }, h('label', { for: f.name }, f.label + (f.required ? ' *' : '')), input, f.help ? h('div', { class: 'help' }, f.help) : null);
    });
  }

  // Submit handler: button shows a spinner, errors shake the form and show a toast.
  function onSubmit(form, handler, { success, reset = false } = {}) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.classList.add('loading'); }
      try {
        const result = await handler(readForm(form), form);
        if (success) toast(typeof success === 'function' ? success(result) : success);
        if (reset) form.reset();
      } catch (err) {
        form.classList.remove('invalid'); void form.offsetWidth; form.classList.add('invalid');
        setTimeout(() => form.classList.remove('invalid'), 500);
        toast(err.message || 'Something went wrong.', true);
      } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      }
    });
    return form;
  }

  // Count-up numbers: <span data-count="1234" data-format="money|int">. Runs on every render.
  function countUp(root) {
    if (!root || REDUCED) return;
    root.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count) || 0;
      const money = el.dataset.format === 'money';
      const start = performance.now();
      const dur = 900;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = to * eased;
        el.textContent = money ? '$' + (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
        else el.classList.add('count-flash');
      };
      requestAnimationFrame(step);
    });
  }

  // Scroll reveal for cards and sections (site.css .reveal / .in).
  const revealObserver = (REDUCED || !('IntersectionObserver' in window)) ? null : new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  function reveal(root) {
    if (!root) return;
    root.querySelectorAll('section, .work-app, .feat, .card.reveal-me').forEach((el) => {
      el.classList.add('reveal');
      if (revealObserver) revealObserver.observe(el); else el.classList.add('in');
    });
  }

  // Live data: runs fn now and every `ms`, pauses while the tab is hidden.
  function poll(fn, ms) {
    let timer = null;
    const tick = () => { if (!document.hidden) Promise.resolve().then(fn).catch(() => {}); };
    timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }

  function skeleton(kind = '') {
    return h('div', { class: 'stack', 'aria-label': 'Loading', role: 'status' },
      h('div', { class: 'skeleton ' + kind }), h('div', { class: 'skeleton' }));
  }

  // Simple hash router: outlet content fades in; the new page gets reveal + count-up.
  function router(outlet, routes, fallback) {
    let current = 0;
    async function render() {
      const run = ++current;
      const hash = location.hash || '#/';
      let handler = null;
      let match = null;
      for (const [re, fn] of routes) {
        match = re.exec(hash);
        if (match) { handler = fn; break; }
      }
      if (!handler) {
        if (fallback) { location.hash = fallback; return; }
        outlet.replaceChildren(h('div', { class: 'card empty-state' }, 'That page does not exist.'));
        return;
      }
      outlet.replaceChildren(skeleton('tall'));
      try {
        const node = await handler(match);
        if (run !== current) return;
        node.classList && node.classList.add('page-in');
        outlet.replaceChildren(node);
        reveal(outlet);
        countUp(outlet);
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch (err) {
        if (run !== current) return;
        if (err instanceof ApiError && err.status === 401) {
          outlet.replaceChildren(h('div', { class: 'card empty-state' }, h('h2', null, 'Please sign in'), h('p', null, err.message), h('a', { class: 'btn primary', href: window.NMD_SIGNIN || '/app/login.html' }, 'Sign in')));
          return;
        }
        outlet.replaceChildren(alertBox(err.message || 'Something went wrong.', 'bad'));
      }
    }
    window.addEventListener('hashchange', render);
    render();
    return render;
  }

  // ---------- mockup chrome ----------
  // Public header: same markup as index.html (.site-header, .nav, .cta, .menu-btn).
  function siteHeader(active) {
    const links = [
      ['#/', 'Home'], ['#/markets', 'Upcoming Markets'], ['#/past', 'Past Markets'], ['#/directory', 'Directory'],
      ['#/marketplace', 'Marketplace'], ['#/blog', 'Blog'], ['#/events', 'Events'], ['#/resources', 'Vendor Resources'], ['#/contact', 'Contact'],
    ];
    return h('header', { class: 'site-header' },
      h('div', { class: 'wrap bar' },
        h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, 'N'), 'Naija Market Day'),
        h('nav', { class: 'nav', 'aria-label': 'Main' },
          links.map(([href, label]) => h('a', { class: 'link' + (active === href ? ' on' : ''), href }, label)),
          h('a', { class: 'link', href: '/app/login.html?as=vendor' }, 'Vendor sign in'),
          h('a', { class: 'cta', href: '/app/login.html?as=buyer' }, 'User sign in')),
        h('button', { class: 'menu-btn', 'aria-label': 'Open menu', 'aria-expanded': 'false', type: 'button' }, h('span', null))));
  }

  // Footer: same markup as index.html (.site-footer, .foot-grid, .foot-note).
  function footer() {
    return h('footer', { class: 'site-footer' }, h('div', { class: 'wrap' },
      h('div', { class: 'foot-grid' },
        h('div', null,
          h('a', { class: 'logo', href: '#/', style: 'color:#fff' }, h('span', { class: 'logo-mark', style: 'background:var(--mint);color:var(--ink)' }, 'N'), 'Naija Market Day'),
          h('p', { style: 'line-height:1.6;margin:16px 0 18px;max-width:320px' }, 'The travelling African market in North America. Free and open to the public.'),
          h('a', { href: '#/', style: 'color:var(--mint);font-weight:600' }, '@naijamarketday on Instagram')),
        h('div', null, h('h4', null, 'Explore'), h('a', { href: '#/markets' }, 'Upcoming markets'), h('a', { href: '#/past' }, 'Past markets'), h('a', { href: '#/marketplace' }, 'Marketplace'), h('a', { href: '#/blog' }, 'Blog')),
        h('div', null, h('h4', null, 'Sellers'), h('a', { href: '#/markets' }, 'Apply as vendor'), h('a', { href: '/app/login.html?as=vendor' }, 'Vendor sign in'), h('a', { href: '#/resources' }, 'Vendor resources'), h('a', { href: '#/directory' }, 'Directory')),
        h('div', null, h('h4', null, 'Help'), h('a', { href: '#/contact' }, 'Contact'), h('a', { href: '#/resources' }, 'FAQ'), h('a', { href: '#/events' }, 'Community events'))),
      h('div', { class: 'foot-note' },
        h('span', { id: 'disclaimer' }, 'Naija Market Day does not take payment for goods. Buyers and sellers arrange payment directly.'),
        h('span', null, h('a', { href: '/app/login.html?as=buyer', style: 'color:#8D9A94' }, 'User sign in'), ' · ', h('a', { href: '/app/login.html?as=vendor', style: 'color:#8D9A94' }, 'Vendor sign in')))));
  }

  async function loadDisclaimer() {
    try {
      const s = await api('/settings/public');
      const el = document.getElementById('disclaimer');
      if (el) el.textContent = s.disclaimer;
    } catch { /* optional */ }
  }

  // Portal shell: the admin-dashboard.html layout. sections: [{ title, items: [{ label, href, count, match }] }]
  function shell({ brand, sections, user, onSignOut, active }) {
    const link = (it) => {
      const on = (it.match && it.match(location.hash)) || active === it.href;
      return h('a', { href: it.href, class: on ? 'on' : '' },
        h('span', null, it.label),
        it.count ? h('span', { class: 'count' }, String(it.count)) : null);
    };
    const side = h('nav', { class: 'side', 'aria-label': brand + ' sections' },
      h('a', { class: 'brand', href: '/app/' }, h('span', { class: 'logo-mark' }, 'N'), brand),
      sections.map((sec) => h('div', null, sec.title ? h('div', { class: 'sect' }, sec.title) : null, sec.items.map(link))),
      h('div', { class: 'who' },
        user ? h('div', null, user.name || user.email) : null,
        onSignOut ? h('button', { class: 'btn ghost small-btn', type: 'button', onclick: onSignOut }, 'Sign out') : null));
    const main = h('main', { class: 'main', id: 'main' });
    return { root: h('div', { class: 'shell' }, side, main), main };
  }

  // Mobile menu and header hairline. Bound once; works on whichever header is on screen.
  function initChrome() {
    if (window.__nmdChrome) return;
    window.__nmdChrome = true;
    const onScroll = () => {
      const header = document.querySelector('.site-header');
      if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', (e) => {
      const header = document.querySelector('.site-header');
      if (!header) return;
      const btn = e.target.closest && e.target.closest('.menu-btn');
      if (btn && header.contains(btn)) {
        const open = header.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        return;
      }
      const link = e.target.closest && e.target.closest('.site-header .nav a');
      if (link) header.classList.remove('open');
    });
    onScroll();
  }

  async function bellCount() {
    try {
      const path = location.pathname.includes('vendor') ? '/vendor/notifications' : '/buyer/notifications';
      return (await api(path)).unread || 0;
    } catch { return 0; }
  }

  window.UI = {
    h, icon, api, ApiError, money, ymd, fmtDate, fmtDateTime, timeAgo, badge, toast, alertBox, modal, askText, confirmAction,
    table, readForm, formFields, onSubmit, router, shell, siteHeader, footer, loadDisclaimer, bellCount,
    countUp, reveal, poll, skeleton, initChrome, REDUCED,
  };
  if (document.readyState !== 'loading') initChrome(); else document.addEventListener('DOMContentLoaded', initChrome);
})();
