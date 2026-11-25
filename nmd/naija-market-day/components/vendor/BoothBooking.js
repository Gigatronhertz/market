'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money, fmtDate } from '../../lib/format';
import { useToast } from '../Toast';

// Booth map from the mockup, with real booths. Pick a free booth, accept the terms, and pay (CAD).
export default function BoothBooking() {
  const toast = useToast();
  const [markets, setMarkets] = useState([]);
  const [market, setMarket] = useState(null);
  const [app, setApp] = useState(null);
  const [booths, setBooths] = useState([]);
  const [sel, setSel] = useState(null);
  const [paid, setPaid] = useState(null);

  useEffect(() => {
    api('/markets').then((rows) => {
      const open = rows.filter((m) => m.effective_status === 'published');
      setMarkets(open);
      if (open[0]) choose(open[0]);
    }).catch((e) => toast(e.message, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(m) {
    setMarket(m); setSel(null); setPaid(null);
    try {
      const mine = await api('/vendor/applications');
      const open = mine.find((a) => a.market_id === m.id && ['draft', 'waitlisted', 'offered'].includes(a.status));
      const a = open ? await api('/apply/' + open.id) : (await api('/apply/start', { method: 'POST', body: { market_id: m.id } })).application;
      setApp(a);
      setBooths(await api('/apply/' + a.id + '/booths'));
    } catch (e) { toast(e.message, true); }
  }

  async function pay() {
    if (!sel || !app) return;
    if (!window.confirm(`Event terms\n\n${app.market?.terms || 'No terms have been posted for this market yet.'}\n\nBooth ${sel.number} (${sel.tier}) for ${money(sel.price_cents)}. Booth fees are non-refundable after payment unless we decline your application.\n\nAccept and pay?`)) return;
    try {
      await api('/apply/' + app.id + '/booth', { method: 'POST', body: { booth_id: sel.id } });
      await api('/apply/' + app.id + '/terms', { method: 'POST', body: { accepted: true } });
      const r = await api('/apply/' + app.id + '/pay', { method: 'POST', body: {} });
      if (r.redirect) { window.location.href = r.redirect; return; }
      setPaid(sel);
      toast('Booth fee paid.');
    } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="pagehead"><div><h1>Booth and payments</h1><p>Choose your position on the map, then pay.</p></div></div>
      <div className="row" style={{ marginBottom: 16 }} role="group" aria-label="Choose market">
        {markets.map((m) => <button key={m.id} className={'chip'} aria-pressed={market?.id === m.id} onClick={() => choose(m)}>{m.city} · {fmtDate(m.date)}</button>)}
      </div>
      {paid ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Booth {paid.number} is reserved</h2>
          <p className="muted">Your booth fee is paid. Your application is under review. We email you when it is approved.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)', alignItems: 'start' }}>
          <section className="card">
            <div className="booth-grid">
              {booths.map((b) => (
                <button key={b.id} type="button" className={'booth' + (sel?.id === b.id ? ' sel' : '') + (b.type === 'food' ? ' t-food' : '')}
                  disabled={b.status !== 'available'} onClick={() => setSel(b)} aria-label={`Booth ${b.number} ${b.tier}`}>
                  <div className="num">{b.number}</div>
                  <div className="tier">{b.tier} · {b.type === 'food' ? 'Food' : 'Standard'}</div>
                  <div className="small">{money(b.price_cents)}</div>
                  <div className="small muted">{b.status === 'available' ? 'Available' : 'Taken'}</div>
                </button>
              ))}
            </div>
            {!booths.length && <p className="muted">No booths are listed for this market yet.</p>}
          </section>
          <aside className="card stack">
            <h3>Your booth</h3>
            <div className="line"><span className="muted">Market</span><span>{market?.name || '—'}</span></div>
            <div className="line"><span className="muted">Position</span><b>{sel ? sel.number : 'None'}</b></div>
            <div className="line"><span className="muted">Zone</span><b>{sel ? sel.tier : '—'}</b></div>
            <div className="line"><span className="muted">Total</span><b>{sel ? money(sel.price_cents) : '—'}</b></div>
            <button className="btn primary block" disabled={!sel} onClick={pay}>Pay booth fee</button>
          </aside>
        </div>
      )}
    </>
  );
}
