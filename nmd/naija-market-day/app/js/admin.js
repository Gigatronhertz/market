/* Admin workspace (desktop first). Part 1: dashboard, markets, applications, waitlist, booths, payments,
   directory, marketplace. Part 2 (below) adds messaging, banners, content, users, settings. */
(function () {
  'use strict';
  const { h, api, money, fmtDate, fmtDateTime, timeAgo, badge, toast, alertBox, table, formFields, onSubmit, router, shell, modal, askText, confirmAction, readForm } = window.UI;
  const root = document.getElementById('root');
  let me = null;
  let renderRoute = null;
  const go = () => renderRoute && renderRoute();
  const todayStr = () => new Date().toISOString().slice(0, 10);

  // Download a CSV through the session cookie (a plain link, so the browser saves the file).
  function csvLink(path, label) {
    return h('a', { class: 'btn ghost small-btn', href: '/api' + path, download: '' }, label || 'Download CSV');
  }
  function kv(pairs) {
    return h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  }
  function section(title, ...kids) {
    return h('section', { class: 'card stack' }, h('h2', null, title), ...kids);
  }
  // Simple CSS bar chart (no external chart library).
  function bars(items, { valueKey = 'value', labelKey = 'label', alt = null } = {}) {
    const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
    return h('div', null,
      h('div', { class: 'bars', role: 'img', 'aria-label': 'Bar chart' }, items.map((i) => h('div', { class: 'col' },
        h('div', { class: 'val' }, String(i[valueKey] ?? 0)),
        h('div', { class: 'fill', style: `height:${Math.round(((Number(i[valueKey]) || 0) / max) * 100)}%`, title: `${i[labelKey]}: ${i[valueKey]}` }),
        h('div', { class: 'lbl', title: i[labelKey] }, String(i[labelKey] || ''))))),
      alt ? h('div', { class: 'legend' }, h('span', null, h('i', null), 'Registered / value'), h('span', null, h('i', { class: 'alt' }), alt)) : null);
  }

  // ---------- dashboard (ADM-01 to ADM-05) ----------
  async function dashboard(params = {}) {
    const f = { city: params.city || '', market_id: params.market_id || '', from: params.from || '', to: params.to || '' };
    const markets = await api('/admin/markets');
    const cities = [...new Set(markets.map((m) => m.city))];
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const d = await api('/admin/dashboard' + (qs ? '?' + qs : ''));
    const filterForm = h('form', { class: 'card inline', 'aria-label': 'Dashboard filters', onsubmit: (e) => {
      e.preventDefault();
      const r = readForm(e.target);
      location.hash = '#/dashboard?' + new URLSearchParams(Object.entries(r).filter(([, v]) => v)).toString();
    } },
      h('div', null, h('label', null, 'City'), h('select', { name: 'city' }, h('option', { value: '' }, 'All cities'), cities.map((c) => h('option', { value: c, selected: c === f.city }, c)))),
      h('div', null, h('label', null, 'Market'), h('select', { name: 'market_id' }, h('option', { value: '' }, 'All markets'), markets.map((m) => h('option', { value: m.id, selected: String(m.id) === String(f.market_id) }, m.name)))),
      h('div', null, h('label', null, 'From'), h('input', { type: 'date', name: 'from', value: f.from })),
      h('div', null, h('label', null, 'To'), h('input', { type: 'date', name: 'to', value: f.to })),
      h('button', { class: 'btn', type: 'submit' }, 'Apply filters'),
      csvLink('/admin/dashboard.csv?' + qs, 'Download figures'));
    const c = d.cards;
    const cardsRow = h('div', { class: 'grid grid-4' }, [
      ['Upcoming markets', c.upcoming_markets], ['Applications awaiting review', c.applications_awaiting_review],
      ['Booths sold / available', `${c.booths_sold} / ${c.booths_available}`], ['Guest registrations', c.guest_registrations],
      ['Booth fees received', money(c.booth_fees_cents)], ['Active Marketplace subscriptions', c.active_marketplace_subscriptions],
    ].map(([l, n]) => h('div', { class: 'card kpi' }, h('div', { class: 'n' }, String(n)), h('div', { class: 'l' }, l))));
    const att = d.attendance.per_market.map((r) => ({ label: r.market, registered: r.registered, attended: r.attended, walkins: r.walkins }));
    return h('div', { class: 'stack' },
      h('h1', null, 'Dashboard'),
      filterForm,
      cardsRow,
      section('Attendance per market', att.length ? bars(att.map((r) => ({ label: r.label, value: r.attended })), { alt: 'Attended' }) : h('p', { class: 'muted' }, 'No markets in this filter.'),
        table([
          { label: 'Market', render: (r) => r.market }, { label: 'Date', render: (r) => fmtDate(r.date) }, { label: 'City', render: (r) => r.city },
          { label: 'Registered', render: (r) => r.registered }, { label: 'Walk-ins', render: (r) => r.walkins }, { label: 'Attended', render: (r) => r.attended },
        ], d.attendance.per_market, { empty: '' })),
      h('div', { class: 'grid grid-2' },
        section('Attendance by city', d.attendance.by_city.length ? bars(d.attendance.by_city.map((r) => ({ label: r.city, value: r.attended }))) : h('p', { class: 'muted' }, 'No check-ins yet.')),
        section('Attendance trend across the season', d.attendance.trend.length ? bars(d.attendance.trend.map((r) => ({ label: fmtDate(r.date), value: r.attended }))) : h('p', { class: 'muted' }, 'No data.'))),
      h('div', { class: 'grid grid-2' },
        section('Vendors by status', table([{ label: 'Status', render: (r) => badge(r.status) }, { label: 'Count', render: (r) => String(r.n) }], d.vendors.by_status, { empty: 'No applications yet.' })),
        section('Approved vendors by category', table([{ label: 'Category', render: (r) => r.category }, { label: 'Count', render: (r) => String(r.n) }], d.vendors.by_category, { empty: 'No approved vendors yet.' }))),
      h('div', { class: 'grid grid-2' },
        section('Booths sold by tier', table([{ label: 'Tier', render: (r) => r.tier }, { label: 'Sold', render: (r) => String(r.n) }], d.vendors.booths_by_tier, { empty: 'No booths sold yet.' })),
        section('New compared with returning vendors', kv([['New', String(d.vendors.new_vs_returning.new)], ['Returning', String(d.vendors.new_vs_returning.returning)]]))),
      h('div', { class: 'grid grid-2' },
        section('Vendor no-shows per market', table([{ label: 'Market', render: (r) => r.market }, { label: 'No-shows', render: (r) => String(r.count) }], d.vendors.no_shows, { empty: '' })),
        section('Booth fees received per market', table([{ label: 'Market', render: (r) => r.market }, { label: 'Amount', render: (r) => money(r.amount_cents) }], d.vendors.fees_by_market, { empty: '' }))),
      h('div', { class: 'grid grid-2' },
        section('Marketplace', kv([['Active subscriptions', String(d.marketplace.active)], ['New in last 30 days', String(d.marketplace.new_last_30_days)], ['Lapsed', String(d.marketplace.lapsed)], ['Listings', String(d.marketplace.listings)], ['Buyer chats started', String(d.marketplace.chats_started)]])),
        section('Most viewed listings', table([{ label: 'Listing', render: (r) => r.name }, { label: 'Views', render: (r) => String(r.views) }], d.marketplace.top_listings, { empty: 'No views yet.' }))));
  }

  // ---------- markets (ADM-06 to ADM-15) ----------
  async function marketsList() {
    const rows = await api('/admin/markets');
    const create = h('button', { class: 'btn', onclick: () => marketForm(null) }, 'New market');
    return h('div', { class: 'stack' },
      h('div', { class: 'spread' }, h('h1', null, 'Markets'), create),
      table([
        { label: 'Market', render: (m) => h('a', { href: '#/markets/' + m.id }, m.name) },
        { label: 'City', render: (m) => m.city }, { label: 'Date', render: (m) => fmtDate(m.date) },
        { label: 'Status', render: (m) => badge(m.effective_status) },
        { label: 'Guests', render: (m) => m.guest_capacity ? `${m.guests_registered} / ${m.guest_capacity}` : String(m.guests_registered) },
        { label: 'Vendors', render: (m) => m.vendor_capacity ? `${m.vendor_applications} / ${m.vendor_capacity}` : String(m.vendor_applications) },
      ], rows, { empty: 'No markets yet. Create the first one.' }));
  }

  function marketForm(m) {
    const f = h('form', null, formFields([
      { name: 'name', label: 'Market name', required: true, value: m ? m.name : '' },
      { name: 'city', label: 'City', required: true, value: m ? m.city : '' },
      { name: 'venue', label: 'Venue', value: m ? m.venue : '' },
      { name: 'season', label: 'Season', value: m ? m.season : '' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: m ? m.date : '' },
      { name: 'start_time', label: 'Start time', type: 'time', value: m ? m.start_time : '' },
      { name: 'end_time', label: 'End time', type: 'time', value: m ? m.end_time : '' },
      { name: 'guest_capacity', label: 'Guest capacity (0 = no limit)', type: 'number', min: 0, value: m ? m.guest_capacity : 0 },
      { name: 'vendor_capacity', label: 'Vendor capacity (0 = no limit)', type: 'number', min: 0, value: m ? m.vendor_capacity : 0 },
      { name: 'app_opens_on', label: 'Applications open', type: 'date', value: m && m.app_opens_on ? m.app_opens_on : '' },
      { name: 'app_closes_on', label: 'Applications close', type: 'date', value: m && m.app_closes_on ? m.app_closes_on : '' },
      { name: 'description', label: 'Description', type: 'textarea', value: m ? m.description : '' },
      { name: 'terms', label: 'Event terms (vendors accept these before paying, including the no-refund policy)', type: 'textarea', rows: 6, value: m ? m.terms : '' },
    ]), h('button', { class: 'btn', type: 'submit' }, m ? 'Save market' : 'Create market'));
    const mod = modal(m ? 'Edit market' : 'New market', f, []);
    onSubmit(f, async (v) => {
      const body = { ...v };
      Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
      if (m) await api('/admin/markets/' + m.id, { method: 'PUT', body });
      else await api('/admin/markets', { method: 'POST', body });
      mod.close();
      go();
      return 'Saved';
    }, { success: (x) => x });
  }

  async function marketDetail(id) {
    const m = await api('/admin/markets/' + id);
    const [guests, staff, attendance, report, apps] = await Promise.all([
      api('/admin/markets/' + id + '/guests'),
      api('/admin/markets/' + id + '/staff'),
      api('/admin/markets/' + id + '/attendance'),
      api('/admin/markets/' + id + '/report'),
      api('/admin/applications?market_id=' + id),
    ]);
    const actions = h('div', { class: 'row' },
      h('button', { class: 'btn ghost small-btn', onclick: () => marketForm(m) }, 'Edit details'),
      m.effective_status === 'draft' ? h('button', { class: 'btn small-btn', onclick: () => setStatus(id, 'publish') }, 'Publish') : null,
      m.status === 'published' ? h('button', { class: 'btn ghost small-btn', onclick: () => setStatus(id, 'unpublish') }, 'Unpublish') : null,
      m.status === 'published' && m.effective_status !== 'past' ? h('button', { class: 'btn danger small-btn', onclick: () => setStatus(id, 'close') }, 'Close market') : null,
      h('button', { class: 'btn ghost small-btn', onclick: async () => {
        await api('/admin/markets/' + id + '/send-directory', { method: 'POST' }).then((r) => toast(`Directory sent to ${r.sent} guests`)).catch((e) => toast(e.message, true));
      } }, 'Email directory to guests'));
    const reportBlock = kv([
      ['Registrations', String(report.registrations)], ['Actual attendance', String(report.attended)], ['Walk-ins', String(report.walkins)],
      ['Vendor no-shows', String(report.vendor_no_shows)], ['Booths sold', String(report.booths_sold)], ['Booth fees received', money(report.booth_fees_cents)],
    ]);
    const booths = markets_booths(m);
    return h('div', { class: 'stack' },
      h('p', null, h('a', { href: '#/markets' }, '← Markets')),
      h('div', { class: 'spread' }, h('div', null, h('h1', null, m.name), h('div', { class: 'muted' }, `${m.city} · ${fmtDate(m.date)}${m.venue ? ' · ' + m.venue : ''}`)), h('div', null, badge(m.effective_status))),
      actions,
      section('Floor plan', m.floor_plan_url ? h('img', { src: m.floor_plan_url, alt: 'Floor plan', class: 'thumb', style: 'max-width:640px' }) : h('p', { class: 'muted' }, 'No floor plan yet. Upload the numbered image from your design.'),
        uploadFloorPlan(m)),
      section('Booths', booths),
      section('Applications and attendance', table([
        { label: 'Business', render: (a) => h('a', { href: '#/applications/' + a.id }, a.business || a.owner_email) },
        { label: 'Booth', render: (a) => a.booth || '—' }, { label: 'Status', render: (a) => badge(a.status) },
        { label: 'Attendance', render: (a) => badge(a.attendance) },
        { label: 'Attendance change', render: (a) => attendanceSelect(a) },
      ], attendance, { empty: 'No approved vendors yet.' })),
      section('Guests', h('div', { class: 'row' }, csvLink('/admin/markets/' + id + '/guests.csv', 'Download guest list'), h('span', { class: 'muted small' }, `${guests.length} guests on file`)),
        walkinForm(m),
        table([
          { label: 'Name', render: (g) => g.name }, { label: 'Email', render: (g) => g.email }, { label: 'Source', render: (g) => g.source === 'walkin' ? 'Walk-in' : 'Online' },
          { label: 'People', render: (g) => String(g.guests_count) }, { label: 'Attended', render: (g) => g.checked_in ? badge('checked_in') : badge('not_arrived') },
        ], guests, { empty: 'No guests yet.' })),
      section('Report', reportBlock, h('div', { class: 'row' }, csvLink('/admin/markets/' + id + '/report.csv', 'Download report'))),
      section('Check-in staff', staffBlock(m, staff)));
  }

  function markets_booths(m) {
    const wrap = h('div', { class: 'stack' });
    const draw = async () => {
      const bs = await api('/admin/markets/' + m.id).then((x) => x.booths);
      wrap.replaceChildren(
        h('div', { class: 'table-wrap' }, table([
          { label: 'Booth', render: (b) => b.number }, { label: 'Tier', render: (b) => b.tier }, { label: 'Type', render: (b) => b.type },
          { label: 'Price', render: (b) => money(b.price_cents) }, { label: 'Status', render: (b) => badge(b.status) },
          { label: 'Vendor', render: (b) => b.assigned_application_id ? h('a', { href: '#/applications/' + b.assigned_application_id }, 'View application') : '' },
          { label: '', render: (b) => h('div', { class: 'row' }, b.assigned_application_id ? null : h('button', { class: 'btn ghost small-btn', onclick: async () => {
            try { await api('/admin/booths/' + b.id + '/reserve', { method: 'POST', body: { reserved: !b.reserved, note: 'Reserved by admin' } }); toast(b.reserved ? 'Released' : 'Reserved'); draw(); } catch (e) { toast(e.message, true); }
          } }, b.reserved ? 'Release' : 'Reserve')) },
        ], bs, { empty: 'No booths yet.' })),
        addBoothForm(m, draw));
    };
    draw();
    return wrap;
  }

  function addBoothForm(m, after) {
    const f = h('form', { class: 'card' }, h('h3', null, 'Add booths by number range'), h('p', { class: 'small muted' }, 'Example: 1 to 10 as VIP, or 11 to 20 as Standard.'),
      h('form', { class: 'inline' }),
      formFields([
        { name: 'prefix', label: 'Prefix (optional)', value: '' },
        { name: 'from', label: 'From', type: 'number', min: 1, required: true, value: 1 },
        { name: 'to', label: 'To', type: 'number', min: 1, required: true, value: 10 },
        { name: 'tier', label: 'Tier', required: true, value: 'VIP' },
        { name: 'type', label: 'Type', type: 'select', options: [['standard', 'Standard'], ['food', 'Food']], value: 'standard' },
        { name: 'price', label: 'Price', type: 'number', step: '0.01', min: 0, required: true, value: 300 },
      ]), h('button', { class: 'btn', type: 'submit' }, 'Add booths'));
    onSubmit(f, async (v) => { await api('/admin/markets/' + m.id + '/booths', { method: 'POST', body: v }); after(); return 'Booths added'; }, { success: (x) => x });
    return f;
  }

  function uploadFloorPlan(m) {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', 'aria-label': 'Floor plan image' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast('That image is over 8 MB', true);
      const data_url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      try { await api('/admin/markets/' + m.id + '/floor-plan', { method: 'POST', body: { data_url } }); toast('Floor plan saved'); go(); } catch (e) { toast(e.message, true); }
    });
    return h('div', { class: 'field' }, file);
  }

  function walkinForm(m) {
    const f = h('form', { class: 'card' }, h('h3', null, 'Add a walk-in guest'),
      formFields([{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'guests_count', label: 'People', type: 'number', min: 1, value: 1 }]),
      h('button', { class: 'btn', type: 'submit' }, 'Add walk-in'));
    onSubmit(f, async (v) => { await api('/admin/markets/' + m.id + '/walkin', { method: 'POST', body: v }); go(); return 'Walk-in added'; }, { success: (x) => x, reset: true });
    return f;
  }

  function attendanceSelect(a) {
    const sel = h('select', { 'aria-label': 'Set attendance', style: 'min-width:150px' },
      [['not_arrived', 'Not arrived'], ['checked_in', 'Checked in'], ['checked_out', 'Checked out'], ['no_show', 'No show']].map(([v, l]) => h('option', { value: v, selected: v === a.attendance }, l)));
    sel.addEventListener('change', async () => {
      const reason = await askText('Change attendance', 'Why are you changing this? It is recorded with your name and the time.', { required: false, button: 'Save change' });
      if (reason === null) { sel.value = a.attendance; return; }
      try { await api('/admin/applications/' + a.id + '/attendance', { method: 'POST', body: { status: sel.value, reason } }); toast('Attendance updated'); go(); } catch (e) { toast(e.message, true); }
    });
    return sel;
  }

  function staffBlock(m, staff) {
    return h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, staff.length ? 'Assigned: ' + staff.map((s) => s.name || s.email).join(', ') : 'No check-in staff assigned to this market yet.'),
      h('p', { class: 'small muted' }, 'Assign staff from User management. Staff only see the markets they are assigned to.'));
  }

  async function setStatus(id, action) {
    const messages = { publish: 'Publish this market? It appears on the website and opens applications and guest registration.', unpublish: 'Unpublish? It will be hidden from the website.', close: 'Close this market? New applications and registrations stop. History stays.' };
    if (!(await confirmAction(messages[action]))) return;
    try { await api('/admin/markets/' + id + '/' + action, { method: 'POST' }); toast('Done'); go(); } catch (e) { toast(e.message, true); }
  }

  // ---------- applications (ADM-16 to ADM-23) ----------
  async function applicationsList(params = {}) {
    const markets = await api('/admin/markets');
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const rows = await api('/admin/applications' + (qs ? '?' + qs : ''));
    const filter = h('form', { class: 'card inline', onsubmit: (e) => { e.preventDefault(); const r = readForm(e.target); location.hash = '#/applications?' + new URLSearchParams(Object.entries(r).filter(([, v]) => v)).toString(); } },
      h('div', null, h('label', null, 'Market'), h('select', { name: 'market_id' }, h('option', { value: '' }, 'All'), markets.map((m) => h('option', { value: m.id, selected: String(m.id) === String(params.market_id || '') }, m.name)))),
      h('div', null, h('label', null, 'Status'), h('select', { name: 'status' }, h('option', { value: '' }, 'All'), ['draft', 'waitlisted', 'offered', 'under_review', 'more_info', 'approved', 'declined'].map((s) => h('option', { value: s, selected: params.status === s }, s.replace(/_/g, ' '))))),
      h('div', null, h('label', null, 'Category'), h('select', { name: 'category' }, h('option', { value: '' }, 'All'), ['sponsors', 'corporate', 'premium', 'general'].map((s) => h('option', { value: s, selected: params.category === s }, s)))),
      h('div', null, h('label', null, 'Payment'), h('select', { name: 'payment' }, h('option', { value: '' }, 'All'), ['paid', 'unpaid', 'refunded', 'failed'].map((s) => h('option', { value: s, selected: params.payment === s }, s)))),
      h('button', { class: 'btn', type: 'submit' }, 'Filter'),
      h('a', { class: 'btn ghost', href: '#/applications/unfinished' }, 'Unfinished applications'));
    return h('div', { class: 'stack' },
      h('h1', null, 'Applications'),
      filter,
      table([
        { label: 'Business', render: (a) => h('a', { href: '#/applications/' + a.id }, a.business || a.owner_email) },
        { label: 'Market', render: (a) => a.market_name }, { label: 'Category', render: (a) => a.category || '—' },
        { label: 'Booth', render: (a) => a.booth || '—' }, { label: 'Payment', render: (a) => badge(a.payment_status) },
        { label: 'Status', render: (a) => badge(a.status) }, { label: 'Submitted', render: (a) => a.submitted_at ? fmtDate(a.submitted_at) : 'Not yet' },
      ], rows, { empty: 'No applications match these filters.' }));
  }

  async function unfinishedList() {
    const markets = await api('/admin/markets');
    const rows = await api('/admin/applications/unfinished');
    const remindAll = h('button', { class: 'btn', onclick: async () => {
      if (!(await confirmAction(`Send a reminder to all ${rows.length} people who have not finished?`))) return;
      try { const r = await api('/admin/applications/unfinished/remind', { method: 'POST', body: {} }); toast(`Sent ${r.sent} reminders`); go(); } catch (e) { toast(e.message, true); }
    } }, 'Remind everyone');
    return h('div', { class: 'stack' },
      h('p', null, h('a', { href: '#/applications' }, '← Applications')),
      h('div', { class: 'spread' }, h('h1', null, 'Unfinished applications'), remindAll),
      h('p', { class: 'muted small' }, 'Reminders also go out automatically on the schedule set in Settings.'),
      table([
        { label: 'Email', render: (r) => r.owner_email }, { label: 'Business', render: (r) => r.business || '—' }, { label: 'Market', render: (r) => r.market },
        { label: 'Last step', render: (r) => r.last_step }, { label: 'Started', render: (r) => fmtDate(r.date_started) }, { label: 'Reminders sent', render: (r) => String(r.reminders_sent) },
        { label: '', render: (r) => h('button', { class: 'btn ghost small-btn', onclick: async () => {
          try { await api('/admin/applications/unfinished/remind', { method: 'POST', body: { ids: [r.id] } }); toast('Reminder sent'); go(); } catch (e) { toast(e.message, true); }
        } }, 'Remind') },
      ], rows, { empty: 'Everyone who started has finished.' }));
  }

  async function applicationDetail(id) {
    const a = await api('/admin/applications/' + id);
    const note = h('textarea', { rows: 2, 'aria-label': 'Internal note (vendors cannot see this)', placeholder: 'Internal note. Vendors cannot see this.' });
    const actions = h('div', { class: 'row' },
      ['under_review', 'more_info'].includes(a.status) && a.payment_status === 'paid' ? h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmAction('Approve this vendor? They get their booth confirmation and QR code.'))) return;
        try { await api('/admin/applications/' + id + '/approve', { method: 'POST' }); toast('Approved'); go(); } catch (e) { toast(e.message, true); }
      } }, 'Approve') : null,
      a.payment_status === 'paid' && a.status !== 'declined' ? h('button', { class: 'btn ghost', onclick: async () => {
        const msg = await askText('Ask for more information', 'What do you need from the vendor? They receive this by email.');
        if (msg === null) return;
        try { await api('/admin/applications/' + id + '/more-info', { method: 'POST', body: { note: msg } }); toast('Request sent'); go(); } catch (e) { toast(e.message, true); }
      } }, 'Request more info') : null,
      a.payment_status === 'paid' && a.status !== 'declined' ? h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmAction('Decline this application and refund the booth fee automatically through Stripe? The booth is released.'))) return;
        try { await api('/admin/applications/' + id + '/decline', { method: 'POST' }); toast('Declined and refunded'); go(); } catch (e) { toast(e.message, true); }
      } }, 'Decline and refund') : null,
      a.payment_status === 'paid' && a.payments.some((p) => p.kind === 'booth_fee') && a.status !== 'declined' ? h('button', { class: 'btn ghost', onclick: async () => {
        const reason = await askText('Manual refund', 'Reason for the refund (kept on record)', { required: false, multiline: false });
        if (reason === null) return;
        if (!(await confirmAction('Refund the booth fee now? The vendor keeps their booth until you decline it.'))) return;
        try { await api('/admin/applications/' + id + '/refund', { method: 'POST', body: { note: reason } }); toast('Refund made'); go(); } catch (e) { toast(e.message, true); }
      } }, 'Refund only') : null);
    const moveSel = h('select', { 'aria-label': 'Move to booth' }, h('option', { value: '' }, 'Choose a free booth…'));
    if (a.payment_status === 'paid' && a.booth) {
      api('/admin/booths?market_id=' + a.market_id).then((bs) => {
        bs.filter((b) => b.status === 'available').forEach((b) => moveSel.appendChild(h('option', { value: b.id }, `${b.number} · ${b.tier}`)));
      });
    }
    const moveBtn = h('button', { class: 'btn ghost small-btn', onclick: async () => {
      if (!moveSel.value) return;
      try { await api('/admin/applications/' + id + '/move', { method: 'POST', body: { booth_id: Number(moveSel.value) } }); toast('Booth moved'); go(); } catch (e) { toast(e.message, true); }
    } }, 'Move vendor');
    return h('div', { class: 'stack' },
      h('p', null, h('a', { href: '#/applications' }, '← Applications')),
      h('div', { class: 'spread' }, h('h1', null, a.business ? a.business.name : a.owner_email), h('div', null, badge(a.status), ' ', badge(a.payment_status))),
      a.status === 'more_info' ? alertBox('Waiting for the vendor: ' + a.more_info_note, 'warn') : null,
      a.category === 'premium' || a.category === 'general' ? (a.answers && (a.answers.is_food === true) ? alertBox('Food vendor: check the city certificate and menu before you approve.', 'warn') : null) : null,
      h('div', { class: 'grid grid-2', style: 'align-items:start' },
        section('Vendor', kv([
          ['Email', a.owner_email], ['Contact', a.business ? a.business.contact_person : ''], ['Phone', a.business ? a.business.phone : ''],
          ['City', a.business ? a.business.city : ''], ['Category', a.category_label || a.category || ''], ['Website', a.business ? a.business.website : ''],
          ['Terms accepted', a.terms_accepted ? 'Yes' : 'No'], ['Submitted', a.submitted_at ? fmtDateTime(a.submitted_at) : 'Not yet'],
        ]), a.business && a.business.description ? h('p', null, a.business.description) : null),
        section('Market and booth', kv([
          ['Market', a.market ? a.market.name : ''], ['Date', a.market ? fmtDate(a.market.date) : ''],
          ['Booth', a.booth ? `${a.booth.number} (${a.booth.tier}) · ${money(a.booth.price_cents)}` : 'None'],
          ['Attendance', a.attendance || ''],
        ]), h('div', { class: 'row' }, moveSel, moveBtn))),
      section('Form answers', kv(Object.entries(a.answers || {}).map(([k, v]) => [k.replace(/_/g, ' '), String(v)]))),
      section('Documents', a.documents && a.documents.length ? table([
        { label: 'Document', render: (d) => d.filename }, { label: 'Kind', render: (d) => d.kind }, { label: 'Expires', render: (d) => d.expires_on || '—' },
      ], a.documents) : h('p', { class: 'muted' }, 'No documents uploaded.')),
      section('Decision', actions),
      section('Payments', table([{ label: 'When', render: (p) => fmtDateTime(p.created_at) }, { label: 'Kind', render: (p) => p.kind }, { label: 'Amount', render: (p) => money(p.amount_cents) }, { label: 'Status', render: (p) => badge(p.status) }, { label: 'Note', render: (p) => p.note || '' }], a.payments, { empty: 'No payments.' })),
      section('Internal notes', h('div', { class: 'stack' }, a.notes.map((n) => h('div', { class: 'card tint' }, h('div', { class: 'small muted' }, (n.author || 'Admin') + ' · ' + fmtDateTime(n.created_at)), h('div', { style: 'white-space:pre-wrap' }, n.body))),
        h('form', { onsubmit: null }, h('div', { class: 'field' }, note), h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          if (!note.value.trim()) return;
          try { await api('/admin/applications/' + id + '/notes', { method: 'POST', body: { body: note.value } }); go(); } catch (e) { toast(e.message, true); }
        } }, 'Add note')))));
  }

  // ---------- waitlist and booths (ADM-24, ADM-26) ----------
  async function waitlist() {
    const rows = await api('/admin/waitlist');
    return h('div', { class: 'stack' }, h('h1', null, 'Booths and waitlist'),
      table([
        { label: 'Vendor', render: (w) => w.business_name || w.owner_email }, { label: 'Market', render: (w) => w.market_name }, { label: 'Tier wanted', render: (w) => w.tier },
        { label: 'Joined', render: (w) => fmtDate(w.created_at) }, { label: 'Status', render: (w) => badge(w.status, w.status === 'offered' ? 'Offered' : 'Waiting') },
        { label: '', render: (w) => w.status === 'waiting' ? h('button', { class: 'btn ghost small-btn', onclick: async () => {
          const bs = await api('/admin/booths?market_id=' + w.market_id);
          const free = bs.filter((b) => b.status === 'available' && b.tier === w.tier);
          if (!free.length) return toast('No free booth in ' + w.tier + ' right now.', true);
          const sel = h('select', null, free.map((b) => h('option', { value: b.id }, `${b.number} · ${money(b.price_cents)}`)));
          modal('Offer a booth', h('div', null, h('p', null, 'The vendor gets 48 hours to accept the terms and pay.'), h('label', null, 'Booth'), sel), [
            (close) => h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
            (close) => h('button', { class: 'btn', onclick: async () => {
              try { await api('/admin/waitlist/' + w.id + '/offer', { method: 'POST', body: { booth_id: Number(sel.value) } }); close(); toast('Offer sent'); go(); } catch (e) { toast(e.message, true); }
            } }, 'Send offer'),
          ]);
        } }, 'Offer booth') : null },
      ], rows, { empty: 'No one is waiting.' }));
  }

  // Booth overview across markets (ADM-24)
  async function boothsOverview() {
    const markets = await api('/admin/markets');
    return h('div', { class: 'stack' }, h('h1', null, 'Booth overview'),
      h('p', { class: 'muted small' }, 'Open a market to reserve booths, move vendors and set prices.'),
      table([
        { label: 'Market', render: (m) => h('a', { href: '#/markets/' + m.id }, m.name) }, { label: 'Date', render: (m) => fmtDate(m.date) },
        { label: 'Booths', render: (m) => String(m.booths_count ?? '') },
      ], markets, { empty: 'No markets yet.' }));
  }

  // ---------- payments (ADM-36, ADM-37) ----------
  async function payments() {
    const rows = await api('/admin/payments');
    const total = rows.filter((p) => p.kind === 'booth_fee' && p.status === 'succeeded').reduce((s, p) => s + p.amount_cents, 0);
    const refunds = rows.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount_cents, 0);
    return h('div', { class: 'stack' }, h('h1', null, 'Payments'),
      h('div', { class: 'grid grid-3' }, [['Booth fees received', money(total)], ['Refunded', money(refunds)], ['Net', money(total - refunds)]].map(([l, n]) => h('div', { class: 'card kpi' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l)))),
      table([
        { label: 'When', render: (p) => fmtDateTime(p.created_at) }, { label: 'Market', render: (p) => p.market_name || '' }, { label: 'Vendor', render: (p) => p.business || '' },
        { label: 'Booth', render: (p) => p.booth || '' }, { label: 'Type', render: (p) => p.kind === 'refund' ? 'Refund' : 'Booth fee' }, { label: 'Amount', render: (p) => money(p.amount_cents) },
        { label: 'Status', render: (p) => badge(p.status) }, { label: 'Provider', render: (p) => p.provider + (p.provider_ref ? ' · ' + p.provider_ref : '') },
      ], rows, { empty: 'No payments yet.' }));
  }

  // ---------- directory (ADM-38, ADM-39) ----------
  async function directoryAdmin(marketId) {
    const markets = await api('/admin/markets');
    const mid = marketId || (markets[0] && markets[0].id);
    if (!mid) return h('p', { class: 'muted' }, 'Create a market first.');
    const rows = await api('/admin/directory?market_id=' + mid);
    return h('div', { class: 'stack' }, h('h1', null, 'Directory'),
      h('p', { class: 'muted small' }, 'The directory builds itself from approved vendors. Hide an entry here if it should not show publicly.'),
      h('form', { class: 'card inline', onsubmit: (e) => { e.preventDefault(); location.hash = '#/directory/' + readForm(e.target).market_id; } },
        h('select', { name: 'market_id' }, markets.map((m) => h('option', { value: m.id, selected: String(m.id) === String(mid) }, m.name + ' · ' + m.city))),
        h('button', { class: 'btn', type: 'submit' }, 'Show market')),
      table([
        { label: 'Business', render: (r) => r.business || r.owner_email }, { label: 'Booth', render: (r) => r.booth || '' }, { label: 'Category', render: (r) => r.category || '' },
        { label: 'Visibility', render: (r) => badge(r.hidden_from_directory ? 'Hidden' : 'Listed', r.hidden_from_directory ? 'bad' : 'ok') },
        { label: '', render: (r) => h('button', { class: 'btn ghost small-btn', onclick: async () => {
          try { await api('/admin/applications/' + r.id + '/directory', { method: 'POST', body: { hidden: !r.hidden_from_directory } }); go(); } catch (e) { toast(e.message, true); }
        } }, r.hidden_from_directory ? 'Show' : 'Hide') },
      ], rows, { empty: 'No approved vendors for this market yet.' }));
  }

  // ---------- marketplace (ADM-41 to ADM-44) ----------
  async function marketplaceAdmin() {
    const [subs, plans, listings] = await Promise.all([api('/admin/subscriptions'), api('/settings/public').then((s) => s.plans), api('/admin/listings')]);
    return h('div', { class: 'stack' }, h('h1', null, 'Marketplace'),
      section('Subscriptions', table([
        { label: 'Business', render: (s) => s.business }, { label: 'Vendor', render: (s) => s.vendor_email }, { label: 'Plan', render: (s) => s.plan_code },
        { label: 'Status', render: (s) => badge(s.status) }, { label: 'Renewal', render: (s) => fmtDate(s.renews_at) },
      ], subs, { empty: 'No subscriptions yet. Plans start automatically when a vendor subscribes.' })),
      section('Plans (prices are set here)', h('div', { class: 'grid grid-2' }, plans.map((p) => planForm(p)))),
      section('Listings', table([
        { label: 'Listing', render: (l) => l.name }, { label: 'Vendor', render: (l) => l.vendor }, { label: 'Price', render: (l) => money(l.price_cents) },
        { label: 'Views', render: (l) => String(l.views) }, { label: 'Visibility', render: (l) => badge(l.hidden ? 'Hidden' : 'Listed', l.hidden ? 'bad' : 'ok') },
        { label: '', render: (l) => h('button', { class: 'btn ghost small-btn', onclick: async () => {
          if (l.hidden) { try { await api('/admin/listings/' + l.id + '/hide', { method: 'POST', body: { hidden: false } }); go(); } catch (e) { toast(e.message, true); } return; }
          const reason = await askText('Hide this listing', 'Reason (the vendor is told)', { required: true, multiline: false });
          if (reason === null) return;
          try { await api('/admin/listings/' + l.id + '/hide', { method: 'POST', body: { hidden: true, reason } }); go(); } catch (e) { toast(e.message, true); }
        } }, l.hidden ? 'Show' : 'Hide') },
      ], listings, { empty: 'No listings yet.' })));
  }

  function planForm(p) {
    const f = h('form', { class: 'card' }, h('h3', null, p.name),
      formFields([{ name: 'price', label: 'Price', type: 'number', step: '0.01', min: 0, value: (p.price_cents / 100).toFixed(2) }, { name: 'free_days', label: 'Free starting period (days)', type: 'number', min: 0, value: p.free_days }]),
      h('button', { class: 'btn', type: 'submit' }, 'Save plan'));
    onSubmit(f, async (v) => { await api('/admin/plans/' + p.code, { method: 'PUT', body: v }); return 'Plan saved'; }, { success: (x) => x });
    return f;
  }

  // ---------- routing ----------
  const NAV = () => [
    { items: [
      { label: 'Dashboard', href: '#/dashboard', match: (x) => x.startsWith('#/dashboard') || x === '' || x === '#/' || x === '#' },
      { label: 'Markets', href: '#/markets', match: (x) => x.startsWith('#/markets') },
      { label: 'Applications', href: '#/applications', match: (x) => x.startsWith('#/applications') },
      { label: 'Waitlist and booths', href: '#/waitlist', match: (x) => x.startsWith('#/waitlist') || x.startsWith('#/booths') },
      { label: 'Payments', href: '#/payments' },
      { label: 'Directory', href: '#/directory', match: (x) => x.startsWith('#/directory') },
      { label: 'Marketplace', href: '#/marketplace' },
    ] },
    { title: 'Messaging and content', items: [
      { label: 'Messaging', href: '#/messaging', match: (x) => x.startsWith('#/messaging') },
      { label: 'Banner ads', href: '#/banners' },
      { label: 'Blog', href: '#/content/blog_posts' },
      { label: 'Community events', href: '#/events' },
      { label: 'Gallery', href: '#/content/gallery' },
      { label: 'Sponsors', href: '#/content/sponsors' },
      { label: 'Vendor resources', href: '#/content/resources' },
      { label: 'Inquiries', href: '#/inquiries' },
      { label: 'Subscribers', href: '#/subscribers' },
    ] },
    { title: 'Team and system', items: [
      { label: 'Users', href: '#/users', match: (x) => x.startsWith('#/users') },
      { label: 'Activity', href: '#/activity' },
      { label: 'Settings', href: '#/settings' },
    ] },
  ];

  // ---------- messaging (ADM-45 to ADM-49, ADM-46 templates) ----------
  async function messaging() {
    const [tpls, markets, out, settingsNow] = await Promise.all([api('/admin/messaging/templates'), api('/admin/markets'), api('/admin/outbox?limit=50'), api('/admin/settings')]);
    const tplTable = table([
      { label: 'Message', render: (t) => h('a', { href: '#/messaging/template/' + t.key }, t.name) },
      { label: 'Audience', render: (t) => t.audience },
      { label: 'When', render: (t) => t.trigger_type === 'before_market' ? `${t.offset_days} day before market` : t.trigger_type === 'after_market' ? 'After market' : t.trigger_type === 'manual' ? 'Manual' : 'On action' },
      { label: 'On', render: (t) => badge(t.active ? 'active' : 'lapsed', t.active ? 'On' : 'Off') },
    ], tpls);
    const bulk = bulkForm(markets);
    return h('div', { class: 'stack' }, h('h1', null, 'Messaging'),
      h('p', { class: 'muted small' }, 'Every automatic email is editable here. Variables such as {{first_name}} and {{market_name}} fill in automatically. Preview with a real market before you turn a message on.'),
      section('Automatic and standard messages', tplTable),
      section('Bulk email', bulk),
      section('SMS', h('div', { class: 'stack' }, alertBox(settingsNow.sms_enabled ? 'Bulk SMS is on.' : 'Bulk SMS is off. The client has not confirmed it for the first release (open question 8).', settingsNow.sms_enabled ? 'ok' : 'warn'),
        h('p', { class: 'small muted' }, 'Turn SMS on in Settings once confirmed. A text-message provider still needs to be connected.'))),
      section('Outbox (latest 50)', table([
        { label: 'When', render: (o) => fmtDateTime(o.created_at) }, { label: 'To', render: (o) => o.to_address }, { label: 'Channel', render: (o) => o.channel },
        { label: 'Subject', render: (o) => o.subject }, { label: 'Template', render: (o) => o.template_key || '' }, { label: 'Status', render: (o) => badge(o.status, o.status === 'logged' ? 'Logged' : o.status) },
      ], out, { empty: 'Nothing sent yet.' }),
        h('p', { class: 'small muted' }, 'Status "Logged" means the message is recorded here but not yet delivered. Connect an email sender to deliver it.')));
  }

  function bulkForm(markets) {
    const group = h('select', { name: 'group', 'aria-label': 'Who to send to' }, [
      ['guests', 'Guests of a market'], ['vendors', 'Vendors of a market'], ['no_shows', 'No-show vendors of a market'], ['subscribers', 'Newsletter subscribers'],
    ].map(([v, l]) => h('option', { value: v }, l)));
    const market = h('select', { name: 'market_id', 'aria-label': 'Market' }, h('option', { value: '' }, 'Choose a market (not needed for subscribers)'), markets.map((m) => h('option', { value: m.id }, m.name)));
    const channel = h('select', { name: 'channel', 'aria-label': 'Channel' }, h('option', { value: 'email' }, 'Email'), h('option', { value: 'sms' }, 'SMS (if turned on)'));
    const subject = h('input', { name: 'subject', placeholder: 'Subject', 'aria-label': 'Subject' });
    const message = h('textarea', { name: 'message', rows: 6, placeholder: 'Message. Use {{first_name}} for a personal touch.', 'aria-label': 'Message' });
    const out = h('div');
    const payload = () => ({ group: group.value, market_id: market.value || null, subject: subject.value, message: message.value, channel: channel.value });
    const preview = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      try {
        const p = await api('/admin/messaging/bulk/preview', { method: 'POST', body: payload() });
        out.replaceChildren(alertBox(`This will reach ${p.recipients} people. Examples: ${p.sample_recipients.join(', ') || 'none'}`, 'info'),
          h('div', { class: 'card' }, h('strong', null, p.subject), h('div', { style: 'white-space:pre-wrap;margin-top:8px' }, p.body)));
      } catch (e) { toast(e.message, true); }
    } }, 'Preview');
    const send = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!subject.value.trim() || !message.value.trim()) return toast('Add a subject and message.', true);
      if (!(await confirmAction('Send this to everyone in that group now?'))) return;
      try { const r = await api('/admin/messaging/bulk/send', { method: 'POST', body: payload() }); toast(`Queued ${r.sent} messages`); go(); } catch (e) { toast(e.message, true); }
    } }, 'Send');
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-2' }, h('div', { class: 'field' }, h('label', null, 'Send to'), group), h('div', { class: 'field' }, h('label', null, 'Market'), market)),
      h('div', { class: 'grid grid-2' }, h('div', { class: 'field' }, h('label', null, 'Subject'), subject), h('div', { class: 'field' }, h('label', null, 'Channel'), channel)),
      h('div', { class: 'field' }, h('label', null, 'Message'), message),
      h('div', { class: 'row' }, preview, send),
      out);
  }

  async function templateEditor(key) {
    const tpls = await api('/admin/messaging/templates');
    const t = tpls.find((x) => x.key === key);
    if (!t) throw new Error('That message was not found.');
    const markets = await api('/admin/markets');
    const subject = h('input', { value: t.subject, 'aria-label': 'Subject' });
    const body = h('textarea', { rows: 10, 'aria-label': 'Message' }, t.body);
    const active = h('input', { type: 'checkbox', checked: !!t.active });
    const offset = h('input', { type: 'number', value: t.offset_days, min: 0, 'aria-label': 'Days before or after the market' });
    const trig = h('select', { 'aria-label': 'Trigger' }, [['action', 'On an action'], ['before_market', 'Days before the market'], ['after_market', 'After the market'], ['manual', 'Manual only']].map(([v, l]) => h('option', { value: v, selected: v === t.trigger_type }, l)));
    const mk = h('select', { 'aria-label': 'Preview with market' }, h('option', { value: '' }, 'Sample details'), markets.map((m) => h('option', { value: m.id }, m.name)));
    const previewBox = h('div', { class: 'card tint' });
    const doPreview = async () => {
      const p = await api('/admin/messaging/templates/' + key + '/preview?market_id=' + (mk.value || ''));
      previewBox.replaceChildren(h('strong', null, p.subject), h('div', { style: 'white-space:pre-wrap;margin-top:8px' }, p.body));
    };
    const vars = ['first_name', 'name', 'business_name', 'market_name', 'city', 'market_date', 'venue', 'booth_number', 'start_time', 'qr_link', 'link', 'directory_link', 'amount', 'message'];
    const form = h('form', { class: 'card stack' },
      h('div', { class: 'small muted' }, 'Audience: ', t.audience),
      h('div', { class: 'field' }, h('label', null, 'Subject'), subject),
      h('div', { class: 'field' }, h('label', null, 'Message'), body),
      h('div', { class: 'help' }, 'Variables: ', vars.map((v) => h('code', { style: 'margin-right:6px' }, '{{' + v + '}}'))),
      h('div', { class: 'grid grid-2' }, h('div', { class: 'field' }, h('label', null, 'When it sends'), trig), h('div', { class: 'field' }, h('label', null, 'Days before or after'), offset)),
      h('label', { class: 'inline' }, active, 'This message is on'),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Save message'), h('button', { class: 'btn ghost', type: 'button', onclick: doPreview }, 'Preview with'), mk));
    onSubmit(form, async () => {
      await api('/admin/messaging/templates/' + key, { method: 'PUT', body: { subject: subject.value, body: body.value, active: active.checked, offset_days: Number(offset.value), trigger_type: trig.value } });
      return 'Saved';
    }, { success: (x) => x });
    return h('div', { class: 'stack' }, h('p', null, h('a', { href: '#/messaging' }, '← Messaging')), h('h1', null, t.name), form, previewBox);
  }

  // ---------- banner ads (ADM-50 to ADM-52) ----------
  async function banners() {
    const rows = await api('/admin/banners');
    const markets = await api('/admin/markets');
    const cities = [...new Set(markets.map((m) => m.city))];
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', 'aria-label': 'Banner image' });
    let dataUrl = null;
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) return toast('Banner is over 5 MB', true);
      dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    });
    const form = h('form', { class: 'card stack' }, h('h2', null, 'New banner'),
      h('div', { class: 'field' }, h('label', null, 'Image *'), file),
      formFields([
        { name: 'advertiser', label: 'Advertiser name' }, { name: 'link', label: 'Link', type: 'url' },
        { name: 'city', label: 'City (slot is per city)', type: 'select', required: true, options: cities.map((c) => [c, c]) },
        { name: 'location', label: 'Where it shows', type: 'select', options: [['home', 'Homepage'], ['blog', 'Blog pages']], value: 'home' },
        { name: 'frequency_seconds', label: 'Rotate every (seconds)', type: 'number', min: 3, max: 120, value: 6 },
        { name: 'starts_on', label: 'Starts', type: 'date', required: true, value: todayStr() },
        { name: 'ends_on', label: 'Ends', type: 'date', required: true, value: todayStr() },
      ]),
      h('button', { class: 'btn', type: 'submit' }, 'Save banner'));
    onSubmit(form, async (v) => {
      if (!dataUrl) throw new Error('Upload a banner image.');
      await api('/admin/banners', { method: 'POST', body: { ...v, image_url: dataUrl } });
      dataUrl = null;
      go();
      return 'Banner saved';
    }, { success: (x) => x, reset: true });
    return h('div', { class: 'stack' }, h('h1', null, 'Banner ads'),
      h('p', { class: 'muted small' }, 'Vendors who want to advertise contact the client directly. Each city has a fixed number of rotating slots (set in Settings).'),
      table([
        { label: 'Preview', render: (b) => h('img', { src: b.image_url, alt: '', style: 'width:140px;height:60px;object-fit:cover;border-radius:8px' }) },
        { label: 'Advertiser', render: (b) => b.advertiser || '' }, { label: 'City', render: (b) => b.city }, { label: 'Where', render: (b) => b.location },
        { label: 'Dates', render: (b) => `${fmtDate(b.starts_on)} to ${fmtDate(b.ends_on)}` }, { label: 'On', render: (b) => badge(b.active ? 'active' : 'lapsed', b.active ? 'On' : 'Off') },
        { label: '', render: (b) => h('button', { class: 'btn ghost small-btn', onclick: async () => {
          try { await api('/admin/banners/' + b.id, { method: 'PUT', body: { active: !b.active, starts_on: b.starts_on, ends_on: b.ends_on, city: b.city, location: b.location } }); go(); } catch (e) { toast(e.message, true); }
        } }, b.active ? 'Turn off' : 'Turn on') },
      ], rows, { empty: 'No banners yet.' }),
      form);
  }

  // ---------- site content (ADM-53, ADM-55 to ADM-57, ADM-56) ----------
  const CONTENT_FORMS = {
    blog_posts: [
      { name: 'title', label: 'Title', required: true }, { name: 'category', label: 'Category' },
      { name: 'publish_at', label: 'Publish date', type: 'date', value: todayStr() },
      { name: 'image_url', label: 'Image', type: 'image' }, { name: 'body', label: 'Body', type: 'textarea', rows: 10, required: true },
      { name: 'status', label: 'Status', type: 'select', options: [['draft', 'Draft'], ['published', 'Published']], value: 'draft' },
    ],
    sponsors: [{ name: 'name', label: 'Sponsor name', required: true }, { name: 'link', label: 'Link', type: 'url' }, { name: 'logo_url', label: 'Logo', type: 'image', required: true }, { name: 'sort_order', label: 'Order', type: 'number', value: 0 }],
    resources: [
      { name: 'section', label: 'Section', type: 'select', options: [['faq', 'FAQ'], ['insurance', 'Insurance guidance'], ['training', 'Training videos'], ['health', 'Health forms by city']], value: 'faq' },
      { name: 'city', label: 'City (for health forms)' }, { name: 'title', label: 'Title', required: true }, { name: 'url', label: 'Link', type: 'url' },
      { name: 'body', label: 'Text', type: 'textarea' }, { name: 'sort_order', label: 'Order', type: 'number', value: 0 },
    ],
    gallery: [{ name: 'market_id', label: 'Past market', type: 'market', required: true }, { name: 'kind', label: 'Type', type: 'select', options: [['photo', 'Photo'], ['flyer', 'Flyer'], ['video', 'Video link']], value: 'photo' }, { name: 'title', label: 'Caption' }, { name: 'url', label: 'Image or video link', type: 'image', required: true }],
  };
  const CONTENT_TITLES = { blog_posts: 'Blog', sponsors: 'Sponsors', resources: 'Vendor resources', gallery: 'Past market gallery' };
  const CONTENT_COLUMNS = {
    blog_posts: [{ label: 'Title', render: (r) => r.title }, { label: 'Status', render: (r) => badge(r.status) }, { label: 'Publish', render: (r) => fmtDate(r.publish_at) }],
    sponsors: [{ label: 'Name', render: (r) => r.name }, { label: 'Order', render: (r) => String(r.sort_order) }],
    resources: [{ label: 'Section', render: (r) => r.section }, { label: 'Title', render: (r) => r.title }, { label: 'City', render: (r) => r.city || '' }],
    gallery: [{ label: 'Type', render: (r) => r.kind }, { label: 'Caption', render: (r) => r.title || '' }, { label: 'Market', render: (r) => String(r.market_id) }],
  };

  async function contentPage(tableName, editId) {
    const rows = await api('/admin/content/' + tableName);
    const markets = tableName === 'gallery' ? await api('/admin/markets') : [];
    const row = editId ? rows.find((r) => String(r.id) === String(editId)) : null;
    const specs = CONTENT_FORMS[tableName];
    const fields = specs.map((f) => {
      if (f.type === 'image') return { ...f, type: 'file' };
      if (f.type === 'market') return { name: f.name, label: f.label, type: 'select', required: f.required, options: markets.map((m) => [m.id, m.name]), value: row ? row.market_id : '' };
      return { ...f, value: row && row[f.name] != null ? row[f.name] : (f.value ?? '') };
    });
    let image = null;
    const wrap = h('div', { class: 'stack' });
    const fnode = h('form', { class: 'card stack' }, h('h2', null, row ? 'Edit' : 'Add new'), formFields(fields.filter((f) => f.type !== 'file')));
    const imageSpec = specs.find((f) => f.type === 'image');
    if (imageSpec) {
      const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', 'aria-label': imageSpec.label });
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (f) image = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      });
      fnode.appendChild(h('div', { class: 'field' }, h('label', null, imageSpec.label + (row ? ' (leave empty to keep)' : '')), file));
    }
    fnode.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, row ? 'Save' : 'Add'), row ? h('a', { class: 'btn ghost', href: '#/content/' + tableName }, 'Cancel') : null));
    onSubmit(fnode, async (v) => {
      const body = { ...v };
      if (imageSpec) { if (image) body[imageSpec.name] = image; else if (!row) throw new Error(imageSpec.label + ' is required.'); else delete body[imageSpec.name]; }
      if (row) await api('/admin/content/' + tableName + '/' + row.id, { method: 'PUT', body });
      else await api('/admin/content/' + tableName, { method: 'POST', body });
      location.hash = '#/content/' + tableName;
      return 'Saved';
    }, { success: (x) => x, reset: !row });
    wrap.appendChild(h('div', { class: 'spread' }, h('h1', null, CONTENT_TITLES[tableName]), h('a', { class: 'btn ghost', href: '#/content/' + tableName + '/new' }, 'Add new')));
    wrap.appendChild(table([
      ...CONTENT_COLUMNS[tableName],
      { label: '', render: (r) => h('div', { class: 'row' }, h('a', { class: 'btn ghost small-btn', href: '#/content/' + tableName + '/' + r.id }, 'Edit'), h('button', { class: 'btn ghost small-btn', onclick: async () => {
        if (!(await confirmAction('Delete this item?'))) return;
        try { await api('/admin/content/' + tableName + '/' + r.id, { method: 'DELETE' }); go(); } catch (e) { toast(e.message, true); }
      } }, 'Delete')) },
    ], rows, { empty: 'Nothing here yet.' }));
    if (editId !== 'new' || true) wrap.appendChild(fnode);
    return wrap;
  }

  async function eventsAdmin() {
    const rows = await api('/admin/events');
    const add = h('form', { class: 'card stack' }, h('h2', null, 'Add an event'),
      formFields([{ name: 'title', label: 'Title', required: true }, { name: 'event_date', label: 'Date', type: 'date', required: true }, { name: 'place', label: 'Place' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'link', label: 'Link', type: 'url' }]),
      h('button', { class: 'btn', type: 'submit' }, 'Publish now'));
    onSubmit(add, async (v) => { await api('/admin/events', { method: 'POST', body: v }); go(); return 'Event published'; }, { success: (x) => x, reset: true });
    return h('div', { class: 'stack' }, h('h1', null, 'Community events'),
      h('p', { class: 'muted small' }, 'Submitted events wait here for review. Approved events appear on the Events page.'),
      table([
        { label: 'Title', render: (e) => e.title }, { label: 'Date', render: (e) => fmtDate(e.event_date) }, { label: 'Submitted by', render: (e) => e.submitter_email || 'Admin' },
        { label: 'Status', render: (e) => badge(e.status === 'pending' ? 'new' : e.status === 'approved' ? 'handled' : 'lapsed', e.status) },
        { label: '', render: (e) => e.status !== 'pending' ? '' : h('div', { class: 'row' },
          h('button', { class: 'btn small-btn', onclick: async () => { await api('/admin/events/' + e.id + '/decide', { method: 'POST', body: { decision: 'approve' } }); go(); } }, 'Approve'),
          h('button', { class: 'btn ghost small-btn', onclick: async () => { await api('/admin/events/' + e.id + '/decide', { method: 'POST', body: { decision: 'reject' } }); go(); } }, 'Reject')) },
      ], rows, { empty: 'No events yet.' }), add);
  }

  async function inquiriesAdmin() {
    const rows = await api('/admin/inquiries');
    return h('div', { class: 'stack' }, h('h1', null, 'Inquiries'),
      table([
        { label: 'When', render: (r) => timeAgo(r.created_at) }, { label: 'From', render: (r) => h('span', null, r.name, h('br'), h('a', { href: 'mailto:' + r.email }, r.email)) },
        { label: 'Topic', render: (r) => r.topic }, { label: 'Message', render: (r) => h('span', { style: 'white-space:pre-wrap' }, r.message) },
        { label: 'Status', render: (r) => badge(r.status) },
        { label: '', render: (r) => r.status === 'new' ? h('button', { class: 'btn ghost small-btn', onclick: async () => { await api('/admin/inquiries/' + r.id + '/handle', { method: 'POST' }); go(); } }, 'Mark handled') : '' },
      ], rows, { empty: 'No inquiries yet.' }));
  }

  async function subscribersAdmin() {
    const rows = await api('/admin/subscribers');
    return h('div', { class: 'stack' }, h('div', { class: 'spread' }, h('h1', null, 'Newsletter subscribers'), csvLink('/admin/subscribers.csv', 'Download list')),
      table([
        { label: 'Email', render: (s) => s.email }, { label: 'Signed up', render: (s) => fmtDate(s.consent_at) },
        { label: 'Status', render: (s) => badge(s.unsubscribed_at ? 'removed' : 'active', s.unsubscribed_at ? 'Unsubscribed' : 'Active') },
        { label: '', render: (s) => s.unsubscribed_at ? '' : h('button', { class: 'btn ghost small-btn', onclick: async () => {
          if (!(await confirmAction('Remove ' + s.email + ' from the list?'))) return;
          await api('/admin/subscribers/' + s.id, { method: 'DELETE' }); go();
        } }, 'Remove') },
      ], rows, { empty: 'No subscribers yet.' }));
  }

  // ---------- users (ADM-61 to ADM-66) ----------
  async function usersAdmin(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const rows = await api('/admin/users' + (qs ? '?' + qs : ''));
    const markets = await api('/admin/markets');
    const search = h('form', { class: 'card inline', onsubmit: (e) => { e.preventDefault(); const r = readForm(e.target); location.hash = '#/users?' + new URLSearchParams(Object.entries(r).filter(([, v]) => v)).toString(); } },
      h('div', null, h('label', null, 'Search'), h('input', { type: 'search', name: 'q', value: params.q || '' })),
      h('div', null, h('label', null, 'Role'), h('select', { name: 'role' }, h('option', { value: '' }, 'All'), ['admin', 'staff', 'vendor', 'buyer'].map((r) => h('option', { value: r, selected: params.role === r }, r)))),
      h('div', null, h('label', null, 'Status'), h('select', { name: 'status' }, h('option', { value: '' }, 'All'), ['active', 'invited', 'suspended'].map((s) => h('option', { value: s, selected: params.status === s }, s)))),
      h('button', { class: 'btn', type: 'submit' }, 'Search'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => inviteForm(markets) }, 'Invite admin or staff'));
    return h('div', { class: 'stack' }, h('h1', null, 'Users'), search,
      table([
        { label: 'Name', render: (u) => h('a', { href: '#/users/' + u.id }, u.name || '(no name)') }, { label: 'Email', render: (u) => u.email },
        { label: 'Role', render: (u) => u.roles }, { label: 'Status', render: (u) => badge(u.status) },
        { label: 'Joined', render: (u) => fmtDate(u.created_at) }, { label: 'Last sign-in', render: (u) => u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : 'Never' },
      ], rows, { empty: 'No users match.' }));
  }

  function inviteForm(markets) {
    const f = h('form', null, formFields([
      { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'role', label: 'Role', type: 'select', options: [['staff', 'Check-in staff'], ['admin', 'Admin']], value: 'staff' },
    ]), h('div', { class: 'field' }, h('label', null, 'Assign check-in to markets (staff)'), h('div', { class: 'stack' }, markets.map((m) => h('label', { class: 'inline' }, h('input', { type: 'checkbox', name: 'mk', value: m.id, 'data-mk': 1 }), m.name)))),
      h('button', { class: 'btn', type: 'submit' }, 'Send invitation'));
    const mod = modal('Invite an admin or check-in staff member', f, []);
    onSubmit(f, async (v) => {
      const ids = [...f.querySelectorAll('input[data-mk]:checked')].map((el) => Number(el.value));
      await api('/admin/users/invite', { method: 'POST', body: { name: v.name, email: v.email, role: v.role, market_ids: ids } });
      mod.close();
      go();
      return 'Invitation sent';
    }, { success: (x) => x });
  }

  async function userProfile(id) {
    const u = await api('/admin/users/' + id);
    const actions = h('div', { class: 'row' },
      u.status !== 'suspended' ? h('button', { class: 'btn ghost small-btn', onclick: () => userAction(id, 'suspend', 'Suspend this account? They cannot sign in until reactivated.') }, 'Suspend') : h('button', { class: 'btn ghost small-btn', onclick: () => userAction(id, 'reactivate') }, 'Reactivate'),
      h('button', { class: 'btn ghost small-btn', onclick: () => userAction(id, 'reset', 'Send a password reset link?') }, 'Send password reset'),
      h('button', { class: 'btn danger small-btn', onclick: () => userAction(id, 'remove', 'Remove this account? It cannot be undone from here.') }, 'Remove'));
    const extra = [];
    if (u.applications) extra.push(section('Applications', table([
      { label: 'Market', render: (a) => a.market_name }, { label: 'Status', render: (a) => badge(a.status) }, { label: 'Payment', render: (a) => badge(a.payment_status) }, { label: 'Booth', render: (a) => a.booth || '' },
    ], u.applications, { empty: 'No applications.' })));
    if (u.businesses) extra.push(section('Businesses', h('p', null, u.businesses.map((b) => b.name).join(', ') || 'None')));
    if (u.chats) extra.push(section('Chats', table([{ label: 'Vendor', render: (c) => c.business_name }, { label: 'Last', render: (c) => fmtDate(c.last_message_at) }], u.chats, { empty: 'No chats.' })));
    if (u.assigned_markets) extra.push(section('Check-in markets', h('p', null, (u.assigned_markets.map((m) => m.name).join(', ')) || 'None assigned'), h('p', { class: 'small muted' }, 'Check-ins done: ' + (u.checkins_done || 0))));
    return h('div', { class: 'stack' }, h('p', null, h('a', { href: '#/users' }, '← Users')),
      h('h1', null, u.name || u.email),
      section('Details', kv([['Email', u.email], ['Role', u.roles.join(', ')], ['Status', u.status], ['Joined', fmtDate(u.created_at)], ['Last sign-in', u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : 'Never']]), actions),
      ...extra,
      section('Activity', table([{ label: 'When', render: (a) => fmtDateTime(a.created_at) }, { label: 'Action', render: (a) => a.action }, { label: 'Detail', render: (a) => a.detail }], u.activity, { empty: 'No recorded actions.' })));
  }

  async function userAction(id, action, question) {
    if (question && !(await confirmAction(question))) return;
    try { await api('/admin/users/' + id + '/' + action, { method: 'POST' }); toast('Done'); go(); } catch (e) { toast(e.message, true); }
  }

  async function activityAdmin() {
    const rows = await api('/admin/activity');
    return h('div', { class: 'stack' }, h('h1', null, 'Activity'), h('p', { class: 'muted small' }, 'Key actions: approvals, declines, refunds, user changes and settings.'),
      table([
        { label: 'When', render: (a) => fmtDateTime(a.created_at) }, { label: 'Who', render: (a) => a.actor_name || a.actor_email || 'System' },
        { label: 'Action', render: (a) => a.action }, { label: 'Detail', render: (a) => a.detail },
      ], rows, { empty: 'Nothing recorded yet.' }));
  }

  // ---------- settings (ADM-67) ----------
  async function settingsAdmin() {
    const s = await api('/admin/settings');
    const f = h('form', { class: 'card stack', style: 'max-width:820px' }, h('h2', null, 'Platform settings'),
      h('p', { class: 'small muted' }, 'Stripe mode: ', h('strong', null, s.stripe_mode), s.stripe_mode === 'simulated' ? ' (no real payments are taken; configure STRIPE_SECRET_KEY to go live)' : ''),
      formFields([
        { name: 'sender_email', label: 'Sender email address', type: 'email', value: s.sender_email },
        { name: 'disclaimer_text', label: 'Liability disclaimer (shown everywhere it is needed)', type: 'textarea', rows: 4, value: s.disclaimer_text },
        { name: 'booth_hold_minutes', label: 'Booth hold while paying (minutes)', type: 'number', min: 1, value: s.booth_hold_minutes, help: 'Open question 7' },
        { name: 'waitlist_pay_hours', label: 'Hours a waitlisted vendor has to pay an offered booth', type: 'number', min: 1, value: s.waitlist_pay_hours, help: 'Open question 6' },
        { name: 'buyer_reply_hours', label: 'Expected vendor reply time shown to buyers (hours)', type: 'number', min: 1, value: s.buyer_reply_hours, help: 'Open question 5' },
        { name: 'unfinished_reminder_days', label: 'Remind unfinished applications every (days)', type: 'number', min: 1, value: s.unfinished_reminder_days },
        { name: 'max_unfinished_reminders', label: 'Stop after this many reminders', type: 'number', min: 1, value: s.max_unfinished_reminders },
        { name: 'pre_market_reminder_days', label: 'Reminder before the market (days)', type: 'number', min: 0, value: s.pre_market_reminder_days },
        { name: 'banner_slots_per_city', label: 'Banner slots per city', type: 'number', min: 1, max: 20, value: s.banner_slots_per_city },
        { name: 'otp_ttl_minutes', label: 'One-time code lifetime (minutes)', type: 'number', min: 1, value: s.otp_ttl_minutes },
        { name: 'otp_max_attempts', label: 'Wrong attempts before a new code is needed', type: 'number', min: 1, value: s.otp_max_attempts },
        { name: 'food_certificate_required', label: 'Food vendors must upload a city certificate', type: 'checkbox', value: s.food_certificate_required },
        { name: 'hide_no_shows_from_directory', label: 'Remove no-show vendors from the directory', type: 'checkbox', value: s.hide_no_shows_from_directory, help: 'Open question 12' },
        { name: 'user_event_submissions', label: 'Let users submit community events', type: 'checkbox', value: s.user_event_submissions, help: 'See open question 15' },
        { name: 'sms_enabled', label: 'Bulk SMS is on', type: 'checkbox', value: s.sms_enabled, help: 'Open question 8. Needs a text-message provider.' },
      ]),
      h('button', { class: 'btn', type: 'submit' }, 'Save settings'));
    onSubmit(f, async (v) => {
      const body = { ...v };
      for (const k of ['booth_hold_minutes', 'waitlist_pay_hours', 'buyer_reply_hours', 'unfinished_reminder_days', 'max_unfinished_reminders', 'pre_market_reminder_days', 'banner_slots_per_city', 'otp_ttl_minutes', 'otp_max_attempts']) body[k] = Number(body[k]);
      await api('/admin/settings', { method: 'PUT', body });
      go();
      return 'Settings saved';
    }, { success: (x) => x });
    return f;
  }

  // Map page routes for part 2.
  const PART2_ROUTES = [
    [/^#\/messaging\/?$/, () => messaging()],
    [/^#\/messaging\/template\/([a-z_]+)$/, (m) => templateEditor(m[1])],
    [/^#\/banners\/?$/, () => banners()],
    [/^#\/content\/(blog_posts|sponsors|resources|gallery)\/?$/, (m) => contentPage(m[1], null)],
    [/^#\/content\/(blog_posts|sponsors|resources|gallery)\/new$/, (m) => contentPage(m[1], 'new')],
    [/^#\/content\/(blog_posts|sponsors|resources|gallery)\/(\d+)$/, (m) => contentPage(m[1], m[2])],
    [/^#\/events\/?$/, () => eventsAdmin()],
    [/^#\/inquiries\/?$/, () => inquiriesAdmin()],
    [/^#\/subscribers\/?$/, () => subscribersAdmin()],
    [/^#\/users\/?$/, () => usersAdmin({})],
    [/^#\/users\?(.*)$/, (m) => usersAdmin(Object.fromEntries(new URLSearchParams(m[1])))],
    [/^#\/users\/(\d+)$/, (m) => userProfile(m[1])],
    [/^#\/activity\/?$/, () => activityAdmin()],
    [/^#\/settings\/?$/, () => settingsAdmin()],
  ];

  const routes = [
    [/^#?\/?$/, () => dashboard({})],
    [/^#\/dashboard(\?.*)?$/, (m) => dashboard(Object.fromEntries(new URLSearchParams((m[1] || '').slice(1)))) ],
    [/^#\/markets\/?$/, () => marketsList()],
    [/^#\/markets\/(\d+)$/, (m) => marketDetail(m[1])],
    [/^#\/applications\/?$/, () => applicationsList({})],
    [/^#\/applications\/unfinished$/, () => unfinishedList()],
    [/^#\/applications\?(.*)$/, (m) => applicationsList(Object.fromEntries(new URLSearchParams(m[1])))],
    [/^#\/applications\/(\d+)$/, (m) => applicationDetail(m[1])],
    [/^#\/waitlist\/?$/, () => waitlist()],
    [/^#\/booths\/?$/, () => boothsOverview()],
    [/^#\/payments\/?$/, () => payments()],
    [/^#\/directory(?:\/(\d+))?\/?$/, (m) => directoryAdmin(m[1])],
    [/^#\/marketplace\/?$/, () => marketplaceAdmin()],
  ];
  routes.push(...PART2_ROUTES);

  let shellRef = null;
  async function boot() {
    try {
      const r = await api('/auth/me');
      if (!r.user || !(r.user.roles || []).includes('admin')) {
        location.replace('/app/admin-login.html');
        return;
      }
      me = r.user;
    } catch {
      location.replace('/app/admin-login.html');
      return;
    }
    const side = shell({ brand: 'Admin', sections: NAV(), user: me, onSignOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/app/admin-login.html';
    } });
    shellRef = side;
    root.replaceChildren(side.root);
    renderRoute = router(side.main, routes, '#/dashboard');
  }
  boot();
})();
