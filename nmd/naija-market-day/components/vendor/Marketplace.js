'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate, money } from '../../lib/format';
import { badge } from '../Badge';
import { useToast } from '../Toast';

// Subscriptions per business (VEN-32). The first business gets a free starting period.
export default function Marketplace() {
  const toast = useToast();
  const [businesses, setBusinesses] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState('monthly');
  const load = () => api('/vendor/businesses').then(setBusinesses).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
    api('/settings/public').then((s) => setPlans(s.plans)).catch(() => {});
  }, []);

  async function subscribe(b) {
    try {
      const r = await api(`/vendor/businesses/${b.id}/subscribe`, { method: 'POST', body: { plan_code: plan } });
      if (r.redirect) { window.location.href = r.redirect; return; }
      toast(r.status === 'trial' ? 'Marketplace is on for your free period' : 'Subscribed');
      load();
    } catch (e) { toast(e.message, true); }
  }
  async function cancel(b) {
    if (!window.confirm('Cancel this subscription? Listings stay online until the end of the period.')) return;
    try { const r = await api(`/vendor/businesses/${b.id}/cancel`, { method: 'POST' }); toast('Cancelled. Listings go offline on ' + fmtDate(r.listings_offline_on)); load(); }
    catch (e) { toast(e.message, true); }
  }

  if (!businesses) return <p className="muted">Loading...</p>;
  return (
    <>
      <div className="pagehead"><div><h1>Marketplace</h1><p>Sell products online. Each business subscribes separately.</p></div><Link className="btn ghost" href="/vendor/products">Products</Link></div>
      {businesses.length === 0 && <div className="card empty-state">Add a business first, under My businesses.</div>}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {businesses.map((b) => {
          const s = b.subscription;
          return (
            <section key={b.id} className="card stack">
              <div className="spread"><h3>{b.name}</h3>{badge(s.active ? s.status : 'none')}</div>
              {s.active ? (
                <p className="small">{s.status === 'trial' ? 'Free period ends ' : 'Renews '}{fmtDate(s.renews_at)}{s.cancel_at_period_end ? ' · Cancelled: listings go offline then' : ''}</p>
              ) : <p className="small muted">Subscribe to sell on Marketplace. Your directory listing does not need a subscription.</p>}
              {s.active ? (
                !s.cancel_at_period_end && <button className="btn ghost small-btn" onClick={() => cancel(b)}>Cancel subscription</button>
              ) : (
                <div className="row">
                  <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {plans.map((p) => <option key={p.code} value={p.code}>{p.name}: {money(p.price_cents)} ({p.free_days} days free to start)</option>)}
                  </select>
                  <button className="btn primary small-btn" onClick={() => subscribe(b)}>{s.status === 'lapsed' || s.status === 'cancelled' ? 'Renew' : 'Subscribe'}</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
