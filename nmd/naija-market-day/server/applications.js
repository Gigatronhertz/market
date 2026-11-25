'use strict';
// Vendor applications: start with an email, business details, category questions, booth hold,
// terms, payment, review, approval, decline with automatic refund, more-info requests,
// waitlist and booth moves. (VEN-01 to VEN-31, ADM-16 to ADM-26, NOT-03 to NOT-12.)

const db = require('./db');
const qr = require('./qr');
const notify = require('./notify');
const auth = require('./auth');
const payments = require('./payments');
const markets = require('./markets');
const { HttpError, nowIso, addMinutes, addDays, todayYmd, randomToken, sha256, cleanEmail, str, reqStr, int } = require('./util');

const STEPS = ['details', 'category', 'booth', 'terms', 'payment'];

// Categories named by the client (VEN-11). Open question 13 asks for the final list.
const CATEGORIES = {
  sponsors: { label: 'Sponsors', questions: [
    { key: 'sponsorship_level', label: 'Sponsorship level you want', required: true },
    { key: 'brand_link', label: 'Link to your logo or brand page' },
  ] },
  corporate: { label: 'Corporate vendors', questions: [
    { key: 'company_registration', label: 'Company registration number', required: true },
    { key: 'what_you_sell', label: 'What will you show or sell?', required: true },
  ] },
  premium: { label: 'Premium vendors (mostly food)', questions: [
    { key: 'is_food', label: 'Are you selling food?', type: 'bool' },
    { key: 'what_you_sell', label: 'What will you sell?', required: true },
    { key: 'city_certification_number', label: 'City food certification number', requiredIfFood: true },
  ] },
  general: { label: 'General vendors', questions: [
    { key: 'is_food', label: 'Are you selling food?', type: 'bool' },
    { key: 'what_you_sell', label: 'What will you sell?', required: true },
    { key: 'city_certification_number', label: 'City food certification number', requiredIfFood: true },
  ] },
};

const BUSINESS_FIELDS = ['name', 'category', 'contact_person', 'phone', 'city', 'description', 'website'];

// ---------- lookup and access ----------

// An application is reached with its resume token (drafts, emailed links) or by the signed-in vendor who owns it.
function loadApp(req) {
  const id = int(req.params.id, 0);
  const app = db.get('SELECT * FROM applications WHERE id = ?', id);
  if (!app) throw new HttpError(404, 'That application was not found.');
  const token = req.get('x-apply-token') || req.query.t || '';
  if (token && sha256(token) === app.resume_token_hash) return app;
  if (req.user && (app.owner_user_id === req.user.id || app.owner_email.toLowerCase() === req.user.email.toLowerCase())) return app;
  throw new HttpError(403, 'Sign in or use the link from your email to open this application.');
}

function businessOf(app) {
  return app.business_id ? db.get('SELECT * FROM businesses WHERE id = ?', app.business_id) : null;
}

function appView(app, { includeQr = false } = {}) {
  const m = markets.getMarketRow(app.market_id);
  const b = db.get('SELECT * FROM booths WHERE id = ?', app.booth_id || 0);
  const biz = businessOf(app);
  const docs = biz ? db.all('SELECT id, kind, filename, expires_on, created_at FROM documents WHERE business_id = ? ORDER BY id DESC', biz.id) : [];
  const view = {
    id: app.id,
    status: app.status,
    step: app.step,
    payment_status: app.payment_status,
    amount_cents: app.amount_cents,
    category: app.category,
    category_label: CATEGORIES[app.category] ? CATEGORIES[app.category].label : '',
    answers: JSON.parse(app.answers || '{}'),
    terms_accepted: !!app.terms_accepted_at,
    more_info_note: app.more_info_note,
    submitted_at: app.submitted_at,
    attendance: app.attendance,
    market: m ? { id: m.id, name: m.name, city: m.city, date: m.date, venue: m.venue, start_time: m.start_time, end_time: m.end_time, terms: m.terms, floor_plan_url: m.floor_plan_url, status: markets.effectiveStatus(m) } : null,
    business: biz ? { id: biz.id, name: biz.name, category: biz.category, contact_person: biz.contact_person, phone: biz.phone, city: biz.city, description: biz.description, website: biz.website } : null,
    booth: b ? { id: b.id, number: b.number, tier: b.tier, type: b.type, price_cents: b.price_cents } : null,
    documents: docs,
    categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, questions: c.questions })),
    food_certificate_required: !!db.getSetting('food_certificate_required', true),
    hold_until: app.booth_id ? (db.get('SELECT held_until FROM booths WHERE id = ? AND held_application_id = ?', app.booth_id, app.id) || {}).held_until || null : null,
  };
  if (includeQr && app.qr_token && app.status === 'approved') {
    view.qr_data_url = qr.dataUrl(qr.vendorCode(app.qr_token));
  }
  return view;
}

// ---------- start (VEN-02) ----------

function startApplication({ market_id, email }) {
  const m = markets.getMarketRow(int(market_id));
  if (!m || !markets.applicationsOpen(m)) throw new HttpError(409, 'Applications are not open for this market.');
  const e = cleanEmail(email);
  const account = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', e);
  if (account) {
    // The email already exists: the vendor signs in first, then picks a business (VEN-02, VEN-15).
    return { needs_sign_in: true, email: e, has_password: !!account.password_hash, can_use_code: auth.rolesOf(account).includes('vendor') };
  }
  const now = nowIso();
  const token = randomToken(24);
  const info = db.run(
    `INSERT INTO applications (market_id, owner_email, step, status, date_started, last_saved_at, resume_token_hash, created_at, updated_at)
     VALUES (?, ?, 'details', 'draft', ?, ?, ?, ?, ?)`,
    m.id, e, now, now, sha256(token), now, now
  );
  const app = db.get('SELECT * FROM applications WHERE id = ?', info.lastInsertRowid);
  notify.sendTemplate('application_unfinished', e, { market_name: m.name, link: notify.appUrl('/app/apply.html?t=' + token) }, {});
  return { needs_sign_in: false, application_id: app.id, token, app: appView(app) };
}

// Signed-in vendor starts an application for a market: choose or create the business in step 1.
function startForAccount(user, { market_id }) {
  const m = markets.getMarketRow(int(market_id));
  if (!m || !markets.applicationsOpen(m)) throw new HttpError(409, 'Applications are not open for this market.');
  const now = nowIso();
  if (!auth.rolesOf(user).includes('vendor')) {
    db.run("UPDATE users SET roles = roles || ',vendor' WHERE id = ?", user.id);
  }
  const info = db.run(
    `INSERT INTO applications (market_id, owner_email, owner_user_id, step, status, date_started, last_saved_at, resume_token_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'details', 'draft', ?, ?, ?, ?, ?)`,
    m.id, user.email, user.id, now, now, sha256(randomToken(8)), now, now
  );
  return appView(db.get('SELECT * FROM applications WHERE id = ?', info.lastInsertRowid));
}

// ---------- save progress (VEN-05, VEN-13) ----------

function upsertBusiness(app, input) {
  const name = reqStr(input.name, 'Business name', 120);
  const category = str(input.category, 40);
  const fields = {
    name,
    category,
    contact_person: str(input.contact_person, 120),
    phone: str(input.phone, 40),
    email: str(input.email, 200) || app.owner_email,
    city: str(input.city, 80),
    description: str(input.description, 2000),
    website: str(input.website, 200),
  };
  const now = nowIso();
  if (app.business_id) {
    db.run(
      'UPDATE businesses SET name=?, category=?, contact_person=?, phone=?, email=?, city=?, description=?, website=?, updated_at=? WHERE id=?',
      fields.name, fields.category, fields.contact_person, fields.phone, fields.email, fields.city, fields.description, fields.website, now, app.business_id
    );
    return app.business_id;
  }
  const info = db.run(
    `INSERT INTO businesses (owner_email, owner_user_id, name, category, contact_person, phone, email, city, description, website, socials, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
    app.owner_email, app.owner_user_id, fields.name, fields.category, fields.contact_person, fields.phone, fields.email, fields.city,
    fields.description, fields.website, now, now
  );
  return info.lastInsertRowid;
}

// Pick one of the signed-in vendor's saved businesses (VEN-37) or a new one.
function chooseBusiness(app, businessId) {
  const biz = db.get('SELECT * FROM businesses WHERE id = ? AND owner_email = ? COLLATE NOCASE', int(businessId), app.owner_email);
  if (!biz) throw new HttpError(404, 'That business is not on your account.');
  return biz.id;
}

function saveProgress(app, body = {}) {
  const now = nowIso();
  let businessId = app.business_id;
  if (body.business_id !== undefined && body.business_id !== null && body.business_id !== '') {
    businessId = chooseBusiness(app, body.business_id);
  } else if (body.business && typeof body.business === 'object') {
    businessId = upsertBusiness({ ...app, business_id: app.business_id }, body.business);
  }
  let category = app.category;
  if (body.category !== undefined) {
    if (body.category && !CATEGORIES[body.category]) throw new HttpError(400, 'Choose one of the listed categories.');
    category = body.category || '';
  }
  let answers = JSON.parse(app.answers || '{}');
  if (body.answers && typeof body.answers === 'object') {
    answers = { ...answers, ...Object.fromEntries(Object.entries(body.answers).map(([k, v]) => [k, typeof v === 'boolean' ? v : str(v, 500)])) };
  }
  db.run(
    'UPDATE applications SET business_id=?, category=?, answers=?, last_saved_at=?, updated_at=? WHERE id=?',
    businessId, category, JSON.stringify(answers), now, now, app.id
  );
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

// Validate that a step is complete before moving on (VEN-05).
function validateStep(app, step) {
  const biz = app.business_id ? db.get('SELECT * FROM businesses WHERE id = ?', app.business_id) : null;
  if (step === 'details') {
    if (!biz) throw new HttpError(400, 'Add your business details first.');
    if (!biz.name || !biz.contact_person || !biz.phone || !biz.city) throw new HttpError(400, 'Business name, contact person, phone and city are required.');
  }
  if (step === 'category') {
    if (!app.category) throw new HttpError(400, 'Choose a category.');
    const answers = JSON.parse(app.answers || '{}');
    const isFood = answers.is_food === true || answers.is_food === 'true';
    for (const q of CATEGORIES[app.category].questions) {
      const need = q.required || (q.requiredIfFood && isFood);
      if (need && !String(answers[q.key] || '').trim()) throw new HttpError(400, `${q.label} is required.`);
    }
  }
  if (step === 'booth') {
    if (!app.booth_id) throw new HttpError(400, 'Choose a booth.');
  }
  if (step === 'terms') {
    if (!app.terms_accepted_at) throw new HttpError(400, 'Accept the event terms to continue.');
  }
}

function foodNeedsCertificate(app) {
  const answers = JSON.parse(app.answers || '{}');
  const isFood = answers.is_food === true || answers.is_food === 'true';
  return isFood && !!db.getSetting('food_certificate_required', true);
}

function validCertificate(bizId) {
  if (!bizId) return null;
  return db.get(
    "SELECT * FROM documents WHERE business_id = ? AND kind = 'food_certificate' AND (expires_on IS NULL OR expires_on >= ?) ORDER BY id DESC LIMIT 1",
    bizId, todayYmd()
  );
}

// Save a document on the business (VEN-39). Attached automatically to future applications while valid.
function addDocument(app, body) {
  const biz = businessOf(app);
  if (!biz) throw new HttpError(400, 'Add your business details first.');
  const dataUrl = String(body.data_url || '');
  if (!/^data:(application\/pdf|image\/(png|jpeg|webp));base64,/.test(dataUrl)) {
    throw new HttpError(400, 'Upload a PDF, PNG, JPG or WEBP file.');
  }
  if (dataUrl.length > 8 * 1024 * 1024) throw new HttpError(400, 'That file is too large (8 MB max).');
  const expires = str(body.expires_on, 10) || null;
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new HttpError(400, 'Use the date format YYYY-MM-DD for the expiry date.');
  if (expires && expires < todayYmd()) throw new HttpError(400, 'That document has already expired.');
  db.run(
    'INSERT INTO documents (business_id, kind, filename, data_url, expires_on, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    biz.id, str(body.kind, 40) || 'food_certificate', str(body.filename, 120) || 'certificate', dataUrl, expires, nowIso()
  );
  return { ok: true };
}

// ---------- booth hold (VEN-18, VEN-20) ----------

function holdBooth(app, boothId) {
  const b = db.get('SELECT * FROM booths WHERE id = ? AND market_id = ?', int(boothId), app.market_id);
  if (!b) throw new HttpError(404, 'That booth was not found for this market.');
  const at = nowIso();
  const status = markets.boothStatus(b, app.id, at);
  if (status !== 'available') {
    const message = status === 'held' ? 'That booth is being paid for by another vendor right now. Choose another.' : 'That booth is taken or reserved. Choose another or join the waitlist.';
    throw new HttpError(409, message);
  }
  const app0 = db.get('SELECT * FROM applications WHERE id = ?', app.id);
  const holdMinutes = db.getSetting('booth_hold_minutes', 15);
  db.tx(() => {
    if (app0.booth_id && app0.booth_id !== b.id) {
      db.run('UPDATE booths SET held_application_id = NULL, held_until = NULL WHERE id = ? AND held_application_id = ?', app0.booth_id, app.id);
    }
    db.run('UPDATE booths SET held_application_id = ?, held_until = ? WHERE id = ?', app.id, addMinutes(at, holdMinutes), b.id);
    db.run('UPDATE applications SET booth_id = ?, updated_at = ?, last_saved_at = ? WHERE id = ?', b.id, at, at, app.id);
  });
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

// Join the waitlist when the wanted tier is gone (VEN-19).
function joinWaitlist(app, tier) {
  const t = reqStr(tier, 'Tier', 40);
  const exists = db.get("SELECT id FROM booths WHERE market_id = ? AND tier = ?", app.market_id, t);
  if (!exists) throw new HttpError(400, 'That tier does not exist for this market.');
  const at = nowIso();
  db.tx(() => {
    db.run("UPDATE applications SET status = 'waitlisted', updated_at = ? WHERE id = ?", at, app.id);
    const w = db.get("SELECT id FROM waitlist WHERE application_id = ? AND status IN ('waiting','offered')", app.id);
    if (!w) db.run("INSERT INTO waitlist (market_id, application_id, tier, status, created_at) VALUES (?, ?, ?, 'waiting', ?)", app.market_id, app.id, t, at);
  });
  const biz = businessOf(app);
  const m = markets.getMarketRow(app.market_id);
  notify.notifyEmail(app.owner_email, 'waitlist_joined', { name: biz ? biz.contact_person : '', market_name: m.name }, {
    title: 'You joined the waitlist', body: `${m.name}, ${t}`, link: '/app/vendor.html#/applications',
  });
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

// ---------- terms and payment (VEN-21 to VEN-23) ----------

function acceptTerms(app) {
  db.run('UPDATE applications SET terms_accepted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), app.id);
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

async function pay(app, actorLabel = 'vendor') {
  const fresh = db.get('SELECT * FROM applications WHERE id = ?', app.id);
  if (fresh.payment_status === 'paid') throw new HttpError(409, 'This application is already paid.');
  if (!fresh.booth_id) throw new HttpError(400, 'Choose a booth first.');
  if (!fresh.terms_accepted_at) throw new HttpError(400, 'Accept the event terms before paying.');
  if (foodNeedsCertificate(fresh) && !validCertificate(fresh.business_id)) {
    throw new HttpError(400, 'Food vendors must upload a valid city food certificate before paying.');
  }
  const booth = db.get('SELECT * FROM booths WHERE id = ?', fresh.booth_id);
  const at = nowIso();
  if (!(booth.held_application_id === fresh.id && booth.held_until > at) && markets.boothStatus(booth, fresh.id, at) !== 'available') {
    throw new HttpError(409, 'Your booth hold expired or the booth was taken. Choose a booth again.');
  }
  // Extend the hold while the vendor pays, so the booth cannot disappear mid-checkout.
  db.run('UPDATE booths SET held_until = ? WHERE id = ?', addMinutes(at, db.getSetting('booth_hold_minutes', 15)), booth.id);
  const m = markets.getMarketRow(fresh.market_id);
  const result = await payments.startCharge({
    kind: 'booth_fee',
    ref: fresh.id,
    description: `${m.name}: booth ${booth.number} (${booth.tier})`,
    amount_cents: booth.price_cents,
    successPath: `/app/apply.html?paid=${fresh.id}`,
    cancelPath: '/app/apply.html?cancelled=1',
  });
  if (result.status === 'failed') {
    recordPayment(fresh.id, 'booth_fee', booth.price_cents, 'failed', result.provider, null, actorLabel, 'Payment declined');
    db.run("UPDATE applications SET payment_status = 'failed', updated_at = ? WHERE id = ?", at, fresh.id);
    throw new HttpError(402, 'The payment did not go through. Your booth is still held for a few minutes, so you can try again.');
  }
  if (result.status === 'pending') {
    db.run('UPDATE applications SET amount_cents = ?, updated_at = ? WHERE id = ?', booth.price_cents, at, fresh.id);
    return { redirect: result.checkout_url, status: 'pending' };
  }
  completeBoothPayment(fresh.id, result.ref, result.provider, actorLabel);
  return { status: 'paid' };
}

function recordPayment(appId, kind, amount, status, provider, ref, by, note) {
  db.run(
    'INSERT INTO payments (application_id, kind, amount_cents, status, provider, provider_ref, triggered_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    appId, kind, amount, status, provider, ref, null, note || '', nowIso()
  );
}

// Called after a successful charge (simulated immediately, or after Stripe returns).
function completeBoothPayment(appId, providerRef, provider, label) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', appId);
  if (app.payment_status === 'paid') return app;
  const booth = db.get('SELECT * FROM booths WHERE id = ?', app.booth_id);
  const at = nowIso();
  db.tx(() => {
    recordPayment(app.id, 'booth_fee', booth.price_cents, 'succeeded', provider, providerRef, label, 'Booth fee');
    db.run(
      `UPDATE applications SET payment_status='paid', amount_cents=?, status='under_review', step='done',
       submitted_at=?, qr_token=COALESCE(qr_token, ?), updated_at=?, last_saved_at=? WHERE id=?`,
      booth.price_cents, at, randomToken(16), at, at, app.id
    );
    db.run('UPDATE booths SET assigned_application_id = ?, held_application_id = NULL, held_until = NULL WHERE id = ?', app.id, booth.id);
    db.run("UPDATE waitlist SET status = 'taken' WHERE application_id = ? AND status = 'offered'", app.id);
  });
  const biz = businessOf(app);
  const m = markets.getMarketRow(app.market_id);
  const contact = biz ? biz.contact_person || biz.name : '';
  // A first paid application creates the vendor account and sends the set-password link (VEN-01, NOT-03).
  let user = app.owner_user_id ? db.get('SELECT * FROM users WHERE id = ?', app.owner_user_id) : null;
  if (!user) user = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', app.owner_email);
  if (!user) {
    const info = db.run(
      "INSERT INTO users (email, name, phone, roles, status, created_at) VALUES (?, ?, ?, 'vendor', 'invited', ?)",
      app.owner_email, contact, biz ? biz.phone : '', at
    );
    user = db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    const token = auth.issueSetupToken(user.id, 72);
    notify.sendTemplate('vendor_welcome', user.email, { name: contact, market_name: m.name, link: notify.appUrl('/app/set-password.html?t=' + token) });
  } else if (!auth.rolesOf(user).includes('vendor')) {
    db.run("UPDATE users SET roles = roles || ',vendor' WHERE id = ?", user.id);
  }
  db.run('UPDATE applications SET owner_user_id = ? WHERE id = ?', user.id, app.id);
  if (biz) db.run('UPDATE businesses SET owner_user_id = ? WHERE id = ?', user.id, biz.id);
  db.run('UPDATE businesses SET owner_user_id = ? WHERE owner_email = ? COLLATE NOCASE', user.id, app.owner_email);

  const vars = { name: contact, market_name: m.name, amount: (booth.price_cents / 100).toFixed(2), booth_number: booth.number };
  notify.sendTemplate('payment_receipt', app.owner_email, vars);
  notify.sendTemplate('application_received', app.owner_email, vars);
  notify.addBell(user.id, 'Application under review', `${m.name}, booth ${booth.number}`, '/app/vendor.html#/applications');
  for (const admin of db.all("SELECT email FROM users WHERE roles LIKE '%admin%' AND status = 'active'")) {
    notify.sendTemplate('admin_new_application', admin.email, { business_name: biz ? biz.name : '', market_name: m.name, link: notify.appUrl('/app/admin.html#/applications/' + app.id) });
  }
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

// ---------- vendor resubmits after "more info" (VEN-25) ----------

function resubmit(app) {
  if (app.status !== 'more_info') throw new HttpError(409, 'Nothing is waiting for your reply on this application.');
  db.run("UPDATE applications SET status = 'under_review', updated_at = ? WHERE id = ?", nowIso(), app.id);
  notify.addBell(app.owner_user_id || 0, 'Application resubmitted', markets.getMarketRow(app.market_id).name, '/app/vendor.html#/applications');
  return db.get('SELECT * FROM applications WHERE id = ?', app.id);
}

// ---------- admin decisions ----------

function listApplications(filters = {}) {
  const where = ['1=1'];
  const params = [];
  if (filters.market_id) { where.push('a.market_id = ?'); params.push(int(filters.market_id)); }
  if (filters.status) { where.push('a.status = ?'); params.push(filters.status); }
  if (filters.category) { where.push('a.category = ?'); params.push(filters.category); }
  if (filters.payment) { where.push('a.payment_status = ?'); params.push(filters.payment); }
  if (filters.paid_only) where.push("a.payment_status = 'paid'");
  const rows = db.all(
    `SELECT a.*, b.name AS business_name, bo.number AS booth_number, bo.tier AS booth_tier, m.name AS market_name
     FROM applications a
     LEFT JOIN businesses b ON b.id = a.business_id
     LEFT JOIN booths bo ON bo.id = a.booth_id
     JOIN markets m ON m.id = a.market_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.submitted_at IS NULL, a.submitted_at DESC, a.id DESC`,
    ...params
  );
  return rows.map((r) => ({
    id: r.id, market_id: r.market_id, market_name: r.market_name, business: r.business_name || '', owner_email: r.owner_email,
    category: r.category, booth: r.booth_number || '', tier: r.booth_tier || '', status: r.status, payment_status: r.payment_status,
    submitted_at: r.submitted_at, date_started: r.date_started, step: r.step, attendance: r.attendance,
    hidden_from_directory: !!r.hidden_from_directory,
  }));
}

function unfinishedApplications(marketId) {
  const rows = db.all(
    "SELECT a.*, b.name AS business_name, m.name AS market_name FROM applications a LEFT JOIN businesses b ON b.id = a.business_id JOIN markets m ON m.id = a.market_id WHERE a.payment_status != 'paid' AND a.status IN ('draft','waitlisted') AND (? IS NULL OR a.market_id = ?) ORDER BY a.last_saved_at DESC",
    marketId ? int(marketId) : null, marketId ? int(marketId) : null
  );
  return rows.map((r) => ({ id: r.id, owner_email: r.owner_email, business: r.business_name || '', market: r.market_name, last_step: r.step, date_started: r.date_started, reminders_sent: r.reminders_sent, market_id: r.market_id }));
}

function appDetail(id) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  const view = appView(app, { includeQr: true });
  view.id = app.id;
  view.owner_email = app.owner_email;
  view.owner_user_id = app.owner_user_id;
  view.attendance = app.attendance;
  view.hidden_from_directory = !!app.hidden_from_directory;
  view.payments = db.all('SELECT kind, amount_cents, status, provider, created_at, note FROM payments WHERE application_id = ? ORDER BY id', app.id);
  view.notes = db.all('SELECT n.id, n.body, n.created_at, u.name AS author FROM admin_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.application_id = ? ORDER BY n.id DESC', app.id);
  view.waitlist = db.all('SELECT * FROM waitlist WHERE application_id = ?', app.id);
  return view;
}

function approve(actor, id) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  if (app.payment_status !== 'paid' || !app.booth_id) throw new HttpError(409, 'Only paid applications with a booth can be approved.');
  if (!['under_review', 'more_info'].includes(app.status)) throw new HttpError(409, 'This application is not waiting for review.');
  const at = nowIso();
  db.tx(() => {
    db.run("UPDATE applications SET status='approved', updated_at=? WHERE id=?", at, app.id);
    db.run('UPDATE booths SET confirmed = 1 WHERE id = ?', app.booth_id);
  });
  const booth = db.get('SELECT * FROM booths WHERE id = ?', app.booth_id);
  const m = markets.getMarketRow(app.market_id);
  const biz = businessOf(app);
  const vars = { name: biz ? biz.contact_person : '', first_name: '', market_name: m.name, market_date: m.date, venue: m.venue, booth_number: booth.number, start_time: m.start_time, qr_link: notify.appUrl('/app/vendor.html#/applications/' + app.id) };
  notify.notifyEmail(app.owner_email, 'application_approved', vars, {
    title: `Approved: booth ${booth.number} at ${m.name}`, body: 'Your vendor QR code is ready', link: '/app/vendor.html#/applications/' + app.id,
  });
  markets.logActivity(actor, 'application.approved', `${biz ? biz.name : app.owner_email} at ${m.name}`);
  return appDetail(app.id);
}

function requestMoreInfo(actor, id, note) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  if (app.payment_status !== 'paid') throw new HttpError(409, 'Only paid applications can be sent back for more information.');
  const message = reqStr(note, 'What do you need from the vendor?', 2000);
  db.run("UPDATE applications SET status='more_info', more_info_note=?, updated_at=? WHERE id=?", message, nowIso(), app.id);
  const m = markets.getMarketRow(app.market_id);
  const biz = businessOf(app);
  notify.notifyEmail(app.owner_email, 'more_info_requested', { name: biz ? biz.contact_person : '', market_name: m.name, message, link: notify.appUrl('/app/vendor.html#/applications/' + app.id) }, {
    title: 'More information needed', body: m.name, link: '/app/vendor.html#/applications/' + app.id,
  });
  markets.logActivity(actor, 'application.more_info', `${app.id}: ${message.slice(0, 80)}`);
  return appDetail(app.id);
}

// Decline even after payment: refund through the payment provider, release the booth (ADM-21).
async function decline(actor, id) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  if (app.status === 'declined') throw new HttpError(409, 'This application is already declined.');
  const paid = db.get("SELECT * FROM payments WHERE application_id = ? AND kind = 'booth_fee' AND status = 'succeeded' ORDER BY id DESC LIMIT 1", app.id);
  let refundAmount = 0;
  if (paid) {
    const existingRefund = db.get("SELECT id FROM payments WHERE application_id = ? AND kind = 'refund' AND status = 'refunded'", app.id);
    if (!existingRefund) {
      const r = await payments.refund({ ref: paid.provider_ref, amount_cents: paid.amount_cents, provider: paid.provider });
      if (r.status !== 'refunded') throw new HttpError(502, 'The refund could not be made. The application was not declined. Try again or refund in Stripe.');
      db.run(
        "INSERT INTO payments (application_id, kind, amount_cents, status, provider, provider_ref, triggered_by, note, created_at) VALUES (?, 'refund', ?, 'refunded', ?, ?, ?, ?, ?)",
        app.id, paid.amount_cents, paid.provider, r.ref, actor ? actor.id : null, 'Declined by admin, automatic refund', nowIso()
      );
      refundAmount = paid.amount_cents;
    }
  }
  const at = nowIso();
  db.tx(() => {
    db.run("UPDATE applications SET status='declined', payment_status=?, updated_at=? WHERE id=?", paid ? 'refunded' : app.payment_status, at, app.id);
    if (app.booth_id) db.run('UPDATE booths SET assigned_application_id = NULL, confirmed = 0 WHERE id = ? AND assigned_application_id = ?', app.booth_id, app.id);
  });
  const m = markets.getMarketRow(app.market_id);
  const biz = businessOf(app);
  notify.notifyEmail(app.owner_email, 'application_declined', { name: biz ? biz.contact_person : '', market_name: m.name, amount: (refundAmount / 100).toFixed(2) }, {
    title: 'Application declined', body: refundAmount ? 'Your booth fee was refunded' : m.name, link: '/app/vendor.html#/applications/' + app.id,
  });
  markets.logActivity(actor, 'application.declined', `${app.id} ${m.name}`);
  return appDetail(app.id);
}

// Move a paid vendor to another free booth (ADM-25). Their QR code shows the new number at check-in.
function moveBooth(actor, id, boothId) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app || !app.booth_id) throw new HttpError(409, 'This application has no booth to move.');
  const target = db.get('SELECT * FROM booths WHERE id = ? AND market_id = ?', int(boothId), app.market_id);
  if (!target) throw new HttpError(404, 'That booth was not found for this market.');
  if (target.id === app.booth_id) return appDetail(app.id);
  if (markets.boothStatus(target, null) !== 'available') throw new HttpError(409, 'That booth is not free.');
  const old = db.get('SELECT * FROM booths WHERE id = ?', app.booth_id);
  db.tx(() => {
    db.run('UPDATE booths SET assigned_application_id = NULL, confirmed = 0 WHERE id = ?', old.id);
    db.run('UPDATE booths SET assigned_application_id = ?, confirmed = ? WHERE id = ?', app.id, app.status === 'approved' ? 1 : 0, target.id);
    db.run('UPDATE applications SET booth_id = ?, updated_at = ? WHERE id = ?', target.id, nowIso(), app.id);
  });
  const m = markets.getMarketRow(app.market_id);
  notify.notifyEmail(app.owner_email, 'application_approved', { name: '', market_name: m.name, booth_number: target.number, market_date: m.date, venue: m.venue, qr_link: notify.appUrl('/app/vendor.html#/applications/' + app.id) }, {
    title: `Your booth is now ${target.number}`, body: m.name, link: '/app/vendor.html#/applications/' + app.id,
  });
  markets.logActivity(actor, 'application.moved', `${app.id}: ${old.number} to ${target.number}`);
  return appDetail(app.id);
}

function addNote(actor, id, body) {
  const app = db.get('SELECT id FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  db.run('INSERT INTO admin_notes (application_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', app.id, actor.id, reqStr(body, 'Note', 2000), nowIso());
  return appDetail(app.id);
}

// Offer a released booth to the next waitlisted vendor (ADM-26, VEN-31, NOT-12).
function offerWaitlist(actor, waitlistId, boothId) {
  const w = db.get('SELECT * FROM waitlist WHERE id = ?', int(waitlistId));
  if (!w || w.status !== 'waiting') throw new HttpError(404, 'That waitlist entry is not waiting.');
  const booth = db.get('SELECT * FROM booths WHERE id = ? AND market_id = ?', int(boothId), w.market_id);
  if (!booth || booth.tier !== w.tier) throw new HttpError(400, 'Choose a booth in the tier the vendor asked for.');
  if (markets.boothStatus(booth, null) !== 'available') throw new HttpError(409, 'That booth is not free.');
  const hours = db.getSetting('waitlist_pay_hours', 48);
  const at = nowIso();
  const token = randomToken(24);
  db.tx(() => {
    db.run('UPDATE booths SET held_application_id = ?, held_until = ? WHERE id = ?', w.application_id, addMinutes(at, hours * 60), booth.id);
    db.run("UPDATE applications SET status='offered', booth_id=?, resume_token_hash=?, updated_at=? WHERE id=?", booth.id, sha256(token), at, w.application_id);
    db.run("UPDATE waitlist SET status='offered' WHERE id=?", w.id);
  });
  const app = db.get('SELECT * FROM applications WHERE id = ?', w.application_id);
  const m = markets.getMarketRow(app.market_id);
  const biz = businessOf(app);
  notify.notifyEmail(app.owner_email, 'waitlist_offer', { name: biz ? biz.contact_person : '', market_name: m.name, hours, link: notify.appUrl('/app/apply.html?t=' + token) }, {
    title: `A booth is available at ${m.name}`, body: `${booth.number}, accept terms and pay within ${hours} hours`, link: '/app/vendor.html#/applications/' + app.id,
  });
  markets.logActivity(actor, 'waitlist.offered', `${booth.number} to application ${app.id}`);
  return { ok: true, application_id: app.id, booth: booth.number, hold_hours: hours };
}

// Unfinished applications: send a reminder with a fresh link, up to the limit set by admin (NOT-04, VEN-16).
function remindUnfinished(app, actor = null) {
  const m = markets.getMarketRow(app.market_id);
  const token = randomToken(24);
  db.run('UPDATE applications SET resume_token_hash = ?, reminders_sent = reminders_sent + 1, last_reminder_at = ? WHERE id = ?', sha256(token), nowIso(), app.id);
  notify.sendTemplate('application_unfinished', app.owner_email, { market_name: m.name, link: notify.appUrl('/app/apply.html?t=' + token) });
  return true;
}

// Manual refund for a paid booth without declining the application (ADM-37).
async function refundPayment(actor, id, note) {
  const app = db.get('SELECT * FROM applications WHERE id = ?', int(id));
  if (!app) throw new HttpError(404, 'That application was not found.');
  const paid = db.get("SELECT * FROM payments WHERE application_id = ? AND kind = 'booth_fee' AND status = 'succeeded' ORDER BY id DESC LIMIT 1", app.id);
  if (!paid) throw new HttpError(409, 'There is no successful booth payment to refund.');
  const r = await payments.refund({ ref: paid.provider_ref, amount_cents: paid.amount_cents, provider: paid.provider });
  if (r.status !== 'refunded') throw new HttpError(502, 'The refund could not be made. Try again or refund in Stripe.');
  db.run(
    "INSERT INTO payments (application_id, kind, amount_cents, status, provider, provider_ref, triggered_by, note, created_at) VALUES (?, 'refund', ?, 'refunded', ?, ?, ?, ?, ?)",
    app.id, paid.amount_cents, paid.provider, r.ref, actor ? actor.id : null, reqStr(note || 'Manual refund', 'Reason', 300), nowIso()
  );
  db.run("UPDATE applications SET payment_status = 'refunded', updated_at = ? WHERE id = ?", nowIso(), app.id);
  markets.logActivity(actor, 'payment.refunded', `application ${app.id}: ${paid.amount_cents} cents`);
  return appDetail(app.id);
}

module.exports = {
  refundPayment,
  CATEGORIES,
  STEPS,
  loadApp,
  appView,
  startApplication,
  startForAccount,
  saveProgress,
  upsertBusiness,
  validateStep,
  addDocument,
  holdBooth,
  joinWaitlist,
  acceptTerms,
  pay,
  completeBoothPayment,
  resubmit,
  listApplications,
  unfinishedApplications,
  appDetail,
  approve,
  requestMoreInfo,
  decline,
  moveBooth,
  addNote,
  offerWaitlist,
  remindUnfinished,
  foodNeedsCertificate,
  validCertificate,
  businessOf,
  CATEGORIES_LIST: () => Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label })),
};
