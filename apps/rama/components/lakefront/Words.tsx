'use client';
// "Say where to go": open a building or a table by its name, go inside, ask for the code, go back. The same words
// the voice will take in Stage 10, read by packages/stage `understand`; a phrase it does not know gets a
// sentence back, never a guess.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { understand, type Place } from '@rama/stage';
import { placeHref } from './places';

export function Words({
  siteId,
  here,
  buildings,
  tables = [],
}: {
  siteId: string;
  here: Place;
  buildings: { id: string; name: string }[];
  /** The ground's tables and the buildings that use each (Stage 11): "open orders", "show me the table". */
  tables?: { name: string; by: string[] }[];
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  return (
    <form
      className="rama-row lake-words"
      onSubmit={(e) => {
        e.preventDefault();
        const r = understand(text, here, buildings, tables);
        if ('to' in r) {
          setSaid(null);
          router.push(placeHref(siteId, r.to));
        } else setSaid(r.say);
      }}
    >
      <input
        className="eg-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Say where to go"
        placeholder="Say where to go: open a building or a table, inside, show me the code, go back"
      />
      <button type="submit" className="eg-btn">
        Go
      </button>
      {said ? (
        <p role="status" className="eg-muted lake-said">
          {said}
        </p>
      ) : null}
    </form>
  );
}
