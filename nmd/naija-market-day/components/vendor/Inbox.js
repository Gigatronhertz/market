'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useBusiness, BusinessSwitcher } from '../useBusiness';

export default function Inbox() {
  const [bizId, setBizId] = useBusiness();
  const [businesses, setBusinesses] = useState([]);
  const [chats, setChats] = useState(null);
  useEffect(() => { api('/vendor/businesses').then(setBusinesses).catch(() => {}); }, []);
  useEffect(() => { api('/vendor/chats' + (bizId ? '?business_id=' + bizId : '')).then(setChats).catch(() => setChats([])); }, [bizId]);
  const subscribed = businesses.some((b) => b.subscription?.active);
  return (
    <>
      <div className="pagehead"><div><h1>Chats and orders</h1><p>Buyer chats for businesses with a Marketplace subscription.</p></div></div>
      <BusinessSwitcher businesses={businesses} value={bizId} onChange={setBizId} />
      {!subscribed && <div className="alert warn">Messages need a Marketplace subscription. <Link href="/vendor/marketplace">Subscribe a business</Link> to receive chats.</div>}
      {!chats ? <p className="muted">Loading...</p> : chats.length ? (
        <section className="card"><div className="table-wrap"><table>
          <thead><tr><th>Buyer</th><th>Business</th><th>Last message</th><th>When</th><th>Unread</th></tr></thead>
          <tbody>{chats.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/vendor/messages/${c.id}`}>{c.buyer_name || 'Buyer'}</Link></td>
              <td>{c.business_name}</td><td>{c.last_message}</td><td>{fmtDateTime(c.last_at)}</td>
              <td>{c.unread ? <span className="count">{c.unread}</span> : ''}</td>
            </tr>))}
          </tbody></table></div></section>
      ) : <div className="card empty-state">No buyer chats yet.</div>}
    </>
  );
}
