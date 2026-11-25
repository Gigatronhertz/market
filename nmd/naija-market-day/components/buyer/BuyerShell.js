'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Buyer sidebar. Signed-out visitors go to sign-in and come back here afterwards.
export default function BuyerShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api('/auth/me').then((r) => {
      if (!(r.user?.roles || []).includes('buyer')) {
        router.replace('/login?next=' + encodeURIComponent(path || '/buyer'));
        return;
      }
      setUser(r.user);
    }).catch(() => router.replace('/login'));
  }, [path, router]);

  useEffect(() => {
    if (!user) return;
    const load = () => api('/buyer/notifications').then((n) => setUnread(n.unread)).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(t);
  }, [user]);

  const items = [
    ['/buyer', 'Marketplace'],
    ['/buyer/cart', 'Cart'],
    ['/buyer/messages', 'Messages'],
    ['/buyer/notifications', 'Notifications', unread],
    ['/buyer/account', 'Account'],
  ];
  const isOn = (href) => (href === '/buyer' ? path === '/buyer' : path?.startsWith(href));

  if (user === undefined) return <div className="shell"><main className="main"><p className="muted">Loading your account...</p></main></div>;

  return (
    <div className="shell">
      <nav className="side" aria-label="Buyer sections">
        <Link className="brand" href="/market-square"><span className="logo-mark">N</span>Marketplace</Link>
        {items.map(([href, label, count]) => (
          <Link key={href} href={href} className={isOn(href) ? 'on' : ''}>
            <span>{label}</span>
            {count ? <span className="count">{count}</span> : null}
          </Link>
        ))}
        <div className="who">
          <div>{user.name || user.email}</div>
          <button className="btn ghost small-btn" type="button" onClick={async () => {
            await api('/auth/logout', { method: 'POST' }).catch(() => {});
            router.push('/market-square');
            router.refresh();
          }}>Sign out</button>
        </div>
      </nav>
      <main className="main" id="main">{children}</main>
    </div>
  );
}
