'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { money, fmtDate } from '../lib/format';
import { useToast } from './Toast';

const STEPS = ['Business details', 'Regulatory documents', 'Booth and payments', 'Review and submit'];
const TOKEN_KEY = 'nmd-apply-token';

function call(path, opts = {}) {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  return api(path, { ...opts, token: token || undefined });
}

export default function SellWizard({ markets, presetMarket = '', presetEmail = '' }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [app, setApp] = useState(null);
  const [booths, setBooths] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/auth/me').then((r) => setMe(r.user)).catch(() => {});
  }, []);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) {
      if (err instanceof ApiError && err.status === 409 && /sign in/i.test(err.message)) { setError(err.message); }
      else setError(err.message);
      toast(err.message, true);
    }
    setBusy(false);
  }

  // Step 1: start the application for the market, then save the business and category.
  function saveBusiness(f) {
    return run(async () => {
      let a;
      if (app) a = app;
      else {
        const r = await api('/apply/start', { method: 'POST', body: { market_id: Number(f.market_id), email: f.email } });
        if (r.needs_sign_in) {
          window.location.href = `/login?as=vendor&email=${encodeURIComponent(f.email)}&next=${encodeURIComponent('/sell?market=' + f.market_id)}`;
          throw new Error('This email already has an account. Sign in to continue your application.');
        }
        if (r.token) sessionStorage.setItem(TOKEN_KEY, r.token);
        a = r.application || r.app;
      }
      const id = a.id;
      await call('/apply/' + id, { method: 'PUT', body: {
        business: { name: f.business, category: f.category, contact_person: f.contact_person, phone: f.phone, city: f.city, description: f.about + (f.instagram ? '\nInstagram: ' + f.instagram : '') },
        complete_step: 'details' } });
      a = await call('/apply/' + id, { method: 'PUT', body: {
        category: f.category === 'food' ? 'premium' : 'general',
        answers: { is_food: f.category === 'food', what_you_sell: f.about || 'Products and crafts' },
        complete_step: 'category' } });
      setApp(a);
      setStep(2);
      toast('Business saved.');
    });
  }

  // Step 2: the food certificate is required for food sellers; other sellers can skip.
  function uploadCertificate(file, expires) {
    return run(async () => {
      if (!file) {
        if (app?.answers?.is_food) throw new Error('Food sellers must upload a city food certificate.');
      } else {
        if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB.');
        const data_url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        await call('/apply/' + app.id + '/documents', { method: 'POST', body: { kind: 'food_certificate', filename: file.name, data_url, expires_on: expires || null } });
      }
      const list = await call('/apply/' + app.id + '/booths');
      setBooths(list);
      setStep(3);
    });
  }

  // Step 3: hold the booth, accept the terms, and pay.
  function payBooth(boothId, accepted) {
    return run(async () => {
      if (!boothId) throw new Error('Choose a booth.');
      if (!accepted) throw new Error('Accept the event terms to continue.');
      let a = await call('/apply/' + app.id + '/booth', { method: 'POST', body: { booth_id: Number(boothId) } });
      a = await call('/apply/' + a.id + '/terms', { method: 'POST', body: { accepted: true } });
      setApp(a);
      const r = await call('/apply/' + a.id + '/pay', { method: 'POST', body: {} });
      if (r.redirect) { window.location.href = r.redirect; return; }
      setApp(await call('/apply/' + a.id));
      setStep(4);
      toast('Booth fee paid. Your application is under review.');
    });
  }

  return (
    <section className="section-tight" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 250px' }}>
        <h1 style={{ fontSize: 30 }}>Vendor onboarding</h1>
        <p className="muted">Four short steps. NMD reviews your documents before your booth is confirmed.</p>
        <ol className="card" style={{ listStyle: 'none', margin: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
          {STEPS.map((label, i) => (
            <li key={label} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: step === i + 1 ? 700 : 400 }}>
              <span className={'dot' + (step === i + 1 ? ' cur' : '')} style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: step > i + 1 ? 'var(--green)' : step === i + 1 ? 'var(--ink)' : '#EEF1EF', color: step >= i + 1 ? '#fff' : 'var(--muted)', fontSize: 13 }}>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="card" style={{ flex: '1 1 520px', minWidth: 0 }}>
        {error && <div className="alert bad">{error}</div>}
        {step === 1 && <StepBusiness markets={markets} presetMarket={presetMarket} presetEmail={presetEmail} me={me} busy={busy} onSubmit={saveBusiness} />}
        {step === 2 && <StepDocuments busy={busy} food={!!app?.answers?.is_food} onBack={() => setStep(1)} onSubmit={uploadCertificate} />}
        {step === 3 && <StepBooth busy={busy} booths={booths} terms={app?.market?.terms} onBack={() => setStep(2)} onSubmit={payBooth} />}
        {step === 4 && app && <StepReview app={app} />}
      </div>
    </section>
  );
}

function StepBusiness({ markets, presetMarket, presetEmail, me, busy, onSubmit }) {
  const [market, setMarket] = useState(presetMarket || (markets[0] ? String(markets[0].id) : ''));
  const email = me?.email || presetEmail;
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const f = e.currentTarget;
      onSubmit({
        market_id: f.market_id.value, email: f.email.value, contact_person: f.contact_person.value, phone: f.phone.value,
        business: f.business.value, category: f.category.value, city: f.city.value, instagram: f.instagram.value, about: f.about.value,
      });
    }}>
      <h2 style={{ marginBottom: 16 }}>Tell us about your business</h2>
      <div className="grid grid-2">
        <div className="field"><label>Market you want to trade at</label>
          <select name="market_id" value={market} onChange={(e) => setMarket(e.target.value)} required>
            {markets.length ? markets.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.city}, {fmtDate(m.date)})</option>) : <option value="">No markets are open yet</option>}
          </select></div>
        <div className="field"><label>Your email</label><input name="email" type="email" required defaultValue={email} readOnly={!!me} /></div>
        <div className="field"><label>Your name</label><input name="contact_person" required /></div>
        <div className="field"><label>Phone</label><input name="phone" type="tel" required /></div>
        <div className="field"><label>Business name</label><input name="business" required /></div>
        <div className="field"><label>Category</label>
          <select name="category"><option value="general">Fashion and textiles</option><option value="food">Food and drink</option><option value="general">Jewellery</option><option value="general">Crafts and home</option><option value="general">Beauty</option><option value="general">Music and arts</option></select></div>
        <div className="field"><label>City</label><input name="city" required /></div>
        <div className="field"><label>Instagram</label><input name="instagram" placeholder="@yourshop" /></div>
      </div>
      <div className="field"><label>About your business</label><textarea name="about" rows={4} placeholder="What do you make or sell?" /></div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
        <button className="btn primary" type="submit" disabled={busy || !markets.length}>Continue</button>
      </div>
    </form>
  );
}

function StepDocuments({ busy, food, onBack, onSubmit }) {
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit(e.currentTarget.doc.files[0], e.currentTarget.expires.value);
    }}>
      <h2 style={{ marginBottom: 8 }}>Regulatory documents</h2>
      <p className="muted" style={{ marginBottom: 16 }}>{food ? 'Food sellers must upload a valid city food certificate.' : 'Other sellers can skip this step.'}</p>
      <div className="field"><label>Certificate (PDF or image)</label><input name="doc" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></div>
      <div className="field"><label>Certificate expiry date</label><input name="expires" type="date" /></div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn ghost" type="button" onClick={onBack}>Back</button>
        <button className="btn primary" type="submit" disabled={busy}>Continue</button>
      </div>
    </form>
  );
}

function StepBooth({ busy, booths, terms, onBack, onSubmit }) {
  const [sel, setSel] = useState('');
  const free = booths.filter((b) => b.status === 'available');
  const chosen = free.find((b) => String(b.id) === sel);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(sel, e.currentTarget.accepted.checked); }}>
      <h2 style={{ marginBottom: 16 }}>Booth and payment</h2>
      <div className="field"><label>Booth</label>
        <select value={sel} onChange={(e) => setSel(e.target.value)} required>
          <option value="">Choose a booth</option>
          {free.map((b) => <option key={b.id} value={b.id}>Booth {b.number} · {b.tier} · {money(b.price_cents)}</option>)}
        </select>
      </div>
      {chosen && <p>Booth fee: <strong>{money(chosen.price_cents)}</strong></p>}
      <div className="disclaimer" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{terms || 'Terms will be posted before applications close.'}</div>
      <label className="inline" style={{ alignItems: 'flex-start', margin: '12px 0' }}>
        <input type="checkbox" name="accepted" required /> I accept the event terms. Booth fees are non-refundable after payment unless we decline your application.
      </label>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn ghost" type="button" onClick={onBack}>Back</button>
        <button className="btn primary" type="submit" disabled={busy}>Pay booth fee</button>
      </div>
    </form>
  );
}

function StepReview({ app }) {
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Review and submit</h2>
      <dl className="kv">
        <dt>Market</dt><dd>{app.market?.name} · {fmtDate(app.market?.date)}</dd>
        <dt>Business</dt><dd>{app.business?.name}</dd>
        <dt>Contact</dt><dd>{app.business?.contact_person}</dd>
        <dt>Booth</dt><dd>{app.booth ? `${app.booth.number} (${app.booth.tier})` : 'Not chosen'}</dd>
        <dt>Fee</dt><dd>{app.booth ? money(app.booth.price_cents) : ''}</dd>
        <dt>Status</dt><dd>{app.payment_status === 'paid' ? 'Paid. Under review' : 'Not paid yet'}</dd>
      </dl>
      <p className="small muted" style={{ marginTop: 16 }}>We review every application before the booth is confirmed, and email you when there is an update.</p>
    </div>
  );
}
