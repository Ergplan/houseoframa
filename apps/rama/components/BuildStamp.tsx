/** Shortens a git SHA to 7 characters; null when the value is missing or not a SHA. */
export function shortSha(raw: string | undefined): string | null {
  const sha = raw?.trim().toLowerCase();
  return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : null;
}

/** The commit the running app was built from. Shows "unknown" rather than a made-up value. */
export function BuildStamp({ sha }: { sha: string | undefined }) {
  const short = shortSha(sha);
  return (
    <p style={{ fontFamily: 'ui-monospace, monospace', color: '#6b645a' }} data-testid="build-sha">
      {short ? `commit ${short}` : 'commit unknown'}
    </p>
  );
}
