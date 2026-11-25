'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useToast } from '@/components/Toast';

// Browse the marketplace from your account and add items to the cart (BUY-03).
export default function BuyerMarketplace() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      api('/marketplace/listings' + (q ? '?q=' + encodeURIComponent(q) : '')).then(setRows).catch((e) => toast(e.message, true));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function add(l) {
    try { await api('/buyer/cart', { method: 'POST', body: { listing_id: l.id, qty: 1 } }); toast('Added to your cart'); }
    catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="pagehead"><div><h1>Marketplace</h1><p>Add items from several vendors. You check out with one vendor at a time, then chat with them.</p></div></div>
      <input type="search" placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
      {!rows ? <p className="muted" style={{ marginTop: 16 }}>Loading...</p> : rows.length ? (
        <div className="grid grid-cards" style={{ marginTop: 18 }}>
          {rows.map((l) => (
            <div key={l.id} className="card stack" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 160, background: '#EEF1EF' }}>{l.photo && <img src={l.photo} alt={l.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
              <div style={{ padding: 14 }}>
                <Link href={`/product/${l.id}`}><strong>{l.name}</strong></Link>
                <div>{l.sale_price_cents ? <><s className="muted">{money(l.price_cents)}</s> {money(l.sale_price_cents)}</> : money(l.price_cents)}</div>
                <div className="small muted">{l.vendor_name}</div>
                <button className="btn primary small-btn" style={{ marginTop: 10 }} onClick={() => add(l)}>Add to cart</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card empty-state" style={{ marginTop: 18 }}>No listings match yet.</div>}
    </>
  );
}
