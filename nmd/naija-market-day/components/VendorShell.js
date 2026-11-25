'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Vendor sidebar, with the labels from vendor-dashboard.html. Signed-out visitors go to the vendor sign-in.
export default function VendorShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadBell, setUnreadBell] = useState(0);

  useEffect(() => {
    api('/auth/me').then((r) => {
      const roles = r.user?.roles || [];
      if (!roles.includes('vendor')) {
        router.replace('/login?as=vendor&next=' + encodeURIComponent(path || '/vendor'));
        return;
      }
      setUser(r.user);
    }).catch(() => router.replace('/login?as=vendor'));
  }, [path, router]);

  // Unread chats and notifications update every 30 seconds.
  useEffect(() => {
    if (!user) return;
    const load = () => {
      api('/vendor/dashboard').then((d) => setUnreadChats(d.unread_messages)).catch(() => {});
      api('/vendor/notifications').then((n) => setUnreadBell(n.unread)).catch(() => {});
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(t);
  }, [user]);

  const groups = [
    [
      ['/vendor', 'Overview'],
      ['/vendor/products', 'Products'],
      ['/vendor/messages', 'Chats and orders', unreadChats],
      ['/vendor/events', 'Events'],
      ['/vendor/booth', 'Booth and payments'],
      ['/vendor/qr', 'QR check-in'],
    ],
    [
      ['/vendor/businesses', 'My businesses'],
      ['/vendor/marketplace', 'Marketplace'],
      ['/vendor/notifications', 'Notifications', unreadBell],
      ['/vendor/receipts', 'Receipts'],
      ['/vendor/applications', 'Applications'],
      ['/resources', 'Resources'],
    ],
  ];
  const isOn = (href) => (href === '/vendor' ? path === '/vendor' : path?.startsWith(href));

  if (user === undefined) return <div className="shell"><main className="main"><p className="muted">Loading your portal...</p></main></div>;

  return (
    <div className="shell">
      <nav className="side" aria-label="Vendor sections">
        <Link className="brand" href="/"><span className="logo-mark">N</span>NMD Vendor</Link>
        {groups.map((items, gi) => (
          <div key={gi}>
            {gi === 1 && <div className="sect">Account</div>}
            {items.map(([href, label, count]) => (
              <Link key={href} href={href} className={isOn(href) ? 'on' : ''}>
                <span>{label}</span>
                {count ? <span className="count">{count}</span> : null}
              </Link>
            ))}
          </div>
        ))}
        <div className="who">
          <div>{user.name || user.email}</div>
          <button className="btn ghost small-btn" type="button" onClick={async () => {
            await api('/auth/logout', { method: 'POST' }).catch(() => {});
            router.push('/login?as=vendor');
          }}>Sign out</button>
        </div>
      </nav>
      <main className="main" id="main">{children}</main>
    </div>
  );
}
