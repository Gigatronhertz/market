import ApplicationDetail from '@/components/vendor/ApplicationDetail';
export default async function Page({ params }) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
