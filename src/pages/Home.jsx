import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useData, useMyCenter, fmtDate, fmtDay, plural, centerLabel, liftShort } from '../lib/data';
import { Section, Loading, ErrorNote, Flyer, Lift, StatusPill, Seg, Stat, ProgramCard, FlyerGrid, Empty, CenterLink } from '../components/bits';

const HOL_NOTE = (h) => (h.days === 0 ? 'today' : h.days === 1 ? 'tomorrow' : `in ${h.days} days`);

// The coming Friday: what centers have posted, and what is usually run that week.
function FridayCard({ fri, themes, cat }) {
  const byId = new Map(themes.themes.map((t) => [t.id, t]));
  const counts = new Map();
  fri.live.forEach((e) => e.themes.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const themed = fri.live.filter((e) => e.themes.length || e.one_off);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <section className="p-6 sm:p-8 flex flex-col" style={{ background: 'var(--go)', color: '#fff', borderRadius: 'var(--r-lg)' }} aria-labelledby="fri-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-bold z-small">
        <span>Shabbat dinner themes this week</span>
        <span style={{ opacity: 0.85 }}>Friday, {fmtDay(fri.date)}{fri.parsha ? `, Parshat ${fri.parsha}` : ''}</span>
      </div>
      <h2 id="fri-h" className="z-h1 mt-4" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.2rem)' }}>
        {themed.length ? `${themed.length} of ${fri.posted} posted dinners have a theme` : fri.posted ? `${fri.posted} dinners posted, none themed yet` : 'No dinners posted yet'}
      </h2>
      {top.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {top.map(([id, n]) => <Link key={id} to={`/themes/${id}`} className="z-pill hover:opacity-90" style={{ background: '#fff', color: '#000', height: '2.1rem', fontSize: '0.92rem' }}>{byId.get(id)?.label || id}{n > 1 && <span style={{ opacity: 0.55 }}>{n}</span>}</Link>)}
          {themed.filter((e) => e.one_off && e.name.length <= 34).slice(0, 3).map((e) => <span key={e.id} className="z-pill" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', height: '2.1rem', fontSize: '0.92rem' }} title={`${centerLabel(cat.centerById.get(e.center))}: a one-off`}>{e.name.length > 30 ? e.name.slice(0, 29) + '…' : e.name}</span>)}
        </div>
      )}
      {fri.usual.length > 0 && (
        <div className="mt-7 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.25)' }}>
          <p className="font-bold">Usually run this week</p>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {fri.usual.slice(0, 6).map((u) => (
              <li key={u.id}><Link to={`/themes/${u.id}`} className="group flex items-baseline justify-between gap-3">
                <span className="font-bold truncate group-hover:underline decoration-2 underline-offset-2">{u.label}</span>
                <span className="z-small whitespace-nowrap" style={{ opacity: 0.86 }}>{u.near} of {u.of} past runs{u.lift ? `, ${liftShort(u.lift)}` : ''}</span>
              </Link></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-7 flex flex-wrap gap-2.5 pt-1">
        <Link to="/themes" className="z-btn z-btn-white z-btn-sm">All themes<ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/themes?view=week" className="z-btn z-btn-glass z-btn-sm">The next six Fridays</Link>
      </div>
    </section>
  );
}

function IdeaTile({ t, cat, note }) {
  const img = cat.img(t.img) || (t.img_pid != null ? cat.prog(t.img_pid)?.img : null) || (t.top_pid != null ? cat.prog(t.top_pid)?.img : null);
  return (
    <Link to={`/idea/${t.idea}`} className="block group min-w-0">
      <Flyer src={img} alt="" />
      <p className="font-bold mt-2.5 z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22 }}>{t.label}</p>
      <p className="z-small z-muted mt-0.5">{note}</p>
    </Link>
  );
}

function Gaps({ mine, centers, ideas, cat }) {
  const prof = centers.profiles[mine];
  const me = cat.centerById.get(mine);
  if (!prof || !prof.gaps.length) return null;
  const byId = new Map(ideas.map((i) => [i.id, i]));
  return (
    <Section id="gaps-h" title={`Centers like ${centerLabel(me)} run these. You never have.`} sub={`Your twelve closest matches on kind of campus, Jewish population, draw and what they program. An idea is listed when at least three of them ran it in the last three years.`} action={<Link to={`/center/${mine}`} className="z-btn z-btn-soft z-btn-sm">Your center's page</Link>}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {prof.gaps.slice(0, 9).map((g) => { const i = byId.get(g.idea); if (!i) return null; return (
          <Link key={g.idea} to={`/idea/${g.idea}`} className="z-card flex items-center justify-between gap-4">
            <div className="min-w-0"><p className="font-bold truncate">{i.label}</p><p className="z-small z-muted mt-0.5">{g.peers} of your 12 peers, {plural(i.centers, 'center')} overall</p></div>
            <Lift value={g.lift} size="sm" />
          </Link>); })}
      </div>
    </Section>
  );
}

export default function Home() {
  const { data, error } = useData('home.json', 'themes.json', 'catalog');
  const extra = useData('centers.json', 'ideas.json');
  const [mine] = useMyCenter();
  const [tab, setTab] = useState('hot');
  if (error) return <ErrorNote error={error} what="The front page" />;
  if (!data) return <Loading rows={3} h={220} />;
  const [home, themes, cat] = data;
  const p = home.pulse, ctx = home.context;
  const lists = { hot: home.hot, rising: home.rising, usual: home.usual, fresh: home.new };
  const note = (t) => (tab === 'hot' ? `${plural(t.centers, 'center')} now${t.last_year ? `, ${t.last_year} a year ago` : ''}`
    : tab === 'rising' ? `${t.centers} centers now, ${t.last_year} a year ago`
    : tab === 'usual' ? `${Math.round(t.share * 100)}% of its past runs fall in the next four weeks`
    : `${plural(t.centers, 'center')}, first seen ${fmtDate(t.first.date, { month: 'short', year: 'numeric' })}`);
  const empty = { hot: 'Nothing is being run by two or more centers right now.', rising: 'Nothing is clearly up on the same weeks last year.', usual: 'Nothing has a strong pull toward the next four weeks.', fresh: 'No new idea has reached a second center this year.' };
  return (
    <div>
      <div className="pt-8 sm:pt-12 grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-stretch">
        {home.friday ? <FridayCard fri={home.friday} themes={themes} cat={cat} /> : <div className="z-card">No Friday data yet.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
          <section className="z-card" aria-labelledby="pulse-h">
            <h1 id="pulse-h" className="font-bold">{fmtDate(home.today, { weekday: 'long', month: 'long', day: 'numeric' })}<span className="z-muted font-semibold">, {ctx.hebrew}</span></h1>
            <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6">
              <Stat value={p.active_centers_now} label="centers active now" sub={`${p.active_centers_last_year} a year ago`} />
              <Stat value={p.next7} label="events in the next 7 days" sub={`${p.upcoming_events} posted in all`} />
              <Stat value={p.signups_so_far.toLocaleString()} label="sign-ups so far" sub="for events not yet held" />
              <Stat value={p.ran_last14.toLocaleString()} label="events held" sub="in the last 14 days" />
            </div>
            <Link to="/coming" className="z-btn z-btn-soft z-btn-sm mt-6" style={{ background: '#fff' }}>See what is coming up<ArrowRight size={16} aria-hidden="true" /></Link>
          </section>
          <section className="z-card" aria-labelledby="cal-h">
            <h2 id="cal-h" className="font-bold">On the calendar</h2>
            <ul className="mt-3">
              {[...ctx.holidays.map((h) => ({ ...h, kind: 'Jewish' })), ...ctx.secular.map((h) => ({ ...h, kind: '' }))].sort((a, b) => a.days - b.days).slice(0, 6).map((h) => (
                <li key={h.key + h.date} className="py-2.5 flex items-baseline justify-between gap-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
                  <span className="font-bold truncate">{h.label}</span>
                  <span className="z-small z-muted whitespace-nowrap">{fmtDay(h.date)}, {HOL_NOTE(h)}</span>
                </li>
              ))}
            </ul>
            <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45 }}>Every date in the app is read on three calendars: the civil year, the Jewish year and each center's own semester.</p>
          </section>
        </div>
      </div>

      <Section id="trend-h" title="Events trending now" sub={`"Now" is a rolling window: the last ${home.window.back} days, with final numbers, and the next ${home.window.ahead}, already posted. A calendar month would be empty on the 1st.`}
        action={<Seg value={tab} onChange={setTab} label="Which list" options={[['hot', 'Most centers'], ['rising', 'Up on last year'], ['usual', 'Usual for now'], ['fresh', 'New this year']]} />}>
        {lists[tab].length ? <FlyerGrid>{lists[tab].slice(0, 12).map((t) => <IdeaTile key={t.idea} t={t} cat={cat} note={note(t)} />)}</FlyerGrid> : <Empty>{empty[tab]}</Empty>}
        <div className="mt-8"><Link to="/ideas" className="z-btn z-btn-soft z-btn-sm">Browse every idea, or test your own<ArrowRight size={16} aria-hidden="true" /></Link></div>
      </Section>

      <Section id="wins-h" title="What drew a crowd in the last three weeks" sub="Ranked by how far each event beat its own center's normal for that kind of event, not by raw sign-ups. A small center's hit counts the same as a big one's.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {home.wins.slice(0, 12).map((w) => { const c = cat.centerById.get(w.center), pr = cat.prog(w.pid); return (
            <Link key={w.id} to={`/program/${pr.key}`} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-center py-3.5 group" style={{ borderTop: '1px solid var(--fog-2)' }}>
              <Flyer src={cat.img(w.img)} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} />
              <div className="min-w-0"><p className="font-bold truncate group-hover:underline decoration-2 underline-offset-2">{w.name}</p><p className="z-small z-muted truncate">{centerLabel(c)}, {fmtDay(w.date)}. {w.regs} signed up, {Math.round(w.base)} is typical</p></div>
              <Lift value={w.lift} />
            </Link>); })}
        </div>
      </Section>

      {mine && extra.data && <Gaps mine={mine} centers={extra.data[0]} ideas={extra.data[1]} cat={cat} />}

      <Section id="go-h" title="Where to go from here" tight>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[['/ideas', 'Test an idea', 'Type any event idea. See who has run something like it, how it did, when it works and what their flyers looked like.'],
            ['/timing', 'Pick the day and time', 'Which nights and hours work for each kind of event, fall against spring, and how a semester rises and falls.'],
            ['/library', 'Search flyers and copy', `${cat.count.toLocaleString()} programs from ${cat.centers.length} centers, searchable by meaning, with every flyer and description.`]].map(([to, t, d]) => (
            <Link key={to} to={to} className="z-card"><h3 className="z-h3">{t}</h3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>{d}</p></Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
