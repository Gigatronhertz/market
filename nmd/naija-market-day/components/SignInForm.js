'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { useToast } from './Toast';

// Sign in or create an account. Buyers and vendors use the same page, as on the mockup.
export default function SignInForm({ initialRole = 'buyer', next = '' }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState('in');
  const [role, setRole] = useState(initialRole);
  const [busy, setBusy] = useState(false);
  const up = mode === 'up';
  const safeNext = /^\/[a-z0-9/_-]*(\?[^\s]*)?$/i.test(next) ? next : '';

  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true);
    try {
      if (up && role === 'vendor') {
        // Vendor accounts are created after the first paid booth (requirements VEN-01).
        router.push('/sell?email=' + encodeURIComponent(f.email.value));
        return;
      }
      if (up) {
        await api('/auth/buyer/signup', { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.password.value, marketing_consent: true } });
        router.push(safeNext || '/market-square');
        router.refresh();
        return;
      }
      const r = await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value, portal: role } });
      const roles = r.user?.roles || [];
      router.push(safeNext || (role === 'vendor' && roles.includes('vendor') ? '/vendor' : '/market-square'));
      router.refresh();
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }

  async function forgot() {
    const email = document.querySelector('input[name=email]')?.value;
    if (!email) { toast('Type your email first, then tap Forgot password.', true); return; }
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { email } });
      toast('If that email has an account, a reset link is on its way.');
    } catch (err) { toast(err.message, true); }
  }

  return (
    <div className="split" style={{ maxWidth: 980, margin: '40px auto' }}>
      <div className="box" style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
        <div className="seg" role="group" aria-label="Sign in or create account">
          <button type="button" aria-pressed={!up} onClick={() => setMode('in')}>Sign in</button>
          <button type="button" aria-pressed={up} onClick={() => setMode('up')}>Create account</button>
        </div>
        <h1 style={{ margin: '18px 0 6px', fontSize: 30 }}>{up ? (role === 'vendor' ? 'Start your application' : 'Create your account') : 'Welcome back'}</h1>
        <p className="muted" style={{ margin: '0 0 22px' }}>
          {up && role === 'vendor' ? 'Enter your email to start. Your vendor account is created after your first paid booth.'
            : up ? 'Free for buyers. An account lets you chat with sellers and send order requests.'
            : 'Sign in to continue.'}
        </p>
        <div className="roles" role="group" aria-label="I am a" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button type="button" className="chip" aria-pressed={role === 'buyer'} onClick={() => setRole('buyer')}>I want to buy</button>
          <button type="button" className="chip" aria-pressed={role === 'vendor'} onClick={() => setRole('vendor')}>I want to sell</button>
        </div>
        <form onSubmit={submit}>
          {up && role !== 'vendor' && <div className="field"><label>Full name</label><input name="name" placeholder="Your name" autoComplete="name" required /></div>}
          <div className="field"><label>Email</label><input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></div>
          {!(up && role === 'vendor') && <div className="field"><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" autoComplete={up ? 'new-password' : 'current-password'} required /></div>}
          {!up && <p className="small" style={{ margin: '4px 0 0' }}><button type="button" className="chip" onClick={forgot}>Forgot password?</button></p>}
          <button className="btn primary block" type="submit" disabled={busy} style={{ marginTop: 14 }}>
            {up ? (role === 'vendor' ? 'Start my application' : 'Create account') : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
