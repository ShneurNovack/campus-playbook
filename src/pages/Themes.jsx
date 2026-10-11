import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { useData, fmtDate, fmtDay, plural, centerLabel, liftShort, liftPct } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Flyer, Lift, StatusPill, Seg, Columns, FlyerGrid, tip } from '../components/bits';

const JH = { rosh_hashana: 'Rosh Hashana', yom_kippur: 'Yom Kippur', sukkot: 'Sukkot', simchat_torah: 'Simchat Torah', chanukah: 'Chanukah', tu_bshvat: "Tu B'Shvat", purim: 'Purim', pesach: 'Pesach', yom_hashoah: 'Yom HaShoah', yom_haatzmaut: "Yom Ha'atzmaut", lag_baomer: 'Lag BaOmer', shavuot: 'Shavuot', tisha_bav: "Tisha B'Av" };
const SEC = { new_year: 'New Year', super_bowl: 'Super Bowl', valentines: "Valentine's Day", st_patricks: "St. Patrick's Day", cinco_de_mayo: 'Cinco de Mayo', mothers_day: "Mother's Day", july_4: 'July 4', sept_11: '9/11', oct_7: 'October 7', halloween: 'Halloween', thanksgiving: 'Thanksgiving' };
const pct = (x) => `${Math.round(x * 100)}%`;
// "+16%" as words about a plain dinner, which is the yardstick everywhere on this page.
const vsPlain = (x) => { const p = liftPct(x); return Math.abs(p) < 4 ? 'about the same as a plain dinner' : x >= 2 ? `${x.toFixed(1)} times a plain dinner` : `${Math.abs(p)}% ${p > 0 ? 'above' : 'below'} a plain dinner`; };

const evidence = (t) => `${t.confidence === 'thin' ? 'Thin: ' : t.confidence === 'some' ? 'Some: ' : ''}${t.n_measured} scored, ${plural(t.centers_measured, 'center')}`;
// A theme's lift with the evidence under it. Thin evidence is drawn thin: grey, no solid dot, a question mark.
function ThemeLift({ t, right, capClass = '' }) {
  if (t.lift == null || !t.n_measured) return <span className="z-small z-muted">No sign-up data</span>;
  const thin = t.confidence === 'thin';
  return (
    <span className="inline-flex flex-col min-w-0" style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
      {thin
        ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title="Too few scored dinners to trust this number"><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, border: '2px dotted var(--mist)', flex: 'none' }} /><span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '0.95rem', color: 'var(--grey)' }}>{liftShort(t.lift)}?</span></span>
        : <Lift value={t.lift} size="sm" />}
      <span className={`z-small z-muted whitespace-nowrap ${capClass}`}>{evidence(t)}</span>
    </span>
  );
}

// Ordered bars with the label above each bar. Used for the frequency finding.
function FreqBars({ rows }) {
  const mx = Math.max(0.01, ...rows.map((r) => r.lift - 1));
  const best = Math.max(...rows.map((r) => r.lift));
  return (
    <ol className="space-y-4">
      {rows.map((r) => {
        const [name, detail] = r.label.split(' (');
        return (
          <li key={r.label} tabIndex={0} {...tip([r.label, `Themed dinners: ${vsPlain(r.lift)}`, `${r.n.toLocaleString()} scored dinners at ${r.centers} centers`, `${pct(r.hit)} beat plain dinners by 20% or more`])}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold min-w-0">{name}{detail && <span className="z-muted font-normal z-small"> {detail.replace(')', '')}</span>}</span>
              <span className="z-num" style={{ fontSize: '1.15rem' }}>{liftShort(r.lift)}</span>
            </div>
            <div className="mt-1.5" style={{ height: 14 }}><div style={{ width: `${Math.max(1.5, ((r.lift - 1) / mx) * 100)}%`, height: '100%', background: r.lift === best ? 'var(--go)' : 'var(--ink)', borderRadius: '0 4px 4px 0' }} /></div>
            <div className="z-small z-muted mt-1">{r.n.toLocaleString()} scored dinners at {r.centers} centers</div>
          </li>
        );
      })}
    </ol>
  );
}

// Families can land below a plain dinner, so the bars grow both ways from a zero line.
function FamilyBars({ rows, onPick }) {
  const pos = Math.max(0.01, ...rows.map((r) => r.lift - 1)), neg = Math.max(0, ...rows.map((r) => 1 - r.lift));
  const span = pos + neg, zero = (neg / span) * 100;
  return (
    <ul className="space-y-3.5 sm:space-y-2.5">
      {rows.map((r, i) => {
        const up = r.lift >= 1, w = (Math.abs(r.lift - 1) / span) * 100;
        return (
          <li key={r.family} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_3.6rem] gap-x-3 gap-y-1.5 items-center" {...tip([r.label, `Themed dinners: ${vsPlain(r.lift)}`, `${r.n} scored dinners at ${r.centers} centers`, `${pct(r.hit)} beat plain dinners by 20% or more`])}>
            <span className="min-w-0">
              <button type="button" onClick={() => onPick(r.family)} className="font-bold hover:underline decoration-2 underline-offset-2 text-left" aria-label={`Show ${r.label} themes in the directory`}>{r.label}</button>
              <span className="block z-small z-muted">{r.n} scored, {r.centers} centers</span>
            </span>
            <span className="relative block order-3 sm:order-none col-span-2 sm:col-span-1" style={{ height: 14 }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: `${zero}%`, top: -5, bottom: -5, width: 1, background: 'var(--grey)', opacity: 0.45 }} />
              <span style={{ position: 'absolute', top: 0, bottom: 0, ...(up ? { left: `${zero}%`, borderRadius: '0 4px 4px 0' } : { right: `${100 - zero}%`, borderRadius: '4px 0 0 4px' }), width: `${Math.max(0.8, w)}%`, background: up ? (i === 0 ? 'var(--go)' : 'var(--ink)') : 'var(--cool)' }} />
            </span>
            <span className="z-num text-right" style={{ fontSize: '1.05rem' }}>{liftShort(r.lift)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Findings({ th, onPickFamily }) {
  const o = th.overall, tot = th.totals, fr = th.frequency, fams = [...th.families].sort((a, b) => b.lift - a.lift);
  const first = fr[0], last = fr[fr.length - 1];
  const years = th.by_year.filter((y) => y.dinners > 0);
  const curAy = (() => { const d = new Date(th.today + 'T12:00:00'), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; })();
  const below = fams.filter((f) => f.lift < 0.97);
  const top = fams[0];
  const topNames = top ? th.themes.filter((t) => t.family === top.family).sort((x, y) => y.n - x.n).slice(0, 2).map((t) => t.label) : [];
  return (
    <div className="mt-10 sm:mt-14 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="p-6 sm:p-8 flex flex-col" style={{ background: 'var(--go)', color: '#fff', borderRadius: 'var(--r-lg)' }} aria-labelledby="f-overall">
          <h2 id="f-overall" className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, lineHeight: 1.3 }}>A themed dinner against the same center's plain dinners</h2>
          <p className="z-num mt-5" style={{ fontSize: 'clamp(3.6rem, 9vw, 6rem)' }}>{o.lift == null ? 'n/a' : liftShort(o.lift)}</p>
          <p className="mt-5" style={{ lineHeight: 1.5, color: 'rgba(255,255,255,0.92)', maxWidth: '46ch' }}>
            {o.lift == null ? 'There are not enough scored themed dinners yet.' : <>The typical themed dinner drew {vsPlain(o.lift).replace(' a plain dinner', '')} the plain dinners that center held within 45 days of it. {pct(o.hit)} of them beat the plain dinners by 20% or more.</>}
          </p>
          <p className="z-small mt-auto pt-6" style={{ color: 'rgba(255,255,255,0.8)' }}>From {o.themed_measured.toLocaleString()} themed dinners with a sign-up count, across {th.themes.length} themes.</p>
        </section>
        <section className="z-card flex flex-col" aria-labelledby="f-common">
          <h2 id="f-common" className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, lineHeight: 1.3 }}>How common a theme is</h2>
          <p className="z-num mt-5" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)' }}>1 in {Math.round(tot.dinners / Math.max(1, tot.themed))}</p>
          <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>{tot.themed.toLocaleString()} of {tot.dinners.toLocaleString()} Shabbat dinners at {tot.centers} centers carried a theme. The bars show the share in each academic year.{years.length && years[years.length - 1].ay === curAy ? ` ${curAy} is still in progress.` : ''}</p>
          <div className="mt-auto pt-6">
            <Columns values={years.map((y) => Math.round((y.themed / y.dinners) * 100))} labels={years.map((y) => y.ay.slice(2))} height={96} format={(v) => `${v}%`} dim={(i) => years[i].ay === curAy}
              tipFor={(i) => [`Academic year ${years[i].ay}`, `${pct(years[i].themed / years[i].dinners)} of dinners had a theme`, `${years[i].themed.toLocaleString()} of ${years[i].dinners.toLocaleString()} dinners at ${years[i].centers} centers`]} />
          </div>
        </section>
      </div>

      {fr.length >= 2 && (
        <section className="z-card grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-12 gap-y-7" aria-labelledby="f-freq">
          <div>
            <h2 id="f-freq" className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, lineHeight: 1.3 }}>How often a center themes</h2>
            <p className="z-num mt-5" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)' }}>{liftShort(first.lift)} <span className="z-muted" style={{ fontSize: '0.5em', letterSpacing: '-0.01em' }}>against</span> {liftShort(last.lift)}</p>
            <p className="mt-3 z-muted" style={{ lineHeight: 1.5, maxWidth: '44ch' }}>
              {first.lift > last.lift
                ? <>A theme works best when it is an occasion. At centers that theme {first.label.split(' (')[0].toLowerCase()}, a themed dinner lands {vsPlain(first.lift)}. At centers that theme {last.label.split(' (')[0].toLowerCase()}, it lands {vsPlain(last.lift)}.</>
                : <>How often a center themes makes little difference to how a themed dinner does.</>}
            </p>
            <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45, maxWidth: '44ch' }}>Each themed dinner is grouped by the share of that center's dinners that had a theme in the 60 days around it.</p>
          </div>
          <FreqBars rows={fr} />
        </section>
      )}

      {fams.length > 0 && (
        <section className="z-card grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-12 gap-y-7" aria-labelledby="f-fam">
          <div>
            <h2 id="f-fam" className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, lineHeight: 1.3 }}>Which kind of theme does best</h2>
            <p className="z-num mt-5" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)' }}>{top.label}</p>
            <p className="mt-3 z-muted" style={{ lineHeight: 1.5, maxWidth: '44ch' }}>
              Themes in the "{top.label}" family{topNames.length ? ` (${topNames.join(', ')})` : ''} land {vsPlain(top.lift)}, on {top.n} scored dinners at {top.centers} centers.
              {below.length > 0 && <> {below.map((f) => `"${f.label}"`).join(' and ')} themes come in below a plain dinner. Those weeks are short on students anyway, so the date may matter more than the theme.</>}
            </p>
            <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45, maxWidth: '44ch' }}>A dinner with two themes counts in both families. Pick a family to see its themes.</p>
          </div>
          <FamilyBars rows={fams} onPick={onPickFamily} />
        </section>
      )}
    </div>
  );
}

function Fridays({ th, cat, byId, week, setWeek }) {
  const f = th.fridays.find((x) => x.date === week) || th.fridays[0];
  const themed = f.live.filter((e) => e.themes.length || e.one_off);
  const postedBy = new Map();
  f.live.forEach((e) => e.themes.forEach((id) => postedBy.set(id, (postedBy.get(id) || 0) + 1)));
  const note = f.jh ? `It falls during ${JH[f.jh] || f.jh}.` : f.jh_runup ? `${JH[f.jh_runup] || f.jh_runup} starts ${f.jh_days === 1 ? 'the next day' : `${f.jh_days} days later`}.` : '';
  const sec = f.sec ? `${SEC[f.sec] || f.sec} is that week.` : '';
  const [allLive, setAllLive] = useState(false);
  useEffect(() => setAllLive(false), [f.date]);
  const shown = allLive ? themed : themed.slice(0, 8);
  return (
    <div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2" role="group" aria-label="Pick a Friday">
        {th.fridays.map((x) => {
          const on = x.date === f.date, n = x.live.filter((e) => e.themes.length || e.one_off).length;
          return (
            <button key={x.date} type="button" aria-pressed={on} onClick={() => setWeek(x.date)} className="text-left min-w-0 z-tap" style={{ background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', borderRadius: 22, padding: '0.8rem 1.05rem' }}>
              <span className="block z-num" style={{ fontSize: '1.2rem' }}>{fmtDay(x.date)}</span>
              <span className="block z-small truncate mt-1" style={{ opacity: on ? 0.85 : 1, color: on ? undefined : 'var(--grey)' }}>{x.sec ? SEC[x.sec] || x.sec : x.jh ? JH[x.jh] || x.jh : x.parsha || 'Friday'}</span>
              <span className="block z-small truncate" style={{ opacity: on ? 0.85 : 1, color: on ? undefined : 'var(--grey)' }}>{n ? `${n} themed` : 'none posted'}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 font-semibold" style={{ lineHeight: 1.45 }}>
        Friday, {fmtDate(f.date, { month: 'long', day: 'numeric' })}{f.parsha ? `, Parshat ${f.parsha}` : ''}. <span className="z-muted font-normal">{[note, sec].filter(Boolean).join(' ')}</span>
      </p>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="z-card">
          <h3 className="z-h3">Already posted</h3>
          <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>{f.posted ? `${themed.length} of ${plural(f.posted, 'posted dinner')} ${themed.length === 1 ? 'has' : 'have'} a theme. Sign-ups are counts so far.` : 'No center has posted a dinner for this Friday yet.'}</p>
          {themed.length > 0 && (
            <ul className="mt-3">
              {shown.map((e) => {
                const p = cat.prog(e.pid), c = cat.centerById.get(e.center);
                const tags = e.themes.map((id) => byId.get(id)?.label).filter(Boolean);
                const body = (
                  <>
                    <Flyer src={cat.img(e.img)} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} />
                    <div className="min-w-0">
                      <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.25 }}>{e.name}</p>
                      <p className="z-small z-muted truncate mt-0.5">{centerLabel(c)}{tags.length ? `. ${tags.join(', ')}` : e.one_off ? '. A one-off' : ''}</p>
                    </div>
                    <div className="text-right whitespace-nowrap"><span className="z-num" style={{ fontSize: '1.15rem' }}>{e.regs.toLocaleString()}</span><span className="block z-small z-muted">{e.regs === 1 ? 'sign-up' : 'sign-ups'}</span></div>
                  </>
                );
                const cls = 'grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3.5 items-center py-3 group';
                return <li key={e.id} style={{ borderTop: '1px solid var(--fog-2)' }}>{p ? <Link to={`/program/${p.key}`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {themed.length > shown.length && <button type="button" className="z-btn z-btn-white z-btn-sm" onClick={() => setAllLive(true)}>Show all {themed.length}</button>}
            <Link to="/coming" className="z-btn z-btn-white z-btn-sm">Everything posted<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="z-card">
          <h3 className="z-h3">Usually run this week</h3>
          <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>Themes whose past runs bunch up around this date. Holiday themes are matched on the Jewish date, the rest within ten days on the civil calendar.</p>
          {f.usual.length ? (
            <ul className="mt-3">
              {f.usual.slice(0, 8).map((u) => {
                const t = byId.get(u.id), up = postedBy.get(u.id);
                return (
                  <li key={u.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
                    <Link to={`/themes/${u.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center py-3 group">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0"><span className="font-bold sm:truncate group-hover:underline decoration-2 underline-offset-2">{u.label}</span>{up ? <span className="z-pill flex-none" style={{ background: 'var(--go-tint)', color: 'var(--go)', height: '1.45rem', fontSize: '0.76rem', padding: '0 0.55rem' }}>{up} posted</span> : null}</p>
                        <p className="z-small z-muted sm:truncate" style={{ lineHeight: 1.35 }}>{u.near} of {u.of} past runs fell near this date, at {plural(u.centers, 'center')}{t && t.n_measured ? <span className="sm:hidden">. Lift: {evidence(t).toLowerCase()}</span> : null}</p>
                      </div>
                      {t ? <ThemeLift t={t} right capClass="hidden sm:block" /> : <Lift value={u.lift} size="sm" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 z-muted">No theme has a clear pull toward this week.</p>}
        </div>
      </div>
    </div>
  );
}

const SORTS = [['lift', 'Best lift'], ['centers', 'Most centers'], ['n', 'Most run'], ['rising', 'Rising']];
const RANK = { new: 0, rising: 1, evergreen: 2, steady: 2, seasonal: 2, fading: 3 };
const CONF_RANK = { strong: 0, some: 0, thin: 1 };

function Directory({ th, fam, setFam }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('lift');
  const [hideBound, setHideBound] = useState(false);
  const [all, setAll] = useState(false);
  const labels = th.family_labels;
  const famCounts = useMemo(() => { const m = new Map(); th.themes.forEach((t) => m.set(t.family, (m.get(t.family) || 0) + 1)); return m; }, [th]);
  const fams = Object.keys(labels).filter((k) => famCounts.get(k));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = th.themes.filter((t) => (!fam || t.family === fam) && (!hideBound || !t.date_bound)
      && (!s || t.label.toLowerCase().includes(s) || t.key.includes(s) || (labels[t.family] || '').toLowerCase().includes(s) || t.names.some((n) => n.name.toLowerCase().includes(s))));
    const by = {
      lift: (a, b) => (CONF_RANK[a.confidence] - CONF_RANK[b.confidence]) || ((b.lift ?? -1) - (a.lift ?? -1)),
      centers: (a, b) => b.centers - a.centers || b.n - a.n,
      n: (a, b) => b.n - a.n || b.centers - a.centers,
      rising: (a, b) => (RANK[a.status] - RANK[b.status]) || ((b.ytd_now - b.ytd_last) - (a.ytd_now - a.ytd_last)) || b.centers - a.centers,
    }[sort];
    return out.sort(by);
  }, [th, q, sort, hideBound, fam, labels]);
  const filtered = !!(q.trim() || fam || hideBound);
  const shown = all || filtered ? rows : rows.slice(0, 24);
  const bound = th.themes.filter((t) => t.date_bound).length;
  const grid = 'md:grid md:grid-cols-[minmax(0,1.5fr)_6.4rem_4.4rem_4.4rem_minmax(0,11rem)_minmax(0,1.15fr)] md:gap-x-5 md:items-center';
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-3 items-center">
        <label className="block"><span className="sr-only">Search themes</span><input type="search" className="z-input" placeholder="Search themes, like sushi or welcome" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Seg value={sort} onChange={setSort} options={SORTS} label="Sort themes" />
          <button type="button" aria-pressed={hideBound} onClick={() => setHideBound(!hideBound)} className="z-btn z-btn-sm z-btn-soft" style={hideBound ? { background: 'var(--ink)', color: '#fff' } : undefined} title="Date-bound themes only work in their own week: holidays, move-in, graduation, family weekend">
            {hideBound && <Check size={16} aria-hidden="true" />}Hide date-bound themes
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by family">
        <button type="button" aria-pressed={!fam} onClick={() => setFam(null)} className="z-pill" style={{ height: '2.1rem', fontSize: '0.88rem', background: !fam ? 'var(--ink)' : 'var(--fog)', color: !fam ? '#fff' : 'var(--ink)' }}>All <span style={{ opacity: 0.6 }}>{th.themes.length}</span></button>
        {fams.map((k) => <button key={k} type="button" aria-pressed={fam === k} onClick={() => setFam(fam === k ? null : k)} className="z-pill" style={{ height: '2.1rem', fontSize: '0.88rem', background: fam === k ? 'var(--ink)' : 'var(--fog)', color: fam === k ? '#fff' : 'var(--ink)' }}>{labels[k]} <span style={{ opacity: 0.6 }}>{famCounts.get(k)}</span></button>)}
      </div>
      <p className="z-small z-muted mt-4" style={{ lineHeight: 1.45 }} aria-live="polite">
        {plural(rows.length, 'theme')}{hideBound ? `, with ${bound} date-bound themes hidden` : ''}. {sort === 'lift' ? 'Sorted by lift against a plain dinner at the same center. Themes with thin evidence are listed last and shown in grey.' : sort === 'rising' ? 'New and rising themes first, then by how many more centers ran it this academic year than by this date last year.' : sort === 'centers' ? 'Sorted by how many centers have run it.' : 'Sorted by how many times it has been run.'}
      </p>
      {rows.length === 0 ? <div className="mt-5"><Empty>No theme matches. Try a shorter search, or clear the filters.</Empty></div> : (
        <div className="mt-4">
          <div className={`hidden ${grid} z-small z-muted font-semibold pb-2`} aria-hidden="true">
            <span>Theme</span><span>Trend</span><span className="text-right">Centers</span><span className="text-right">Runs</span><span>Lift</span><span>{sort === 'rising' ? 'Centers this year' : 'When it is run'}</span>
          </div>
          <ul>
            {shown.map((t) => (
              <li key={t.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
                <Link to={`/themes/${t.id}`} className={`z-row ${grid} group`} style={{ paddingTop: '0.85rem', paddingBottom: '0.85rem' }}>
                  <span className="flex items-start justify-between gap-3 min-w-0 md:block">
                    <span className="min-w-0 block">
                      <span className="block font-bold truncate group-hover:underline decoration-2 underline-offset-2" style={{ fontSize: '1.05rem' }}>{t.label}</span>
                      <span className="block z-small z-muted truncate">{labels[t.family] || 'Other'}{t.date_bound ? ', date-bound' : ''}</span>
                    </span>
                    <span className="md:hidden flex-none"><StatusPill status={t.status} /></span>
                  </span>
                  <span className="hidden md:block"><StatusPill status={t.status} /></span>
                  <span className="hidden md:block text-right font-semibold tabular-nums">{t.centers}</span>
                  <span className="hidden md:block text-right font-semibold tabular-nums">{t.n}</span>
                  <span className="mt-2.5 md:mt-0 flex items-end justify-between gap-3 min-w-0">
                    <ThemeLift t={t} />
                    <span className="md:hidden z-small z-muted text-right whitespace-nowrap">{plural(t.centers, 'center')}, {plural(t.n, 'run')}</span>
                  </span>
                  <span className="block z-small mt-1.5 md:mt-0 min-w-0" style={{ lineHeight: 1.4 }}>
                    {sort === 'rising' ? <>{t.ytd_now} so far this year<span className="z-muted">, {t.ytd_last} by this date last year</span></> : <span className="z-muted md:text-[0.95rem]" style={{ color: 'var(--ink)' }}>{t.when}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {shown.length < rows.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {rows.length} themes</button>}
        </div>
      )}
    </div>
  );
}

function OneOffs({ th, cat }) {
  const [mode, setMode] = useState('recent');
  const [n, setN] = useState(12);
  const withImg = useMemo(() => th.one_offs.filter((o) => o.img), [th]);
  const yearAgo = useMemo(() => { const d = new Date(th.today + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }, [th]);
  const list = useMemo(() => (mode === 'recent' ? withImg : withImg.filter((o) => o.lift != null && o.date >= yearAgo).sort((a, b) => b.lift - a.lift)), [mode, withImg, yearAgo]);
  if (!withImg.length) return <Empty>No one-off themed dinners with a flyer yet.</Empty>;
  return (
    <div>
      <div className="mb-6"><Seg value={mode} onChange={(m) => { setMode(m); setN(12); }} label="Order one-offs" options={[['recent', 'Most recent'], ['lift', 'Did best, last 12 months']]} /></div>
      <FlyerGrid>
        {list.slice(0, n).map((o) => {
          const p = cat.prog(o.pid), c = cat.centerById.get(o.center);
          const inner = (
            <>
              <Flyer src={cat.img(o.img)} alt={`Flyer for ${o.name}`} />
              <div className="mt-2.5 min-w-0">
                <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22 }}>{o.name}</p>
                <p className="z-small z-muted truncate mt-0.5">{centerLabel(c)}, {fmtDate(o.date, { month: 'short', year: 'numeric' })}</p>
                <p className="z-small mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">{o.lift != null && <Lift value={o.lift} size="sm" />}<span className="z-muted">{o.regs ? plural(o.regs, 'sign-up') : 'No sign-up count'}</span></p>
              </div>
            </>
          );
          return p ? <Link key={o.id} to={`/program/${p.key}`} className="block group min-w-0">{inner}</Link> : <div key={o.id} className="min-w-0">{inner}</div>;
        })}
      </FlyerGrid>
      {n < list.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-8" onClick={() => setN(n + 24)}>Show more one-offs</button>}
    </div>
  );
}

export default function Themes() {
  const { data, error } = useData('themes.json', 'catalog');
  const [params, setParams] = useSearchParams();
  const [fam, setFam] = useState(null);
  const scrolled = useRef(false);
  const wantsWeek = params.has('week') || params.get('view') === 'week';
  useEffect(() => {
    if (!data || scrolled.current || !wantsWeek) return;
    scrolled.current = true;
    requestAnimationFrame(() => document.getElementById('fridays-h')?.scrollIntoView({ block: 'start' }));
  }, [data, wantsWeek]);
  const byId = useMemo(() => new Map((data ? data[0].themes : []).map((t) => [t.id, t])), [data]);
  if (error) return <ErrorNote error={error} what="The themes page" />;
  if (!data) return <Loading rows={3} h={220} />;
  const [th, cat] = data;
  const setWeek = (d) => { scrolled.current = true; const next = new URLSearchParams(params); next.set('week', d); next.delete('view'); setParams(next, { replace: true, preventScrollReset: true }); };
  const pickFamily = (k) => { setFam(k); document.getElementById('dir-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const brands = th.house_brands.length;
  return (
    <div>
      <PageHead title="Shabbat dinner themes" lede={`What centers add to "Shabbat dinner" in the name: Sushi, Pink, Welcome Back, Under the Stars. ${th.themes.length} themes found in ${th.totals.dinners.toLocaleString()} dinners, each measured against the same center's plain dinners.`} />
      <Findings th={th} onPickFamily={pickFamily} />

      {th.fridays.length > 0 && (
        <Section id="fridays-h" title="The next six Fridays" sub="Pick a Friday to see which themed dinners centers have already posted for it, and which themes are usually run that week in past years." className="scroll-mt-24">
          <Fridays th={th} cat={cat} byId={byId} week={params.get('week')} setWeek={setWeek} />
        </Section>
      )}

      <Section id="dir-h" title="Every theme" sub="A theme is listed once at least three centers have used it. Lift is how a themed dinner did against plain dinners at the same center around the same time, never against other centers." className="scroll-mt-24">
        <Directory th={th} fam={fam} setFam={setFam} />
      </Section>

      <Section id="one-h" title="One-offs nobody has copied yet" sub={`Themed dinners whose name matches no shared theme, so only one or two centers have tried them. ${th.one_offs.length} of the most recent are kept. Each lift here is a single dinner, so read it as a hint.`}>
        <OneOffs th={th} cat={cat} />
      </Section>

      <Section id="how-h" title="How this works" tight>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="z-card"><h3 className="z-h3">A theme is read from the event name</h3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>The words every Shabbat dinner name shares are removed, along with the center's own name. What is left is the theme. It gets its own page once three centers have used it. A phrase one center puts on most of its dinners is its house name for the regular dinner, not a theme{brands ? ` (${plural(brands, 'such phrase')} set aside)` : ''}.</p></div>
          <div className="z-card"><h3 className="z-h3">Lift compares it with plain dinners nearby</h3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>Each themed dinner's sign-ups are set against the median of the same center's plain dinners within 45 days before or after. If fewer than three plain dinners are that close, the center's normal for the year is used. A theme's lift is the typical result across its dinners, with single outliers capped and small samples pulled toward normal.</p></div>
          <div className="z-card"><h3 className="z-h3">What counts as enough evidence</h3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>Solid means at least 12 scored dinners at 6 or more centers. Some means at least 5 at 3 or more. Anything less is thin and shown in grey with a question mark. A dinner with no sign-up count is not scored, so runs always outnumber scored dinners ({th.totals.measured.toLocaleString()} of {th.totals.dinners.toLocaleString()} dinners have a count).</p></div>
        </div>
      </Section>
    </div>
  );
}
