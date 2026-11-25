/* Vendor application wizard (VEN-01 to VEN-31). Saves after every step. Works from an emailed link
   (token), from a signed-in vendor's session, or after a Stripe return. */
(function () {
  'use strict';
  const { h, api, money, fmtDate, badge, toast, alertBox, formFields, onSubmit, readForm } = window.UI;
  const params = new URLSearchParams(location.search);
  const root = document.getElementById('root');
  const STEP_LABELS = [['details', 'Business'], ['category', 'Category'], ['booth', 'Booth'], ['terms', 'Terms'], ['payment', 'Payment']];

  // Token from the link, or remembered for this browser tab (per-viewer convenience only).
  let token = params.get('t') || sessionStorage.getItem('nmd-apply-token') || '';
  if (params.get('t')) sessionStorage.setItem('nmd-apply-token', params.get('t'));
  let app = null;
  let saved = [];

  const call = (path, opts = {}) => api(path, { ...opts, token: token || undefined });
  const appPath = (suffix = '') => '/apply/' + app.id + suffix;

  async function load() {
    if (params.get('paid') && params.get('session_id')) {
      app = await call('/apply/' + params.get('paid') + '/payment/confirm', { method: 'POST', body: { session_id: params.get('session_id') } }).catch(() => null);
      history.replaceState(null, '', '/app/apply.html');
    }
    if (params.get('app')) return call('/apply/' + params.get('app'));
    if (token) return call('/apply/resume');
    if (params.get('market')) return null;
    return null;
  }

  // Start a brand-new application for a market.
  async function start(marketId) {
    const me = await api('/auth/me');
    if (me.user && (me.user.roles || []).includes('vendor')) {
      const r = await api('/apply/start', { method: 'POST', body: { market_id: Number(marketId) } });
      return r.application;
    }
    return null;
  }

  function emailStep(marketId, market) {
    const email = h('input', { type: 'email', name: 'email', required: true, placeholder: 'you@business.com', autocomplete: 'email' });
    const form = h('form', { class: 'card', style: 'max-width:560px' },
      h('h2', null, 'Apply as vendor'),
      market ? h('p', { class: 'muted' }, `${market.name} · ${fmtDate(market.date)} · ${market.city}`) : null,
      h('p', { class: 'small muted' }, 'Start with your email. You do not need a password yet. Once you pay, we email you a link to set one. If you have traded with us before, we will ask you to sign in instead.'),
      h('div', { class: 'field' }, h('label', null, 'Vendor email *'), email),
      h('button', { class: 'btn', type: 'submit' }, 'Continue'));
    onSubmit(form, async (v) => {
      const r = await api('/apply/start', { method: 'POST', body: { market_id: Number(marketId), email: v.email } });
      if (r.needs_sign_in) {
        location.href = '/app/login.html?as=vendor&email=' + encodeURIComponent(v.email) + '&next=' + encodeURIComponent('/app/apply.html?market=' + marketId);
        return 'Please sign in to continue';
      }
      token = r.token;
      sessionStorage.setItem('nmd-apply-token', token);
      history.replaceState(null, '', '/app/apply.html?t=' + token);
      toast('We saved your place. A link to continue is on its way to your email.');
      app = r.app;
      return 'Saved';
    }, { success: (m) => m });
    return form;
  }

  function stepBar(current) {
    const idx = STEP_LABELS.findIndex(([k]) => k === current);
    return h('div', { class: 'wizard-steps', 'aria-label': 'Application steps' }, STEP_LABELS.map(([k, label], i) =>
      h('span', { class: i === idx ? 'on' : i < idx ? 'done' : '' }, `${i + 1}. ${label}`)));
  }

  // Step 1: business details (VEN-03, VEN-37).
  function detailsStep() {
    const biz = app.business || {};
    const saved = window.__savedBusinesses || [];
    const chooser = saved.length ? h('div', { class: 'field' },
      h('label', null, 'Use a saved business'),
      h('select', { name: 'business_id' }, h('option', { value: '' }, 'Enter a new business'),
        saved.map((b) => h('option', { value: b.id, selected: biz.id === b.id }, b.name)))) : null;
    const f = h('form', { class: 'card' }, chooser,
      formFields([
        { name: 'name', label: 'Business name', required: true, value: biz.name || '' },
        { name: 'contact_person', label: 'Contact person', required: true, value: biz.contact_person || '' },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, value: biz.phone || '', autocomplete: 'tel' },
        { name: 'city', label: 'City', required: true, value: biz.city || '' },
        { name: 'website', label: 'Website (optional)', type: 'url', value: biz.website || '' },
        { name: 'description', label: 'Short description (shown in the directory)', type: 'textarea', value: biz.description || '' },
      ]),
      h('button', { class: 'btn', type: 'submit' }, 'Save and continue'));
    onSubmit(f, async (v) => {
      const body = v.business_id ? { business_id: Number(v.business_id), complete_step: 'details' }
        : { business: { name: v.name, contact_person: v.contact_person, phone: v.phone, city: v.city, website: v.website, description: v.description, category: (app.category || '') }, complete_step: 'details' };
      app = await call(appPath(), { method: 'PUT', body });
      render();
      return 'Saved';
    }, { success: 'Saved' });
    return f;
  }

  // Step 2: category and its questions (VEN-11, VEN-12).
  function categoryStep() {
    const answers = app.answers || {};
    let current = app.category || '';
    const select = h('select', { name: 'category', required: true }, h('option', { value: '' }, 'Choose a category'),
      app.categories.map((c) => h('option', { value: c.key, selected: c.key === current }, c.label)));
    const questions = h('div');
    const draw = () => {
      const cat = app.categories.find((c) => c.key === select.value);
      if (!cat) { questions.replaceChildren(); return; }
      const specs = cat.questions.map((q) => (q.type === 'bool'
        ? { name: q.key, label: q.label, type: 'checkbox', value: answers[q.key] === true }
        : { name: q.key, label: q.label + (q.required ? '' : ' (if it applies)'), value: answers[q.key] || '' }));
      questions.replaceChildren(...formFields(specs));
    };
    select.addEventListener('change', draw);
    draw();
    const f = h('form', { class: 'card' }, h('div', { class: 'field' }, h('label', null, 'Category *'), select), questions,
      app.food_certificate_required ? h('p', { class: 'help' }, 'Food vendors need a valid city food certificate. You upload it on the payment step.') : null,
      h('button', { class: 'btn', type: 'submit' }, 'Save and continue'));
    onSubmit(f, async (v) => {
      const ans = {};
      for (const [k, val] of Object.entries(v)) if (k !== 'category') ans[k] = val;
      await call(appPath(), { method: 'PUT', body: { category: v.category, answers: ans } });
      app = await call(appPath(), { method: 'PUT', body: { complete_step: 'category' } });
      render();
      return 'Saved';
    }, { success: 'Saved' });
    return f;
  }

  // Step 3: booth picker (VEN-17 to VEN-20). Taken booths are greyed out; the price shows once selected.
  async function boothStep() {
    let booths = await call(appPath('/booths'));
    const market = app.market;
    const grid = h('div', { class: 'booth-grid', role: 'radiogroup', 'aria-label': 'Booths' });
    const info = h('div', { class: 'alert', role: 'status' });
    const tiers = [...new Set(booths.map((b) => b.tier))];
    let selected = app.booth ? app.booth.id : null;
    const draw = () => {
      grid.replaceChildren(...booths.map((b) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': selected === b.id ? 'true' : 'false',
        class: 'booth t-' + String(b.tier).toLowerCase().replace(/[^a-z]/g, '') + (selected === b.id ? ' sel' : ''),
        disabled: b.status !== 'available',
        title: b.status === 'available' ? '' : 'Not available',
        onclick: async () => {
          try {
            app = await call(appPath('/booth'), { method: 'POST', body: { booth_id: b.id } });
            selected = b.id;
            info.className = 'alert ok';
            info.textContent = `Booth ${b.number} (${b.tier}) is held for you while you finish. Price: ${money(b.price_cents)}.`;
            draw();
          } catch (err) { toast(err.message, true); }
        },
      },
        h('div', { class: 'num' }, b.number),
        h('div', { class: 'tier' }, b.tier + ' · ' + (b.type === 'food' ? 'Food' : 'Standard')),
        h('div', { class: 'small' }, money(b.price_cents)),
        h('div', { class: 'small muted' }, b.status === 'available' ? 'Available' : b.status === 'held' ? 'Held' : b.status === 'confirmed' || b.status === 'paid' ? 'Taken' : b.status))));
    };
    draw();
    // Live booth map: booths taken by other vendors grey out while this applicant is choosing.
    const stopLive = window.UI.poll(async () => {
      if (!document.body.contains(grid)) { stopLive(); return; }
      const fresh = await call(appPath('/booths')).catch(() => null);
      if (!fresh) return;
      const changed = JSON.stringify(fresh.map((b) => b.status)) !== JSON.stringify(booths.map((b) => b.status));
      if (changed) { booths = fresh; draw(); }
    }, 10000);
    const fullTiers = tiers.filter((t) => !booths.some((b) => b.tier === t && b.status === 'available'));
    const waitlist = fullTiers.length ? h('div', { class: 'card tint', style: 'margin-top:14px' },
      h('h3', null, 'Wanted tier is taken?'),
      h('p', { class: 'small muted' }, 'Join the waitlist for a tier. We offer you a booth when one is released.'),
      h('div', { class: 'row' }, fullTiers.map((t) => h('button', { class: 'btn ghost small-btn', type: 'button', onclick: async () => {
        try {
          app = await call(appPath('/waitlist'), { method: 'POST', body: { tier: t } });
          toast('You are on the waitlist for ' + t);
          render();
        } catch (err) { toast(err.message, true); }
      } }, 'Join waitlist: ' + t)))) : null;
    const floor = market && market.floor_plan_url ? h('div', { class: 'card', style: 'margin-bottom:14px' },
      h('h3', null, 'Floor plan'), h('a', { href: market.floor_plan_url, target: '_blank', rel: 'noopener' }, h('img', { class: 'thumb', src: market.floor_plan_url, alt: 'Numbered floor plan. Open to enlarge.' }))) : null;
    const next = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!app.booth) { toast('Choose a booth first.', true); return; }
      app = await call(appPath(), { method: 'PUT', body: { complete_step: 'booth' } });
      render();
    } }, 'Continue');
    return h('div', null, floor, h('div', { class: 'card' }, info, grid, h('div', { style: 'margin-top:16px' }, next)), waitlist);
  }

  // Step 4: event terms with the no-refund policy, recorded with the date (VEN-21).
  function termsStep() {
    const f = h('form', { class: 'card' },
      h('h3', null, 'Event terms'),
      h('div', { class: 'disclaimer', style: 'white-space:pre-wrap;font-size:14px;color:var(--ink);border-left-color:var(--green)' }, app.market.terms || 'Terms will be posted before applications close.'),
      h('p', { class: 'help', style: 'font-weight:700;color:var(--bad)' }, 'Booth fees are non-refundable after payment unless we decline your application.'),
      h('div', { class: 'field' }, h('label', { class: 'inline' }, h('input', { type: 'checkbox', name: 'accepted', required: true }), 'I have read and accept these terms.')),
      h('button', { class: 'btn', type: 'submit' }, 'Accept and continue'));
    onSubmit(f, async () => {
      app = await call(appPath('/terms'), { method: 'POST', body: { accepted: true } });
      app = await call(appPath(), { method: 'PUT', body: { complete_step: 'terms' } });
      render();
      return 'Terms accepted';
    }, { success: 'Terms accepted' });
    return f;
  }

  // Step 5: certificate (food) and payment (VEN-22, VEN-23).
  function paymentStep() {
    const answers = app.answers || {};
    const isFood = answers.is_food === true;
    const docs = app.documents || [];
    const hasCert = docs.some((d) => d.kind === 'food_certificate' && (!d.expires_on || d.expires_on >= new Date().toISOString().slice(0, 10)));
    const block = h('div', { class: 'stack' });
    const summary = h('dl', { class: 'kv' },
      [h('dt', null, 'Market'), h('dd', null, app.market.name)],
      [h('dt', null, 'Booth'), h('dd', null, `${app.booth.number} (${app.booth.tier})`)],
      [h('dt', null, 'Booth fee'), h('dd', null, h('strong', null, money(app.booth.price_cents)))]);
    if (isFood && app.food_certificate_required && !hasCert) {
      const file = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp', 'aria-label': 'City food certificate' });
      const expires = h('input', { type: 'date', 'aria-label': 'Certificate expiry date' });
      const up = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const f = file.files[0];
        if (!f) return toast('Choose a file first.', true);
        if (f.size > 8 * 1024 * 1024) return toast('That file is over 8 MB.', true);
        const data_url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        try {
          await call(appPath('/documents'), { method: 'POST', body: { kind: 'food_certificate', filename: f.name, data_url, expires_on: expires.value || null } });
          toast('Certificate uploaded');
          render();
        } catch (err) { toast(err.message, true); }
      } }, 'Upload certificate');
      block.appendChild(alertBox('Food vendors must upload a valid city food certificate before paying.', 'warn'));
      block.appendChild(h('div', { class: 'card' }, h('div', { class: 'field' }, h('label', null, 'City food certificate (PDF or image)'), file),
        h('div', { class: 'field' }, h('label', null, 'Expiry date'), expires), up));
    } else if (isFood) {
      block.appendChild(alertBox('Food certificate on file. Thank you.', 'ok'));
    }
    const pay = h('button', { class: 'btn big-btn', type: 'button', onclick: async () => {
      pay.disabled = true;
      try {
        const r = await call(appPath('/pay'), { method: 'POST', body: {} });
        if (r.redirect) { location.href = r.redirect; return; }
        toast('Payment received');
        app = await call(appPath());
        render();
      } catch (err) {
        toast(err.message, true);
        pay.disabled = false;
      }
    } }, 'Pay ' + money(app.booth.price_cents));
    block.appendChild(h('div', { class: 'card' }, summary,
      h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Payments are taken securely. ' + (app.payment_status === 'failed' ? 'The last payment did not go through. Your booth is still held, so you can try again.' : '')),
      pay));
    return block;
  }

  // Status view for applications past payment (VEN-24, VEN-25).
  function statusView() {
    const parts = [];
    const title = { under_review: 'Under review', more_info: 'More information needed', approved: 'Approved', declined: 'Declined and refunded', offered: 'A booth is available', waitlisted: 'On the waitlist' }[app.status] || 'Submitted';
    parts.push(h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h2', null, title), badge(app.status)),
      h('dl', { class: 'kv', style: 'margin-top:12px' }, [h('dt', null, 'Market'), h('dd', null, app.market.name + ' · ' + fmtDate(app.market.date))],
        app.booth ? [h('dt', null, 'Booth'), h('dd', null, app.booth.number + ' (' + app.booth.tier + ')')] : null)));
    if (app.status === 'more_info') {
      const note = h('textarea', { rows: 3, 'aria-label': 'Your reply' });
      parts.push(h('div', { class: 'card' }, h('h3', null, 'What we need'), h('p', { style: 'white-space:pre-wrap' }, app.more_info_note),
        h('p', { class: 'small muted' }, 'Update your details in the business step, then tell us you have replied.'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          app = await call(appPath('/resubmit'), { method: 'POST', body: {} }).catch((e) => { toast(e.message, true); return app; });
          toast('Sent back for review');
          render();
        } }, 'I have replied, resubmit')));
    }
    if (app.status === 'approved') {
      parts.push(h('div', { class: 'card tint' }, h('p', null, 'Your booth and QR code are in your vendor portal.'), h('a', { class: 'btn', href: '/app/vendor.html#/applications/' + app.id }, 'Open my QR code')));
    }
    if (app.status === 'declined') {
      parts.push(alertBox('Your booth fee has been refunded to your card.', 'ok'));
    }
    return h('div', { class: 'stack' }, parts);
  }

  function doneView() {
    return h('div', { class: 'card' }, h('h2', null, 'Application submitted'),
      h('p', null, 'Thanks. We are reviewing your application for ', h('strong', null, app.market.name), '. We will email you when there is an update.'),
      h('p', { class: 'small muted' }, 'If this is your first market with us, check your email for a link to set your vendor password.'),
      h('a', { class: 'btn ghost', href: '/app/' }, 'Back to Naija Market Day'));
  }

  async function render() {
    if (!app) return;
    const wrapper = h('div', { class: 'stack' });
    wrapper.appendChild(h('div', { class: 'spread' }, h('a', { href: '/app/' }, '← Naija Market Day'), h('span', { class: 'small muted' }, app.market.name)));
    if (app.status !== 'draft' && app.status !== 'waitlisted' && app.status !== 'offered') {
      wrapper.appendChild(statusView());
    } else if (app.step === 'done' || app.payment_status === 'paid') {
      wrapper.appendChild(statusView());
    } else {
      wrapper.appendChild(stepBar(app.step));
      if (app.status === 'offered') wrapper.appendChild(alertBox('A booth was released to you. Accept the terms and pay by ' + (app.hold_until ? fmtDate(app.hold_until) : 'the deadline') + '.', 'warn'));
      const stepNode = {
        details: detailsStep,
        category: categoryStep,
        booth: boothStep,
        terms: termsStep,
        payment: paymentStep,
      }[app.step] || detailsStep;
      wrapper.appendChild(await stepNode());
    }
    root.replaceChildren(wrapper);
  }

  async function boot() {
    const marketId = params.get('market');
    try {
      if (marketId && !token && !params.get('app')) {
        const m = await api('/markets/' + marketId).catch(() => null);
        const me = await api('/auth/me');
        if (me.user && (me.user.roles || []).includes('vendor')) {
          app = await start(marketId);
          const biz = await api('/vendor/businesses').catch(() => []);
          window.__savedBusinesses = biz;
          history.replaceState(null, '', '/app/apply.html?app=' + app.id);
          return render();
        }
        return root.replaceChildren(emailStep(marketId, m));
      }
      if (!token && !params.get('app') && !params.get('paid')) {
        return root.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'No application open'), h('p', null, 'Choose a market and select Apply as vendor.'), h('a', { class: 'btn', href: '/app/#/markets' }, 'See markets')));
      }
      app = await load();
      if (!app) throw new Error('This link has expired or was already used. Choose the market again to start a new application.');
      try {
        const me = await api('/auth/me');
        if (me.user && (me.user.roles || []).includes('vendor')) window.__savedBusinesses = await api('/vendor/businesses').catch(() => []);
      } catch { /* not signed in */ }
      if (params.get('cancelled')) toast('Payment was cancelled. Your booth is still held for a few minutes.');
      render();
    } catch (err) {
      root.replaceChildren(alertBox(err.message, 'bad'));
    }
  }

  boot();
})();
