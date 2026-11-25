import Thread from '@/components/vendor/Thread';
export default async function Page({ params }) {
  const { id } = await params;
  return <Thread id={id} />;
}
