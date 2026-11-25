import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '../../../lib/server-api';
import { money } from '../../../lib/format';
import ProductChat from '../../../components/ProductChat';

export default async function Product({ params }) {
  const { id } = await params;
  const l = await serverGet('/marketplace/listings/' + encodeURIComponent(id));
  if (!l) notFound();
  return (
    <section className="section-tight">
      <div className="small muted">
        <Link href="/market-square">Market Square</Link> / {l.category || 'Products'} / {l.name}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', alignItems: 'start', marginTop: 20 }}>
        <div>
          {l.photos?.[0] && <img src={l.photos[0]} alt={l.name} style={{ width: '100%', height: 400, objectFit: 'cover', borderRadius: 12 }} />}
          <div className="row" style={{ marginTop: 12 }}>
            {(l.photos || []).slice(1, 4).map((p, i) => <img key={i} src={p} alt="" style={{ width: 110, height: 90, objectFit: 'cover', borderRadius: 10 }} />)}
          </div>
          <h1 style={{ margin: '24px 0 6px' }}>{l.name}</h1>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {l.sale_price_cents ? <><s className="muted">{money(l.price_cents)}</s> {money(l.sale_price_cents)}</> : money(l.price_cents)}
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.6, marginTop: 16 }}>{l.description || 'The seller has not added a description yet.'}</p>
          <div className="card" style={{ marginTop: 24 }}>
            <strong>{l.vendor_name}</strong>
            <div className="small muted">{l.vendor_city ? l.vendor_city + ' · ' : ''}Approved vendor</div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Payment is arranged with the vendor. Naija Market Day does not take payment or hold funds.</p>
        </div>
        <ProductChat listing={l} />
      </div>
    </section>
  );
}
