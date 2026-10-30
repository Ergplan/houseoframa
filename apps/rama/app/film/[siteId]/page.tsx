import { readSiteBlueprint, siteRecord } from '@rama/blueprint/site';
import { appearanceKeys, flowOf, readCapture, type Flow } from '@rama/trace';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { openCalls, siteFilm, siteLakefront } from '@rama/workbench';
import { pageSite } from '../../../server/session';
import { Shell } from '../../../components/harmony/Shell';
import { FilmPlayer, type FilmScene } from '../../../components/film/FilmPlayer';
import '../../../components/film/film.css';

export const dynamic = 'force-dynamic';

const SCENES: FilmScene[] = ['plan', 'design', 'foundation', 'build', 'try', 'ground', 'walk'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * The film (Stage 13): a product's build as a non-coder watches it, from the plan to the walk through.
 * Everything it shows is on record: the cards, the commits, the builder's own words, the edit tail, the
 * checks, the re-executed figures, the signatures. House of Rama stands outside the product; this page
 * is what it saw.
 */
export default async function FilmPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const q = (await searchParams) ?? {};
  const { member, site } = await pageSite(siteId);
  const bp = readSiteBlueprint(site);
  const rec = siteRecord(site.id);
  const lakefront = bp && site.kind === 'product' ? siteLakefront(site, bp) : null;
  const film = siteFilm(
    site,
    bp,
    { name: site.name, idea: rec?.idea ?? null, builder: rec?.builder ?? null },
    lakefront,
  );
  // Every figure's flow, from the re-execution of the commit shown: the product's own code, run.
  const capture = readCapture(site.id);
  const flows: Flow[] =
    capture && bp && capture.commit === bp.commit
      ? capture.screens.flatMap((s) =>
          appearanceKeys(s.name, s.figures).flatMap((k) => {
            const f = flowOf(capture, k);
            return f ? [f] : [];
          }),
        )
      : [];
  const flags = Object.fromEntries(
    Object.entries(lakefront?.flags ?? {}).map(([id, st]) => [
      id,
      {
        word:
          st.state === 'Confirmed' && st.by.length ? `Confirmed by ${st.by.join(', ')}` : st.state,
        good: st.state !== 'Unverified',
      },
    ]),
  );
  const facades = Object.fromEntries(
    Object.entries(lakefront?.facades ?? {}).map(([id, fs]) => [
      id,
      fs.map((f) => ({
        screen: f.screen,
        title: f.title,
        shot: f.shot,
        figures: f.figures.map((x) => ({ key: x.key, text: x.text ?? '', traced: x.traced })),
      })),
    ]),
  );
  const signed = [...signaturesInForce(readSignoffs(site.repoDir)).values()]
    .filter((s) => s.target.kind === 'screen')
    .map((s) => ({
      screen: s.target.id,
      person: s.person,
      at: s.at,
      statement: s.statement,
      seal: s.seal ?? null,
    }));
  const scene = one(q.scene);
  return (
    <Shell
      here="home"
      wide
      member={member}
      crumbs={[{ label: 'Home', href: '/' }, { label: site.name }, { label: 'The film' }]}
    >
      <FilmPlayer
        film={film}
        street={lakefront?.street ?? null}
        flags={flags}
        facades={facades}
        flows={flows}
        signed={signed}
        person={{ name: member.name, role: member.role }}
        start={SCENES.includes(scene as FilmScene) ? (scene as FilmScene) : null}
        trainer={member.role === 'trainer' || member.role === 'manager'}
        called={openCalls(site.id)[0] ?? null}
      />
    </Shell>
  );
}
