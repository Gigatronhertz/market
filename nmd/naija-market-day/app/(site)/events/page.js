import { serverGet } from '@/lib/server-api';
import EventsGrid from '@/components/EventsGrid';

export const metadata = { title: 'Events · Naija Market Day' };
export const dynamic = 'force-dynamic';

export default async function Events() {
  const markets = (await serverGet('/markets')) || [];
  const events = (await serverGet('/events')) || [];
  return <EventsGrid markets={markets} events={events} />;
}
