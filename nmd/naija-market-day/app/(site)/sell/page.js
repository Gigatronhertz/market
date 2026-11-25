import SellWizard from '@/components/SellWizard';
import { serverGet } from '@/lib/server-api';

export const metadata = { title: 'Sell on NMD · Naija Market Day' };

// Four steps: business, documents, booth and payment, review. Same as the mockup's onboarding page.
export default async function Sell({ searchParams }) {
  const sp = await searchParams;
  const markets = (await serverGet('/markets')) || [];
  const open = markets.filter((m) => m.effective_status === 'published');
  return (
    <SellWizard
      markets={open}
      presetMarket={typeof sp?.market === 'string' ? sp.market : ''}
      presetEmail={typeof sp?.email === 'string' ? sp.email : ''}
    />
  );
}
