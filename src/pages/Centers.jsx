import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useData, useMyCenter, plural, share, liftShort } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Lift, Seg, tip, hideTip } from '../components/bits';

// Centers are described on seven facets (engine/categories.py). Every label, rule and count on this page is
// read from centers.json; the page only looks things up, filters and sorts.
const title = (c) => c.campus || c.name;
const pct = (v) => `${Math.round(v * 100)}%`;
const num = (v) => Math.round(v).toLocaleString();
const lowerFirst = (s) => (/^(Shabbat|UK|Canadian|Jewish)/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const listWords = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// The typical numbers on a card, in the order they are shown.
const TYPICAL = [
  ['jewish', num, 'Jewish students served'],
  ['reach', num, 'sign-ups at its biggest events'],
  ['volume', num, 'events a year'],
  ['dinner', num, 'sign-ups at a typical Shabbat dinner'],
  ['themed', pct, 'of Shabbat dinners have a theme'],
];
const HAS_WORKS = new Set(['setting', 'jewish', 'reach']);

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

// One answer of the chosen facet: the rule, who is in it, what is typical there and which ideas set it apart.
function ValueCard({ facet, v, cat, ideas, mine }) {
  const [all, setAll] = useState(false);
  const here = mine != null && v.centers.includes(mine);
  const typical = TYPICAL.filter(([k]) => v.stats && v.stats[k] != null);
  const thin = v.n_profiled < 5;
  const first = v.centers.length <= 16 ? v.centers : v.centers.slice(0, 12);
  const members = all ? v.centers : here && !first.includes(mine) ? [...first, mine] : first;
  const moreCommon = v.ideas.filter((x) => ideas[x.idea]).slice(0, 5);
  const works = (v.works || []).filter((x) => ideas[x.idea]).slice(0, 4);
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
          {(thin || v.n_profiled < v.n) && <p className="z-small z-muted mt-3">{thin ? `Only ${plural(v.n_profiled, 'center')} here ${v.n_profiled === 1 ? 'has' : 'have'} enough events to read, so take these loosely.` : `Typical numbers come from the ${v.n_profiled} of ${v.n} with enough events to read.`}</p>}
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

      {HAS_WORKS.has(facet.key) && (
        <div className="mt-6">
          <h4 className="font-bold">Does well here</h4>
          {works.length ? (
            <ul className="mt-2">
              {works.map((x) => (
                <li key={x.idea} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center" style={{ borderTop: '1px solid var(--fog-2)' }}>
                  <div className="min-w-0">
                    <Link to={`/idea/${x.idea}`} className="font-semibold truncate block hover:underline decoration-2 underline-offset-2">{ideas[x.idea].label}</Link>
                    <span className="z-small z-muted block">{plural(x.n, 'scored event')} at {plural(x.centers, 'center')}{x.overall != null ? `. Across the network: ${liftShort(x.overall)}` : ''}</span>
                  </div>
                  <Lift value={x.lift} size="sm" />
                </li>
              ))}
            </ul>
          ) : <p className="z-small z-muted mt-2" style={{ lineHeight: 1.45 }}>{thin ? 'Too few centers here to score ideas.' : 'No idea has enough scored events here to say.'}</p>}
        </div>
      )}

      <div className="mt-auto pt-7">
        <h4 className="font-bold">The centers<span className="z-small z-muted font-normal">, biggest draw first</span></h4>
        <Members ids={members} cat={cat} mine={mine} />
        {!all && v.centers.length > members.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-4" style={{ background: '#fff' }} onClick={() => setAll(true)}>Show all {v.centers.length}</button>}
      </div>
    </div>
  );
}

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

// The "not enough data" answer of a facet. Listed so nobody is missing, kept visually quiet.
function UnknownCard({ v, cat, mine }) {
  const [all, setAll] = useState(false);
  const here = mine != null && v.centers.includes(mine);
  const first = v.centers.length <= 16 ? v.centers : v.centers.slice(0, 12);
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

// Setting by Jewish population: counts of centers, tinted in one hue by count. A cell filters the directory.
function CrossTab({ facets, rows, cross, onPick }) {
  const S = facets.find((f) => f.key === 'setting'), J = facets.find((f) => f.key === 'jewish');
  const counts = useMemo(() => {
    const m = {};
    rows.forEach((r) => { const s = r.cat.setting, j = r.cat.jewish; m[s] = m[s] || {}; m[s][j] = (m[s][j] || 0) + 1; });
    return m;
  }, [rows]);
  const max = Math.max(1, ...Object.values(counts).flatMap((o) => Object.values(o)));
  return (
    <>
      <div className="overflow-x-auto z-scroll relative">
        <table className="w-full" style={{ minWidth: 540, borderCollapse: 'separate', borderSpacing: 4, margin: -4 }}>
          <thead><tr>
            <th scope="col" className="text-left z-small z-muted font-semibold" style={{ padding: '0 0.5rem 0.4rem 0' }}>Campus setting</th>
            {J.values.map((j) => <th key={j.key} scope="col" className="z-small font-semibold" style={{ padding: '0 0.2rem 0.4rem', width: '13%', lineHeight: 1.25, color: j.key === 'unknown' ? 'var(--grey)' : 'var(--ink)' }}>{j.label}</th>)}
            <th scope="col" className="z-small z-muted font-semibold text-right" style={{ padding: '0 0 0.4rem 0.6rem', width: '8%' }}>All</th>
          </tr></thead>
          <tbody>
            {S.values.map((s) => (
              <tr key={s.key}>
                <th scope="row" className="text-left font-semibold" style={{ padding: '0.3rem 0.8rem 0.3rem 0', lineHeight: 1.25, fontSize: '0.95rem' }}>{s.label}</th>
                {J.values.map((j) => {
                  const n = (counts[s.key] || {})[j.key] || 0, on = cross && cross.s === s.key && cross.j === j.key;
                  if (!n) return <td key={j.key} aria-label="No centers" style={{ height: 44, borderRadius: 10, border: '1px dotted #B9BEC7' }} />;
                  return (
                    <td key={j.key} style={{ padding: 0 }}>
                      <button type="button" aria-pressed={!!on} aria-label={`${s.label}, ${j.label}: ${plural(n, 'center')}. Show them in the list.`} onClick={() => onPick(on ? null : { s: s.key, j: j.key })}
                        className="w-full font-bold tabular-nums" style={{ height: 44, borderRadius: 10, cursor: 'pointer', background: `rgba(30, 59, 255, ${(0.07 + 0.4 * (n / max)).toFixed(3)})`, color: 'var(--ink)', outline: on ? '3px solid var(--ink)' : 'none', outlineOffset: -3 }}
                        {...tip([`${s.label}`, `Jewish students: ${j.label}`, plural(n, 'center')])}>{n}</button>
                    </td>
                  );
                })}
                <td className="text-right z-muted tabular-nums font-semibold" style={{ paddingLeft: '0.6rem' }}>{s.n}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="text-left z-small z-muted font-semibold" style={{ paddingTop: '0.4rem' }}>All settings</th>
              {J.values.map((j) => <td key={j.key} className="text-center z-muted tabular-nums font-semibold" style={{ paddingTop: '0.4rem' }}>{j.n}</td>)}
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
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 22, height: 14, borderRadius: 4, border: '1px dotted #B9BEC7' }} />No center</span>
      </div>
    </>
  );
}

// Every center with enough events, at its place in the 2-D layout. One hue: ink for everyone, blue for the
// highlighted answer. Hovering a dot draws lines to that center's peers.
function CenterMap({ pts, facetKey, hi, mine, label }) {
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
  const peerSet = hp ? new Set(hp.peers.map((x) => x.id)) : null;
  const me = mine != null ? byId.get(mine) : null;
  const lines = (p) => [title(p.c), p.c.name, `Setting: ${label.setting[p.cat.setting]}`, `Jewish students: ${label.jewish[p.cat.jewish]}${p.j ? ` (about ${p.j.toLocaleString()})` : ''}`,
    ...(facetKey !== 'setting' && facetKey !== 'jewish' ? [`${label.$name[facetKey]}: ${label[facetKey][p.cat[facetKey]]}`] : [])];
  return (
    <div ref={ref} className="z-card" style={{ padding: 0, overflow: 'hidden' }}>
      {w > 0 && (
        <svg width={w} height={h} role="group" aria-label={`Picture of ${pts.length} centers. Each dot links to a center.`} style={{ display: 'block' }}>
          {hp && hp.peers.map((x) => { const q = byId.get(x.id); return q ? <line key={x.id} x1={X(hp)} y1={Y(hp)} x2={X(q)} y2={Y(q)} stroke="var(--ink)" strokeWidth="1" opacity="0.4" /> : null; })}
          {pts.map((p) => {
            const on = !!hi && p.cat[facetKey] === hi, isHover = hover === p.c.id, isPeer = peerSet?.has(p.c.id);
            const op = isHover || isPeer ? 1 : on ? 0.9 : hi ? 0.14 : hp ? 0.16 : 0.3;
            return <circle key={p.c.id} cx={X(p)} cy={Y(p)} r={rOf(p)} fill={on ? 'var(--go)' : 'var(--ink)'} opacity={op} stroke={on || isHover || isPeer ? '#fff' : 'none'} strokeWidth="1.5" />;
          })}
          {me && <circle cx={X(me)} cy={Y(me)} r={rOf(me) + 5} fill="none" stroke="var(--ink)" strokeWidth="2.5" />}
          {me && <text x={X(me) + (X(me) > w - 150 ? -(rOf(me) + 10) : rOf(me) + 10)} y={Y(me) + 4} textAnchor={X(me) > w - 150 ? 'end' : 'start'} fontSize="13" fontWeight="700" fill="var(--ink)" stroke="var(--fog)" strokeWidth="4" paintOrder="stroke">Your center</text>}
          {pts.map((p) => {
            const t = tip(lines(p));
            return (
              <Link key={p.c.id} to={`/center/${p.c.id}`} aria-label={`${title(p.c)}, ${p.c.name}. ${label.setting[p.cat.setting]}. Jewish students: ${label.jewish[p.cat.jewish]}`} onClick={hideTip}
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

// What each campus facet explains of things it was not built from, in words.
function HoldsUp({ cen, facets }) {
  const said = (k) => lowerFirst(cen.outcome_labels[k] || k);
  const blocks = ['setting', 'jewish'].map((fk) => {
    const f = facets.find((x) => x.key === fk), res = Object.entries(cen.validation[fk] || {});
    return { f, yes: res.filter(([, r]) => r.p < 0.05).sort((a, b) => b[1].eta2 - a[1].eta2), no: res.filter(([, r]) => r.p >= 0.05).sort((a, b) => a[1].eta2 - b[1].eta2) };
  });
  const best = Math.max(...blocks.flatMap((b) => b.yes.map(([, r]) => r.eta2)), 0);
  const pc = cen.peer_check;
  return (
    <Section id="holds-h" title="How well this holds up" sub="A category earns its place only if it tells you something it was not built from. For each campus facet the engine measures how much of the difference between centers it accounts for, then shuffles the labels at random and measures again.">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {blocks.map(({ f, yes, no }) => (
          <div key={f.key} className="z-card">
            <h3 className="z-h3">{f.label}</h3>
            {yes.length > 0 && <p className="mt-3" style={{ lineHeight: 1.45 }}>{f.label} explains:</p>}
            {yes.length ? (
              <ul className="mt-3">
                {yes.map(([k, r]) => (
                  <li key={k} className="py-3 grid grid-cols-[4.2rem_minmax(0,1fr)] gap-3 items-baseline" style={{ borderTop: '1px solid var(--fog-2)' }}>
                    <span className="z-num" style={{ fontSize: '1.7rem' }}>{pct(r.eta2)}</span>
                    <span style={{ lineHeight: 1.4 }}>of the differences in {said(k)}. <span className="z-muted">Shuffled labels explain {pct(r.chance)}.</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 z-muted">It does not clearly explain any of the things tested.</p>}
            {no.length > 0 && <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>It says little about {listWords(no.map(([k]) => said(k)))}. On those, shuffled labels do about as well.</p>}
          </div>
        ))}
        <div className="z-card">
          <h3 className="z-h3">Peers and campus setting</h3>
          <p className="z-num mt-5" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.1rem)' }}>{pct(pc.same_setting_top5)}</p>
          <p className="mt-3" style={{ lineHeight: 1.5 }}>of a center's five nearest peers are at the same kind of campus. If peers were drawn at random it would be {pct(pc.by_chance)}.</p>
          <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>Peers are matched half on campus, Jewish population and draw, and half on how alike the two calendars are, so a peer at a different kind of campus is one that programs very much alike.</p>
        </div>
      </div>
      <p className="mt-6 max-w-[70ch]" style={{ lineHeight: 1.55 }}>Campus facts explain some of what a center does and far from all of it: {pct(best)} at the very best, and usually much less. Two centers on the same kind of campus can run very different calendars. That is why the five facets about events are kept separate from the two about the campus, and why none of them is folded into one overall type.</p>
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
    lk.label.$name = Object.fromEntries(cen.facets.map((f) => [f.key, f.label]));
    const rows = cat.centers.map((c) => { const prof = cen.profiles[c.id] || {}; return { c, st: cen.stats[c.id] || {}, cat: prof.cat || c.cat || {}, j: prof.facts?.jewish ?? null, xy: prof.xy, peers: prof.peers || [] }; });
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
  const left = cen.total - cen.profiled;
  const pickFacet = (k) => { const p = new URLSearchParams(params); if (k === cen.facets[0].key) p.delete('by'); else p.set('by', k); setParams(p, { replace: true, preventScrollReset: true }); };
  const pickCross = (x) => { setCross(x); if (x) { setVal(null); setQ(''); requestAnimationFrame(() => dirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } };

  const s = q.trim().toLowerCase();
  const key = { jewish: (r) => r.j, draw: (r) => r.st.top5, events: (r) => r.st.per_year }[sort];
  const list = rows
    .filter((r) => !s || `${r.c.name} ${r.c.campus} ${r.c.short} ${r.c.city} ${r.c.state} ${r.c.country}`.toLowerCase().includes(s))
    .filter((r) => !val || r.cat[facet.key] === val)
    .filter((r) => !cross || (r.cat.setting === cross.s && r.cat.jewish === cross.j))
    .sort((a, b) => (key ? (key(b) ?? -1) - (key(a) ?? -1) : 0) || title(a.c).localeCompare(title(b.c)));
  const filtered = !!(s || val || cross);
  const shown = all || filtered ? list : list.slice(0, 30);
  const pill = (on, color = 'var(--ink)') => ({ height: '2.3rem', padding: '0 1rem', fontSize: '0.9rem', background: on ? color : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  const chip = (on) => ({ height: '2.05rem', padding: '0 0.85rem', fontSize: '0.86rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  const muted = (t) => <span className="z-muted">{t}</span>;
  const drawCell = (r) => (r.st.top5 == null ? muted('Too few') : r.cat.reach === 'unknown' ? <span className="z-muted" title="Sign-ups are too rare at this center for this to be a fair read">{num(r.st.top5)}</span> : num(r.st.top5));
  const jewishCell = (r) => (r.j ? r.j.toLocaleString() : muted('Not listed'));
  const eventsCell = (r) => (r.st.per_year != null ? num(r.st.per_year) : muted('Under 15 in all'));
  const mobile = { name: ['Jewish students', jewishCell], jewish: ['Jewish students', jewishCell], draw: ['Biggest draw', drawCell], events: ['Events a year', eventsCell] }[sort];
  const groups = [['campus', 'About the campus'], ['events', 'Read from its events']];

  return (
    <div>
      <PageHead title="Centers" lede={`Every center is described on seven questions, and each answer is decided by a written rule you can read and check. Nothing here is a statistical grouping. ${cen.profiled} of ${cen.total} centers have enough events on the system to read their programming. The other ${left} are still placed by their campus.`} />

      <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4" role="group" aria-label="Choose a question">
        {groups.map(([kind, name]) => (
          <div key={kind} className="min-w-0">
            <p className="z-small z-muted font-semibold mb-2">{name}</p>
            <div className="flex flex-wrap gap-2">
              {cen.facets.filter((f) => f.kind === kind).map((f) => <button key={f.key} type="button" className="z-pill" style={pill(f.key === facet.key)} aria-pressed={f.key === facet.key} onClick={() => pickFacet(f.key)}>{f.label}</button>)}
            </div>
          </div>
        ))}
      </div>

      <Section id="kinds-h" tight title={facet.question} sub={facet.basis}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {known.map((v) => <ValueCard key={`${facet.key}:${v.key}`} facet={facet} v={v} cat={cat} ideas={ideas} mine={mine} />)}
        </div>
        {unknown && <UnknownCard key={`${facet.key}:unknown`} v={unknown} cat={cat} mine={mine} />}
        <p className="z-small z-muted mt-5 max-w-[72ch]" style={{ lineHeight: 1.5 }}>
          The numbers on a card are medians over its centers that have at least {cen.min_events} events on the system. An idea is "more common here" when at least a quarter of these centers have run it and that share is 15 points or more above the rest.
          {HAS_WORKS.has(facet.key) && ' "Does well here" is how the idea did against each center\'s own normal, counting only events at these centers, with at least 8 scored events at 4 centers.'}
        </p>
      </Section>

      <Section id="cross-h" title="Setting by Jewish population" sub="How many centers sit at each kind of campus, split by how many Jewish students they serve. Press a number to list those centers below. This is the quick way to find, say, the major public universities with 2,500 or more Jewish students.">
        <div className="z-card"><CrossTab facets={cen.facets} rows={rows} cross={cross} onPick={pickCross} /></div>
      </Section>

      <Section id="map-h" title="The picture" sub={`Each dot is one of the ${pts.length} centers with enough events to read. Nearby dots are centers that are alike on campus, scale and programming. Distance is approximate, and left, right, up and down mean nothing by themselves.`}
        action={(
          <label className="z-label" style={{ minWidth: '15rem' }}>Highlight
            <select className="z-input" value={hi} onChange={(e) => setHi(e.target.value)} aria-label={`Highlight one answer of ${facet.label}`} style={{ borderRadius: 999, padding: '0.6rem 1rem', fontWeight: 600 }}>
              <option value="">Nothing</option>
              {facet.values.filter((v) => v.n_profiled > 0).map((v) => <option key={v.key} value={v.key}>{v.label} ({v.n_profiled})</option>)}
            </select>
          </label>
        )}>
        <CenterMap pts={pts} facetKey={facet.key} hi={hi} mine={mine} label={label} />
        <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 z-small z-muted">
          <span className="inline-flex items-center gap-2"><svg width="46" height="24" aria-hidden="true"><circle cx="7" cy="12" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="32" cy="12" r="11" fill="var(--ink)" opacity="0.35" /></svg>Bigger dot, more Jewish students served</span>
          {hi && <span className="inline-flex items-center gap-2"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--go)" /></svg>{facet.label}: {label[facet.key][hi]}</span>}
          {mine != null && pts.some((p) => p.c.id === mine) && <span className="inline-flex items-center gap-2"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" strokeWidth="2" /></svg>Your center</span>}
          <span>Point at a dot to see the centers most like it. Click or tap it to open the center.</span>
        </div>
        {mine != null && !pts.some((p) => p.c.id === mine) && <p className="z-small z-muted mt-3">Your center is not in the picture because it has fewer than {cen.min_events} events on the system.</p>}
      </Section>

      <div ref={dirRef} style={{ scrollMarginTop: '5rem' }}>
        <Section id="dir-h" title="Every center" sub={`All ${cen.total} centers. Biggest draw is the average sign-ups of a center's five biggest events in the last three years. Events a year covers the last two years.`}
          action={<Seg value={sort} onChange={setSort} label="Sort the list" options={[['name', 'Name'], ['jewish', 'Jewish students'], ['draw', 'Biggest draw'], ['events', 'Events a year']]} />}>
          <label className="z-label" style={{ maxWidth: '28rem' }}><span className="sr-only">Search centers</span>
            <input className="z-input" type="search" placeholder="Search by school, center, city or state" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search centers" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Filter by ${facet.label}`}>
            <button type="button" className="z-pill" style={chip(!val)} aria-pressed={!val} onClick={() => setVal(null)}>All<span style={{ opacity: 0.6 }}>{cen.total}</span></button>
            {facet.values.map((v) => <button key={v.key} type="button" className="z-pill" style={chip(val === v.key)} aria-pressed={val === v.key} onClick={() => setVal(val === v.key ? null : v.key)}>{v.label}<span style={{ opacity: 0.6 }}>{v.n}</span></button>)}
          </div>
          {cross && (
            <p className="mt-3">
              <button type="button" className="z-pill" style={{ ...chip(false), background: 'var(--go-tint)', whiteSpace: 'normal', height: 'auto', minHeight: '2.05rem', textAlign: 'left', lineHeight: 1.25, paddingTop: '0.3rem', paddingBottom: '0.3rem' }} onClick={() => setCross(null)} aria-label="Clear the setting and Jewish population filter">
                <span>{label.setting[cross.s]}, Jewish students: {lowerFirst(label.jewish[cross.j])}</span><X size={15} aria-hidden="true" style={{ flex: 'none' }} />
              </button>
            </p>
          )}
          {list.length ? (
            <div className="mt-5">
              {filtered && <p className="z-small z-muted mb-2">{plural(list.length, 'center')}</p>}
              <table className="z-table" style={{ tableLayout: 'auto' }}>
                <thead><tr>
                  <th scope="col">Center</th>
                  <th scope="col" className="hidden md:table-cell">Campus setting</th>
                  <th scope="col" className="num sm:hidden" style={{ textAlign: 'right', paddingRight: 0, whiteSpace: 'normal' }}>{mobile[0]}</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Jewish students</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Biggest draw</th>
                  <th scope="col" className="num hidden sm:table-cell" style={{ textAlign: 'right' }}>Events a year</th>
                  <th scope="col" className="hidden lg:table-cell" style={{ paddingRight: 0 }}>Stage</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => { const { c } = r; return (
                    <tr key={c.id} style={c.id === mine ? { background: 'var(--go-tint)' } : undefined}>
                      <td style={{ maxWidth: '22rem' }}>
                        <Link to={`/center/${c.id}`} className="font-bold hover:underline decoration-2 underline-offset-2">{title(c)}</Link>{c.id === mine && <span className="z-small font-semibold"> (your center)</span>}
                        <span className="z-small z-muted block" style={{ overflowWrap: 'anywhere' }}>{c.name}{c.city ? `, ${c.city}` : ''}{c.state ? `, ${c.state}` : c.country ? `, ${c.country}` : ''}</span>
                        <span className="z-small z-muted block md:hidden">{label.setting[r.cat.setting]}<span className="lg:hidden">. {label.stage[r.cat.stage]}</span></span>
                      </td>
                      <td className="hidden md:table-cell" style={{ maxWidth: '14rem' }}>{label.setting[r.cat.setting]}</td>
                      <td className="num sm:hidden" style={{ paddingRight: 0 }}>{mobile[1](r)}</td>
                      <td className="num hidden sm:table-cell">{jewishCell(r)}</td>
                      <td className="num hidden sm:table-cell">{drawCell(r)}</td>
                      <td className="num hidden sm:table-cell">{eventsCell(r)}</td>
                      <td className="hidden lg:table-cell" style={{ paddingRight: 0 }}>{label.stage[r.cat.stage]}</td>
                    </tr>); })}
                </tbody>
              </table>
              {!all && !filtered && list.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {list.length} centers</button>}
              <p className="z-small z-muted mt-5 max-w-[70ch]" style={{ lineHeight: 1.5 }}>Jewish students is the count each center's staff entered in the Chabad on Campus directory, added up over every campus the center serves. A grey biggest draw means the center takes sign-ups too rarely for the number to be a fair read.</p>
            </div>
          ) : <div className="mt-5"><Empty>No center matches{s ? ` "${q}"` : ''}{val || cross ? ' with these filters' : ''}.</Empty></div>}
        </Section>
      </div>

      <HoldsUp cen={cen} facets={cen.facets} />
    </div>
  );
}
