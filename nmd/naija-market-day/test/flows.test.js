'use strict';
// End-to-end flow test against a fresh database. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TMP = process.env.NMD_TEST_DIR || require('os').tmpdir();
fs.mkdirSync(TMP, { recursive: true });
const DB_FILE = path.join(TMP, 'test-' + Date.now() + '.sqlite');
process.env.DB_FILE = DB_FILE;
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-pass-123';
process.env.APP_URL = 'http://localhost:0';

const { createApp } = require('../server/index');
const db = require('../server/db');
const scheduler = require('../server/scheduler');

let base;
let server;
const jars = {};

// Calls without `as` are anonymous: they send no cookie and store none.
async function call(method, url, { body, as = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (as && jars[as]) headers.Cookie = jars[as];
  const res = await fetch(base + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const setCookie = res.headers.get('set-cookie');
  if (as && setCookie && setCookie.startsWith('nmd_session=') && !setCookie.includes('Max-Age=0')) {
    jars[as] = setCookie.split(';')[0];
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const expectOk = (r, msg) => assert.ok(r.status < 300, (msg || '') + ' -> ' + r.status + ' ' + JSON.stringify(r.body));

function outboxFor(to, contains = '') {
  return db.all('SELECT * FROM outbox WHERE to_address = ? COLLATE NOCASE ORDER BY id', to).filter((o) => o.body.includes(contains) || o.subject.includes(contains));
}
function tokenFrom(body) {
  const m = /[?&]t=([A-Za-z0-9_-]+)/.exec(body);
  return m ? m[1] : null;
}

test.before(async () => {
  const { app } = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(() => { server.close(); });

test('full platform flow', async () => {
  // ---------- admin sets up a market ----------
  let r = await call('POST', '/auth/login', { body: { email: 'admin@test.local', password: 'admin-pass-123', portal: 'admin' }, as: 'admin' });
  expectOk(r, 'admin login');

  r = await call('POST', '/admin/markets', { as: 'admin', body: { name: 'Brampton Summer Market', city: 'Brampton', venue: 'Civic Square', season: '2026', date: '2099-07-10', start_time: '10:00', end_time: '18:00', guest_capacity: 3, vendor_capacity: 20, app_opens_on: '2000-01-01', app_closes_on: '2099-06-01', terms: 'No refunds after payment.' } });
  expectOk(r, 'create market');
  const mid = r.body.id;

  r = await call('POST', '/admin/markets/' + mid + '/booths', { as: 'admin', body: { from: 1, to: 3, tier: 'VIP', type: 'standard', price: '300' } });
  expectOk(r, 'add VIP booths');
  r = await call('POST', '/admin/markets/' + mid + '/booths', { as: 'admin', body: { from: 4, to: 5, tier: 'Standard', type: 'food', price: '120' } });
  expectOk(r, 'add standard booths');

  r = await call('POST', '/admin/markets/' + mid + '/publish', { as: 'admin' });
  expectOk(r, 'publish');

  r = await call('GET', '/markets');
  assert.ok(r.body.some((m) => m.id === mid && m.effective_status === 'published'), 'public list has market');

  // ---------- guest registration (WEB-14/15, NOT-01, capacity WEB-16) ----------
  r = await call('POST', '/markets/' + mid + '/register', { body: { name: 'Ngozi Eze', email: 'ngozi@example.com', phone: '555', guests_count: 2 } });
  expectOk(r, 'guest register');
  const guestToken = r.body.guest.qr_token;
  assert.ok(outboxFor('ngozi@example.com', 'registered').length === 1, 'guest confirmation queued');
  r = await call('POST', '/markets/' + mid + '/register', { body: { name: 'Too Many', email: 'many@example.com', guests_count: 5 } });
  assert.equal(r.status, 409, 'capacity enforced');
  r = await call('GET', '/tickets/' + guestToken);
  assert.ok(r.body.qr_data_url.startsWith('data:image/svg+xml'), 'guest QR generated');

  // ---------- new vendor applies with just an email (VEN-02, VEN-13) ----------
  r = await call('POST', '/apply/start', { body: { market_id: mid, email: 'ama@example.com' } });
  expectOk(r, 'start application');
  const appId = r.body.application_id;
  const token = r.body.token;
  const H = (extra = {}) => ({ ...extra });

  // Use the token via the resume-link header.
  async function applyCall(method, url, body) {
    const headers = { 'Content-Type': 'application/json', 'x-apply-token': token };
    const res = await fetch(base + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  r = await applyCall('PUT', '/apply/' + appId, { business: { name: 'Ama Kitchen', category: 'premium', contact_person: 'Ama Mensah', phone: '555-1', city: 'Brampton' } });
  expectOk(r, 'save business');
  r = await applyCall('PUT', '/apply/' + appId, { complete_step: 'details' });
  expectOk(r, 'complete details');
  assert.equal(r.body.step, 'category', 'completing a step moves to the next one');

  r = await applyCall('PUT', '/apply/' + appId, { category: 'premium', answers: { is_food: true, what_you_sell: 'Jollof and puff-puff' } });
  r = await applyCall('PUT', '/apply/' + appId, { complete_step: 'category' });
  assert.equal(r.status, 400, 'food vendor must give certification number');
  r = await applyCall('PUT', '/apply/' + appId, { answers: { city_certification_number: 'FC-99812' } });
  r = await applyCall('PUT', '/apply/' + appId, { complete_step: 'category' });
  expectOk(r, 'complete category');

  r = await applyCall('GET', '/apply/' + appId + '/booths');
  expectOk(r, 'booths');
  const vip = r.body.find((b) => b.number === '1');
  assert.equal(vip.status, 'available');

  r = await applyCall('POST', '/apply/' + appId + '/booth', { booth_id: vip.id });
  expectOk(r, 'hold booth');

  r = await applyCall('PUT', '/apply/' + appId, { complete_step: 'booth' });
  expectOk(r, 'complete booth');

  r = await applyCall('POST', '/apply/' + appId + '/pay', {});
  assert.equal(r.status, 400, 'terms required before paying');
  r = await applyCall('POST', '/apply/' + appId + '/terms', { accepted: true });
  expectOk(r, 'accept terms');

  // Food vendor needs a valid certificate on file (VEN-12).
  r = await applyCall('POST', '/apply/' + appId + '/pay', {});
  assert.equal(r.status, 400, 'food certificate required');
  r = await applyCall('POST', '/apply/' + appId + '/documents', { kind: 'food_certificate', filename: 'cert.pdf', data_url: 'data:application/pdf;base64,JVBERi0xLjQK', expires_on: '2099-01-01' });
  expectOk(r, 'upload certificate');

  // Simulated decline first (VEN-23): booth stays held and the payment is recorded as failed.
  process.env.SIMULATE_DECLINE = '1';
  r = await applyCall('POST', '/apply/' + appId + '/pay', {});
  assert.equal(r.status, 402, 'declined card');
  process.env.SIMULATE_DECLINE = '0';
  const boothRow = db.get('SELECT * FROM booths WHERE id = ?', vip.id);
  assert.equal(boothRow.assigned_application_id, null, 'failed payment does not confirm the booth');

  r = await applyCall('POST', '/apply/' + appId + '/pay', {});
  expectOk(r, 'pay booth fee');
  assert.equal(r.body.status, 'paid');

  const after = db.get('SELECT * FROM applications WHERE id = ?', appId);
  assert.equal(after.status, 'under_review');
  assert.equal(after.payment_status, 'paid');
  const vendorUser = db.get('SELECT * FROM users WHERE email = ?', 'ama@example.com');
  assert.equal(vendorUser.status, 'invited', 'account created in invited state after first payment');
  assert.ok(vendorUser.roles.includes('vendor'));
  const welcome = outboxFor('ama@example.com', 'Set a password');
  assert.ok(welcome.length >= 1, 'welcome email with set-password link');
  const setupToken = tokenFrom(welcome[0].body + ' ' + welcome[0].body.replace(/\n/g, ' '));
  assert.ok(setupToken || welcome[0].body.includes('set-password'), 'setup link present');
  const linkMatch = /set-password\.html\?t=([A-Za-z0-9_-]+)/.exec(welcome[0].body);
  assert.ok(linkMatch, 'token in welcome link');

  // Invited vendors cannot sign in until they set a password.
  r = await call('POST', '/auth/login', { body: { email: 'ama@example.com', password: 'whatever1', portal: 'vendor' } });
  assert.equal(r.status, 401, 'no password yet');

  r = await call('POST', '/auth/password/set', { body: { token: linkMatch[1], password: 'ama-pass-123' }, as: 'setpw' });
  expectOk(r, 'set password');
  r = await call('POST', '/auth/login', { body: { email: 'ama@example.com', password: 'ama-pass-123', portal: 'vendor' }, as: 'ama' });
  expectOk(r, 'vendor login');

  r = await call('GET', '/vendor/dashboard', { as: 'ama' });
  expectOk(r, 'vendor dashboard');
  assert.equal(r.body.application_counts.under_review, 1);

  // ---------- admin reviews and approves (ADM-16, ADM-19) ----------
  r = await call('GET', '/admin/applications?market_id=' + mid, { as: 'admin' });
  assert.ok(r.body.some((a) => a.id === appId), 'application in admin list');
  r = await call('POST', '/admin/applications/' + appId + '/more-info', { as: 'admin', body: { note: 'Please confirm your booth needs power.' } });
  expectOk(r, 'more info');
  r = await call('POST', '/vendor/applications/' + appId + '/resubmit', { as: 'ama' });
  expectOk(r, 'resubmit');
  r = await call('POST', '/admin/applications/' + appId + '/approve', { as: 'admin' });
  expectOk(r, 'approve');
  assert.equal(r.body.status, 'approved');

  r = await call('GET', '/vendor/applications/' + appId + '/qr', { as: 'ama' });
  expectOk(r, 'vendor QR');
  assert.ok(r.body.qr_data_url.startsWith('data:image/svg+xml'));
  const vendorQrCode = 'NMD-V-' + db.get('SELECT qr_token FROM applications WHERE id = ?', appId).qr_token;

  // ---------- directory (WEB-17, WEB-18, WEB-21, ADM-38) ----------
  r = await call('GET', '/directory/markets/' + mid + '/vendors');
  assert.ok(r.body.some((v) => v.name === 'Ama Kitchen' && v.booth_number === '1'), 'vendor in market directory');
  r = await call('GET', '/directory/markets/' + mid + '/vendors?q=zzz');
  assert.equal(r.body.length, 0, 'search filters');

  // ---------- staff check-in (CHK-01 to CHK-08) ----------
  r = await call('POST', '/admin/users/invite', { as: 'admin', body: { email: 'gate@test.local', name: 'Gate Staff', role: 'staff', market_ids: [mid] } });
  expectOk(r, 'invite staff');
  const staffInvite = outboxFor('gate@test.local', 'invited');
  const staffToken = /set-password\.html\?t=([A-Za-z0-9_-]+)/.exec(staffInvite[0].body)[1];
  r = await call('POST', '/auth/password/set', { body: { token: staffToken, password: 'gate-pass-123' }, as: 'setpw' });
  expectOk(r, 'staff set password');
  r = await call('POST', '/auth/login', { body: { email: 'gate@test.local', password: 'gate-pass-123', portal: 'staff' }, as: 'staff' });
  expectOk(r, 'staff login');

  r = await call('POST', '/staff/scan', { as: 'staff', body: { market_id: mid, code: vendorQrCode } });
  assert.equal(r.body.result, 'ready');
  assert.equal(r.body.booth, '1');
  r = await call('POST', '/staff/checkin', { as: 'staff', body: { market_id: mid, code: vendorQrCode } });
  expectOk(r, 'vendor checkin');
  r = await call('POST', '/staff/checkin', { as: 'staff', body: { market_id: mid, code: vendorQrCode } });
  assert.equal(r.body.result, 'duplicate', 'second scan not counted twice');

  r = await call('POST', '/staff/checkin', { as: 'staff', body: { market_id: mid, code: 'NMD-G-' + guestToken } });
  expectOk(r, 'guest checkin');
  r = await call('POST', '/staff/walkin', { as: 'staff', body: { market_id: mid, name: 'Walk In Guest', guests_count: 1 } });
  expectOk(r, 'walk-in');
  r = await call('GET', '/staff/lookup?market_id=' + mid + '&q=ama', { as: 'staff' });
  assert.ok(r.body.some((x) => x.kind === 'vendor'), 'lookup finds vendor');
  r = await call('POST', '/staff/checkout', { as: 'staff', body: { market_id: mid, code: vendorQrCode } });
  expectOk(r, 'vendor checkout');

  // Staff cannot reach admin screens (ADM-64).
  r = await call('GET', '/admin/markets', { as: 'staff' });
  assert.equal(r.status, 403);

  // ---------- admin decline with automatic refund (ADM-21) ----------
  // A second vendor pays, then is declined.
  r = await call('POST', '/apply/start', { body: { market_id: mid, email: 'kojo@example.com' } });
  const app2 = r.body.application_id;
  const token2 = r.body.token;
  async function apply2(method, url, body) {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-apply-token': token2 }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: res.status, body: JSON.parse(await res.text()) };
  }
  await apply2('PUT', '/apply/' + app2, { business: { name: 'Kojo Crafts', category: 'general', contact_person: 'Kojo', phone: '555-2', city: 'Brampton' } });
  await apply2('PUT', '/apply/' + app2, { category: 'general', answers: { what_you_sell: 'Beaded bags' } });
  r = await apply2('GET', '/apply/' + app2 + '/booths');
  const b2 = r.body.find((b) => b.number === '2');
  await apply2('POST', '/apply/' + app2 + '/booth', { booth_id: b2.id });
  await apply2('POST', '/apply/' + app2 + '/terms', { accepted: true });
  r = await apply2('POST', '/apply/' + app2 + '/pay', {});
  expectOk(r, 'second pay');
  r = await call('POST', '/admin/applications/' + app2 + '/decline', { as: 'admin' });
  expectOk(r, 'decline');
  assert.equal(r.body.status, 'declined');
  assert.equal(r.body.payment_status, 'refunded');
  assert.ok(db.get("SELECT id FROM payments WHERE application_id = ? AND kind = 'refund'", app2), 'refund recorded');
  assert.equal(db.get('SELECT assigned_application_id FROM booths WHERE id = ?', b2.id).assigned_application_id, null, 'booth released');
  assert.ok(outboxFor('kojo@example.com', 'refunded').length >= 1, 'decline notice sent');

  // ---------- one-time codes (VEN-04) ----------
  r = await call('POST', '/apply/start', { body: { market_id: mid, email: 'ama@example.com' } });
  assert.equal(r.body.needs_sign_in, true, 'existing email must sign in, not create a second account');
  r = await call('POST', '/auth/otp/request', { body: { email: 'ama@example.com' } });
  expectOk(r, 'otp request');
  const codeRow = outboxFor('ama@example.com', 'sign-in code')[0];
  const code = /code is (\d{6})/.exec(codeRow.body)[1];
  r = await call('POST', '/auth/otp/verify', { body: { email: 'ama@example.com', code: '000000' === code ? '111111' : '000000' } });
  assert.equal(r.status, 401, 'wrong code rejected');
  r = await call('POST', '/auth/otp/verify', { body: { email: 'ama@example.com', code } });
  expectOk(r, 'correct code');
  r = await call('POST', '/auth/otp/verify', { body: { email: 'ama@example.com', code } });
  assert.equal(r.status, 401, 'code is usable once');

  // ---------- marketplace subscription, listings, buyer cart, chat (VEN-32, BUY-03 to BUY-08) ----------
  r = await call('GET', '/vendor/businesses', { as: 'ama' });
  const bizId = r.body[0].id;
  r = await call('POST', '/vendor/listings', { as: 'ama', body: { business_id: bizId, name: 'Jollof Pack', price: '20', sale_price: '15', description: 'Feeds two' } });
  assert.equal(r.status, 402, 'subscribe before listing');
  r = await call('POST', '/vendor/businesses/' + bizId + '/subscribe', { as: 'ama', body: { plan_code: 'monthly' } });
  expectOk(r, 'trial subscribe');
  assert.equal(r.body.status, 'trial');
  r = await call('POST', '/vendor/listings', { as: 'ama', body: { business_id: bizId, name: 'Jollof Pack', price: '20', sale_price: '15', description: 'Feeds two' } });
  expectOk(r, 'create listing');
  const listingId = r.body.id;

  r = await call('POST', '/auth/buyer/signup', { body: { name: 'Chidi Buyer', email: 'chidi@example.com', password: 'buyer-pass-1', marketing_consent: true } });
  expectOk(r, 'buyer signup');
  r = await call('GET', '/marketplace/listings');
  assert.ok(r.body.some((l) => l.id === listingId), 'listing public');
  r = await call('GET', '/marketplace/listings/' + listingId);
  assert.equal(r.body.saving_cents, 500, 'sale saving shown');
  r = await call('POST', '/buyer/cart', { body: { listing_id: listingId, qty: 2 } });
  assert.equal(r.status, 401, 'cart needs an account');
  r = await call('POST', '/auth/login', { body: { email: 'chidi@example.com', password: 'buyer-pass-1', portal: 'buyer' }, as: 'buyer' });
  expectOk(r, 'buyer login');
  r = await call('POST', '/buyer/cart', { as: 'buyer', body: { listing_id: listingId, qty: 2 } });
  expectOk(r, 'add to cart');
  assert.equal(r.body.groups[0].subtotal_cents, 3000);
  r = await call('POST', '/buyer/cart/proceed', { as: 'buyer', body: { business_id: bizId, acknowledged: false } });
  assert.equal(r.status, 400, 'disclaimer required');
  r = await call('POST', '/buyer/cart/proceed', { as: 'buyer', body: { business_id: bizId, acknowledged: true } });
  expectOk(r, 'proceed');
  const chatId = r.body.chat_id;
  r = await call('GET', '/buyer/cart', { as: 'buyer' });
  assert.equal(r.body.groups.length, 0, 'proceeded items removed');

  r = await call('POST', '/vendor/chats/' + chatId + '/messages', { as: 'ama', body: { body: 'Yes, available.', payment_link: 'javascript:alert(1)' } });
  assert.equal(r.status, 400, 'payment link must be https');
  r = await call('POST', '/vendor/chats/' + chatId + '/messages', { as: 'ama', body: { body: 'Yes, available. Pay here.', payment_link: 'https://pay.example.com/ama' } });
  expectOk(r, 'vendor reply');
  assert.ok(outboxFor('chidi@example.com', 'replied').length >= 1, 'buyer emailed on reply');
  r = await call('GET', '/buyer/chats', { as: 'buyer' });
  assert.equal(r.body[0].status, 'Vendor replied');

  // ---------- admin: dashboard, report, scheduler (ADM-01, ADM-60) ----------
  r = await call('GET', '/admin/dashboard?market_id=' + mid, { as: 'admin' });
  expectOk(r, 'dashboard');
  assert.ok(r.body.cards.booths_sold >= 1);
  r = await call('GET', '/admin/markets/' + mid + '/report', { as: 'admin' });
  assert.equal(r.body.attended >= 1, true);
  r = await call('POST', '/admin/scheduler/run', { as: 'admin' });
  expectOk(r, 'scheduler');

  // ---------- content and public site ----------
  r = await call('POST', '/admin/content/blog_posts', { as: 'admin', body: { title: 'Welcome to the summer season', body: 'Hello', status: 'published' } });
  expectOk(r, 'blog post');
  r = await call('GET', '/blog');
  assert.ok(r.body.some((p) => p.title.startsWith('Welcome')), 'blog published');
  r = await call('POST', '/contact', { body: { name: 'Visitor', email: 'visitor@example.com', topic: 'Vendors', message: 'Hi there' } });
  expectOk(r, 'contact');
  r = await call('GET', '/admin/inquiries', { as: 'admin' });
  assert.ok(r.body.length >= 1);
  r = await call('POST', '/newsletter', { body: { email: 'fan@example.com', consent: true } });
  expectOk(r, 'newsletter');
  r = await call('GET', '/resources');
  assert.ok(Object.keys(r.body).length >= 1);

  // ---------- security: JSON required for writes, admin pages denied for anon ----------
  const bad = await fetch(base + '/markets/' + mid + '/register', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(bad.status, 415);
  r = await call('GET', '/admin/users');
  assert.equal(r.status, 401);
});
