import { serverGet } from '../../lib/server-api';
import { MarketCard } from '../../components/Works';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Upcoming markets · Naija Market Day' };

export default async function Markets() {
  const markets = (await serverGet('/markets')) || [];
  return (
    <section className="section-tight">
      <div className="section-head">
        <h1>Upcoming markets</h1>
        <p>Register as a guest, or apply to trade at a market.</p>
      </div>
      {markets.length ? <div className="works-app">{markets.map((m) => <MarketCard key={m.id} market={m} />)}</div> : <p className="muted">No markets are published yet.</p>}
    </section>
  );
}
