// One idea: the same program run by several centers. Every number on this page was computed by the engine
// (engine/ideas.py) and is only laid out here.
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useData, useMyCenter, plural, centerLabel, liftShort, liftWords, liftPct, fmtDate, hourLabel, DAYS, DAY3, MONTHS, CONF } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Lift, StatusPill, ProgramCard, FlyerGrid, Columns, CenterLink, More } from '../components/bits';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AUD = { women: 'Women', men: 'Men', freshmen: 'First-year students', seniors: 'Seniors', grads: 'Grad students', parents: 'Parents and families', greek: 'Greek life', community: 'The wider community', faculty: 'Faculty', israelis: 'Israelis', athletes: 'Athletes' };
const CONF_SHORT = { strong: 'Solid', some: 'Some', thin: 'Thin' };
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const whenText = (w) => (/^(Around|Any|First|Last|During)\b/.test(w || '') ? w[0].toLowerCase() + w.slice(1) : w || '');

function verdict(i) {
  const base = `${plural(i.centers, 'center')} ${i.centers === 1 ? 'has' : 'have'} run this ${plural(i.n, 'time')}.`;
  if (i.lift == null || !i.n_scored) return `${base} None of those runs has sign-up numbers that can be read against the center's normal, so there is no result to report.`;
  if (i.confidence === 'thin') return `${base} Only ${plural(i.n_scored, 'run')} at ${plural(i.centers_scored, 'center')} can be scored, which is not enough to say how it does.`;
  const p = liftPct(i.lift), how = p >= 12 ? 'It tends to beat normal' : p <= -8 ? 'It tends to come in under normal' : 'It runs about normal';
  return `${base} ${how}: where sign-ups were taken it came in at ${liftWords(i.lift)}, and ${i.centers_up} of ${i.centers_scored} centers did better than their own normal with it.`;
}

function Panel({ title, value, children, go, muted }) {
  return (
    <div className="z-card" style={go ? { background: 'var(--go)', color: '#fff' } : undefined}>
      <p className="font-semibold" style={{ lineHeight: 1.3 }}>{title}</p>
      <p className="z-num mt-3" style={{ fontSize: 'clamp(2rem, 3.4vw, 2.8rem)', color: muted ? 'var(--grey)' : undefined }}>{value}</p>
      <p className="mt-3" style={{ lineHeight: 1.45, color: go ? 'rgba(255,255,255,0.9)' : 'var(--grey)' }}>{children}</p>
    </div>
  );
}

function Fact({ label, value, children }) {
  return (
    <div className="py-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
      <div className="flex items-baseline justify-between gap-4"><span className="font-semibold">{label}</span><span className="z-num text-right" style={{ fontSize: '1.35rem' }}>{value}</span></div>
      {children && <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>{children}</p>}
    </div>
  );
}

// Whether "my center" has run this idea, and how many of its peers have.
function MineNote({ idea, cat, mine }) {
  const { data } = useData('centers.json');
  const me = cat.centerById.get(mine);
  if (!me) return null;
  const progs = idea.programs.map((p) => cat.prog(p)).filter(Boolean);
  const own = progs.filter((p) => p.center.id === mine);
  const peers = data?.[0].profiles[mine]?.peers || [];
  const ran = new Set(progs.map((p) => p.center.id)), peerRan = peers.filter((p) => ran.has(p.id)).map((p) => cat.centerById.get(p.id)).filter(Boolean);
  return (
    <div className="mt-4 z-note" style={{ lineHeight: 1.5 }}>
      {own.length ? (
        <p><span className="font-bold">{centerLabel(me)} has run this.</span> {own.slice(0, 3).map((p, k) => (
          <span key={p.key}>{k > 0 && ' '}<Link to={`/program/${p.key}`} className="z-link">{p.name}</Link>{p.n > 0 ? `, ${plural(p.n, 'time')}` : ', coming up'}{p.adj != null ? `, ${liftWords(p.adj, 'your')}.` : ', no sign-up data.'}</span>))}</p>
      ) : <p><span className="font-bold">{centerLabel(me)} has not run this.</span>{peers.length > 0 && ` ${peerRan.length ? `${peerRan.length} of your ${peers.length} nearest peers ${peerRan.length === 1 ? 'has' : 'have'}` : `None of your ${peers.length} nearest peers has either`}.`}</p>}
      {!own.length && peerRan.length > 0 && <p className="z-small mt-1">{peerRan.slice(0, 8).map((c, k) => <span key={c.id}>{k > 0 && ', '}<CenterLink c={c} /></span>)}</p>}
    </div>
  );
}

function ProgramTable({ rows, descs }) {
  return (
    <div className="overflow-x-auto z-scroll relative">
      <table className="z-table" style={{ minWidth: 600 }}>
        <thead><tr><th>Program</th><th className="num">Times run</th><th className="num">Median sign-ups</th><th className="num">Against their normal</th><th aria-label="Open" /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.key}>
              <td style={{ maxWidth: '34rem' }}>
                <Link to={`/program/${p.key}`} className="font-bold hover:underline decoration-2 underline-offset-2">{p.name}</Link>
                <div className="z-small z-muted"><CenterLink c={p.center} />{p.up > 0 ? `, ${p.up} coming up` : ''}</div>
                {descs && descs[p.i] && <p className="z-small mt-1.5 z-clamp3" style={{ lineHeight: 1.45 }}>{descs[p.i]}</p>}
              </td>
              <td className="num">{p.n}</td>
              <td className="num">{p.reg != null ? Math.round(p.reg) : <span className="z-muted">none taken</span>}</td>
              <td className="num">{p.adj != null ? <span className="inline-flex flex-col items-end"><Lift value={p.adj} size="sm" /><span className="z-muted" style={{ fontSize: '0.76rem' }}>{plural(p.scored, 'scored run')}</span></span> : <span className="z-muted z-small">Not measured</span>}</td>
              <td className="num"><Link to={`/program/${p.key}`} className="z-link z-small whitespace-nowrap">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Idea() {
  const { id } = useParams();
  const { data, error } = useData('ideas.json', 'catalog');
  const text = useData('text.json');
  const [mine] = useMyCenter();
  if (error) return <ErrorNote error={error} what="This idea" />;
  if (!data) return <Loading rows={3} h={200} />;
  const [ideas, cat] = data;
  const i = /^\d+$/.test(id || '') ? ideas[Number(id)] : null;
  if (!i) return (
    <div>
      <PageHead title="No such idea" lede="That link does not point to an idea in the current data. Ideas are renumbered when the engine regroups programs, so an old link can go stale." />
      <div className="mt-8"><Empty>Search for it by name in the <Link to="/ideas" className="z-link">Idea lab</Link>, or browse the full list there.</Empty></div>
    </div>
  );

  const now = new Date(), mNow = now.getMonth(), ayNow = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1, ayLabel = `${ayNow}-${String(ayNow + 1).slice(2)}`;
  const thin = i.lift == null || i.confidence === 'thin', seasonal = i.status === 'seasonal';
  const progs = i.programs.map((p) => cat.prog(p)).filter(Boolean);
  const total = i.months.reduce((s, x) => s + x, 0), peak = i.months.indexOf(Math.max(...i.months));
  const wdTotal = i.wd.reduce((s, x) => s + x, 0), wdTop = i.wd.indexOf(Math.max(...i.wd));
  const first = i.first ? cat.centerById.get(i.first.center) : null;
  const partial = i.years.length > 0 && i.years[i.years.length - 1].ay === ayLabel;
  const peakYear = i.years.reduce((b, y) => (y.centers > (b?.centers || 0) ? y : b), null);
  const theme = i.type === 'shabbat_dinner' ? progs.find((p) => p.themes.length)?.themes[0] : null;
  const descs = text.data ? text.data[0].desc : null;

  return (
    <div>
      <PageHead title={i.label} lede={verdict(i)} action={<Link to={`/ideas?q=${encodeURIComponent(i.label)}`} className="z-btn z-btn-soft z-btn-sm">Test a variation in the lab<ArrowRight size={16} aria-hidden="true" /></Link>}>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="z-pill">{cat.types[i.type] || i.type}</span>
          <StatusPill status={i.status} />
          {i.staple && <span className="z-pill" title="Run a dozen times or more per center">Standing program</span>}
          {i.recurring && !i.staple && <span className="z-pill">Usually a series</span>}
          {theme && <Link to={`/themes/${theme}`} className="z-pill hover:bg-[var(--fog-2)]">See it as a Shabbat theme<ArrowRight size={14} aria-hidden="true" /></Link>}
        </div>
      </PageHead>

      <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Panel title="Against their own normal" value={i.lift == null ? 'n/a' : liftShort(i.lift)} go={!thin && liftPct(i.lift) >= 12} muted={thin}>
          {i.lift == null ? 'No run of this idea has sign-up numbers that can be scored.' : thin ? `Thin evidence, so read this as a hint and not a result. It rests on ${plural(i.n_scored, 'scored run')} at ${plural(i.centers_scored, 'center')}.` : `Each run is read against that center's normal for the same kind of event, with the usual shape of a semester taken out.`}
        </Panel>
        <Panel title="Runs that beat normal by 20% or more" value={i.hit == null ? 'n/a' : `${Math.round(i.hit * 100)}%`} muted={thin}>
          {i.hit == null ? 'Not enough data.' : `${Math.round(i.hit * i.n_scored)} of ${plural(i.n_scored, 'scored run')}.${thin ? ' Too few to lean on.' : ''}`}
        </Panel>
        <Panel title="Centers that did better with it" value={i.centers_scored ? `${i.centers_up} of ${i.centers_scored}` : 'n/a'} muted={thin}>
          {i.centers_scored ? `Centers whose runs of it averaged above their own normal, out of the ${i.centers_scored} with scored runs.` : 'No center has a scored run.'}
        </Panel>
        <Panel title="How much evidence" value={CONF_SHORT[i.confidence] || 'Thin'}>
          {CONF[i.confidence]}: {plural(i.n_scored, 'scored run')} at {plural(i.centers_scored, 'center')}, out of {plural(i.n, 'run')} at {plural(i.centers, 'center')}.{i.med_regs != null ? ` A typical run draws ${Math.round(i.med_regs)} sign-ups.` : ''}
        </Panel>
      </div>
      {mine && <MineNote idea={i} cat={cat} mine={mine} />}

      <Section id="when-h" title="When it is run" sub={`Counted over ${plural(total, 'past run')}. The current month is in blue.`}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="z-card">
            <h3 className="z-h3">{!total ? 'No past runs yet' : peak === mNow ? `${pctOf(i.months[peak], total)}% of runs are in ${MONTH_FULL[peak]}, the current month.` : `${pctOf(i.months[peak], total)}% of runs are in ${MONTH_FULL[peak]}. ${pctOf(i.months[mNow], total)}% are in ${MONTH_FULL[mNow]}.`}</h3>
            <div className="mt-6"><Columns values={i.months} labels={MONTHS} highlight={[mNow]} height={150} tipFor={(m) => [MONTH_FULL[m], `${plural(i.months[m], 'run')}, ${pctOf(i.months[m], total)}%`]} /></div>
            <div className="mt-5">
              <Fact label="Usual timing" value={i.when}>{seasonal ? 'It follows the Jewish calendar, so its civil month shifts a little from year to year.' : i.when === 'Any time of year' ? 'No month or point in the semester holds most of its runs.' : 'Where most of its past runs fall.'}</Fact>
              <Fact label="Usual start" value={i.hour != null ? hourLabel(i.hour) : 'n/a'}>The hour it most often begins, local time.</Fact>
            </div>
          </div>
          <div className="z-card">
            <h3 className="font-bold">By day of the week</h3>
            <div className="mt-4"><Columns values={i.wd} labels={DAY3} height={130} tipFor={(d) => [DAYS[d], `${plural(i.wd[d], 'run')}, ${pctOf(i.wd[d], wdTotal)}%`]} /></div>
            <div className="mt-4">
              <Fact label="Most common day" value={wdTotal ? DAYS[wdTop] : 'n/a'}>{wdTotal ? `${pctOf(i.wd[wdTop], wdTotal)}% of runs.` : null}</Fact>
            </div>
            <Link to="/timing" className="z-btn z-btn-soft z-btn-sm mt-1" style={{ background: '#fff' }}>Timing for every kind of event<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </Section>

      <Section id="years-h" title="Adoption by year" sub="How many centers ran it in each academic year (July to June). The data starts thin in 2020 because few centers were posting events then, so early growth partly reflects that.">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="z-card">
            <h3 className="z-h3">{peakYear ? `${plural(peakYear.centers, 'center')} in ${peakYear.ay}, its widest year${partial && peakYear.ay === ayLabel ? ' so far' : ''}` : 'No past runs yet'}</h3>
            {i.years.length > 0 && <div className="mt-6" style={{ maxWidth: Math.max(220, i.years.length * 76) }}><Columns values={i.years.map((y) => y.centers)} labels={i.years.map((y) => y.ay.slice(2))} height={130} dim={(k) => partial && k === i.years.length - 1} tipFor={(k) => [i.years[k].ay, `${plural(i.years[k].centers, 'center')}${partial && k === i.years.length - 1 ? ', year in progress' : ''}`]} /></div>}
            <p className="mt-5 z-muted" style={{ lineHeight: 1.5 }}>
              {seasonal ? `It is tied to a Jewish holiday whose civil date moves from year to year, so this year so far is not compared with the same weeks last year.`
                : `So far this academic year ${plural(i.ytd_now, 'center')} ${i.ytd_now === 1 ? 'has' : 'have'} run it. By the same date last year, ${i.ytd_last} had.`}
              {partial ? ` ${ayLabel} is still in progress and is drawn in grey.` : ''}
            </p>
          </div>
          <div className="z-card" style={{ paddingTop: '0.6rem', paddingBottom: '0.6rem' }}>
            <div style={{ marginTop: -1 }}>
              <Fact label="Who started it" value={first ? <CenterLink c={first} /> : 'Unknown'}>{i.first ? `First seen on ${fmtDate(i.first.date)}. That is the first run in this data, which begins in 2020.` : 'No past run on record.'}</Fact>
              <Fact label="Centers in all" value={i.centers}>{plural(i.n, 'past run')}{i.n_up > 0 ? `, and ${i.n_up} more posted for the coming weeks` : ''}.</Fact>
              <Fact label="Who it is for" value={i.aud.length ? (AUD[i.aud[0]] || i.aud[0]) : 'Everyone'}>{i.aud.length > 1 ? `Also aimed at ${i.aud.slice(1).map((a) => (AUD[a] || a).toLowerCase()).join(', ')}.` : i.aud.length ? 'Named in the title or description of at least four in ten of its programs.' : 'No audience is named often enough to count.'}</Fact>
            </div>
          </div>
        </div>
      </Section>

      {i.names.length > 0 && (
        <Section id="names-h" title="What centers call it" sub="The most common names, with how many programs use each.">
          <ul className="flex flex-wrap gap-2.5">
            {i.names.map((x) => <li key={x.name} className="z-pill" style={{ height: '2.5rem', fontSize: '1rem', padding: '0 1.1rem', maxWidth: '100%' }}><span className="truncate">{x.name}</span><span className="z-muted" style={{ fontWeight: 600 }}>{x.n}</span></li>)}
          </ul>
        </Section>
      )}

      {i.flyers.length > 0 && (
        <Section id="flyers-h" title="Flyers" sub="One per center, the best-performing first. Sign-ups are that program's typical count.">
          <FlyerGrid>{i.flyers.map((p) => <ProgramCard key={p} p={cat.prog(p)} />)}</FlyerGrid>
        </Section>
      )}

      {i.rep.length > 0 && (
        <Section id="rep-h" title="Representative programs" sub="The programs closest to the middle of this idea, one per center, with the description each center posted.">
          <ProgramTable rows={i.rep.map((p) => cat.prog(p)).filter(Boolean)} descs={descs} />
        </Section>
      )}

      <Section id="all-h" title="Every program in this idea" sub={`${plural(progs.length, 'program')} at ${plural(i.centers, 'center')}, the most often run first.`}>
        <More count={Math.max(0, progs.length - 8)} label="Show the other">{(open) => <ProgramTable rows={open ? progs : progs.slice(0, 8)} />}</More>
      </Section>

      {i.related.length > 0 && (
        <Section id="rel-h" title="Related ideas" sub="The ideas whose programs sit nearest to this one's.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {i.related.map((r) => ideas[r]).filter(Boolean).map((r) => { const rt = r.lift == null || r.confidence === 'thin'; return (
              <Link key={r.id} to={`/idea/${r.id}`} className="z-card flex flex-col">
                <div><StatusPill status={r.status} onFog /></div>
                <h3 className="z-h3 mt-4">{r.label}</h3>
                <p className="z-small z-muted mt-1.5">{plural(r.centers, 'center')}, {whenText(r.when)}</p>
                <div className="mt-auto pt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {rt ? <span className="font-semibold">Not enough sign-up data</span> : <Lift value={r.lift} />}
                  {!rt && <span className="z-small z-muted">{CONF[r.confidence]}: {plural(r.n_scored, 'scored run')} at {plural(r.centers_scored, 'center')}</span>}
                </div>
              </Link>); })}
          </div>
        </Section>
      )}
    </div>
  );
}
