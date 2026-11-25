import SummitForm from '../../components/SummitForm';

export const metadata = { title: 'Summit · Naija Market Day' };

export default function Summit() {
  return (
    <section className="section-tight" style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 420px' }}>
        <h1 style={{ fontSize: 'clamp(40px,5vw,64px)' }}>The Summit</h1>
        <p className="lede" style={{ fontSize: 22, marginTop: 16 }}>Our annual gathering for makers, sellers and the people who support them.</p>
      </div>
      <div style={{ flex: '1 1 380px' }}><SummitForm /></div>
    </section>
  );
}
