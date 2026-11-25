import BuyerShell from '@/components/buyer/BuyerShell';

export const metadata = { title: 'My account · Naija Market Day' };
export const dynamic = 'force-dynamic';

export default function BuyerLayout({ children }) {
  return <BuyerShell>{children}</BuyerShell>;
}
