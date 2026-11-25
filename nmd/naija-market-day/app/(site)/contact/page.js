import ContactForm from '@/components/ContactForm';

export const metadata = { title: 'Contact · Naija Market Day' };

export default async function Contact({ searchParams }) {
  const sp = await searchParams;
  return <ContactForm topic={typeof sp?.topic === 'string' ? sp.topic : ''} />;
}
