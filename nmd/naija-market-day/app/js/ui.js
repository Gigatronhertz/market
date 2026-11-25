/* Shared helpers for every page in the app. Plain DOM, no framework.
   User-supplied text is always inserted as text (never as HTML). */
(function () {
  'use strict';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }

  async function api(path, opts = {}) {
    const { method = 'GET', body, token } = opts;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers['x-apply-token'] = token;
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        credentials: 'same-origin',
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && data.error) || `Something went wrong (${res.status}).`;
      throw new ApiError(res.status, msg, data);
    }
    return data;
  }

  function money(cents) {
    if (cents === null || cents === undefined) return '';
    return '$' + (Number(cents) / 100).toFixed(2);
  }

  function ymd(d) {
    if (!d) return '';
    return String(d).slice(0, 10);
  }
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    if (isNaN(dt)) return String(iso);
    return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return fmtDate(iso);
  }

  const STATUS_LABELS = {
    draft: ['Draft', ''], waitlisted: ['Waitlisted', 'info'], offered: ['Booth offered', 'info'],
    under_review: ['Under review', 'warn'], more_info: ['More info requested', 'warn'],
    approved: ['Approved', 'ok'], declined: ['Declined', 'bad'],
    unpaid: ['Unpaid', ''], paid: ['Paid', 'ok'], refunded: ['Refunded', 'info'], failed: ['Payment failed', 'bad'],
    published: ['Published', 'ok'], closed: ['Closed', 'warn'], past: ['Past', ''],
    not_arrived: ['Not arrived', ''], checked_in: ['Checked in', 'ok'], checked_out: ['Checked out', 'info'], no_show: ['No show', 'bad'],
    active: ['Active', 'ok'], trial: ['Free period', 'info'], lapsed: ['Lapsed', 'bad'], cancelled: ['Cancelled', 'warn'], none: ['Not subscribed', ''],
    new: ['New', 'warn'], handled: ['Handled', 'ok'], invited: ['Invited', 'info'], suspended: ['Suspended', 'bad'], removed: ['Removed', 'bad'],
    available: ['Available', 'ok'], held: ['Held', 'warn'], reserved: ['Reserved', ''], confirmed: ['Confirmed', 'info'],
    'Vendor replied': ['Vendor replied', 'ok'], Sent: ['Sent', ''],
  };
  function badge(status, labelOverride) {
    const [label, kind] = STATUS_LABELS[status] || [String(status || '').replace(/_/g, ' '), ''];
    return h('span', { class: 'badge ' + kind }, labelOverride || label);
  }

  let toastTimer = null;
  function toast(message, bad) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, message);
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3800);
  }

  function alertBox(message, kind = '') {
    return h('div', { class: 'alert ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, message);
  }

  function modal(title, body, actions = []) {
    const close = () => bg.remove();
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×'),
        h('h2', null, title),
        body,
        h('div', { class: 'row', style: 'margin-top:16px;justify-content:flex-end' }, actions.map((a) => a(close)))
      ));
    document.body.appendChild(bg);
    return { close };
  }

  // Ask for a text value (for example, a reason). Resolves to the string, or null when cancelled.
  function askText(title, label, { multiline = true, required = true, button = 'Save' } = {}) {
    return new Promise((resolve) => {
      const input = multiline ? h('textarea', { rows: 4 }) : h('input', { type: 'text' });
      let m;
      const submit = () => {
        const v = input.value.trim();
        if (required && !v) { input.focus(); return; }
        m.close();
        resolve(v);
      };
      m = modal(title,
        h('div', { class: 'field' }, h('label', null, label), input),
        [
          (close) => h('button', { class: 'btn ghost', onclick: () => { close(); resolve(null); } }, 'Cancel'),
          () => h('button', { class: 'btn', onclick: submit }, button),
        ]);
      input.focus();
    });
  }

  function confirmAction(message) {
    return new Promise((resolve) => {
      const m = modal('Please confirm', h('p', null, message), [
        (close) => h('button', { class: 'btn ghost', onclick: () => { close(); resolve(false); } }, 'Cancel'),
        (close) => h('button', { class: 'btn danger', onclick: () => { close(); resolve(true); } }, 'Yes, continue'),
      ]);
      return m;
    });
  }

  // Table from column definitions: [{ label, render(row) => node|string }].
  function table(columns, rows, { empty = 'Nothing here yet.' } = {}) {
    if (!rows || !rows.length) return h('div', { class: 'card empty' }, empty);
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map((c) => h('th', null, c.label)))),
        h('tbody', null, rows.map((r) => h('tr', null, columns.map((c) => h('td', { 'data-label': c.label }, c.render ? c.render(r) : r[c.key] ?? '')))))
      ));
  }

  // Read a form into an object. Checkboxes become booleans; empty strings are kept.
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

  // Build a labelled form. fields: [{name,label,type,value,options,required,help,rows,placeholder,full}]
  function formFields(fields) {
    return fields.map((f) => {
      let input;
      if (f.type === 'select') {
        input = h('select', { name: f.name, required: f.required }, (f.options || []).map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o.value, o.label];
          return h('option', { value: val, selected: String(val) === String(f.value ?? '') }, text);
        }));
      } else if (f.type === 'textarea') {
        input = h('textarea', { name: f.name, rows: f.rows || 4, required: f.required, placeholder: f.placeholder }, f.value ?? '');
      } else if (f.type === 'checkbox') {
        return h('div', { class: 'field' }, h('label', { class: 'inline' }, h('input', { type: 'checkbox', name: f.name, checked: !!f.value }), f.label), f.help ? h('div', { class: 'help' }, f.help) : null);
      } else {
        input = h('input', { name: f.name, type: f.type || 'text', value: f.value ?? '', required: f.required, placeholder: f.placeholder, min: f.min, max: f.max, step: f.step, autocomplete: f.autocomplete, inputmode: f.inputmode });
      }
      return h('div', { class: 'field' }, h('label', { for: f.name }, f.label + (f.required ? ' *' : '')), input, f.help ? h('div', { class: 'help' }, f.help) : null);
    });
  }

  // Wires a submit handler that disables the button while working and reports errors.
  function onSubmit(form, handler, { success, reset = false } = {}) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Working…'; }
      try {
        const result = await handler(readForm(form), form);
        if (success) toast(typeof success === 'function' ? success(result) : success);
        if (reset) form.reset();
      } catch (err) {
        toast(err.message || 'Something went wrong.', true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Save'; }
      }
    });
    return form;
  }

  // Simple hash router. routes: [[RegExp, (match) => Node | Promise<Node>]]
  function router(outlet, routes, fallback) {
    async function render() {
      const hash = location.hash || '#/';
      let handler = null;
      let match = null;
      for (const [re, fn] of routes) {
        match = re.exec(hash);
        if (match) { handler = fn; break; }
      }
      if (!handler) {
        if (fallback) { location.hash = fallback; return; }
        outlet.replaceChildren(h('div', { class: 'card empty' }, 'That page does not exist.'));
        return;
      }
      outlet.replaceChildren(h('div', { class: 'card empty', role: 'status' }, 'Loading…'));
      try {
        const node = await handler(match);
        outlet.replaceChildren(node);
        window.scrollTo(0, 0);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          outlet.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Please sign in'), h('p', null, err.message), h('a', { class: 'btn', href: window.NMD_SIGNIN || '/app/login.html' }, 'Sign in')));
          return;
        }
        outlet.replaceChildren(alertBox(err.message || 'Something went wrong.', 'bad'));
      }
    }
    window.addEventListener('hashchange', render);
    render();
    return render;
  }

  // Shared app shell (sidebar + content) for portals.
  function sideLink(it, active) {
    const on = (it.match && it.match(location.hash)) || active === it.href;
    return h('a', { href: it.href, class: on ? 'on' : '' },
      h('span', null, it.label),
      it.count ? h('span', { class: 'count' }, String(it.count)) : null);
  }
  function sideSection(sec, active) {
    return h('div', null,
      sec.title ? h('div', { class: 'sect' }, sec.title) : null,
      sec.items.map((it) => sideLink(it, active)));
  }
  function shell({ brand, sections, user, onSignOut, active }) {
    const who = h('div', { class: 'who' },
      user ? h('div', null, user.name || user.email) : null,
      onSignOut ? h('button', { class: 'btn ghost small-btn', style: 'margin-top:10px;color:#E8F5EE;border-color:#9CC9B3', onclick: onSignOut }, 'Sign out') : null);
    const side = h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('span', { class: 'mark' }, 'N'), brand),
      sections.map((sec) => sideSection(sec, active)),
      who);
    const main = h('main', { class: 'main', id: 'main' });
    const root = h('div', { class: 'app-shell' }, side, main);
    return { root, main };
  }

  function escapeForAttr(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Public header used by every public page (WEB-01, WEB-04).
  function siteHeader(active) {
    const links = [
      ['#/', 'Home'], ['#/markets', 'Upcoming Markets'], ['#/past', 'Past Markets'], ['#/directory', 'Directory'],
      ['#/marketplace', 'Marketplace'], ['#/blog', 'Blog'], ['#/events', 'Events'], ['#/resources', 'Vendor Resources'], ['#/contact', 'Contact'],
    ];
    return h('header', { class: 'site-top' }, h('div', { class: 'wrap bar' },
      h('a', { class: 'logo', href: '#/' }, h('span', { class: 'mk' }, 'N'), 'Naija Market Day'),
      h('nav', { 'aria-label': 'Main' }, links.map(([href, label]) => h('a', { href, class: active === href ? 'on' : '' }, label))),
      h('div', { class: 'auth' },
        h('a', { class: 'btn ghost small-btn', href: '/app/login.html?as=vendor' }, 'Vendor sign in'),
        h('a', { class: 'btn small-btn', href: '/app/login.html?as=buyer' }, 'User sign in'))));
  }

  function footer() {
    return h('footer', { class: 'footer' }, h('div', { class: 'wrap' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('span', null, '© Naija Market Day'),
        h('span', null, h('a', { href: '#/resources' }, 'Terms and resources'), ' · ', h('a', { href: '#/contact' }, 'Contact'))),
      h('div', { class: 'disclaimer', id: 'disclaimer' })));
  }

  async function loadDisclaimer() {
    try {
      const s = await api('/settings/public');
      const el = document.getElementById('disclaimer');
      if (el) el.textContent = s.disclaimer;
    } catch { /* footer disclaimer is optional */ }
  }

  // Bell button used in the vendor and buyer portals (VEN-44).
  async function bellCount() {
    try {
      const path = location.pathname.includes('vendor') ? '/vendor/notifications' : '/buyer/notifications';
      const n = await api(path);
      return n.unread || 0;
    } catch { return 0; }
  }

  window.UI = {
    h, api, ApiError, money, ymd, fmtDate, fmtDateTime, timeAgo, badge, toast, alertBox, modal, askText, confirmAction,
    table, readForm, formFields, onSubmit, router, shell, siteHeader, footer, loadDisclaimer, bellCount, escapeForAttr,
  };
})();
