import SellWizard from '../../../../components/SellWizard';
import { serverGet } from '../../../../lib/server-api';

export const dynamic = 'force-dynamic';

// Applying to a market is the same four-step flow as Sell, with the market already chosen.
export default async function Apply({ params }) {
  const { id } = await params;
  const markets = (await serverGet('/markets')) || [];
  const open = markets.filter((m) => m.effective_status === 'published');
  return <SellWizard markets={open} presetMarket={id} presetEmail="" />;
}
