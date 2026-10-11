import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useData, load, plural, centerLabel } from '../lib/data';
import { PageHead, Loading, ErrorNote, Empty, Lift, Seg, FlyerGrid, useDebounced } from '../components/bits';
import { searchIndex, embed, scoreAll, wordingMatch, blend, isMatch } from '../lib/search';

// ---- shared with Program.jsx

export const HOLIDAYS = [
  ['rosh_hashana', 'Rosh Hashana'], ['yom_kippur', 'Yom Kippur'], ['sukkot', 'Sukkot'], ['simchat_torah', 'Simchat Torah'], ['chanukah', 'Chanukah'],
  ['tu_bshvat', "Tu B'Shvat"], ['purim', 'Purim'], ['pesach', 'Pesach'], ['yom_hashoah', 'Yom HaShoah'], ['yom_haatzmaut', "Yom Ha'atzmaut"],
  ['lag_baomer', 'Lag BaOmer'], ['shavuot', 'Shavuot'], ['tisha_bav', "Tisha B'Av"],
];
export const HOL_LABEL = Object.fromEntries(HOLIDAYS);
export const AUD_LABEL = {
  grads: 'Grad students', women: 'Women', men: 'Men', freshmen: 'Freshmen', seniors: 'Seniors', greek: 'Greek life', israelis: 'Israelis',
  parents: 'Parents and alumni', faculty: 'Faculty and staff', athletes: 'Athletes', community: 'Community and families',
};
const timesRun = (p) => (p.n === 0 ? 'not held yet' : p.n === 1 ? 'ran once' : `ran ${p.n.toLocaleString()} times`);

// A lift never travels without its evidence: the number of scored runs sits beside it and wraps with it.
const Scored = ({ p }) => <span className="inline-flex items-center gap-x-2 whitespace-nowrap"><Lift value={p.adj} size="sm" /><span className="z-muted">{plural(p.scored, 'scored run')}</span></span>;

// The sign-up system crops every banner to 3:2, so the tile is 3:2 and nothing is cut off. Same loading and error
// handling as Flyer in bits.jsx, but a missing or broken image falls back to a tile that carries the event name.
export function FlyerTile({ src, name, className = '', style, eager }) {
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [src]);
  if (!src || !ok) {
    return (
      <div className={`z-flyer ${className}`} style={{ aspectRatio: '3 / 2', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '8%', ...style }} aria-hidden="true">
        <span className="z-display z-clamp3" style={{ color: 'var(--grey)', fontSize: 'clamp(0.95rem, 1.5vw, 1.15rem)', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{name}</span>
      </div>
    );
  }
  return <img src={src} alt={`Flyer for ${name}`} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setOk(false)} className={`z-flyer ${className}`} style={{ aspectRatio: '3 / 2', ...style }} />;
}

// One program as a flyer card: flyer, name, center, type, how often it ran, lift (with its evidence) and sign-ups.
export function LibCard({ p, hideCenter }) {
  if (!p) return null;
  return (
    <Link to={`/program/${p.key}`} className="block group min-w-0">
      <FlyerTile src={p.img} name={p.name} />
      <div className="mt-2.5 min-w-0">
        <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22, overflowWrap: 'anywhere' }}>{p.name}</p>
        {!hideCenter && <p className="z-small z-muted truncate mt-0.5">{centerLabel(p.center)}</p>}
        <p className="z-small z-muted truncate">{p.typeLabel}, {timesRun(p)}</p>
        <p className="z-small mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {p.adj != null && <Scored p={p} />}
          {p.reg != null && <span className="z-muted">{Math.round(p.reg)} sign-ups{p.n > 1 ? ' typical' : ''}</span>}
          {p.reg == null && p.n > 0 && <span className="z-muted">No sign-ups recorded</span>}
        </p>
      </div>
    </Link>
  );
}

// ---- the page

const PAGE = 36;
const MIN_PILL = 10;         // a holiday or audience needs this many programs to get a pill
const DEFAULTS = { time: 'all', view: 'flyers' };   // not written to the URL
const FLYER_PUSH = 0.05;     // added to a match's score in the flyer grid when it has a flyer
const WORDS_ONLY = 0.3;      // the wording match a name needs when the meaning search did not answer
const EXAMPLES = ['sushi', 'welcome back bbq', 'purim party', 'mezuzah', 'something for freshmen', 'study break during finals'];

function useLazy(name, on) {
  const [s, set] = useState({ data: null, error: null });
  useEffect(() => {
    if (!on || s.data) return undefined;
    let live = true;
    load(name).then((data) => live && set({ data, error: null }), (error) => live && set({ data: null, error }));
    return () => { live = false; };
  }, [name, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

const Pill = ({ on, onClick, children }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className="z-pill flex-none" style={{ height: '2.1rem', padding: '0 0.9rem', fontSize: '0.88rem', cursor: 'pointer', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)' }}>{children}</button>
);

// A labelled group of pills. On a phone the group scrolls sideways (to the screen edge); on a wide screen it wraps.
function PillRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 items-start">
      <span className="z-small font-semibold z-muted md:pt-2">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible z-scroll -mx-5 px-5 md:mx-0 md:px-0 pb-1 md:pb-0" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function excerpt(text, i, name) {
  const same = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const s = (text.short[i] || '').trim();
  if (s && !same(s)) return s;
  const d = (text.desc[i] || '').trim();
  if (!d || same(d)) return null;
  return d.length > 240 ? `${d.slice(0, 240).replace(/\s+\S*$/, '')}…` : d;
}

function CopyRow({ p, text }) {
  const ex = excerpt(text, p.i, p.name);
  return (
    <Link to={`/program/${p.key}`} className="z-card flex flex-col group">
      <h3 className="z-h3 group-hover:underline decoration-2 underline-offset-2" style={{ overflowWrap: 'anywhere' }}>{p.name}</h3>
      <p className="mt-2.5 flex-1" style={{ lineHeight: 1.5, color: ex ? undefined : 'var(--grey)', overflowWrap: 'anywhere' }}>{ex || 'No description was posted beyond the name.'}</p>
      <p className="z-small mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{centerLabel(p.center)}</span>
        <span className="z-muted">{p.typeLabel}, {timesRun(p)}</span>
        {p.reg != null && <span className="z-muted">{Math.round(p.reg)} sign-ups{p.n > 1 ? ' typical' : ''}</span>}
        {p.adj != null && <Scored p={p} />}
      </p>
    </Link>
  );
}

export default function Library() {
  const { data, error } = useData('catalog');
  const [sp, setSp] = useSearchParams();
  const q = (sp.get('q') || '').trim();
  const type = sp.get('type') || '', hol = sp.get('hol') || '', aud = sp.get('aud') || '';
  const flyer = sp.get('flyer') === '1', good = sp.get('good') === '1';
  const time = ['year', '2y'].includes(sp.get('time')) ? sp.get('time') : 'all';
  const view = sp.get('view') === 'copy' ? 'copy' : 'flyers';
  const set = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => { if (!v || v === DEFAULTS[k]) next.delete(k); else next.set(k, v === true ? '1' : v); });
    setSp(next, { replace: true, preventScrollReset: true });
  };

  // The box is local state. It reaches the URL (and the search) on submit, or 600 ms after the last keystroke.
  const [box, setBox] = useState(q);
  const slow = useDebounced(box, 600);
  useEffect(() => { setBox((b) => (b.trim() === q ? b : q)); }, [q]);
  useEffect(() => { if (slow === box && slow.trim() !== q) set({ q: slow.trim() }); }, [slow]); // eslint-disable-line react-hooks/exhaustive-deps

  // One embed call per query, never two inside 600 ms. If the embed service fails, name matching still answers.
  const [found, setFound] = useState(null);       // { q, score, match, semantic }
  const [busy, setBusy] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const lastCall = useRef(0);
  useEffect(() => {
    if (q.length < 2) { setFound(null); setBusy(false); setSearchErr(null); return undefined; }
    let live = true;
    setBusy(true);
    const timer = setTimeout(async () => {
      lastCall.current = Date.now();
      try {
        const ix = await searchIndex();
        const words = wordingMatch(ix, q);
        let sims = null, err = null;
        try { sims = scoreAll(ix, await embed(q)); } catch (e) { err = e; }
        if (!live) return;
        // score orders the results: the cosine blended with the wording match (search.js). A match is a program
        // related in meaning (cosine of 0.45 or more), or one the wording carries over the line.
        const score = new Float32Array(ix.n), match = new Uint8Array(ix.n);
        for (let i = 0; i < ix.n; i++) { score[i] = sims ? blend(sims[i], words[i]) : words[i]; match[i] = sims ? isMatch(sims[i], words[i]) : words[i] >= WORDS_ONLY; }
        setFound({ q, score, match, semantic: !!sims }); setSearchErr(err);
      } catch (e) { if (live) { setFound(null); setSearchErr(e); } }
      if (live) setBusy(false);
    }, Math.max(0, 600 - (Date.now() - lastCall.current)));
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const cat = data ? data[0] : null;
  const today = useMemo(() => (cat ? cat.dayOf(new Date()) : 0), [cat]);

  // Which pills to offer: only values that some program has.
  const options = useMemo(() => {
    if (!cat) return null;
    const P = cat.programs, tc = new Map(), hc = new Map(), ac = new Map();
    for (let i = 0; i < cat.count; i++) {
      tc.set(P.t[i], (tc.get(P.t[i]) || 0) + 1);
      if (P.hol[i]) hc.set(P.hol[i], (hc.get(P.hol[i]) || 0) + 1);
      if (P.aud[i]) P.aud[i].forEach((a) => ac.set(a, (ac.get(a) || 0) + 1));
    }
    return {
      types: cat.event_types.map((k) => [k, cat.types[k], tc.get(cat.type_keys.indexOf(k)) || 0]).filter((t) => t[2] > 0).sort((a, b) => b[2] - a[2]),
      hols: HOLIDAYS.filter(([k]) => hc.get(k) >= MIN_PILL || k === hol),
      auds: [...ac.entries()].filter(([k, n]) => n >= MIN_PILL || k === aud).sort((a, b) => b[1] - a[1]).map(([k]) => [k, AUD_LABEL[k] || k]),
      flyers: P.img.reduce((s, x) => s + (x ? 1 : 0), 0),
    };
  }, [cat, hol, aud]);

  // Default order with nothing typed: flyers first, then lift against the center's own normal, pulled toward
  // normal when it rests on one or two runs, and halved for every year since the program last ran.
  const browse = useMemo(() => {
    if (!cat) return null;
    const P = cat.programs, s = new Float32Array(cat.count);
    for (let i = 0; i < cat.count; i++) {
      const recency = 0.5 ** (Math.max(0, today - P.last[i]) / 365);
      const lift = P.adj[i] == null ? 0.7 : 1 + (Math.min(2.5, Math.max(0.4, P.adj[i] / 100)) - 1) * (P.ns[i] / (P.ns[i] + 1));
      s[i] = recency * lift + (P.img[i] ? 10 : 0);
    }
    return s;
  }, [cat, today]);

  const searching = !!found && q.length >= 2;
  const list = useMemo(() => {
    if (!cat) return null;
    const P = cat.programs, tIdx = type ? cat.type_keys.indexOf(type) : -1;
    const since = time === 'year' ? cat.dayOf(new Date(new Date().getFullYear(), 0, 1)) : time === '2y' ? today - 730 : null;
    const idx = [];
    for (let i = 0; i < cat.count; i++) {
      if (tIdx >= 0 && P.t[i] !== tIdx) continue;
      if (hol && P.hol[i] !== hol) continue;
      if (aud && !(P.aud[i] && P.aud[i].includes(aud))) continue;
      if (flyer && !P.img[i]) continue;
      if (good && !(P.adj[i] != null && P.adj[i] >= 115 && P.ns[i] >= 2)) continue;
      if (since != null && P.last[i] < since) continue;
      idx.push(i);
    }
    if (!searching) return { ids: idx.sort((a, b) => browse[b] - browse[a]), near: false, pool: idx.length };
    // In the flyer grid a match with a flyer gets a small push up the order (it never adds or removes a match).
    // In the copy list closeness alone decides.
    const s = found.score, push = view === 'flyers' ? FLYER_PUSH : 0, key = (i) => s[i] + (P.img[i] ? push : 0);
    const hits = idx.filter((i) => found.match[i]).sort((a, b) => key(b) - key(a));
    if (hits.length) return { ids: hits, near: false, pool: idx.length };
    return { ids: idx.sort((a, b) => s[b] - s[a]).slice(0, 12), near: true, pool: idx.length };
  }, [cat, browse, found, searching, type, hol, aud, flyer, good, time, today, view]);

  const sig = [q, type, hol, aud, flyer, good, time].join('|');
  const [more, setMore] = useState({ sig, n: PAGE });
  const shown = more.sig === sig ? more.n : PAGE;
  const text = useLazy('text.json', view === 'copy');

  if (error) return <ErrorNote error={error} what="The library" />;
  if (!cat) return <Loading rows={3} h={160} />;

  const filtered = !!(type || hol || aud || flyer || good || time !== 'all');
  const stale = busy || (q.length >= 2 && found && found.q !== q);
  const ids = list.ids, page = ids.slice(0, shown), left = ids.length - page.length;
  const submit = (e) => { e.preventDefault(); set({ q: box.trim() }); };
  const pick = (k, v, cur) => set({ [k]: cur === v ? '' : v });
  const count = !ids.length ? `No programs ${searching ? 'fit that search' : ''}${filtered ? ' with these filters' : ''}.`.replace('  ', ' ').replace(' .', '.')
    : searching
    ? (list.near ? `Nothing close to "${found.q}"${filtered ? ' with these filters' : ''}. These are the ${ids.length} nearest programs, and they may not be related.`
      : `${plural(ids.length, 'program')} ${ids.length === 1 ? 'matches' : 'match'} "${found.q}"${filtered ? ' with these filters' : ''}. ${view === 'flyers' && !flyer ? 'Closest first, with a small push for programs that have a flyer.' : 'Closest first.'}`)
    : `${plural(ids.length, 'program')}${filtered ? ' with these filters' : ''}. ${flyer ? 'Ordered' : 'Flyers first, then ordered'} by lift over each center's own normal, with recent programs weighted up and single runs weighted down.`;

  return (
    <div>
      <PageHead title="Flyer and copy library" lede={`See how other centers package an event: the flyer, the name and the wording. ${cat.count.toLocaleString()} programs from ${cat.centers.length} centers, ${options.flyers.toLocaleString()} of them with a flyer. Search reads meaning as well as wording, so "barbecue" also finds a BBQ.`} />

      <form onSubmit={submit} role="search" className="mt-9 flex items-stretch gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search size={22} aria-hidden="true" className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: '1.25rem', color: 'var(--grey)' }} />
          <input type="search" enterKeyHint="search" aria-label="Search programs by idea, name or wording" placeholder="Describe an event" value={box} onChange={(e) => setBox(e.target.value)} className="z-input [&::-webkit-search-cancel-button]:hidden" style={{ height: '4rem', borderRadius: 999, paddingLeft: '3.4rem', paddingRight: box ? '3.2rem' : '1.25rem', fontSize: '1.2rem', fontWeight: 600 }} />
          {box && <button type="button" aria-label="Clear the search" onClick={() => { setBox(''); set({ q: '' }); }} className="absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center hover:bg-[var(--fog-2)]" style={{ right: '0.8rem', width: 36, height: 36, borderRadius: 99 }}><X size={18} aria-hidden="true" /></button>}
        </div>
        <button type="submit" className="z-btn z-btn-go flex-none" style={{ height: '4rem', padding: '0 1.7rem' }}><Search size={20} aria-hidden="true" className="sm:hidden" /><span className="sr-only sm:not-sr-only">Search</span></button>
      </form>
      {!q && (
        <p className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-2 z-small">
          <span className="z-muted">Try</span>
          {EXAMPLES.map((x) => <button key={x} type="button" className="z-link" onClick={() => { setBox(x); set({ q: x }); }}>{x}</button>)}
        </p>
      )}

      <div className="mt-8 space-y-3.5">
        <PillRow label="Show">
          <Pill on={flyer} onClick={() => set({ flyer: !flyer })}>Has a flyer</Pill>
          <Pill on={good} onClick={() => set({ good: !good })}>Did better than normal</Pill>
          <span aria-hidden="true" className="flex-none self-center" style={{ width: 1, height: '1.3rem', background: 'var(--mist)', margin: '0 0.35rem' }} />
          {[['all', 'Any time'], ['year', 'This year'], ['2y', 'Last two years']].map(([k, l]) => <Pill key={k} on={time === k} onClick={() => set({ time: k })}>{l}</Pill>)}
        </PillRow>
        <PillRow label="Type">
          <Pill on={!type} onClick={() => set({ type: '' })}>All</Pill>
          {options.types.map(([k, l]) => <Pill key={k} on={type === k} onClick={() => pick('type', k, type)}>{l}</Pill>)}
        </PillRow>
        <PillRow label="Holiday">
          <Pill on={!hol} onClick={() => set({ hol: '' })}>Any</Pill>
          {options.hols.map(([k, l]) => <Pill key={k} on={hol === k} onClick={() => pick('hol', k, hol)}>{l}</Pill>)}
        </PillRow>
        <PillRow label="For">
          <Pill on={!aud} onClick={() => set({ aud: '' })}>Anyone</Pill>
          {options.auds.map(([k, l]) => <Pill key={k} on={aud === k} onClick={() => pick('aud', k, aud)}>{l}</Pill>)}
        </PillRow>
        {good && <p className="z-small z-muted" style={{ lineHeight: 1.45 }}>"Did better than normal" keeps programs at least 15% above their own center's normal across two or more scored runs. A single good night does not count.</p>}
      </div>

      <section className="mt-10" aria-labelledby="res-h">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-6">
          <div className="min-w-0">
            <h2 id="res-h" className="z-h2">{searching ? 'Matches' : filtered ? 'Filtered programs' : view === 'copy' ? 'Recent programs that did well' : 'Recent flyers that did well'}</h2>
            <p className="mt-2 z-muted max-w-[68ch]" style={{ lineHeight: 1.45 }} aria-live="polite">{stale ? 'Searching…' : count}</p>
          </div>
          <div className="flex items-center gap-2.5">
            {(filtered || q) && <button type="button" className="z-btn z-btn-soft z-btn-sm" onClick={() => { setBox(''); setSp(view === 'copy' ? { view } : {}, { replace: true, preventScrollReset: true }); }}>Clear all</button>}
            <Seg value={view} onChange={(v) => set({ view: v })} label="Show results as" options={[['flyers', 'Flyers'], ['copy', 'Copy']]} />
          </div>
        </div>
        {searchErr && <p className="z-note mb-6" role="status">{found ? `Search by meaning did not answer (${searchErr.message}). These results match on the words in the name only.` : `The search did not run: ${searchErr.message}.`}</p>}

        <div style={{ opacity: stale ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
          {!ids.length ? <Empty>No program fits {q ? 'that search with ' : ''}these filters. Remove a filter or widen the time range.</Empty>
            : view === 'copy'
              ? (text.error ? <ErrorNote error={text.error} what="The descriptions" />
                : !text.data ? <Loading rows={3} h={150} />
                  : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{page.map((i) => <CopyRow key={i} p={cat.prog(i)} text={text.data} />)}</div>)
              : <FlyerGrid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{page.map((i) => <LibCard key={i} p={cat.prog(i)} />)}</FlyerGrid>}
        </div>

        {left > 0 && (
          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="z-btn z-btn-soft" onClick={() => setMore({ sig, n: shown + PAGE })}>Show {Math.min(PAGE, left)} more</button>
            <span className="z-small z-muted">Showing {page.length.toLocaleString()} of {ids.length.toLocaleString()}</span>
          </div>
        )}
      </section>
    </div>
  );
}
