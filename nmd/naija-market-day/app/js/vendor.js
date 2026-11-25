/* Vendor portal: dashboard, markets, applications, marketplace, messages, notifications, businesses, receipts. */
(function () {
  'use strict';
  const { h, api, money, fmtDate, fmtDateTime, timeAgo, badge, toast, alertBox, table, formFields, onSubmit, router, shell, modal, askText, confirmAction } = window.UI;
  const root = document.getElementById('root');
  const BIZ_KEY = 'nmd-vendor-business';
  let me = null;
  let businesses = [];
  let selectedBiz = null; // null = all businesses

  function bizQuery(prefix = '?') {
    return selectedBiz ? prefix + 'business_id=' + selectedBiz : '';
  }

  function switcher() {
    if (businesses.length <= 1) return null;
    const sel = h('select', { 'aria-label': 'Switch business', style: 'max-width:280px;margin-bottom:14px' },
      h('option', { value: '' }, 'All my businesses'),
      businesses.map((b) => h('option', { value: b.id, selected: String(selectedBiz) === String(b.id) }, b.name)));
    sel.addEventListener('change', () => {
      selectedBiz = sel.value ? Number(sel.value) : null;
      try { sessionStorage.setItem(BIZ_KEY, sel.value); } catch { /* ignore */ }
      router_();
    });
    return h('div', { class: 'row small muted', style: 'margin-bottom:12px' }, 'Showing: ', sel);
  }

  function frame(title, ...kids) {
    return h('div', { class: 'stack' },
      h('div', { class: 'spread' }, h('h1', null, title), switcher()),
      ...kids);
  }

  // ---------- dashboard (VEN-09) ----------
  async function dashboard() {
    const d = await api('/vendor/dashboard' + bizQuery());
    const cards = [
      ['Applications', d.applications_total, '#/applications'],
      ['Under review', d.application_counts.under_review || 0, '#/applications'],
      ['Need your reply', d.application_counts.more_info || 0, '#/applications'],
      ['Approved', d.application_counts.approved || 0, '#/applications'],
      ['Unread messages', d.unread_messages, '#/messages'],
      ['Marketplace', d.subscription.active ? (d.subscription.status === 'trial' ? 'Free period' : 'Active') : 'Not subscribed', '#/marketplace'],
    ];
    const next = d.next_market;
    return frame('Welcome, ' + ((me && me.name) || 'vendor'),
      h('div', { class: 'kpi' }, cards.map(([label, n, href]) => h('a', { class: 'card lift', href, style: 'color:inherit;text-decoration:none' }, h('div', { class: 'n', 'data-count': typeof n === 'number' ? n : null }, String(n)), h('div', { class: 'l' }, label)))),
      h('div', { class: 'grid grid-2', style: 'margin-top:16px' },
        h('div', { class: 'card' }, h('h3', null, 'Next market'),
          next ? h('div', null, h('strong', null, next.name), h('div', { class: 'muted' }, `${next.city} · ${fmtDate(next.date)}`), h('div', null, 'Booth ', h('strong', null, next.booth || 'to be confirmed')), h('a', { href: '#/applications/' + next.application_id }, 'View my QR code'))
            : h('p', { class: 'muted' }, 'No approved upcoming market yet.')),
        h('div', { class: 'card' }, h('h3', null, 'Quick actions'),
          h('div', { class: 'stack' },
            h('a', { class: 'btn ghost block', href: '#/markets' }, 'Apply to a market'),
            h('a', { class: 'btn ghost block', href: '#/businesses' }, 'Manage my businesses'),
            h('a', { class: 'btn ghost block', href: '#/marketplace' }, 'Marketplace and listings')))));
  }

  // QR check-in (VEN-26): every approved booking with its QR code, ready to show at the entrance.
  async function qrPage() {
    const rows = (await api('/vendor/applications' + bizQuery())).filter((a) => a.status === 'approved');
    const cards = await Promise.all(rows.map(async (a) => {
      const d = await api('/vendor/applications/' + a.id + '/qr').catch(() => null);
      return h('div', { class: 'card lift stack', style: 'text-align:center' },
        h('div', { class: 'spread' }, h('strong', null, a.market_name), badge(a.attendance)),
        d ? h('img', { class: 'qr', src: d.qr_data_url, alt: 'QR for ' + a.market_name }) : h('div', { class: 'muted' }, 'QR not ready yet'),
        h('div', { class: 'small muted' }, (a.business || '') + (a.booth ? ' · booth ' + a.booth : '')));
    }));
    return frame('QR check-in', h('p', { class: 'muted' }, 'Show this code at the entrance. Staff scan it on arrival and check you out when you leave.'),
      cards.length ? h('div', { class: 'grid grid-cards' }, cards) : h('div', { class: 'card empty-state' }, 'No approved bookings yet. Your QR code appears here once an application is approved.'));
  }

  // ---------- markets (VEN-10): apply from here ----------
  async function markets() {
    const list = await api('/markets');
    const open = list.filter((m) => m.effective_status === 'published');
    return frame('Markets',
      h('p', { class: 'muted' }, 'Apply to any market with open applications. You can apply to several markets, including in different cities.'),
      open.length ? h('div', { class: 'grid grid-cards' }, open.map((m) => h('div', { class: 'card stack' },
        h('div', { class: 'small muted' }, m.city), h('h3', null, m.name), h('div', null, fmtDate(m.date)),
        h('a', { class: 'btn', href: '/app/apply.html?market=' + m.id }, 'Apply for this market')))) : h('p', { class: 'muted' }, 'No markets are open for applications right now.'));
  }

  // ---------- applications (VEN-24 to VEN-28, VEN-14) ----------
  async function applications() {
    const rows = await api('/vendor/applications' + bizQuery());
    return frame('My applications',
      table([
        { label: 'Market', render: (a) => h('a', { href: '#/applications/' + a.id }, a.market_name) },
        { label: 'Date', render: (a) => fmtDate(a.market_date) },
        { label: 'Business', render: (a) => a.business },
        { label: 'Booth', render: (a) => a.booth || '—' },
        { label: 'Status', render: (a) => badge(a.status) },
        { label: 'Payment', render: (a) => badge(a.payment_status) },
      ], rows, { empty: 'You have no applications yet. Apply to a market from the Markets page.' }),
      h('div', null, h('a', { class: 'btn ghost', href: '#/markets', style: 'margin-top:12px' }, 'Apply to another market')));
  }

  async function applicationDetail(id) {
    const a = await api('/vendor/applications/' + id);
    const parts = [
      h('p', null, h('a', { href: '#/applications' }, '← My applications')),
      h('div', { class: 'grid grid-2', style: 'align-items:start' },
        h('div', { class: 'card' },
          h('div', { class: 'spread' }, h('h2', null, a.market.name), badge(a.status)),
          h('dl', { class: 'kv', style: 'margin-top:10px' },
            [h('dt', null, 'Date'), h('dd', null, fmtDate(a.market.date) + (a.market.start_time ? ' · ' + a.market.start_time : ''))],
            [h('dt', null, 'Venue'), h('dd', null, a.market.venue || '')],
            [h('dt', null, 'Business'), h('dd', null, a.business ? a.business.name : '')],
            [h('dt', null, 'Booth'), h('dd', null, a.booth ? `${a.booth.number} (${a.booth.tier})` : 'Not chosen yet')],
            [h('dt', null, 'Payment'), h('dd', null, badge(a.payment_status), ' ', money(a.amount_cents || (a.booth && a.booth.price_cents) || 0))])),
        a.qr_data_url ? h('div', { class: 'card', style: 'text-align:center' }, h('h3', null, 'Your vendor QR code'), h('img', { class: 'qr', src: a.qr_data_url, alt: 'Vendor QR code' }), h('p', { class: 'small muted' }, 'Show this at the entrance. Staff scan it on arrival.')) : null),
    ];
    if (a.status === 'more_info') {
      parts.push(alertBox('The team asked for more information: ' + a.more_info_note, 'warn'));
      parts.push(h('button', { class: 'btn', onclick: async () => {
        try { await api('/vendor/applications/' + id + '/resubmit', { method: 'POST' }); toast('Sent back for review'); router_(); } catch (err) { toast(err.message, true); }
      } }, 'I have updated my application, resubmit'));
    }
    if (a.status === 'waitlisted' || a.status === 'offered') parts.push(alertBox(a.status === 'offered' ? 'A booth was released to you. Finish payment from your application link.' : 'You are on the waitlist for this market.', 'info'));
    if (a.status === 'draft') parts.push(alertBox('This application is not finished. Continue it from the Markets page.', 'warn'));
    if (a.status === 'approved') parts.push(alertBox('Approved. Your booth is confirmed and your QR code is above.', 'ok'));
    if (a.status === 'declined') parts.push(alertBox('This application was declined and the booth fee was refunded automatically.', 'bad'));
    if (a.payments && a.payments.length) parts.push(h('div', { class: 'card' }, h('h3', null, 'Payments'), table([
      { label: 'Date', render: (p) => fmtDate(p.created_at) }, { label: 'Type', render: (p) => p.kind }, { label: 'Amount', render: (p) => money(p.amount_cents) }, { label: 'Status', render: (p) => badge(p.status) },
    ], a.payments)));
    return frame('Application', ...parts);
  }

  // ---------- marketplace (VEN-32 to VEN-35) ----------
  async function marketplace() {
    const [plans, bizs, listings] = await Promise.all([api('/settings/public').then((s) => s.plans), api('/vendor/businesses'), api('/vendor/listings' + bizQuery())]);
    const subs = bizs.filter((b) => !selectedBiz || b.id === selectedBiz).map((b) => {
      const s = b.subscription;
      const planSel = h('select', { 'aria-label': 'Plan' }, plans.map((p) => h('option', { value: p.code }, `${p.name}: ${money(p.price_cents)} (${p.free_days} days free to start)`)));
      return h('div', { class: 'card stack' },
        h('div', { class: 'spread' }, h('h3', null, b.name), badge(s.active ? s.status : 'none')),
        s.active ? h('p', { class: 'small' }, s.status === 'trial' ? 'Free period ends ' : 'Renews ', fmtDate(s.renews_at), s.cancel_at_period_end ? ' · Cancelled: listings go offline then' : '')
          : h('p', { class: 'small muted' }, 'Subscribe to sell on Marketplace. Your directory listing does not need a subscription.'),
        s.active ? h('div', { class: 'row' }, s.cancel_at_period_end ? null : h('button', { class: 'btn ghost small-btn', onclick: async () => {
          if (!(await confirmAction('Cancel this subscription? Listings stay online until the end of the period.'))) return;
          try { const r = await api('/vendor/businesses/' + b.id + '/cancel', { method: 'POST' }); toast('Cancelled. Listings go offline on ' + fmtDate(r.listings_offline_on)); router_(); } catch (err) { toast(err.message, true); }
        } }, 'Cancel subscription'))
          : h('div', { class: 'row' }, planSel, h('button', { class: 'btn', onclick: async () => {
            try {
              const r = await api('/vendor/businesses/' + b.id + '/subscribe', { method: 'POST', body: { plan_code: planSel.value } });
              if (r.redirect) { location.href = r.redirect; return; }
              toast(r.status === 'trial' ? 'Marketplace is on for your free period' : 'Subscribed');
              router_();
            } catch (err) { toast(err.message, true); }
          } }, s.status === 'lapsed' || s.status === 'cancelled' ? 'Renew' : 'Subscribe')));
    });
    const listingRows = table([
      { label: 'Listing', render: (l) => l.name },
      { label: 'Price', render: (l) => l.sale_price_cents ? h('span', null, h('s', null, money(l.price_cents)), ' ', money(l.sale_price_cents)) : money(l.price_cents) },
      { label: 'Status', render: (l) => l.hidden ? badge('Hidden', 'bad') : badge(l.subscription_active ? 'active' : 'lapsed', l.subscription_active ? 'Live' : 'Offline') },
      { label: 'Views', render: (l) => String(l.views || 0) },
      { label: '', render: (l) => h('div', { class: 'row' }, h('button', { class: 'btn ghost small-btn', onclick: () => listingForm(l, bizs) }, 'Edit'), h('button', { class: 'btn ghost small-btn', onclick: async () => {
        if (!(await confirmAction('Delete "' + l.name + '"?'))) return;
        try { await api('/vendor/listings/' + l.id, { method: 'DELETE' }); toast('Deleted'); router_(); } catch (err) { toast(err.message, true); }
      } }, 'Delete')) },
    ], listings, { empty: 'No listings yet. Subscribe a business, then add your first product or service.' });
    const addBtn = h('button', { class: 'btn', onclick: () => listingForm(null, bizs) }, 'Add listing');
    return frame('Marketplace', h('div', { class: 'stack' }, subs), h('div', { class: 'spread', style: 'margin-top:20px' }, h('h2', null, 'Listings'), addBtn), listingRows);
  }

  // Listing form with photo upload (up to 4 photos, PNG/JPG/WEBP).
  function listingForm(l, bizs) {
    const photos = l ? [...(l.photos || [])] : [];
    const preview = h('div', { class: 'row' });
    const drawPreview = () => preview.replaceChildren(...photos.map((p, i) => h('div', { style: 'position:relative' }, h('img', { src: p, alt: 'Photo ' + (i + 1), style: 'width:90px;height:70px;object-fit:cover;border-radius:8px' }), h('button', { type: 'button', class: 'btn ghost small-btn', style: 'position:absolute;top:2px;right:2px', onclick: () => { photos.splice(i, 1); drawPreview(); } }, '×'))));
    drawPreview();
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, 'aria-label': 'Add photos' });
    file.addEventListener('change', async () => {
      for (const f of [...file.files].slice(0, 4 - photos.length)) {
        if (f.size > 3 * 1024 * 1024) { toast(f.name + ' is over 3 MB', true); continue; }
        photos.push(await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }));
      }
      drawPreview();
    });
    const fields = [
      { name: 'name', label: 'Name', required: true, value: l ? l.name : '' },
      { name: 'category', label: 'Category', value: l ? l.category : '' },
      { name: 'price', label: 'Price', type: 'number', step: '0.01', min: '0', required: true, value: l ? (l.price_cents / 100).toFixed(2) : '' },
      { name: 'sale_price', label: 'Sale price for pre-market deals (optional)', type: 'number', step: '0.01', min: '0', value: l && l.sale_price_cents ? (l.sale_price_cents / 100).toFixed(2) : '' },
      { name: 'description', label: 'Description', type: 'textarea', value: l ? l.description : '' },
    ];
    const bizSel = !l && bizs.length > 1 ? [{ name: 'business_id', label: 'Business', type: 'select', required: true, options: bizs.map((b) => [b.id, b.name]) }] : [];
    const form = h('form', { class: 'stack' }, formFields([...bizSel, ...fields]), h('div', null, h('label', null, 'Photos (up to 4)'), preview, file), h('button', { class: 'btn', type: 'submit' }, l ? 'Save listing' : 'Create listing'));
    const body = h('div', null, form);
    const m = modal(l ? 'Edit listing' : 'New listing', body, []);
    onSubmit(form, async (v) => {
      const payload = { ...v, photos };
      if (!l && bizs.length === 1) payload.business_id = bizs[0].id;
      if (l) await api('/vendor/listings/' + l.id, { method: 'PUT', body: payload });
      else await api('/vendor/listings', { method: 'POST', body: payload });
      m.close();
      router_();
      return l ? 'Listing saved' : 'Listing created';
    }, { success: (x) => x });
  }

  // ---------- messages (VEN-41, VEN-42, VEN-43) ----------
  async function messages() {
    const [chats, bizs] = await Promise.all([api('/vendor/chats' + bizQuery()), api('/vendor/businesses')]);
    return frame('Messages',
      h('p', { class: 'muted small' }, 'Buyer chats for businesses with a Marketplace subscription. Reply and send your own payment link.'),
      table([
        { label: 'Buyer', render: (c) => h('a', { href: '#/messages/' + c.id }, c.buyer_name || 'Buyer') },
        { label: 'Business', render: (c) => c.business_name },
        { label: 'Last message', render: (c) => h('span', null, c.last_message) },
        { label: 'When', render: (c) => timeAgo(c.last_at) },
        { label: 'Unread', render: (c) => c.unread ? badge('new', String(c.unread)) : '' },
      ], chats, { empty: bizs.some((b) => b.subscription.active) ? 'No buyer chats yet.' : 'Messages need a Marketplace subscription. Subscribe a business under Marketplace to start receiving chats.' }));
  }

  async function chatThread(id) {
    const c = await api('/vendor/chats/' + id);
    const log = h('div', { class: 'chat', 'aria-live': 'polite' }, c.messages.map((m) => h('div', { class: 'bubble ' + (m.sender_role === 'vendor' ? 'me' : m.sender_role === 'system' ? 'sys' : '') },
      h('div', { class: 'meta' }, (m.sender_role === 'vendor' ? 'You' : 'Buyer') + ' · ' + fmtDateTime(m.created_at)),
      m.body, m.payment_link ? h('div', { style: 'margin-top:8px' }, h('a', { href: m.payment_link, rel: 'noopener', target: '_blank' }, 'Payment link')) : null)));
    const body = h('textarea', { rows: 3, 'aria-label': 'Reply', placeholder: 'Confirm availability and reply…' });
    const link = h('input', { type: 'url', placeholder: 'Your payment link (https://…), optional', 'aria-label': 'Payment link' });
    const send = h('button', { class: 'btn', type: 'button', onclick: async () => {
      try {
        await api('/vendor/chats/' + id + '/messages', { method: 'POST', body: { body: body.value, payment_link: link.value || null } });
        toast('Sent');
        router_();
      } catch (err) { toast(err.message, true); }
    } }, 'Send');
    return frame('Chat with ' + (c.buyer_name || 'buyer'),
      h('p', null, h('a', { href: '#/messages' }, '← Messages')),
      c.subscription_active ? null : alertBox('This business has no active Marketplace subscription, so you cannot reply. Earlier messages stay here.', 'warn'),
      h('div', { class: 'card' }, log),
      c.subscription_active ? h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'field' }, h('label', null, 'Reply'), body), h('div', { class: 'field' }, h('label', null, 'Payment link'), link, h('div', { class: 'help' }, 'Payment happens outside the platform, through the link you send.')), send) : null,
      h('p', { class: 'disclaimer' }, c.disclaimer));
  }

  // ---------- notifications (VEN-44) ----------
  async function notifications() {
    const n = await api('/vendor/notifications');
    await api('/vendor/notifications/read', { method: 'POST' }).catch(() => {});
    return frame('Notifications',
      n.items.length ? h('div', { class: 'stack' }, n.items.map((i) => h('div', { class: 'card', style: i.read ? '' : 'border-color:var(--green)' },
        h('div', { class: 'spread' }, h('strong', null, i.title), h('span', { class: 'small muted' }, timeAgo(i.created_at))),
        i.body ? h('div', { class: 'small muted' }, i.body) : null,
        i.link ? h('a', { href: i.link.startsWith('/app') ? i.link : '#' + i.link.replace(/^\/app\/vendor\.html#?/, '') }, 'Open') : null))) : h('p', { class: 'muted' }, 'No notifications yet. Updates about your applications and markets appear here and in your email.'));
  }

  // ---------- businesses (VEN-36, VEN-38, VEN-39, VEN-40) ----------
  async function businessesPage() {
    const bizs = await api('/vendor/businesses');
    const cats = (await api('/settings/public')).categories;
    const add = h('button', { class: 'btn', onclick: () => businessForm(null, cats) }, 'Add a business');
    return frame('My businesses',
      h('div', { class: 'spread' }, h('p', { class: 'muted' }, 'Saved businesses fill in new applications and show in the directory for every market they are approved for.'), add),
      bizs.length ? h('div', { class: 'grid grid-cards' }, bizs.map((b) => h('div', { class: 'card stack' },
        h('h3', null, b.name), h('div', { class: 'small muted' }, cats.find((c) => c.key === b.category)?.label || 'No category'),
        h('div', { class: 'small' }, b.subscription.active ? 'Marketplace: ' + (b.subscription.status === 'trial' ? 'free period' : 'active') : 'Marketplace: not subscribed'),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost small-btn', onclick: () => businessForm(b, cats) }, 'Edit'), h('button', { class: 'btn ghost small-btn', onclick: () => documentForm(b) }, 'Add certificate'))))) : h('p', { class: 'muted' }, 'No businesses saved yet.'));
  }

  function businessForm(b, cats) {
    const s = (b && b.socials) || {};
    const form = h('form', null, formFields([
      { name: 'name', label: 'Business name', required: true, value: b ? b.name : '' },
      { name: 'category', label: 'Category', type: 'select', options: [['', 'Choose'], ...cats.map((c) => [c.key, c.label])], value: b ? b.category : '' },
      { name: 'contact_person', label: 'Contact person', value: b ? b.contact_person : '' },
      { name: 'phone', label: 'Phone', type: 'tel', value: b ? b.phone : '' },
      { name: 'email', label: 'Public email', type: 'email', value: b ? b.email : '' },
      { name: 'city', label: 'City', value: b ? b.city : '' },
      { name: 'website', label: 'Website', type: 'url', value: b ? b.website : '' },
      { name: 'instagram', label: 'Instagram handle', value: s.instagram || '' },
      { name: 'facebook', label: 'Facebook', value: s.facebook || '' },
      { name: 'tiktok', label: 'TikTok', value: s.tiktok || '' },
      { name: 'description', label: 'Description (shown in the directory)', type: 'textarea', value: b ? b.description : '' },
    ]), h('button', { class: 'btn', type: 'submit' }, b ? 'Save business' : 'Add business'));
    const m = modal(b ? 'Edit business' : 'New business', form, []);
    onSubmit(form, async (v) => {
      const socials = { instagram: v.instagram, facebook: v.facebook, tiktok: v.tiktok };
      const body = { ...v, socials };
      delete body.instagram; delete body.facebook; delete body.tiktok;
      if (b) await api('/vendor/businesses/' + b.id, { method: 'PUT', body });
      else await api('/vendor/businesses', { method: 'POST', body });
      m.close();
      router_();
      return 'Saved';
    }, { success: (x) => x });
  }

  function documentForm(b) {
    const file = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp' });
    const expires = h('input', { type: 'date' });
    const m = modal('Add a certificate for ' + b.name, h('div', null,
      h('p', { class: 'small muted' }, 'Food vendors need a city food certificate. It is attached to new applications automatically until it expires.'),
      h('div', { class: 'field' }, h('label', null, 'File'), file), h('div', { class: 'field' }, h('label', null, 'Expiry date'), expires)), [
      (close) => h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
      () => h('button', { class: 'btn', onclick: async () => {
        const f = file.files[0];
        if (!f) return toast('Choose a file first.', true);
        const data_url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        try {
          await api('/vendor/businesses/' + b.id + '/documents', { method: 'POST', body: { kind: 'food_certificate', filename: f.name, data_url, expires_on: expires.value || null } });
          toast('Certificate saved');
          m.close();
        } catch (err) { toast(err.message, true); }
      } }, 'Save certificate'),
    ]);
  }

  // ---------- resources and receipts (VEN-45, VEN-46) ----------
  async function resources() {
    const groups = await api('/resources');
    return frame('Vendor resources', h('p', { class: 'muted' }, h('a', { href: '/app/#/resources' }, 'Open the full resources page')),
      Object.entries(groups).map(([sec, items]) => h('section', { class: 'card', style: 'margin-top:12px' }, h('h3', { style: 'text-transform:capitalize' }, sec), items.map((r) => h('p', null, h('strong', null, r.title), r.body ? ' — ' + r.body : '')))));
  }
  async function receipts() {
    const rows = await api('/vendor/receipts');
    return frame('Receipts', table([
      { label: 'Date', render: (r) => fmtDate(r.created_at) }, { label: 'Market', render: (r) => r.market_name }, { label: 'Booth', render: (r) => r.booth || '' },
      { label: 'Type', render: (r) => r.kind === 'refund' ? 'Refund' : 'Booth fee' }, { label: 'Amount', render: (r) => money(r.amount_cents) }, { label: 'Status', render: (r) => badge(r.kind === 'refund' ? 'refunded' : 'paid', r.kind === 'refund' ? 'Refunded' : 'Paid') },
    ], rows, { empty: 'No payments yet.' }));
  }

  // ---------- shell and routing ----------
  // Labels follow vendor-dashboard.html: Overview, Products, Chats and orders, Events, Booth and payments, QR check-in.
  const sections = () => [
    { items: [
      { label: 'Overview', href: '#/', match: (x) => x === '' || x === '#' || x === '#/' },
      { label: 'Products', href: '#/marketplace' },
      { label: 'Chats and orders', href: '#/messages', match: (x) => x.startsWith('#/messages'), count: unreadCount || null },
      { label: 'Events', href: '#/markets', match: (x) => x.startsWith('#/markets') },
      { label: 'Booth and payments', href: '#/applications', match: (x) => x.startsWith('#/applications') && !x.includes('/qr') },
      { label: 'QR check-in', href: '#/qr' },
    ] },
    { title: 'Account', items: [
      { label: 'My businesses', href: '#/businesses' },
      { label: 'Notifications', href: '#/notifications', count: unreadBell || null },
      { label: 'Receipts', href: '#/receipts' },
      { label: 'Resources', href: '#/resources' },
    ] },
  ];
  let unreadBell = 0;
  let unreadCount = 0;

  const routes = [
    [/^#?\/?$/, () => dashboard()],
    [/^#\/qr\/?$/, () => qrPage()],
    [/^#\/markets\/?$/, () => markets()],
    [/^#\/applications\/?$/, () => applications()],
    [/^#\/applications\/(\d+)$/, (m) => applicationDetail(m[1])],
    [/^#\/marketplace\/?$/, () => marketplace()],
    [/^#\/messages\/?$/, () => messages()],
    [/^#\/messages\/(\d+)$/, (m) => chatThread(m[1])],
    [/^#\/notifications\/?$/, () => notifications()],
    [/^#\/businesses\/?$/, () => businessesPage()],
    [/^#\/resources\/?$/, () => resources()],
    [/^#\/receipts\/?$/, () => receipts()],
  ];

  let renderRoute = null;
  function router_() { if (renderRoute) renderRoute(); }

  async function boot() {
    try {
      const r = await api('/auth/me');
      if (!r.user || !(r.user.roles || []).includes('vendor')) {
        location.replace('/app/login.html?as=vendor&next=' + encodeURIComponent('/app/vendor.html'));
        return;
      }
      me = r.user;
    } catch {
      location.replace('/app/login.html?as=vendor');
      return;
    }
    businesses = await api('/vendor/businesses').catch(() => []);
    try { selectedBiz = Number(sessionStorage.getItem(BIZ_KEY)) || null; } catch { selectedBiz = null; }
    if (selectedBiz && !businesses.some((b) => b.id === selectedBiz)) selectedBiz = null;
    unreadCount = (await api('/vendor/dashboard').catch(() => ({ unread_messages: 0 }))).unread_messages;
    unreadBell = (await api('/vendor/notifications').catch(() => ({ unread: 0 }))).unread;

    // VEN-07: on phones, say the portal is best on a computer or tablet. The vendor can still continue.
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('nmd-desktop-note') === '1'; } catch { /* ignore */ }
    if (window.matchMedia('(max-width: 600px)').matches && !dismissed) {
      const note = h('div', { class: 'alert info', role: 'status', style: 'margin:12px' },
        'This portal is best viewed on a computer or tablet. You can still continue on your phone. ',
        h('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => { note.remove(); try { sessionStorage.setItem('nmd-desktop-note', '1'); } catch { /* ignore */ } } }, 'Dismiss'));
      document.body.insertBefore(note, document.body.firstChild);
    }
    const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    const build = () => shell({ brand: 'Vendor', sections: sections(), user: me, onSignOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/app/login.html?as=vendor';
    } });
    const side = build();
    root.replaceChildren(side.root);
    const outlet = side.main;
    renderRoute = window.UI.router(outlet, routes, '#/');
    // Live: unread chats and notifications update the sidebar every 30 seconds without a page reload.
    window.UI.poll(async () => {
      unreadCount = (await api('/vendor/dashboard').catch(() => ({ unread_messages: unreadCount }))).unread_messages;
      unreadBell = (await api('/vendor/notifications').catch(() => ({ unread: unreadBell }))).unread;
      const fresh = build().root.querySelector('.side');
      const old = root.querySelector('.side');
      if (old) old.replaceWith(fresh);
    }, 30000);
  }
  boot();
})();
