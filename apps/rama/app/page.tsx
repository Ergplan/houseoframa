import { BuildStamp } from '../components/BuildStamp';

export default function Home() {
  return (
    <main style={{ padding: '4rem 1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>
        House of Rama · Built on trust
      </h1>
      <BuildStamp sha={process.env.GIT_SHA} />
    </main>
  );
}
