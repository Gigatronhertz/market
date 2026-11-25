import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import { fmtDate } from '@/lib/format';
import { badge } from '@/components/Badge';

export default async function Ticket({ params }) {
  const { token } = await params;
  const t = await serverGet('/tickets/' + encodeURIComponent(token));
  if (!t) notFound();
  return (
    <section className="section-tight auth-card" style={{ maxWidth: 460 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <img className="qr" src={t.qr_data_url} alt="Your entry QR code" />
        <h2 style={{ marginTop: 12 }}>{t.name}</h2>
        <p className="muted">{t.guests_count} {t.guests_count === 1 ? 'person' : 'people'}</p>
        <p><strong>{t.market.name}</strong></p>
        <p className="muted">{t.market.city} · {fmtDate(t.market.date)}{t.market.start_time ? ' · ' + t.market.start_time : ''}{t.market.venue ? ' · ' + t.market.venue : ''}</p>
        {t.checked_in ? badge('checked_in') : <p className="small muted">Show this code at the entrance.</p>}
      </div>
    </section>
  );
}
