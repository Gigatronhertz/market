'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function Thread({ id }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const load = () => api('/vendor/chats/' + id).then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(t); }, [id]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [d]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api('/vendor/chats/' + id + '/messages', { method: 'POST', body: { body: text, payment_link: link || null } });
      setText(''); setLink(''); load();
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  }

  if (!d) return <p className="muted">Loading...</p>;
  return (
    <>
      <p><Link href="/vendor/messages">← Chats and orders</Link></p>
      <h1>Chat with {d.buyer_name || 'buyer'}</h1>
      {!d.subscription_active && <div className="alert warn">This business has no active Marketplace subscription, so you cannot reply. Earlier messages stay here.</div>}
      <div className="card" style={{ padding: 0 }}>
        <div ref={logRef} className="chat" role="log" aria-live="polite" style={{ padding: 18, maxHeight: 420, overflow: 'auto', background: '#FAFBFA' }}>
          {d.messages.map((m, i) => (
            <div key={i} className={'bubble ' + (m.sender_role === 'vendor' ? 'me' : '')} style={{ whiteSpace: 'pre-wrap' }}>
              <div className="meta">{m.sender_role === 'vendor' ? 'You' : 'Buyer'}</div>
              {m.body}
              {m.payment_link && <a href={m.payment_link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 8, fontWeight: 600 }}>Payment link</a>}
            </div>
          ))}
        </div>
      </div>
      {d.subscription_active && (
        <form className="card stack" style={{ marginTop: 14 }} onSubmit={send}>
          <div className="field"><label>Reply</label><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Confirm availability and reply…" /></div>
          <div className="field"><label>Payment link (optional, https://)</label><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /><div className="help">Payment happens outside the platform, through the link you send.</div></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit" disabled={busy}>Send</button></div>
        </form>
      )}
      <p className="disclaimer">{d.disclaimer}</p>
    </>
  );
}
