'use client';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

// Summit registrations and exhibitor requests go to the NMD team through the contact inbox.
export default function SummitForm() {
  const toast = useToast();
  const [mode, setMode] = useState('att');
  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const vendor = mode === 'vendor';
    try {
      await api('/contact', { method: 'POST', body: {
        name: f.elements.name.value, email: f.email.value,
        topic: vendor ? 'Summit: exhibitor request' : 'Summit: attendee registration',
        message: JSON.stringify({ business: vendor ? f.business.value : '', tickets: vendor ? '' : f.tickets.value }),
      } });
      f.reset();
      toast(vendor ? 'Request received. The team will email you a payment link for your exhibitor package.' : 'Thanks. The team will confirm your place by email.');
    } catch (err) { toast(err.message, true); }
  }
  return (
    <form onSubmit={submit} className="card" style={{ padding: 28 }}>
      <div className="seg" role="group" aria-label="Registration type">
        <button type="button" aria-pressed={mode === 'att'} onClick={() => setMode('att')}>Attend (free)</button>
        <button type="button" aria-pressed={mode === 'vendor'} onClick={() => setMode('vendor')}>Exhibit as a vendor</button>
      </div>
      <div className="field" style={{ marginTop: 18 }}><label>Full name</label><input name="name" required placeholder="Your name" /></div>
      <div className="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com" /></div>
      {mode === 'vendor' ? (
        <div className="field"><label>Business name</label><input name="business" /></div>
      ) : (
        <div className="field"><label>Tickets</label><select name="tickets"><option>1 ticket</option><option>2 tickets</option><option>3 tickets</option><option>4 tickets</option></select></div>
      )}
      <button className="btn primary block" type="submit">{mode === 'vendor' ? 'Request an exhibitor package' : 'Register for free'}</button>
    </form>
  );
}
