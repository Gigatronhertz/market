'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate, money } from '../../lib/format';
import { useBusiness, BusinessSwitcher } from '../useBusiness';

// Overview: the cards from vendor-dashboard.html, with live numbers.
export default function VendorOverview() {
  const [bizId, setBizId] = useBusiness();
  const [businesses, setBusinesses] = useState([]);
  const [d, setD] = useState(null);
  const [listings, setListings] = useState([]);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/vendor/businesses').then(setBusinesses).catch(() => {}); }, []);
  useEffect(() => {
    const q = bizId ? '?business_id=' + bizId : '';
    api('/vendor/dashboard' + q).then(setD).catch((e) => setError(e.message));
    api('/vendor/listings' + q).then(setListings).catch(() => {});
  }, [bizId]);
  useEffect(() => {
    if (!d?.next_market) { setQr(null); return; }
    api('/vendor/applications/' + d.next_market.application_id + '/qr').then((r) => setQr(r.qr_data_url)).catch(() => setQr(null));
  }, [d]);

  const cards = d ? [
    ['Applications', d.applications_total, '/vendor/applications'],
    ['Under review', d.application_counts.under_review || 0, '/vendor/applications'],
    ['Need your reply', d.application_counts.more_info || 0, '/vendor/applications'],
    ['Approved', d.application_counts.approved || 0, '/vendor/applications'],
    ['Unread messages', d.unread_messages, '/vendor/messages'],
    ['Marketplace', d.subscription.active ? (d.subscription.status === 'trial' ? 'Free period' : 'Active') : 'Not subscribed', '/vendor/marketplace'],
  ] : [];
  const live = listings.filter((l) => !l.hidden && l.subscription_active).length;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Welcome</h1>
          <p>Applications, booths, chats and your products in one place.</p>
        </div>
      </div>
      <BusinessSwitcher businesses={businesses} value={bizId} onChange={setBizId} />
      {error && <div className="alert bad">{error}</div>}
      {d && (
        <div className="kpi">
          {cards.map(([label, n, href]) => (
            <Link key={label} href={href} className="card lift" style={{ color: 'inherit' }}>
              <div className="l">{label}</div>
              <div className="n" data-count={typeof n === 'number' ? n : undefined}>{String(n)}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h3>Booth and payments</h3>
          {d?.next_market ? (
            <div className="stack">
              <div className="line"><span className="muted">Market</span><span>{d.next_market.name} · {d.next_market.city}</span></div>
              <div className="line"><span className="muted">Date</span><span>{fmtDate(d.next_market.date)}</span></div>
              <div className="line"><span className="muted">Booth</span><span>{d.next_market.booth || 'To be confirmed'}</span></div>
              <Link className="btn primary" href="/vendor/booth">Pay booth fee</Link>
            </div>
          ) : <p className="muted">No approved upcoming market yet. <Link href="/markets">Apply to a market</Link>.</p>}
        </section>
        <section className="card" style={{ textAlign: 'center' }}>
          <h3>QR check-in</h3>
          {qr ? <img className="qr" src={qr} alt="Your vendor QR code" /> : <p className="muted">Your code appears here once an application is approved.</p>}
          <div className="small muted" style={{ marginTop: 8 }}>Show this code to NMD staff when you arrive.</div>
        </section>
      </div>

      <section className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h3>Products</h3>
          <Link className="btn primary small-btn" href="/vendor/products/new">Add product</Link>
        </div>
        {listings.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Status</th></tr></thead>
              <tbody>
                {listings.slice(0, 6).map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td><td className="muted">{l.category || ''}</td>
                    <td>{l.sale_price_cents ? money(l.sale_price_cents) : money(l.price_cents)}</td>
                    <td><span className={'badge ' + (l.hidden ? '' : l.subscription_active ? 'ok' : 'bad')}>{l.hidden ? 'Draft' : l.subscription_active ? 'Live' : 'Offline'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 8 }}>{live} live now.</p>
          </div>
        ) : <p className="muted">No products yet. Add your first product.</p>}
      </section>
    </>
  );
}
