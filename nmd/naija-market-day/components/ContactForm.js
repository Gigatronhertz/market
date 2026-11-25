'use client';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const TOPICS = ['General question', 'Vendor registration', 'Booth or payment', 'Advertising', 'Media and press'];

export default function ContactForm({ topic = '' }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const preset = TOPICS.find((t) => t.toLowerCase().startsWith(topic.toLowerCase()) && topic) || TOPICS[0];
  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      const r = await api('/contact', { method: 'POST', body: { name: f.elements.name.value, email: f.email.value, topic: f.topic.value, message: f.message.value } });
      setDone(true);
      toast(r.message || 'Thank you. We will reply soon.');
    } catch (err) { toast(err.message, true); }
  }
  return (
    <section className="section-tight" style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' }}>
      <form onSubmit={submit} className="card" style={{ flex: '2 1 420px', display: 'flex', flexDirection: 'column', gap: 14, padding: 28 }}>
        <h2>Send us a message</h2>
        {done ? <div className="alert ok">Thank you. We have your message and will reply soon.</div> : (
          <>
            <div className="field"><label>Name</label><input name="name" required placeholder="Your name" /></div>
            <div className="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com" /></div>
            <div className="field"><label>Topic</label><select name="topic" defaultValue={preset}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Message</label><textarea name="message" rows={5} required /></div>
            <button className="btn primary" type="submit">Send message</button>
          </>
        )}
      </form>
      <aside style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card"><div className="small muted">Instagram</div><strong>@naijamarketday</strong></div>
        <div className="card"><div className="small muted">Based in</div><strong>Canada, touring nationwide</strong></div>
      </aside>
    </section>
  );
}
