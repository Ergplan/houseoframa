/** One console act as a button anywhere on a site's pages (it posts to the console's act route). */
export function ActForm({ siteId, act, label }: { siteId: string; act: string; label: string }) {
  return (
    <form action={`/api/site/${siteId}/act`} method="post" style={{ margin: '0.8rem 0' }}>
      <input type="hidden" name="act" value={act} />
      <button type="submit" className="primary">
        {label}
      </button>
    </form>
  );
}
