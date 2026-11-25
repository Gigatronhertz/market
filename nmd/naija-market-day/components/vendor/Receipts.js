'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate, money } from '../../lib/format';
import { badge } from '../Badge';

export default function Receipts() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/vendor/receipts').then(setRows).catch(() => setRows([])); }, []);
  return (
    <>
      <div className="pagehead"><div><h1>Receipts</h1><p>Booth fees and refunds.</p></div></div>
      {!rows ? <p className="muted">Loading...</p> : rows.length ? (
        <section className="card"><div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Market</th><th>Booth</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{r.market_name}</td><td>{r.booth || ''}</td>
              <td>{r.kind === 'refund' ? 'Refund' : 'Booth fee'}</td><td>{money(r.amount_cents)}</td>
              <td>{badge(r.kind === 'refund' ? 'refunded' : 'paid', r.kind === 'refund' ? 'Refunded' : 'Paid')}</td></tr>))}
          </tbody></table></div></section>
      ) : <div className="card empty-state">No payments yet.</div>}
    </>
  );
}
