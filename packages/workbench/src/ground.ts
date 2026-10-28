// The ground, opened (Stage 11): a plot is a real Postgres table, and it opens to its columns and its
// rows. The columns are the Blueprint's (read from the Drizzle definition, no model); the rows are the
// product's own, read-only, and never invented:
//  - a product built here has a sandbox database of its own, made by the build loop each time its
//    screens are photographed: a database and a login named for it on House of Rama's Postgres server,
//    with the tables its own Drizzle describes. The running product is handed that address and no other.
//  - an outside site has rows only when a read-only database address for it is entered in Settings.
// Every read is a read-only transaction on a connection that is itself read-only; a column the
// definition marks secret, or whose name says it holds a key, is masked before it leaves this module.
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import type { Blueprint, Table, TableField } from '@rama/shared';
import { Glossary } from '@rama/blueprint';
import type { SiteLocation } from '@rama/blueprint/site';
import { appKey, readSiteDatabase, secretKeyFile, SECRET_NAMES, type Db } from '@rama/db';
import type { Street } from '@rama/stage';
import { appearanceKeys, runInSandbox, type Capture, type SandboxTable } from '@rama/trace';

/** At most this many rows at a time. */
export const ROWS_PAGE = 50;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The database (and the login) of a product's sandbox: named for House of Rama's own database and the site. */
export function sandboxName(siteId: string, env: NodeJS.ProcessEnv = process.env): string {
  const main = decodeURIComponent(new URL(env.DATABASE_URL!).pathname.slice(1)) || 'rama';
  const slug = siteId.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const name = `${main}_sbx_${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (name.length <= 63) return name;
  const h = createHash('sha256').update(name).digest('hex').slice(0, 8);
  return `${name.slice(0, 54)}_${h}`;
}

/** The sandbox login's password: derived from the app's own key, so it is never stored or printed. */
function sandboxPassword(name: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', appKey(secretKeyFile(env)))
    .update(`sandbox:${name}`)
    .digest('base64url');
}

/** The address the product is handed: its own login, its own database, on the same server. */
export function sandboxUrl(siteId: string, env: NodeJS.ProcessEnv = process.env): string {
  const name = sandboxName(siteId, env);
  const u = new URL(env.DATABASE_URL!);
  u.username = name;
  u.password = sandboxPassword(name, env);
  u.pathname = `/${name}`;
  return u.toString();
}

/** CREATE TABLE and ADD COLUMN statements for the tables as the product's Drizzle describes them. */
export function sandboxDdl(tables: SandboxTable[]): string[] {
  return tables.flatMap((t) => {
    const many = t.primaryKey.length > 1;
    const col = (c: SandboxTable['columns'][number]) =>
      [
        quote(c.name),
        c.type,
        c.primary && !many ? 'PRIMARY KEY' : '',
        c.notNull && !c.primary ? 'NOT NULL' : '',
        c.unique && !c.primary ? 'UNIQUE' : '',
        c.default !== null ? `DEFAULT ${c.default}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    const key = many ? [`PRIMARY KEY (${t.primaryKey.map(quote).join(', ')})`] : [];
    return [
      `CREATE TABLE IF NOT EXISTS ${quote(t.name)} (${[...t.columns.map(col), ...key].join(', ')})`,
      // A column added to the code since: added to the table, its rows kept. Nothing is ever dropped.
      ...t.columns
        .filter((c) => !c.primary)
        .map((c) => `ALTER TABLE ${quote(t.name)} ADD COLUMN IF NOT EXISTS ${col(c)}`),
    ];
  });
}

/**
 * Makes (or brings up to date) a product's sandbox database: its login and database on House of Rama's
 * server, then its tables as its own Drizzle describes them, applied as that login. Returns its address,
 * or why it could not be made (the photographs go on without one).
 */
export async function ensureSandbox(
  site: Pick<SiteLocation, 'id' | 'repoDir'>,
  bp: Pick<Blueprint, 'tables'>,
  env: NodeJS.ProcessEnv = process.env,
  log: (s: string) => void = () => {},
): Promise<{ url: string; sentence: string } | { url: null; sentence: string }> {
  const name = sandboxName(site.id, env);
  const files = [...new Set((bp.tables ?? []).map((t) => t.file))];
  const tables: SandboxTable[] = [];
  for (const file of files) {
    const ans = await runInSandbox(site.repoDir, { kind: 'tables', file });
    if (!ans.ok) {
      log(`${file}: its tables could not be read (${ans.error.split('\n')[0]})`);
      continue;
    }
    tables.push(...(ans.value as SandboxTable[]));
  }
  const admin = postgres(env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const password = sandboxPassword(name, env);
    const [role] = await admin`select 1 from pg_roles where rolname = ${name}`;
    await admin.unsafe(
      `${role ? 'ALTER' : 'CREATE'} ROLE ${quote(name)} LOGIN PASSWORD '${password}'`,
    );
    const [made] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!made) {
      await admin.unsafe(`CREATE DATABASE ${quote(name)} OWNER ${quote(name)}`);
      await admin.unsafe(`REVOKE ALL ON DATABASE ${quote(name)} FROM PUBLIC`);
    }
  } catch (err) {
    return {
      url: null,
      sentence: `The product’s own database could not be made: ${(err as Error).message}.`,
    };
  } finally {
    await admin.end();
  }
  const url = sandboxUrl(site.id, env);
  const own = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const statement of sandboxDdl(tables)) await own.unsafe(statement);
  } catch (err) {
    return {
      url,
      sentence: `The product’s own database is there, but its tables could not all be made: ${(err as Error).message}.`,
    };
  } finally {
    await own.end();
  }
  const n = tables.length;
  return {
    url,
    sentence: `The product’s own database holds ${n} ${n === 1 ? 'table' : 'tables'}${n ? `: ${tables.map((t) => t.name).join(', ')}` : ''}.`,
  };
}

/** Removes every sandbox of one House of Rama database (its tests make throwaway ones). */
export async function dropSandboxes(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const prefix = sandboxName('', env);
  const admin = postgres(env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const dbs = await admin`select datname from pg_database where starts_with(datname, ${prefix})`;
    for (const d of dbs)
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(d.datname)} WITH (FORCE)`);
    const roles = await admin`select rolname from pg_roles where starts_with(rolname, ${prefix})`;
    for (const r of roles) await admin.unsafe(`DROP ROLE IF EXISTS ${quote(r.rolname)}`);
  } finally {
    await admin.end();
  }
}

/** Where a site's rows come from, or why there are none to show. */
export type RowsSource =
  { kind: 'sandbox' | 'settings'; url: string } | { kind: 'none'; why: string };

export async function rowsSource(
  site: Pick<SiteLocation, 'id' | 'kind'>,
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RowsSource> {
  if (site.kind === 'product') {
    const name = sandboxName(site.id, env);
    const admin = postgres(env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const [made] = await admin`select 1 from pg_database where datname = ${name}`;
      if (made) return { kind: 'sandbox', url: sandboxUrl(site.id, env) };
    } finally {
      await admin.end();
    }
    return {
      kind: 'none',
      why: 'Rows not connected: the product’s own database is made the next time its screens are photographed.',
    };
  }
  const url = await readSiteDatabase(db, site.id, env);
  return url
    ? { kind: 'settings', url }
    : {
        kind: 'none',
        why: 'Rows not connected: no read-only database address is entered for this site in Settings.',
      };
}

/** Names that say a column holds a key (Settings' own key names among them): masked whatever is in it. */
const SECRET_WORDS =
  /pass(word|wd|phrase)?|secret|token|api_?key|private_?key|credential|cipher|salt|otp/i;
const KEY_NAMES = new Set(SECRET_NAMES.map((n) => n.toLowerCase()));

export function maskedColumn(f: Pick<TableField, 'name' | 'key' | 'secret'>): boolean {
  return (
    f.secret ||
    SECRET_WORDS.test(f.name) ||
    SECRET_WORDS.test(f.key) ||
    KEY_NAMES.has(f.name.toLowerCase())
  );
}

/** A table's columns: from its definition, or (an older extraction) by name only, their type unread. */
export function fieldsOf(t: Table): TableField[] {
  return (
    t.fields ??
    t.columns.map((key) => ({
      key,
      name: key,
      type: 'unknown',
      primary: false,
      notNull: false,
      unique: false,
      secret: false,
    }))
  );
}

export interface GroundRows {
  /** The columns read, as the database names them, in the definition's order. */
  columns: string[];
  /** Columns of the definition the database does not hold (yet). */
  missing: string[];
  /** Each row's values as the table holds them (Postgres's own text); null when empty; masked ones `••••`. */
  rows: (string | null)[][];
  offset: number;
  more: boolean;
  total: number;
  /** Rows written today, when the table says when each was written. */
  today: number | null;
  /** How the rows are ordered, in words. */
  order: string;
}

export const MASK = '••••';

/**
 * Runs `fn` read-only: on a connection whose every transaction starts read-only, inside a read-only
 * transaction, with a time limit. Nothing done through it can change a row.
 */
export async function readOnly<T>(
  url: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 10,
    connection: { default_transaction_read_only: 'on', statement_timeout: 10_000 } as Record<
      string,
      string | number
    >,
  });
  try {
    return (await sql.begin('read only', (tx) => fn(tx))) as T;
  } finally {
    await sql.end();
  }
}

/**
 * One page of a table's rows, newest first, read-only: on a connection that starts every transaction
 * read-only, inside a read-only transaction; `absent` when the table is not in that database.
 */
export async function readRows(
  url: string,
  table: Pick<Table, 'name' | 'columns' | 'fields'>,
  offset = 0,
  limit = ROWS_PAGE,
): Promise<GroundRows | { absent: true }> {
  const fields = fieldsOf(table as Table);
  return readOnly(url, async (tx) => {
    const held = await tx<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = current_schema() and table_name = ${table.name}`;
    if (!held.length) return { absent: true as const };
    const there = new Set(held.map((c) => c.column_name));
    const shown = fields.filter((f) => there.has(f.name));
    const missing = fields.filter((f) => !there.has(f.name)).map((f) => f.name);
    const t = quote(table.name);
    const stamp = there.has('created_at') ? 'created_at' : null;
    const pk = shown.find((f) => f.primary)?.name ?? null;
    const by = stamp ?? pk;
    const [count] = await tx.unsafe<{ total: number; today: number | null }[]>(
      `select count(*)::int as total, ${
        stamp
          ? `(count(*) filter (where ${quote(stamp)} >= date_trunc('day', now())))::int`
          : 'null'
      } as today from ${t}`,
    );
    const n = Math.min(Math.max(1, limit), ROWS_PAGE);
    const from = Math.max(0, Math.floor(offset));
    const select = shown
      .map((f, i) =>
        maskedColumn(f) ? `(${quote(f.name)} is null) as c${i}` : `${quote(f.name)}::text as c${i}`,
      )
      .join(', ');
    const raw = shown.length
      ? await tx.unsafe<Record<string, string | boolean | null>[]>(
          `select ${select} from ${t}${by ? ` order by ${quote(by)} desc` : ''} limit ${n + 1} offset ${from}`,
        )
      : [];
    const rows = raw.slice(0, n).map((r) =>
      shown.map((f, i) => {
        const v = r[`c${i}`];
        if (maskedColumn(f)) return v === true ? null : MASK;
        return (v as string | null) ?? null;
      }),
    );
    return {
      columns: shown.map((f) => f.name),
      missing,
      rows,
      offset: from,
      more: raw.length > n,
      total: count!.total,
      today: count!.today,
      order: stamp
        ? 'newest first, by when each was written'
        : pk
          ? `newest first, by ${pk}`
          : 'in the order the database gives them',
    };
  });
}

/** A table's name as a count's unit: `model_calls` → "model calls"; one of them without the s. */
export function unitOf(table: string, n: number): string {
  const many = table.replace(/_/g, ' ');
  return n === 1 ? many.replace(/ies$/, 'y').replace(/s$/, '') : many;
}

/** The count, saying what it counts: "312 orders today · 4,018 in all". */
export function countSentence(table: string, total: number, today: number | null): string {
  const f = (n: number) => n.toLocaleString('en-IN');
  if (today === null) return `${f(total)} ${unitOf(table, total)} in the table`;
  return `${f(today)} ${unitOf(table, today)} today · ${f(total)} in all`;
}

/** A figure on a screen that is worked out from a column. */
export interface ColumnFigure {
  /** The appearance key of its flow. */
  key: string;
  title: string;
  /** The building whose facade shows it. */
  building: string | null;
}

export interface GroundColumn extends TableField {
  /** In the customer's words, where the product's glossary names the column (`file#symbol.key`). */
  words: string | null;
  masked: boolean;
  /** The figures on screens worked out from this column, by the capture's mapping. */
  figures: ColumnFigure[];
}

export interface GroundTable {
  table: string;
  file: string;
  line: number;
  columns: GroundColumn[];
  unread: string[];
  readBy: { id: string; name: string }[];
  writtenBy: { id: string; name: string }[];
}

function glossaryOf(repoDir: string): Glossary {
  const f = path.join(repoDir, '.rama/glossary.json');
  if (!existsSync(f)) return {};
  const parsed = Glossary.safeParse(JSON.parse(readFileSync(f, 'utf8')));
  return parsed.success ? parsed.data : {};
}

/** Whether a mapping's input names this column of this table (`orders.cups`, `orders.cups, orders.price`). */
const names = (data: string, table: string, f: TableField) =>
  new RegExp(`(^|[^\\w.])${table}\\.(${f.name}|${f.key})(?![\\w])`).test(data);

/**
 * What a plot shows besides its rows: its columns as the definition writes them, which buildings read
 * and write it, and which figures on screens depend on each column. Plain code from the record.
 */
export function groundTable(
  site: Pick<SiteLocation, 'repoDir'>,
  bp: Pick<Blueprint, 'tables' | 'commit'>,
  st: Pick<Street, 'plots' | 'buildings'>,
  name: string,
  capture: Capture | null,
): GroundTable | null {
  const t = bp.tables.find((x) => x.name === name);
  if (!t) return null;
  const plot = st.plots.find((p) => p.table === name);
  const named = (ids: string[]) =>
    ids.map((id) => ({ id, name: st.buildings.find((b) => b.id === id)?.name ?? id }));
  const glossary = glossaryOf(site.repoDir);
  // Only a capture of this commit says which figure reads which column.
  const fresh = capture && capture.commit === bp.commit ? capture : null;
  const shownOn = (figureId: string): ColumnFigure[] =>
    (fresh?.screens ?? []).flatMap((s) => {
      const keys = appearanceKeys(s.name, s.figures);
      const owner =
        st.buildings.find((b) => b.facades.some((f) => f.screen === s.blueprintScreen))?.id ?? null;
      return s.figures.flatMap((g, i) =>
        g.id === figureId
          ? [
              {
                key: keys[i]!,
                title: fresh!.mappings[figureId]?.title ?? figureId,
                building: owner,
              },
            ]
          : [],
      );
    });
  return {
    table: t.name,
    file: t.file,
    line: t.line,
    unread: t.unread ?? [],
    readBy: named(plot?.readBy ?? []),
    writtenBy: named(plot?.writtenBy ?? []),
    columns: fieldsOf(t).map((f) => ({
      ...f,
      words: glossary[`${t.file}#${t.symbol}.${f.key}`]?.text ?? null,
      masked: maskedColumn(f),
      figures: Object.entries(fresh?.mappings ?? {})
        .filter(([, m]) => m.inputs.some((i) => i.data && names(i.data, t.name, f)))
        .flatMap(([id]) => shownOn(id)),
    })),
  };
}

/**
 * The Test of a site's database address: it connects, reads in a read-only transaction, and says
 * whether the login could also change rows (House of Rama never does; a read-only login is safer).
 */
export async function checkDatabase(url: string): Promise<{ ok: boolean; sentence: string }> {
  try {
    const [r] = await readOnly(
      url,
      (tx) => tx<{ tables: number; writable: number }[]>`
      select
        (select count(*)::int from information_schema.tables where table_schema = current_schema()) as tables,
        (select count(*)::int from information_schema.table_privileges
          where grantee = current_user and table_schema = current_schema()
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as writable`,
    );
    const n = r!.tables;
    return {
      ok: true,
      sentence: `Connected: ${n} ${n === 1 ? 'table' : 'tables'}, read only.${
        r!.writable
          ? ' This login could also change rows; House of Rama never does, but a read-only login is safer.'
          : ''
      }`,
    };
  } catch (err) {
    return {
      ok: false,
      sentence: `Could not read from it: ${(err as Error).message.split('\n')[0]}.`,
    };
  }
}
