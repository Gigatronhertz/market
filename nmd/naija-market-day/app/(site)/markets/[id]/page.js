import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import { money, fmtDate } from '@/lib/format';
import GuestForm from '@/components/GuestForm';

export default async function MarketPage({ params }) {
  const { id } = await params;
  const m = await serverGet('/markets/' + id);
  if (!m) notFound();
  return (
    <section className="section-tight">
      <p><Link href="/markets">← All markets</Link></p>
      <h1>{m.name}</h1>
      <p className="muted">{m.city} · {fmtDate(m.date)}{m.start_time ? ' · ' + m.start_time : ''}{m.end_time ? '–' + m.end_time : ''}{m.venue ? ' · ' + m.venue : ''}</p>
      <div className="row" style={{ margin: '8px 0 18px' }}>
        <span className="badge ok">{m.effective_status === 'published' ? 'Published' : m.effective_status}</span>
        {m.applications_open && <span className="badge ok">Vendor applications open</span>}
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {m.flyer_url && <img className="thumb" src={m.flyer_url} alt="Market flyer" />}
          {m.description && <p>{m.description}</p>}
          <h2>Booths</h2>
          {m.booth_tiers?.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Booth tier</th><th>Type</th><th>Price</th><th>Available</th></tr></thead>
                <tbody>
                  {m.booth_tiers.map((t) => (
                    <tr key={t.tier}><td>{t.tier}</td><td>{t.type}</td><td>{money(t.price_cents)}</td><td>{t.available} of {t.total}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">Booths will be listed when applications open.</p>}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Register as a guest</h2>
            {m.effective_status === 'published' ? <GuestForm marketId={m.id} /> : <div className="alert warn">Guest registration for this market is closed.</div>}
          </div>
          <div className="card tint">
            <h3>Vendor?</h3>
            <p className="small muted">Apply to trade at this market.</p>
            <Link className="btn ghost" href={`/markets/${m.id}/apply`}>Apply as vendor</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
