import { notFound } from 'next/navigation';
import Link from 'next/link';
import { serverGet } from '../../../lib/server-api';

export default async function Post({ params }) {
  const { slug } = await params;
  const p = await serverGet('/blog/' + encodeURIComponent(slug));
  if (!p) notFound();
  return (
    <article style={{ maxWidth: 760, margin: '48px auto' }}>
      <p><Link href="/news">← News</Link></p>
      <h1>{p.title}</h1>
      <div className="small muted" style={{ margin: '8px 0 20px' }}>{new Date(p.publish_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      {p.image_url && <img src={p.image_url} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 20 }} />}
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 17 }}>{p.body}</div>
    </article>
  );
}
