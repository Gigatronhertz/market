/* Sign-in, set-password, guest ticket and unsubscribe pages. Selected by <body data-page>. */
(function () {
  'use strict';
  const { h, api, fmtDate, toast, alertBox, formFields, onSubmit, badge, money } = window.UI;
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page;
  const root = document.getElementById('root');
  const authShell = (title, ...kids) => h('div', { class: 'auth-card' },
    h('p', { style: 'margin-top:10px' }, h('a', { href: '/app/' }, '← Naija Market Day')),
    h('h1', { style: 'margin-top:8px' }, title), ...kids);

  // Where to go after a successful sign-in, by role. A safe `next` path wins when it is inside /app/.
  function landing(user) {
    const next = params.get('next');
    if (next && next.startsWith('/app/') && !next.includes('//')) return next;
    const roles = user.roles || [];
    if (roles.includes('admin')) return '/app/admin.html';
    if (roles.includes('staff')) return '/app/checkin.html';
    if (roles.includes('vendor') && params.get('as') !== 'buyer') return '/app/vendor.html';
    return '/app/buyer.html';
  }

  // ---------- vendor and buyer sign-in ----------
  function loginPage() {
    const as = params.get('as') === 'buyer' ? 'buyer' : 'vendor';
    const isVendor = as === 'vendor';
    const email = params.get('email') || '';
    const signin = h('div', null);
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    let mode = 'password';

    function passwordForm() {
      const f = h('form', { class: 'card' },
        formFields([
          { name: 'email', label: 'Email', type: 'email', required: true, value: email, autocomplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' },
        ]),
        h('button', { class: 'btn block', type: 'submit' }, 'Sign in'),
        h('p', { class: 'small', style: 'margin-top:12px;text-align:center' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); forgot(); } }, 'Forgot password?')));
      onSubmit(f, async (v) => {
        const r = await api('/auth/login', { method: 'POST', body: { email: v.email, password: v.password, portal: as } });
        location.href = landing(r.user);
        return 'Signed in';
      }, { success: (m) => m });
      return f;
    }

    function codeForm() {
      const sent = h('div');
      const emailIn = h('input', { type: 'email', name: 'email', required: true, value: email, autocomplete: 'email' });
      const codeIn = h('input', { type: 'text', name: 'code', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '6-digit code' });
      const askBtn = h('button', { class: 'btn', type: 'button' }, 'Email me a code');
      const f = h('form', { class: 'card' },
        h('div', { class: 'field' }, h('label', null, 'Vendor email'), emailIn),
        h('div', { class: 'field hidden', id: 'code-field' }, h('label', null, 'Code from your email'), codeIn, h('div', { class: 'help' }, 'The code expires in 10 minutes and works once.')),
        askBtn,
        h('button', { class: 'btn block hidden', type: 'submit', id: 'code-submit', style: 'margin-top:10px' }, 'Sign in with code'),
        sent);
      askBtn.addEventListener('click', async () => {
        try {
          await api('/auth/otp/request', { method: 'POST', body: { email: emailIn.value } });
          sent.replaceChildren(alertBox('If that email has a vendor account, a code is on its way.', 'ok'));
          f.querySelector('#code-field').classList.remove('hidden');
          f.querySelector('#code-submit').classList.remove('hidden');
          askBtn.textContent = 'Send a new code';
          codeIn.focus();
        } catch (err) { toast(err.message, true); }
      });
      onSubmit(f, async (v) => {
        const r = await api('/auth/otp/verify', { method: 'POST', body: { email: v.email || emailIn.value, code: codeIn.value } });
        location.href = landing(r.user);
        return 'Signed in';
      }, { success: (m) => m });
      return f;
    }

    function buyerSignup() {
      const f = h('form', { class: 'card' },
        formFields([
          { name: 'name', label: 'Full name', required: true, autocomplete: 'name' },
          { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
          { name: 'password', label: 'Password (8+ characters)', type: 'password', required: true, autocomplete: 'new-password' },
          { name: 'marketing_consent', label: 'Send me market news and offers', type: 'checkbox', value: false },
        ]),
        h('button', { class: 'btn block', type: 'submit' }, 'Create account'));
      onSubmit(f, async (v) => {
        const r = await api('/auth/buyer/signup', { method: 'POST', body: v });
        location.href = landing(r.user);
        return 'Account created';
      }, { success: (m) => m });
      return f;
    }

    function forgot() {
      const m = window.UI.modal('Reset your password', h('form', null,
        formFields([{ name: 'email', label: 'Email', type: 'email', required: true }]),
        h('button', { class: 'btn', type: 'submit' }, 'Email me a reset link')), []);
      const f = m.close && document.querySelector('.modal form');
      onSubmit(f, async (v) => {
        await api('/auth/password/forgot', { method: 'POST', body: { email: v.email } });
        m.close();
        return 'If that email has an account, a reset link is on its way.';
      }, { success: (x) => x });
    }

    function show(which) {
      mode = which;
      tabs.replaceChildren(...tabDefs().map(([key, label]) => h('button', { role: 'tab', class: key === which ? 'on' : '', onclick: () => show(key) }, label)));
      signin.replaceChildren(which === 'password' ? passwordForm() : which === 'code' ? codeForm() : buyerSignup());
    }
    function tabDefs() {
      return isVendor ? [['password', 'Password'], ['code', 'One-time code']] : [['password', 'Sign in'], ['signup', 'Create account']];
    }

    const title = isVendor ? 'Vendor sign in' : 'Sign in or create an account';
    show(isVendor && email ? 'code' : 'password');
    root.replaceChildren(authShell(title,
      isVendor ? h('p', { class: 'muted' }, 'Vendors sign in with the password they set after their first paid application, or with a one-time code sent to their email.')
        : h('p', { class: 'muted' }, 'Buyers need an account to use the cart and chat with vendors.'),
      tabs, signin,
      isVendor ? h('p', { class: 'small muted', style: 'margin-top:14px' }, 'Not a vendor yet? ', h('a', { href: '/app/#/markets' }, 'Browse markets and apply')) : null));
    if (!isVendor) show('password');
  }

  // ---------- admin and staff sign-in (not linked from the public site) ----------
  function adminLoginPage() {
    const f = h('form', { class: 'card' },
      formFields([
        { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username' },
        { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' },
      ]),
      h('button', { class: 'btn block', type: 'submit' }, 'Sign in'));
    onSubmit(f, async (v) => {
      const r = await api('/auth/login', { method: 'POST', body: { email: v.email, password: v.password, portal: 'staff' } });
      location.href = landing(r.user);
      return 'Signed in';
    }, { success: (m) => m });
    root.replaceChildren(authShell('Staff and admin sign in', h('p', { class: 'muted' }, 'For the Naija Market Day team only.'), f));
  }

  // ---------- set password (vendor welcome, staff invite, reset) ----------
  function setPasswordPage() {
    const t = params.get('t') || '';
    const f = h('form', { class: 'card' },
      formFields([
        { name: 'password', label: 'New password (8+ characters)', type: 'password', required: true, autocomplete: 'new-password' },
        { name: 'confirm', label: 'Type it again', type: 'password', required: true, autocomplete: 'new-password' },
      ]),
      h('button', { class: 'btn block', type: 'submit' }, 'Save and sign in'));
    onSubmit(f, async (v) => {
      if (v.password !== v.confirm) throw new Error('The two passwords do not match.');
      const r = await api('/auth/password/set', { method: 'POST', body: { token: t, password: v.password } });
      location.href = landing(r.user);
      return 'Password saved';
    }, { success: (m) => m });
    root.replaceChildren(authShell('Set your password',
      t ? h('p', { class: 'muted' }, 'Choose a password to finish setting up your account.') : alertBox('This link is missing its code. Use the link from your email.', 'bad'),
      t ? f : null));
  }

  // ---------- guest ticket (WEB-15) ----------
  async function ticketPage() {
    const t = params.get('t') || '';
    try {
      const r = await api('/tickets/' + encodeURIComponent(t));
      root.replaceChildren(authShell('Your ticket',
        h('div', { class: 'card', style: 'text-align:center' },
          h('img', { class: 'qr', src: r.qr_data_url, alt: 'Your entry QR code' }),
          h('h2', { style: 'margin-top:12px' }, r.name),
          h('p', { class: 'muted' }, `${r.guests_count} ${r.guests_count === 1 ? 'person' : 'people'}`),
          h('p', null, h('strong', null, r.market.name)),
          h('p', { class: 'muted' }, `${r.market.city} · ${fmtDate(r.market.date)}${r.market.start_time ? ' · ' + r.market.start_time : ''}${r.market.venue ? ' · ' + r.market.venue : ''}`),
          r.checked_in ? badge('checked_in') : h('p', { class: 'small muted' }, 'Show this code at the entrance.'),
        )));
    } catch (err) {
      root.replaceChildren(authShell('Ticket not found', alertBox(err.message, 'bad')));
    }
  }

  // ---------- newsletter unsubscribe (WEB-32) ----------
  async function unsubscribePage() {
    const t = params.get('t') || '';
    try {
      await api('/newsletter/unsubscribe', { method: 'POST', body: { token: t } });
      root.replaceChildren(authShell('You are unsubscribed', alertBox('You will no longer receive Naija Market Day news.', 'ok')));
    } catch (err) {
      root.replaceChildren(authShell('Something went wrong', alertBox(err.message, 'bad')));
    }
  }

  const pages = { login: loginPage, admin: adminLoginPage, 'set-password': setPasswordPage, ticket: ticketPage, unsubscribe: unsubscribePage };
  (pages[page] || (() => root.replaceChildren(alertBox('Unknown page.', 'bad'))))();
})();
