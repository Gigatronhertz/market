'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Public header, same markup and classes as the mockup (index.html).
export default function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => { setOpen(false); }, [path]);

  const links = [
    ['/markets', 'Markets'],
    ['/market-square', 'Market Square'],
    ['/news', 'News'],
    ['/summit', 'Summit'],
    ['/contact', 'Contact'],
  ];
  const isVendor = user && (user.roles || []).includes('vendor');
  const account = !user
    ? { href: '/login', label: 'Sign in' }
    : isVendor ? { href: '/vendor', label: 'My dashboard' } : { href: '/buyer', label: 'My account' };

  return (
    <header className={'site-header' + (open ? ' open' : '')}>
      <div className="wrap bar">
        <Link className="logo" href="/"><span className="logo-mark">N</span>Naija Market Day</Link>
        <nav className="nav" aria-label="Main">
          {links.map(([href, label]) => (
            <Link key={href} className={'link' + (path === href ? ' on' : '')} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>
          ))}
          <Link className="link" href={account.href}>{account.label}</Link>
          <Link className="cta" href={isVendor ? '/vendor' : '/sell'}>{isVendor ? 'Vendor dashboard' : 'Sell on NMD'}</Link>
        </nav>
        <button className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}><span /></button>
      </div>
    </header>
  );
}
