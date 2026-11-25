import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

// Public pages: the mockup header and footer. The portals have their own layout.
export default function SiteLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main className="wrap page">{children}</main>
      <SiteFooter />
    </>
  );
}
