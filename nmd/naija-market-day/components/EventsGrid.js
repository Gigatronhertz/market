'use client';
import Link from 'next/link';
import { useState } from 'react';
import { fmtDate } from '../lib/format';

const CITIES = ['All', 'Brampton', 'Edmonton', 'Winnipeg', 'Ottawa', 'Moncton'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// The 2026 Summer Tour: markets by city, with community events below.
export default function EventsGrid({ markets, events }) {
  const [city, setCity] = useState('All');
  const shown = markets.filter((m) => city === 'All' || m.city === city);
  return (
    <section className="section-tight">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, margin: '24px 0' }}>
        <h1>The 2026 Summer Tour</h1>
        <Link href="/summit" style={{ fontWeight: 600, color: 'var(--accent)' }}>Annual summit →</Link>
      </div>
      <div className="row" role="group" aria-label="Filter by city" style={{ marginBottom: 24 }}>
        {CITIES.map((c) => <button key={c} className="chip" aria-pressed={city === c} onClick={() => setCity(c)}>{c === 'All' ? 'All cities' : c}</button>)}
      </div>
      <div className="grid grid-cards">
        {shown.map((m) => {
          const d = new Date(m.date + 'T12:00:00');
          return (
            <article key={m.id} className="card lift" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: 170, background: 'linear-gradient(135deg,#0B2E22,#0F6B4A 60%,#8EE0B0)' }}>
                {m.flyer_url && <img src={m.flyer_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div style={{ position: 'absolute', left: 14, bottom: 14, background: '#fff', borderRadius: 10, padding: '6px 10px', textAlign: 'center', color: 'var(--ink)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{MONTHS[d.getMonth()]}</div>
                  <div style={{ fontSize: 26, lineHeight: 1, fontWeight: 800 }}>{d.getDate()}</div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <div className="small muted">{m.city} · {m.effective_status === 'past' ? 'Past market' : 'Free entry'}</div>
                <h3 style={{ fontSize: 24, margin: '4px 0 6px' }}>{m.name}</h3>
                <p className="small muted" style={{ lineHeight: 1.5 }}>{m.description || 'Market day with food, fashion, music and small businesses.'}</p>
                <div className="row" style={{ marginTop: 14 }}>
                  <Link className="btn" href={`/markets/${m.id}`}>Register as guest</Link>
                  <Link className="btn primary" href={`/markets/${m.id}/apply`}>Vendors: book a booth</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && <p className="muted" style={{ marginTop: 20 }}>No markets in this city yet.</p>}

      <h2 style={{ marginTop: 56 }}>Community events</h2>
      {events.length ? (
        <div className="grid grid-cards" style={{ marginTop: 16 }}>
          {events.map((e) => (
            <div key={e.id} className="card">
              <div className="small muted">{fmtDate(e.event_date)}{e.place ? ' · ' + e.place : ''}</div>
              <h3 style={{ margin: '6px 0' }}>{e.link ? <a href={e.link} rel="noopener noreferrer" target="_blank">{e.title}</a> : e.title}</h3>
              <p className="small muted">{e.description}</p>
            </div>
          ))}
        </div>
      ) : <p className="muted" style={{ marginTop: 12 }}>No community events yet.</p>}
    </section>
  );
}
