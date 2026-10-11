import { Link } from 'react-router-dom';
import { useData, fmtDate } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Stat, Meter, Columns, tip } from '../components/bits';

// The transparency page. Every number below is read from engine.json (written by engine/export.py), from
// centers.json (the clump test and the neighbor settings) or from home.json (the trending window). The method
// notes were checked against the engine source; thresholds quoted in the text are the constants in those files.
const N = (v) => Number(v).toLocaleString();
const pct = (v) => `${Math.round(v * 100)}%`;
const off = (f) => Math.round(Math.abs(f - 1) * 100);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function Step({ n, title, stats, children }) {
  return (
    <li className="z-card grid grid-cols-1 lg:grid-cols-[3.2rem_minmax(0,1fr)_minmax(0,15rem)] gap-x-8 gap-y-5">
      <div className="z-num" style={{ fontSize: '2.3rem', color: 'var(--grey)' }} aria-hidden="true">{n}</div>
      <div className="min-w-0">
        <h3 className="z-h3"><span className="sr-only">Step {n}: </span>{title}</h3>
        <div className="mt-3 space-y-3 max-w-[66ch]" style={{ lineHeight: 1.55 }}>{children}</div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-5 gap-y-5 content-start lg:pl-6" style={{ borderColor: 'var(--mist)' }}>
        {stats.map(([value, label, sub]) => <Stat key={label} value={value} label={label} sub={sub} />)}
      </div>
    </li>
  );
}

function Check({ title, value, unit, children, className = '' }) {
  return (
    <div className={`z-card flex flex-col ${className}`}>
      <h3 className="z-h3">{title}</h3>
      {value != null && <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="z-num" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.1rem)' }}>{value}</span><span className="font-semibold" style={{ lineHeight: 1.25 }}>{unit}</span></p>}
      <div className="mt-4 space-y-3" style={{ lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

const Limit = ({ title, children }) => (
  <div className="min-w-0 pt-5" style={{ borderTop: '2px solid var(--ink)' }}>
    <h3 className="z-h3">{title}</h3>
    <p className="mt-2.5 z-muted" style={{ lineHeight: 1.55 }}>{children}</p>
  </div>
);

// Bars on a fixed 0 to 1 scale, label above each bar so long labels stay readable. A full bar is the best possible.
function ScaleBars({ rows, format = f2, full }) {
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key} tabIndex={0} {...tip(r.tip || [r.label, format(r.value)])}>
          <span className="block z-small font-semibold" style={{ lineHeight: 1.3 }}>{r.label}</span>
          <span className="mt-1.5 grid grid-cols-[minmax(0,1fr)_2.8rem] gap-3 items-center">
            <span style={{ display: 'block', height: 14, background: '#fff', borderRadius: '0 4px 4px 0' }}><span style={{ display: 'block', width: `${Math.max(1, Math.min(1, r.value) * 100)}%`, height: '100%', background: r.go ? 'var(--go)' : 'var(--ink)', borderRadius: '0 4px 4px 0' }} /></span>
            <span className="z-small font-semibold tabular-nums text-right">{format(r.value)}</span>
          </span>
        </li>
      ))}
      {full && <li className="z-small z-muted" style={{ lineHeight: 1.45 }}>{full}</li>}
    </ul>
  );
}

// The one-time comparison that picked the embedding set-up: rows are set-ups, columns are three jobs.
function EmbeddingTable({ rows }) {
  const cols = [['search', 'Search', 'does a typed idea find the right programs', f3], ['kinds', 'Kinds', 'nearest programs at other centers are the same kind of event', (v) => `${(v * 100).toFixed(1)}%`], ['results', 'Results', 'predicted order against what happened', f3]];
  const best = Object.fromEntries(cols.map(([k]) => [k, Math.max(...rows.map((r) => r[k]))]));
  return (
    <div className="overflow-x-auto z-scroll">
      <p className="sm:hidden z-small z-muted mb-1">Scroll sideways to see every column.</p>
      <table className="z-table" style={{ minWidth: 520 }}>
        <thead><tr>
          <th scope="col">Set-up</th>
          {cols.map(([k, l, s]) => <th key={k} scope="col" className="num" style={{ textAlign: 'right', whiteSpace: 'normal', width: '21%', verticalAlign: 'bottom' }}>{l}<span className="block font-normal" style={{ fontSize: '0.76rem', lineHeight: 1.3 }}>{s}</span></th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={r.chosen ? { background: 'var(--go-tint)' } : undefined}>
              <th scope="row" className="text-left" style={{ padding: '0.85rem 1rem 0.85rem 0.6rem', borderTop: '1px solid var(--fog-2)', fontWeight: r.chosen ? 700 : 500, lineHeight: 1.35, color: 'var(--ink)', fontSize: '0.95rem', whiteSpace: 'normal' }}>
                {r.label}{r.chosen && <span className="z-pill ml-2 align-middle" style={{ background: 'var(--go)', color: '#fff', height: '1.45rem', fontSize: '0.74rem' }}>Chosen</span>}
              </th>
              {cols.map(([k, , , fmt]) => <td key={k} className="num" style={{ fontWeight: r[k] === best[k] ? 800 : 400 }}>{fmt(r[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Engine() {
  const { data, error } = useData('engine.json', 'centers.json', 'home.json');
  if (error) return <ErrorNote error={error} what="This page" />;
  if (!data) return <Loading rows={4} h={180} />;
  const [e, cen, home] = data;
  const c = e.counts, t = e.types, s = e.search, terms = e.terms, te = e.texts_embedded || {}, m = cen.method;
  const years = Object.keys(c.by_year).sort();
  const thisYear = e.today.slice(0, 4);
  const other = c.ran - c.zero_signups - c.measured;            // ran with sign-ups, but a to-go order or a standing form
  const nTypes = Object.keys(t.labels).length;
  const live = Object.values(t.events).reduce((a, b) => a + b, 0);   // every event that was not canceled
  // the semester shape of Shabbat dinners in the fall, as the worked example of "the usual shape taken out"
  const curve = e.score.week_factor['shabbat_dinner|fall'];
  const wk = curve ? Object.keys(curve).map(Number) : [];
  const hi = wk.reduce((a, b) => (curve[b] > curve[a] ? b : a), wk[0]), lo = wk.reduce((a, b) => (curve[b] < curve[a] ? b : a), wk[0]);
  const fall = terms.median_start[`fall ${thisYear}`];
  // the clump test: do centers form natural groups when every measure is taken together?
  const st = cen.structure, clump = st.tests.reduce((a, b) => (b.stability > a.stability ? b : a), st.tests[0]);
  const ks = st.tests.map((x) => x.k);
  const bandNames = cen.facets.map((f) => (/^(Shabbat|Jewish)/.test(f.label) ? f.label : f.label[0].toLowerCase() + f.label.slice(1)));
  // the replay of the neighbor system on a year it had not seen, and on the year its settings were picked on
  const test = e.predictor?.test, tune = e.predictor?.tuning, full = test?.full;
  const pieces = test ? [
    ['kind_of_event_only', 'Kind of event only'],
    ['text_only_other_centers', 'Similar events at other centers'],
    ['no_own_history', 'Similar events at other centers, plus likeness between centers'],
    ['no_center_likeness', 'Similar events, plus this center\'s own history'],
    ['full', 'Everything: similar events, likeness between centers and own history'],
  ].filter(([k]) => test[k]).map(([k, label]) => ({ key: k, label, value: test[k].rho, go: k === 'full', tip: [label, `Rank correlation ${f2(test[k].rho)}`, `Top fifth of predictions in their center's top third: ${pct(test[k].top_fifth_in_top_third)}`] })) : [];
  // the comparison that picked the embedding set-up
  const et = e.embedding_tests, row = (k) => et?.rows.find((r) => r.key === k);
  const old = row('old'), chosen = et?.rows.find((r) => r.chosen), wording = row('wording');
  const rivals = et ? et.rows.filter((r) => !r.chosen && r.key !== 'old' && r.key !== 'wording') : [];
  const wonAll = chosen && rivals.every((r) => ['search', 'kinds', 'results'].every((k) => chosen[k] >= r[k]));
  const funnel = [
    [c.events, 'events on record', `at ${N(c.centers)} centers since ${fmtDate(c.first_event, { month: 'short', year: 'numeric' })}`],
    [c.ran, 'events that ran', `${N(c.canceled)} were canceled, ${N(c.upcoming)} are still ahead`],
    [c.measured, 'events with sign-ups', 'at least one, at an event where a sign-up means a person'],
    [c.scored, 'events scored', 'the center has enough history to say what is normal'],
  ];

  return (
    <div>
      <PageHead title="How this works" lede="Every number in Campus Playbook is counted from what centers post on their public sign-up pages. This page shows what was read, how each number is made, and how far to trust it." />

      <Section id="data-h" title="The data" sub={`Chabad on Campus centers post their events on public sign-up pages. The engine reads those pages and nothing else. It last read them on ${stamp(e.pulled_at)}, and covers ${fmtDate(c.first_event)} to today plus everything already posted for the months ahead.`}>
        <div className="z-card">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-8">
            {funnel.map(([v, label, sub]) => (
              <div key={label} className="min-w-0">
                <Stat value={N(v)} label={label} sub={sub} />
                <div className="mt-3 max-w-[11rem]"><Meter value={v} max={c.events} track="#fff" height={8} /></div>
              </div>
            ))}
            <div className="min-w-0 col-span-2 lg:col-span-1"><Stat value={N(c.signups)} label="sign-ups counted" sub="across every event that ran" /></div>
          </div>
        </div>
        <p className="z-note mt-4" style={{ lineHeight: 1.5 }}>
          {N(c.zero_signups)} of the events that ran, {pct(c.zero_signups / c.ran)} of them, have zero sign-ups. Many centers do not take sign-ups for every event, so a zero almost always means sign-ups were not used, not that nobody came. Those events count as activity (what was run, and when) and are never scored.
          {other > 0 && ` Another ${N(other)} had sign-ups but are to-go orders or standing sign-up forms, where a sign-up is not a person at an event, so they are left out of scoring too.`}
        </p>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="z-card">
            <h3 className="font-bold">Events that ran, by year</h3>
            <p className="z-small z-muted mt-1" style={{ lineHeight: 1.45 }}>The record starts in {fmtDate(c.first_event, { month: 'long', year: 'numeric' })}, and {thisYear} only runs through {fmtDate(e.today, { month: 'short', day: 'numeric' })}, so its bar is not a full year.</p>
            <div className="mt-5"><Columns values={years.map((y) => c.by_year[y])} labels={years} height={130} format={N} tipFor={(i) => [years[i], `${N(c.by_year[years[i]])} events ran`]} dim={(i) => years[i] === thisYear} /></div>
          </div>
          <div className="z-card">
            <h3 className="font-bold">How much centers use sign-ups</h3>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-6">
              <Stat value={`${N(c.reliable_centers)} of ${N(c.centers)}`} label="centers use sign-ups steadily" sub="25 or more events with sign-ups, and sign-ups on at least 40% of what they run" />
              <Stat value={N(c.with_flyer)} label="events have a flyer" sub={`${pct(c.with_flyer / c.events)} of everything on record`} />
            </div>
            <p className="z-small z-muted mt-5" style={{ lineHeight: 1.45 }}>A center outside that group still appears everywhere, and its events are still scored against its own normal. The front page's list of recent wins only draws on the {N(c.reliable_centers)}.</p>
          </div>
        </div>
      </Section>

      <Section id="how-h" title="How each number is made" sub="The engine runs these steps in order every time it reads the data. Each one is counting, statistics or comparing text. The counts on the right are from the latest run.">
        <ol className="space-y-4">
          <Step n={1} title="Sort every event into a type" stats={[[N(t.by_rules), 'typed by written rules', `${pct(t.by_rules / c.events)} of all events`], [N(t.by_neighbors), 'typed by their nearest neighbors', `${N(t.unplaced)} stay as “Other”`]]}>
            <p>The data has no category field, so each event is typed from its name, its description and when it happens. Written rules go first: a name with “Kol Nidrei” or “Lunch and Learn” in it is easy to place. There are {nTypes} types.</p>
            <p>For what the rules cannot place, the engine finds the 15 already-typed event texts closest in wording (using the numbers from step 2) and takes their vote. It only accepts the vote when the closest text is a near match and one type wins at least half of it. The same pass notes the Jewish holiday a name ties to and who the event is for (grad students, women, first-years), when the name says so.</p>
          </Step>

          <Step n={2} title="Turn every post into numbers" stats={[te.names != null ? [N(te.names), 'distinct event names embedded'] : null, te.blurbs != null ? [N(te.blurbs), 'distinct blurbs embedded', `${N(c.texts)} distinct posts in all`] : null].filter(Boolean)}>
            <p>An event post is a name and, sometimes, a blurb. Each is turned into a list of numbers, called an embedding, so that similar wording lands close together. Before that, both are cleaned: dates, times, prices, links, sign-up instructions and the center's own name are stripped, because they say nothing about what the event is. Left in, they pull two posts of the same event apart and pull unrelated posts from one center together.</p>
            <p>The name and the blurb are embedded separately. Each set is centered on its own average, which removes what every Chabad event post has in common, and the two are then averaged. A post with no blurb is its name alone, so it sits in the same space as every other post.</p>
          </Step>

          <Step n={3} title="Score each event against its own center's normal" stats={[[N(c.scored), 'events scored'], [N(c.measured - c.scored), 'had sign-ups but could not be scored', 'too little history at the center, or a normal under 3']]}>
            <p>Raw sign-ups cannot be compared across centers: 40 is a slow night at one and a record at another. So each event is set against the median for the same type of event at the same center, over the year before and the year after. That ratio is the lift.</p>
            <p>A worked example: a center's Shabbat dinners usually draw 40 sign-ups, and one dinner draws 61. Lift is (61 + 2) / (40 + 2) = 1.5, shown as +50%. The 2 added to each side keeps small numbers from swinging: 3 sign-ups against a normal of 1 is not three times normal.</p>
            {curve && <p>Then the usual shape of a semester is taken out, type by type. Fall Shabbat dinners, for one, peak in week {hi} of the term at {off(curve[hi])}% above a center's normal and sink to {off(curve[lo])}% below by week {lo}. Without this step every early-semester event would look like a hit.</p>}
            <p>An event is scored only if it has at least one sign-up, the center has at least four other events of that type within a year either side (or six of any type), and the center's normal is three sign-ups or more.</p>
            <p>A second scale is kept beside the lift: the event's place among all of its own center's events. The <a href="#nn-h" className="z-link">nearest-neighbor system</a> below predicts on that one.</p>
          </Step>

          <Step n={4} title="Read three calendars" stats={[[N(terms.clean_terms_used), 'clean semesters found', `at ${N(terms.centers_with_clean_terms)} centers`], fall ? [fmtDate(fall, { month: 'short', day: 'numeric' }), `typical start of fall ${thisYear}`, 'the median across centers'] : null].filter(Boolean)}>
            <p>Every date is read three ways. The civil calendar gives the month, the weekday and the dates centers plan around (Super Bowl, Halloween, Thanksgiving). The Jewish calendar gives the Hebrew date, the parsha, and each holiday with the run-up days before it.</p>
            <p>The academic term is the hard one, because nobody publishes term dates for every campus. The engine works them out from activity: unbroken runs of events mark out clean semesters, their median start becomes the network's start date for that term, and each center's own start is the first nearby date with two events inside ten days. That gives every event a week of term.</p>
          </Step>

          <Step n={5} title="Group repeats into programs" stats={[[N(c.programs), 'programs'], [N(live), 'event dates behind them', 'canceled events left out']]}>
            <p>An event is one date. A program is everything one center has run under one name: “Sushi in the Sukkah” at one center, three years running, is one program with three dates. Names are matched after dropping capitals, emoji and punctuation. Programs are what gets searched, compared and grouped.</p>
          </Step>

          <Step n={6} title="Find the same idea across centers" stats={[[N(c.ideas), 'ideas', 'each run by two or more centers'], [N(c.programs), 'programs compared']]}>
            <p>Programs of the same type are grouped when they are close in wording (the embeddings from step 2) and in the spelling of the name (65% wording, 35% name), so “Hamantash Bake” and “Hamentashen Bake” end up together. Shabbat dinners are the exception: they are grouped by their theme, which is the next step. A group becomes an idea only when at least two centers are in it.</p>
            <p>An idea's lift is the average lift of its events, pulled toward normal when there are few of them. It is called solid evidence only with 12 or more scored events from 6 or more centers, some evidence with 5 from 3, and thin below that.</p>
          </Step>

          <Step n={7} title="Mine Shabbat dinner themes" stats={[[N(c.themes), 'themes'], [N(t.events.shabbat_dinner), 'Shabbat dinners on record']]}>
            <p>A theme is what a center adds to “Shabbat dinner” in the name: Italian, Pink, Welcome Back, Under the Stars. The engine strips the words every dinner name shares, sets aside any phrase one center puts on most of its dinners (that is its house name for the regular dinner), and keeps a phrase as a theme once three centers use it.</p>
            <p>Each themed dinner is then compared with the same center's plain dinners within 45 days either side. That answers the question that matters: did the theme beat a regular Friday at that center, at that point in the semester?</p>
          </Step>

          <Step n={8} title="Describe and compare centers" stats={[[`${N(cen.readable)} of ${N(cen.total)}`, 'centers with enough events to read', `at least ${cen.min_events} events in the last three years`], [pct(clump.stability), 'agreement at best in the test for natural groups', 'the same groups every time would be 100%']]}>
            <p>Centers are described by what they do, not by the kind of school they sit on. The measures are: sign-ups at a typical event and at the biggest events, events a week, Jewish students served, the share of them the biggest events draw, and which kinds of event do well there. Each measure is cut into bands by a written rule ({bandNames.length} in all: {bandNames.join(', ')}). The rules are on the <Link to="/centers" className="z-link">Centers</Link> page.</p>
            <p>A center's nearest centers are the twelve closest to it on four measures with equal weight: biggest events, events a week, Jewish students, and which kinds of event do well. Type of school is not used.</p>
            <p>There are no blended clusters. The engine tried to sort the {N(st.centers)} best-measured centers into {ks.slice(0, -1).join(', ')} and {ks[ks.length - 1]} groups using every measure together, then redrew the sample to see whether the same groups came back. Agreement was {pct(clump.stability)} at best, with {clump.k} groups, and lower with more. Groups that unstable are not real borders, so bands and nearest neighbors are used instead.</p>
          </Step>

          <Step n={9} title="Build the timing tables" stats={[['25', 'scored events needed for a slot'], ['6', 'centers needed for a slot']]}>
            <p>For each type, events are counted by weekday and hour, by month, by week of the term and around each holiday. Two questions are kept apart: how many centers use a slot (what the network does) and how events in that slot did against the same center's normal (what works).</p>
            <p>A slot's lift counts as reliable only with at least 25 scored events from at least 6 centers. Anything thinner is marked as not enough data.</p>
          </Step>

          <Step n={10} title="Work out what is trending" stats={[[`${home.window.back + home.window.ahead} days`, 'the window called “now”', `${home.window.back} back, ${home.window.ahead} ahead`], [N(c.upcoming), 'events posted ahead']]}>
            <p>“Now” is a rolling window: the last {home.window.back} days, which have final numbers, plus the next {home.window.ahead}, which centers have already posted. An idea is trending when two or more centers have it inside that window.</p>
            <p>Rising compares that count with the same window a year ago, after allowing for the network itself having grown. Holiday ideas are compared on the Jewish calendar instead, so an early Sukkot does not look like a trend.</p>
          </Step>
        </ol>
      </Section>

      <Section id="nn-h" title="The nearest-neighbor system" sub="One question, always about one center and one event: how will this do here? The answer comes from the past events most like it, held at the centers most like that center, and from the center's own history. It drives the picks on every center page.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="z-card">
            <h3 className="z-h3">How much a past program counts</h3>
            <ol className="mt-4">
              {[
                ['How close its wording is to the event', `The likeness of the two embeddings, raised to the power of ${m.power}, so only near matches count for much.`],
                ['How much evidence it has', 'A program that ran once counts for about 0.7 of one that ran many times.'],
                ['How alike the two centers are', `A number from 0 to 1, from the four measures in step 8. When the past program is the asking center's own, this is set to ${N(m.own)} instead: a center's own history counts far more than anyone else's.`],
              ].map(([h, d], i) => (
                <li key={h} className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-3 py-3" style={{ borderTop: '1px solid var(--fog-2)' }}>
                  <span className="z-num z-muted" style={{ fontSize: '1.15rem', lineHeight: 1.3 }} aria-hidden="true">{i === 0 ? '' : '×'}</span>
                  <span style={{ lineHeight: 1.5 }}><span className="font-bold block">{h}</span><span className="z-muted">{d}</span></span>
                </li>
              ))}
            </ol>
            <p className="mt-3" style={{ lineHeight: 1.55 }}>The three are multiplied. The prediction is the weighted average of where the {N(m.k)} heaviest programs landed. The range shown beside it is the middle half of those same {N(m.k)}: their weighted 25th and 75th percentile.</p>
          </div>
          <div className="z-card">
            <h3 className="z-h3">The scale is a place, not a count</h3>
            <div className="mt-4 space-y-3" style={{ lineHeight: 1.55 }}>
              <p>Every event with sign-ups is placed among all of its own center's events from the year either side, smallest to biggest. An event that beat 85 in 100 of them lands in the top 15% of that center's events.</p>
              <p>That scale is what gets predicted, for two reasons. It is fair between a center that draws 20 and one that draws 400, so they can vote on each other's events. And it does not care whether a center takes sign-ups at every dinner or only at its big events.</p>
              <p>A place becomes expected sign-ups through the asking center's own spread of sign-ups: if the idea should land in the top fifth, the number shown is what the top fifth of that center's events draws. A center with fewer than 15 events with sign-ups gets the place in words and no number.</p>
            </div>
          </div>
        </div>

        {full && (
          <>
            <h3 className="z-h3 mt-12">How well does it call it?</h3>
            <p className="z-muted mt-2 max-w-[70ch]" style={{ lineHeight: 1.5 }}>The engine stood on {fmtDate(test.cut)}, hid everything after that day, and predicted every program that was new to its center in the twelve months that followed: {N(test.predicted)} programs at {N(test.centers)} centers, from {N(test.trained_on)} earlier ones. Then it compared with what happened.</p>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="z-card" style={{ background: 'var(--go)', color: '#fff' }}>
                <p className="font-semibold" style={{ opacity: 0.9 }}>The top fifth of its predictions</p>
                <p className="z-num mt-3" style={{ fontSize: 'clamp(2.6rem, 5vw, 3.8rem)' }}>{pct(full.top_fifth_in_top_third)}</p>
                <p className="mt-3" style={{ lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>landed in their center's top third of events. Chance would be about a third.</p>
              </div>
              <div className="z-card">
                <p className="font-semibold">The bottom fifth of its predictions</p>
                <p className="z-num mt-3" style={{ fontSize: 'clamp(2.6rem, 5vw, 3.8rem)' }}>{pct(full.bottom_fifth_in_top_third)}</p>
                <p className="mt-3 z-muted" style={{ lineHeight: 1.45 }}>landed in their center's top third. So a low prediction is rarely a hidden hit.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="z-card">
                <h4 className="font-bold">Ranking is decent, sign-up numbers are rough</h4>
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-7">
                  <Stat value={f2(full.rho)} label="rank correlation" sub="predicted order against real order. 0 is chance, 1 is perfect" />
                  <Stat value={`${Number(full.typical_error).toFixed(1)}×`} label="typical miss on sign-ups" sub={`half of the predictions were off by more than this factor, either way`} />
                  <Stat value={pct(full.within_1_5x)} label="within a factor of 1.5" sub="of the real sign-up number" />
                  <Stat value={pct(full.range_covers)} label="of results fell inside the range" sub="the range is built to hold about half" />
                </div>
                <p className="z-small z-muted mt-5" style={{ lineHeight: 1.5 }}>Read that plainly: the system is good at saying which ideas will land higher than others at a center, and poor at naming the number. When it predicted 20 sign-ups, the real number fell between {Math.round(20 / full.typical_error)} and {Math.round(20 * full.typical_error)} about half the time, and outside that the other half. That is why the app leads with the place and gives a range, never one confident number.</p>
              </div>
              <div className="z-card">
                <h4 className="font-bold">What each piece adds</h4>
                <p className="z-small z-muted mt-1" style={{ lineHeight: 1.45 }}>Rank correlation on the same test, with parts of the system switched off.</p>
                <div className="mt-5"><ScaleBars rows={pieces} full="A full bar would be a perfect ranking, and an empty one no better than chance." /></div>
                <p className="mt-4" style={{ lineHeight: 1.55 }}>Wording does most of the work: similar events at other centers already beat knowing only the kind of event ({f2(test.text_only_other_centers.rho)} against {f2(test.kind_of_event_only.rho)}). A center's own history adds the most after that ({f2(test.text_only_other_centers.rho)} to {f2(test.no_center_likeness.rho)}). Matching to similar centers adds a little ({f2(test.no_center_likeness.rho)} to {f2(full.rho)}).</p>
              </div>
            </div>
            {tune?.full && <p className="z-small z-muted mt-5 max-w-[72ch]" style={{ lineHeight: 1.5 }}>The settings (power {m.power}, {N(m.k)} neighbors, own history times {N(m.own)}, equal weight on the four center measures) were picked on the year before, where the same replay gave a rank correlation of {f2(tune.full.rho)} over {N(tune.predicted)} programs at {N(tune.centers)} centers. The numbers above are from the last twelve months, which played no part in picking them.</p>}
          </>
        )}
      </Section>

      <Section id="check-h" title="How well it holds up" sub="The engine tests itself on every run, and one comparison was run by hand. These are the results, weak ones included.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {et && chosen && (
            <Check title="Were the embeddings good enough?" className="lg:col-span-2">
              <p className="max-w-[72ch]">Three embedding models were tried on three jobs built from this data: finding the right programs for a typed idea, putting programs next to others of the same kind, and predicting how programs did. The row in blue is the set-up the engine uses. The best number in each column is in bold.</p>
              <EmbeddingTable rows={et.rows} />
              <ul className="max-w-[72ch]">
                <li className="py-2" style={{ borderTop: '1px solid var(--fog-2)' }}>The model was not the weak point. {wonAll ? `${e.model} came first or level on all three jobs` : `${e.model} held up against the others`}, so there was nothing to gain by switching.</li>
                {old && <li className="py-2" style={{ borderTop: '1px solid var(--fog-2)' }}>Cleaning the text and embedding the name and the blurb apart helped: search went from {f3(old.search)} to {f3(chosen.search)}, and telling kinds of events apart from {pct(old.kinds)} to {pct(chosen.kinds)} of nearest programs being the same kind.</li>}
                {wording && <li className="py-2" style={{ borderTop: '1px solid var(--fog-2)' }}>Adding an exact-wording match to search improved it further, to {f3(wording.search)}. That is what the search box uses.</li>}
                {old && et.in_system && <li className="py-2" style={{ borderTop: '1px solid var(--fog-2)' }}>For predicting turnout the new vectors are about level with the old ones: {f3(chosen.results)} against {f3(old.results)} in this test, and inside the full neighbor system {f3(et.in_system.new.test_year)} against {f3(et.in_system.old.test_year)} on the test year ({f3(et.in_system.new.tuning_year)} against {f3(et.in_system.old.tuning_year)} on the year before). Better text did not make the predictions better.</li>}
              </ul>
              {et.also_tried?.length > 0 && (
                <div>
                  <p className="font-bold">Also tried, and did not help</p>
                  <ul className="mt-1 z-muted">{et.also_tried.map((x) => <li key={x} className="py-1">{x}</li>)}</ul>
                </div>
              )}
              <p className="z-small z-muted max-w-[72ch]">This comparison was run once, by hand, on the data as it stood that day. Search is scored from 0 to 1 on 50 typed ideas with hand-written rules for what counts as a match. Results is a rank correlation using other centers only.</p>
            </Check>
          )}

          <Check title="The search in your browser finds what an exact search would" value={pct(s.recall_at_10)} unit="of the true ten nearest matches">
            <p>To run in a browser, each program's 1,024 numbers are squeezed down to {s.dims}, which keeps {pct(s.variance_kept)} of the variation. On 400 sample programs, the small version returned {pct(s.recall_at_10)} of the same ten nearest matches as the full one.</p>
            <p className="z-muted">For scale: two programs from the same idea at different centers have a median likeness of {f2(s.same_p50)}. Two random programs score about zero, and only 1 random pair in 100 goes above {f2(s.random_p99)}.</p>
          </Check>

          <Check title="The two ways of typing events mostly agree" value={pct(t.heldout_agreement)} unit="agreement with the written rules">
            <p>The test hides the type of 2,000 rule-typed event texts and lets the nearest-neighbor vote guess. It was sure enough to answer for {pct(t.heldout_coverage)} of the sample, and on those it matched the rules {pct(t.heldout_agreement)} of the time.</p>
            <p className="z-muted">So about 1 in {Math.round(1 / (1 - t.heldout_agreement))} neighbor-typed events may sit in the wrong type. That method types {N(t.by_neighbors)} events, {pct(t.by_neighbors / c.events)} of the total.</p>
          </Check>
        </div>
      </Section>

      <Section id="limits-h" title="What this cannot tell you">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-9">
          <Limit title="Sign-ups are not attendance">A sign-up is someone saying they plan to come. Walk-ins are not counted and no-shows are. Comparing sign-ups with sign-ups is fair inside one center. It says nothing about how full the room was.</Limit>
          <Limit title="Small centers have noisy numbers">When a center's normal is 6, two extra sign-ups read as +25%. The formula and the evidence labels soften this, and a center whose normal is under 3 is not scored at all, but one result at a small center is weak evidence.</Limit>
          <Limit title="A result elsewhere is evidence, not a promise">An idea that landed high at centers like yours has a better chance at yours than one that did not. {full ? `The replay above puts a size on that edge: ${pct(full.top_fifth_in_top_third)} of the top picks landed in their center's top third, against about a third by chance.` : ''} Your students, your date and your flyer decide the rest.</Limit>
          <Limit title="Only public data, and no student data">Everything comes from what each center posts publicly: event names, descriptions, dates, flyers and the count of sign-ups, plus the Jewish student numbers each center lists in the Chabad on Campus directory. No names, no contact details and nothing from any center's private records.</Limit>
        </div>
      </Section>

      <Section id="noai-h" title="No AI writing">
        <div className="p-6 sm:p-9 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-x-12 gap-y-8 items-start" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--r-lg)' }}>
          <div className="space-y-4" style={{ lineHeight: 1.55, fontSize: '1.05rem' }}>
            <p className="z-display" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', lineHeight: 1.12 }}>No language model writes or judges anything the engine produces.</p>
            <p style={{ color: 'rgba(255,255,255,0.85)' }}>There are no generated summaries, no generated advice and no AI ratings of events. Every flyer and description shown is the center's own, word for word.</p>
            <p style={{ color: 'rgba(255,255,255,0.85)' }}>Text is only ever compared. That is done with embeddings: a way of turning a piece of text into a list of numbers so that similar wording lands close together. The model that makes them ({e.model || 'bge-m3'}, open source) gives back numbers, never words. Everything else is counting and statistics: medians, ratios, rankings and weighted averages.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-5 gap-y-7">
            <Stat onDark value={N(e.llm_calls)} label="language-model calls in the latest run" />
            <Stat onDark value={N((te.names || 0) + (te.blurbs || 0) || c.texts)} label="texts turned into numbers" sub="names and blurbs, each embedded once and kept" />
          </div>
        </div>
        <p className="z-small z-muted mt-5">This page reflects the engine run of {stamp(e.generated)}.</p>
      </Section>
    </div>
  );
}
