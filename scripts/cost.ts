// Model cost of a stage, from model_calls, in tokens and rupees (packages/model/src/prices.ts).
//   pnpm cost <stage>   → every call made since the stage-<N>-start tag's commit time
//   pnpm cost --since <ISO time>
// A builder run's cost is the one Claude Code reported for it (model_calls.output.costUsd); every other
// call's is its tokens at the table's prices.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createDb } from '@rama/db';
import { costOf, formatInr, PRICES_SET_ON, USD_INR } from '@rama/model';

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const since =
  args[0] === '--since'
    ? args[1]!
    : execFileSync('git', ['log', '-1', '--format=%cI', `stage-${Number(args[0])}-start`], {
        encoding: 'utf8',
      }).trim();
if (!since) throw new Error('usage: pnpm cost <stage> | pnpm cost --since <ISO time>');

const { sql, close } = createDb();
const rows = await sql<
  {
    prompt: string;
    site_id: string;
    model: string;
    status: string;
    calls: number;
    attempts: number;
    input: number;
    output: number;
    reported: number | null;
  }[]
>`
  select prompt, site_id, model, status, count(*)::int as calls, sum(attempts)::int as attempts,
         coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output,
         sum((output->>'costUsd')::float) as reported
  from model_calls where created_at >= ${since}
  group by 1, 2, 3, 4 order by 3, 2, 1, 4`;
await close();

let totalInr = 0;
let unpriced = false;
console.log(
  `Model calls since ${since} (prices set ${PRICES_SET_ON}; ₹${USD_INR.rate} per US$, ${USD_INR.on})\n`,
);
console.log(
  '| Prompt | Site | Model | Status | Calls (attempts) | Input tokens | Output tokens | Cost |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  // A builder run reports its own cost (Claude Code's, cached input priced as such): that is the cost.
  const c =
    r.reported !== null
      ? { usd: r.reported, inr: r.reported * USD_INR.rate }
      : costOf(r.model, r.input, r.output);
  if (c) totalInr += c.inr;
  else unpriced = true;
  console.log(
    `| ${r.prompt} | ${r.site_id} | ${r.model} | ${r.status} | ${r.calls} (${r.attempts}) | ${r.input.toLocaleString('en-IN')} | ${r.output.toLocaleString('en-IN')} | ${c ? formatInr(c.inr) : 'no price'} |`,
  );
}
console.log(
  `\nTotal: ${formatInr(totalInr)}${unpriced ? ' (plus calls on a model with no price in the table)' : ''}`,
);
