// capture(site): photographs the target's real screens. Builds the app in its checkout, starts it with
// no secrets (PATH and HOME only: no database URL, no vendor keys), drives Playwright through
// `.rama/screens.json`, and writes work/<site>/shots/<name>.png plus work/<site>/capture.json:
//  - each screen with the bricks that render it (the route's import closure from the Blueprint);
//  - every figure on it with its box and text: traced ones (`data-rama-figure`, or the overlay's
//    selector) and untraced ones (leaf text matching the figure pattern that no traced figure covers);
//  - for each traced figure, its mapping, its formula's lines, and the result of re-executing the
//    target's own function in the sandbox.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import type { Blueprint } from '@rama/shared';
import { canonicalJson } from '@rama/blueprint';
import {
  CONVENTION_FILE,
  FigureMapping,
  readFiguresOverlay,
  readScreensConfig,
  screensOf,
  type FiguresOverlay,
  type ScreenSpec,
  type ScreensConfig,
} from './config.ts';
import { appearanceKeys } from './keys.ts';
import { runInSandbox } from './sandbox.ts';
import { codeAt, type RunResult } from './trail.ts';

export const CAPTURE_VERSION = 1;
/** Screenshots are full-page up to this height; a taller page is cropped, and says so. */
export const MAX_SHOT_HEIGHT = 12_000;

export interface CapturedFigure {
  id: string;
  /** Where the figure was found: the convention's attribute, the overlay's selector, or the figure pattern. */
  origin: 'attribute' | 'overlay' | 'detected';
  text: string;
  box: { x: number; y: number; w: number; h: number };
  /** `data-rama-args` (JSON array): the inputs the screen computed the figure from (convention only). */
  args?: unknown[];
  /** `data-rama-value`: the raw value the element formats (convention only). */
  value?: string;
}

export interface CapturedScreen {
  name: string;
  title: string;
  route: string;
  role: string | null;
  /** Where the browser ended up (path and query), when a redirect took it somewhere other than `route`. */
  landed?: string;
  /** Set when the page was taller than MAX_SHOT_HEIGHT: its full height. The shot is cropped, and figures below it are left out. */
  croppedFrom?: number;
  /** File name under shots/. */
  shot: string;
  width: number;
  height: number;
  /** The Blueprint screen the route matched, and its bricks. */
  blueprintScreen: string | null;
  bricks: string[];
  figures: CapturedFigure[];
}

export interface CapturedMapping extends FigureMapping {
  origin: 'convention' | 'overlay';
  /** The formula's lines, read at capture time. */
  code: string;
}

export interface Capture {
  version: number;
  site: string;
  /** HEAD of the checkout that was built. */
  commit: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  screens: CapturedScreen[];
  /** Every traced figure's mapping, by figure id. */
  mappings: Record<string, CapturedMapping>;
  /**
   * The result of re-executing each traced figure, per appearance (`<screen>/<figureId>`, with `~<n>` for a
   * second occurrence on the same screen; see keys.ts): two appearances may come from different arguments.
   */
  runs: Record<string, RunResult>;
}

/** Turns `/bills/[number]` into a matcher for `/bills/INV-042`. */
export function routeMatcher(pattern: string): RegExp {
  const parts = pattern
    .split('/')
    .map((seg) =>
      /^\[\[?\.\.\.[^\]]+\]\]?$/.test(seg)
        ? '.*'
        : /^\[[^\]]+\]$/.test(seg)
          ? '[^/]+'
          : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
  return new RegExp(`^${parts.join('/') || '/'}$`);
}

/** The Blueprint screen whose route matches a path; a literal route beats a dynamic one. */
export function screenForRoute(bp: Blueprint, route: string) {
  const pathOnly = route.split('?')[0]!.replace(/\/$/, '') || '/';
  const hits = bp.screens.filter((s) => routeMatcher(s.route).test(pathOnly));
  return (
    hits.sort(
      (a, b) => (a.route.match(/\[/g)?.length ?? 0) - (b.route.match(/\[/g)?.length ?? 0),
    )[0] ?? null
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      const addr = s.address();
      s.close(() =>
        typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port')),
      );
    });
  });
}

// A minimal environment: PATH and HOME only, so the target sees no database URL and no vendor keys.
const CLEAN_ENV = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NEXT_TELEMETRY_DISABLED: '1',
});

function sh(command: string, cwd: string, env: NodeJS.ProcessEnv, log: (s: string) => void) {
  log(`$ ${command}`);
  const res = spawnSync('bash', ['-lc', command], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0)
    throw new Error(
      `\`${command}\` failed in ${cwd}:\n${(res.stdout + res.stderr).trim().split('\n').slice(-15).join('\n')}`,
    );
}

async function startApp(
  repoDir: string,
  cfg: ScreensConfig,
  log: (s: string) => void,
): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  const command = cfg.app.start.replaceAll('{port}', String(port));
  const cwd = path.join(repoDir, cfg.app.cwd);
  log(`$ ${command}   (in ${cfg.app.cwd})`);
  let output = '';
  const child: ChildProcess = spawn('bash', ['-lc', command], {
    cwd,
    env: { ...CLEAN_ENV(), NODE_ENV: 'production', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`the app exited while starting:\n${output.slice(-2000)}`);
    try {
      const res = await fetch(`${url}${cfg.app.ready}`);
      if (res.status < 500) return { url, stop };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  stop();
  throw new Error(`the app did not answer ${cfg.app.ready} within 90s:\n${output.slice(-2000)}`);
}

async function runSteps(page: Page, steps: ScreenSpec['steps']) {
  for (const s of steps) {
    if ('click' in s) await page.click(s.click);
    else if ('fill' in s) await page.fill(s.fill, s.value);
    else if ('press' in s) await page.keyboard.press(s.press);
    else if ('waitFor' in s) await page.waitForSelector(s.waitFor);
    else await page.waitForTimeout(s.wait);
  }
}

interface RawFigure {
  id: string | null;
  origin: CapturedFigure['origin'];
  text: string;
  box: CapturedFigure['box'];
  args?: string | null;
  value?: string | null;
}

/**
 * The function that runs inside the page to find every figure (see page-figures.js). Kept as plain
 * JavaScript and sent as text: a TypeScript loader would wrap it in helpers the page does not have.
 */
const PAGE_FIGURES = readFileSync(
  fileURLToPath(new URL('./page-figures.js', import.meta.url)),
  'utf8',
);

export interface CaptureOptions {
  /** Where shots/ and capture.json go (default: the site's work directory). */
  outDir: string;
  /** Build before starting (default true). The build is skipped when false and a build exists. */
  build?: boolean;
  log?: (s: string) => void;
  now?: () => Date;
}

export async function capture(
  site: { id: string; repoDir: string },
  bp: Blueprint,
  opts: CaptureOptions,
): Promise<Capture> {
  const log = opts.log ?? (() => {});
  const cfg = readScreensConfig(site.repoDir);
  if (!cfg)
    throw new Error(
      `${site.repoDir} has no .rama/screens.json: nothing says which screens to photograph`,
    );
  const overlay: FiguresOverlay = readFiguresOverlay(site.repoDir);
  const env = CLEAN_ENV();
  if (!existsSync(path.join(site.repoDir, 'node_modules')))
    sh(cfg.app.install, site.repoDir, { ...env, NODE_ENV: 'development' }, log); // dev dependencies are needed to build
  if (opts.build !== false)
    sh(cfg.app.build, site.repoDir, { ...env, NODE_ENV: 'production' }, log);

  // The convention's own mapping, read from the target's code in the sandbox.
  const mappings: Capture['mappings'] = {};
  if (existsSync(path.join(site.repoDir, CONVENTION_FILE))) {
    const ans = await runInSandbox(site.repoDir, {
      kind: 'export',
      file: CONVENTION_FILE,
      name: 'figures',
    });
    if (!ans.ok) throw new Error(`${CONVENTION_FILE} could not be read: ${ans.error}`);
    for (const [id, raw] of Object.entries((ans.value ?? {}) as Record<string, unknown>)) {
      const parsed = FigureMapping.safeParse(raw);
      if (!parsed.success)
        throw new Error(
          `${CONVENTION_FILE}: figure "${id}" does not match the convention: ${parsed.error.message}`,
        );
      mappings[id] = { ...parsed.data, origin: 'convention', code: '' };
    }
  }
  for (const [id, f] of Object.entries(overlay)) {
    const mapping = FigureMapping.parse(f); // placement and harness stay in the overlay
    mappings[id] = { ...mapping, origin: 'overlay', code: '' };
  }
  for (const m of Object.values(mappings)) {
    const full = path.join(site.repoDir, m.file);
    m.code = existsSync(full) ? codeAt(readFileSync(full, 'utf8'), m.line) : '';
  }

  const shotsDir = path.join(opts.outDir, 'shots');
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });
  const app = await startApp(site.repoDir, cfg, log);
  const screens: CapturedScreen[] = [];
  const browser = await chromium.launch();
  try {
    for (const s of cfg.screens) {
      const page = await browser.newPage({ viewport: cfg.viewport, deviceScaleFactor: 1 });
      const query = s.role ? cfg.roles[s.role]?.query : undefined;
      const route = query ? `${s.route}${s.route.includes('?') ? '&' : '?'}${query}` : s.route;
      log(`screen ${s.name}: ${route}`);
      await page.goto(`${app.url}${route}`, { waitUntil: 'networkidle' });
      const end = new URL(page.url());
      const landedAt = end.pathname + end.search;
      if (landedAt !== route) log(`screen ${s.name}: redirected to ${landedAt}`);
      await runSteps(page, s.steps);
      await page.waitForLoadState('networkidle');
      // Grow the viewport to the page so fixed bars sit where the user sees them, and everything is in one shot.
      const height = Math.max(
        cfg.viewport.height,
        await page.evaluate(() => document.documentElement.scrollHeight),
      );
      await page.setViewportSize({
        width: cfg.viewport.width,
        height: Math.min(height, MAX_SHOT_HEIGHT),
      });
      await page.waitForTimeout(250);
      const arg = {
        overlay: Object.entries(overlay)
          .filter(([, f]) => screensOf(f).includes(s.name))
          .map(([id, f]) => ({ id, selector: f.selector })),
        pattern: cfg.figurePattern,
      };
      const raw = (await page.evaluate(
        `(${PAGE_FIGURES.trim()})(${JSON.stringify(arg)})`,
      )) as RawFigure[];
      const shot = `${s.name}.png`;
      await page.screenshot({ path: path.join(shotsDir, shot) });
      const size = page.viewportSize()!;
      await page.close();
      const match = screenForRoute(bp, s.route);
      let n = 0;
      screens.push({
        name: s.name,
        title: s.title ?? match?.name ?? s.name,
        route,
        ...(landedAt !== route ? { landed: landedAt } : {}),
        role: s.role ?? null,
        ...(height > size.height ? { croppedFrom: height } : {}),
        shot,
        width: size.width,
        height: size.height,
        blueprintScreen: match?.id ?? null,
        bricks: match?.bricks ?? [],
        // A figure below a cropped shot is not on the screenshot, so it is not shown (nor counted).
        figures: raw
          .filter((f) => f.box.y < size.height)
          .map((f) => ({
            id: f.id ?? `untraced:${s.name}:${++n}`,
            origin: f.origin,
            text: f.text,
            box: f.box,
            ...(f.args ? { args: JSON.parse(f.args) as unknown[] } : {}),
            ...(f.value !== null && f.value !== undefined ? { value: f.value } : {}),
          })),
      });
    }
  } finally {
    await browser.close();
    app.stop();
  }

  // Re-execute every traced figure, per appearance. An overlay harness takes no screen arguments, so it
  // runs once per figure and its result serves every screen the figure appears on.
  const runs: Capture['runs'] = {};
  const harnessRuns = new Map<string, RunResult>();
  for (const screen of screens) {
    const keys = appearanceKeys(screen.name, screen.figures);
    for (const [i, f] of screen.figures.entries()) {
      const mapping = mappings[f.id];
      if (f.origin === 'detected' || !mapping) continue;
      const harness = overlay[f.id]?.run;
      let run = mapping.origin === 'overlay' ? harnessRuns.get(f.id) : undefined;
      if (!run) {
        run = await reexecute(site.repoDir, f, mapping, harness);
        if (mapping.origin === 'overlay') harnessRuns.set(f.id, run);
      }
      runs[keys[i]!] = run;
      log(
        `figure ${keys[i]}: ${run.ok ? `re-executed → ${run.text}` : `not re-executed (${run.error})`}`,
      );
    }
  }

  const head = spawnSync('git', ['-C', site.repoDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim();
  const result: Capture = {
    version: CAPTURE_VERSION,
    site: site.id,
    commit: head,
    capturedAt: (opts.now ?? (() => new Date()))().toISOString(),
    viewport: cfg.viewport,
    screens,
    mappings,
    runs,
  };
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(path.join(opts.outDir, 'capture.json'), canonicalJson(result));
  return result;
}

const asText = (v: unknown) =>
  v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);

/** Runs the target's own code for one figure: the overlay's harness, or the convention's function with the screen's arguments. */
export async function reexecute(
  repoDir: string,
  figure: CapturedFigure,
  mapping: CapturedMapping,
  harness: string | undefined,
): Promise<RunResult> {
  if (mapping.origin === 'overlay') {
    if (!harness)
      return {
        ok: false,
        text: null,
        value: null,
        inputs: [],
        error: 'the overlay gives no way to re-execute it (`run`)',
      };
    const ans = await runInSandbox(repoDir, { kind: 'harness', file: harness });
    if (!ans.ok) return { ok: false, text: null, value: null, inputs: [], error: ans.error };
    const v = (ans.value ?? {}) as {
      text?: unknown;
      value?: unknown;
      inputs?: { label: string; value: unknown }[];
    };
    return {
      ok: true,
      text: typeof v.text === 'string' ? v.text : null,
      value: v.value ?? null,
      inputs: (v.inputs ?? []).map((i) => ({ label: i.label, value: asText(i.value) })),
    };
  }
  if (!figure.args)
    return {
      ok: false,
      text: null,
      value: null,
      inputs: [],
      error: 'the element carries no data-rama-args to re-execute with',
    };
  const ans = await runInSandbox(repoDir, {
    kind: 'call',
    file: mapping.file,
    fn: mapping.fn,
    args: figure.args,
  });
  if (!ans.ok) return { ok: false, text: null, value: null, inputs: [], error: ans.error };
  return {
    ok: true,
    text: asText(ans.value),
    value: ans.value,
    inputs: mapping.inputs.map((i, n) => ({ label: i.label, value: asText(figure.args![n]) })),
  };
}
