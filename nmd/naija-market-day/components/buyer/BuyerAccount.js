'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

// Account (BUY-01, BUY-02, BUY-12): name, email, newsletter choice and password.
export default function BuyerAccount() {
  const toast = useToast();
  const [a, setA] = useState(null);
  useEffect(() => { api('/buyer/account').then(setA).catch((e) => toast(e.message, true)); }, []);

  async function save(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const body = { name: f.elements.name.value, email: f.elements.email.value, newsletter_choice: f.elements.newsletter.checked };
    if (f.elements.password.value) {
      body.password = f.elements.password.value;
      body.current_password = f.elements.current.value;
    }
    try {
      setA(await api('/buyer/account', { method: 'PUT', body }));
      f.elements.password.value = ''; f.elements.current.value = '';
      toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  if (!a) return <p className="muted">Loading...</p>;
  return (
    <>
      <div className="pagehead"><div><h1>Account</h1><p>Your details, newsletter choice and password.</p></div></div>
      <form className="card stack" style={{ maxWidth: 560 }} onSubmit={save}>
        <div className="field"><label>Name</label><input name="name" defaultValue={a.name} /></div>
        <div className="field"><label>Email</label><input name="email" type="email" defaultValue={a.email} required /></div>
        <label className="inline"><input name="newsletter" type="checkbox" defaultChecked={a.newsletter_choice} /> Send me market news and offers</label>
        <div className="field"><label>Current password (only to change it)</label><input name="current" type="password" autoComplete="current-password" /></div>
        <div className="field"><label>New password (8+ characters, optional)</label><input name="password" type="password" autoComplete="new-password" /></div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save changes</button></div>
      </form>
    </>
  );
}
