'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

// Guest registration: the QR ticket is emailed and shown on the next page.
export default function GuestForm({ marketId }) {
  const toast = useToast();
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true);
    try {
      const r = await api(`/markets/${marketId}/register`, {
        method: 'POST',
        body: { name: f.name.value, email: f.email.value, phone: f.phone.value, guests_count: Number(f.guests_count.value) },
      });
      setDone(r.guest);
      toast('You are registered. We emailed your QR code.');
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  }
  if (done) {
    return (
      <div>
        <div className="alert ok">You are registered. We emailed your QR code to <strong>{done.email}</strong>.</div>
        <Link className="btn primary" href={`/tickets/${done.qr_token}`}>Open my ticket</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <div className="field"><label>Full name *</label><input name="name" required autoComplete="name" /></div>
      <div className="field"><label>Email *</label><input name="email" type="email" required autoComplete="email" /></div>
      <div className="field"><label>Phone</label><input name="phone" type="tel" autoComplete="tel" /></div>
      <div className="field"><label>Number of people (including you) *</label><input name="guests_count" type="number" min="1" max="10" defaultValue="1" required /></div>
      <button className="btn primary" type="submit" disabled={busy}>Register</button>
    </form>
  );
}
