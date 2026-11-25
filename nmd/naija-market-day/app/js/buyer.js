/* Buyer workspace: marketplace, cart grouped by store (one store at a time), chats with vendors, account. */
(function () {
  'use strict';
  const { h, api, money, fmtDateTime, timeAgo, badge, toast, alertBox, table, formFields, onSubmit, router, shell, modal, confirmAction } = window.UI;
  const root = document.getElementById('root');
  let me = null;
  let unread = 0;
  let renderRoute = null;
  const go = () => renderRoute && renderRoute();

  function frame(title, ...kids) {
    return h('div', { class: 'stack' }, h('h1', null, title), ...kids);
  }

  // ---------- marketplace ----------
  async function marketplace() {
    const q = h('input', { type: 'search', placeholder: 'Search products', 'aria-label': 'Search products' });
    const grid = h('div', { class: 'grid grid-cards' });
    const draw = async () => {
      const rows = await api('/marketplace/listings?q=' + encodeURIComponent(q.value));
      grid.replaceChildren(...(rows.length ? rows.map((l) => h('div', { class: 'card grid-card' },
        l.photo ? h('img', { class: 'thumb', src: l.photo, alt: l.name }) : h('div', { class: 'thumb' }),
        h('a', { href: '#/listing/' + l.id, style: 'color:inherit;text-decoration:none' }, h('strong', null, l.name)),
        h('div', null, l.sale_price_cents ? [h('s', { class: 'muted' }, money(l.price_cents)), ' ', money(l.sale_price_cents)] : money(l.price_cents)),
        h('div', { class: 'small muted' }, l.vendor_name),
        h('button', { class: 'btn small-btn', onclick: async () => {
          try { await api('/buyer/cart', { method: 'POST', body: { listing_id: l.id, qty: 1 } }); toast('Added to cart'); } catch (err) { toast(err.message, true); }
        } }, 'Add to cart'))) : [h('p', { class: 'muted' }, 'No listings match yet.')]));
    };
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
    await draw();
    return frame('Marketplace', h('p', { class: 'muted' }, 'Add items from several vendors. You check out with one vendor at a time, then chat with them.'),
      h('div', { class: 'row' }, q), grid);
  }

  async function listing(id) {
    const l = await api('/marketplace/listings/' + id);
    return frame(l.name,
      h('p', null, h('a', { href: '#/marketplace' }, '← Marketplace')),
      l.photos[0] ? h('img', { class: 'thumb', src: l.photos[0], alt: l.name, style: 'max-width:480px' }) : null,
      h('p', null, l.description),
      h('div', { style: 'font-size:22px;font-weight:800' }, l.sale_price_cents ? [h('s', { class: 'muted' }, money(l.price_cents)), ' ', money(l.sale_price_cents)] : money(l.price_cents)),
      h('p', { class: 'small muted' }, 'From ', l.vendor_name),
      h('button', { class: 'btn', onclick: async () => {
        try { await api('/buyer/cart', { method: 'POST', body: { listing_id: l.id, qty: 1 } }); toast('Added to cart'); } catch (err) { toast(err.message, true); }
      } }, 'Add to cart'));
  }

  // ---------- cart (BUY-03 to BUY-06) ----------
  async function cart() {
    const c = await api('/buyer/cart');
    if (!c.groups.length) return frame('Cart', h('p', { class: 'muted' }, 'Your cart is empty.'), h('a', { class: 'btn', href: '#/marketplace' }, 'Browse Marketplace'));
    return frame('Cart',
      h('p', { class: 'muted small' }, 'Items are grouped by vendor. Proceed with one vendor at a time. Each vendor is contacted separately.'),
      c.groups.map((g) => h('section', { class: 'card stack' },
        h('div', { class: 'spread' }, h('h2', null, g.vendor_name), h('strong', null, money(g.subtotal_cents))),
        table([
          { label: 'Item', render: (i) => i.name },
          { label: 'Qty', render: (i) => h('input', { type: 'number', min: 0, max: 99, value: i.qty, style: 'width:90px', 'aria-label': 'Quantity for ' + i.name, onchange: async (e) => {
            try { await api('/buyer/cart/' + i.item_id, { method: 'PATCH', body: { qty: Number(e.target.value) } }); go(); } catch (err) { toast(err.message, true); }
          } }) },
          { label: 'Price', render: (i) => money(i.line_cents) },
          { label: '', render: (i) => h('button', { class: 'btn ghost small-btn', onclick: async () => {
            try { await api('/buyer/cart/' + i.item_id, { method: 'DELETE' }); go(); } catch (err) { toast(err.message, true); }
          } }, 'Remove') },
        ], g.items),
        h('div', null, h('button', { class: 'btn', onclick: () => proceed(g, c.disclaimer) }, 'Proceed with ' + g.vendor_name))))
    );
  }

  // Liability disclaimer is shown before every chat (BUY-06). Expected reply time is shown too (BUY-09).
  function proceed(group, disclaimer) {
    const ack = h('input', { type: 'checkbox', 'aria-label': 'I have read the disclaimer' });
    const m = modal('Before you chat with ' + group.vendor_name, h('div', { class: 'stack' },
      h('p', null, 'We will send ', h('strong', null, group.vendor_name), ' your selected items. You will pay them directly, outside the platform.'),
      h('div', { class: 'disclaimer', style: 'color:var(--ink)' }, disclaimer),
      h('label', { class: 'inline' }, ack, 'I have read and accept this disclaimer.')), [
      (close) => h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
      (close) => h('button', { class: 'btn', onclick: async () => {
        if (!ack.checked) return toast('Please accept the disclaimer first.', true);
        try {
          const r = await api('/buyer/cart/proceed', { method: 'POST', body: { business_id: group.business_id, acknowledged: true } });
          close();
          toast(`Sent. The vendor usually replies within ${r.expected_reply_hours} hours.`);
          location.hash = '#/messages/' + r.chat_id;
        } catch (err) { toast(err.message, true); }
      } }, 'Start chat'),
    ]);
    return m;
  }

  // ---------- messages and requests (BUY-07, BUY-08, BUY-10, BUY-11) ----------
  async function messages() {
    const chats = await api('/buyer/chats');
    return frame('Messages', table([
      { label: 'Vendor', render: (c) => h('a', { href: '#/messages/' + c.id }, c.business_name) },
      { label: 'Last message', render: (c) => c.last_message },
      { label: 'Status', render: (c) => badge(c.status) },
      { label: 'When', render: (c) => timeAgo(c.last_at) },
    ], chats, { empty: 'No chats yet. Add items to your cart and proceed with a vendor.' }));
  }

  // Renders the messages list. Used on load and by the live refresh.
  const bubbles = (c) => c.messages.map((m) => h('div', { class: 'bubble ' + (m.sender_role === 'buyer' ? 'me' : '') },
    h('div', { class: 'meta' }, (m.sender_role === 'buyer' ? 'You' : c.business_name) + ' · ' + fmtDateTime(m.created_at)),
    m.body,
    m.payment_link ? h('div', { style: 'margin-top:8px' }, h('a', { href: m.payment_link, rel: 'noopener', target: '_blank', class: 'btn small-btn' }, 'Open payment link')) : null));

  async function thread(id) {
    const c = await api('/buyer/chats/' + id);
    const log = h('div', { class: 'chat', 'aria-live': 'polite' }, bubbles(c));
    // Live: new vendor replies appear without reloading. Only new messages animate in.
    let seen = c.messages.length;
    window.UI.poll(async () => {
      if (!document.body.contains(log)) return;
      const fresh = await api('/buyer/chats/' + id).catch(() => null);
      if (!fresh || fresh.messages.length === seen) return;
      seen = fresh.messages.length;
      log.replaceChildren(...bubbles(fresh));
      log.lastElementChild && log.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 8000);
    const input = h('textarea', { rows: 2, 'aria-label': 'Message', placeholder: 'Write a message…' });
    return frame('Chat with ' + c.business_name,
      h('p', null, h('a', { href: '#/messages' }, '← Messages')),
      alertBox(`The vendor usually replies within ${c.expected_reply_hours} hours. Payment is arranged directly with the vendor.`, 'info'),
      h('div', { class: 'card' }, log),
      h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'field' }, input),
        h('button', { class: 'btn', onclick: async () => {
          if (!input.value.trim()) return;
          try { await api('/buyer/chats/' + id + '/messages', { method: 'POST', body: { body: input.value } }); go(); } catch (err) { toast(err.message, true); }
        } }, 'Send')),
      h('p', { class: 'disclaimer' }, c.disclaimer));
  }

  // ---------- account (BUY-01, BUY-02, BUY-12) ----------
  async function account() {
    const a = await api('/buyer/account');
    const form = h('form', { class: 'card', style: 'max-width:560px' }, formFields([
      { name: 'name', label: 'Name', value: a.name },
      { name: 'email', label: 'Email', type: 'email', value: a.email },
      { name: 'newsletter_choice', label: 'Send me market news and offers', type: 'checkbox', value: a.newsletter_choice },
      { name: 'current_password', label: 'Current password (only to change it)', type: 'password', autocomplete: 'current-password' },
      { name: 'password', label: 'New password (8+ characters, optional)', type: 'password', autocomplete: 'new-password' },
    ]), h('button', { class: 'btn', type: 'submit' }, 'Save changes'));
    onSubmit(form, async (v) => {
      const body = { name: v.name, email: v.email, newsletter_choice: v.newsletter_choice };
      if (v.password) { body.password = v.password; body.current_password = v.current_password; }
      await api('/buyer/account', { method: 'PUT', body });
      form.reset();
      go();
      return 'Saved';
    }, { success: (x) => x });
    return frame('Account', form);
  }

  async function bellPage() {
    const n = await api('/buyer/notifications');
    await api('/buyer/notifications/read', { method: 'POST' }).catch(() => {});
    return frame('Notifications', n.items.length ? h('div', { class: 'stack' }, n.items.map((i) => h('div', { class: 'card' }, h('strong', null, i.title), h('div', { class: 'small muted' }, i.body), h('div', { class: 'small muted' }, timeAgo(i.created_at))))) : h('p', { class: 'muted' }, 'No notifications yet.'));
  }

  const sections = () => [
    { items: [
      { label: 'Marketplace', href: '#/marketplace', match: (x) => x === '' || x === '#' || x === '#/' || x.startsWith('#/marketplace') || x.startsWith('#/listing') },
      { label: 'Cart', href: '#/cart' },
      { label: 'Messages', href: '#/messages', match: (x) => x.startsWith('#/messages') },
    ] },
    { title: 'Account', items: [
      { label: 'Notifications', href: '#/notifications', count: unread || null },
      { label: 'Account', href: '#/account' },
    ] },
  ];

  const routes = [
    [/^#?\/?$/, () => marketplace()],
    [/^#\/marketplace\/?$/, () => marketplace()],
    [/^#\/listing\/(\d+)$/, (m) => listing(m[1])],
    [/^#\/cart\/?$/, () => cart()],
    [/^#\/messages\/?$/, () => messages()],
    [/^#\/messages\/(\d+)$/, (m) => thread(m[1])],
    [/^#\/account\/?$/, () => account()],
    [/^#\/notifications\/?$/, () => bellPage()],
  ];

  async function boot() {
    try {
      const r = await api('/auth/me');
      if (!r.user || !(r.user.roles || []).includes('buyer')) {
        location.replace('/app/login.html?as=buyer&next=' + encodeURIComponent('/app/buyer.html'));
        return;
      }
      me = r.user;
    } catch {
      location.replace('/app/login.html?as=buyer');
      return;
    }
    unread = (await api('/buyer/notifications').catch(() => ({ unread: 0 }))).unread;
    const side = shell({ brand: 'Marketplace', sections: sections(), user: me, onSignOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/app/login.html?as=buyer';
    } });
    root.replaceChildren(side.root);
    renderRoute = router(side.main, routes, '#/');
  }
  boot();
})();
