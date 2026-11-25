'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';

// QR check-in (VEN-26): every approved booking with its code, ready to show at the entrance.
export default function QrCodes() {
  const [cards, setCards] = useState(null);
  useEffect(() => {
    api('/vendor/applications').then(async (rows) => {
      const approved = rows.filter((a) => a.status === 'approved');
      const out = await Promise.all(approved.map(async (a) => {
        const q = await api('/vendor/applications/' + a.id + '/qr').catch(() => null);
        return { ...a, qr: q?.qr_data_url };
      }));
      setCards(out);
    }).catch(() => setCards([]));
  }, []);
  return (
    <>
      <div className="pagehead"><div><h1>QR check-in</h1><p>Show this code at the entrance. Staff scan it on arrival and check you out when you leave.</p></div></div>
      {!cards ? <p className="muted">Loading...</p> : cards.length ? (
        <div className="grid grid-cards">
          {cards.map((a) => (
            <div key={a.id} className="card stack" style={{ textAlign: 'center' }}>
              <div className="spread"><strong>{a.market_name}</strong><span className="badge">{a.attendance}</span></div>
              {a.qr ? <img className="qr" src={a.qr} alt={'QR for ' + a.market_name} /> : <div className="muted">QR not ready yet</div>}
              <div className="small muted">{a.business}{a.booth ? ' · booth ' + a.booth : ''} · {fmtDate(a.market_date)}</div>
            </div>
          ))}
        </div>
      ) : <div className="card empty-state">No approved bookings yet. Your QR code appears here once an application is approved.</div>}
    </>
  );
}
