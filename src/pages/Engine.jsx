import { Link } from 'react-router-dom';
import { useData, fmtDate } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Stat, Meter, Columns, HBars } from '../components/bits';

// The transparency page. Every number below is read from engine.json (written by engine/export.py), from
// centers.json (the category check) or from home.json (the trending window). The method notes were checked
// against the engine source; thresholds quoted in the text are the constants in those files.
const N = (v) => Number(v).toLocaleString();
const pct = (v) => `${Math.round(v * 100)}%`;
const off = (f) => Math.round(Math.abs(f - 1) * 100);
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

function Check({ title, value, unit, children }) {
  return (
    <div className="z-card flex flex-col">
      <h3 className="z-h3">{title}</h3>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="z-num" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.1rem)' }}>{value}</span><span className="font-semibold" style={{ lineHeight: 1.25 }}>{unit}</span></p>
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

export default function Engine() {
  const { data, error } = useData('engine.json', 'centers.json', 'home.json');
  if (error) return <ErrorNote error={error} what="This page" />;
  if (!data) return <Loading rows={4} h={180} />;
  const [e, cen, home] = data;
  const c = e.counts, t = e.types, s = e.search, p = e.predictor, terms = e.terms;
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
  // the category check: what the two campus facets explain of things they were not built from
  const word = (n, cap) => { const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] || String(n); return cap ? w[0].toUpperCase() + w.slice(1) : w; };
  const nCampus = cen.facets.filter((f) => f.kind === 'campus').length, nEvents = cen.facets.length - nCampus;
  const facetName = Object.fromEntries(cen.facets.map((f) => [f.key, f.label]));
  const low = (l) => (/^(Shabbat|Jewish)/.test(l) ? l : l[0].toLowerCase() + l.slice(1));
  const outcome = (k) => low(cen.outcome_labels[k] || k);
  const tested = cen.facets.filter((f) => f.kind === 'campus').flatMap((f) => Object.entries(cen.validation[f.key] || {}).map(([k, r]) => ({ f: f.key, k, ...r })));
  const strong = tested.filter((r) => r.p < 0.05).sort((x, y) => y.eta2 - x.eta2).slice(0, 3);
  const weak = tested.filter((r) => r.p >= 0.05).sort((x, y) => y.p - x.p)[0];
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
            <p>For what the rules cannot place, the engine finds the 15 already-typed event texts closest in wording and takes their vote. It only accepts the vote when the closest text is a near match and one type wins at least half of it. The same pass notes the Jewish holiday a name ties to and who the event is for (grad students, women, first-years), when the name says so.</p>
          </Step>

          <Step n={2} title="Score each event against its own center's normal" stats={[[N(c.scored), 'events scored'], [N(c.measured - c.scored), 'had sign-ups but could not be scored', 'too little history at the center, or a normal under 3']]}>
            <p>Raw sign-ups cannot be compared across centers: 40 is a slow night at one and a record at another. So each event is set against the median for the same type of event at the same center, over the year before and the year after. That ratio is the lift.</p>
            <p>A worked example: a center's Shabbat dinners usually draw 40 sign-ups, and one dinner draws 61. Lift is (61 + 2) / (40 + 2) = 1.5, shown as +50%. The 2 added to each side keeps small numbers from swinging: 3 sign-ups against a normal of 1 is not three times normal.</p>
            {curve && <p>Then the usual shape of a semester is taken out, type by type. Fall Shabbat dinners, for one, peak in week {hi} of the term at {off(curve[hi])}% above a center's normal and sink to {off(curve[lo])}% below by week {lo}. Without this step every early-semester event would look like a hit.</p>}
            <p>An event is scored only if it has at least one sign-up, the center has at least four other events of that type within a year either side (or six of any type), and the center's normal is three sign-ups or more.</p>
          </Step>

          <Step n={3} title="Read three calendars" stats={[[N(terms.clean_terms_used), 'clean semesters found', `at ${N(terms.centers_with_clean_terms)} centers`], fall ? [fmtDate(fall, { month: 'short', day: 'numeric' }), `typical start of fall ${thisYear}`, 'the median across centers'] : null].filter(Boolean)}>
            <p>Every date is read three ways. The civil calendar gives the month, the weekday and the dates centers plan around (Super Bowl, Halloween, Thanksgiving). The Jewish calendar gives the Hebrew date, the parsha, and each holiday with the run-up days before it.</p>
            <p>The academic term is the hard one, because nobody publishes term dates for every campus. The engine works them out from activity: unbroken runs of events mark out clean semesters, their median start becomes the network's start date for that term, and each center's own start is the first nearby date with two events inside ten days. That gives every event a week of term.</p>
          </Step>

          <Step n={4} title="Group repeats into programs" stats={[[N(c.programs), 'programs'], [N(live), 'event dates behind them', 'canceled events left out']]}>
            <p>An event is one date. A program is everything one center has run under one name: “Sushi in the Sukkah” at one center, three years running, is one program with three dates. Names are matched after dropping capitals, emoji and punctuation. Programs are what gets searched, compared and grouped.</p>
          </Step>

          <Step n={5} title="Find the same idea across centers" stats={[[N(c.ideas), 'ideas', 'each run by two or more centers'], [N(c.texts), 'distinct texts compared']]}>
            <p>Each event's name and description are turned into a list of numbers, called an embedding, so that similar wording lands close together. Programs of the same type are then grouped when they are close in wording and in the spelling of the name (65% wording, 35% name), so “Hamantash Bake” and “Hamentashen Bake” end up together. Shabbat dinners are the exception: they are grouped by their theme, which is the next step. A group becomes an idea only when at least two centers are in it.</p>
            <p>An idea's lift is the average lift of its events, pulled toward normal when there are few of them. It is called solid evidence only with 12 or more scored events from 6 or more centers, some evidence with 5 from 3, and thin below that.</p>
          </Step>

          <Step n={6} title="Mine Shabbat dinner themes" stats={[[N(c.themes), 'themes'], [N(t.events.shabbat_dinner), 'Shabbat dinners on record']]}>
            <p>A theme is what a center adds to “Shabbat dinner” in the name: Italian, Pink, Welcome Back, Under the Stars. The engine strips the words every dinner name shares, sets aside any phrase one center puts on most of its dinners (that is its house name for the regular dinner), and keeps a phrase as a theme once three centers use it.</p>
            <p>Each themed dinner is then compared with the same center's plain dinners within 45 days either side. That answers the question that matters: did the theme beat a regular Friday at that center, at that point in the semester?</p>
          </Step>

          <Step n={7} title="Describe and compare centers" stats={[[`${N(cen.reference.matched)} of ${N(cen.reference.us)}`, 'US campuses matched to federal data', cen.reference.source], [N(cen.profiled), 'centers with enough events to read', `of ${N(cen.total)}. The rest are placed by campus alone`]]}>
            <p>Each center is described on {word(cen.facets.length)} separate questions, and each answer is decided by a written rule. {word(nCampus, true)} are about the campus: what kind of school it is and how many Jewish students the center serves. US campuses are placed with federal data (IPEDS and the College Scorecard): public or private, Carnegie class, enrollment, admission rate and how many first-year students live with family. The other {word(nEvents)} are read from the center's own events: its biggest draw, how full its calendar is, what the calendar leans toward, how it uses sign-ups and where it is in its life on the system. The rules are on the <Link to="/centers" className="z-link">Centers</Link> page.</p>
            <p>A center's peers are the twelve centers that score closest to it. Half of the score is the campus match (kind of campus, Jewish population, biggest draw) and half is how alike the two calendars are. Its gaps are ideas that at least three of those peers ran in the last three years, that did not do poorly, and that it never has run. An earlier version sorted centers into groups by statistical clustering. It was dropped because the groups overlapped almost completely.</p>
          </Step>

          <Step n={8} title="Build the timing tables" stats={[['25', 'scored events needed for a slot'], ['6', 'centers needed for a slot']]}>
            <p>For each type, events are counted by weekday and hour, by month, by week of the term and around each holiday. Two questions are kept apart: how many centers use a slot (what the network does) and how events in that slot did against the same center's normal (what works).</p>
            <p>A slot's lift counts as reliable only with at least 25 scored events from at least 6 centers. Anything thinner is marked as not enough data.</p>
          </Step>

          <Step n={9} title="Work out what is trending" stats={[[`${home.window.back + home.window.ahead} days`, 'the window called “now”', `${home.window.back} back, ${home.window.ahead} ahead`], [N(c.upcoming), 'events posted ahead']]}>
            <p>“Now” is a rolling window: the last {home.window.back} days, which have final numbers, plus the next {home.window.ahead}, which centers have already posted. An idea is trending when two or more centers have it inside that window.</p>
            <p>Rising compares that count with the same window a year ago, after allowing for the network itself having grown. Holiday ideas are compared on the Jewish calendar instead, so an early Sukkot does not look like a trend.</p>
          </Step>
        </ol>
      </Section>

      <Section id="check-h" title="How well it holds up" sub="The engine tests itself on every run. These are the results from the latest one, weak ones included.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Check title="The search in your browser finds what an exact search would" value={pct(s.recall_at_10)} unit="of the true ten nearest matches">
            <p>To run in a browser, each program's 1,024 numbers are squeezed down to {s.dims}, which keeps {pct(s.variance_kept)} of the variation. On 400 sample programs, the small version returned {pct(s.recall_at_10)} of the same ten nearest matches as the full one.</p>
            <p className="z-muted">For scale: two programs from the same idea at different centers have a median similarity of {s.same_p50.toFixed(2)}. Two random programs score about zero, and only 1 random pair in 100 goes above {s.random_p99.toFixed(2)}.</p>
          </Check>

          <Check title="The two ways of typing events mostly agree" value={pct(t.heldout_agreement)} unit="agreement with the written rules">
            <p>The test hides the type of 2,000 rule-typed event texts and lets the nearest-neighbor vote guess. It was sure enough to answer for {pct(t.heldout_coverage)} of them, and on those it matched the rules {pct(t.heldout_agreement)} of the time.</p>
            <p className="z-muted">So about 1 in {Math.round(1 / (1 - t.heldout_agreement))} neighbor-typed events may sit in the wrong type. That method types {N(t.by_neighbors)} events, {pct(t.by_neighbors / c.events)} of the total.</p>
          </Check>

          <Check title="Similar past programs give a modest edge, not a forecast" value={p.k40_p8.toFixed(2)} unit="rank correlation, where 0 is chance and 1 is perfect">
            <p>This tests the question the <Link to="/ideas" className="z-link">Idea lab</Link> asks: can programs like yours, run elsewhere, tell how yours will do? The newest fifth of scored programs ({N(p.tested)}) were each predicted only from older programs at other centers ({N(p.trained)}), by averaging how the 40 most similar ones did.</p>
            <p>The predicted order matched the real order with a correlation of {p.k40_p8.toFixed(2)}. Knowing only the type of event scores {p.type_only.toFixed(2)}. So wording carries real information, and most of what decides a turnout is still not in the name.</p>
            <div className="pt-2">
              <p className="font-bold z-small mb-3">Share that went on to beat their own center's normal by 20% or more</p>
              <HBars format={pct} rows={[
                { key: 'top', label: 'Predicted top fifth', value: p.top_fifth_hit, color: 'var(--go)', tip: ['Predicted top fifth', `${pct(p.top_fifth_hit)} beat their normal by 20% or more`] },
                { key: 'all', label: 'All tested programs', value: p.base_hit, tip: ['All tested programs', `${pct(p.base_hit)} beat their normal by 20% or more`] },
                { key: 'bot', label: 'Predicted bottom fifth', value: p.bottom_fifth_hit, tip: ['Predicted bottom fifth', `${pct(p.bottom_fifth_hit)} beat their normal by 20% or more`] },
              ]} />
            </div>
          </Check>

          <Check title="Do the categories mean anything?" value={strong.length ? pct(strong[0].eta2) : 'n/a'} unit={strong.length ? `of the differences in ${outcome(strong[0].k)} are explained by ${low(facetName[strong[0].f])}` : 'no campus facet explains anything clearly'}>
            <p>A category is worth having only if it tells you something it was not built from. So each facet is tested against things it never saw, and the same test is run with the labels shuffled at random.</p>
            <ul>
              {strong.map((r) => <li key={r.f + r.k} className="py-2" style={{ borderTop: '1px solid var(--fog-2)' }}>{facetName[r.f]} explains {pct(r.eta2)} of the differences in {outcome(r.k)}. Shuffled labels explain {pct(r.chance)}.</li>)}
              {weak && <li className="py-2 z-muted" style={{ borderTop: '1px solid var(--fog-2)' }}>A weak one: {low(facetName[weak.f])} says next to nothing about {outcome(weak.k)} ({pct(weak.eta2)}, against {pct(weak.chance)} for shuffled labels).</li>}
            </ul>
            <p>Peers pass a check of their own: {pct(cen.peer_check.same_setting_top5)} of a center's five nearest peers are at the same kind of campus, against {pct(cen.peer_check.by_chance)} if peers were drawn at random.</p>
            <p className="z-muted">Campus facts explain some of what a center does and far from all of it, which is why the facets about events are kept separate from the ones about the campus.</p>
          </Check>
        </div>
      </Section>

      <Section id="limits-h" title="What this cannot tell you">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-9">
          <Limit title="Sign-ups are not attendance">A sign-up is someone saying they plan to come. Walk-ins are not counted and no-shows are. Comparing sign-ups with sign-ups is fair inside one center. It says nothing about how full the room was.</Limit>
          <Limit title="Small centers have noisy numbers">When a center's normal is 6, two extra sign-ups read as +25%. The formula and the evidence labels soften this, and a center whose normal is under 3 is not scored at all, but one result at a small center is weak evidence.</Limit>
          <Limit title="A result elsewhere is evidence, not a promise">An idea that beat normal at many centers has a better chance at yours than one that did not. The check above puts a size on that edge: {pct(p.top_fifth_hit)} against {pct(p.base_hit)}. Your students, your date and your flyer decide the rest.</Limit>
          <Limit title="Only public data, and no student data">Everything comes from what each center posts publicly: event names, descriptions, dates, flyers, the count of sign-ups, and the public facts listed for its campus. No names, no contact details and nothing from any center's private records.</Limit>
        </div>
      </Section>

      <Section id="noai-h" title="No AI writing">
        <div className="p-6 sm:p-9 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-x-12 gap-y-8 items-start" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--r-lg)' }}>
          <div className="space-y-4" style={{ lineHeight: 1.55, fontSize: '1.05rem' }}>
            <p className="z-display" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', lineHeight: 1.12 }}>No language model writes or judges anything the engine produces.</p>
            <p style={{ color: 'rgba(255,255,255,0.85)' }}>There are no generated summaries, no generated advice and no AI ratings of events. Every flyer and description shown is the center's own, word for word.</p>
            <p style={{ color: 'rgba(255,255,255,0.85)' }}>Text is only ever compared. That is done with embeddings: a way of turning a piece of text into a list of numbers so that similar wording lands close together. The model that makes them (bge-m3, open source) gives back numbers, never words. Everything else is counting and statistics: medians, ratios, rankings and grouping.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-5 gap-y-7">
            <Stat onDark value={N(e.llm_calls)} label="language-model calls in the latest run" />
            <Stat onDark value={N(c.texts)} label="texts turned into numbers" sub="each one embedded once and kept" />
          </div>
        </div>
        <p className="z-small z-muted mt-5">This page reflects the engine run of {stamp(e.generated)}.</p>
      </Section>
    </div>
  );
}
