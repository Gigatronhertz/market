import VendorShell from '@/components/VendorShell';

export const metadata = { title: 'Vendor portal · Naija Market Day' };
export const dynamic = 'force-dynamic';

export default function VendorLayout({ children }) {
  return <VendorShell>{children}</VendorShell>;
}
