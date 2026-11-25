'use strict';
// Admin tooling: dashboard and analytics (ADM-01 to ADM-05), reports (ADM-60), messaging (ADM-45 to ADM-49),
// banner ads (ADM-50 to ADM-52), site content (ADM-53 to ADM-59), users (ADM-61 to ADM-66), settings (ADM-67).

const db = require('./db');
const auth = require('./auth');
const notify = require('./notify');
const payments = require('./payments');
const markets = require('./markets');
const commerce = require('./commerce');
const checkin = require('./checkin');
const { HttpError, nowIso, todayYmd, int, str, reqStr, sha256, cleanEmail, toCsv, slugify, randomToken } = require('./util');

// ======================= DASHBOARD =======================

// Market ids matching the filters (city, market, date range). Used by every card and chart.
function filteredMarkets(f = {}) {
  return db
    .all("SELECT * FROM markets WHERE status != 'draft' ORDER BY date ASC")
    .filter((m) => (!f.city || m.city.toLowerCase() === String(f.city).toLowerCase()))
    .filter((m) => (!f.market_id || m.id === int(f.market_id)))
    .filter((m) => (!f.from || m.date >= f.from))
    .filter((m) => (!f.to || m.date <= f.to));
}

function dashboard(filters = {}) {
  const ms = filteredMarkets(filters);
  const ids = ms.map((m) => m.id);
  const inIds = ids.length ? ids : [-1];
  const q = (sql) => sql.replace('__IDS__', inIds.join(','));

  const upcoming = ms.filter((m) => m.status === 'published' && m.date >= todayYmd()).length;
  const awaiting = db.all(q("SELECT COUNT(*) AS n FROM applications WHERE market_id IN (__IDS__) AND payment_status = 'paid' AND status IN ('under_review','more_info')"))[0].n;
  const boothsTotal = db.all(q('SELECT COUNT(*) AS n FROM booths WHERE market_id IN (__IDS__)'))[0].n;
  const boothsSold = db.all(q('SELECT COUNT(*) AS n FROM booths WHERE market_id IN (__IDS__) AND assigned_application_id IS NOT NULL'))[0].n;
  const boothsReserved = db.all(q('SELECT COUNT(*) AS n FROM booths WHERE market_id IN (__IDS__) AND reserved = 1 AND assigned_application_id IS NULL'))[0].n;
  const guests = db.all(q("SELECT COALESCE(SUM(guests_count),0) AS n FROM guests WHERE market_id IN (__IDS__) AND source = 'online'"))[0].n;
  const fees = db.all(q("SELECT COALESCE(SUM(CASE WHEN p.kind='refund' THEN -p.amount_cents ELSE p.amount_cents END),0) AS n FROM payments p JOIN applications a ON a.id = p.application_id WHERE a.market_id IN (__IDS__) AND p.status IN ('succeeded','refunded') AND p.kind IN ('booth_fee','refund')"))[0].n;
  const subs = db.all('SELECT b.id FROM businesses b').filter((b) => commerce.subscriptionActive(b.id)).length;

  // Attendance per market (ADM-02)
  const attendance = ms.map((m) => {
    const registered = db.get("SELECT COALESCE(SUM(guests_count),0) AS n FROM guests WHERE market_id = ? AND source = 'online'", m.id).n;
    const walkins = db.get("SELECT COUNT(*) AS n FROM guests WHERE market_id = ? AND source = 'walkin'", m.id).n;
    const attended = db.get('SELECT COUNT(*) AS n FROM guests WHERE market_id = ? AND checked_in = 1', m.id).n;
    return { market_id: m.id, market: m.name, date: m.date, city: m.city, registered, walkins, attended };
  });
  const byCity = {};
  for (const r of attendance) byCity[r.city] = (byCity[r.city] || 0) + r.attended;

  // Vendor analytics (ADM-03)
  const appsByStatus = db.all(q("SELECT status, COUNT(*) AS n FROM applications WHERE market_id IN (__IDS__) GROUP BY status"));
  const vendorsByCategory = db.all(q("SELECT COALESCE(NULLIF(a.category,''),'unset') AS category, COUNT(*) AS n FROM applications a WHERE a.market_id IN (__IDS__) AND a.status = 'approved' GROUP BY a.category"));
  const boothsByTier = db.all(q('SELECT bo.tier, COUNT(*) AS n FROM booths bo WHERE bo.market_id IN (__IDS__) AND bo.assigned_application_id IS NOT NULL GROUP BY bo.tier'));
  const newVsReturning = { new: 0, returning: 0 };
  for (const a of db.all(q("SELECT a.id, a.business_id, a.market_id FROM applications a JOIN markets m ON m.id = a.market_id WHERE a.market_id IN (__IDS__) AND a.status = 'approved'"))) {
    const earlier = db.get(
      "SELECT COUNT(*) AS n FROM applications x JOIN markets mx ON mx.id = x.market_id WHERE x.business_id = ? AND x.status = 'approved' AND x.id != ? AND mx.date < (SELECT date FROM markets WHERE id = ?)",
      a.business_id, a.id, a.market_id
    ).n;
    newVsReturning[earlier ? 'returning' : 'new']++;
  }
  const noShows = ms.map((m) => ({ market: m.name, market_id: m.id, count: db.get("SELECT COUNT(*) AS n FROM applications WHERE market_id = ? AND attendance = 'no_show'", m.id).n }));
  const feesByMarket = ms.map((m) => ({
    market: m.name,
    market_id: m.id,
    amount_cents: db.get("SELECT COALESCE(SUM(CASE WHEN p.kind='refund' THEN -p.amount_cents ELSE p.amount_cents END),0) AS n FROM payments p JOIN applications a ON a.id = p.application_id WHERE a.market_id = ? AND p.kind IN ('booth_fee','refund') AND p.status IN ('succeeded','refunded')", m.id).n,
  }));

  // Marketplace analytics (ADM-04). Not filtered by market: subscriptions and listings belong to the business.
  const allBiz = db.all('SELECT id FROM businesses');
  const active = allBiz.filter((b) => commerce.subscriptionActive(b.id)).length;
  const newSubs = db.get("SELECT COUNT(*) AS n FROM subscriptions WHERE created_at >= ?", new Date(Date.now() - 30 * 86400000).toISOString()).n;
  const lapsed = db.get("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'lapsed'").n;
  const listingsCount = db.get('SELECT COUNT(*) AS n FROM listings WHERE hidden = 0').n;
  const chatsStarted = db.get('SELECT COUNT(*) AS n FROM chats').n;
  const topListings = db.all('SELECT id, name, views FROM listings ORDER BY views DESC LIMIT 5');
  const topVendors = db.all('SELECT b.id, b.name, COALESCE(SUM(l.views),0) AS views FROM businesses b LEFT JOIN listings l ON l.business_id = b.id GROUP BY b.id ORDER BY views DESC LIMIT 5');

  return {
    filters: { city: filters.city || '', market_id: filters.market_id || '', from: filters.from || '', to: filters.to || '' },
    markets: ms.map((m) => ({ id: m.id, name: m.name, city: m.city, date: m.date, status: markets.effectiveStatus(m) })),
    cards: {
      upcoming_markets: upcoming,
      applications_awaiting_review: awaiting,
      booths_sold: boothsSold,
      booths_available: Math.max(0, boothsTotal - boothsSold - boothsReserved),
      booths_reserved: boothsReserved,
      guest_registrations: guests,
      booth_fees_cents: fees,
      active_marketplace_subscriptions: subs,
    },
    attendance: { per_market: attendance, by_city: Object.entries(byCity).map(([city, attended]) => ({ city, attended })), trend: attendance.map((r) => ({ date: r.date, attended: r.attended })) },
    vendors: { by_status: appsByStatus, by_category: vendorsByCategory, booths_by_tier: boothsByTier, new_vs_returning: newVsReturning, no_shows: noShows, fees_by_market: feesByMarket },
    marketplace: { active, new_last_30_days: newSubs, lapsed, listings: listingsCount, chats_started: chatsStarted, top_listings: topListings, top_vendors: topVendors },
  };
}

function dashboardCsv(filters) {
  const d = dashboard(filters);
  const rows = [];
  for (const [k, v] of Object.entries(d.cards)) rows.push({ section: 'Cards', metric: k, market: '', value: v });
  for (const r of d.attendance.per_market) {
    rows.push({ section: 'Attendance', metric: 'registered', market: r.market, value: r.registered });
    rows.push({ section: 'Attendance', metric: 'walkins', market: r.market, value: r.walkins });
    rows.push({ section: 'Attendance', metric: 'attended', market: r.market, value: r.attended });
  }
  return toCsv(rows, [
    { label: 'Section', get: (r) => r.section }, { label: 'Metric', get: (r) => r.metric },
    { label: 'Market', get: (r) => r.market }, { label: 'Value', get: (r) => r.value },
  ]);
}

// ======================= MARKET REPORT (ADM-60) =======================

function marketReport(marketId) {
  const m = markets.getMarketRow(int(marketId));
  if (!m) throw new HttpError(404, 'That market was not found.');
  const registrations = db.get("SELECT COALESCE(SUM(guests_count),0) AS n FROM guests WHERE market_id = ? AND source = 'online'", m.id).n;
  const attended = db.get('SELECT COUNT(*) AS n FROM guests WHERE market_id = ? AND checked_in = 1', m.id).n;
  const walkins = db.get("SELECT COUNT(*) AS n FROM guests WHERE market_id = ? AND source = 'walkin'", m.id).n;
  const categories = db.all("SELECT COALESCE(NULLIF(category,''),'unset') AS category, COUNT(*) AS n FROM applications WHERE market_id = ? AND status = 'approved' GROUP BY category", m.id);
  const noShows = db.get("SELECT COUNT(*) AS n FROM applications WHERE market_id = ? AND attendance = 'no_show'", m.id).n;
  const booths = db.get('SELECT COUNT(*) AS n FROM booths WHERE market_id = ? AND assigned_application_id IS NOT NULL', m.id).n;
  const fees = db.get(
    "SELECT COALESCE(SUM(CASE WHEN p.kind='refund' THEN -p.amount_cents ELSE p.amount_cents END),0) AS n FROM payments p JOIN applications a ON a.id = p.application_id WHERE a.market_id = ? AND p.kind IN ('booth_fee','refund') AND p.status IN ('succeeded','refunded')",
    m.id
  ).n;
  return {
    market: { id: m.id, name: m.name, city: m.city, date: m.date, status: markets.effectiveStatus(m) },
    registrations, attended, walkins, vendors_by_category: categories, vendor_no_shows: noShows, booths_sold: booths, booth_fees_cents: fees,
  };
}

function marketReportCsv(marketId) {
  const r = marketReport(marketId);
  const rows = [
    { metric: 'Registrations', value: r.registrations }, { metric: 'Actual attendance', value: r.attended },
    { metric: 'Walk-ins', value: r.walkins }, { metric: 'Vendor no-shows', value: r.vendor_no_shows },
    { metric: 'Booths sold', value: r.booths_sold }, { metric: 'Booth fees received (cents)', value: r.booth_fees_cents },
    ...r.vendors_by_category.map((c) => ({ metric: `Vendors: ${c.category}`, value: c.n })),
  ];
  return toCsv(rows, [{ label: 'Metric', get: (x) => x.metric }, { label: 'Value', get: (x) => x.value }]);
}

// ======================= MESSAGING (ADM-45 to ADM-49) =======================

function templates() {
  return db.all('SELECT * FROM notification_templates ORDER BY audience, key');
}

function updateTemplate(actor, key, body) {
  const t = db.get('SELECT * FROM notification_templates WHERE key = ?', key);
  if (!t) throw new HttpError(404, 'That template was not found.');
  const subject = body.subject !== undefined ? str(body.subject, 200) : t.subject;
  const text = body.body !== undefined ? str(body.body, 8000) : t.body;
  if (!subject || !text) throw new HttpError(400, 'A template needs a subject and a message.');
  db.run(
    'UPDATE notification_templates SET subject=?, body=?, active=?, offset_days=?, trigger_type=?, updated_at=? WHERE key=?',
    subject, text, body.active === undefined ? t.active : (body.active ? 1 : 0),
    body.offset_days === undefined ? t.offset_days : int(body.offset_days, 0),
    ['action', 'before_market', 'after_market', 'manual'].includes(body.trigger_type) ? body.trigger_type : t.trigger_type,
    nowIso(), key
  );
  markets.logActivity(actor, 'template.updated', key);
  return db.get('SELECT * FROM notification_templates WHERE key = ?', key);
}

// Real market details fill the variables, so the preview matches what will be sent.
function previewTemplate(key, marketId) {
  const t = db.get('SELECT * FROM notification_templates WHERE key = ?', key);
  if (!t) throw new HttpError(404, 'That template was not found.');
  const m = marketId ? markets.getMarketRow(int(marketId)) : null;
  const vars = sampleVars(m);
  return { subject: notify.render(t.subject, vars), body: notify.render(t.body, vars), vars };
}

function sampleVars(m) {
  return {
    first_name: 'Ama', name: 'Ama Mensah', business_name: 'Ama Kitchen', market_name: m ? m.name : 'Sample Market',
    city: m ? m.city : 'Sample City', market_date: m ? m.date : '2026-12-05', venue: m ? m.venue : 'Sample venue',
    booth_number: '12', start_time: m ? m.start_time : '10:00', qr_link: notify.appUrl('/app/ticket.html?t=sample'),
    link: notify.appUrl('/app/'), directory_link: notify.appUrl('/app/directory.html#/market/' + (m ? m.id : 1)),
    code: '123456', minutes: 10, hours: 48, message: 'Sample message', amount: '250.00', role: 'Check-in staff',
    subject: 'Sample subject', unsubscribe_link: notify.appUrl('/app/unsubscribe.html?t=sample'), topic: 'Sample', email: 'sample@example.com',
    title: 'Sample event', event_date: '2026-12-01', place: 'Sample place', listing_name: 'Sample listing', first_name_fallback: 'there',
  };
}

// Recipient groups for bulk messages: guests of a market, vendors of a market, no-show vendors, newsletter subscribers.
function recipients(group, marketId) {
  const g = str(group, 60);
  if (g === 'subscribers') {
    return db.all('SELECT email, email AS name FROM subscribers WHERE unsubscribed_at IS NULL').map((r) => ({ email: r.email, name: '' }));
  }
  const mid = int(marketId, 0);
  if (!mid) throw new HttpError(400, 'Choose a market for this group.');
  if (g === 'guests') {
    return db.all("SELECT DISTINCT email, name FROM guests WHERE market_id = ? AND source IN ('online','walkin')", mid).map((r) => ({ email: r.email, name: r.name }));
  }
  if (g === 'vendors') {
    return db.all("SELECT DISTINCT a.owner_email AS email, COALESCE(b.contact_person, '') AS name FROM applications a LEFT JOIN businesses b ON b.id = a.business_id WHERE a.market_id = ? AND a.status = 'approved'", mid)
      .map((r) => ({ email: r.email, name: r.name }));
  }
  if (g === 'no_shows') {
    return db.all("SELECT DISTINCT a.owner_email AS email, COALESCE(b.contact_person, '') AS name FROM applications a LEFT JOIN businesses b ON b.id = a.business_id WHERE a.market_id = ? AND a.attendance = 'no_show'", mid)
      .map((r) => ({ email: r.email, name: r.name }));
  }
  throw new HttpError(400, 'Choose a recipient group.');
}

function bulkPreview({ group, market_id, subject, message }) {
  const list = recipients(group, market_id);
  const m = market_id ? markets.getMarketRow(int(market_id)) : null;
  const vars = { ...sampleVars(m), subject: str(subject, 200), message: str(message, 4000) };
  return {
    recipients: list.length,
    sample_recipients: list.slice(0, 5).map((r) => r.email),
    subject: notify.render(vars.subject, vars),
    body: notify.render(str(message, 4000), vars),
    sms_enabled: !!db.getSetting('sms_enabled', false),
  };
}

function bulkSend(actor, { group, market_id, subject, message, channel }) {
  const sub = reqStr(subject, 'Subject', 200);
  const text = reqStr(message, 'Message', 4000);
  const list = recipients(group, market_id);
  if (!list.length) throw new HttpError(400, 'No one is in that group yet.');
  const m = market_id ? markets.getMarketRow(int(market_id)) : null;
  const ch = channel === 'sms' ? 'sms' : 'email';
  let sent = 0;
  db.tx(() => {
    for (const r of list) {
      const vars = { ...sampleVars(m), first_name: notify.firstName(r.name, r.email), subject: sub, message: text };
      notify.queue({ channel: ch, to: r.email, subject: notify.render(sub, vars), body: notify.render(text, vars), templateKey: 'bulk_message' });
      sent++;
    }
  });
  markets.logActivity(actor, 'bulk.sent', `${sent} ${ch} to ${group}${m ? ' ' + m.name : ''}`);
  return { sent };
}

// Email the market's vendor directory to its guests after the event (ADM-40, NOT-14).
function sendDirectoryToGuests(actor, marketId) {
  const m = markets.getMarketRow(int(marketId));
  if (!m) throw new HttpError(404, 'That market was not found.');
  const guests = recipients('guests', m.id);
  for (const g of guests) {
    notify.sendTemplate('directory_email', g.email, { name: g.name, market_name: m.name, directory_link: notify.appUrl('/app/directory.html#/market/' + m.id) });
  }
  markets.logActivity(actor, 'directory.emailed', `${guests.length} guests of ${m.name}`);
  return { sent: guests.length };
}

// ======================= BANNER ADS (ADM-50 to ADM-52) =======================

function banners() {
  return db.all('SELECT * FROM banners ORDER BY city, starts_on DESC');
}

function saveBanner(actor, id, body) {
  const image = String(body.image_url || '');
  if (!id && !/^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,/.test(image)) throw new HttpError(400, 'Upload a banner image.');
  const starts = reqStr(body.starts_on, 'Start date', 10);
  const ends = reqStr(body.ends_on, 'End date', 10);
  if (ends < starts) throw new HttpError(400, 'The end date is before the start date.');
  const city = str(body.city, 80);
  const location = body.location === 'blog' ? 'blog' : 'home';
  const slots = db.getSetting('banner_slots_per_city', 6);
  const overlapping = db.get(
    "SELECT COUNT(*) AS n FROM banners WHERE active = 1 AND LOWER(city) = LOWER(?) AND location = ? AND starts_on <= ? AND ends_on >= ? AND (? IS NULL OR id != ?)",
    city, location, ends, starts, id ? int(id) : null, id ? int(id) : null
  ).n;
  if (body.active !== false && overlapping >= slots) {
    throw new HttpError(409, `All ${slots} banner slots for ${city || 'this city'} are booked for those dates. Shorten or move another banner.`);
  }
  const values = [
    image || null, str(body.link, 500), str(body.advertiser, 120), city, location,
    Math.min(Math.max(int(body.frequency_seconds, 6), 3), 120), starts, ends, body.active === false ? 0 : 1,
  ];
  if (id) {
    db.run(
      `UPDATE banners SET image_url = COALESCE(?, image_url), link=?, advertiser=?, city=?, location=?, frequency_seconds=?, starts_on=?, ends_on=?, active=? WHERE id=?`,
      ...values, int(id)
    );
    return db.get('SELECT * FROM banners WHERE id = ?', int(id));
  }
  const info = db.run(
    'INSERT INTO banners (image_url, link, advertiser, city, location, frequency_seconds, starts_on, ends_on, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ...values, nowIso()
  );
  markets.logActivity(actor, 'banner.created', `${city} ${location}`);
  return db.get('SELECT * FROM banners WHERE id = ?', info.lastInsertRowid);
}

// Live banners for a slot. Public. Rotation happens in the browser at the chosen frequency.
function liveBanners(location, city) {
  const today = todayYmd();
  return db
    .all('SELECT id, image_url, link, advertiser, city, location, frequency_seconds FROM banners WHERE active = 1 AND location = ? AND starts_on <= ? AND ends_on >= ? ORDER BY id', location === 'blog' ? 'blog' : 'home', today, today)
    .filter((b) => !city || b.city.toLowerCase() === String(city).toLowerCase());
}

// ======================= SITE CONTENT (ADM-53 to ADM-59) =======================

const CONTENT = {
  blog_posts: { fields: ['title', 'slug', 'image_url', 'category', 'body', 'publish_at', 'status'], required: ['title', 'body'], image: ['image_url'] },
  sponsors: { fields: ['name', 'logo_url', 'link', 'sort_order'], required: ['name', 'logo_url'], image: ['logo_url'] },
  resources: { fields: ['section', 'city', 'title', 'url', 'body', 'sort_order'], required: ['title'], image: [] },
  gallery: { fields: ['market_id', 'kind', 'url', 'title'], required: ['url', 'market_id'], image: [] },
};

function contentList(table, { publishedOnly = false } = {}) {
  if (table === 'blog_posts') {
    const sql = publishedOnly
      ? "SELECT id, title, slug, image_url, category, body, publish_at, status FROM blog_posts WHERE status = 'published' AND publish_at <= ? ORDER BY publish_at DESC"
      : 'SELECT * FROM blog_posts ORDER BY publish_at DESC';
    return publishedOnly ? db.all(sql, nowIso()) : db.all(sql);
  }
  if (table === 'resources') return db.all('SELECT * FROM resources ORDER BY section, sort_order, id');
  if (table === 'sponsors') return db.all('SELECT * FROM sponsors ORDER BY sort_order, id');
  if (table === 'gallery') return db.all('SELECT * FROM gallery ORDER BY id DESC');
  throw new HttpError(404, 'Unknown content type.');
}

function contentSave(actor, table, id, body) {
  const spec = CONTENT[table];
  if (!spec) throw new HttpError(404, 'Unknown content type.');
  const values = {};
  for (const f of spec.fields) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (spec.image.includes(f) && v) {
      if (!/^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,/.test(String(v))) throw new HttpError(400, 'Upload an image (PNG, JPG, WEBP, SVG or GIF).');
      if (String(v).length > 6 * 1024 * 1024) throw new HttpError(400, 'That image is too large (4 MB max).');
    }
    if (typeof v === 'string') v = str(v, f === 'body' ? 20000 : 1000);
    if (f === 'sort_order' || f === 'market_id') v = int(v, 0);
    values[f] = v;
  }
  for (const f of spec.required) {
    if (!id && !String(values[f] || '').trim()) throw new HttpError(400, `${f.replace(/_/g, ' ')} is required.`);
  }
  if (table === 'blog_posts') {
    if (values.title !== undefined && !values.slug && !id) values.slug = slugify(values.title) || 'post';
    if (values.status !== undefined) values.status = values.status === 'published' ? 'published' : 'draft';
    if (!id && !values.status) values.status = 'draft';
    if (!id && !values.publish_at) values.publish_at = nowIso();
    if (values.slug) {
      const clash = db.get('SELECT id FROM blog_posts WHERE slug = ? AND id != ?', values.slug, id ? int(id) : 0);
      if (clash) values.slug = values.slug + '-' + randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '');
    }
  }
  const keys = Object.keys(values);
  if (id) {
    if (keys.length) db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => values[k]), int(id));
    return db.get(`SELECT * FROM ${table} WHERE id = ?`, int(id));
  }
  if (table === 'blog_posts') values.created_at = nowIso();
  if (table === 'gallery') values.created_at = nowIso();
  const cols = Object.keys(values);
  const info = db.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((k) => values[k]));
  markets.logActivity(actor, `${table}.created`, String(values.title || values.name || values.url || ''));
  return db.get(`SELECT * FROM ${table} WHERE id = ?`, info.lastInsertRowid);
}

function contentDelete(actor, table, id) {
  if (!CONTENT[table]) throw new HttpError(404, 'Unknown content type.');
  db.run(`DELETE FROM ${table} WHERE id = ?`, int(id));
  markets.logActivity(actor, `${table}.deleted`, String(id));
  return { ok: true };
}

// Community events: submitted by users (WEB-29) or created by admin (Q15 answer). Admin approves.
function communityEvents(status) {
  return db.all(
    `SELECT e.*, u.email AS submitter_email FROM community_events e LEFT JOIN users u ON u.id = e.submitted_by
     WHERE (? IS NULL OR e.status = ?) ORDER BY e.event_date`,
    status || null, status || null
  );
}

function publicEvents() {
  return db.all("SELECT id, title, event_date, place, description, link FROM community_events WHERE status = 'approved' AND event_date >= ? ORDER BY event_date", todayYmd());
}

function submitEvent(user, body) {
  if (!db.getSetting('user_event_submissions', true)) throw new HttpError(403, 'Event submissions are closed. Contact the Naija Market Day team.');
  const e = saveEvent(body, 'pending', user.id);
  notify.sendTemplate('event_submitted_admin', db.getSetting('sender_email', ''), { name: user.name, title: e.title, event_date: e.event_date, place: e.place });
  return e;
}

function saveEvent(body, status, userId = null) {
  const title = reqStr(body.title, 'Title', 160);
  const date = reqStr(body.event_date, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Use the date format YYYY-MM-DD.');
  const info = db.run(
    'INSERT INTO community_events (title, event_date, place, description, link, status, submitted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    title, date, str(body.place, 200), str(body.description, 2000), str(body.link, 300), status, userId, nowIso()
  );
  return db.get('SELECT * FROM community_events WHERE id = ?', info.lastInsertRowid);
}

function decideEvent(actor, id, decision) {
  const e = db.get('SELECT * FROM community_events WHERE id = ?', int(id));
  if (!e) throw new HttpError(404, 'That event was not found.');
  const status = decision === 'approve' ? 'approved' : 'rejected';
  db.run('UPDATE community_events SET status = ? WHERE id = ?', status, e.id);
  const submitter = e.submitted_by ? db.get('SELECT * FROM users WHERE id = ?', e.submitted_by) : null;
  if (submitter && status === 'approved') {
    notify.sendTemplate('event_published', submitter.email, { name: submitter.name, title: e.title });
    notify.addBell(submitter.id, 'Your event is published', e.title, '/app/events.html');
  }
  markets.logActivity(actor, 'event.' + status, e.title);
  return db.get('SELECT * FROM community_events WHERE id = ?', e.id);
}

// Inquiries (WEB-31, ADM-58) and newsletter subscribers (WEB-32, ADM-59).
function inquiries(status) {
  return db.all('SELECT * FROM inquiries WHERE (? IS NULL OR status = ?) ORDER BY id DESC', status || null, status || null);
}
function handleInquiry(actor, id) {
  db.run("UPDATE inquiries SET status = 'handled' WHERE id = ?", int(id));
  return { ok: true };
}
function subscribers() {
  return db.all('SELECT id, email, consent_at, unsubscribed_at, created_at FROM subscribers ORDER BY id DESC');
}
function removeSubscriber(actor, id) {
  db.run('UPDATE subscribers SET unsubscribed_at = ? WHERE id = ?', nowIso(), int(id));
  markets.logActivity(actor, 'subscriber.removed', String(id));
  return { ok: true };
}

// ======================= USERS (ADM-61 to ADM-66) =======================

function users({ q = '', role = '', status = '' } = {}) {
  const term = `%${str(q, 100).toLowerCase()}%`;
  return db
    .all(
      `SELECT id, name, email, roles, status, created_at, last_sign_in_at FROM users
       WHERE (LOWER(email) LIKE ? OR LOWER(name) LIKE ?) AND (? = '' OR roles LIKE ?) AND (? = '' OR status = ?)
       ORDER BY created_at DESC LIMIT 500`,
      term, term, str(role, 20), `%${str(role, 20)}%`, str(status, 20), str(status, 20)
    )
    .map((u) => ({ ...u, roles: u.roles }));
}

function userProfile(id) {
  const u = db.get('SELECT * FROM users WHERE id = ?', int(id));
  if (!u) throw new HttpError(404, 'That user was not found.');
  const roles = auth.rolesOf(u);
  const profile = { ...auth.publicUser(u), status: u.status, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at };
  if (roles.includes('vendor')) {
    profile.applications = db.all(
      `SELECT a.id, a.status, a.payment_status, m.name AS market_name, bo.number AS booth FROM applications a
       JOIN markets m ON m.id = a.market_id LEFT JOIN booths bo ON bo.id = a.booth_id
       WHERE a.owner_user_id = ? OR a.owner_email = ? COLLATE NOCASE ORDER BY m.date DESC`,
      u.id, u.email
    );
    profile.businesses = db.all('SELECT id, name FROM businesses WHERE owner_user_id = ? OR owner_email = ? COLLATE NOCASE', u.id, u.email);
  }
  if (roles.includes('buyer')) {
    profile.chats = db.all('SELECT c.id, b.name AS business_name, c.last_message_at FROM chats c JOIN businesses b ON b.id = c.business_id WHERE c.buyer_id = ? ORDER BY c.last_message_at DESC', u.id);
  }
  if (roles.includes('staff') || roles.includes('admin')) {
    profile.assigned_markets = db.all('SELECT m.id, m.name, m.date FROM staff_assignments s JOIN markets m ON m.id = s.market_id WHERE s.user_id = ?', u.id);
    profile.checkins_done = db.get('SELECT COUNT(*) AS n FROM scan_log WHERE user_id = ? AND result = ?', u.id, 'checked_in').n;
  }
  profile.activity = db.all('SELECT action, detail, created_at FROM activity WHERE actor_id = ? ORDER BY id DESC LIMIT 50', u.id);
  return profile;
}

// Invite an admin or check-in staff member (ADM-63). They set their own password from the emailed link.
function inviteStaff(actor, body) {
  const email = cleanEmail(body.email);
  const role = body.role === 'admin' ? 'admin' : 'staff';
  const name = str(body.name, 120);
  if (db.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email)) throw new HttpError(409, 'That email already has an account.');
  const info = db.run("INSERT INTO users (email, name, roles, status, created_at) VALUES (?, ?, ?, 'invited', ?)", email, name, role, nowIso());
  const userId = Number(info.lastInsertRowid);
  if (role === 'staff' && Array.isArray(body.market_ids)) assignMarkets(userId, body.market_ids);
  const token = auth.issueSetupToken(userId, 72);
  notify.sendTemplate('staff_invite', email, { name, role: role === 'admin' ? 'an admin' : 'check-in staff', link: notify.appUrl('/app/set-password.html?t=' + token) });
  markets.logActivity(actor, 'user.invited', `${email} as ${role}`);
  return { id: userId, email, role };
}

function assignMarkets(userId, marketIds) {
  db.run('DELETE FROM staff_assignments WHERE user_id = ?', userId);
  for (const mid of marketIds) db.run('INSERT OR IGNORE INTO staff_assignments (user_id, market_id) VALUES (?, ?)', userId, int(mid));
}

function setStaffMarkets(actor, userId, marketIds) {
  const u = db.get('SELECT * FROM users WHERE id = ?', int(userId));
  if (!u) throw new HttpError(404, 'That user was not found.');
  assignMarkets(u.id, Array.isArray(marketIds) ? marketIds : []);
  markets.logActivity(actor, 'user.markets', u.email);
  return { ok: true };
}

// Suspend, reactivate, remove, or send a password reset (ADM-65).
async function userAction(actor, userId, action) {
  const u = db.get('SELECT * FROM users WHERE id = ?', int(userId));
  if (!u) throw new HttpError(404, 'That user was not found.');
  if (u.id === actor.id && (action === 'suspend' || action === 'remove')) throw new HttpError(400, 'You cannot suspend or remove your own account.');
  if (action === 'suspend') db.run("UPDATE users SET status = 'suspended' WHERE id = ?", u.id);
  else if (action === 'reactivate') db.run("UPDATE users SET status = CASE WHEN password_hash IS NULL THEN 'invited' ELSE 'active' END WHERE id = ?", u.id);
  else if (action === 'remove') {
    db.run("UPDATE users SET status = 'removed' WHERE id = ?", u.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  } else if (action === 'reset') {
    const token = auth.issueSetupToken(u.id, 1);
    notify.sendTemplate('password_reset', u.email, { name: u.name, link: notify.appUrl('/app/set-password.html?t=' + token) });
  } else throw new HttpError(400, 'Unknown action.');
  if (action === 'suspend' || action === 'remove') db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  markets.logActivity(actor, 'user.' + action, u.email);
  return { ok: true };
}

function activityLog({ limit = 200 } = {}) {
  return db.all(
    `SELECT a.id, a.action, a.detail, a.created_at, u.name AS actor_name, u.email AS actor_email FROM activity a
     LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`,
    Math.min(int(limit, 200), 500)
  );
}

// ======================= SETTINGS (ADM-67) =======================

const EDITABLE_SETTINGS = [
  'disclaimer_text', 'sender_email', 'booth_hold_minutes', 'waitlist_pay_hours', 'buyer_reply_hours',
  'unfinished_reminder_days', 'max_unfinished_reminders', 'pre_market_reminder_days', 'banner_slots_per_city',
  'sms_enabled', 'user_event_submissions', 'hide_no_shows_from_directory', 'food_certificate_required', 'otp_ttl_minutes', 'otp_max_attempts',
];

function settings() {
  const out = {};
  for (const k of EDITABLE_SETTINGS) out[k] = db.getSetting(k, null);
  out.stripe_mode = payments.mode();
  return out;
}

function updateSettings(actor, body) {
  for (const k of EDITABLE_SETTINGS) {
    if (body[k] === undefined) continue;
    let v = body[k];
    if (typeof db.getSetting(k, null) === 'number') v = int(v, 0);
    if (typeof db.getSetting(k, null) === 'boolean') v = !!v;
    if (typeof v === 'string') v = str(v, 4000);
    db.setSetting(k, v);
  }
  markets.logActivity(actor, 'settings.updated', Object.keys(body).filter((k) => EDITABLE_SETTINGS.includes(k)).join(', '));
  return settings();
}

function outbox(limit = 200) {
  return db.all('SELECT id, channel, to_address, subject, template_key, status, created_at FROM outbox ORDER BY id DESC LIMIT ?', Math.min(int(limit, 200), 500));
}

// Subscriptions and plans for the admin Marketplace screen (ADM-41, ADM-43).
function adminSubscriptions() {
  return db.all(
    `SELECT b.id AS business_id, b.name AS business, b.owner_email AS vendor_email, s.id AS subscription_id, s.plan_code, s.status, s.renews_at
     FROM businesses b LEFT JOIN subscriptions s ON s.id = (SELECT MAX(id) FROM subscriptions WHERE business_id = b.id)
     WHERE s.id IS NOT NULL ORDER BY s.renews_at`
  );
}

function updatePlan(actor, code, body) {
  const p = db.get('SELECT * FROM plans WHERE code = ?', String(code));
  if (!p) throw new HttpError(404, 'That plan was not found.');
  const price = body.price !== undefined ? require('./util').money(body.price) : p.price_cents;
  const free = body.free_days !== undefined ? int(body.free_days, p.free_days) : p.free_days;
  db.run('UPDATE plans SET price_cents = ?, free_days = ? WHERE code = ?', price, free, p.code);
  markets.logActivity(actor, 'plan.updated', p.code);
  return db.get('SELECT * FROM plans WHERE code = ?', p.code);
}

function listingsAdmin() {
  return db.all(
    `SELECT l.id, l.name, l.price_cents, l.hidden, l.hidden_reason, l.views, b.name AS vendor, b.id AS business_id FROM listings l JOIN businesses b ON b.id = l.business_id ORDER BY l.updated_at DESC`
  );
}

function hideListing(actor, id, hidden, reason) {
  const l = db.get('SELECT l.*, b.owner_email, b.owner_user_id FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = ?', int(id));
  if (!l) throw new HttpError(404, 'That listing was not found.');
  db.run('UPDATE listings SET hidden = ?, hidden_reason = ?, updated_at = ? WHERE id = ?', hidden ? 1 : 0, hidden ? str(reason, 300) : '', nowIso(), l.id);
  if (hidden) {
    notify.sendTemplate('listing_hidden', l.owner_email, { name: '', listing_name: l.name, message: str(reason, 300) || 'Not specified' });
    if (l.owner_user_id) notify.addBell(l.owner_user_id, 'A listing was hidden', l.name, '/app/vendor.html#/marketplace');
  }
  markets.logActivity(actor, hidden ? 'listing.hidden' : 'listing.shown', l.name);
  return { ok: true };
}

module.exports = {
  dashboard, dashboardCsv, marketReport, marketReportCsv,
  templates, updateTemplate, previewTemplate, recipients, bulkPreview, bulkSend, sendDirectoryToGuests,
  banners, saveBanner, liveBanners,
  CONTENT, contentList, contentSave, contentDelete,
  communityEvents, publicEvents, submitEvent, saveEvent, decideEvent,
  inquiries, handleInquiry, subscribers, removeSubscriber,
  users, userProfile, inviteStaff, setStaffMarkets, userAction, activityLog,
  settings, updateSettings, outbox, adminSubscriptions, updatePlan, listingsAdmin, hideListing,
};
