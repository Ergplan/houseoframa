// Model cost of a stage, from model_calls, in tokens and rupees (packages/model/src/prices.ts).
//   pnpm cost <stage>   → every call made since the stage-<N>-start tag's commit time
//   pnpm cost --since <ISO time>
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
  }[]
>`
  select prompt, site_id, model, status, count(*)::int as calls, sum(attempts)::int as attempts,
         coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output
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
  const c = costOf(r.model, r.input, r.output);
  if (c) totalInr += c.inr;
  else unpriced = true;
  console.log(
    `| ${r.prompt} | ${r.site_id} | ${r.model} | ${r.status} | ${r.calls} (${r.attempts}) | ${r.input.toLocaleString('en-IN')} | ${r.output.toLocaleString('en-IN')} | ${c ? formatInr(c.inr) : 'no price'} |`,
  );
}
console.log(
  `\nTotal: ${formatInr(totalInr)}${unpriced ? ' (plus calls on a model with no price in the table)' : ''}`,
);
