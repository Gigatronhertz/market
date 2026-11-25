import Link from 'next/link';

// Footer, same markup and classes as the mockup (index.html).
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="logo" href="/" style={{ color: '#fff' }}>
              <span className="logo-mark" style={{ background: 'var(--mint)', color: 'var(--ink)' }}>N</span>Naija Market Day
            </Link>
            <p style={{ lineHeight: 1.6, margin: '16px 0 18px', maxWidth: 320 }}>The only travelling African market experience in North America. Free and open to the public.</p>
            <a href="https://www.instagram.com/naijamarketday" style={{ color: 'var(--mint)', fontWeight: 600 }}>@naijamarketday on Instagram</a>
          </div>
          <div><h4>Explore</h4><Link href="/markets">Upcoming markets</Link><Link href="/market-square">Market Square</Link><Link href="/news">News and gallery</Link><Link href="/summit">Summit</Link></div>
          <div><h4>Sellers</h4><Link href="/sell">Sell on NMD</Link><Link href="/login">Vendor sign in</Link><Link href="/vendor/booth">Book a booth</Link><Link href="/contact">Advertise</Link></div>
          <div><h4>Help</h4><Link href="/contact">Contact</Link><Link href="/contact">FAQ</Link><Link href="/">Terms</Link><Link href="/">Privacy</Link></div>
        </div>
        <div className="foot-note">
          <span>Naija Market Day does not take payment for goods. Buyers and sellers arrange payment directly.</span>
          <span><Link href="/login" style={{ display: 'inline', color: '#9DBBAA' }}>Sign in</Link> · <Link href="/buyer/messages" style={{ display: 'inline', color: '#9DBBAA' }}>Messages</Link></span>
        </div>
      </div>
    </footer>
  );
}
