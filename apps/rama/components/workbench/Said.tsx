/** The sentence a form route sent back (`?said=` or `?error=`), shown as a green or grey flag. */
export function Said({ q }: { q: Record<string, string | string[] | undefined> }) {
  const said = typeof q.said === 'string' ? q.said : null;
  const error = typeof q.error === 'string' ? q.error : null;
  if (!said && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'} className={`flag ${error ? 'grey' : 'green'}`}>
      {error ?? said}
    </p>
  );
}
