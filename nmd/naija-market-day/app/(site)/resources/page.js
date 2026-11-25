import { serverGet } from '@/lib/server-api';

export const metadata = { title: 'Vendor resources · Naija Market Day' };
export const dynamic = 'force-dynamic';

const TITLES = { faq: 'FAQ', insurance: 'Insurance guidance', training: 'Training videos', health: 'Health forms by city' };

export default async function Resources() {
  const groups = (await serverGet('/resources')) || {};
  return (
    <section className="section-tight">
      <h1>Vendor resources</h1>
      {Object.keys(groups).length ? Object.entries(groups).map(([section, items]) => (
        <section key={section} style={{ marginTop: 28 }}>
          <h2>{TITLES[section] || section}</h2>
          <div className="stack">
            {items.map((r) => (
              <div key={r.id} className="card">
                <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}</h3>
                {r.city && <div className="small muted">{r.city}</div>}
                {r.body && <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{r.body}</p>}
              </div>
            ))}
          </div>
        </section>
      )) : <p className="muted">Resources are coming soon.</p>}
    </section>
  );
}
