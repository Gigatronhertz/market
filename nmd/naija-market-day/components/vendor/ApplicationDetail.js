'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate, money } from '../../lib/format';
import { badge } from '../Badge';
import { useToast } from '../Toast';

export default function ApplicationDetail({ id }) {
  const toast = useToast();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/vendor/applications/' + id).then(setA).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function resubmit() {
    try { await api('/vendor/applications/' + id + '/resubmit', { method: 'POST' }); toast('Sent back for review'); load(); }
    catch (e) { toast(e.message, true); }
  }

  if (error) return <div className="alert bad">{error}</div>;
  if (!a) return <p className="muted">Loading...</p>;
  return (
    <>
      <p><Link href="/vendor/applications">← Applications</Link></p>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="spread"><h2>{a.market.name}</h2>{badge(a.status)}</div>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Date</dt><dd>{fmtDate(a.market.date)}{a.market.start_time ? ' · ' + a.market.start_time : ''}</dd>
            <dt>Venue</dt><dd>{a.market.venue || ''}</dd>
            <dt>Business</dt><dd>{a.business?.name || ''}</dd>
            <dt>Booth</dt><dd>{a.booth ? `${a.booth.number} (${a.booth.tier})` : 'Not chosen yet'}</dd>
            <dt>Payment</dt><dd>{badge(a.payment_status)} {a.booth ? money(a.booth.price_cents) : ''}</dd>
          </dl>
        </div>
        {a.qr_data_url && <div className="card" style={{ textAlign: 'center' }}><h3>Your vendor QR code</h3><img className="qr" src={a.qr_data_url} alt="Vendor QR code" /><p className="small muted">Show this at the entrance. Staff scan it on arrival.</p></div>}
      </div>
      <div className="stack" style={{ marginTop: 18 }}>
        {a.status === 'more_info' && <div className="alert warn">The team asked for more information: {a.more_info_note}<div style={{ marginTop: 10 }}><button className="btn primary small-btn" onClick={resubmit}>I have updated my application, resubmit</button></div></div>}
        {a.status === 'approved' && <div className="alert ok">Approved. Your booth is confirmed and your QR code is above.</div>}
        {a.status === 'declined' && <div className="alert bad">This application was declined and the booth fee was refunded automatically.</div>}
        {a.status === 'draft' && <div className="alert warn">This application is not finished. Continue it from <Link href="/sell">Sell on NMD</Link>.</div>}
      </div>
      {a.payments?.length > 0 && (
        <section className="card" style={{ marginTop: 18 }}>
          <h3>Payments</h3>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{a.payments.map((p, i) => <tr key={i}><td>{fmtDate(p.created_at)}</td><td>{p.kind}</td><td>{money(p.amount_cents)}</td><td>{badge(p.status)}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
