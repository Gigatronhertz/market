import Link from 'next/link';
import { fmtDate } from '../lib/format';

// Image-led market card (the mockup's .work-app style).
export function MarketCard({ market, wide = false }) {
  return (
    <Link className={'work-app' + (wide ? ' wide' : '')} href={'/markets/' + market.id}>
      <div className="frame">
        {market.flyer_url ? <img src={market.flyer_url} alt={market.name} /> : <div style={{ height: '100%', background: 'linear-gradient(135deg,#0B2E22,#0F6B4A 60%,#8EE0B0)' }} />}
        <span className="tag"><span className={'badge ' + (market.effective_status === 'published' ? 'ok' : '')}>{market.effective_status === 'published' ? 'Upcoming' : market.effective_status}</span></span>
      </div>
      <div className="caption">
        <div>
          <b>{market.name}</b>
          <span>{market.city} · {fmtDate(market.date)}{market.start_time ? ' · ' + market.start_time : ''}</span>
        </div>
        <span className="by">{market.venue || ''}</span>
      </div>
    </Link>
  );
}
