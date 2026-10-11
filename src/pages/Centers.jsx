import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useMyCenter, plural, share } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Stat, HBars, Seg, tip, hideTip } from '../components/bits';

// The engine names each group from its medians ("Small dinners, steady calendar, class-heavy"). Parts that
// every group shares do not tell the groups apart, so the short name drops them.
function shortNames(clusters) {
  const parts = clusters.map((c) => { const m = c.name.match(/^(Outside the US: )?(.*)$/); return { pre: m[1] || '', segs: m[2].split(', ') }; });
  const low = (s) => s.toLowerCase();
  const common = parts[0].segs.map(low).filter((s) => parts.every((p) => p.segs.map(low).includes(s)));
  const out = parts.map((p) => { const keep = p.segs.filter((s) => !common.includes(low(s))); const t = (keep.length ? keep : p.segs).join(', '); return p.pre ? p.pre + t : t[0].toUpperCase() + t.slice(1); });
  return new Set(out).size === out.length ? out : clusters.map((c) => c.name);
}
const where = (c) => (c.country && c.country !== 'USA' ? c.country : c.state || c.country || '');
const title = (c) => c.campus || c.name;
// A Jewish student count larger than the whole school is a typo in the source, so it is treated as not listed.
const jpopOf = (c) => (c.jpop && !(c.pop && c.jpop > c.pop) ? c.jpop : null);
const said = (label) => (label === 'Shabbat' ? label : label.toLowerCase());

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

// Every profiled center at its place in the 2-D layout of the center vectors. One hue: ink for everyone,
// blue for the chosen group. Hovering a dot draws lines to that center's twelve nearest peers.
function CenterMap({ pts, group, mine, names }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  useEffect(() => hideTip, []);
  const small = w < 560;
  const h = small ? Math.round(w * 1.08) : Math.round(Math.min(620, w * 0.5));
  const pad = small ? 18 : 26;
  const maxJ = Math.max(1, ...pts.map((p) => jpopOf(p.c) || 0));
  const rOf = (p) => (small ? 3.5 : 5) + (small ? 8 : 13) * Math.sqrt((jpopOf(p.c) || 0) / maxJ);
  const X = (p) => pad + p.xy[0] * (w - 2 * pad), Y = (p) => pad + (1 - p.xy[1]) * (h - 2 * pad);
  const byId = useMemo(() => new Map(pts.map((p) => [p.c.id, p])), [pts]);
  const hp = hover != null ? byId.get(hover) : null;
  const peerSet = hp ? new Set(hp.peers.map((x) => x.id)) : null;
  const me = mine != null ? byId.get(mine) : null;
  return (
    <div ref={ref} className="z-card" style={{ padding: 0, overflow: 'hidden' }}>
      {w > 0 && (
        <svg width={w} height={h} role="group" aria-label={`Map of ${pts.length} profiled centers. Each dot links to a center.`} style={{ display: 'block' }}>
          {hp && hp.peers.map((x) => { const q = byId.get(x.id); return q ? <line key={x.id} x1={X(hp)} y1={Y(hp)} x2={X(q)} y2={Y(q)} stroke="var(--ink)" strokeWidth="1" opacity="0.4" /> : null; })}
          {pts.map((p) => {
            const on = group != null && p.cluster === group, isHover = hover === p.c.id, isPeer = peerSet?.has(p.c.id);
            const fill = on ? 'var(--go)' : 'var(--ink)';
            const op = isHover || isPeer ? 1 : on ? 0.9 : group != null ? 0.14 : hp ? 0.16 : 0.3;
            return <circle key={p.c.id} cx={X(p)} cy={Y(p)} r={rOf(p)} fill={fill} opacity={op} stroke={on || isHover || isPeer ? '#fff' : 'none'} strokeWidth="1.5" />;
          })}
          {me && <circle cx={X(me)} cy={Y(me)} r={rOf(me) + 5} fill="none" stroke="var(--ink)" strokeWidth="2.5" />}
          {me && <text x={X(me) + (X(me) > w - 150 ? -(rOf(me) + 10) : rOf(me) + 10)} y={Y(me) + 4} textAnchor={X(me) > w - 150 ? 'end' : 'start'} fontSize="13" fontWeight="700" fill="var(--ink)" stroke="var(--fog)" strokeWidth="4" paintOrder="stroke">Your center</text>}
          {pts.map((p) => {
            const t = tip([title(p.c), p.c.name, `Group: ${names[p.cluster]}`, jpopOf(p.c) ? `About ${jpopOf(p.c).toLocaleString()} Jewish students` : 'Jewish student count not listed', `${p.n.toLocaleString()} events on record`]);
            return (
              <Link key={p.c.id} to={`/center/${p.c.id}`} aria-label={`${title(p.c)}, ${p.c.name}, group: ${names[p.cluster]}`} onClick={hideTip}
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

function GroupCard({ cl, name, avg, labels, cat, onShow, shown, mixMax }) {
  const diffs = Object.keys(cl.mix).map((k) => [k, cl.mix[k] - avg[k]]).sort((a, b) => b[1] - a[1]);
  const [topK, topD] = diffs[0];
  const [lowK, lowD] = diffs[diffs.length - 1];
  const verb = (k) => (/s$/.test(labels[k]) ? 'make' : 'makes');
  return (
    <div className="z-card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="z-h3 min-w-0" style={{ maxWidth: '22ch' }}>{name}</h3>
        <span className="z-pill" style={{ background: '#fff' }}>{plural(cl.n, 'center')}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        {[[cl.median_dinner != null ? Math.round(cl.median_dinner) : 'n/a', 'sign-ups at a typical Shabbat dinner'], [cl.events_per_year != null ? Math.round(cl.events_per_year) : 'n/a', 'events a year'],
          [cl.jpop != null ? cl.jpop.toLocaleString() : 'n/a', 'Jewish students on campus'], [cl.themed != null ? share(cl.themed) : 'n/a', 'of Shabbat dinners have a theme']].map(([v, l]) => (
          <div key={l} className="min-w-0"><dd className="z-num" style={{ fontSize: '1.7rem' }}>{v}</dd><dt className="z-small z-muted mt-1" style={{ lineHeight: 1.3 }}>{l}</dt></div>
        ))}
      </dl>
      <p className="mt-6" style={{ lineHeight: 1.45 }}>
        {topD >= 0.02 ? <>{labels[topK]} {verb(topK)} up {share(cl.mix[topK])} of its events, against {share(avg[topK])} across all profiled centers.</> : <>Its mix of events is close to the average of all profiled centers.</>}
        {lowD <= -0.04 && <span className="z-muted"> Less of its calendar is {said(labels[lowK])} ({share(cl.mix[lowK])} against {share(avg[lowK])}).</span>}
      </p>
      <div className="mt-4">
        <HBars rows={Object.keys(cl.mix).map((k) => ({ key: k, label: labels[k], value: cl.mix[k], color: k === topK && topD >= 0.02 ? 'var(--go)' : undefined, tip: [labels[k], `${share(cl.mix[k])} of this group's events`, `${share(avg[k])} across all profiled centers`] }))} format={(v) => share(v)} max={mixMax} />
      </div>
      <p className="z-small z-muted mt-6" style={{ lineHeight: 1.6 }}>
        <span className="font-semibold" style={{ color: 'var(--ink)' }}>Largest dinners in the group: </span>
        {cl.centers.slice(0, 6).map((id, i) => { const c = cat.centerById.get(id); return c ? <span key={id}>{i > 0 && ', '}<Link to={`/center/${id}`} className="z-link" title={c.name}>{title(c)}</Link></span> : null; })}
      </p>
      <div className="mt-auto pt-5"><button type="button" className="z-btn z-btn-soft z-btn-sm" style={{ background: shown ? 'var(--go)' : '#fff', color: shown ? '#fff' : undefined }} aria-pressed={shown} onClick={onShow}>{shown ? 'Shown on the map' : 'Show on the map'}</button></div>
    </div>
  );
}

export default function Centers() {
  const { data, error } = useData('centers.json', 'catalog');
  const [mine] = useMyCenter();
  const [group, setGroup] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [all, setAll] = useState(false);
  const mapRef = useRef(null);
  const model = useMemo(() => {
    if (!data) return null;
    const [cen, cat] = data;
    const names = shortNames(cen.clusters);
    const nProg = new Array(cat.centers.length).fill(0);
    cat.programs.c.forEach((ci) => { nProg[ci] += 1; });
    const rows = cat.centers.map((c) => ({ c, st: cen.stats[c.id] || {}, prof: cen.profiles[c.id] || null, programs: nProg[c.idx] }));
    const pts = rows.filter((r) => r.prof && r.prof.xy).map((r) => ({ c: r.c, xy: r.prof.xy, cluster: r.prof.cluster, peers: r.prof.peers, n: r.st.n || 0 }));
    const tot = cen.clusters.reduce((s, c) => s + c.n, 0) || 1;
    const avg = {};
    Object.keys(cen.group_labels).forEach((k) => { avg[k] = cen.clusters.reduce((s, c) => s + (c.mix[k] || 0) * c.n, 0) / tot; });
    return { names, rows, pts, avg };
  }, [data]);
  if (error) return <ErrorNote error={error} what="The centers page" />;
  if (!data) return <Loading rows={3} h={220} />;
  const [cen, cat] = data;
  const { names, rows, pts, avg } = model;
  const total = cat.centers.length, left = total - cen.profiled;
  const s = q.trim().toLowerCase();
  const list = rows.filter((r) => !s || `${r.c.name} ${r.c.campus} ${r.c.short} ${r.c.city} ${r.c.state} ${r.c.country}`.toLowerCase().includes(s))
    .sort((a, b) => (sort === 'events' ? (b.st.n || 0) - (a.st.n || 0) : sort === 'size' ? (jpopOf(b.c) || -1) - (jpopOf(a.c) || -1) : 0) || title(a.c).localeCompare(title(b.c)));
  const shown = all || s ? list : list.slice(0, 30);
  const showGroup = (id) => { setGroup(id); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const pill = (on) => ({ height: '2.3rem', padding: '0 1rem', fontSize: '0.9rem', background: on ? 'var(--go)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  return (
    <div>
      <PageHead title="Centers" lede={`${cen.profiled} of ${total} centers have enough events on record to be profiled. Each one gets twelve nearest peers and a rough group. The other ${left} have fewer than 15 events, too few to say what they are like.`} />
      <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
        <Stat value={cen.profiled} label="centers profiled" sub={`of ${total} with sign-up pages`} />
        <Stat value={left} label="without enough data" sub="fewer than 15 events" />
        <Stat value={12} label="nearest peers each" sub="the list to trust most" />
        <Stat value={cen.k} label="rough groups" sub="loose, see the note below" />
      </div>

      <div ref={mapRef} style={{ scrollMarginTop: '5rem' }}>
        <Section id="map-h" title="The center map" sub="Each dot is a center. Two dots sit close when the centers are alike in three ways: the campus (Jewish students, school size, public or private), how they program (how much, how many sign up, the mix), and what their events are about. Left, right, up and down mean nothing by themselves.">
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Highlight one group">
            <button type="button" className="z-pill" style={pill(group == null)} aria-pressed={group == null} onClick={() => setGroup(null)}>All centers</button>
            {cen.clusters.map((cl, i) => <button key={cl.id} type="button" className="z-pill" style={{ ...pill(group === cl.id), whiteSpace: 'normal', height: 'auto', minHeight: '2.3rem', paddingTop: '0.3rem', paddingBottom: '0.3rem', textAlign: 'left', lineHeight: 1.2 }} aria-pressed={group === cl.id} onClick={() => setGroup(group === cl.id ? null : cl.id)} title={cl.name}>{names[i]}<span style={{ opacity: 0.6 }}>{cl.n}</span></button>)}
          </div>
          <CenterMap pts={pts} group={group} mine={mine} names={Object.fromEntries(cen.clusters.map((cl, i) => [cl.id, names[i]]))} />
          <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 z-small z-muted">
            <span className="inline-flex items-center gap-2"><svg width="46" height="24" aria-hidden="true"><circle cx="7" cy="12" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="32" cy="12" r="11" fill="var(--ink)" opacity="0.35" /></svg>Bigger dot, more Jewish students on campus</span>
            {group != null && <span className="inline-flex items-center gap-2"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--go)" /></svg>The chosen group</span>}
            {mine != null && pts.some((p) => p.c.id === mine) && <span className="inline-flex items-center gap-2"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="4" fill="var(--ink)" opacity="0.35" /><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink)" strokeWidth="2" /></svg>Your center</span>}
            <span>Point at a dot to see its twelve nearest peers. Click or tap it to open the center.</span>
          </div>
          {mine != null && !pts.some((p) => p.c.id === mine) && <p className="z-small z-muted mt-3">Your center is not on the map because it has too few events on record.</p>}
        </Section>
      </div>

      <Section id="groups-h" title={`${cen.k} rough groups`} sub={`The engine sorted the profiled centers into ${cen.k} groups. The split is weak: centers shade into one another and do not fall into sharp types (the grouping scores ${cen.silhouette.toFixed(2)} on a scale where 0 is no separation and 1 is clean). Read a group as a loose neighborhood. The nearest-peer list on each center's page is the more useful output.`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cen.clusters.map((cl, i) => <GroupCard key={cl.id} cl={cl} name={names[i]} avg={avg} labels={cen.group_labels} mixMax={Math.max(...cen.clusters.flatMap((x) => Object.values(x.mix)))} cat={cat} shown={group === cl.id} onShow={() => showGroup(cl.id)} />)}
        </div>
        <p className="z-small z-muted mt-4 max-w-[70ch]" style={{ lineHeight: 1.5 }}>Numbers on each card are the median of the group's centers.{cen.clusters.every((cl, i) => cl.name.length > names[i].length) && ' The engine gave all of these groups the same calendar label, so the names here drop it and lean on dinner size and on which kind of event a group runs more of than the rest.'}</p>
      </Section>

      <Section id="dir-h" title="Every center" sub={`All ${total} centers. Events and sign-ups cover everything on record since 2020.`}
        action={<Seg value={sort} onChange={setSort} label="Sort the list" options={[['name', 'Name'], ['events', 'Events'], ['size', 'Jewish students']]} />}>
        <label className="z-label" style={{ maxWidth: '28rem' }}><span className="sr-only">Search centers</span>
          <input className="z-input" type="search" placeholder="Search by school, center, city or state" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search centers" />
        </label>
        {list.length ? (
          <div className="mt-5">
            <table className="z-table" style={{ tableLayout: 'auto' }}>
              <thead><tr>
                <th scope="col">Center</th>
                <th scope="col" className="hidden md:table-cell">State or country</th>
                <th scope="col" className="hidden sm:table-cell">Group</th>
                <th scope="col" className="num" style={{ textAlign: 'right' }}>Events</th>
                <th scope="col" className="num hidden lg:table-cell" style={{ textAlign: 'right' }}>Programs</th>
                <th scope="col" className="num hidden md:table-cell" style={{ textAlign: 'right' }}>Typical sign-ups</th>
                <th scope="col" className="num hidden lg:table-cell" style={{ textAlign: 'right', paddingRight: 0 }}>Jewish students</th>
              </tr></thead>
              <tbody>
                {shown.map(({ c, st, prof, programs }) => (
                  <tr key={c.id} style={c.id === mine ? { background: 'var(--go-tint)' } : undefined}>
                    <td style={{ maxWidth: '22rem' }}>
                      <Link to={`/center/${c.id}`} className="font-bold hover:underline decoration-2 underline-offset-2">{title(c)}</Link>{c.id === mine && <span className="z-small font-semibold"> (your center)</span>}
                      <span className="z-small z-muted block" style={{ overflowWrap: 'anywhere' }}>{c.name}{c.city ? `, ${c.city}` : ''}</span>
                      <span className="z-small z-muted block sm:hidden">{prof ? names[prof.cluster] : 'Not enough data'}</span>
                    </td>
                    <td className="hidden md:table-cell">{where(c)}</td>
                    <td className="hidden sm:table-cell" style={{ maxWidth: '15rem' }}>{prof ? names[prof.cluster] : <span className="z-muted">Not enough data</span>}</td>
                    <td className="num">{(st.n || 0).toLocaleString()}</td>
                    <td className="num hidden lg:table-cell">{programs.toLocaleString()}</td>
                    <td className="num hidden md:table-cell">{st.med_regs != null ? Math.round(st.med_regs) : <span className="z-muted">None taken</span>}</td>
                    <td className="num hidden lg:table-cell" style={{ paddingRight: 0 }}>{jpopOf(c) ? jpopOf(c).toLocaleString() : <span className="z-muted">Not listed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!all && !s && list.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {list.length} centers</button>}
            <p className="z-small z-muted mt-5 max-w-[70ch]" style={{ lineHeight: 1.5 }}>Typical sign-ups is the median over events that took at least one sign-up. A program is one event name at one center, however many times it ran.</p>
          </div>
        ) : <div className="mt-5"><Empty>No center matches "{q}".</Empty></div>}
      </Section>
    </div>
  );
}
