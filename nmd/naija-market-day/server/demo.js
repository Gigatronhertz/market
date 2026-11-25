'use strict';
// Demo content so every part of the site has something to show: markets (upcoming and past) with booths, vendors
// with businesses, products and active subscriptions, applications at each stage, guest tickets, buyers, a staff
// account, news, events, banners, sponsors, resources and a gallery. Runs automatically on an empty database
// (see DEMO_DATA in server/index.js) and with `npm run seed:demo`. Demo accounts are listed in the README.

const db = require('./db');
const { nowIso, addDays, todayYmd, hashPassword, randomToken, sha256 } = require('./util');
const qr = require('./qr');

const PASSWORD = { vendor: 'DemoVendor1', buyer: 'DemoBuyer1', staff: 'DemoStaff1' };
const HERO = 'https://images.unsplash.com/photo-1777065851469-71aef898a26f?w=1200&q=80&auto=format&fit=crop';
const ART = { stall: '/illus/stall.svg', drum: '/illus/drum.svg', map: '/illus/map.svg' };

function day(now, n) { return addDays(now, n).slice(0, 10); }

function addUser(email, name, roles, password) {
  const now = nowIso();
  return db.run(
    `INSERT INTO users (email, name, roles, status, password_hash, marketing_consent, newsletter_choice, created_at)
     VALUES (?, ?, ?, 'active', ?, 1, 1, ?)`,
    email, name, roles, hashPassword(password), now
  ).lastInsertRowid;
}

function addBusiness(ownerEmail, ownerId, b) {
  const now = nowIso();
  return db.run(
    `INSERT INTO businesses (owner_email, owner_user_id, name, category, contact_person, phone, email, city, description, website, socials, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, '', '{}', ?, ?)`,
    ownerEmail, ownerId, b.name, b.category, b.contact || '', ownerEmail, b.city, b.description, now, now
  ).lastInsertRowid;
}

function addListing(businessId, l) {
  const now = nowIso();
  db.run(
    `INSERT INTO listings (business_id, name, description, category, price_cents, sale_price_cents, photos, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    businessId, l.name, l.description, l.category, l.price, l.sale || null, JSON.stringify([l.photo]), now, now
  );
}

function subscribe(businessId, status = 'active') {
  const now = nowIso();
  db.run(
    "INSERT INTO subscriptions (business_id, plan_code, status, started_at, renews_at, created_at) VALUES (?, 'monthly', ?, ?, ?, ?)",
    businessId, status, now, addDays(now, 30), now
  );
}

function addMarket(m) {
  const now = nowIso();
  return db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status, guest_capacity, vendor_capacity, app_opens_on, app_closes_on, flyer_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '10:00', '18:00', ?, 'Booth fees are non-refundable after payment unless we decline your application.', 'published', ?, ?, ?, ?, ?, ?, ?)`,
    m.name, m.city, m.venue, m.season, m.date, m.description, m.guests, m.vendors, m.opens, m.closes, m.flyer || null, now, now
  ).lastInsertRowid;
}

function addBooths(marketId) {
  const tiers = [
    { from: 1, to: 10, tier: 'VIP', type: 'standard', price: 30000 },
    { from: 11, to: 20, tier: 'Standard', type: 'standard', price: 12000 },
    { from: 21, to: 25, tier: 'Food', type: 'food', price: 15000 },
  ];
  for (const t of tiers) {
    for (let n = t.from; n <= t.to; n++) {
      db.run('INSERT INTO booths (market_id, number, tier, type, price_cents) VALUES (?, ?, ?, ?, ?)', marketId, String(n), t.tier, t.type, t.price);
    }
  }
}

function boothByNumber(marketId, number) {
  return db.get('SELECT * FROM booths WHERE market_id = ? AND number = ?', marketId, String(number));
}

// One application at a given stage. Stages: approved (paid, booth assigned), review, more_info, waitlisted, declined.
function addApplication(marketId, a) {
  const now = nowIso();
  const submitted = a.status === 'draft' ? null : now;
  const qrToken = a.status === 'approved' ? randomToken(16) : null;
  const booth = a.booth ? boothByNumber(marketId, a.booth) : null;
  const id = db.run(
    `INSERT INTO applications (market_id, business_id, owner_email, owner_user_id, category, answers, step, booth_id, status,
       more_info_note, payment_status, amount_cents, terms_accepted_at, submitted_at, date_started, last_saved_at,
       resume_token_hash, qr_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    marketId, a.businessId, a.email, a.userId, a.category,
    a.status === 'approved' ? 'done' : a.status === 'draft' ? 'details' : 'payment',
    booth ? booth.id : null, a.status, a.note || '', a.paid ? 'paid' : 'unpaid', a.amount,
    a.status === 'draft' ? null : now, submitted, now, now, sha256(randomToken(16)), qrToken, now, now
  ).lastInsertRowid;
  if (booth && a.status === 'approved') {
    db.run('UPDATE booths SET assigned_application_id = ?, confirmed = 1 WHERE id = ?', id, booth.id);
  }
  if (a.paid) {
    db.run(
      "INSERT INTO payments (application_id, kind, amount_cents, status, provider, provider_ref, note, created_at) VALUES (?, 'booth_fee', ?, 'succeeded', 'simulated', ?, 'Demo payment', ?)",
      id, a.amount, 'demo_' + randomToken(8), now
    );
  }
  return id;
}

function addGuest(marketId, g) {
  const now = nowIso();
  db.run(
    `INSERT INTO guests (market_id, name, email, phone, guests_count, source, qr_token, checked_in, checked_in_at, created_at)
     VALUES (?, ?, ?, '', ?, 'online', ?, ?, ?, ?)`,
    marketId, g.name, g.email, g.count || 1, qr.guestCode(randomToken(16)).slice(6), g.in ? 1 : 0, g.in ? now : null, now
  );
}

function seed() {
  db.init();
  const count = db.get('SELECT COUNT(*) AS n FROM markets').n;
  if (count > 0) return { skipped: true };
  const now = nowIso();

  // ----- markets -----
  const brampton = addMarket({ name: 'Brampton Summer Market', city: 'Brampton', venue: 'Civic Square', season: '2027',
    date: day(now, 45), description: 'Food, fashion, music and small businesses. Free to attend.', guests: 500, vendors: 40,
    opens: day(now, -5), closes: day(now, 40), flyer: HERO });
  const toronto = addMarket({ name: 'Toronto Waterfront Market', city: 'Toronto', venue: 'Harbourfront Centre', season: '2027',
    date: day(now, 75), description: 'A full day by the lake: street food, Ankara fashion, beauty stalls and live highlife.', guests: 800, vendors: 60,
    opens: day(now, 10), closes: day(now, 70), flyer: ART.stall });
  const calgaryPast = addMarket({ name: 'Calgary Spring Market', city: 'Calgary', venue: 'Stampede Grounds', season: '2026',
    date: day(now, -60), description: 'Our first market of the season.', guests: 400, vendors: 30, opens: day(now, -120), closes: day(now, -70) });
  const ottawaPast = addMarket({ name: 'Ottawa Harvest Market', city: 'Ottawa', venue: 'Lansdowne Park', season: '2026',
    date: day(now, -20), description: 'Harvest food, crafts and a family stage.', guests: 350, vendors: 28, opens: day(now, -70), closes: day(now, -25), flyer: ART.drum });
  addBooths(brampton);
  addBooths(toronto);
  addBooths(calgaryPast);

  // ----- accounts -----
  const vendorIds = {
    ngozi: addUser('vendor@demo.test', 'Ngozi Okafor', 'vendor,buyer', PASSWORD.vendor),
    chidi: addUser('chidi@demo.test', 'Chidi Eze', 'vendor', PASSWORD.vendor),
    amara: addUser('amara@demo.test', 'Amara Mensah', 'vendor', PASSWORD.vendor),
    kofi: addUser('kofi@demo.test', 'Kofi Boateng', 'vendor', PASSWORD.vendor),
  };
  addUser('buyer@demo.test', 'Tunde Bello', 'buyer', PASSWORD.buyer);
  addUser('ada@demo.test', 'Ada Nwosu', 'buyer', PASSWORD.buyer);
  addUser('staff@demo.test', 'Samuel Ojo', 'staff', PASSWORD.staff);

  // ----- businesses, subscriptions and products -----
  const shops = [
    { owner: 'ngozi', email: 'vendor@demo.test', name: "Mama Ngozi's Kitchen", category: 'Food', city: 'Brampton',
      description: 'Home cooking from our kitchen to your table: jollof, egusi, puff-puff and small-chops trays for events.',
      products: [
        ['Jollof rice tray (serves 10)', 'Smoky party jollof with fried plantain. Order 48 hours ahead.', 'Food', 6500, null, 'stall'],
        ['Puff-puff box', 'Fresh, golden, dusted with sugar. 24 pieces.', 'Food', 1200, 999, 'stall'],
        ['Small chops platter', 'Samosas, spring rolls, peppered wings. Serves 8.', 'Food', 4800, null, 'stall'],
        ['Egusi soup pack', 'Family-size egusi with assorted meat. Freezes well.', 'Food', 3500, null, 'stall'],
      ] },
    { owner: 'ngozi', email: 'vendor@demo.test', name: 'Adire by Ifeoma', category: 'Fashion', city: 'Calgary',
      description: 'Hand-dyed adire cloth and ready-to-wear pieces made in small batches.',
      products: [
        ['Indigo adire shirt', 'Cotton, hand-dyed indigo with a traditional motif. Unisex.', 'Fashion', 5500, null, 'drum'],
        ['Adire head wrap', 'Two-metre wrap, hand-stamped on cotton.', 'Fashion', 2800, 2200, 'drum'],
      ] },
    { owner: 'ngozi', email: 'vendor@demo.test', name: 'Lagos Beats Records', category: 'Music', city: 'Brampton',
      description: 'Afrobeats, highlife and amapiano vinyl and CDs from independent artists.',
      products: [
        ['Highlife classics (vinyl)', 'Twelve-inch reissue of 1970s highlife favourites.', 'Music', 3200, null, 'drum'],
      ] },
    { owner: 'chidi', email: 'chidi@demo.test', name: 'Chidi Tailors', category: 'Clothing', city: 'Toronto',
      description: 'Custom Ankara suits, dresses and kids wear, made to measure in two weeks.',
      products: [
        ['Ankara two-piece set', 'Bold print, made to measure. Allow two weeks.', 'Clothing', 12500, null, 'drum'],
        ['Kids Ankara dress', 'Sizes 2 to 10. Cotton lining.', 'Clothing', 4200, 3600, 'drum'],
        ['Agbada for men', 'Embroidered neckline. Tailored fit.', 'Clothing', 18500, null, 'drum'],
      ] },
    { owner: 'amara', email: 'amara@demo.test', name: 'Amara Naturals', category: 'Beauty', city: 'Toronto',
      description: 'Shea butter, black soap and natural hair care made in small batches with local and imported ingredients.',
      products: [
        ['Raw shea butter (250 g)', 'Unrefined, from northern Ghana. Great for skin and hair.', 'Beauty', 1400, null, 'map'],
        ['African black soap bar', 'Plantain-ash base, gentle on the skin.', 'Beauty', 650, null, 'map'],
        ['Hair oil blend', 'Castor, coconut and rosemary. 120 ml.', 'Beauty', 1800, 1500, 'map'],
      ] },
    { owner: 'kofi', email: 'kofi@demo.test', name: 'Kofi Beads & Jewellery', category: 'Jewellery', city: 'Ottawa',
      description: 'Hand-beaded necklaces, bracelets and earrings with recycled glass and brass.',
      products: [
        ['Beaded statement necklace', 'Recycled glass beads on a brass chain.', 'Jewellery', 3800, null, 'map'],
        ['Brass cuff bracelet', 'Hand-stamped with a Adinkra symbol.', 'Jewellery', 2600, null, 'map'],
      ] },
    { owner: 'kofi', email: 'kofi@demo.test', name: 'Kofi Woodcraft', category: 'Crafts', city: 'Ottawa',
      description: 'Carved wooden masks, serving bowls and home decor from sustainably sourced timber.',
      products: [
        ['Carved serving bowl', 'Sese wood, hand-finished. Food safe oil.', 'Crafts', 4500, 3900, 'drum'],
      ] },
  ];
  const businessIds = {};
  for (const s of shops) {
    const bid = addBusiness(s.email, vendorIds[s.owner], s);
    businessIds[s.name] = bid;
    subscribe(bid, s.name === 'Kofi Woodcraft' ? 'lapsed' : 'active');
    for (const p of s.products) {
      addListing(bid, { name: p[0], description: p[1], category: p[2], price: p[3], sale: p[4], photo: ART[p[5]] });
    }
  }

  // ----- applications: one per stage at the upcoming Brampton market -----
  const applyAs = (name, owner, extra) => ({ businessId: businessIds[name], email: owner, userId: null, category: extra.category, ...extra });
  addApplication(brampton, applyAs("Mama Ngozi's Kitchen", 'vendor@demo.test', { category: 'Food', status: 'approved', paid: true, amount: 30000, booth: 21 }));
  addApplication(brampton, applyAs('Adire by Ifeoma', 'vendor@demo.test', { category: 'Fashion', status: 'under_review', paid: true, amount: 12000, booth: 11 }));
  addApplication(brampton, applyAs('Lagos Beats Records', 'vendor@demo.test', { category: 'Music', status: 'more_info', amount: 12000, booth: 12, note: 'Please upload your music licence.' }));
  addApplication(brampton, applyAs('Amara Naturals', 'amara@demo.test', { category: 'Beauty', status: 'waitlisted', amount: 12000 }));
  addApplication(toronto, applyAs('Chidi Tailors', 'chidi@demo.test', { category: 'Clothing', status: 'approved', paid: true, amount: 12000, booth: 4 }));
  addApplication(calgaryPast, applyAs('Adire by Ifeoma', 'vendor@demo.test', { category: 'Fashion', status: 'approved', paid: true, amount: 12000, booth: 2 }));

  // ----- guest tickets -----
  [
    { name: 'Tunde Bello', email: 'buyer@demo.test', count: 2, in: true },
    { name: 'Ada Nwosu', email: 'ada@demo.test', count: 1, in: false },
    { name: 'Grace Adu', email: 'grace@demo.test', count: 4, in: false },
    { name: 'Emeka Obi', email: 'emeka@demo.test', count: 1, in: false },
  ].forEach((g) => addGuest(brampton, g));

  // ----- news, events, banners, sponsors, resources, gallery, subscribers -----
  const posts = [
    ['Welcome to the 2027 season', 'welcome-2027-season', 'News', 'Our markets return this summer with more vendors, more food and a new home at Civic Square. Booth applications are open now.', -5],
    ['Meet the vendors: Mama Ngozi\'s Kitchen', 'meet-mama-ngozis-kitchen', 'Vendors', 'Ngozi started cooking for her neighbours and now feeds a market crowd every summer. Her jollof is the reason people line up early.', -12],
    ['Toronto joins the circuit', 'toronto-joins-the-circuit', 'News', 'The Toronto Waterfront Market is our biggest yet, with room for sixty vendors and a live stage every hour.', -20],
    ['Tips for selling at your first market', 'tips-first-market', 'Guides', 'Bring change, label your prices clearly and plan for the first hour to be slow. Most of our vendors sell out by the afternoon.', -30],
  ];
  for (const [title, slug, cat, body, offset] of posts) {
    db.run(
      "INSERT INTO blog_posts (title, slug, image_url, category, body, publish_at, status, created_at) VALUES (?, ?, '', ?, ?, ?, 'published', ?)",
      title, slug, cat, body, day(now, offset), now
    );
  }
  const events = [
    ['Youth business workshop', 15, 'Brampton library', 'Free workshop on pricing, branding and selling at markets.'],
    ['Afrobeats night', 45, 'Civic Square stage', 'Live sets from local artists after the market closes.'],
    ['Toronto vendor meetup', 60, 'Harbourfront Centre', 'Meet the Toronto vendors, share tips and get your booth questions answered.'],
    ['Kids craft corner', 30, 'Ottawa Lansdowne Park', 'Free beading and painting for children aged 5 to 12.'],
  ];
  for (const [title, offset, place, desc] of events) {
    db.run(
      "INSERT INTO community_events (title, event_date, place, description, link, status, created_at) VALUES (?, ?, ?, ?, '', 'approved', ?)",
      title, day(now, offset), place, desc, now
    );
  }
  db.run(
    'INSERT INTO banners (image_url, link, advertiser, city, location, frequency_seconds, starts_on, ends_on, active, created_at) VALUES (?, ?, ?, ?, ?, 6, ?, ?, 1, ?)',
    HERO, '/markets', 'Naija Market Day', 'Brampton', 'home', day(now, -30), day(now, 90), now
  );
  const sponsorLogo = (text) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="12" fill="#0F6B4A"/><text x="120" y="50" font-family="Arial" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${text}</text></svg>`
  );
  [['Maple Bank', 'https://example.com/maple'], ['Harvest Foods', 'https://example.com/harvest'], ['City of Brampton', 'https://example.com/brampton']].forEach(([name, link], i) => {
    db.run('INSERT INTO sponsors (name, logo_url, link, sort_order) VALUES (?, ?, ?, ?)', name, sponsorLogo(name), link, i);
  });
  [
    ['faq', 'Brampton', 'How do I apply for a booth?', '', 'Start with your email, add your business details, pick a category, choose a booth and pay. Your place is held for 15 minutes while you finish.'],
    ['insurance', 'Brampton', 'Public liability insurance', '', 'Most markets ask for proof of liability cover before the day. Ask your insurer for a certificate naming the market.'],
    ['training', 'Brampton', 'Food safety basics', '', 'If you sell prepared food, bring your food handler certificate. Keep cold food below 4 °C and hot food above 60 °C.'],
    ['health', 'Brampton', 'Sun and heat on market day', '', 'Bring water, a shade canopy with weights and sunscreen. Take a break every hour.'],
  ].forEach(([section, city, title, url, body], i) => {
    db.run('INSERT INTO resources (section, city, title, url, body, sort_order) VALUES (?, ?, ?, ?, ?, ?)', section, city, title, url, body, i);
  });
  [[ottawaPast, ART.drum, 'Drumming at the gate'], [ottawaPast, ART.stall, 'Food stalls at lunchtime'], [calgaryPast, ART.map, 'Opening day map'], [calgaryPast, ART.stall, 'Farmers and makers']]
    .forEach(([m, url, title]) => db.run("INSERT INTO gallery (market_id, kind, url, title, created_at) VALUES (?, 'photo', ?, ?, ?)", m, url, title, now));
  db.run("INSERT INTO gallery (market_id, kind, url, title, created_at) VALUES (?, 'video', 'https://www.youtube.com/', 'Highlights reel (demo link)', ?)", calgaryPast, now);
  ['ada@demo.test', 'grace@demo.test', 'emeka@demo.test'].forEach((email) => {
    db.run('INSERT INTO subscribers (email, token, consent_at, created_at) VALUES (?, ?, ?, ?)', email, randomToken(16), now, now);
  });

  return { markets: 4, vendors: 4, businesses: shops.length, listings: shops.reduce((n, s) => n + s.products.length, 0) };
}

module.exports = { seed, PASSWORD };
