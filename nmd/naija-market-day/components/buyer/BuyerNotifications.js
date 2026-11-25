'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export default function BuyerNotifications() {
  const [n, setN] = useState(null);
  useEffect(() => {
    api('/buyer/notifications').then(async (r) => {
      setN(r);
      await api('/buyer/notifications/read', { method: 'POST' }).catch(() => {});
    }).catch(() => setN({ items: [] }));
  }, []);
  if (!n) return <p className="muted">Loading...</p>;
  return (
    <>
      <div className="pagehead"><div><h1>Notifications</h1><p>Replies from vendors and updates about your account.</p></div></div>
      {n.items.length ? (
        <div className="stack">{n.items.map((i) => (
          <div key={i.id} className="card"><div className="spread"><strong>{i.title}</strong><span className="small muted">{timeAgo(i.created_at)}</span></div>{i.body && <div className="small muted">{i.body}</div>}</div>
        ))}</div>
      ) : <div className="card empty-state">No notifications yet.</div>}
    </>
  );
}
