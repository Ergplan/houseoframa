// The GitHub client (Stage 7): who a token belongs to, creating a product's repository under the account
// or organisation set in Settings, and pushing to it. The token travels only in request headers and in
// the environment of one `git push` (as an extra HTTP header); it is never written into a remote URL, a
// git config file or a log, and a remote is recorded without credentials.
import { spawnSync } from 'node:child_process';

export type Fetch = typeof fetch;

export interface GitHubDeps {
  fetch: Fetch;
  /** https://api.github.com, or a stub's address in tests. */
  api: string;
}

export const GITHUB_API = 'https://api.github.com';

export class GitHubError extends Error {
  override name = 'GitHubError';
}

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'house-of-rama',
  'content-type': 'application/json',
});

async function gh<T>(
  deps: GitHubDeps,
  token: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.api}${route}`, {
      method,
      headers: headers(token),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new GitHubError('Could not reach GitHub. Check the internet connection and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    errors?: { message?: string }[];
  };
  if (res.ok) return json;
  if (res.status === 401)
    throw new GitHubError('GitHub refused the token: enter a fresh one in Settings.');
  if (res.status === 403 || res.status === 404)
    throw new GitHubError(
      'The token may not create repositories there: give it permission to create repositories, or pick an account it belongs to.',
    );
  if (res.status === 422) {
    const why = [json.message, ...(json.errors ?? []).map((e) => e.message)]
      .filter(Boolean)
      .join('; ');
    throw new GitHubError(
      /already exists/i.test(why)
        ? 'A repository of that name already exists there. Give the product another name.'
        : `GitHub would not create the repository: ${why || 'it gave no reason'}.`,
    );
  }
  throw new GitHubError(`GitHub answered with an error (${res.status}). Try again in a minute.`);
}

/** The account the token signs in as. */
export async function viewer(token: string, deps: GitHubDeps): Promise<string> {
  return (await gh<{ login: string }>(deps, token, 'GET', '/user')).login;
}

export interface CreatedRepository {
  /** owner/name */
  fullName: string;
  /** https://github.com/owner/name, for people. */
  htmlUrl: string;
  /** https clone URL, without credentials. */
  cloneUrl: string;
}

/**
 * Creates a private repository named `name` under `owner`: the token's own account when the owner is
 * that account, otherwise the organisation of that name.
 */
export async function createRepository(
  token: string,
  owner: string,
  name: string,
  description: string,
  deps: GitHubDeps,
): Promise<CreatedRepository> {
  const me = await viewer(token, deps);
  const route =
    me.toLowerCase() === owner.toLowerCase()
      ? '/user/repos'
      : `/orgs/${encodeURIComponent(owner)}/repos`;
  const r = await gh<{ full_name: string; html_url: string; clone_url: string }>(
    deps,
    token,
    'POST',
    route,
    {
      name,
      description: description.slice(0, 350),
      private: true,
      auto_init: false,
    },
  );
  return { fullName: r.full_name, htmlUrl: r.html_url, cloneUrl: r.clone_url };
}

/**
 * Pushes the checkout's `main` to `remote`. For an https remote the token goes in an Authorization
 * header set through git's environment (GIT_CONFIG_*), so it is in neither the command line nor a file.
 */
export function pushTo(repoDir: string, remote: string, token: string | null): void {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (token && remote.startsWith('https://')) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    Object.assign(env, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    });
  }
  const r = spawnSync('git', ['-C', repoDir, 'push', '--quiet', remote, 'HEAD:refs/heads/main'], {
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (r.status !== 0) {
    // git's message names the remote, never the header; strip anything token-like all the same.
    const why = `${r.stderr ?? ''}`.replace(/(ghp|gho|github_pat)_[A-Za-z0-9_]+/g, '***').trim();
    throw new GitHubError(
      `The work could not be sent to GitHub: ${why.split('\n').at(-1) || 'git push failed'}.`,
    );
  }
}
