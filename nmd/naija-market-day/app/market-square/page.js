import MarketSquare from '../../components/MarketSquare';

export const metadata = { title: 'Market Square · Naija Market Day' };

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  return <MarketSquare initialQuery={typeof sp?.q === 'string' ? sp.q : ''} />;
}
