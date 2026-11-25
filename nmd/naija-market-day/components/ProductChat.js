'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

// The chat card on a product page. Visitors see the sign-in gate; buyers chat with the seller.
export default function ProductChat({ listing }) {
  const toast = useToast();
  const [user, setUser] = useState(undefined);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    api('/auth/me').then(async (r) => {
      setUser(r.user);
      if (!r.user || !(r.user.roles || []).includes('buyer')) return;
      const chats = await api('/buyer/chats');
      const mine = chats.find((c) => c.business_id === listing.business_id);
      if (mine) {
        setChatId(mine.id);
        const d = await api('/buyer/chats/' + mine.id);
        setMessages(d.messages);
      }
    }).catch(() => setUser(null));
  }, [listing.business_id]);

  // New replies appear by themselves.
  useEffect(() => {
    if (!chatId) return;
    const t = setInterval(() => {
      api('/buyer/chats/' + chatId).then((d) => setMessages(d.messages)).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [chatId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  // The first message opens the conversation, after the disclaimer is accepted.
  async function ensureChat() {
    if (chatId) return chatId;
    const ok = window.confirm(`Before you chat with ${listing.vendor_name}:\n\nNaija Market Day is not liable for transactions between buyers and vendors. Payment is arranged with the vendor.\n\nContinue?`);
    if (!ok) throw new Error('Chat cancelled. Accept the disclaimer to start.');
    await api('/buyer/cart', { method: 'POST', body: { listing_id: listing.id, qty: 1 } });
    const r = await api('/buyer/cart/proceed', { method: 'POST', body: { business_id: listing.business_id, acknowledged: true } });
    setChatId(r.chat_id);
    return r.chat_id;
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const id = await ensureChat();
      await api(`/buyer/chats/${id}/messages`, { method: 'POST', body: { body } });
      setText('');
      const d = await api('/buyer/chats/' + id);
      setMessages(d.messages);
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  }

  async function orderRequest() {
    setBusy(true);
    try {
      const id = await ensureChat();
      const d = await api('/buyer/chats/' + id);
      setMessages(d.messages);
      toast('Order request sent. The seller will reply in your chat.');
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  }

  const signedInBuyer = user && (user.roles || []).includes('buyer');
  return (
    <aside className="chat card" aria-label={`Chat with ${listing.vendor_name}`} style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 90 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
        <strong>{listing.vendor_name}</strong>
        <div className="small muted">Replies within 24 hours</div>
      </div>
      {user === undefined ? <div style={{ padding: 28 }} className="muted">Loading...</div>
        : !signedInBuyer ? (
          <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Sign in to chat with this vendor</div>
            <p className="muted" style={{ margin: 0 }}>A free buyer account lets you message vendors and send order requests. Browsing stays open to everyone.</p>
            <Link className="btn primary block" href={`/login?next=${encodeURIComponent(`/product/${listing.id}`)}`}>Sign in or create account</Link>
          </div>
        ) : (
          <>
            <div ref={logRef} role="log" aria-live="polite" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', maxHeight: 340, background: '#F8FAF9' }}>
              {messages.length === 0 && <div className="bubble them">Say hello and ask about this item. The seller usually replies within 24 hours.</div>}
              {messages.map((m, i) => (
                <div key={i} className={'bubble ' + (m.sender_role === 'buyer' ? 'me' : 'them')} style={{ whiteSpace: 'pre-wrap' }}>
                  {m.body}
                  {m.payment_link && <a href={m.payment_link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 8, fontWeight: 600 }}>Open the seller payment link</a>}
                </div>
              ))}
            </div>
            <form onSubmit={send} style={{ borderTop: '1px solid var(--line)', padding: 14, display: 'flex', gap: 8 }}>
              <input aria-label="Message" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn primary" type="submit" disabled={busy}>Send</button>
            </form>
            <div style={{ padding: '0 14px 14px' }}>
              <button className="btn ghost block" type="button" onClick={orderRequest} disabled={busy}>Send an order request</button>
            </div>
          </>
        )}
    </aside>
  );
}
