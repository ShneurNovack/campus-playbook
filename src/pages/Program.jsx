import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Copy } from 'lucide-react';
import { useData, plural, centerLabel, fmtDate, hourLabel, liftWords, DAYS, MONTHS } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Lift, Stat, FlyerGrid, Evidence, CenterLink, tip } from '../components/bits';
import { searchLike } from '../lib/search';
import { FlyerTile, LibCard, HOL_LABEL, AUD_LABEL } from './Library';

// key -> index. data.js already builds this map on the catalog; the fallback scans the keys once per catalog.
const keyMaps = new WeakMap();
function indexOfKey(cat, key) {
  if (cat.byKey) return cat.byKey.get(key);
  if (!keyMaps.has(cat)) keyMaps.set(cat, new Map(cat.programs.key.map((k, i) => [k, i])));
  return keyMaps.get(cat).get(key);
}

const OWN = "this center's own";
const fmtRun = (d) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x : null; } catch (_) { return null; } };

// One sentence on how it did, and how much evidence that rests on.
function verdict(p, isEvent) {
  if (p.n === 0) return 'It is posted but has not been held yet, so there is nothing to score.';
  if (p.adj == null || !p.scored) {
    if (!isEvent) return `It is filed under "${p.typeLabel}", which is an offer or a form more than an event with a crowd, so its sign-ups are never scored against a normal.`;
    if (p.reg == null) return `No sign-ups were recorded for ${p.n === 1 ? 'it' : 'any of its runs'}, so it cannot be scored. Most centers do not take sign-ups for every event.`;
    return `It drew ${Math.round(p.reg)} sign-ups${p.n > 1 ? ' on a typical run' : ''}, but there is not enough data to score it against ${OWN} normal.`;
  }
  const how = liftWords(p.adj, OWN);
  if (p.scored === 1) return `Its one scored run drew ${how} for this kind of event. One run is thin evidence.`;
  const thin = p.scored === 2 ? ' Two runs is still thin evidence.' : '';
  return `Across ${p.scored.toLocaleString()} scored runs it drew ${how} for this kind of event.${thin}`;
}

function CopyButton({ text, label }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState('done'); } catch (_) { setState('failed'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  };
  return (
    <button type="button" className="z-btn z-btn-sm z-btn-white flex-none" onClick={copy} aria-label={label}>
      {state === 'done' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite">{state === 'done' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy'}</span>
    </button>
  );
}

const CLAMP = 420;
function Wording({ title, text, copyLabel, note }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP + 60;
  const body = long && !open ? `${text.slice(0, CLAMP).replace(/\s+\S*$/, '')}…` : text;
  return (
    <div className="z-card flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <p className="mt-4" style={{ whiteSpace: 'pre-line', lineHeight: 1.55, fontSize: '1.06rem', overflowWrap: 'anywhere' }}>{body}</p>
      {long && <div className="mt-3"><button type="button" className="z-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show more'}</button></div>}
      {note && <p className="z-small z-muted mt-4">{note}</p>}
    </div>
  );
}

// Every run over time. Up to 36 runs: one bar per run, in order. More than that: one dot per run on a time axis.
// Ink only. A run with no sign-ups recorded is a hollow mark on the baseline, never a zero-height bar.
function RunsChart({ runs }) {
  const max = Math.max(1, ...runs.map((r) => r.regs));
  const tipFor = (r) => [fmtRun(r.date), r.regs > 0 ? plural(r.regs, 'sign-up') : r.regs < 0 ? 'Coming up, not held yet' : 'No sign-ups recorded', ...(r.lift ? [`${liftWords(r.lift, OWN)}`] : [])];
  const hollow = { width: 9, height: 9, borderRadius: 99, border: '2px solid var(--mist)', background: '#fff', flex: 'none' };
  if (runs.length <= 36) {
    const H = 150, label = (r, k) => (runs.length <= 10 ? `${MONTHS[r.date.getMonth()]} '${String(r.date.getFullYear()).slice(2)}` : k === 0 || r.date.getFullYear() !== runs[k - 1].date.getFullYear() ? String(r.date.getFullYear()) : '');
    return (
      <div className="flex items-end gap-[3px]" style={{ height: H + 44, maxWidth: runs.length * 64, borderBottom: '0' }} role="img" aria-label={`Sign-ups for each of ${runs.length} runs, oldest first: ${runs.map((r) => (r.regs > 0 ? r.regs : 'none')).join(', ')}`}>
        {runs.map((r, k) => (
          <div key={k} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" tabIndex={0} {...tip(tipFor(r))}>
            {r.regs > 0 && runs.length <= 14 && <div className="z-small font-semibold" style={{ fontSize: '0.78rem', marginBottom: 3 }}>{r.regs}</div>}
            {r.regs > 0 ? <div style={{ width: '100%', maxWidth: 24, height: Math.max(3, Math.round((r.regs / max) * H)), background: 'var(--ink)', borderRadius: '4px 4px 0 0' }} /> : <div style={{ ...hollow, marginBottom: -4 }} />}
            <div style={{ width: '100%', height: 1, background: 'var(--mist)' }} />
            <div className="z-muted mt-1 w-full text-center whitespace-nowrap" style={{ fontSize: '0.72rem', height: 16, overflow: 'visible' }}>{label(r, k)}</div>
          </div>
        ))}
      </div>
    );
  }
  const H = 170, d0 = runs[0].day, span = Math.max(1, runs[runs.length - 1].day - d0);
  const years = [];
  for (let y = runs[0].date.getFullYear() + 1; y <= runs[runs.length - 1].date.getFullYear(); y++) years.push(y);
  const xOfYear = (y) => ((Date.UTC(y, 0, 1) - runs[0].date.getTime()) / 86400e3 / span) * 100;
  return (
    <div role="img" aria-label={`Sign-ups for each of ${runs.length.toLocaleString()} runs from ${fmtDate(runs[0].date)} to ${fmtDate(runs[runs.length - 1].date)}. The most at one run was ${max}.`}>
      <div className="relative" style={{ height: H, borderBottom: '1px solid var(--mist)', borderTop: '1px dashed var(--fog-2)', margin: '0 6px' }}>
        <span className="absolute z-small z-muted" style={{ left: -6, top: 4, fontSize: '0.74rem', background: '#fff', paddingRight: 6 }}>{plural(max, 'sign-up')}</span>
        {runs.map((r, k) => (r.regs > 0
          ? <span key={k} className="absolute" style={{ left: `${((r.day - d0) / span) * 100}%`, bottom: `${(r.regs / max) * (H - 12)}px`, width: 8, height: 8, marginLeft: -4, marginBottom: -1, borderRadius: 99, background: 'var(--ink)', opacity: 0.62 }} {...tip(tipFor(r))} />
          : <span key={k} className="absolute" style={{ left: `${((r.day - d0) / span) * 100}%`, bottom: -4, width: 7, height: 7, marginLeft: -3.5, borderRadius: 99, border: '1.5px solid var(--mist)', background: '#fff' }} {...tip(tipFor(r))} />))}
      </div>
      <div className="relative" style={{ height: 20, margin: '4px 6px 0' }}>
        <span className="absolute z-muted" style={{ left: 0, fontSize: '0.74rem' }}>{fmtDate(runs[0].date, { month: 'short', year: 'numeric' })}</span>
        {years.filter((y) => xOfYear(y) > 14 && xOfYear(y) < 96).map((y) => <span key={y} className="absolute z-muted" style={{ left: `${xOfYear(y)}%`, transform: 'translateX(-50%)', fontSize: '0.74rem' }}>{y}</span>)}
      </div>
    </div>
  );
}

// The program's figure is not a plain average of the run figures. Say why when the two can look different.
const CAP = Math.exp(1.5);
function RunsTable({ runs, scored }) {
  const [all, setAll] = useState(false);
  const withLift = runs.filter((r) => r.lift).length, capped = runs.some((r) => r.lift && (r.lift > CAP + 0.01 || r.lift < 1 / CAP - 0.004));
  const notes = [
    withLift > scored ? `The program's figure uses ${scored.toLocaleString()} of the ${withLift.toLocaleString()} runs that carry a figure here. It leaves out runs from a stretch when the center's normal was under 3 sign-ups.` : null,
    capped ? 'It also counts any single run as no more than 4.5 times normal and no less than 0.22, so one outlier does not carry it.' : null,
  ].filter(Boolean);
  const rows = [...runs].reverse(), shown = all ? rows : rows.slice(0, 10);
  return (
    <div>
      <table className="z-table">
        <thead><tr><th scope="col">Date</th><th scope="col" className="num">Sign-ups</th><th scope="col" className="num" style={{ paddingRight: 0, whiteSpace: 'normal' }}>Against their own normal</th></tr></thead>
        <tbody>
          {shown.map((r, k) => (
            <tr key={k}>
              <td className="whitespace-nowrap">{fmtRun(r.date)}</td>
              <td className="num">{r.regs > 0 ? <span className="font-semibold">{r.regs.toLocaleString()}</span> : <span className="z-muted whitespace-nowrap">{r.regs < 0 ? 'Coming up' : 'Not measured'}</span>}</td>
              <td className="num" style={{ paddingRight: 0 }}>{r.lift ? <Lift value={r.lift} size="sm" /> : <span className="z-muted">{r.regs > 0 ? 'Not scored' : ''}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-5" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? 'Show the latest 10' : `Show all ${rows.length.toLocaleString()} runs`}</button>}
      {notes.length > 0 && <p className="z-small z-muted mt-5 max-w-[60ch]" style={{ lineHeight: 1.45 }}>{notes.join(' ').replace('It also counts', notes.length > 1 ? 'It also counts' : "The program's figure counts")}</p>}
    </div>
  );
}

function Similar({ p, cat }) {
  const [state, setState] = useState({ ids: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ ids: null, error: null });
    const P = cat.programs, mine = P.c[p.i];
    searchLike(p.i, { limit: 8, filter: (i) => P.c[i] !== mine })
      .then(({ hits }) => live && setState({ ids: hits.filter((h) => h.sim >= 0.25).map((h) => h.i), error: null }), (error) => live && setState({ ids: null, error }));
    return () => { live = false; };
  }, [p.i, cat]);
  return (
    <Section id="sim-h" title="Similar programs at other centers" sub={`The closest programs by meaning (name and description), at centers other than ${centerLabel(p.center).replace(/\.$/, '')}. Compare the flyers and the wording, not the raw sign-ups.`}>
      {state.error ? <ErrorNote error={state.error} what="The similar programs" />
        : !state.ids ? <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-busy="true">{[0, 1, 2, 3].map((k) => <div key={k} className="z-skel" style={{ aspectRatio: '3 / 2', borderRadius: 'var(--r-md)' }} />)}</div>
          : !state.ids.length ? <Empty>No other center has run anything close to this.</Empty>
            : <FlyerGrid cols="grid-cols-2 md:grid-cols-4">{state.ids.map((i) => <LibCard key={i} p={cat.prog(i)} />)}</FlyerGrid>}
    </Section>
  );
}

function PartOf({ p, ideas, themes }) {
  const idea = p.idea != null && p.idea >= 0 ? ideas[p.idea] : null;
  const ths = p.themes.map((k) => themes.themes.find((t) => t.key === k || t.id === k)).filter(Boolean);
  if (!idea && !ths.length) return null;
  const card = (to, kind, label, line, lift, ev) => (
    <Link key={to} to={to} className="z-card flex flex-col">
      <p className="z-small z-muted font-semibold">{kind}</p>
      <h3 className="z-h3 mt-1.5">{label}</h3>
      <p className="mt-2 z-muted flex-1" style={{ lineHeight: 1.45 }}>{line}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">{lift != null ? <Lift value={lift} /> : <span className="font-semibold">Not enough sign-up data</span>}{ev}</div>
    </Link>
  );
  return (
    <Section id="part-h" title="Part of" sub="The engine groups the same program across centers into an idea, and reads Shabbat dinner themes from names. Open either to see how it does everywhere, not only here.">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {idea && card(`/idea/${idea.id}`, 'Idea', idea.label, `Run ${idea.n.toLocaleString()} times at ${plural(idea.centers, 'center')}.`, idea.lift, <Evidence n={idea.n_scored} centers={idea.centers_scored} conf={idea.confidence} />)}
        {ths.map((t) => card(`/themes/${t.id}`, 'Shabbat dinner theme', t.label, `${plural(t.n, 'dinner')} at ${plural(t.centers, 'center')}.`, t.lift, <Evidence n={t.n_measured} centers={t.centers_measured} conf={t.confidence} />))}
      </div>
    </Section>
  );
}

export default function Program() {
  const { key } = useParams();
  const nav = useNavigate();
  const { data, error } = useData('catalog');
  const text = useData('text.json');
  const extra = useData('ideas.json', 'themes.json');
  const cat = data ? data[0] : null;
  const p = useMemo(() => (cat ? cat.prog(indexOfKey(cat, key)) : null), [cat, key]);
  const runs = useMemo(() => (p && text.data ? (text.data[0].occ[p.i] || []).map(([day, regs, adj]) => ({ day, date: cat.date(day), regs, lift: adj && p.scored ? adj / 100 : null })) : null), [p, text.data, cat]);
  useEffect(() => { if (p) document.title = `${p.name}, ${centerLabel(p.center)} · Campus Playbook`; return () => { document.title = 'Campus Playbook'; }; }, [p]);

  if (error) return <ErrorNote error={error} what="This program" />;
  if (!cat) return <Loading rows={2} h={260} />;
  const back = (
    <Link to="/library" className="inline-flex items-center gap-1.5 font-semibold z-small hover:underline" onClick={(e) => { if (window.history.state && window.history.state.idx > 0) { e.preventDefault(); nav(-1); } }}>
      <ArrowLeft size={16} aria-hidden="true" />Back
    </Link>
  );
  if (!p) {
    return (
      <div>
        <div className="pt-8">{back}</div>
        <PageHead title="Program not found" />
        <div className="mt-8"><Empty>No program has the key "{key}". It may have been renamed or removed since the link was made. <Link to="/library" className="z-link">Search the library</Link> for it by name.</Empty></div>
      </div>
    );
  }

  const c = p.center, label = centerLabel(c), site = safeUrl(c.site);
  const where = [c.campus && c.campus !== label ? c.campus : null, c.city, c.state].filter(Boolean).join(', ');
  const desc = text.data ? (text.data[0].desc[p.i] || '').trim() : '', short = text.data ? (text.data[0].short[p.i] || '').trim() : '';
  const hasDesc = desc && desc.toLowerCase() !== p.name.trim().toLowerCase();
  const hasShort = short && short !== desc && short.toLowerCase() !== p.name.trim().toLowerCase();
  const usual = `${p.n > 1 ? 'Usually ' : ''}${DAYS[p.wd]}${p.hour ? ` at ${hourLabel(p.hour)}` : ''}`;
  const isEvent = cat.event_types.includes(p.type) || p.type === 'other';
  const total = runs ? runs.reduce((a, r) => a + Math.max(0, r.regs), 0) : 0, measured = runs ? runs.filter((r) => r.regs > 0).length : 0;
  const facts = [
    p.n > 1 || p.up ? ['First run', fmtDate(p.first)] : null,
    [p.n > 1 ? 'Latest run' : p.n === 0 ? 'Posted for' : 'Date', fmtDate(p.last)],
    ['Day and time', usual],
    p.up ? ['Coming up', plural(p.up, 'date')] : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="pt-8">{back}</div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
        <div className="min-w-0">
          <FlyerTile src={p.img} name={p.name} eager style={{ borderRadius: 'var(--r-lg)', objectFit: 'contain' }} />
          {!p.img && <p className="z-small z-muted mt-3">No flyer was posted for this program.</p>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="z-pill" style={{ background: 'var(--ink)', color: '#fff' }}>{p.typeLabel}</span>
            {p.hol && <span className="z-pill">{HOL_LABEL[p.hol] || p.hol}</span>}
            {p.aud.map((a) => <span key={a} className="z-pill">{AUD_LABEL[a] || a}</span>)}
            {p.recurring && <span className="z-pill">Recurring series</span>}
            {p.collab && <span className="z-pill">With another group</span>}
            {p.offsite && <span className="z-pill">Off site</span>}
          </div>
          <h1 className="z-h1 mt-5" style={{ fontSize: 'clamp(2rem, 3.6vw, 3.1rem)', lineHeight: 1.02, overflowWrap: 'anywhere' }}>{p.name}</h1>
          <p className="mt-4" style={{ lineHeight: 1.4 }}><CenterLink c={c} className="font-bold z-link" />{where && <span className="z-muted"> {where}</span>}</p>
          <p className="mt-5" style={{ fontSize: '1.12rem', lineHeight: 1.5 }}>{verdict(p, isEvent)}</p>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-7">
            <Stat value={p.n.toLocaleString()} label={p.n === 1 ? 'run' : 'runs'} sub={p.up ? `${p.up} more posted` : null} />
            {p.reg != null ? <Stat value={Math.round(p.reg).toLocaleString()} label={p.n > 1 ? 'median sign-ups' : 'sign-ups'} sub={p.n > 1 ? `${p.max.toLocaleString()} at most` : null} />
              : total > 0 ? <Stat value={total.toLocaleString()} label={total === 1 ? 'sign-up in all' : 'sign-ups in all'} sub={`across ${plural(measured, 'run')}`} />
                : <Stat value="None" label="sign-ups recorded" />}
            <Stat value={p.adj != null ? <Lift value={p.adj} size="lg" /> : 'n/a'} label="against their own normal" sub={p.adj != null ? `from ${plural(p.scored, 'scored run')}` : 'no scored runs'} />
          </div>

          <dl className="mt-8">
            {facts.map(([k, v]) => (
              <div key={k} className="py-2.5 flex items-baseline justify-between gap-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
                <dt className="z-muted">{k}</dt><dd className="font-semibold text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {site && <a href={site.href} target="_blank" rel="noopener noreferrer" className="z-btn z-btn-soft z-btn-sm mt-6" title={site.hostname}>Center website<ArrowUpRight size={16} aria-hidden="true" /></a>}
        </div>
      </div>

      <Section id="copy-h" title="The wording" sub={`What ${label} posted on the sign-up page. Copy it as a starting point and make it yours.`}>
        {text.error ? <ErrorNote error={text.error} what="The description" />
          : !text.data ? <Loading rows={1} h={160} />
            : !hasDesc && !hasShort ? <Empty>No description was posted beyond the name.</Empty>
              : (
                <div className={`grid grid-cols-1 gap-4 items-start ${hasDesc && hasShort ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : 'max-w-[52rem]'}`}>
                  {hasDesc && <Wording title="Description" text={desc} copyLabel="Copy the description" note={desc.length >= 700 ? 'Only the first 700 characters of a description are kept.' : null} />}
                  {hasShort && <Wording title="Short description" text={short} copyLabel="Copy the short description" />}
                </div>
              )}
      </Section>

      <Section id="runs-h" title={p.n + p.up === 1 ? 'The one run' : 'Every run'}
        sub={!runs ? null : runs.length < 2 ? 'It has one date so far, so there is no trend to draw.' : measured < 2 ? 'Every date it was posted for, newest first.' : `${runs.length > 36 ? 'Each dot' : 'Each bar'} is one run, oldest on the left, by sign-ups. A hollow mark is a run with no sign-ups recorded: it happened, but it was not measured.`}>
        {text.error ? <ErrorNote error={text.error} what="The list of runs" />
          : !runs ? <Loading rows={1} h={200} />
            : !runs.length ? <Empty>No dates are on record for this program.</Empty>
              : runs.length === 1 ? <div className="max-w-[40rem]"><RunsTable runs={runs} scored={p.scored} /></div>
                : (
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-10 lg:gap-12 items-start">
                    <div className="min-w-0 lg:pt-8">{measured >= 2 ? <RunsChart runs={runs} /> : <Empty>{measured === 0 ? 'No run' : 'Only one run'} of the {runs.length.toLocaleString()} has sign-ups recorded, so there is nothing to chart. The dates are in the table.</Empty>}</div>
                    <RunsTable runs={runs} scored={p.scored} />
                  </div>
                )}
      </Section>

      {extra.data && <PartOf p={p} ideas={extra.data[0]} themes={extra.data[1]} />}
      <Similar p={p} cat={cat} />
    </div>
  );
}
