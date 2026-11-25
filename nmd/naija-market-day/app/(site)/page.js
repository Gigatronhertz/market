import Link from 'next/link';
import { serverGet } from '@/lib/server-api';
import { MarketCard } from '@/components/Works';
import { fmtDate } from '@/lib/format';
import NewsletterForm from '@/components/NewsletterForm';
import { icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

const HERO = 'https://images.unsplash.com/photo-1777065851469-71aef898a26f?w=2000&q=80&auto=format&fit=crop';
const FEATURES = [
  ['utensils', 'Food', 'Nigerian home cooking and street snacks, from vendors in every city.'],
  ['shirt', 'Fashion', 'Adire, ankara and everyday wear made and sold by the designers.'],
  ['music', 'Music', 'Live sets and a family-friendly atmosphere you can hear from the street.'],
  ['store', 'Small business', 'Booths for local makers, with a directory you can keep after the day ends.'],
];

export default async function Home() {
  const markets = (await serverGet('/markets')) || [];
  const upcoming = markets.filter((m) => m.effective_status === 'published');
  const next = upcoming[0];
  const title = next ? next.name : 'Come experience the best of African market';

  return (
    <>
      <section className="hero-app" aria-label="Welcome">
        <img className="poster" src={HERO} alt="" />
        <div className="wrap hero-copy">
          <div className="eyebrow-light">{next ? `${next.city} · ${fmtDate(next.date)}` : 'Brampton · Edmonton · Winnipeg · Online'}</div>
          <h1 style={{ marginTop: 16 }}>
            {title.split(' ').map((w, i) => (
              <span key={i} className="word" style={{ animationDelay: `${0.15 + i * 0.09}s` }}>{w}</span>
            ))}
          </h1>
          <div className="hero-meta">
            <p>The travelling African market in North America. Food, fashion, music and small businesses, free to attend.</p>
            <div className="actions">
              <Link className="btn btn-ink" href={next ? `/markets/${next.id}` : '/markets'}>Register as guest</Link>
              <Link className="btn" href={next ? `/markets/${next.id}/apply` : '/markets'}>Apply as vendor</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="intro section" aria-label="Introduction">
        <p className="lede">Traditional clothing, handmade crafts and Nigerian food, brought to a new city every summer by the people who make them.</p>
        <aside className="next">
          Next market
          <b>{next ? `${next.city}, ${fmtDate(next.date)}` : 'Dates coming soon'}</b>
          {next ? `${next.name}. Free entry.` : 'Check back for the next date.'}
        </aside>
      </section>

      <section className="section features" aria-label="What you will find">
        <div className="feat-grid">
          {FEATURES.map(([ic, t, d]) => (
            <div key={t} className="feat">
              <span className="feat-ic">{icon(ic)}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-label="Upcoming markets">
        <div className="section-head">
          <h2>Upcoming markets</h2>
          <p>Register as a guest, or apply to trade at a market.</p>
        </div>
        {upcoming.length ? (
          <div className="works-app">
            {upcoming.slice(0, 3).map((m, i) => <MarketCard key={m.id} market={m} wide={i === 0 && upcoming.length > 1} />)}
          </div>
        ) : <p className="muted">No upcoming markets are published yet.</p>}
        <p style={{ marginTop: 28 }}><Link className="more" href="/markets">See all markets</Link></p>
      </section>

      <section className="newsletter" aria-label="Newsletter">
        <div className="inner">
          <h2>{icon('mail')} Get the market news</h2>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
