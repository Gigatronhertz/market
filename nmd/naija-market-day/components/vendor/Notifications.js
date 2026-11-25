'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';

export default function Notifications() {
  const [n, setN] = useState(null);
  useEffect(() => {
    api('/vendor/notifications').then(async (r) => {
      setN(r);
      await api('/vendor/notifications/read', { method: 'POST' }).catch(() => {});
    }).catch(() => setN({ items: [] }));
  }, []);
  if (!n) return <p className="muted">Loading...</p>;
  return (
    <>
      <div className="pagehead"><div><h1>Notifications</h1><p>Updates about your applications, booths and subscriptions. Each one is also sent by email.</p></div></div>
      {n.items.length ? (
        <div className="stack">
          {n.items.map((i) => (
            <div key={i.id} className="card" style={{ borderColor: i.read ? undefined : 'var(--green)' }}>
              <div className="spread"><strong>{i.title}</strong><span className="small muted">{timeAgo(i.created_at)}</span></div>
              {i.body && <div className="small muted">{i.body}</div>}
              {i.link?.startsWith('/vendor') && <Link href={i.link}>Open</Link>}
            </div>
          ))}
        </div>
      ) : <div className="card empty-state">No notifications yet.</div>}
    </>
  );
}
