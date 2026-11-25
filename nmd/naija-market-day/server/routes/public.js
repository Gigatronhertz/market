'use strict';
// Public site, sign-in, the vendor application flow, the vendor portal and the buyer side.

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const notify = require('../notify');
const payments = require('../payments');
const markets = require('../markets');
const apps = require('../applications');
const commerce = require('../commerce');
const admin = require('../admin');
const qr = require('../qr');
const { wrap, HttpError, nowIso, cleanEmail, str, int, sha256, randomToken } = require('../util');

const router = express.Router();

// ======================= PUBLIC =======================

router.get('/markets', wrap(async (req, res) => res.json(markets.publicMarkets({ city: req.query.city, season: req.query.season, past: req.query.past === '1' }))));
router.get('/markets/:id', wrap(async (req, res) => res.json(markets.publicMarket(req.params.id))));
router.post('/markets/:id/register', wrap(async (req, res) => res.status(201).json(markets.registerGuest(req.params.id, req.body || {}))));
router.get('/tickets/:token', wrap(async (req, res) => res.json(markets.guestTicket(req.params.token))));

router.get('/banners', wrap(async (req, res) => res.json(admin.liveBanners(req.query.location, req.query.city))));
router.get('/sponsors', wrap(async (_req, res) => res.json(admin.contentList('sponsors'))));
router.get('/blog', wrap(async (_req, res) => res.json(admin.contentList('blog_posts', { publishedOnly: true }).map(({ body, ...rest }) => ({ ...rest, excerpt: String(body || '').slice(0, 160) })))));
router.get('/blog/:slug', wrap(async (req, res) => {
  const post = db.get("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published' AND publish_at <= ?", req.params.slug, nowIso());
  if (!post) throw new HttpError(404, 'That post was not found.');
  res.json(post);
}));
router.get('/events', wrap(async (_req, res) => res.json(admin.publicEvents())));
router.post('/events', auth.loadUser, auth.requireRole('buyer', 'vendor', 'admin'), wrap(async (req, res) => res.status(201).json(admin.submitEvent(req.user, req.body || {}))));
router.get('/resources', wrap(async (_req, res) => {
  const rows = db.all('SELECT * FROM resources ORDER BY section, sort_order, id');
  const grouped = {};
  for (const r of rows) (grouped[r.section] = grouped[r.section] || []).push(r);
  res.json(grouped);
}));
router.get('/gallery', wrap(async (req, res) => {
  const rows = req.query.market_id
    ? db.all('SELECT g.*, m.name AS market_name, m.date FROM gallery g JOIN markets m ON m.id = g.market_id WHERE g.market_id = ? ORDER BY g.id', int(req.query.market_id))
    : db.all('SELECT g.*, m.name AS market_name, m.date FROM gallery g JOIN markets m ON m.id = g.market_id ORDER BY m.date DESC, g.id');
  res.json(rows);
}));

router.get('/directory/cities', wrap(async (_req, res) => res.json(commerce.directoryCities())));
router.get('/directory/markets', wrap(async (req, res) => res.json(commerce.directoryMarkets(req.query.city))));
router.get('/directory/markets/:id/vendors', wrap(async (req, res) => res.json(commerce.directoryVendors(req.params.id, { q: req.query.q, category: req.query.category }))));
router.get('/directory/vendors/:businessId', wrap(async (req, res) => res.json(commerce.vendorProfile(req.params.businessId))));

router.get('/marketplace/listings', wrap(async (req, res) => res.json(commerce.listingsPublic({ q: req.query.q, category: req.query.category, business_id: req.query.business_id, upcoming: req.query.upcoming === '1' }))));
router.get('/marketplace/listings/:id', wrap(async (req, res) => res.json(commerce.listingDetail(req.params.id))));

router.get('/settings/public', wrap(async (_req, res) => res.json({
  disclaimer: db.getSetting('disclaimer_text', ''),
  plans: commerce.plans(),
  categories: apps.CATEGORIES_LIST(),
  stripe_mode: payments.mode(),
})));

router.post('/contact', wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const email = cleanEmail(b.email);
  const topic = str(b.topic, 80);
  const message = str(b.message, 4000);
  if (!name || !topic || !message) throw new HttpError(400, 'Name, topic and message are required.');
  db.run("INSERT INTO inquiries (name, email, topic, message, status, created_at) VALUES (?, ?, ?, ?, 'new', ?)", name, email, topic, message, nowIso());
  notify.sendTemplate('contact_inquiry_admin', db.getSetting('sender_email', ''), { name, email, topic, message });
  notify.sendTemplate('contact_thanks', email, { name });
  res.status(201).json({ ok: true, message: 'Thank you. We have your message and will reply soon.' });
}));

router.post('/newsletter', wrap(async (req, res) => {
  const email = cleanEmail((req.body || {}).email);
  if (!(req.body || {}).consent) throw new HttpError(400, 'Tick the box to agree to receive news.');
  const existing = db.get('SELECT * FROM subscribers WHERE email = ? COLLATE NOCASE', email);
  if (existing && !existing.unsubscribed_at) return res.json({ ok: true });
  const token = existing ? existing.token : randomToken(16);
  if (existing) db.run('UPDATE subscribers SET unsubscribed_at = NULL, consent_at = ? WHERE id = ?', nowIso(), existing.id);
  else db.run('INSERT INTO subscribers (email, token, consent_at, created_at) VALUES (?, ?, ?, ?)', email, token, nowIso(), nowIso());
  notify.sendTemplate('newsletter_confirm', email, { unsubscribe_link: notify.appUrl('/app/unsubscribe.html?t=' + token) });
  res.status(201).json({ ok: true });
}));
router.post('/newsletter/unsubscribe', wrap(async (req, res) => {
  const t = String((req.body || {}).token || '');
  db.run('UPDATE subscribers SET unsubscribed_at = ? WHERE token = ?', nowIso(), t);
  res.json({ ok: true });
}));

// ======================= AUTH =======================

router.get('/auth/me', auth.loadUser, (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: auth.publicUser(req.user) });
});

router.post('/auth/buyer/signup', wrap(async (req, res) => {
  const user = auth.signUpBuyer(req.body || {});
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.status(201).json({ user: auth.publicUser(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const { email, password, portal } = req.body || {};
  const role = ['buyer', 'vendor', 'admin', 'staff'].includes(portal) ? (portal === 'staff' ? 'staff' : portal) : null;
  let user = auth.loginWithPassword(email, password, role === 'staff' ? null : role);
  if (role === 'staff' && !auth.rolesOf(user).some((r) => r === 'staff' || r === 'admin')) {
    throw new HttpError(403, 'This account cannot sign in here.');
  }
  if (role === 'admin' && !auth.rolesOf(user).includes('admin')) throw new HttpError(403, 'This account cannot sign in here.');
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.json({ user: auth.publicUser(user) });
}));

router.post('/auth/otp/request', wrap(async (req, res) => res.json(auth.requestOtp((req.body || {}).email))));
router.post('/auth/otp/verify', wrap(async (req, res) => {
  const user = auth.verifyOtp((req.body || {}).email, (req.body || {}).code);
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.json({ user: auth.publicUser(user) });
}));

router.post('/auth/password/set', wrap(async (req, res) => {
  const user = auth.setPasswordWithToken((req.body || {}).token, (req.body || {}).password);
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.json({ user: auth.publicUser(user) });
}));

router.post('/auth/password/forgot', wrap(async (req, res) => {
  const e = cleanEmail((req.body || {}).email);
  auth.limit('forgot:' + e, 5, 30);
  const user = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', e);
  if (user && user.status !== 'removed') {
    const token = auth.issueSetupToken(user.id, 1);
    notify.sendTemplate('password_reset', user.email, { name: user.name, link: notify.appUrl('/app/set-password.html?t=' + token) });
  }
  res.json({ ok: true });
}));

router.post('/auth/logout', (req, res) => {
  auth.loadUser(req, res, () => {});
  auth.signOut(req, res);
  res.json({ ok: true });
});

// ======================= APPLICATIONS (VEN-01 to VEN-31) =======================

router.post('/apply/start', auth.loadUser, wrap(async (req, res) => {
  if (req.user && auth.rolesOf(req.user).includes('vendor')) {
    return res.status(201).json({ application: apps.startForAccount(req.user, req.body || {}) });
  }
  if (req.user) {
    return res.status(201).json({ application: apps.startForAccount(req.user, req.body || {}) });
  }
  const result = apps.startApplication(req.body || {});
  if (result.needs_sign_in) return res.json(result);
  res.status(201).json(result);
}));

// Resume from an emailed link: the token alone identifies the application. Must come before /apply/:id.
router.get('/apply/resume', auth.loadUser, wrap(async (req, res) => {
  const token = req.get('x-apply-token') || req.query.t || '';
  const app = token ? db.get('SELECT * FROM applications WHERE resume_token_hash = ?', sha256(token)) : null;
  if (!app) throw new HttpError(404, 'This link has expired or was already used. Ask for a new one from the Naija Market Day team, or apply again.');
  res.json(apps.appView(app));
}));
router.get('/apply/:id', auth.loadUser, wrap(async (req, res) => res.json(apps.appView(apps.loadApp(withTokenUser(req))))));

// Saves progress after every step (VEN-05). Pass complete_step to validate and move on.
router.put('/apply/:id', auth.loadUser, wrap(async (req, res) => {
  let app = apps.loadApp(withTokenUser(req));
  app = apps.saveProgress(app, req.body || {});
  if (req.body && req.body.complete_step) {
    const step = String(req.body.complete_step);
    if (!apps.STEPS.includes(step) || step === 'payment') throw new HttpError(400, 'Unknown step.');
    apps.validateStep(app, step);
    const next = apps.STEPS[apps.STEPS.indexOf(step) + 1];
    db.run('UPDATE applications SET step = ? WHERE id = ?', next, app.id);
  }
  res.json(apps.appView(db.get('SELECT * FROM applications WHERE id = ?', app.id)));
}));

router.get('/apply/:id/booths', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  res.json(markets.boothsForMarket(app.market_id, app.id).map(({ held_application_id, held_until, ...b }) => b));
}));
router.post('/apply/:id/booth', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  const updated = apps.holdBooth(app, (req.body || {}).booth_id);
  res.json(apps.appView(updated));
}));
router.post('/apply/:id/waitlist', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  res.status(201).json(apps.appView(apps.joinWaitlist(app, (req.body || {}).tier)));
}));
router.post('/apply/:id/terms', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  if (!(req.body || {}).accepted) throw new HttpError(400, 'Tick to accept the event terms.');
  res.json(apps.appView(apps.acceptTerms(app)));
}));
router.post('/apply/:id/documents', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  res.status(201).json(apps.addDocument(app, req.body || {}));
}));
router.post('/apply/:id/pay', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  const result = await apps.pay(app, req.user ? req.user.email : 'vendor');
  res.json(result);
}));
// Stripe returns here with session_id after checkout (GEN-01). Simulated payments never reach this route.
router.post('/apply/:id/payment/confirm', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  const sessionId = String((req.body || {}).session_id || '');
  if (!sessionId) throw new HttpError(400, 'Missing payment session.');
  const r = await payments.confirmSession(sessionId);
  if (!r.paid) throw new HttpError(402, 'The payment has not completed yet.');
  if (String(r.metadata.ref) !== String(app.id)) throw new HttpError(403, 'This payment belongs to another application.');
  const done = apps.completeBoothPayment(app.id, r.paymentIntent, 'stripe', app.owner_email);
  res.json(apps.appView(done));
}));
router.post('/apply/:id/resubmit', auth.loadUser, wrap(async (req, res) => {
  const app = apps.loadApp(withTokenUser(req));
  res.json(apps.appView(apps.resubmit(app)));
}));

// ======================= VENDOR PORTAL (VEN-06 to VEN-45) =======================

const vendor = express.Router();
vendor.use(auth.loadUser, auth.requireRole('vendor'));

vendor.get('/dashboard', wrap(async (req, res) => res.json(commerce.vendorDashboard(req.user, req.query.business_id || null))));
vendor.get('/businesses', wrap(async (req, res) => res.json(commerce.myBusinesses(req.user))));
vendor.post('/businesses', wrap(async (req, res) => res.status(201).json(commerce.saveBusiness(req.user, null, req.body || {}))));
vendor.put('/businesses/:id', wrap(async (req, res) => res.json(commerce.saveBusiness(req.user, req.params.id, req.body || {}))));
vendor.delete('/businesses/:id', wrap(async (req, res) => res.json(commerce.deleteBusiness(req.user, req.params.id))));
vendor.post('/businesses/:id/documents', wrap(async (req, res) => {
  const biz = commerce.ownedBusiness(req.user, req.params.id);
  res.status(201).json(apps.addDocument({ business_id: biz.id }, req.body || {}));
}));
vendor.get('/applications', wrap(async (req, res) => res.json(commerce.vendorApplications(req.user, req.query.business_id || null))));
vendor.get('/applications/:id', wrap(async (req, res) => {
  const app = apps.loadApp(req);
  if (app.owner_user_id !== req.user.id && app.owner_email.toLowerCase() !== req.user.email.toLowerCase()) throw new HttpError(403, 'That application is not yours.');
  res.json(apps.appView(app, { includeQr: true }));
}));
vendor.get('/applications/:id/qr', wrap(async (req, res) => {
  const app = apps.loadApp(req);
  if (app.status !== 'approved' || !app.qr_token) throw new HttpError(409, 'The QR code is issued once the application is approved.');
  res.json({ qr_data_url: qr.dataUrl(qr.vendorCode(app.qr_token)) });
}));
vendor.post('/applications/:id/resubmit', wrap(async (req, res) => res.json(apps.appView(apps.resubmit(apps.loadApp(req))))));
vendor.get('/receipts', wrap(async (req, res) => res.json(commerce.receipts(req.user))));
vendor.get('/notifications', wrap(async (req, res) => res.json(commerce.bell(req.user))));
vendor.post('/notifications/read', wrap(async (req, res) => res.json(commerce.markBellRead(req.user))));

vendor.post('/businesses/:id/subscribe', wrap(async (req, res) => res.json(await commerce.subscribe(req.user, req.params.id, (req.body || {}).plan_code))));
vendor.post('/businesses/:id/cancel', wrap(async (req, res) => res.json(await commerce.cancelSubscription(req.user, req.params.id))));

vendor.get('/listings', wrap(async (req, res) => {
  const biz = req.query.business_id ? commerce.ownedBusiness(req.user, req.query.business_id) : null;
  const rows = db.all(
    `SELECT l.* FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE (b.owner_user_id = ? OR b.owner_email = ? COLLATE NOCASE) AND (? IS NULL OR l.business_id = ?) ORDER BY l.updated_at DESC`,
    req.user.id, req.user.email, biz ? biz.id : null, biz ? biz.id : null
  );
  res.json(rows.map((l) => ({ ...l, photos: JSON.parse(l.photos || '[]'), subscription_active: !!commerce.subscriptionActive(l.business_id) })));
}));

function listingInput(body) {
  const name = str(body.name, 120);
  if (!name) throw new HttpError(400, 'Listing name is required.');
  const price = require('../util').money(body.price);
  const sale = body.sale_price != null && body.sale_price !== '' ? require('../util').money(body.sale_price) : null;
  if (sale !== null && sale >= price) throw new HttpError(400, 'The sale price must be lower than the price.');
  const photos = (Array.isArray(body.photos) ? body.photos : []).filter((p) => /^data:image\/(png|jpeg|webp);base64,/.test(String(p)) && String(p).length < 3 * 1024 * 1024).slice(0, 4);
  return { name, description: str(body.description, 4000), category: str(body.category, 40), price, sale, photos: JSON.stringify(photos) };
}

vendor.post('/listings', wrap(async (req, res) => {
  const biz = commerce.ownedBusiness(req.user, (req.body || {}).business_id);
  if (!commerce.subscriptionActive(biz.id)) throw new HttpError(402, 'Subscribe this business to Marketplace before adding listings.');
  const v = listingInput(req.body || {});
  const now = nowIso();
  const info = db.run(
    'INSERT INTO listings (business_id, name, description, category, price_cents, sale_price_cents, photos, hidden, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    biz.id, v.name, v.description, v.category, v.price, v.sale, v.photos, req.body.hidden ? 1 : 0, now, now
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));
vendor.put('/listings/:id', wrap(async (req, res) => {
  const l = db.get('SELECT l.*, b.owner_user_id, b.owner_email FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = ?', int(req.params.id));
  if (!l || (l.owner_user_id !== req.user.id && l.owner_email.toLowerCase() !== req.user.email.toLowerCase())) throw new HttpError(404, 'That listing is not yours.');
  if (!commerce.subscriptionActive(l.business_id)) throw new HttpError(402, 'Renew this business subscription to edit listings.');
  const v = listingInput({ ...JSON.parse(JSON.stringify({ name: l.name, description: l.description, category: l.category, price: l.price_cents / 100, sale_price: l.sale_price_cents ? l.sale_price_cents / 100 : '', photos: JSON.parse(l.photos || '[]') })), ...(req.body || {}) });
  db.run('UPDATE listings SET name=?, description=?, category=?, price_cents=?, sale_price_cents=?, photos=?, updated_at=? WHERE id=?', v.name, v.description, v.category, v.price, v.sale, v.photos, nowIso(), l.id);
  res.json({ ok: true });
}));
vendor.delete('/listings/:id', wrap(async (req, res) => {
  const l = db.get('SELECT l.*, b.owner_user_id, b.owner_email FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = ?', int(req.params.id));
  if (!l || (l.owner_user_id !== req.user.id && l.owner_email.toLowerCase() !== req.user.email.toLowerCase())) throw new HttpError(404, 'That listing is not yours.');
  db.run('DELETE FROM listings WHERE id = ?', l.id);
  res.json({ ok: true });
}));

vendor.get('/chats', wrap(async (req, res) => res.json(commerce.vendorChats(req.user, req.query.business_id || null))));
vendor.get('/chats/:id', wrap(async (req, res) => res.json(commerce.chatDetail(req.user, req.params.id, 'vendor'))));
vendor.post('/chats/:id/messages', wrap(async (req, res) => {
  const b = req.body || {};
  res.status(201).json(commerce.postMessage(req.user, req.params.id, 'vendor', b.body, b.payment_link || null));
}));

router.use('/vendor', vendor);

// ======================= BUYER (BUY-01 to BUY-12) =======================

const buyer = express.Router();
buyer.use(auth.loadUser, auth.requireRole('buyer'));

buyer.get('/cart', wrap(async (req, res) => res.json(commerce.cartView(req.user))));
buyer.post('/cart', wrap(async (req, res) => res.status(201).json(commerce.cartAdd(req.user, (req.body || {}).listing_id, (req.body || {}).qty))));
buyer.patch('/cart/:itemId', wrap(async (req, res) => res.json(commerce.cartUpdate(req.user, req.params.itemId, (req.body || {}).qty))));
buyer.delete('/cart/:itemId', wrap(async (req, res) => res.json(commerce.cartUpdate(req.user, req.params.itemId, 0))));
buyer.post('/cart/proceed', wrap(async (req, res) => res.status(201).json(commerce.proceedWithVendor(req.user, (req.body || {}).business_id, !!(req.body || {}).acknowledged))));
buyer.get('/chats', wrap(async (req, res) => res.json(commerce.buyerChats(req.user))));
buyer.get('/requests', wrap(async (req, res) => res.json(commerce.buyerChats(req.user))));
buyer.get('/chats/:id', wrap(async (req, res) => res.json(commerce.chatDetail(req.user, req.params.id, 'buyer'))));
buyer.post('/chats/:id/messages', wrap(async (req, res) => res.status(201).json(commerce.postMessage(req.user, req.params.id, 'buyer', (req.body || {}).body))));
buyer.get('/account', wrap(async (req, res) => res.json(commerce.buyerAccount(req.user))));
buyer.put('/account', wrap(async (req, res) => res.json(commerce.updateBuyerAccount(req.user, req.body || {}))));
buyer.get('/notifications', wrap(async (req, res) => res.json(commerce.bell(req.user))));
buyer.post('/notifications/read', wrap(async (req, res) => res.json(commerce.markBellRead(req.user))));

router.use('/buyer', buyer);

// Application routes accept the resume token from the email link as ?t=... or the x-apply-token header.
// For signed-in users the session is used instead. This helper keeps the request shape consistent.
function withTokenUser(req) {
  req.params.id = String(req.params.id);
  return req;
}

module.exports = router;
