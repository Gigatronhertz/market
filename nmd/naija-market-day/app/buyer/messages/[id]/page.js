import BuyerThread from '@/components/buyer/BuyerThread';
export default async function Page({ params }) {
  const { id } = await params;
  return <BuyerThread id={id} />;
}
