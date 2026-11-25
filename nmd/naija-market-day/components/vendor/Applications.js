'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { badge } from '../Badge';
import { useBusiness, BusinessSwitcher } from '../useBusiness';

export default function Applications() {
  const [bizId, setBizId] = useBusiness();
  const [businesses, setBusinesses] = useState([]);
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/vendor/businesses').then(setBusinesses).catch(() => {}); }, []);
  useEffect(() => { api('/vendor/applications' + (bizId ? '?business_id=' + bizId : '')).then(setRows).catch(() => setRows([])); }, [bizId]);
  return (
    <>
      <div className="pagehead"><div><h1>Applications</h1><p>Every market you have applied to, across cities.</p></div><Link className="btn primary" href="/markets">Apply to a market</Link></div>
      <BusinessSwitcher businesses={businesses} value={bizId} onChange={setBizId} />
      {!rows ? <p className="muted">Loading...</p> : rows.length ? (
        <section className="card"><div className="table-wrap"><table>
          <thead><tr><th>Market</th><th>Date</th><th>Business</th><th>Booth</th><th>Status</th><th>Payment</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/vendor/applications/${a.id}`}>{a.market_name}</Link></td>
              <td>{fmtDate(a.market_date)}</td><td>{a.business}</td><td>{a.booth || '—'}</td>
              <td>{badge(a.status)}</td><td>{badge(a.payment_status)}</td>
            </tr>))}
          </tbody></table></div></section>
      ) : <div className="card empty-state">You have no applications yet.</div>}
    </>
  );
}
