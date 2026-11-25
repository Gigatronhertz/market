import SignInForm from '../../components/SignInForm';

export const metadata = { title: 'Sign in · Naija Market Day' };

export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return <SignInForm initialRole={sp?.as === 'vendor' ? 'vendor' : 'buyer'} next={typeof sp?.next === 'string' ? sp.next : ''} />;
}
