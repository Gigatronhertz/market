'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';

const CHIPS = ['All', 'Clothing', 'Crafts', 'Food', 'Jewellery', 'Beauty'];
const CITIES = ['All cities', 'Brampton', 'Edmonton', 'Winnipeg'];

// Live listings with the mockup's filters. Each card opens a chat with the seller.
export default function MarketSquare({ initialQuery = '' }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [chip, setChip] = useState('All');
  const [city, setCity] = useState('All cities');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [fresh, setFresh] = useState(false);
  const [upcoming, setUpcoming] = useState(false);
  const [q] = useState(initialQuery);

  useEffect(() => {
    const parts = [];
    if (upcoming) parts.push('upcoming=1');
    if (q) parts.push('q=' + encodeURIComponent(q));
    api('/marketplace/listings' + (parts.length ? '?' + parts.join('&') : ''))
      .then(setRows).catch((e) => setError(e.message));
  }, [q, upcoming]);

  const kept = (rows || []).filter((item) => {
    const price = (item.sale_price_cents || item.price_cents) / 100;
    if (chip !== 'All' && !(item.category || '').toLowerCase().includes(chip.toLowerCase())) return false;
    if (city !== 'All cities' && (item.vendor_city || '').toLowerCase() !== city.toLowerCase()) return false;
    if (min !== '' && price < Number(min)) return false;
    if (max !== '' && price > Number(max)) return false;
    if (fresh && (!item.created_at || Date.now() - new Date(item.created_at).getTime() > 7 * 86400000)) return false;
    return true;
  });

  return (
    <section className="section-tight">
      <h1>Market Square</h1>
      <p className="muted">Browse vendors, then chat to order. Payment is arranged with the vendor.</p>
      <div className="row" role="group" aria-label="Quick filters" style={{ margin: '20px 0' }}>
        {CHIPS.map((c) => (
          <button key={c} className="chip" aria-pressed={chip === c} onClick={() => setChip(c)}>{c}</button>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '260px minmax(0,1fr)', alignItems: 'start' }}>
        <aside className="card" aria-label="Filters">
          <h3>Filters</h3>
          <div className="field"><label htmlFor="city">City</label><select id="city" value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <label className="inline" style={{ marginBottom: 8 }}><input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> New this week</label>
          <label className="inline" style={{ marginBottom: 16 }}><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Vendors at the next market</label>
          <div className="small muted" style={{ marginBottom: 6 }}>Price (CAD)</div>
          <div className="row">
            <input aria-label="Minimum price" type="number" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} />
            <input aria-label="Maximum price" type="number" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
        </aside>
        <div>
          {error && <div className="alert bad">{error}</div>}
          <p className="small muted" style={{ marginBottom: 14 }}>{rows ? `Showing ${kept.length} listing${kept.length === 1 ? '' : 's'}` : 'Loading listings...'}</p>
          <div className="grid grid-cards">
            {kept.map((l) => (
              <Link key={l.id} className="card lift" href={`/product/${l.id}`} style={{ color: 'inherit', padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 170, background: '#EEF1EF' }}>{l.photo && <img src={l.photo} alt={l.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{l.name}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>{l.vendor_name}{l.vendor_city ? ' · ' + l.vendor_city : ''}</div>
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                    <b>{l.sale_price_cents ? <><s className="muted">{money(l.price_cents)}</s> {money(l.sale_price_cents)}</> : money(l.price_cents)}</b>
                    <span className="chip" style={{ margin: 0 }}>Chat</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {rows && !kept.length && <p className="muted" style={{ marginTop: 20 }}>No products match these filters yet.</p>}
        </div>
      </div>
    </section>
  );
}
