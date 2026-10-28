// Runs inside the sandbox process, in the target's checkout (see sandbox.ts). Plain JavaScript so it
// needs nothing but the tsx loader the parent passes. One request in argv, one JSON answer on stdout
// after a marker line, so the target's own logging cannot be mistaken for the answer.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARK = '@@RAMA-SANDBOX@@';
const req = JSON.parse(process.argv[2]);
const load = (file) => import(pathToFileURL(path.resolve(file)).href);
const plain = (v) =>
  JSON.parse(
    JSON.stringify(v, (_k, x) =>
      typeof x === 'bigint' ? x.toString() : x === undefined ? null : x,
    ),
  );

/**
 * The tables a schema file exports, as the product's own Drizzle describes them (getTableConfig of the
 * drizzle-orm the product installed): each column's SQL type, keys and the default Postgres applies.
 */
async function tablesOf(mod) {
  const from = createRequire(path.resolve('package.json'));
  const pg = await import(pathToFileURL(from.resolve('drizzle-orm/pg-core')).href);
  const orm = await import(pathToFileURL(from.resolve('drizzle-orm')).href);
  const dialect = new pg.PgDialect();
  const literal = (v) =>
    typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : `'${(typeof v === 'string' ? v : JSON.stringify(v)).replace(/'/g, "''")}'`;
  return Object.values(mod)
    .filter((t) => orm.is(t, pg.PgTable))
    .map((t) => {
      const c = pg.getTableConfig(t);
      return {
        name: c.name,
        columns: c.columns.map((col) => ({
          name: col.name,
          type: col.getSQLType(),
          primary: col.primary,
          notNull: col.notNull,
          unique: col.isUnique,
          default:
            col.default === undefined
              ? null
              : orm.is(col.default, orm.SQL)
                ? dialect.sqlToQuery(col.default).sql
                : literal(col.default),
        })),
        primaryKey: c.primaryKeys.flatMap((k) => k.columns.map((x) => x.name)),
      };
    });
}

let answer;
try {
  const mod = await load(req.file);
  if (req.kind === 'export') {
    answer = { ok: true, value: plain(mod[req.name]) };
  } else if (req.kind === 'call') {
    const fn = mod[req.fn];
    if (typeof fn !== 'function') throw new Error(`${req.file} has no exported function ${req.fn}`);
    answer = { ok: true, value: plain(await fn(...req.args)) };
  } else if (req.kind === 'harness') {
    if (typeof mod.default !== 'function')
      throw new Error(`${req.file} has no default export to run`);
    answer = { ok: true, value: plain(await mod.default()) };
  } else if (req.kind === 'show') {
    const show = mod.SHOW?.[req.show];
    if (typeof show !== 'function') throw new Error(`${req.file} has no SHOW.${req.show}`);
    answer = { ok: true, value: plain(show(req.value)) };
  } else if (req.kind === 'tables') {
    answer = { ok: true, value: await tablesOf(mod) };
  } else throw new Error(`unknown request kind ${req.kind}`);
} catch (err) {
  answer = {
    ok: false,
    error: String(err?.stack ?? err)
      .split('\n')
      .slice(0, 4)
      .join('\n'),
  };
}
process.stdout.write(`\n${MARK}${JSON.stringify(answer)}\n`);
process.exit(0);
