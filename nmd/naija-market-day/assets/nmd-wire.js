/* Naija Market Day: connects the mockup pages to the live API.
   Pages declare what they need with data attributes; this file does the rest.
   - <body data-nmd="login">        page-specific behaviour (see PAGES below)
   - <form data-api="name">         submits to PAGES[page].forms[name]
   - <div data-list="src">          fills a <template> with one copy per item (fields: data-f="field")
   - [data-action="name"]           click handler from PAGES[page].actions[name]
   Nothing here changes how the pages look. */
(function () {
  'use strict';
  var API = '/api';

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: (opts.method && opts.method !== 'GET') ? JSON.stringify(opts.body || {}) : undefined,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Something went wrong (' + res.status + ').'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function () { throw new Error('You appear to be offline. Check your connection and try again.'); });
  }

  function toast(msg, bad) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.style.background = bad ? '#8A2A1C' : '';
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  window.nmdToast = toast;

  function money(cents) { return cents == null ? '' : '$' + (Number(cents) / 100).toFixed(2); }
  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Current signed-in user (or null). Cached for the page.
  var meCache;
  function me() {
    if (!meCache) meCache = api('/auth/me').then(function (r) { return r.user; }, function () { return null; });
    return meCache;
  }

  // Fill a template with item fields. Each [data-f] gets textContent; [data-src] gets src;
  // [data-href] gets href with {id} replaced; [data-show-if] hides when the field is empty.
  function fill(tpl, item) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelectorAll('[data-f]').forEach(function (el) {
      var k = el.getAttribute('data-f');
      var v = item[k];
      el.textContent = v == null ? '' : String(v);
    });
    node.querySelectorAll('[data-src]').forEach(function (el) {
      var v = item[el.getAttribute('data-src')];
      if (v) el.src = v; else el.remove();
    });
    [node].concat(Array.prototype.slice.call(node.querySelectorAll('[data-href]'))).forEach(function (el) {
      if (!el.hasAttribute || !el.hasAttribute('data-href')) return;
      el.href = el.getAttribute('data-href').replace(/\{(\w+)\}/g, function (_, k) { return item[k] == null ? '' : encodeURIComponent(item[k]); });
    });
    node.querySelectorAll('[data-hide-empty]').forEach(function (el) {
      var k = el.getAttribute('data-hide-empty');
      if (!item[k]) el.remove();
    });
    node.__item = item;
    return node;
  }

  function loadLists(page) {
    document.querySelectorAll('[data-list]').forEach(function (box) {
      var tpl = box.querySelector('template');
      if (!tpl) return;
      var src = box.getAttribute('data-list');
      var mapper = (PAGES[page] && PAGES[page].lists && PAGES[page].lists[src]) || null;
      var path = mapper ? mapper.path(box) : src;
      var empty = box.getAttribute('data-empty') || 'Nothing here yet.';
      api(path).then(function (rows) {
        if (mapper && mapper.map) rows = mapper.map(rows);
        Array.prototype.slice.call(box.children).forEach(function (c) { if (c !== tpl) c.remove(); });
        if (!rows || !rows.length) {
          var p = document.createElement('p'); p.className = 'nmd-empty'; p.style.cssText = 'color:var(--muted);padding:12px 0'; p.textContent = empty; box.appendChild(p);
          return;
        }
        rows.forEach(function (item) { box.appendChild(fill(tpl, item)); });
        box.dispatchEvent(new CustomEvent('nmd:loaded', { detail: rows }));
      }).catch(function (err) { toast(err.message, true); });
    });
  }

  // Forms: the page declares the handler; this collects named fields.
  function values(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }

  function bindForms(page) {
    document.querySelectorAll('form[data-api]').forEach(function (form) {
      var name = form.getAttribute('data-api');
      var handler = PAGES[page] && PAGES[page].forms && PAGES[page].forms[name];
      form.removeAttribute('onsubmit');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!handler) { toast('This form is not connected yet.', true); return; }
        var btn = form.querySelector('[type=submit]');
        if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Working...'; }
        Promise.resolve().then(function () { return handler(values(form), form); })
          .then(function (msg) { if (msg) toast(msg); })
          .catch(function (err) { toast(err.message, true); })
          .then(function () { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; } });
      });
    });
  }

  function bindActions(page) {
    document.querySelectorAll('[data-action]').forEach(function (el) {
      var name = el.getAttribute('data-action');
      var handler = PAGES[page] && PAGES[page].actions && PAGES[page].actions[name];
      el.addEventListener('click', function (e) {
        if (el.tagName === 'A') e.preventDefault();
        if (!handler) { toast('Not connected yet.', true); return; }
        Promise.resolve().then(function () { return handler(el, e); })
          .then(function (msg) { if (msg) toast(msg); })
          .catch(function (err) { toast(err.message, true); });
      });
    });
  }

  // Header: "Sign in" becomes the account, and "Sell on NMD" goes to the right place for who is signed in.
  function bindHeader() {
    me().then(function (user) {
      document.querySelectorAll('a[href="login.html"]').forEach(function (a) {
        if (!user) return;
        a.textContent = user.roles.indexOf('vendor') >= 0 ? 'My dashboard' : 'My account';
        a.href = user.roles.indexOf('vendor') >= 0 ? 'vendor-dashboard.html' : 'messages.html';
      });
      document.querySelectorAll('a[href="vendor-onboarding.html"].cta').forEach(function (a) {
        if (user && user.roles.indexOf('vendor') >= 0) { a.textContent = 'Vendor dashboard'; a.href = 'vendor-dashboard.html'; }
      });
    });
  }

  // Per-page behaviour. Filled in by each page section below.
  var PAGES = {};
  window.nmdPages = PAGES;

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-nmd');
    bindForms(page);
    bindActions(page);
    loadLists(page);
    bindHeader();
    if (PAGES[page] && PAGES[page].init) PAGES[page].init(api, me, toast);
  });
  window.nmd = { api: api, me: me, toast: toast, money: money, fmtDate: fmtDate, fill: fill,
    reload: function () { loadLists(document.body.getAttribute('data-nmd')); } };
})();
