import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import { useData, useMyCenter, plural } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Seg, tip, hideTip } from '../components/bits';

// Centers are grouped by what they do (engine/categories.py): a band on each of eight measures, with the cut
// points written down. Every label, rule and count on this page is read from centers.json; the page only looks
// things up, filters and sorts.
const title = (c) => c.campus || c.name;
const num = (v) => Math.round(v).toLocaleString();
const one = (v) => (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => `${Math.round(v * 100)}%`;
// The share a center draws is cut at 3% and 8%, so small shares keep one decimal. A whole number would put
// 2.8% in the "under 3%" band while printing "3%".
const sharePct = (v) => (v < 0.0995 ? `${(v * 100).toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(v * 100)}%`);
const lowerFirst = (s) => (/^(Shabbat|Jewish)/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
// A percentile (an event's place among all of its own center's events, 0 to 1) in words. Never shown as a bare number.
const place = (p) => (p >= 0.9 ? 'top 10%' : p >= 0.8 ? 'top fifth' : p >= 0.67 ? 'top third' : p > 0.6 ? 'just above the middle' : p >= 0.4 ? 'around the middle' : p > 0.33 ? 'just below the middle' : p > 0.2 ? 'bottom third' : 'bottom fifth');
// Where two readings sit side by side (this band against the network) the exact place is easier to compare:
// "top 22%" for bigger than 78% of a center's own events. Below the upper part the words are enough.
const topOf = (p) => (p >= 0.6 ? `top ${Math.max(1, Math.round((1 - p) * 100))}%` : place(p));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// The typical numbers on a band's card, in the order they are shown.
const TYPICAL = [
  ['typical', num, 'sign-ups at a typical event'],
  ['biggest', num, 'sign-ups at its biggest events'],
  ['pace', one, 'events a week'],
  ['jewish', num, 'Jewish students served'],
  ['share', sharePct, 'of them at its biggest events'],
];
// The "what does well here" label, short enough for a table cell.
const STRENGTH_SHORT = { meals: 'Shabbat and holiday meals', holidays: 'Holiday events', programs: 'Classes, socials, food', even: 'Nothing stands out' };
const WHY_NULL = {
  top5: 'Fewer than five events with sign-ups in the last three years',
  typical: 'Fewer than five events with sign-ups',
  pace: 'Fewer than 8 events in the last twelve months',
  jewish: 'No count listed in the Chabad on Campus directory',
  share: 'Needs a Jewish student count and five events with sign-ups',
  strength: 'Fewer than 40 scored events in three years',
};
const RARE = 'Sign-ups are too rare at this center for this to be a fair read';

function lookups(facets) {
  const label = {}, def = {};
  facets.forEach((f) => { label[f.key] = {}; def[f.key] = {}; f.values.forEach((v) => { label[f.key][v.key] = v.label; def[f.key][v.key] = v.def; }); });
  return { label, def };
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// A missing number: a short grey rule with the reason on hover, so an empty cell is never mistaken for zero.
const Dash = ({ why }) => <span role="img" aria-label={`Not known. ${why}`} title={why} style={{ display: 'inline-block', width: 14, height: 2, borderRadius: 2, background: '#B9BEC7', verticalAlign: 'middle' }} />;

function Members({ ids, cat, mine, onWhite }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {ids.map((id) => { const c = cat.centerById.get(id); if (!c) return null; const me = id === mine; return (
        <li key={id} className="min-w-0 max-w-full">
          <Link to={`/center/${id}`} title={c.name} className="z-pill max-w-full hover:underline" style={{ background: me ? 'var(--go)' : onWhite ? 'var(--fog)' : '#fff', color: me ? '#fff' : 'var(--ink)', fontWeight: 600, height: '1.7rem', padding: '0 0.65rem', fontSize: '0.8rem' }}>
            <span className="truncate">{title(c)}</span>
          </Link>
        </li>); })}
    </ul>
  );
}

// One band of the chosen measure: the rule, what is typical there, which ideas set it apart, and who is in it.
function BandCard({ v, cat, ideas, mine, hasWorks }) {
  const [all, setAll] = useState(false);
  const here = mine != null && v.centers.includes(mine);
  const typical = TYPICAL.filter(([k]) => v.stats && v.stats[k] != null);
  const thin = v.n_readable < 5;
  const first = v.centers.slice(0, 12);
  const members = all ? v.centers : here && !first.includes(mine) ? [...first, mine] : first;
  const moreCommon = v.ideas.filter((x) => ideas[x.idea]).slice(0, 5);
  const works = (v.works || []).filter((x) => ideas[x.idea]).slice(0, 5);
  return (
    <div className="z-card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="z-h3 min-w-0" style={{ maxWidth: '24ch' }}>{v.label}</h3>
        <span className="z-pill" style={{ background: '#fff' }}>{plural(v.n, 'center')}</span>
      </div>
      <p className="mt-2.5 z-muted" style={{ lineHeight: 1.45 }}>{v.def}</p>
      {here && <p className="mt-3"><span className="z-pill" style={{ background: 'var(--go)', color: '#fff' }}>Your center is here</span></p>}

      {typical.length > 0 && (
        <>
          <dl className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-5">
            {typical.map(([k, fmt, l]) => (
              <div key={k} className="min-w-0"><dd className="z-num" style={{ fontSize: '1.6rem' }}>{fmt(v.stats[k])}</dd><dt className="z-muted mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>{l}</dt></div>
            ))}
          </dl>
          {(thin || v.n_readable < v.n) && <p className="z-small z-muted mt-3">{thin ? `Only ${plural(v.n_readable, 'center')} here ${v.n_readable === 1 ? 'has' : 'have'} enough events to read, so take these loosely.` : `Typical numbers come from the ${v.n_readable} of ${v.n} with enough events to read.`}</p>}
        </>
      )}

      <div className="mt-7">
        <h4 className="font-bold">More common here than elsewhere</h4>
        {moreCommon.length ? (
          <ul className="mt-2">
            {moreCommon.map((x) => (
              <li key={x.idea} className="py-2 sm:flex sm:items-baseline sm:justify-between sm:gap-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
                <Link to={`/idea/${x.idea}`} className="font-semibold truncate block hover:underline decoration-2 underline-offset-2">{ideas[x.idea].label}</Link>
                <span className="z-small z-muted whitespace-nowrap block">{pct(x.share)} here, {pct(x.elsewhere)} elsewhere</span>
              </li>
            ))}
          </ul>
        ) : <p className="z-small z-muted mt-2" style={{ lineHeight: 1.45 }}>{thin ? 'Too few centers here to compare ideas.' : 'No idea is clearly more common here than at other centers.'}</p>}
      </div>

      {hasWorks && (
        <div className="mt-6">
          <h4 className="font-bold">Lands high here</h4>
          {works.length ? (
            <ul className="mt-2">
              {works.map((x) => (
                <li key={x.idea} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center" style={{ borderTop: '1px solid var(--fog-2)' }}
                  {...tip([ideas[x.idea].label, `Here: bigger than ${pct(x.pct)} of a center's own events`, `Across the network: bigger than ${pct(x.overall)}`, `${plural(x.runs, 'run')} at ${plural(x.centers, 'center')} in this band`])}>
                  <div className="min-w-0">
                    <Link to={`/idea/${x.idea}`} className="font-semibold truncate block hover:underline decoration-2 underline-offset-2">{ideas[x.idea].label}</Link>
                    <span className="z-small z-muted block">{plural(x.runs, 'run')} at {plural(x.centers, 'center')}. Across the network: {topOf(x.overall)}</span>
                  </div>
                  <span className="z-small font-bold whitespace-nowrap text-right">{cap(topOf(x.pct))}<span className="z-muted font-normal block">of their events</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="z-small z-muted mt-2" style={{ lineHeight: 1.45 }}>{thin ? 'Too few centers here to say.' : 'No idea has been run and measured at four or more centers here and landed high.'}</p>}
        </div>
      )}

      <div className="mt-auto pt-7">
        <h4 className="font-bold">The centers<span className="z-small z-muted font-normal">, biggest events first</span></h4>
        <Members ids={members} cat={cat} mine={mine} />
        {!all && v.centers.length > members.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-4" style={{ background: '#fff' }} onClick={() => setAll(true)}>Show all {v.centers.length}</button>}
      </div>
    </div>
  );
}

// The "not enough data" band of a measure. Listed so nobody is missing, kept visually quiet.
function UnknownCard({ v, cat, mine }) {
  const [all, setAll] = useState(false);
  const here = mine != null && v.centers.includes(mine);
  const first = v.centers.slice(0, 12);
  const members = all ? v.centers : here && !first.includes(mine) ? [...first, mine] : first;
  return (
    <div className="mt-4 p-6" style={{ border: '1px solid var(--mist)', borderRadius: 'var(--r-lg)' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold">{v.label}</h3>
        <span className="z-small z-muted">{plural(v.n, 'center')}. {v.def}</span>
      </div>
      {here && <p className="mt-3"><span className="z-pill" style={{ background: 'var(--go)', color: '#fff' }}>Your center is here</span></p>}
      <Members ids={members} cat={cat} mine={mine} onWhite />
      {!all && v.centers.length > members.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-4" onClick={() => setAll(true)}>Show all {v.centers.length}</button>}
    </div>
  );
}

// Biggest events by events a week: counts of centers, tinted in one hue by count. A cell filters the directory.
// The two "cannot tell" bands sit last and stay grey, so they never set the scale.
function CrossTab({ facets, rows, cross, onPick }) {
  const S = facets.find((f) => f.key === 'size'), P = facets.find((f) => f.key === 'pace');
  const counts = useMemo(() => {
    const m = {};
    rows.forEach((r) => { const s = r.cat.size, p = r.cat.pace; m[s] = m[s] || {}; m[s][p] = (m[s][p] || 0) + 1; });
    return m;
  }, [rows]);
  const max = Math.max(1, ...S.values.filter((s) => s.key !== 'unknown').flatMap((s) => P.values.filter((p) => p.key !== 'unknown').map((p) => (counts[s.key] || {})[p.key] || 0)));
  const quiet = (k) => k === 'unknown';
  return (
    <>
      <div className="overflow-x-auto z-scroll relative">
        <table className="w-full" style={{ minWidth: 560, borderCollapse: 'separate', borderSpacing: 4, margin: -4 }}>
          <thead>
            <tr>
              <td />
              <th scope="colgroup" colSpan={P.values.length} className="z-small z-muted font-semibold text-left" style={{ padding: '0 0.2rem 0.1rem' }}>Events a week</th>
              <td />
            </tr>
            <tr>
              <th scope="col" className="text-left z-small z-muted font-semibold" style={{ padding: '0 0.5rem 0.4rem 0' }}>Biggest events</th>
              {P.values.map((p) => <th key={p.key} scope="col" className="z-small font-semibold" style={{ padding: '0 0.2rem 0.4rem', width: '14%', lineHeight: 1.25, color: quiet(p.key) ? 'var(--grey)' : 'var(--ink)' }}>{p.label}</th>)}
              <th scope="col" className="z-small z-muted font-semibold text-right" style={{ padding: '0 0 0.4rem 0.6rem', width: '8%' }}>All</th>
            </tr>
          </thead>
          <tbody>
            {S.values.map((s) => (
              <tr key={s.key}>
                <th scope="row" className="text-left font-semibold" style={{ padding: '0.3rem 0.8rem 0.3rem 0', lineHeight: 1.25, fontSize: '0.95rem', color: quiet(s.key) ? 'var(--grey)' : 'var(--ink)' }}>{s.label}{!quiet(s.key) && <span className="z-muted font-normal"> sign-ups</span>}</th>
                {P.values.map((p) => {
                  const n = (counts[s.key] || {})[p.key] || 0, on = cross && cross.s === s.key && cross.p === p.key, grey = quiet(s.key) || quiet(p.key);
                  if (!n) return <td key={p.key} aria-label="No centers" style={{ height: 44, borderRadius: 10, border: '1px dotted #B9BEC7' }} />;
                  return (
                    <td key={p.key} style={{ padding: 0 }}>
                      <button type="button" aria-pressed={!!on} aria-label={`Biggest events: ${s.label}. Events a week: ${p.label}. ${plural(n, 'center')}. Show them in the list.`} onClick={() => onPick(on ? null : { s: s.key, p: p.key })}
                        className="w-full font-bold tabular-nums" style={{ height: 44, borderRadius: 10, cursor: 'pointer', background: grey ? 'var(--fog-2)' : `rgba(30, 59, 255, ${(0.07 + 0.4 * (n / max)).toFixed(3)})`, color: grey ? 'var(--grey)' : 'var(--ink)', outline: on ? '3px solid var(--ink)' : 'none', outlineOffset: -3 }}
                        {...tip([`Biggest events: ${lowerFirst(s.label)}`, `Events a week: ${lowerFirst(p.label)}`, plural(n, 'center')])}>{n}</button>
                    </td>
                  );
                })}
                <td className="text-right z-muted tabular-nums font-semibold" style={{ paddingLeft: '0.6rem' }}>{s.n}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="text-left z-small z-muted font-semibold" style={{ paddingTop: '0.4rem' }}>All</th>
              {P.values.map((p) => <td key={p.key} className="text-center z-muted tabular-nums font-semibold" style={{ paddingTop: '0.4rem' }}>{p.n}</td>)}
              <td className="text-right z-muted tabular-nums font-semibold" style={{ paddingTop: '0.4rem', paddingLeft: '0.6rem' }}>{rows.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 z-small z-muted">
        <span className="sm:hidden w-full">Scroll sideways to see every column.</span>
        <span className="inline-flex items-center gap-2">Fewer
          <span className="inline-flex gap-1" aria-hidden="true">{[0.1, 0.4, 0.7, 1].map((a) => <span key={a} style={{ width: 22, height: 14, borderRadius: 4, background: `rgba(30, 59, 255, ${0.07 + 0.4 * a})` }} />)}</span>
          More centers</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 22, height: 14, borderRadius: 4, background: 'var(--fog-2)' }} />Not enough data to place</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 22, height: 14, borderRadius: 4, border: '1px dotted #B9BEC7' }} />No center</span>
      </div>
    </>
  );
}

// Every well-measured center at its place in the 2-D layout. One hue: ink for everyone, blue for the highlighted
// band. Hovering a dot draws lines to that center's nearest centers.
function CenterMap({ pts, facetKey, hi, mine }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  useEffect(() => hideTip, []);
  const small = w < 560;
  const h = small ? Math.round(w * 1.08) : Math.round(Math.min(620, w * 0.5));
  const pad = small ? 18 : 26;
  const maxJ = Math.max(1, ...pts.map((p) => p.j || 0));
  const rOf = (p) => (small ? 3.5 : 5) + (small ? 8 : 13) * Math.sqrt((p.j || 0) / maxJ);
  const X = (p) => pad + p.xy[0] * (w - 2 * pad), Y = (p) => pad + (1 - p.xy[1]) * (h - 2 * pad);
  const byId = useMemo(() => new Map(pts.map((p) => [p.c.id, p])), [pts]);
  const hp = hover != null ? byId.get(hover) : null;
  const nearSet = hp ? new Set(hp.near.map((x) => x.id)) : null;
  const me = mine != null ? byId.get(mine) : null;
  const lines = (p) => [title(p.c), p.c.name, `Biggest events: ${p.st.top5 != null ? `${num(p.st.top5)} sign-ups` : 'not known'}`, `Events a week: ${p.st.pace != null ? one(p.st.pace) : 'not known'}`];
  return (
    <div ref={ref} className="z-card" style={{ padding: 0, overflow: 'hidden' }}>
      {w > 0 && (
        <svg width={w} height={h} role="group" aria-label={`Picture of ${pts.length} centers. Each dot links to a center.`} style={{ display: 'block' }}>
          {hp && hp.near.map((x) => { const q = byId.get(x.id); return q ? <line key={x.id} x1={X(hp)} y1={Y(hp)} x2={X(q)} y2={Y(q)} stroke="var(--ink)" strokeWidth="1" opacity="0.4" /> : null; })}
          {pts.map((p) => {
            const on = !!hi && p.cat[facetKey] === hi, isHover = hover === p.c.id, isNear = nearSet?.has(p.c.id);
            const op = isHover || isNear ? 1 : on ? 0.9 : hi ? 0.14 : hp ? 0.16 : 0.3;
            return <circle key={p.c.id} cx={X(p)} cy={Y(p)} r={rOf(p)} fill={on ? 'var(--go)' : 'var(--ink)'} opacity={op} stroke={on || isHover || isNear ? '#fff' : 'none'} strokeWidth="1.5" />;
          })}
          {me && <circle cx={X(me)} cy={Y(me)} r={rOf(me) + 5} fill="none" stroke="var(--ink)" strokeWidth="2.5" />}
          {me && <text x={X(me) + (X(me) > w - 150 ? -(rOf(me) + 10) : rOf(me) + 10)} y={Y(me) + 4} textAnchor={X(me) > w - 150 ? 'end' : 'start'} fontSize="13" fontWeight="700" fill="var(--ink)" stroke="var(--fog)" strokeWidth="4" paintOrder="stroke">Your center</text>}
          {pts.map((p) => {
            const t = tip(lines(p));
            return (
              <Link key={p.c.id} to={`/center/${p.c.id}`} aria-label={`${title(p.c)}, ${p.c.name}. ${lines(p).slice(2).join('. ')}`} onClick={hideTip}
                onMouseMove={t.onMouseMove} onMouseEnter={() => setHover(p.c.id)} onMouseLeave={() => { t.onMouseLeave(); setHover(null); }}
                onFocus={(e) => { t.onFocus(e); setHover(p.c.id); }} onBlur={() => { t.onBlur(); setHover(null); }}>
                <circle cx={X(p)} cy={Y(p)} r={Math.max(10, rOf(p) + 2)} fill="transparent" style={{ cursor: 'pointer' }} />
              </Link>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// The clump test, reported as it came out: no blended groups, and why.
function Structure({ st, example }) {
  const best = st.tests.reduce((a, b) => (b.stability > a.stability ? b : a), st.tests[0]);
  const ks = st.tests.map((t) => t.k);
  return (
    <Section id="groups-h" title="Do centers fall into natural groups?" sub="No. The engine tested for them, and they did not hold.">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4 max-w-[66ch]" style={{ lineHeight: 1.55 }}>
          <p>The engine took the {st.centers} best-measured centers and tried to sort them into {ks.slice(0, -1).join(', ')} and {ks[ks.length - 1]} groups, using every measure together: sign-ups, events a week, Jewish students and which kinds of event do well. Then it drew the same centers again at random and checked whether the same groups came back.</p>
          <p>They did not hold. On a scale where 1 means the same groups every time and 0 means no better than chance, the best result was {best.stability.toFixed(2)}. Groups that shift that much when the sample changes are not real borders, so this page does not hand out blended group labels.</p>
          <p>Two things replace them. Each measure has its own bands, with the rule written on the card. And "which centers are like mine" is answered by nearest neighbors: every center gets its own list of the twelve closest to it, which needs no borders at all.</p>
          {example && <p><Link to={`/center/${example.id}`} className="z-btn z-btn-soft z-btn-sm">{example.mine ? 'See the centers nearest yours' : `See the centers nearest ${title(example.c)}`}<ArrowRight size={16} aria-hidden="true" /></Link></p>}
        </div>
        <div className="z-card">
          <h3 className="font-bold">How well the same groups came back (1 is every time)</h3>
          <ul className="mt-5 space-y-3">
            {st.tests.map((t) => (
              <li key={t.k} className="grid grid-cols-[5.2rem_minmax(0,1fr)_2.6rem] gap-3 items-center" {...tip([`${t.k} groups`, `Agreement between runs: ${pct(t.stability)}`, 'A full bar would be the same groups every time'])} tabIndex={0}>
                <span className="z-small font-semibold">{t.k} groups</span>
                <span style={{ display: 'block', height: 14, background: '#fff', borderRadius: '0 4px 4px 0' }}><span style={{ display: 'block', width: `${Math.max(2, t.stability * 100)}%`, height: '100%', background: 'var(--ink)', borderRadius: '0 4px 4px 0' }} /></span>
                <span className="z-small font-semibold tabular-nums text-right">{pct(t.stability)}</span>
              </li>
            ))}
          </ul>
          <p className="z-small z-muted mt-4" style={{ lineHeight: 1.45 }}>A full bar would mean the same groups every time, and an empty one no better than chance. Each test redrew the centers 20 times.</p>
        </div>
      </div>
    </Section>
  );
}

export default function Centers() {
  const { data, error } = useData('centers.json', 'catalog', 'ideas.json');
  const [mine] = useMyCenter();
  const [params, setParams] = useSearchParams();
  const [hi, setHi] = useState('');
  const [val, setVal] = useState(null);
  const [cross, setCross] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [all, setAll] = useState(false);
  const dirRef = useRef(null);
  const model = useMemo(() => {
    if (!data) return null;
    const [cen, cat] = data;
    const lk = lookups(cen.facets);
    const rows = cat.centers.map((c) => { const prof = cen.profiles[c.id] || {}, st = cen.stats[c.id] || {}; return { c, st, cat: prof.cat || c.cat || {}, j: st.jewish ?? null, xy: prof.xy, near: prof.near || [] }; });
    return { ...lk, rows, pts: rows.filter((r) => r.xy) };
  }, [data]);
  const by = params.get('by');
  useEffect(() => { setHi(''); setVal(null); }, [by]);
  if (error) return <ErrorNote error={error} what="The centers page" />;
  if (!data) return <Loading rows={3} h={220} />;
  const [cen, cat, ideas] = data;
  const { label, rows, pts } = model;
  const facet = cen.facets.find((f) => f.key === by) || cen.facets[0];
  const known = facet.values.filter((v) => v.key !== 'unknown'), unknown = facet.values.find((v) => v.key === 'unknown');
  const hasWorks = facet.values.some((v) => (v.works || []).length > 0);
  // The highlight and the band filter belong to one measure. For the one render before they reset, ignore a stale key.
  const hiKey = hi && facet.values.some((v) => v.key === hi) ? hi : '';
  const valKey = val && facet.values.some((v) => v.key === val) ? val : null;
  const pickFacet = (k) => { const p = new URLSearchParams(params); if (k === cen.facets[0].key) p.delete('by'); else p.set('by', k); setParams(p, { replace: true, preventScrollReset: true }); };
  const pickCross = (x) => { setCross(x); if (x) { setVal(null); setQ(''); requestAnimationFrame(() => dirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } };
  const inPicture = (k) => pts.filter((p) => p.cat[facet.key] === k).length;
  const mineRow = mine != null ? rows.find((r) => r.c.id === mine) : null;
  const exampleRow = (mineRow && mineRow.near.length ? mineRow : null) || [...pts].sort((a, b) => (b.st.scored || 0) - (a.st.scored || 0))[0];
  const example = exampleRow ? { id: exampleRow.c.id, c: exampleRow.c, mine: exampleRow === mineRow } : null;

  const s = q.trim().toLowerCase();
  const key = { draw: (r) => r.st.top5, typical: (r) => r.st.typical, pace: (r) => r.st.pace, jewish: (r) => r.j }[sort];
  const list = rows
    .filter((r) => !s || `${r.c.name} ${r.c.campus} ${r.c.short} ${r.c.city} ${r.c.state} ${r.c.country}`.toLowerCase().includes(s))
    .filter((r) => !valKey || r.cat[facet.key] === valKey)
    .filter((r) => !cross || (r.cat.size === cross.s && r.cat.pace === cross.p))
    .sort((a, b) => (key ? (key(b) ?? -1) - (key(a) ?? -1) : 0) || title(a.c).localeCompare(title(b.c)));
  const filtered = !!(s || valKey || cross);
  const shown = all || filtered ? list : list.slice(0, 30);
  const pill = (on) => ({ height: '2.3rem', padding: '0 1rem', fontSize: '0.9rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  const chip = (on) => ({ height: '2.05rem', padding: '0 0.85rem', fontSize: '0.86rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  // Sign-up numbers from a center that rarely takes sign-ups are printed in grey, with the reason on hover.
  const rare = (r) => r.cat.size === 'unknown';
  const soft = (r, text) => (rare(r) ? <span className="z-muted" title={RARE}>{text}</span> : text);
  const drawCell = (r) => (r.st.top5 == null ? <Dash why={WHY_NULL.top5} /> : soft(r, num(r.st.top5)));
  const typicalCell = (r) => (r.st.typical == null ? <Dash why={WHY_NULL.typical} /> : soft(r, num(r.st.typical)));
  const paceCell = (r) => (r.st.pace == null ? <Dash why={WHY_NULL.pace} /> : one(r.st.pace));
  const jewishCell = (r) => (r.j ? r.j.toLocaleString() : <Dash why={WHY_NULL.jewish} />);
  const shareCell = (r) => (r.st.draw_share == null ? <Dash why={WHY_NULL.share} /> : soft(r, sharePct(r.st.draw_share)));
  const strengthCell = (r) => (!r.cat.strength || r.cat.strength === 'unknown' ? <Dash why={WHY_NULL.strength} /> : r.cat.strength === 'even' ? <span className="z-muted">{STRENGTH_SHORT.even}</span> : (STRENGTH_SHORT[r.cat.strength] || label.strength[r.cat.strength]));
  const mobile = { name: ['Biggest events', drawCell], draw: ['Biggest events', drawCell], typical: ['Typical event', typicalCell], pace: ['Events a week', paceCell], jewish: ['Jewish students', jewishCell] }[sort];

  return (
    <div>
      <PageHead title="Centers" lede={`Centers are grouped by what they do: how many sign up, how often they hold events, how many Jewish students they serve and what share of them come, and which kinds of event do well there. Not by kind of school. ${cen.readable} of ${cen.total} centers have enough events to read.`} />

      <div className="mt-10" role="group" aria-label="Choose a measure">
        <p className="z-small z-muted font-semibold mb-2">Group centers by</p>
        <div className="flex flex-wrap gap-2">
          {cen.facets.map((f) => <button key={f.key} type="button" className="z-pill" style={pill(f.key === facet.key)} aria-pressed={f.key === facet.key} onClick={() => pickFacet(f.key)}>{f.label}</button>)}
        </div>
      </div>

      <Section id="bands-h" tight title={facet.question} sub={facet.basis}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {known.map((v) => <BandCard key={`${facet.key}:${v.key}`} v={v} cat={cat} ideas={ideas} mine={mine} hasWorks={hasWorks} />)}
        </div>
        {unknown && <UnknownCard key={`${facet.key}:unknown`} v={unknown} cat={cat} mine={mine} />}
        <p className="z-small z-muted mt-5 max-w-[72ch]" style={{ lineHeight: 1.5 }}>
          The numbers on a card are medians over its centers that have at least {cen.min_events} events in the last three years. An idea is "more common here" when at least a quarter of these centers have run it and that share is 15 points or more above the rest.
          {hasWorks && ' "Lands high here" places each run of an idea among all of that center\'s own events, smallest to biggest, and averages over the centers in the band. It needs four centers in the band to have run and measured the idea.'}
        </p>
      </Section>

      <Section id="cross-h" title="Biggest events by events a week" sub="How many centers sit at each size, split by how often they hold events. This is the quickest way to find centers of the same size and pace. Press a number to list those centers below.">
        <div className="z-card"><CrossTab facets={cen.facets} rows={rows} cross={cross} onPick={pickCross} /></div>
      </Section>

      <Section id="map-h" title="The picture" sub={`Each dot is one of the ${pts.length} best-measured centers. Nearby dots are alike on draw, pace, Jewish numbers and what does well. Distance is approximate, and left, right, up and down mean nothing by themselves.`}
        action={(
          <label className="z-label" style={{ minWidth: '15rem' }}>Highlight
            <select className="z-input" value={hiKey} onChange={(e) => setHi(e.target.value)} aria-label={`Highlight one band of ${facet.label}`} style={{ borderRadius: 999, padding: '0.6rem 1rem', fontWeight: 600 }}>
              <option value="">Nothing</option>
              {facet.values.filter((v) => inPicture(v.key) > 0).map((v) => <option key={v.key} value={v.key}>{facet.label}: {lowerFirst(v.label)} ({inPicture(v.key)})</option>)}
            </select>
          </label>
        )}>
        <CenterMap pts={pts} facetKey={facet.key} hi={hiKey} mine={mine} />
        <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 z-small z-muted">
          <span className="inline-flex items-center gap-2"><svg width="46" height="24" aria-hidden="true"><circle cx="7" cy="12" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="32" cy="12" r="11" fill="var(--ink)" opacity="0.35" /></svg>Bigger dot, more Jewish students served</span>
          {hiKey && <span className="inline-flex items-center gap-2"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--go)" /></svg>{facet.label}: {lowerFirst(label[facet.key][hiKey])}</span>}
          {mine != null && pts.some((p) => p.c.id === mine) && <span className="inline-flex items-center gap-2"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" strokeWidth="2" /></svg>Your center</span>}
          <span>Point at a dot to see the centers nearest to it. Click or tap it to open the center.</span>
        </div>
        {mine != null && !pts.some((p) => p.c.id === mine) && <p className="z-small z-muted mt-3">Your center is not in the picture. The picture only holds centers with a sign-up read, a pace and at least {cen.min_events} events in the last three years.</p>}
      </Section>

      <Structure st={cen.structure} example={example} />

      <div ref={dirRef} style={{ scrollMarginTop: '5rem' }}>
        <Section id="dir-h" title="Every center" sub={`All ${cen.total} centers. Biggest events is the average sign-ups of a center's five biggest events in the last three years. Typical event is the median event that took sign-ups. Events a week counts the weeks the center was in session.`}
          action={<Seg value={sort} onChange={setSort} label="Sort the list" options={[['name', 'Name'], ['draw', 'Biggest events'], ['typical', 'Typical'], ['pace', 'Events a week'], ['jewish', 'Jewish students']]} />}>
          <label className="z-label" style={{ maxWidth: '28rem' }}><span className="sr-only">Search centers</span>
            <input className="z-input" type="search" placeholder="Search by school, center, city or state" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search centers" />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={`Filter by ${facet.label}`}>
            <span className="z-small z-muted font-semibold mr-1">{facet.label}</span>
            <button type="button" className="z-pill" style={chip(!valKey)} aria-pressed={!valKey} onClick={() => setVal(null)}>All<span style={{ opacity: 0.6 }}>{cen.total}</span></button>
            {facet.values.map((v) => <button key={v.key} type="button" className="z-pill" style={chip(valKey === v.key)} aria-pressed={valKey === v.key} onClick={() => setVal(valKey === v.key ? null : v.key)}>{v.label}<span style={{ opacity: 0.6 }}>{v.n}</span></button>)}
          </div>
          {cross && (
            <p className="mt-3">
              <button type="button" className="z-pill" style={{ ...chip(false), background: 'var(--go-tint)', whiteSpace: 'normal', height: 'auto', minHeight: '2.05rem', textAlign: 'left', lineHeight: 1.25, paddingTop: '0.3rem', paddingBottom: '0.3rem' }} onClick={() => setCross(null)} aria-label="Clear the size and pace filter">
                <span>Biggest events: {lowerFirst(label.size[cross.s])}. Events a week: {lowerFirst(label.pace[cross.p])}</span><X size={15} aria-hidden="true" style={{ flex: 'none' }} />
              </button>
            </p>
          )}
          {list.length ? (
            <div className="mt-5">
              {filtered && <p className="z-small z-muted mb-2">{plural(list.length, 'center')}</p>}
              <table className="z-table" style={{ tableLayout: 'auto' }}>
                <thead><tr>
                  <th scope="col">Center</th>
                  <th scope="col" className="num sm:hidden" style={{ textAlign: 'right', paddingRight: 0, whiteSpace: 'normal' }}>{mobile[0]}</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Biggest events</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Typical event</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Events a week</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Jewish students</th>
                  <th scope="col" className="num hidden md:table-cell" style={{ textAlign: 'right' }}>Share drawn</th>
                  <th scope="col" className="hidden lg:table-cell" style={{ paddingRight: 0 }}>What does well</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => { const { c } = r; return (
                    <tr key={c.id} style={c.id === mine ? { background: 'var(--go-tint)' } : undefined}>
                      <td style={{ maxWidth: '22rem' }}>
                        <Link to={`/center/${c.id}`} className="font-bold hover:underline decoration-2 underline-offset-2">{title(c)}</Link>{c.id === mine && <span className="z-small font-semibold"> (your center)</span>}
                        <span className="z-small z-muted block" style={{ overflowWrap: 'anywhere' }}>{c.name}{c.city ? `, ${c.city}` : ''}{c.state ? `, ${c.state}` : c.country ? `, ${c.country}` : ''}</span>
                      </td>
                      <td className="num sm:hidden" style={{ paddingRight: 0 }}>{mobile[1](r)}</td>
                      <td className="num hidden sm:table-cell">{drawCell(r)}</td>
                      <td className="num hidden sm:table-cell">{typicalCell(r)}</td>
                      <td className="num hidden sm:table-cell">{paceCell(r)}</td>
                      <td className="num hidden sm:table-cell">{jewishCell(r)}</td>
                      <td className="num hidden md:table-cell">{shareCell(r)}</td>
                      <td className="hidden lg:table-cell" style={{ paddingRight: 0 }}>{strengthCell(r)}</td>
                    </tr>); })}
                </tbody>
              </table>
              {!all && !filtered && list.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {list.length} centers</button>}
              <p className="z-small z-muted mt-5 max-w-[72ch]" style={{ lineHeight: 1.5 }}>Jewish students is the count each center's staff entered in the Chabad on Campus directory, added up over every campus the center serves. Share drawn is biggest events divided by that count. A short grey line means the number cannot be worked out, and pointing at it says why. A grey number comes from a center that takes sign-ups too rarely for it to be a fair read.</p>
            </div>
          ) : <div className="mt-5"><Empty>No center matches{s ? ` "${q}"` : ''}{valKey || cross ? ' with these filters' : ''}.</Empty></div>}
        </Section>
      </div>
    </div>
  );
}
