import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, Check } from 'lucide-react';
import { useData, useMyCenter, plural, share, fmtDate, CONF } from '../lib/data';
import { Section, Loading, ErrorNote, Empty, Stat, HBars, Columns, Meter, Lift, Flyer, ProgramCard, FlyerGrid, tip } from '../components/bits';

const title = (c) => c.campus || c.name;
const place = (c) => [c.city, c.state, c.country && c.country !== 'USA' ? c.country : null].filter(Boolean).join(', ');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'Website'; } };
const num = (v) => Math.round(v).toLocaleString();
const pct = (v) => (v > 0 && v < 0.01 ? 'under 1%' : `${Math.round(v * 100)}%`);
const month = (d) => fmtDate(d, { month: 'short', year: 'numeric' });
// Why two centers were matched, as the engine reports it (profiles[id].peers[].why).
const REASON = { setting: 'same kind of campus', jewish: 'similar Jewish population', reach: 'similar draw', calendar: 'similar calendar', programs: 'similar programs' };
// "67% of small college centers". Two setting labels do not read well in front of "centers".
const settingCenters = (key, label) => (key === 'abroad' ? 'centers in the UK, Europe and beyond' : key === 'canada' ? 'Canadian university centers' : `${label[0].toLowerCase()}${label.slice(1)} centers`);

function lookups(facets) {
  const label = {}, def = {};
  facets.forEach((f) => { label[f.key] = {}; def[f.key] = {}; f.values.forEach((v) => { label[f.key][v.key] = v.label; def[f.key][v.key] = v.def; }); });
  return { label, def };
}

function Photo({ src, alt }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return null;
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setOk(false)} className="block w-full" style={{ aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 'var(--r-lg)', background: 'var(--fog)' }} />;
}
function Logo({ src }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return null;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 16, background: 'var(--fog)', padding: 6, flex: 'none' }} />;
}

// The facts each answer rests on, as rows of [label, value]. Only what the engine has is listed.
function factsFor(key, { prof, st, cen }) {
  const f = prof.facts || {}, rows = [];
  if (key === 'setting') {
    if (f.institution) rows.push(['Institution, as matched', f.institution]);
    if (f.public != null) rows.push(['Public or private', f.public ? 'Public' : 'Private']);
    if (f.carnegie) rows.push(['Carnegie class', f.carnegie]);
    if (f.undergrads != null) rows.push(['Undergraduates', num(f.undergrads)]);
    if (f.grads != null) rows.push(['Graduate students', num(f.grads)]);
    if (f.adm_rate != null) rows.push(['Admission rate', pct(f.adm_rate)]);
    if (f.with_family != null) rows.push(['First-year students living with family', pct(f.with_family)]);
  } else if (key === 'jewish') {
    if (f.jewish != null) rows.push(['Jewish students served', `${num(f.jewish)}${f.campuses > 1 ? ` across ${f.campuses} campuses` : ''}`]);
    if (f.campuses > 1 && f.served?.length) rows.push(['Campuses served', f.served.join(', ')]);
    if (f.jewish_share != null) rows.push(['Jewish share of enrollment, main campus', pct(f.jewish_share)]);
  } else if (key === 'reach') {
    rows.push(['Average sign-ups at its five biggest events, last three years', st.top5 != null ? num(st.top5) : 'Fewer than five events with sign-ups']);
    if (st.biggest) rows.push(['Biggest single event', num(st.biggest)]);
  } else if (key === 'volume') {
    rows.push(['Events a year, last two years', st.per_year != null ? num(st.per_year) : `Not read: ${plural(st.events || 0, 'event')} in all`]);
  } else if (key === 'emphasis') {
    if (st.mix) Object.keys(cen.group_labels).forEach((k) => rows.push([cen.group_labels[k], pct(st.mix[k] || 0)]));
  } else if (key === 'signups') {
    if (st.rsvp_share != null) rows.push(['Events that took at least one sign-up', pct(st.rsvp_share)]);
  } else if (key === 'stage') {
    if (st.first) rows.push(['First event', month(st.first)]);
    if (st.last) rows.push(['Latest event', month(st.last)]);
    rows.push(['Events in the last twelve months', num(st.n_now || 0)]);
    rows.push(['Events in the twelve months before', num(st.n_before || 0)]);
  }
  return rows;
}

// Seven questions, one row each: the answer, the rule that decided it, and the numbers the rule was applied to.
function Kind({ cen, prof, st, lk }) {
  const f = prof.facts || {};
  const federal = (f.source || '').startsWith('IPEDS');
  const note = { setting: f.source ? (federal ? `Source: federal data. Files: ${cen.reference.source}.` : `Source: ${f.source}. There is no federal record for a campus outside the US, so these are the figures the center entered.`) : null,
    jewish: 'Source: Chabad on Campus directory, as entered by the center. An estimate.' };
  const groups = [['campus', 'The campus'], ['events', 'Its events']];
  return (
    <Section id="kind-h" title="What kind of center this is" sub="Seven questions, each answered by a written rule. Next to every answer are the numbers the rule was applied to, so a wrong fact is easy to spot. Press an answer to see the other centers that share it.">
      <div className="space-y-10">
        {groups.map(([kind, name]) => (
          <div key={kind}>
            <h3 className="z-h3">{name}</h3>
            <div className="mt-3">
              {cen.facets.filter((x) => x.kind === kind).map((facet) => { const v = prof.cat?.[facet.key], rows = factsFor(facet.key, { prof, st, cen }); return (
                <div key={facet.key} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-12 gap-y-4 py-6" style={{ borderTop: '1px solid var(--fog-2)' }}>
                  <div className="min-w-0">
                    <p className="z-small z-muted font-semibold">{facet.label}</p>
                    <p className="mt-1"><Link to={`/centers?by=${facet.key}`} className="z-display hover:underline decoration-2 underline-offset-4" style={{ fontSize: '1.45rem', lineHeight: 1.15, color: v === 'unknown' ? 'var(--grey)' : 'var(--ink)' }}>{lk.label[facet.key]?.[v] || 'Not placed'}</Link></p>
                    <p className="mt-2 z-muted" style={{ lineHeight: 1.45 }}>{lk.def[facet.key]?.[v]}</p>
                  </div>
                  <div className="min-w-0">
                    {rows.length > 0 && (
                      <dl className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-x-5">
                        {rows.map(([l, val]) => (
                          <div key={l} className="contents">
                            <dt className="z-small z-muted py-1.5" style={{ borderTop: '1px solid var(--fog)' }}>{l}</dt>
                            <dd className="z-small font-semibold py-1.5" style={{ borderTop: '1px solid var(--fog)', overflowWrap: 'anywhere' }}>{val}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {note[facet.key] && <p className="z-small z-muted mt-2.5" style={{ lineHeight: 1.45 }}>{note[facet.key]}</p>}
                  </div>
                </div>); })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Peers({ prof, cat, lk }) {
  const campusOnly = prof.basis === 'campus';
  return (
    <Section id="peers-h" title="Centers like this one" sub={campusOnly
      ? 'This center has too few events on the system to read its programming, so these are matched on campus alone: the kind of campus and the number of Jewish students.'
      : 'The twelve centers that score closest to this one. Half of the score is the match on campus, Jewish population and biggest draw. The other half is how alike the two calendars are.'}>
      <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10">
        {prof.peers.map((p, i) => { const c = cat.centerById.get(p.id); if (!c) return null; const setting = lk.label.setting[c.cat?.setting]; return (
          <li key={p.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
            <Link to={`/center/${p.id}`} className="block py-4 group" {...tip([title(c), c.name, `Score ${p.sim.toFixed(2)} on a scale from 0 to 1`])}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold truncate group-hover:underline decoration-2 underline-offset-2"><span className="z-muted font-semibold tabular-nums">{i + 1}. </span>{title(c)}</span>
                <span className="z-small font-semibold tabular-nums">{p.sim.toFixed(2)}</span>
              </div>
              {setting && <p className="z-small z-muted mt-0.5 truncate">{setting}</p>}
              <div className="mt-2.5"><Meter value={p.sim} max={1} height={6} /></div>
              <p className="mt-2.5 flex flex-wrap gap-1.5">
                {p.why.length ? p.why.map((k) => <span key={k} className="z-pill" style={{ height: '1.5rem', padding: '0 0.6rem', fontSize: '0.76rem', fontWeight: 600 }}>{REASON[k] || k}</span>) : <span className="z-small z-muted">Alike a little on everything, strongly on nothing</span>}
              </p>
            </Link>
          </li>); })}
      </ol>
      <p className="z-small z-muted mt-4 max-w-[70ch]" style={{ lineHeight: 1.5 }}>
        {campusOnly
          ? 'The score runs from 0 (nothing in common) to 1 (the same). Here it only covers the campus, so it runs higher than it does for a center with a full calendar, and it says nothing about how these centers program.'
          : 'The score runs from 0 (nothing in common) to 1 (the same). Similar means within a factor of four, with closer counting for more. The labels say which parts of the score were strong for that pair.'}
      </p>
    </Section>
  );
}

// The engine lists an idea as missing when none of the center's programs was grouped into it. Ideas overlap
// ("Seder 2", "Second Seder"), so a center can show a gap for something it plainly runs. This drops a gap
// when one of the center's own program names already contains every word of the idea's name.
const STOP = new Set(['the', 'a', 'an', 'in', 'at', 'of', 'and', 'with', 'for', 'to', 'on']);
const words = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));

function Gaps({ prof, cat, ideas, isMine, progs, lk }) {
  const [all, setAll] = useState(false);
  const gaps = useMemo(() => {
    const mine = progs.map((p) => new Set(words(p.name)));
    return prof.gaps.filter((g) => { const i = ideas[g.idea]; if (!i) return false; const w = words(i.label); return !(w.length && mine.some((m) => w.every((t) => m.has(t)))); });
  }, [prof, ideas, progs]);
  const n = prof.peers.length;
  const mySetting = prof.cat?.setting, inSetting = lk.label.setting[mySetting] ? settingCenters(mySetting, lk.label.setting[mySetting]) : null;
  if (!gaps.length) return (
    <Section id="gaps-h" title={isMine ? 'Ideas your peers run that you have not' : 'Ideas its peers run that this center has not'}><Empty>Nothing to list. No idea is run by three or more of this center's peers that it has not already run itself.</Empty></Section>
  );
  const shown = all ? gaps : gaps.slice(0, 9);
  return (
    <Section id="gaps-h" title={isMine ? `${plural(gaps.length, 'idea')} your peers run that you have not` : `${plural(gaps.length, 'idea')} its peers run that this center has not`} sub={`Each of these was run by at least three of the ${n} peers in the last three years, did at least about as well as normal where it ran, and has never appeared on this center's calendar under a name the engine could match. The lift is the idea's record across every center that ran it.${inSetting && gaps.some((g) => g.setting_share != null) ? ` The second share is how many of the other ${inSetting} ran it in the last three years.` : ''}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((g) => { const i = ideas[g.idea]; const img = (i.flyers || []).map((pid) => cat.prog(pid)?.img).find(Boolean); return (
          <Link key={g.idea} to={`/idea/${g.idea}`} className="z-card grid grid-cols-[84px_minmax(0,1fr)] gap-4 items-start" style={{ padding: '1.1rem' }}>
            <Flyer src={img} alt="" style={{ borderRadius: 12 }} />
            <div className="min-w-0 flex flex-col h-full">
              <p className="font-bold z-clamp2" style={{ fontSize: '1.08rem', lineHeight: 1.2 }}>{i.label}</p>
              <p className="z-small mt-1.5" style={{ lineHeight: 1.35 }}><span className="font-semibold">{g.peers} of {n} peers run it</span>{g.setting_share != null && inSetting ? `, and ${Math.round(g.setting_share * 100)}% of ${inSetting}` : ''}</p>
              <div className="mt-2.5"><Lift value={g.lift} /></div>
              <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.35 }}>{g.lift == null ? 'Too few sign-ups to score. ' : ''}{CONF[i.confidence] || 'Evidence'}: {plural(i.n_scored, 'scored event')} at {plural(i.centers_scored, 'center')}. {plural(g.centers, 'center')} have run it.</p>
            </div>
          </Link>); })}
      </div>
      {!all && gaps.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {gaps.length} ideas</button>}
      <p className="z-small z-muted mt-5 max-w-[70ch]" style={{ lineHeight: 1.5 }}>Ideas are matched by name and meaning, and the match is not perfect. An idea is left off when one of this center's own programs has the same words in its name. If the center runs the same thing under a different name, it can still show up here.</p>
    </Section>
  );
}

function Programs({ progs, cat }) {
  const [type, setType] = useState('all');
  const [n, setN] = useState(24);
  const counts = useMemo(() => { const m = new Map(); progs.forEach((p) => m.set(p.type, (m.get(p.type) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [progs]);
  const list = useMemo(() => progs.filter((p) => type === 'all' || p.type === type).sort((a, b) => b.lastDay - a.lastDay), [progs, type]);
  const pill = (on) => ({ height: '2.15rem', padding: '0 0.95rem', fontSize: '0.88rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' });
  const pick = (k) => { setType(k); setN(24); };
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-7" role="group" aria-label="Filter programs by type">
        <button type="button" className="z-pill" style={pill(type === 'all')} aria-pressed={type === 'all'} onClick={() => pick('all')}>All<span style={{ opacity: 0.6 }}>{progs.length}</span></button>
        {counts.map(([k, c]) => <button key={k} type="button" className="z-pill" style={pill(type === k)} aria-pressed={type === k} onClick={() => pick(k)}>{cat.types[k] || k}<span style={{ opacity: 0.6 }}>{c}</span></button>)}
      </div>
      <FlyerGrid>{list.slice(0, n).map((p) => <ProgramCard key={p.i} p={p} hideCenter note={`${p.n > 1 ? `${p.n} runs, last ` : ''}${fmtDate(p.last, { month: 'short', year: 'numeric' })}`} />)}</FlyerGrid>
      {list.length > n && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-8" onClick={() => setN(n + 24)}>Show {Math.min(24, list.length - n)} more of {list.length}</button>}
    </>
  );
}

export default function Center() {
  const { id } = useParams();
  const { data, error } = useData('centers.json', 'ideas.json', 'catalog');
  const [mine, setMine] = useMyCenter();
  const progs = useMemo(() => { if (!data) return []; const cat = data[2], c = cat.centerById.get(Number(id)); return c ? cat.programsOfCenter(c.idx).map((i) => cat.prog(i)) : []; }, [data, id]);
  if (error) return <ErrorNote error={error} what="This center" />;
  if (!data) return <Loading rows={3} h={200} />;
  const [cen, ideas, cat] = data;
  const c = cat.centerById.get(Number(id));
  if (!c) return (
    <div className="pt-10 sm:pt-16">
      <h1 className="z-h1">Center not found</h1>
      <div className="mt-8"><Empty>There is no center with the id "{id}". <Link to="/centers" className="z-link">See every center</Link>.</Empty></div>
    </div>
  );
  const st = cen.stats[c.id] || {}, prof = cen.profiles[c.id] || null;
  const lk = lookups(cen.facets);
  const campusOnly = prof?.basis === 'campus';
  const isMine = mine === c.id;
  const best = progs.filter((p) => p.scored >= 2 && p.adj != null).sort((a, b) => b.adj - a.adj).slice(0, 8);
  const types = Object.entries(st.types || {}).sort((a, b) => b[1] - a[1]);
  const traj = st.traj || [];
  const now = new Date(), curAy = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const partial = (t) => Number(t.ay.slice(0, 4)) === curAy;
  const nEvents = st.n || 0;
  const snapshot = [
    [nEvents.toLocaleString(), nEvents === 1 ? 'event on record' : 'events on record', st.first ? `since ${month(st.first)}${st.upcoming ? `, ${st.upcoming} more posted` : ''}` : null],
    [progs.length.toLocaleString(), progs.length === 1 ? 'program' : 'programs', 'one event name counts once'],
    [st.per_year != null ? num(st.per_year) : 'n/a', 'events a year', st.per_year != null ? 'over the last two years' : `needs ${cen.min_events} events on record`],
    [st.rsvp_share != null ? share(st.rsvp_share) : 'n/a', 'of events took sign-ups', st.reliable ? 'enough to score its events' : 'too few to score well'],
    [st.top5 != null ? num(st.top5) : 'n/a', 'biggest draw', st.top5 != null ? 'average of its five biggest events, last three years' : 'fewer than five events with sign-ups'],
    [st.med_regs != null ? Math.round(st.med_regs) : 'n/a', 'typical sign-ups', st.med_regs != null ? 'median, where sign-ups were taken' : 'no event took sign-ups'],
    [st.sd_regs != null ? Math.round(st.sd_regs) : 'n/a', 'at a typical Shabbat dinner', st.sd_regs != null ? `largest on record: ${st.sd_max}` : 'not enough dinners take sign-ups'],
    [st.themed != null ? share(st.themed) : 'n/a', 'of Shabbat dinners have a theme', st.themed != null ? null : 'fewer than 8 dinners on record'],
  ];
  return (
    <div>
      <div className="pt-10 sm:pt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-center">
        <div className="min-w-0">
          <p className="z-small"><Link to="/centers" className="z-link">All centers</Link></p>
          <div className="mt-5 flex items-center gap-4">
            <Logo src={cat.img(c.logo)} />
            <p className="font-semibold min-w-0" style={{ lineHeight: 1.3 }}>{c.campus}{place(c) && <span className="z-muted block">{place(c)}</span>}</p>
          </div>
          <h1 className="z-h1 mt-5" style={{ fontSize: 'clamp(2.1rem, 4.8vw, 3.7rem)' }}>{c.name}</h1>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {isMine
              ? <><span className="z-pill" style={{ height: '3.05rem', padding: '0 1.3rem', fontSize: '1rem', background: 'var(--go-tint)' }}><Check size={18} aria-hidden="true" />This is your center</span><button type="button" className="z-btn z-btn-soft" onClick={() => setMine(null)}>Clear</button></>
              : <button type="button" className="z-btn z-btn-go" onClick={() => setMine(c.id)}>Make this my center</button>}
            {c.site && <a href={c.site} target="_blank" rel="noopener noreferrer" className="z-btn z-btn-soft">{host(c.site)}<ExternalLink size={16} aria-hidden="true" /></a>}
          </div>
          {!isMine && <p className="z-small z-muted mt-3">The app then weighs what it shows toward centers like this one. It is only remembered in this browser.</p>}
        </div>
        <Photo src={cat.img(c.img)} alt={`${c.name}`} />
      </div>

      <Section id="snap-h" title="At a glance" tight sub={campusOnly ? `This center has ${plural(st.events ?? nEvents, 'event')} on the system, fewer than the ${cen.min_events} needed to read its programming. It is still placed by its campus, and its peers are matched on campus alone.` : null}>
        <div className="z-card grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          {snapshot.map(([v, l, s]) => <Stat key={l} value={v} label={l} sub={s} />)}
        </div>
        {prof && !campusOnly && !st.reliable && <p className="z-note mt-4" style={{ background: 'var(--fog)' }}>This center takes sign-ups for only {share(st.rsvp_share || 0)} of its events, so the lift numbers on its programs rest on little data.</p>}
      </Section>

      {prof && <Kind cen={cen} prof={prof} st={st} lk={lk} />}
      {prof && prof.peers?.length > 0 && <Peers prof={prof} cat={cat} lk={lk} />}
      {prof && <Gaps prof={prof} cat={cat} ideas={ideas} isMine={isMine} progs={progs} lk={lk} />}

      <Section id="runs-h" title={isMine ? 'What your center runs' : 'What this center runs'} sub={progs.length ? `${plural(progs.length, 'program')}, most recent first. The number under a flyer is how it did against this center's own normal for that kind of event.` : null}>
        {progs.length ? <Programs progs={progs} cat={cat} /> : <Empty>No programs on record for this center.</Empty>}
      </Section>

      {best.length > 0 && (
        <Section id="best-h" title="Its best performers" sub="Programs scored at least twice, ranked by how far they beat this center's own normal for that kind of event.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
            {best.map((p) => (
              <Link key={p.i} to={`/program/${p.key}`} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-center py-3.5 group" style={{ borderTop: '1px solid var(--fog-2)' }}>
                <Flyer src={p.img} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} />
                <div className="min-w-0"><p className="font-bold truncate group-hover:underline decoration-2 underline-offset-2">{p.name}</p><p className="z-small z-muted truncate">{p.typeLabel}. Scored {p.scored} times{p.reg != null ? `, ${Math.round(p.reg)} sign-ups typical` : ''}</p></div>
                <Lift value={p.adj} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      {types.length > 0 && (
        <Section id="mix-h" title="Its mix of events" sub={`Every one of the ${plural(nEvents, 'event')} on record, counted by type.`}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
            <div className="z-card">
              <HBars rows={types.slice(0, 12).map(([k, v]) => ({ key: k, label: cat.types[k] || k, value: v, tip: [cat.types[k] || k, plural(v, 'event'), `${share(v / Math.max(1, nEvents))} of its events`] }))} format={(v) => v.toLocaleString()} />
            </div>
            {traj.length > 1 && (
              <div className="z-card">
                <h3 className="font-bold">Events by school year</h3>
                <div className="mt-5">
                  <Columns values={traj.map((t) => t.events)} labels={traj.map((t) => t.ay.slice(2))} height={130} dim={(i) => partial(traj[i])}
                    tipFor={(i) => [`School year ${traj[i].ay}${partial(traj[i]) ? ' (so far)' : ''}`, plural(traj[i].events, 'event'), traj[i].sd != null ? `Typical Shabbat dinner: ${Math.round(traj[i].sd)} sign-ups (${traj[i].sd_n} dinners)` : 'Too few dinners with sign-ups to give a typical number']} />
                </div>
                <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45 }}>{traj.some(partial) ? 'The lighter bar is the school year in progress. ' : ''}{st.per_year != null ? `About ${Math.round(st.per_year)} events a year over the last two years.` : ''}</p>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
