'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { badge } from '@/components/Badge';

export default function BuyerInbox() {
  const [chats, setChats] = useState(null);
  useEffect(() => { api('/buyer/chats').then(setChats).catch(() => setChats([])); }, []);
  return (
    <>
      <div className="pagehead"><div><h1>Messages</h1><p>Chats with vendors. Earlier chats stay here after you sign in again.</p></div></div>
      {!chats ? <p className="muted">Loading...</p> : chats.length ? (
        <section className="card"><div className="table-wrap"><table>
          <thead><tr><th>Vendor</th><th>Last message</th><th>Status</th><th>When</th></tr></thead>
          <tbody>{chats.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/buyer/messages/${c.id}`}>{c.business_name}</Link></td>
              <td>{c.last_message}</td><td>{badge(c.status)}</td><td>{fmtDateTime(c.last_at)}</td>
            </tr>))}
          </tbody></table></div></section>
      ) : <div className="card empty-state">No chats yet. Add items to your cart and proceed with a vendor.</div>}
    </>
  );
}
