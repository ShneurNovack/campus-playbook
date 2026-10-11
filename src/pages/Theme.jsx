import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useData, fmtDate, plural, centerLabel, liftShort, liftPct, CONF, MONTHS } from '../lib/data';
import { Section, Loading, ErrorNote, Empty, Flyer, Lift, StatusPill, Columns, FlyerGrid, CenterLink, Finding } from '../components/bits';

const JH = { rosh_hashana: 'Rosh Hashana', yom_kippur: 'Yom Kippur', sukkot: 'Sukkot', simchat_torah: 'Simchat Torah', chanukah: 'Chanukah', tu_bshvat: "Tu B'Shvat", purim: 'Purim', pesach: 'Pesach', yom_hashoah: 'Yom HaShoah', yom_haatzmaut: "Yom Ha'atzmaut", lag_baomer: 'Lag BaOmer', shavuot: 'Shavuot', tisha_bav: "Tisha B'Av" };
const SEC = { new_year: 'New Year', super_bowl: 'Super Bowl', valentines: "Valentine's Day", st_patricks: "St. Patrick's Day", cinco_de_mayo: 'Cinco de Mayo', mothers_day: "Mother's Day", july_4: 'July 4', sept_11: '9/11', oct_7: 'October 7', halloween: 'Halloween', thanksgiving: 'Thanksgiving' };
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pct = (x) => `${Math.round(x * 100)}%`;
const vsPlain = (x) => { const p = liftPct(x); return Math.abs(p) < 4 ? 'about the same as a plain dinner' : x >= 2 ? `about ${x.toFixed(1)} times a plain dinner` : `${Math.abs(p)}% ${p > 0 ? 'above' : 'below'} a plain dinner`; };
const CONF_WORD = { strong: 'Solid', some: 'Some', thin: 'Thin' };

// One sentence from the numbers. Thin evidence gets no lift claim at all.
function verdict(t) {
  const a = `Run ${plural(t.n, 'time')} at ${plural(t.centers, 'center')}.`;
  if (!t.n_measured || t.lift == null) return `${a} None of those dinners has a sign-up count, so there is no lift to report.`;
  if (t.confidence === 'thin') return `${a} Only ${plural(t.n_measured, 'dinner')} could be scored, which is too few to say whether the theme helps.`;
  return `${a} Typically ${vsPlain(t.lift)} at the same center, on ${plural(t.n_measured, 'scored dinner')}${t.confidence === 'some' ? '. That is some evidence, not a lot' : ''}.${t.family === 'audience' && t.lift < 0.97 ? ' A dinner for one crowd is smaller by design, so landing below a full dinner is expected.' : ''}`;
}

function VerdictPanel({ t }) {
  const none = !t.n_measured || t.lift == null, thin = t.confidence === 'thin';
  const p = none ? 0 : liftPct(t.lift);
  const good = !none && !thin && p >= 12, low = !none && !thin && p <= -12;
  const bg = good ? 'var(--go)' : low ? 'var(--cool-tint)' : 'var(--fog)';
  const fg = good ? '#fff' : 'var(--ink)', soft = good ? 'rgba(255,255,255,0.9)' : 'var(--grey)';
  const unmeasured = t.n - t.n_measured;
  const thinNum = thin || none ? { color: 'var(--grey)', fontWeight: 500 } : null;
  return (
    <div className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-4">
      <div className="p-6 sm:p-8 flex flex-col" style={{ background: bg, color: fg, borderRadius: 'var(--r-lg)' }}>
        <p className="font-bold">Against a plain dinner at the same center</p>
        <p className="z-num mt-4" style={{ fontSize: 'clamp(3.4rem, 8vw, 5.4rem)', color: thin ? 'var(--grey)' : undefined, fontWeight: thin ? 500 : undefined }}>{none ? 'n/a' : `${liftShort(t.lift)}${thin ? '?' : ''}`}</p>
        <p className="mt-4" style={{ lineHeight: 1.5, color: soft }}>
          {none ? 'No dinner with this theme has a sign-up count yet.'
            : thin ? `Thin evidence: ${plural(t.n_measured, 'scored dinner')} at ${plural(t.centers_measured, 'center')}. Read this as a hint, not a result.`
            : `The typical run across ${plural(t.n_measured, 'scored dinner')}. The middle run was ${liftShort(t.lift_median) === 'Normal' ? 'equal to a plain dinner' : liftShort(t.lift_median)}.`}
        </p>
      </div>
      <div className="z-card grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-7 content-center">
        <div>
          <p className="z-num" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)', ...thinNum }}>{none ? 'n/a' : pct(t.hit)}</p>
          <p className="mt-2 font-bold" style={{ lineHeight: 1.25 }}>Hit rate</p>
          <p className="z-small z-muted mt-1" style={{ lineHeight: 1.45 }}>{none ? 'No scored runs.' : `of scored runs drew at least 20% more than that center's plain dinners${thin ? ` (${Math.round(t.hit * t.n_measured)} of ${t.n_measured})` : ''}.`}</p>
        </div>
        <div>
          <p className="z-num" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)', ...thinNum }}>{none ? 'n/a' : <>{t.centers_up}<span className="z-muted" style={{ fontSize: '0.55em', letterSpacing: '-0.01em' }}> of {t.centers_measured}</span></>}</p>
          <p className="mt-2 font-bold" style={{ lineHeight: 1.25 }}>Centers that went up</p>
          <p className="z-small z-muted mt-1" style={{ lineHeight: 1.45 }}>{none ? 'No scored runs.' : 'did better with this theme, on average, than with their plain dinners.'}</p>
        </div>
        <div>
          <p className="z-num" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)', ...thinNum }}>{CONF_WORD[t.confidence] || 'Thin'}</p>
          <p className="mt-2 font-bold" style={{ lineHeight: 1.25 }}>{CONF[t.confidence] || 'Thin evidence'}</p>
          <p className="z-small z-muted mt-1" style={{ lineHeight: 1.45 }}>{plural(t.n_measured, 'scored dinner')} at {plural(t.centers_measured, 'center')}.{unmeasured > 0 ? ` ${unmeasured} more ${unmeasured === 1 ? 'run has' : 'runs have'} no sign-up count.` : ''}</p>
        </div>
      </div>
    </div>
  );
}

function FirstRepeat({ t }) {
  const f = t.first_time_lift, r = t.repeat_lift;
  let line;
  if (f != null && r != null) {
    const d = r - f;
    line = f < 1.04 && r < 1.04 ? 'It lands at or below a plain dinner both on the first try and on repeats.'
      : Math.abs(d) < 0.06 ? 'It does about as well on repeats as on the first try, so the draw is not only novelty.'
      : d > 0 ? 'It does better when a center brings it back than on the first try. Centers that repeat a theme are often the ones it worked for, so read the repeat number with that in mind.'
      : r >= 1.04 ? 'The first run is the strongest. Later runs still beat a plain dinner, by less.'
      : 'The first run is the strongest. On repeats it lands about level with a plain dinner, or below.';
  } else if (f != null) line = 'There are too few scored repeat runs to say whether it holds up the second time.';
  else if (r != null) line = 'Most scored runs come from centers that had already run it, so there is no first-time number.';
  else line = 'There are too few scored runs to split first tries from repeats (each side needs four).';
  const none = <span className="z-muted" style={{ fontSize: '0.62em', letterSpacing: '-0.01em' }}>Too few runs</span>;
  const thin = t.confidence === 'thin';
  const num = (x) => (thin ? <span style={{ color: 'var(--grey)', fontWeight: 500 }} title="Thin evidence">{liftShort(x)}?</span> : liftShort(x));
  return (
    <Section id="rep-h" title="First time against repeat" sub={f == null && r == null && t.repeat == null ? undefined : line}>
      {f == null && r == null && t.repeat == null ? <Empty>{line} There are also too few centers with a following year to count how many came back to it.</Empty> : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Finding title="The first time a center runs it" value={f == null ? none : num(f)}>{f == null ? 'Fewer than four scored first runs.' : "Each center's first scored run of this theme, against its own plain dinners."}</Finding>
        <Finding title="When a center runs it again" value={r == null ? none : num(r)}>{r == null ? 'Fewer than four scored repeat runs.' : "Each center's second and later runs, against its own plain dinners."}</Finding>
        <Finding title="Centers that ran it again the next year" value={t.repeat == null ? none : pct(t.repeat)}>
          {t.repeat == null ? 'Fewer than four cases to count.' : `Counted over ${plural(t.repeat_n, 'case')} where a center ran it one academic year and was still active the next.`}
          {t.repeat != null && t.family === 'jewish' ? ' For a holiday theme this mostly reflects whether the holiday met a Friday again.' : ''}
        </Finding>
      </div>)}
    </Section>
  );
}

function When({ t, today }) {
  const m = new Date(today + 'T12:00:00').getMonth();
  const total = t.months.reduce((a, b) => a + b, 0) || 1;
  const hol = [...Object.entries(t.jh || {}).map(([k, n]) => [JH[k] || k, n]), ...Object.entries(t.sec || {}).map(([k, n]) => [SEC[k] || k, n])].filter(([, n]) => n >= 2 && n / Math.max(1, t.n) >= 0.1).sort((a, b) => b[1] - a[1]);
  return (
    <Section id="when-h" title="When it is run" sub={`Every run by calendar month. ${MONTH_FULL[m]} is highlighted: ${t.months[m] ? `${t.months[m]} of its ${plural(total, 'run')} fell in this month${t.months[m] / total >= 0.005 ? ` (${pct(t.months[m] / total)})` : ''}` : 'no center has run it in this month'}.`}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <div className="z-card flex flex-col justify-end">
          {[['sm:hidden', MONTHS.map((x) => x[0])], ['hidden sm:block', MONTHS]].map(([cls, labels]) => (
            <div key={cls} className={cls}><Columns values={t.months} labels={labels} height={170} highlight={[m]} tipFor={(i) => [MONTH_FULL[i], plural(t.months[i], 'run'), `${pct(t.months[i] / total)} of all runs`]} /></div>
          ))}
        </div>
        <div className="z-card">
          <p className="font-semibold">Usually run</p>
          <p className="z-num mt-3" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', lineHeight: 1.05 }}>{t.when}</p>
          {t.n < 5 && <p className="z-small z-muted mt-2" style={{ lineHeight: 1.45 }}>Read from only {plural(t.n, 'run')}, so this is a loose guide.</p>}
          <ul className="mt-5 space-y-3" style={{ lineHeight: 1.45 }}>
            <li><span className="font-bold">{t.follows === 'jewish' ? 'Follows the Jewish calendar.' : 'Follows the civil calendar.'}</span> <span className="z-muted">{t.follows === 'jewish' ? 'Its past dates line up better by Hebrew date, so the civil date moves from year to year.' : 'Its past dates line up better by civil date than by Hebrew date.'}</span></li>
            {hol.length > 0 && <li><span className="font-bold">Holiday weeks.</span> <span className="z-muted">{hol.map(([l, n]) => `${n} of ${t.n} runs fell during ${l}`).join(', ')}.</span></li>}
            <li><span className="font-bold">In the semester.</span> <span className="z-muted">{pct(t.early)} of runs are in the first two weeks of a semester and {pct(t.late)} in its last stretch.</span></li>
            {t.date_bound && <li><span className="font-bold">Date-bound.</span> <span className="z-muted">It belongs to one point in the year, so it cannot be moved to a slow week.</span></li>}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Adoption({ t, today, cat }) {
  const d = new Date(today + 'T12:00:00'), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, cur = `${y}-${String(y + 1).slice(2)}`;
  const yrs = t.years;
  const first = t.first ? cat.centerById.get(t.first.center) : null;
  const diff = t.ytd_now - t.ytd_last;
  return (
    <Section id="adopt-h" title="Adoption by year" sub={`Centers that ran it in each academic year (July to June).${yrs.some((x) => x.ay === cur) ? ` ${cur} is in progress and shown in grey.` : ''}${t.first ? ` First seen ${fmtDate(t.first.date, { month: 'long', year: 'numeric' })}${first ? ` at ${centerLabel(first)}` : ''}.` : ''}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <div className="z-card flex flex-col justify-end">
          {yrs.length ? <Columns values={yrs.map((x) => x.centers)} labels={yrs.map((x) => x.ay.slice(2))} height={150} dim={(i) => yrs[i].ay === cur} tipFor={(i) => [`Academic year ${yrs[i].ay}`, plural(yrs[i].centers, 'center'), plural(yrs[i].events, 'run')]} /> : <p className="z-muted">No completed runs yet.</p>}
        </div>
        <div className="z-card">
          <p className="font-semibold">This academic year so far</p>
          <p className="z-num mt-3" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)' }}>{t.ytd_now}<span className="z-muted" style={{ fontSize: '0.5em', letterSpacing: '-0.01em' }}> {t.ytd_now === 1 ? 'center' : 'centers'}</span></p>
          <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>
            {t.ytd_last} had run it by this date last year.{' '}
            {t.family === 'jewish' ? 'Holiday themes move with the Jewish calendar, so this comparison says little.' : diff >= 2 ? `That is ${diff} more centers than at this point a year ago.` : diff <= -2 ? `That is ${-diff} fewer centers than at this point a year ago.` : 'About level with a year ago.'}
          </p>
          <div className="mt-4"><StatusPill status={t.status} onFog /></div>
        </div>
      </div>
    </Section>
  );
}

function Packaging({ t, cat }) {
  const maxN = Math.max(1, ...t.names.map((x) => x.n));
  return (
    <Section id="pack-h" title="How centers package it" sub="The names centers give it, the words in their descriptions that set it apart from other Shabbat dinners, and the flyers from the runs that did best.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="z-card">
          <h3 className="z-h3">What they call it</h3>
          <ul className="mt-4 space-y-3">
            {t.names.map((x) => (
              <li key={x.name}>
                <div className="flex items-baseline justify-between gap-3"><span className="font-semibold min-w-0 truncate" title={x.name}>{x.name}</span><span className="z-small z-muted whitespace-nowrap">{plural(x.n, 'time')}</span></div>
                <div className="mt-1" style={{ height: 8 }}><div style={{ width: `${Math.max(1.5, (x.n / maxN) * 100)}%`, height: '100%', background: 'var(--ink)', borderRadius: '0 4px 4px 0' }} /></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="z-card">
          <h3 className="z-h3">Words in the descriptions</h3>
          {t.terms.length ? (
            <>
              <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>Words and pairs of words that show up far more often here than in other Shabbat dinner descriptions.</p>
              <ul className="mt-4 flex flex-wrap gap-2">{t.terms.map((w) => <li key={w} className="z-pill" style={{ background: '#fff', height: '2.1rem', fontSize: '0.92rem' }}>{w}</li>)}</ul>
            </>
          ) : <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>No word stands out. The descriptions read like any other Shabbat dinner, or there are too few of them to tell.</p>}
        </div>
      </div>
      {t.descs.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.descs.slice(0, 4).map((x, i) => { const c = cat.centerById.get(x.center); return (
            <figure key={i} className="z-card flex flex-col">
              <blockquote style={{ lineHeight: 1.5 }}>"{x.text.trim()}"</blockquote>
              <figcaption className="z-small z-muted mt-auto pt-4" style={{ lineHeight: 1.45 }}><span className="font-bold" style={{ color: 'var(--ink)' }}>{x.name}</span>, <CenterLink c={c} />, {fmtDate(x.date, { month: 'short', year: 'numeric' })}{x.regs ? `. ${plural(x.regs, 'sign-up')}` : ''}</figcaption>
            </figure>); })}
        </div>
      )}
      {t.flyers.length > 0 && (
        <div className="mt-10">
          <h3 className="z-h3 mb-5">Flyers</h3>
          <FlyerGrid>
            {t.flyers.slice(0, 12).map((f) => { const p = cat.prog(f.pid), c = cat.centerById.get(f.center); const inner = (
              <>
                <Flyer src={cat.img(f.img)} alt={`Flyer for ${f.name}`} />
                <div className="mt-2.5 min-w-0">
                  <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22 }}>{f.name}</p>
                  <p className="z-small z-muted truncate mt-0.5">{centerLabel(c)}, {fmtDate(f.date, { month: 'short', year: 'numeric' })}</p>
                  <p className="z-small mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">{f.lift != null && <Lift value={f.lift} size="sm" />}<span className="z-muted">{f.regs ? plural(f.regs, 'sign-up') : 'No sign-up count'}</span></p>
                </div>
              </>);
              return p ? <Link key={f.id} to={`/program/${p.key}`} className="block group min-w-0">{inner}</Link> : <div key={f.id} className="min-w-0">{inner}</div>; })}
          </FlyerGrid>
        </div>
      )}
    </Section>
  );
}

function Upcoming({ t, cat }) {
  const up = t.occ.filter((o) => o[5]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!up.length) return null;
  return (
    <Section id="up-h" title={`${plural(up.length, 'upcoming run')}`} sub="Posted and not yet held. Sign-ups are counts so far, so they are not scored.">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {up.map((o) => { const p = cat.prog(o[6]), c = cat.centerById.get(o[1]); const inner = (
          <>
            <div className="min-w-0"><p className="font-bold truncate">{p ? p.name : t.label}</p><p className="z-small z-muted mt-0.5 truncate">{centerLabel(c)}, {fmtDate(o[0], { weekday: 'short', month: 'short', day: 'numeric' })}</p></div>
            <div className="text-right whitespace-nowrap"><span className="z-num" style={{ fontSize: '1.25rem' }}>{o[2].toLocaleString()}</span><span className="block z-small z-muted">so far</span></div>
          </>);
          return p ? <Link key={o[4]} to={`/program/${p.key}`} className="z-card flex items-center justify-between gap-4">{inner}</Link> : <div key={o[4]} className="z-card flex items-center justify-between gap-4">{inner}</div>; })}
      </div>
    </Section>
  );
}

function Runs({ t, cat }) {
  const [all, setAll] = useState(false);
  const rows = t.occ.filter((o) => !o[5]).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : b[2] - a[2]));
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 25);
  return (
    <Section id="runs-h" title="Every run" sub={`${plural(rows.length, 'dinner')}, newest first. Lift is against that center's plain dinners within 45 days. A run is listed but not scored when it has no sign-up count, or when the center has too few plain dinners to compare it with.`}>
      <div className="overflow-x-auto z-scroll">
        <table className="z-table">
          <thead><tr><th scope="col" className="hidden sm:table-cell">Date</th><th scope="col">Center and dinner</th><th scope="col" className="num" style={{ textAlign: 'right' }}>Sign-ups</th><th scope="col" style={{ paddingRight: 0 }}>Lift</th></tr></thead>
          <tbody>
            {shown.map((o) => { const p = cat.prog(o[6]), c = cat.centerById.get(o[1]); return (
              <tr key={o[4]}>
                <td className="hidden sm:table-cell whitespace-nowrap z-muted">{fmtDate(o[0])}</td>
                <td style={{ maxWidth: 0, width: '60%' }}>
                  <span className="block font-bold truncate">{c ? <CenterLink c={c} /> : 'Unknown center'}</span>
                  {p && <Link to={`/program/${p.key}`} className="block z-small z-muted truncate hover:underline" title={p.name}>{p.name}</Link>}
                  <span className="block sm:hidden z-small z-muted">{fmtDate(o[0])}</span>
                </td>
                <td className="num font-semibold">{o[2] ? o[2].toLocaleString() : <span className="z-muted font-normal">0</span>}</td>
                <td style={{ paddingRight: 0 }}>{o[3] == null ? <span className="z-small z-muted whitespace-nowrap">Not scored</span> : <Lift value={o[3]} size="sm" />}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
      {!all && rows.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show all {rows.length} runs</button>}
    </Section>
  );
}

function Related({ t, byId }) {
  const rel = (t.related || []).filter((x) => byId.has(x.id));
  const pair = (t.paired || []).filter((x) => x.id && byId.has(x.id));
  if (!rel.length && !pair.length) return null;
  const pill = { background: 'var(--fog)', height: '2.3rem', fontSize: '0.95rem', padding: '0 1rem' };
  return (
    <Section id="rel-h" title="Related themes" tight>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
        {rel.length > 0 && (
          <div>
            <h3 className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}>Described in similar words</h3>
            <ul className="mt-3 flex flex-wrap gap-2">{rel.map((x) => <li key={x.id}><Link to={`/themes/${x.id}`} className="z-pill z-tap hover:opacity-80" style={pill}>{x.label}</Link></li>)}</ul>
          </div>
        )}
        {pair.length > 0 && (
          <div>
            <h3 className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}>Often on the same dinner</h3>
            <ul className="mt-3 flex flex-wrap gap-2">{pair.map((x) => <li key={x.id}><Link to={`/themes/${x.id}`} className="z-pill z-tap hover:opacity-80" style={pill}>{byId.get(x.id).label}<span className="z-muted font-semibold">{x.n} dinners</span></Link></li>)}</ul>
          </div>
        )}
      </div>
    </Section>
  );
}

const Back = () => <Link to="/themes" className="z-btn z-btn-soft z-btn-sm"><ArrowLeft size={16} aria-hidden="true" />All themes</Link>;

export default function Theme() {
  const { id } = useParams();
  const { data, error } = useData('themes.json', 'catalog');
  if (error) return <ErrorNote error={error} what="This theme" />;
  if (!data) return <Loading rows={3} h={200} />;
  const [th, cat] = data;
  const byId = new Map(th.themes.map((x) => [x.id, x]));
  const t = byId.get(id);
  if (!t) {
    return (
      <div className="pt-8 sm:pt-12">
        <Back />
        <h1 className="z-h1 mt-7">No such theme</h1>
        <div className="mt-8"><Empty>There is no Shabbat dinner theme with the id "{id}". A theme gets a page once at least three centers have used it. <Link to="/themes" className="z-link">See every theme</Link>.</Empty></div>
      </div>
    );
  }
  const fam = th.family_labels[t.family] || 'Other';
  return (
    <div key={t.id}>
      <div className="pt-8 sm:pt-12">
        <Back />
        <h1 className="z-h1 mt-7">{t.label}</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="z-pill">{fam}</span>
          <StatusPill status={t.status} />
          {t.date_bound && <span className="z-pill" title="It belongs to one point in the year">Date-bound</span>}
          {t.upcoming > 0 && <a href="#up-h" className="z-pill" style={{ background: 'var(--go-tint)', color: 'var(--go)' }}>{t.upcoming} upcoming</a>}
        </div>
        <p className="z-lede mt-5" style={{ color: 'var(--ink)' }}>{verdict(t)}</p>
      </div>
      <VerdictPanel t={t} />
      <FirstRepeat t={t} />
      <When t={t} today={th.today} />
      <Adoption t={t} today={th.today} cat={cat} />
      <Packaging t={t} cat={cat} />
      <Upcoming t={t} cat={cat} />
      <Runs t={t} cat={cat} />
      <Related t={t} byId={byId} />
      <div className="mt-16"><Link to="/themes" className="z-btn z-btn-soft z-btn-sm">Every theme<ArrowRight size={16} aria-hidden="true" /></Link></div>
    </div>
  );
}
