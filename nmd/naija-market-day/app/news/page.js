import Link from 'next/link';
import { serverGet } from '../../lib/server-api';
import NewsletterForm from '../../components/NewsletterForm';

export const metadata = { title: 'News · Naija Market Day' };
export const dynamic = 'force-dynamic';

const STORY = 'https://images.unsplash.com/photo-1777065851469-71aef898a26f?w=1200&q=80&auto=format&fit=crop';

export default async function News() {
  const posts = (await serverGet('/blog')) || [];
  return (
    <section className="section-tight">
      <article className="card lift" style={{ display: 'flex', flexWrap: 'wrap', padding: 0, overflow: 'hidden' }}>
        <img src={STORY} alt="Busy outdoor market" style={{ flex: '1 1 420px', minHeight: 320, maxHeight: 380, objectFit: 'cover' }} />
        <div style={{ flex: '1 1 380px', padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 38, lineHeight: 1.05 }}>Ten cities. One market. The 2026 Summer Tour.</h2>
          <p className="muted" style={{ lineHeight: 1.6, margin: '14px 0 20px' }}>Naija Market Day is taking off from Brampton to visit ten cities across Canada. Here is how to be part of it, as a visitor or a vendor.</p>
          <div><Link className="btn primary" href="/events">Read the story</Link></div>
        </div>
      </article>

      <h2 style={{ fontSize: 38, margin: '56px 0 24px' }}>Latest news</h2>
      {posts.length ? (
        <div className="grid grid-cards">
          {posts.map((p) => (
            <article key={p.slug} className="card lift" style={{ padding: 0, overflow: 'hidden' }}>
              {p.image_url && <img src={p.image_url} alt="" style={{ height: 170, width: '100%', objectFit: 'cover' }} />}
              <div style={{ padding: 18 }}>
                <Link href={`/news/${p.slug}`}><h3 style={{ fontSize: 22, margin: '6px 0' }}>{p.title}</h3></Link>
                <p className="small muted" style={{ lineHeight: 1.5 }}>{p.excerpt}</p>
                <div className="small" style={{ color: '#8A948F' }}>{new Date(p.publish_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="muted">No news posts yet.</p>}

      <section className="newsletter" style={{ marginTop: 80 }}>
        <div className="inner">
          <h2>Get the market news</h2>
          <NewsletterForm />
        </div>
      </section>
    </section>
  );
}
