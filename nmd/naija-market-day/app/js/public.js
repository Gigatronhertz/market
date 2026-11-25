/* Public site: home, markets, guest registration, directory, marketplace, blog, events, resources, contact. */
(function () {
  'use strict';
  const { h, api, money, fmtDate, badge, toast, alertBox, table, formFields, onSubmit, router, siteHeader, footer, loadDisclaimer, timeAgo, escapeForAttr } = window.UI;

  const root = document.getElementById('root');
  const page = (active, ...children) => h('div', null, siteHeader(active), h('main', { class: 'wrap', style: 'padding-top:28px;padding-bottom:40px', id: 'outlet' }, children), footer());

  async function bannerSlot(location, city) {
    const list = await api('/banners?location=' + location + (city ? '&city=' + encodeURIComponent(city) : '')).catch(() => []);
    if (!list.length) return null;
    // Rotate through the live banners at each banner's own frequency (ADM-51).
    const img = h('img', { src: list[0].image_url, alt: list[0].advertiser ? 'Advertisement: ' + list[0].advertiser : 'Advertisement' });
    const link = h('a', { class: 'banner-slot', href: list[0].link || '#', rel: 'sponsored noopener' }, img);
    let i = 0;
    if (list.length > 1) {
      setInterval(() => {
        i = (i + 1) % list.length;
        img.src = list[i].image_url;
        link.href = list[i].link || '#';
      }, Math.max(3, list[0].frequency_seconds || 6) * 1000);
    }
    return link;
  }

  function marketCard(m) {
    return h('a', { class: 'card grid-card', href: '#/markets/' + m.id, style: 'color:inherit;text-decoration:none' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'muted small' }, m.city), badge(m.effective_status)),
      h('h3', null, m.name),
      h('div', null, fmtDate(m.date) + (m.start_time ? ' · ' + m.start_time : '')),
      h('div', { class: 'muted small' }, m.venue),
      m.applications_open ? h('span', { class: 'badge ok', style: 'align-self:flex-start' }, 'Vendor applications open') : null);
  }

  // ---------- home ----------
  async function home() {
    const [markets, sponsors] = await Promise.all([api('/markets'), api('/sponsors').catch(() => [])]);
    const upcoming = markets.filter((m) => m.effective_status === 'published');
    const next = upcoming[0];
    const hero = h('section', { class: 'hero', style: 'margin:-28px -16px 0' },
      h('div', { class: 'wrap' },
        h('p', { class: 'small', style: 'letter-spacing:.08em;text-transform:uppercase;color:var(--mint)' }, 'Next market'),
        next
          ? h('div', null,
              h('h1', null, next.name),
              h('p', null, `${next.city} · ${fmtDate(next.date)}${next.start_time ? ' · ' + next.start_time : ''}${next.venue ? ' · ' + next.venue : ''}`),
              h('div', { class: 'row' },
                h('a', { class: 'btn', href: '#/markets/' + next.id + '/register' }, 'Register as guest'),
                h('a', { class: 'btn ghost', href: '#/markets/' + next.id + '/apply' }, 'Apply as vendor')))
          : h('div', null, h('h1', null, 'Our next market is coming soon'), h('p', null, 'Check back for dates and vendor applications.'))));
    const banner = await bannerSlot('home');
    const sponsorStrip = sponsors.length ? h('div', { class: 'sponsors', 'aria-label': 'Sponsors' }, sponsors.map((s) => h('a', { href: s.link || '#', rel: 'sponsored noopener' }, h('img', { src: s.logo_url, alt: s.name })))) : null;
    const newsletter = newsletterPrompt();
    return page('#/', hero, banner, sponsorStrip,
      h('section', { style: 'margin-top:28px' }, h('div', { class: 'spread' }, h('h2', null, 'Upcoming markets'), h('a', { href: '#/markets' }, 'See all')),
        upcoming.length ? h('div', { class: 'grid grid-cards' }, upcoming.slice(0, 3).map(marketCard)) : h('p', { class: 'muted' }, 'No upcoming markets are published yet.')),
      newsletter);
  }

  // Newsletter prompt: shown once per visitor, never again after dismissal or signup (WEB-10).
  function newsletterPrompt() {
    let seen = false;
    try { seen = localStorage.getItem('nmd-newsletter') === '1'; } catch { /* private window */ }
    const box = h('div', { class: 'card tint hidden', style: 'margin-top:28px;max-width:560px' },
      h('h3', null, 'Get market news'),
      h('p', { class: 'small muted' }, 'Market dates, vendor news and offers. Unsubscribe any time.'),
      h('form', { class: 'inline' },
        h('input', { type: 'email', name: 'email', placeholder: 'you@example.com', required: true, 'aria-label': 'Email' }),
        h('label', { class: 'inline small' }, h('input', { type: 'checkbox', name: 'consent', required: true }), 'Yes, send me news'),
        h('button', { class: 'btn', type: 'submit' }, 'Subscribe'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => dismiss() }, 'No thanks')));
    const dismiss = () => { box.classList.add('hidden'); try { localStorage.setItem('nmd-newsletter', '1'); } catch { /* ignore */ } };
    onSubmit(box.querySelector('form'), async (v) => {
      await api('/newsletter', { method: 'POST', body: { email: v.email, consent: v.consent } });
      dismiss();
      return 'Thanks, you are subscribed.';
    }, { success: (m) => m });
    if (!seen) setTimeout(() => box.classList.remove('hidden'), 8000);
    return box;
  }

  // ---------- markets ----------
  async function marketsList(past) {
    const markets = await api('/markets?past=' + (past ? 1 : 0));
    const city = h('select', { 'aria-label': 'City' }, h('option', { value: '' }, 'All cities'), [...new Set(markets.map((m) => m.city))].map((c) => h('option', { value: c }, c)));
    const list = h('div', { class: 'grid grid-cards' });
    const draw = () => {
      const pick = city.value;
      const rows = markets.filter((m) => !pick || m.city === pick);
      list.replaceChildren(...(rows.length ? rows.map(marketCard) : [h('p', { class: 'muted' }, past ? 'No past markets yet.' : 'No upcoming markets yet.')]));
    };
    city.addEventListener('change', draw);
    draw();
    return page(past ? '#/past' : '#/markets',
      h('h1', null, past ? 'Past markets' : 'Upcoming markets'),
      h('p', { class: 'muted' }, past ? 'Photos and videos from earlier markets.' : 'Register as a guest or apply as a vendor.'),
      h('div', { class: 'row', style: 'margin:12px 0 20px' }, city),
      list,
      past ? null : h('p', { class: 'muted small', style: 'margin-top:20px' }, 'Looking for a past market? ', h('a', { href: '#/past' }, 'Browse the gallery')));
  }

  async function pastMarkets() {
    const markets = await api('/markets?past=1');
    const gallery = await api('/gallery').catch(() => []);
    return page('#/past',
      h('h1', null, 'Past markets'),
      markets.length ? h('div', { class: 'stack' }, markets.map((m) => {
        const items = gallery.filter((g) => g.market_id === m.id);
        return h('section', { class: 'card' },
          h('div', { class: 'spread' }, h('h2', null, m.name), h('span', { class: 'muted' }, `${m.city} · ${fmtDate(m.date)}`)),
          items.length ? h('div', { class: 'grid grid-cards', style: 'margin-top:12px' }, items.map((g) => g.kind === 'video'
            ? h('a', { class: 'card', href: g.url, target: '_blank', rel: 'noopener' }, h('strong', null, g.title || 'Video'), h('div', { class: 'small muted' }, 'Watch on video'))
            : h('img', { class: 'thumb', src: g.url, alt: g.title || m.name, loading: 'lazy' }))) : h('p', { class: 'muted small' }, 'Photos coming soon.'),
          h('div', { style: 'margin-top:12px' }, h('a', { href: '#/directory' }, 'See the vendors from this market')));
      })) : h('p', { class: 'muted' }, 'No past markets yet.'));
  }

  async function marketDetail(id, mode) {
    const m = await api('/markets/' + id);
    const guestForm = h('form', { class: 'card', style: 'max-width:560px' });
    const formNode = h('div', null, formFields([
      { name: 'name', label: 'Full name', required: true, autocomplete: 'name' },
      { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
      { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
      { name: 'guests_count', label: 'Number of people (including you)', type: 'number', value: 1, min: 1, max: 10, required: true },
    ]));
    if (m.guest_capacity && m.guest_spots_left === 0) {
      guestForm.appendChild(alertBox('Guest registration is full for this market.', 'warn'));
    } else if (m.effective_status !== 'published') {
      guestForm.appendChild(alertBox('Guest registration for this market is closed.', 'warn'));
    } else {
      guestForm.appendChild(formNode);
      guestForm.appendChild(h('button', { class: 'btn', type: 'submit' }, 'Register'));
      onSubmit(guestForm, async (v) => {
        const r = await api('/markets/' + id + '/register', { method: 'POST', body: v });
        guestForm.replaceChildren(h('div', { class: 'alert ok' }, 'You are registered. We emailed your QR code to ', h('strong', null, v.email), '.'),
          h('a', { class: 'btn', href: '/app/ticket.html?t=' + r.guest.qr_token }, 'Open my ticket'));
        return 'Registered';
      });
    }
    const tiers = m.booth_tiers.length ? table([
      { label: 'Booth tier', render: (t) => t.tier },
      { label: 'Type', render: (t) => t.type },
      { label: 'Price', render: (t) => money(t.price_cents) },
      { label: 'Available', render: (t) => `${t.available} of ${t.total}` },
    ], m.booth_tiers) : null;
    return page('#/markets',
      h('p', null, h('a', { href: '#/markets' }, '← All markets')),
      h('h1', null, m.name),
      h('p', { class: 'muted' }, `${m.city} · ${fmtDate(m.date)}${m.start_time ? ' · ' + m.start_time : ''}${m.end_time ? '–' + m.end_time : ''}${m.venue ? ' · ' + m.venue : ''}`),
      h('div', { class: 'row', style: 'margin:8px 0 18px' }, badge(m.effective_status), m.applications_open ? badge('published', 'Vendor applications open') : null),
      h('div', { class: 'grid grid-2', style: 'align-items:start' },
        h('div', { class: 'stack' },
          m.flyer_url ? h('img', { class: 'thumb', src: m.flyer_url, alt: 'Market flyer' }) : null,
          m.description ? h('p', null, m.description) : null,
          h('h2', null, 'Booths'),
          tiers || h('p', { class: 'muted' }, 'Booths will be listed when applications open.')),
        h('div', { class: 'stack' },
          mode === 'apply'
            ? applyEntry(m)
            : h('div', null, h('h2', null, 'Register as a guest'), guestForm),
          mode === 'apply' ? null : h('div', { class: 'card tint' }, h('h3', null, 'Vendor?'), h('p', { class: 'small muted' }, 'Apply to trade at this market.'), h('a', { class: 'btn ghost', href: '#/markets/' + id + '/apply' }, 'Apply as vendor')))));
  }

  // Apply as vendor: asks for the vendor email first (VEN-02).
  function applyEntry(m) {
    const emailInput = h('input', { type: 'email', name: 'email', required: true, placeholder: 'you@business.com', autocomplete: 'email' });
    const form = h('form', { class: 'card' },
      h('h2', null, 'Apply as vendor'),
      h('p', { class: 'muted small' }, 'Start with your email. No password is needed yet. If you have traded with us before, you will sign in instead.'),
      h('div', { class: 'field' }, h('label', null, 'Vendor email *'), emailInput),
      h('button', { class: 'btn', type: 'submit' }, 'Continue'));
    if (!m.applications_open) {
      return h('div', { class: 'card' }, alertBox('Applications are not open for this market right now.', 'warn'));
    }
    onSubmit(form, async (v) => {
      const r = await api('/apply/start', { method: 'POST', body: { market_id: m.id, email: v.email } });
      if (r.needs_sign_in) {
        location.href = '/app/login.html?as=vendor&email=' + encodeURIComponent(v.email) + '&next=' + encodeURIComponent('/app/apply.html?market=' + m.id);
        return 'Sign in to continue';
      }
      if (r.token) {
        sessionStorage.setItem('nmd-apply-token', r.token);
        location.href = '/app/apply.html?t=' + r.token;
      } else if (r.application) {
        location.href = '/app/apply.html?market=' + m.id;
      }
      return 'Starting your application';
    }, { success: (m2) => m2 });
    return form;
  }

  // ---------- directory (WEB-17 to WEB-20) ----------
  async function directory() {
    const cities = await api('/directory/cities');
    const body = h('div');
    const crumbs = h('p', { class: 'muted small' }, 'Pick a city');
    const page1 = page('#/directory',
      h('h1', null, 'Vendor directory'),
      h('p', { class: 'muted' }, 'Browse the vendors at each market. The list can be viewed here but not downloaded.'),
      crumbs, body);
    if (!cities.length) body.appendChild(h('p', { class: 'muted' }, 'The directory opens after the first market is published.'));
    else body.appendChild(h('div', { class: 'grid grid-cards' }, cities.map((c) => h('a', { class: 'card', href: '#/directory/city/' + encodeURIComponent(c), style: 'color:inherit;text-decoration:none' }, h('h3', null, c)))));
    return page1;
  }

  async function directoryCity(city) {
    const markets = await api('/directory/markets?city=' + encodeURIComponent(city));
    return page('#/directory',
      h('p', null, h('a', { href: '#/directory' }, '← All cities')),
      h('h1', null, city),
      h('p', { class: 'muted' }, 'Each market has its own vendor list.'),
      markets.length ? h('div', { class: 'grid grid-cards' }, markets.map((m) => h('a', { class: 'card', href: '#/directory/market/' + m.id, style: 'color:inherit;text-decoration:none' },
        h('div', { class: 'spread' }, badge(m.status), h('span', { class: 'small muted' }, m.vendors + ' vendors')),
        h('h3', { style: 'margin-top:8px' }, m.name), h('div', { class: 'small muted' }, fmtDate(m.date))))) : h('p', { class: 'muted' }, 'No markets in this city yet.'));
  }

  async function directoryMarket(id) {
    const q = h('input', { type: 'search', placeholder: 'Search by business name', 'aria-label': 'Search vendors' });
    const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'),
      [['sponsors', 'Sponsors'], ['corporate', 'Corporate vendors'], ['premium', 'Premium vendors'], ['general', 'General vendors']].map(([v, l]) => h('option', { value: v }, l)));
    const out = h('div');
    const load = async () => {
      const rows = await api(`/directory/markets/${id}/vendors?q=${encodeURIComponent(q.value)}&category=${encodeURIComponent(cat.value)}`);
      out.replaceChildren(table([
        { label: 'Business', render: (v) => h('a', { href: '#/vendors/' + v.business_id }, v.name) },
        { label: 'Category', render: (v) => v.category_label },
        { label: 'Booth', render: (v) => v.booth_number || '' },
      ], rows, { empty: 'No vendors match. Try another search.' }));
    };
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    cat.addEventListener('change', load);
    await load();
    const markets = await api('/directory/markets');
    const m = markets.find((x) => String(x.id) === String(id));
    return page('#/directory',
      h('p', null, h('a', { href: '#/directory/city/' + encodeURIComponent(m ? m.city : '') }, '← ' + (m ? m.city : 'Back'))),
      h('h1', null, m ? m.name : 'Vendors'),
      m ? h('p', { class: 'muted' }, fmtDate(m.date) + ' · ' + m.venue) : null,
      h('div', { class: 'row', style: 'margin:14px 0' }, q, cat),
      out);
  }

  async function vendorProfile(id) {
    const v = await api('/directory/vendors/' + id);
    const socials = Object.entries(v.socials || {}).filter(([, s]) => s);
    return page('#/directory',
      h('p', null, h('a', { href: 'javascript:history.back()' }, '← Back')),
      h('h1', null, v.name),
      h('p', { class: 'muted' }, v.category),
      h('div', { class: 'grid grid-2', style: 'margin-top:16px' },
        h('div', { class: 'card' }, h('p', null, v.description || 'No description yet.')),
        h('div', { class: 'card' },
          h('dl', { class: 'kv' },
            v.phone ? [h('dt', null, 'Phone'), h('dd', null, h('a', { href: 'tel:' + v.phone.replace(/\s/g, '') }, v.phone))] : null,
            v.email ? [h('dt', null, 'Email'), h('dd', null, h('a', { href: 'mailto:' + v.email }, v.email))] : null,
            v.website ? [h('dt', null, 'Website'), h('dd', null, h('a', { href: v.website, rel: 'noopener', target: '_blank' }, v.website))] : null,
            socials.length ? [h('dt', null, 'Social'), h('dd', null, socials.map(([k, s]) => h('div', null, k + ': ', s)))] : null)),
        ),
      h('h2', { style: 'margin-top:24px' }, 'Markets'),
      h('ul', null, v.markets.map((m) => h('li', null, h('a', { href: '#/directory/market/' + m.id }, m.name), ' · ' + fmtDate(m.date)))));
  }

  // ---------- marketplace (WEB-22 to WEB-25) ----------
  async function marketplace() {
    const q = h('input', { type: 'search', placeholder: 'Search products and services', 'aria-label': 'Search' });
    const grid = h('div', { class: 'grid grid-cards' });
    const load = async () => {
      const rows = await api('/marketplace/listings?q=' + encodeURIComponent(q.value));
      grid.replaceChildren(...(rows.length ? rows.map(card) : [h('p', { class: 'muted' }, 'No listings match yet.')]));
    };
    const card = (l) => h('a', { class: 'card grid-card', href: '#/listing/' + l.id, style: 'color:inherit;text-decoration:none' },
      l.photo ? h('img', { class: 'thumb', src: l.photo, alt: l.name, loading: 'lazy' }) : h('div', { class: 'thumb', 'aria-hidden': 'true' }),
      h('strong', null, l.name),
      h('div', null, l.sale_price_cents
        ? [h('span', { style: 'text-decoration:line-through;color:var(--muted)' }, money(l.price_cents)), ' ', h('strong', { style: 'color:var(--bad)' }, money(l.sale_price_cents))]
        : money(l.price_cents)),
      h('div', { class: 'small muted' }, l.vendor_name));
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    await load();
    return page('#/marketplace',
      h('h1', null, 'Marketplace'),
      h('p', { class: 'muted' }, 'Browse products from our vendors. Sign in to add items to your cart and message the vendor.'),
      h('div', { class: 'row', style: 'margin:14px 0' }, q),
      grid);
  }

  async function listingDetail(id) {
    const l = await api('/marketplace/listings/' + id);
    const addBtn = h('button', { class: 'btn', onclick: async () => {
      try {
        await api('/buyer/cart', { method: 'POST', body: { listing_id: l.id, qty: 1 } });
        toast('Added to your cart');
      } catch (err) {
        if (err.status === 401) location.href = '/app/login.html?as=buyer&next=' + encodeURIComponent('/app/buyer.html#/marketplace');
        else toast(err.message, true);
      }
    } }, 'Add to cart');
    const photos = (l.photos || []).slice(1);
    return page('#/marketplace',
      h('p', null, h('a', { href: '#/marketplace' }, '← Marketplace')),
      h('div', { class: 'grid grid-2', style: 'align-items:start' },
        h('div', { class: 'stack' }, l.photos[0] ? h('img', { class: 'thumb', src: l.photos[0], alt: l.name }) : null,
          photos.length ? h('div', { class: 'grid grid-3' }, photos.map((p) => h('img', { class: 'thumb', src: p, alt: '' }))) : null),
        h('div', { class: 'stack' },
          h('h1', null, l.name),
          h('div', { class: 'small muted' }, 'From ', h('a', { href: '#/vendors/' + l.business_id }, l.vendor_name)),
          l.sale_price_cents
            ? h('div', null, h('div', { class: 'small muted', style: 'text-decoration:line-through' }, 'Original ' + money(l.original_price_cents)), h('div', { style: 'font-size:24px;font-weight:800;color:var(--bad)' }, 'Sale ' + money(l.sale_price_cents)), h('div', { class: 'small' }, 'You save ' + money(l.saving_cents)))
            : h('div', { style: 'font-size:24px;font-weight:800' }, money(l.price_cents)),
          h('p', null, l.description),
          h('p', { class: 'disclaimer' }, 'Naija Market Day is not liable for transactions between buyers and vendors.'),
          addBtn)));
  }

  // ---------- blog (WEB-26) ----------
  async function blog() {
    const posts = await api('/blog');
    const banner = await bannerSlot('blog');
    return page('#/blog', h('h1', null, 'Blog'), banner,
      posts.length ? h('div', { class: 'grid grid-cards' }, posts.map((p) => h('a', { class: 'card grid-card', href: '#/blog/' + p.slug, style: 'color:inherit;text-decoration:none' },
        p.image_url ? h('img', { class: 'thumb', src: p.image_url, alt: '' }) : null,
        h('div', { class: 'small muted' }, fmtDate(p.publish_at) + (p.category ? ' · ' + p.category : '')),
        h('h3', null, p.title))))
        : h('p', { class: 'muted' }, 'No posts yet.'));
  }
  async function blogPost(slug) {
    const p = await api('/blog/' + encodeURIComponent(slug));
    const banner = await bannerSlot('blog');
    return page('#/blog', h('p', null, h('a', { href: '#/blog' }, '← Blog')), h('h1', null, p.title), banner,
      h('div', { class: 'small muted', style: 'margin-bottom:16px' }, fmtDate(p.publish_at)),
      p.image_url ? h('img', { class: 'thumb', src: p.image_url, alt: '', style: 'margin-bottom:18px' }) : null,
      h('div', { style: 'white-space:pre-wrap;max-width:70ch' }, p.body));
  }

  // ---------- events (WEB-28, WEB-29) ----------
  async function events() {
    const list = await api('/events');
    const submit = h('form', { class: 'card', style: 'max-width:620px;margin-top:24px' },
      h('h2', null, 'Submit a community event'),
      h('p', { class: 'small muted' }, 'Sign in as a user to submit. Events are published after review.'),
      formFields([
        { name: 'title', label: 'Title', required: true },
        { name: 'event_date', label: 'Date', type: 'date', required: true },
        { name: 'place', label: 'Place' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'link', label: 'Link', type: 'url' },
      ]),
      h('button', { class: 'btn', type: 'submit' }, 'Submit for review'));
    onSubmit(submit, async (v) => {
      await api('/events', { method: 'POST', body: v });
      return 'Thanks. Your event is waiting for review.';
    }, { success: (m) => m, reset: true });
    return page('#/events', h('h1', null, 'Community events'), h('p', { class: 'muted' }, 'Other events in the community. Market days are listed under Upcoming markets.'),
      list.length ? table([
        { label: 'Date', render: (e) => fmtDate(e.event_date) },
        { label: 'Event', render: (e) => e.link ? h('a', { href: e.link, rel: 'noopener', target: '_blank' }, e.title) : e.title },
        { label: 'Place', render: (e) => e.place },
        { label: 'About', render: (e) => e.description },
      ], list) : h('p', { class: 'muted', style: 'margin:16px 0' }, 'No community events yet.'),
      h('div', { style: 'margin-top:20px' }, submit));
  }

  // ---------- resources (WEB-30) ----------
  async function resources() {
    const groups = await api('/resources');
    const titles = { faq: 'FAQ', insurance: 'Insurance guidance', training: 'Training videos', health: 'Health forms by city' };
    return page('#/resources', h('h1', null, 'Vendor resources'),
      Object.entries(groups).map(([section, items]) => h('section', { style: 'margin-top:22px' },
        h('h2', null, titles[section] || section),
        h('div', { class: 'stack' }, items.map((r) => h('div', { class: 'card' },
          h('h3', null, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title) : r.title),
          r.city ? h('div', { class: 'small muted' }, r.city) : null,
          r.body ? h('p', { style: 'margin-top:8px;white-space:pre-wrap' }, r.body) : null))))),
      Object.keys(groups).length ? null : h('p', { class: 'muted' }, 'Resources are coming soon.'));
  }

  // ---------- contact (WEB-31) ----------
  async function contact() {
    const form = h('form', { class: 'card', style: 'max-width:600px' },
      formFields([
        { name: 'name', label: 'Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'topic', label: 'Topic', type: 'select', required: true, options: [['Guest registration', 'Guest registration'], ['Vendor applications', 'Vendor applications'], ['Marketplace', 'Marketplace'], ['Sponsorship and ads', 'Sponsorship and ads'], ['Other', 'Other']] },
        { name: 'message', label: 'Message', type: 'textarea', required: true, rows: 6 },
      ]),
      h('button', { class: 'btn', type: 'submit' }, 'Send'));
    onSubmit(form, async (v) => {
      const r = await api('/contact', { method: 'POST', body: v });
      form.replaceChildren(alertBox(r.message, 'ok'));
      return r.message;
    }, { success: (m) => m });
    return page('#/contact', h('h1', null, 'Contact'), h('p', { class: 'muted' }, 'Questions about markets, applications or the marketplace.'), form);
  }

  // ---------- routes ----------
  const routes = [
    [/^#\/?$/, () => home()],
    [/^#\/markets\/?$/, () => marketsList(false)],
    [/^#\/past\/?$/, () => pastMarkets()],
    [/^#\/markets\/(\d+)\/?$/, (m) => marketDetail(m[1], 'view')],
    [/^#\/markets\/(\d+)\/register\/?$/, (m) => marketDetail(m[1], 'view').then((n) => n)],
    [/^#\/markets\/(\d+)\/apply\/?$/, (m) => marketDetail(m[1], 'apply')],
    [/^#\/directory\/?$/, () => directory()],
    [/^#\/directory\/city\/(.+)$/, (m) => directoryCity(decodeURIComponent(m[1]))],
    [/^#\/directory\/market\/(\d+)$/, (m) => directoryMarket(m[1])],
    [/^#\/vendors\/(\d+)$/, (m) => vendorProfile(m[1])],
    [/^#\/marketplace\/?$/, () => marketplace()],
    [/^#\/listing\/(\d+)$/, (m) => listingDetail(m[1])],
    [/^#\/blog\/?$/, () => blog()],
    [/^#\/blog\/(.+)$/, (m) => blogPost(decodeURIComponent(m[1]))],
    [/^#\/events\/?$/, () => events()],
    [/^#\/resources\/?$/, () => resources()],
    [/^#\/contact\/?$/, () => contact()],
  ];

  // Render the public site into #root. Each page replaces #outlet content from the router.
  const renderRoute = router(root, routes.map(([re, fn]) => [re, async (m) => {
    const node = await fn(m);
    // Each page gets its own title (WEB-33). The first heading names the page.
    const heading = node.querySelector && node.querySelector('h1');
    document.title = (heading ? heading.textContent.trim() + ' · ' : '') + 'Naija Market Day';
    return node;
  }]), '#/');
  loadDisclaimer();
  // Make sure the header and footer show up on every route, including the ones that come through the router.
  window.addEventListener('hashchange', () => setTimeout(loadDisclaimer, 300));
  return renderRoute;
})();
