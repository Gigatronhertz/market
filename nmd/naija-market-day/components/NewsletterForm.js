'use client';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

export default function NewsletterForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true);
    try {
      await api('/newsletter', { method: 'POST', body: { email: f.email.value, consent: f.consent.checked } });
      f.reset();
      toast('You are subscribed. Thank you.');
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  }
  return (
    <form className="field-row" onSubmit={submit} style={{ alignItems: 'center' }}>
      <input type="email" name="email" placeholder="Your email" required aria-label="Email" />
      <label className="inline small" style={{ alignSelf: 'center' }}><input type="checkbox" name="consent" required /> Send me market news</label>
      <button className="btn btn-ink" type="submit" disabled={busy}>Subscribe</button>
    </form>
  );
}
