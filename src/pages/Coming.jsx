import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useData, useMyCenter, fmtDate, fmtDay, plural, centerLabel } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Seg, HBars, Flyer, CenterLink } from '../components/bits';

const DAY = 86400e3;
const PER_DAY = 10; // rows shown per day before "show all"; a Friday can have 80
const noon = (iso) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z');
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const HOL = { rosh_hashana: 'Rosh Hashana', yom_kippur: 'Yom Kippur', sukkot: 'Sukkot', simchat_torah: 'Simchat Torah', chanukah: 'Chanukah', tu_bshvat: "Tu B'Shvat", purim: 'Purim', pesach: 'Pesach', yom_hashoah: 'Yom HaShoah', yom_haatzmaut: "Yom Ha'atzmaut", lag_baomer: 'Lag BaOmer', shavuot: 'Shavuot', tisha_bav: "Tisha B'Av" };

// "2026-10-16T19:30" -> "7:30pm". The time is the center's own local time. Midnight means no time was set.
function timeLabel(dt) {
  const h = Number(dt.slice(11, 13)), m = dt.slice(14, 16);
  if (h === 0 && m === '00') return null;
  return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : ':' + m}${h < 12 ? 'am' : 'pm'}`;
}

const pillStyle = (on) => ({ height: '2.1rem', fontSize: '0.88rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', flex: 'none' });

function EventRow({ e, cat, ideaOf, themeOf }) {
  const p = cat.prog(e.pid), c = cat.centerById.get(e.center);
  const idea = p && p.idea >= 0 ? ideaOf.get(p.idea) : null;
  const time = timeLabel(e.dt);
  const to = p ? `/program/${p.key}` : null;
  const meta = [time || 'Time not set', e.recurring ? 'Repeats' : null, e.offsite ? 'Away from the center' : null].filter(Boolean);
  const why = [e.cap ? `Room for ${e.cap.toLocaleString()}` : null, e.prev ? `${e.prev.regs.toLocaleString()} signed up last time it ran (${fmtDay(e.prev.date)})` : null,
    e.base != null ? `${Math.round(e.base)} is the usual for ${cat.types[e.type].toLowerCase()} there, over the last year` : null].filter(Boolean).join('. ');
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[56px_minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-3.5 items-start" style={{ borderTop: '1px solid var(--fog-2)' }}>
      {to ? <Link to={to} tabIndex={-1} aria-hidden="true"><Flyer src={cat.img(e.img)} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} /></Link> : <Flyer src={cat.img(e.img)} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} />}
      <div className="min-w-0">
        <p className="font-bold z-clamp2" style={{ lineHeight: 1.25 }}>{to ? <Link to={to} className="hover:underline decoration-2 underline-offset-2">{e.name}</Link> : e.name}</p>
        <p className="z-small z-muted mt-0.5 truncate"><CenterLink c={c} className="font-semibold text-black" />{meta.map((m) => <span key={m}>, {m}</span>)}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 z-small">
          <span className="z-pill">{cat.types[e.type] || e.type}</span>
          {e.hol && HOL[e.hol] && <span className="z-pill">{HOL[e.hol]}</span>}
          {idea && <Link to={`/idea/${idea.id}`} className="z-link" title={`${plural(idea.centers, 'center')} have run this idea`}>Idea: {idea.label}</Link>}
          {e.themes.map((t) => <Link key={t} to={`/themes/${t}`} className="z-link">Theme: {themeOf.get(t)?.label || t}</Link>)}
        </p>
      </div>
      <div className="col-start-2 sm:col-start-3 sm:text-right sm:min-w-[7.5rem] flex sm:block items-baseline gap-x-2 flex-wrap" title={why || undefined}>
        {e.regs > 0
          ? <p className="whitespace-nowrap"><span className="z-num" style={{ fontSize: '1.25rem' }}>{e.regs.toLocaleString()}</span> <span className="z-small font-semibold">signed up so far</span></p>
          : <p className="z-small z-muted whitespace-nowrap">No sign-ups yet</p>}
        {e.base != null && <p className="z-small z-muted whitespace-nowrap">{Math.round(e.base)} is usual there</p>}
      </div>
    </li>
  );
}

// One day's rows. A busy day shows its first few and a button for the rest; a search or a kind filter shows all.
function DayList({ d, all, cat, ideaOf, themeOf }) {
  const [open, setOpen] = useState(false);
  const rest = d.events.length - PER_DAY, cut = !all && !open && rest > 0;
  return (
    <div className="min-w-0">
      <ul>{(cut ? d.events.slice(0, PER_DAY) : d.events).map((e) => <EventRow key={e.id} e={e} cat={cat} ideaOf={ideaOf} themeOf={themeOf} />)}</ul>
      {cut && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-4" onClick={() => setOpen(true)}>Show the other {rest} on {fmtDate(d.day, { weekday: 'long' })}</button>}
    </div>
  );
}

export default function Coming() {
  const { data, error } = useData('coming.json', 'catalog');
  const extra = useData('ideas.json', 'themes.json', 'centers.json');
  const [mine] = useMyCenter();
  const [range, setRange] = useState(30);
  const [type, setType] = useState(null);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [staples, setStaples] = useState('all');

  const today = data ? noon(data[0].today) : 0;
  const all = useMemo(() => (data ? data[0].events.map((e) => ({ ...e, day: e.dt.slice(0, 10), off: Math.round((noon(e.dt) - today) / DAY) })) : []), [data, today]);
  const peers = useMemo(() => { const pr = mine && extra.data ? extra.data[2].profiles[mine] : null; return pr ? new Set(pr.peers.map((x) => x.id)) : null; }, [mine, extra.data]);
  const usePeers = who === 'peers' && peers;
  // The window: the date range and, when asked, only centers like yours. The summary and the list both read it.
  const inWindow = useMemo(() => all.filter((e) => (range === 'all' || e.off <= range) && (!usePeers || peers.has(e.center))), [all, range, usePeers, peers]);
  const s = q.trim().toLowerCase();
  const shown = useMemo(() => inWindow.filter((e) => (!type || e.type === type) && (!s || e.name.toLowerCase().includes(s))), [inWindow, type, s]);

  if (error) return <ErrorNote error={error} what="The coming-up page" />;
  if (!data) return <Loading rows={4} h={160} />;
  const [coming, cat] = data;
  const ideaOf = new Map(extra.data ? extra.data[0].map((i) => [i.id, i]) : []);
  const themeOf = new Map(extra.data ? extra.data[1].themes.map((t) => [t.id, t]) : []);
  const me = mine ? cat.centerById.get(mine) : null;

  const nCenters = new Set(all.map((e) => e.center)).size;
  const withSignups = all.filter((e) => e.regs > 0).length;
  const lastDay = all.length ? all[all.length - 1].day : coming.today;
  const count = (n) => all.filter((e) => e.off <= n && (!usePeers || peers.has(e.center))).length;

  // summary: kinds of event, and the ideas the most centers have on the calendar
  const byType = new Map();
  inWindow.forEach((e) => byType.set(e.type, (byType.get(e.type) || 0) + 1));
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const byIdea = new Map();
  inWindow.forEach((e) => { const id = cat.prog(e.pid)?.idea; if (id != null && id >= 0) { if (!byIdea.has(id)) byIdea.set(id, { centers: new Set(), n: 0 }); const x = byIdea.get(id); x.centers.add(e.center); x.n += 1; } });
  const ideaRows = [...byIdea.entries()].map(([id, x]) => ({ id, centers: x.centers.size, n: x.n, idea: ideaOf.get(id) })).filter((r) => staples === 'all' || !r.idea?.staple).sort((a, b) => b.centers - a.centers || b.n - a.n).slice(0, 8);
  const noIdea = inWindow.filter((e) => !(cat.prog(e.pid)?.idea >= 0)).length;
  const windowCenters = new Set(inWindow.map((e) => e.center)).size;
  const rangeWords = range === 'all' ? 'on the calendar' : `in the next ${range} days`;

  // weeks run Sunday through Shabbat, the way a center's week does
  const dow = new Date(today).getUTCDay();
  const week0 = today - dow * DAY;
  const weeks = [];
  shown.forEach((e) => {
    const w = Math.floor((noon(e.dt) - week0) / (7 * DAY));
    let wk = weeks[weeks.length - 1];
    if (!wk || wk.w !== w) { wk = { w, start: week0 + w * 7 * DAY, days: [], n: 0, centers: new Set() }; weeks.push(wk); }
    let d = wk.days[wk.days.length - 1];
    if (!d || d.day !== e.day) { d = { day: e.day, off: e.off, events: [] }; wk.days.push(d); }
    d.events.push(e); wk.n += 1; wk.centers.add(e.center);
  });
  const weekName = (wk) => (wk.w === 0 ? 'This week' : wk.w === 1 ? 'Next week' : `Week of ${new Date(wk.start).getUTCFullYear() === new Date(today).getUTCFullYear() ? fmtDay(isoOf(wk.start)) : fmtDate(isoOf(wk.start))}`);
  const weekSpan = (wk) => { const a = isoOf(Math.max(wk.start, today)), b = isoOf(wk.start + 6 * DAY); return a === b ? fmtDay(a) : `${fmtDay(a)} to ${a.slice(0, 7) === b.slice(0, 7) ? Number(b.slice(8)) : fmtDay(b)}`; };
  const dayName = (d) => `${d.off === 0 ? 'Today, ' : d.off === 1 ? 'Tomorrow, ' : ''}${fmtDate(d.day, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  const filtered = type || s;

  return (
    <div>
      <PageHead title="Coming up across the network"
        lede={`${plural(all.length, 'event')} are posted at ${plural(nCenters, 'center')}, from today, ${fmtDay(coming.today)}, through ${fmtDate(lastDay)}. ${withSignups} of them have sign-ups so far. Counts for events this far out are early and will keep climbing.`} />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Seg value={range} onChange={setRange} label="How far ahead" options={[[7, <>Next 7 days <span style={{ opacity: 0.6 }}>{count(7)}</span></>], [30, <>Next 30 days <span style={{ opacity: 0.6 }}>{count(30)}</span></>], ['all', <>Everything posted <span style={{ opacity: 0.6 }}>{count(Infinity)}</span></>]]} />
        {me && peers && <Seg value={usePeers ? 'peers' : 'all'} onChange={setWho} label="Which centers" options={[['all', 'Every center'], ['peers', `Only centers like ${centerLabel(me)}`]]} />}
      </div>
      {me && extra.data && !peers && <p className="z-small z-muted mt-3">{centerLabel(me)} has too little on record to have a peer list, so every center is shown.</p>}
      {usePeers && <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45 }}>Showing only the twelve centers most like {centerLabel(me)} by campus, sign-up numbers and what they program. {windowCenters} of the twelve have something posted {rangeWords}.</p>}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="z-card" aria-labelledby="kinds-h">
          <h2 id="kinds-h" className="z-h3">What kinds of events are coming</h2>
          <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>{plural(inWindow.length, 'event')} at {plural(windowCenters, 'center')} {rangeWords}, counted by kind.</p>
          <div className="mt-5">
            {typeRows.length ? <HBars rows={typeRows.slice(0, 10).map(([t, n]) => ({ key: t, label: cat.types[t] || t, value: n, tip: [cat.types[t] || t, `${plural(n, 'event')}, ${Math.round((n / inWindow.length) * 100)}% of what is posted`] }))} /> : <p className="z-muted">Nothing is posted in this window.</p>}
          </div>
          {typeRows.length > 10 && <p className="z-small z-muted mt-4">And {typeRows.slice(10).reduce((a, x) => a + x[1], 0)} more across {plural(typeRows.length - 10, 'other kind')}.</p>}
        </section>
        <section className="z-card" aria-labelledby="shared-h">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <h2 id="shared-h" className="z-h3">Ideas the most centers have posted</h2>
            <Seg small white value={staples} onChange={setStaples} label="Which ideas" options={[['all', 'All ideas'], ['special', 'Without weekly staples']]} />
          </div>
          <p className="z-small z-muted mt-2" style={{ lineHeight: 1.45 }}>An idea is the same program run by several centers, ranked here by how many have it posted {rangeWords}. {staples === 'all' ? 'Weekly staples always fill the top.' : 'Weekly staples are left out.'} {noIdea > 0 && `${noIdea} of the ${inWindow.length} events are one-center programs and belong to no idea.`}</p>
          {!extra.data ? <div className="z-skel mt-5" style={{ height: 200, background: 'var(--fog-2)' }} /> : ideaRows.length ? (
            <ol className="mt-4">
              {ideaRows.map((r) => (
                <li key={r.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
                  <Link to={`/idea/${r.id}`} className="group flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0 truncate"><span className="font-bold group-hover:underline decoration-2 underline-offset-2">{r.idea?.label || `Idea ${r.id}`}</span>{r.idea?.staple && <span className="z-small z-muted hidden sm:inline">, a weekly staple</span>}</span>
                    <span className="z-small font-semibold whitespace-nowrap tabular-nums">{plural(r.centers, 'center')}{r.n > r.centers ? <span className="z-muted font-normal">, {r.n} dates</span> : null}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className="z-muted mt-5">No shared idea is posted in this window.</p>}
        </section>
      </div>

      <Section id="list-h" tight title={filtered ? `${plural(shown.length, 'event')} match` : `Every posted event, ${range === 'all' ? 'week by week' : rangeWords}`}
        sub="Each row is one date. The number on the right is sign-ups so far, next to what is usual for that kind of event at that center. Many centers do not take sign-ups for every event, so no sign-ups does not mean an empty room.">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-3 items-start">
          <div className="relative">
            <Search size={17} aria-hidden="true" className="absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--grey)' }} />
            <input className="z-input" style={{ paddingLeft: '2.5rem', paddingRight: q ? '2.6rem' : undefined }} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search event names" aria-label="Search event names" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear the search" className="absolute inline-flex items-center justify-center" style={{ right: 8, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 99 }}><X size={16} /></button>}
          </div>
          <div className="flex md:flex-wrap gap-2 overflow-x-auto z-scroll pb-1 -mx-5 px-5 sm:mx-0 sm:px-0" role="group" aria-label="Kind of event">
            <button type="button" className="z-pill" style={pillStyle(!type)} aria-pressed={!type} onClick={() => setType(null)}>All kinds <span style={{ opacity: 0.6 }}>{inWindow.length}</span></button>
            {typeRows.map(([t, n]) => <button key={t} type="button" className="z-pill" style={pillStyle(type === t)} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>{cat.types[t] || t} <span style={{ opacity: 0.6 }}>{n}</span></button>)}
          </div>
        </div>

        {!shown.length && (
          <div className="mt-8"><Empty>No posted event matches{s ? ` "${q.trim()}"` : ''}{type ? `${s ? ' in' : ''} ${(cat.types[type] || type).toLowerCase()}` : ''} {rangeWords}.{' '}
            <button type="button" className="z-link" onClick={() => { setQ(''); setType(null); setRange('all'); }}>Show everything posted</button></Empty></div>
        )}

        {weeks.map((wk) => (
          <div key={wk.w} className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-3" style={{ borderBottom: '2px solid var(--ink)' }}>
              <h3 className="z-h2" style={{ fontSize: 'clamp(1.35rem, 2.2vw, 1.7rem)' }}>{weekName(wk)}{wk.w < 2 && <span className="z-muted" style={{ fontWeight: 600 }}>, {weekSpan(wk)}</span>}</h3>
              <p className="z-small z-muted font-semibold">{plural(wk.n, 'event')} at {plural(wk.centers.size, 'center')}</p>
            </div>
            {wk.days.map((d) => (
              <div key={d.day} className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] gap-x-8 mt-8">
                <div className="lg:sticky lg:self-start pb-2 lg:pb-0" style={{ top: '5rem' }}>
                  <h4 className="font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.08rem', lineHeight: 1.2 }}>{dayName(d)}</h4>
                  <p className="z-small z-muted mt-0.5">{plural(d.events.length, 'event')}</p>
                </div>
                <DayList d={d} all={!!filtered} cat={cat} ideaOf={ideaOf} themeOf={themeOf} />
              </div>
            ))}
          </div>
        ))}
      </Section>
    </div>
  );
}
