import Link from 'next/link';
export const metadata = { title: 'Events · Vendor portal' };
export default function Page() {
  return (
    <>
      <div className="pagehead"><div><h1>Events</h1><p>Markets you can apply to, and events you are taking part in.</p></div></div>
      <div className="card stack">
        <p className="muted">Browse the markets and apply to trade at any of them.</p>
        <div className="row"><Link className="btn primary" href="/markets">See markets</Link><Link className="btn ghost" href="/vendor/applications">My applications</Link></div>
      </div>
    </>
  );
}
