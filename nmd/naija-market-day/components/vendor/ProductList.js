'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../Toast';

export default function ProductList() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const load = () => api('/vendor/listings').then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);
  async function remove(id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api('/vendor/listings/' + id, { method: 'DELETE' }); toast('Deleted'); load(); } catch (e) { toast(e.message, true); }
  }
  return (
    <>
      <div className="pagehead">
        <div><h1>Products</h1><p>Live products appear in the Market Square while your business has a Marketplace subscription.</p></div>
        <Link className="btn primary" href="/vendor/products/new">Add product</Link>
      </div>
      {!rows ? <p className="muted">Loading...</p> : rows.length ? (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Status</th><th>Views</th><th></th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td><td className="muted">{l.category || ''}</td>
                    <td>{l.sale_price_cents ? <><s className="muted">{money(l.price_cents)}</s> {money(l.sale_price_cents)}</> : money(l.price_cents)}</td>
                    <td><span className={'badge ' + (l.hidden ? '' : l.subscription_active ? 'ok' : 'bad')}>{l.hidden ? 'Draft' : l.subscription_active ? 'Live' : 'Offline'}</span></td>
                    <td>{l.views || 0}</td>
                    <td><button className="btn ghost small-btn" onClick={() => remove(l.id, l.name)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <div className="card empty-state">No products yet.</div>}
    </>
  );
}
