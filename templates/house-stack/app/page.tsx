import { Figure } from '../components/Figure';
import { buildingCount, planned } from '../features/welcome/plan';

export default function Welcome() {
  const buildings = planned();
  return (
    <main>
      <h1>{'{{name}}'}</h1>
      <p>{'{{idea}}'}</p>
      <p>
        Buildings planned:{' '}
        <Figure id="building-count" fn={buildingCount} args={[buildings]} show="count" />
      </p>
    </main>
  );
}
