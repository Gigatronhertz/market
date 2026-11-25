'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function BuyerThread({ id }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const load = () => api('/buyer/chats/' + id).then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(t); }, [id]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [d]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api('/buyer/chats/' + id + '/messages', { method: 'POST', body: { body: text } }); setText(''); load(); }
    catch (err) { toast(err.message, true); }
    setBusy(false);
  }

  if (!d) return <p className="muted">Loading...</p>;
  return (
    <>
      <p><Link href="/buyer/messages">← Messages</Link></p>
      <h1>{d.business_name}</h1>
      <div className="alert info">The vendor usually replies within {d.expected_reply_hours} hours. Payment is arranged directly with the vendor.</div>
      <div className="card" style={{ padding: 0 }}>
        <div ref={logRef} className="chat" role="log" aria-live="polite" style={{ padding: 18, maxHeight: 420, overflow: 'auto', background: '#FAFBFA' }}>
          {d.messages.map((m, i) => (
            <div key={i} className={'bubble ' + (m.sender_role === 'buyer' ? 'me' : '')} style={{ whiteSpace: 'pre-wrap' }}>
              <div className="meta">{m.sender_role === 'buyer' ? 'You' : d.business_name}</div>
              {m.body}
              {m.payment_link && <a href={m.payment_link} target="_blank" rel="noopener noreferrer" className="btn small-btn" style={{ marginTop: 8 }}>Open payment link</a>}
            </div>
          ))}
        </div>
      </div>
      <form className="card row" style={{ marginTop: 14, flexWrap: 'nowrap' }} onSubmit={send}>
        <input aria-label="Message" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy}>Send</button>
      </form>
      <p className="disclaimer">{d.disclaimer}</p>
    </>
  );
}
