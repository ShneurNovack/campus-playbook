import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, Check, ArrowRight } from 'lucide-react';
import { useData, useMyCenter, plural, share, fmtDate } from '../lib/data';
import { Section, Loading, ErrorNote, Empty, Stat, HBars, Columns, Meter, Flyer, ProgramCard, FlyerGrid, Dot, tip } from '../components/bits';

const title = (c) => c.campus || c.name;
const where = (c) => [c.city, c.state, c.country && c.country !== 'USA' ? c.country : null].filter(Boolean).join(', ');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'Website'; } };
const num = (v) => Math.round(v).toLocaleString();
const one = (v) => (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => (v > 0 && v < 0.01 ? 'under 1%' : `${Math.round(v * 100)}%`);
// The share a center draws is cut at 3% and 8%, so small shares keep one decimal.
const sharePct = (v) => (v < 0.0995 ? `${(v * 100).toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(v * 100)}%`);
const month = (d) => fmtDate(d, { month: 'short', year: 'numeric' });
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const lowerFirst = (s) => (/^(Shabbat|Jewish)/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const listWords = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// A percentile is an event's place among all of its own center's events, 0 (smallest) to 1 (biggest). It is
// always shown in words, never as a bare number.
const place = (p) => (p >= 0.9 ? 'top 10%' : p >= 0.8 ? 'top fifth' : p >= 0.67 ? 'top third' : p > 0.6 ? 'just above the middle' : p >= 0.4 ? 'around the middle' : p > 0.33 ? 'just below the middle' : p > 0.2 ? 'bottom third' : 'bottom fifth');
const placeIn = (p, of) => { const w = place(p); return /middle/.test(w) ? `${w} of ${of}` : `in the ${w} of ${of}`; };
// For a result that already happened, the exact place reads better: "top 2% of its events".
const landed = (p, of) => (p >= 0.67 ? `top ${Math.max(1, Math.round((1 - p) * 100))}% of ${of}` : placeIn(p, of).replace(/^in the /, ''));
// Why two centers are near each other, as the engine reports it (profiles[id].near[].why).
const REASON = { draw: 'similar biggest events', pace: 'similar pace', jewish: 'similar Jewish population', profile: 'the same kinds of event do well' };
const EDGE = 0.05;   // a kind of event counts as clearly higher or lower here at 5 percentile points

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

// The number each rule was applied to, as rows of [label, value]. Only what the engine has is listed.
function factsFor(key, { prof, st, lk }) {
  const rows = [];
  if (key === 'size') {
    rows.push(['Average sign-ups at its five biggest events, last three years', st.top5 != null ? num(st.top5) : 'Fewer than five events with sign-ups']);
    if (st.biggest) rows.push(['Biggest single event', num(st.biggest)]);
  } else if (key === 'typical') {
    rows.push(['Median sign-ups, events that took any, last two years', st.typical != null ? num(st.typical) : 'Fewer than five events with sign-ups']);
  } else if (key === 'pace') {
    rows.push(['Events a week while in session', st.pace != null ? one(st.pace) : 'Not read']);
    if (st.per_year != null) rows.push(['Events in the last twelve months', num(st.per_year)]);
    if (st.weeks) rows.push(['Weeks with at least one event', num(st.weeks)]);
  } else if (key === 'jewish') {
    rows.push(['Jewish students served', st.jewish != null ? num(st.jewish) : 'Not listed in the directory']);
    if ((st.campuses || []).length > 1) rows.push([`The ${st.campuses.length} campuses it serves`, st.campuses.join(', ')]);
  } else if (key === 'share') {
    if (st.draw_share != null) rows.push(['Biggest events over Jewish students served', `${num(st.top5)} of ${num(st.jewish)}, which is ${sharePct(st.draw_share)}`]);
    else rows.push(['Biggest events over Jewish students served', st.jewish == null ? 'No Jewish student count to divide by' : 'Fewer than five events with sign-ups']);
  } else if (key === 'strength') {
    rows.push(['Scored events, last three years', num(st.scored || 0)]);
    const fam = prof.families;
    if (fam) Object.entries(fam).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      const pts = Math.round(Math.abs(v) * 100);
      rows.push([lk.label.strength[k] || k, pts === 0 ? 'Level with its other kinds' : `${plural(pts, 'point')} ${v > 0 ? 'ahead of' : 'behind'} its other kinds`]);
    });
  } else if (key === 'signups') {
    if (st.rsvp_share != null) rows.push(['Events that took at least one sign-up, last three years', pct(st.rsvp_share)]);
    rows.push(['Events on record, all years', num(st.n || 0)]);
  } else if (key === 'stage') {
    if (st.first) rows.push(['First event', month(st.first)]);
    if (st.last) rows.push(['Latest event', month(st.last)]);
    rows.push(['Events in the last twelve months', num(st.n_now || 0)]);
    rows.push(['Events in the twelve months before', num(st.n_before || 0)]);
  }
  return rows;
}

// Eight measures, one row each: the band, the rule that decided it, and the number the rule was applied to.
function Kind({ cen, prof, st, lk }) {
  const rare = 'The number is shown for reference. Too few of this center\'s events took sign-ups to place it in a band.';
  const unk = (k) => prof.cat?.[k] === 'unknown';
  const note = { size: unk('size') && st.top5 != null ? rare : null, typical: unk('typical') && st.typical != null ? rare : null, share: unk('share') && st.draw_share != null ? rare : null,
    signups: unk('signups') && (st.n || 0) >= cen.min_events ? `The rule counts events from the last three years only, and this center has fewer than ${cen.min_events} of those.` : null,
    jewish: 'Source: Chabad on Campus directory, as entered by the center. An estimate.', strength: prof.families ? 'A point is one percentile point of the center\'s own events. A family of events counts as a strength at 4 points ahead or more.' : null };
  return (
    <Section id="kind-h" title="What kind of center this is" sub="Eight measures, each cut into bands by a written rule. Next to every band is the number the rule was applied to, so a wrong number is easy to spot. Press a band to see the other centers in it.">
      <div>
        {cen.facets.map((facet) => { const v = prof.cat?.[facet.key], rows = factsFor(facet.key, { prof, st, lk }); return (
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
    </Section>
  );
}

// "Food and hangouts and holiday meals land higher here than they do at most centers; holiday services land lower."
function kindSentence(kinds) {
  const up = kinds.filter((k) => k.edge >= EDGE).map((k) => lowerFirst(k.label));
  const down = kinds.filter((k) => k.edge <= -EDGE).sort((a, b) => a.edge - b.edge).map((k) => lowerFirst(k.label));
  if (up.length && down.length) return `${cap(listWords(up))} land higher here than they do at most centers; ${listWords(down)} land lower.`;
  if (up.length) return `${cap(listWords(up))} land higher here than they do at most centers. No kind of event lands clearly lower.`;
  if (down.length) return `No kind of event lands clearly higher here than at most centers; ${listWords(down)} land lower.`;
  return 'Every kind of event lands about where it does at most centers.';
}

// One bar per kind of event: where that kind lands among this center's own events (0 is its smallest, 100 its
// biggest). The grey tick is where the same kind lands at the average center.
function KindBars({ kinds }) {
  const cols = 'grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-1';
  return (
    <div className="z-card">
      <ul className="space-y-3.5" aria-label="Where each kind of event lands among this center's events">
        {kinds.map((k) => { const hi = k.edge >= EDGE; return (
          <li key={k.key} className={`${cols} items-center`} tabIndex={0} {...tip([k.label, `Here: bigger than ${pct(k.pct)} of this center's events`, `At the average center: bigger than ${pct(k.network)}`, plural(k.n, 'scored event')])}>
            <span className="min-w-0 flex sm:block items-baseline justify-between gap-3"><span className="font-semibold block truncate" style={{ fontSize: '0.95rem' }}>{k.label}</span><span className="z-small z-muted block whitespace-nowrap">{plural(k.n, 'scored event')}</span></span>
            <span className="relative block" style={{ height: 26 }}>
              <span className="absolute left-0 right-0" style={{ top: 6, height: 14, background: '#fff', borderRadius: '0 4px 4px 0' }} />
              <span className="absolute left-0" style={{ top: 6, height: 14, width: `${Math.max(1, k.pct * 100)}%`, background: hi ? 'var(--go)' : 'var(--ink)', borderRadius: '0 4px 4px 0' }} />
              <span className="absolute" style={{ top: 0, height: 26, width: 3, left: `calc(${k.network * 100}% - 1.5px)`, background: 'var(--grey)', outline: '1.5px solid var(--fog)', borderRadius: 2 }} />
            </span>
          </li>); })}
        <li className={cols} aria-hidden="true">
          <span className="hidden sm:block" />
          <span className="grid grid-cols-3 z-small z-muted" style={{ fontSize: '0.76rem' }}><span>Its smallest events</span><span className="text-center">Middle</span><span className="text-right">Its biggest</span></span>
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 z-small z-muted">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 22, height: 10, background: 'var(--ink)', borderRadius: '0 3px 3px 0' }} />Where it lands here</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 3, height: 16, background: 'var(--grey)', borderRadius: 2 }} />Where it lands at the average center</span>
        {kinds.some((k) => k.edge >= EDGE) && <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 22, height: 10, background: 'var(--go)', borderRadius: '0 3px 3px 0' }} />Clearly higher here (5 points or more)</span>}
      </div>
    </div>
  );
}

function DoesWell({ prof, cat, isMine }) {
  const kinds = prof.kinds || [];
  const best = (prof.best || []).map((b) => ({ ...b, p: cat.prog(b.pid) })).filter((b) => b.p);
  return (
    <Section id="well-h" title={isMine ? 'What does well at your center' : 'What does well here'} sub={kinds.length ? 'Every event with sign-ups is placed among all of this center\'s own events, smallest to biggest. A bar shows where one kind of event usually lands. A kind with few events is pulled toward the network\'s level, so it cannot swing far on little data.' : null}>
      {kinds.length ? (
        <>
          <p className="z-display mb-6 max-w-[40ch]" style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.6rem)', lineHeight: 1.2 }}>{kindSentence(kinds)}</p>
          <KindBars kinds={kinds} />
        </>
      ) : <Empty>There are not enough scored events here yet to say which kinds do well. A kind of event needs three scored events before it is shown.</Empty>}
      {best.length > 0 && (
        <div className="mt-10">
          <h3 className="z-h3">Its own best programs</h3>
          <p className="z-muted mt-2 max-w-[64ch]" style={{ lineHeight: 1.45 }}>The programs that landed highest among this center's own events.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-10">
            {best.map(({ p, pct: pc, regs, runs }) => (
              <Link key={p.i} to={`/program/${p.key}`} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-4 items-center py-3.5 group" style={{ borderTop: '1px solid var(--fog-2)' }}>
                <Flyer src={p.img} alt="" style={{ borderRadius: 10, aspectRatio: '1 / 1' }} />
                <div className="min-w-0">
                  <p className="font-bold truncate group-hover:underline decoration-2 underline-offset-2">{p.name}</p>
                  <p className="z-small z-muted truncate">{p.typeLabel}{regs != null ? `. ${plural(Math.round(regs), 'sign-up')}${runs > 1 ? ` typical over ${runs} runs` : ''}` : ''}</p>
                </div>
                <span className="z-small font-bold text-right whitespace-nowrap">{cap(landed(pc, 'its events').replace(' of its events', ''))}<span className="z-muted font-normal block">of its events</span></span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function Nearest({ prof, st, cat, cen, isMine }) {
  const campusOnly = prof.basis === 'campus';
  // A center with too few events is matched on whatever is known. Usually that is the Jewish student count alone.
  const extra = [st.top5 != null ? 'biggest events' : null, st.pace != null ? 'events a week' : null].filter(Boolean);
  const sub = campusOnly
    ? `This center has too few events to read (${(st.n || 0) >= cen.min_events ? `${plural(st.n, 'event')} on record, but fewer than ${cen.min_events} in the last three years` : `${plural(st.n || 0, 'event')} on record, ${cen.min_events} needed`}), so it is matched ${extra.length ? `mostly on Jewish student numbers, with an early read of its ${listWords(extra)} from the few events it has` : 'on Jewish student numbers alone'}. Take the list as a rough guide.`
    : 'The twelve centers closest to this one. Likeness is worked out from four measures with equal weight: biggest events, events a week, Jewish students served, and which kinds of event do well. Type of school is not used.';
  return (
    <Section id="near-h" title={isMine ? 'The centers nearest yours' : 'Nearest centers'} sub={sub}>
      <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10">
        {prof.near.map((p, i) => { const c = cat.centerById.get(p.id); if (!c) return null; const s = cen.stats[p.id] || {}; return (
          <li key={p.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
            <Link to={`/center/${p.id}`} className="block py-4 group" {...tip([title(c), c.name, `${Math.round(p.sim * 100)}% alike, where 100% would be the same on every measure`])}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold truncate group-hover:underline decoration-2 underline-offset-2"><span className="z-muted font-semibold tabular-nums">{i + 1}. </span>{title(c)}</span>
                <span className="z-small font-semibold tabular-nums whitespace-nowrap">{Math.round(p.sim * 100)}% alike</span>
              </div>
              <p className="z-small z-muted mt-0.5 truncate">{s.top5 != null ? `Biggest events ${num(s.top5)} sign-ups` : 'Biggest events not known'}, {s.pace != null ? `${one(s.pace)} events a week` : 'pace not known'}</p>
              <div className="mt-2.5"><Meter value={p.sim} max={1} height={6} /></div>
              <p className="mt-2.5 flex flex-wrap gap-1.5">
                {p.why.length ? p.why.map((k) => <span key={k} className="z-pill" style={{ height: '1.5rem', padding: '0 0.6rem', fontSize: '0.76rem', fontWeight: 600 }}>{REASON[k] || k}</span>) : <span className="z-small z-muted">Fairly close on everything, very close on nothing</span>}
              </p>
            </Link>
          </li>); })}
      </ol>
      <p className="z-small z-muted mt-4 max-w-[70ch]" style={{ lineHeight: 1.5 }}>
        A label names a measure on which the two centers are within half a standard deviation of each other. {campusOnly ? 'With so little known about this center, the likeness numbers run lower than they do for a center with a full calendar.' : 'The picture on the Centers page shows the same likeness as distance.'} <Link to="/centers" className="z-link">See every center</Link>.
      </p>
    </Section>
  );
}

const signUps = (n) => `${num(n)} ${Math.round(n) === 1 ? 'sign-up' : 'sign-ups'}`;
// "Likely 9 to 19 sign-ups". The range is the middle half of what the similar events did. No single number.
function rangeText(x) {
  if (x.lo != null && x.hi != null) {
    const lo = Math.round(x.lo), hi = Math.round(x.hi);
    if (lo === hi) return `Likely about ${signUps(lo)}`;
    return `Likely ${num(lo)} to ${signUps(hi)}${hi >= 3 * Math.max(1, lo) && hi - lo >= 15 ? ', a wide range' : ''}`;
  }
  return x.expect != null ? `Likely about ${signUps(x.expect)}` : null;
}

function NewPick({ x, idea, cat, nNear, whose }) {
  const img = (idea.flyers || []).map((pid) => cat.prog(pid)?.img).find(Boolean);
  const range = rangeText(x);
  const evidence = x.near > 0
    ? `${x.near} of ${whose} ${nNear} nearest centers ran it${x.near_pct != null ? `, and it landed ${placeIn(x.near_pct, x.near === 1 ? 'that center\'s events' : 'their events')}` : ', with no sign-ups to measure'}.`
    : `None of ${whose} ${nNear} nearest centers has run it. The estimate rests on similar events elsewhere.`;
  return (
    <Link to={`/idea/${x.idea}`} className="z-card grid grid-cols-[84px_minmax(0,1fr)] gap-4 items-start group" style={{ padding: '1.1rem' }}>
      <Flyer src={img} alt="" style={{ borderRadius: 12 }} />
      <div className="min-w-0">
        <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ fontSize: '1.08rem', lineHeight: 1.2 }}>{idea.label}</p>
        <p className="mt-2 flex items-baseline gap-2" style={{ lineHeight: 1.3 }}><span className="relative" style={{ top: -1 }}><Dot color="var(--go)" /></span><span><span className="font-bold">{cap(place(x.pct))}</span> of {whose} events</span></p>
        {range && <p className="font-semibold mt-1" style={{ lineHeight: 1.3 }}>{range}</p>}
        <p className="z-small z-muted mt-2" style={{ lineHeight: 1.4 }}>{evidence}{x.eff != null ? ` About ${plural(Math.round(x.eff), 'past program')} carry the estimate.` : ''}</p>
      </div>
    </Link>
  );
}

// The main action of the page: what the nearest-neighbor system expects to land high at this center.
function Picks({ prof, st, cat, ideas, isMine, test }) {
  const [all, setAll] = useState(false);
  const fresh = (prof.picks?.new || []).filter((x) => ideas[x.idea]);
  const again = (prof.picks?.again || []).filter((x) => ideas[x.idea]);
  const whose = isMine ? 'your' : 'its', nNear = prof.near.length;
  const heading = isMine ? 'Should do well at your center' : 'Should do well here';
  if (prof.basis === 'none') return (
    <Section id="picks-h" title={heading}><Empty>There is nothing to estimate from yet. This center has no Jewish student count in the directory and too few events in the last three years, so it cannot be matched to other centers.</Empty></Section>
  );
  const shown = all ? fresh : fresh.slice(0, 9);
  const noNumbers = st.spread == null;
  return (
    <Section id="picks-h" title={heading}>
      <div className="max-w-[70ch] space-y-3 -mt-2" style={{ lineHeight: 1.55 }}>
        <p>These are estimates. For each idea, the engine takes the past events most like it at the centers most like this one, adds this center's own history, and works out where the idea should land among {isMine ? 'your' : 'this center\'s'} events.</p>
        <p>The ranking is the reliable part, and the sign-up numbers are rough.{test ? ` Replayed on a year it had not seen, the top fifth of its predictions landed in their center's top third of events ${pct(test.top_fifth_in_top_third)} of the time, and the bottom fifth ${pct(test.bottom_fifth_in_top_third)}. The sign-up range held the real number about ${pct(test.range_covers)} of the time.` : ''} <Link to="/engine#nn-h" className="z-link">How it was tested</Link>.</p>
        {noNumbers && <p className="z-muted">This center has too few events with sign-ups to turn a place into a number, so only the place is given.</p>}
      </div>

      <h3 className="z-h3 mt-10">New for this center</h3>
      <p className="z-muted mt-2 max-w-[64ch]" style={{ lineHeight: 1.45 }}>Ideas with no match on this center's calendar that should land in the upper part of its events, best first.</p>
      {fresh.length ? (
        <>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map((x) => <NewPick key={x.idea} x={x} idea={ideas[x.idea]} cat={cat} nNear={nNear} whose={whose} />)}
          </div>
          {!all && fresh.length > shown.length && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setAll(true)}>Show {fresh.length - shown.length} more</button>}
          <p className="z-small z-muted mt-5 max-w-[70ch]" style={{ lineHeight: 1.5 }}>Ideas are matched to this center's calendar by name and meaning, and the match is not perfect. If the center runs the same thing under a very different name, it can still show up here as new.</p>
        </>
      ) : <div className="mt-5"><Empty>No idea this center has not run is expected to land clearly above the middle of its events.</Empty></div>}

      <h3 className="z-h3 mt-12">Worth running again</h3>
      <p className="z-muted mt-2 max-w-[64ch]" style={{ lineHeight: 1.45 }}>Ideas this center has run, or runs something very close to, in the order they are expected to land.</p>
      {again.length ? (
        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {again.map((x) => { const range = rangeText(x), m = x.mine; return (
            <li key={x.idea} style={{ borderTop: '1px solid var(--fog-2)' }}>
              <Link to={`/idea/${x.idea}`} className="block py-3.5 group">
                <p className="font-bold truncate group-hover:underline decoration-2 underline-offset-2">{ideas[x.idea].label}</p>
                <p className="mt-0.5" style={{ lineHeight: 1.35 }}><span className="font-semibold">{cap(place(x.pct))}</span> of its events{range ? `. ${range}` : ''}</p>
                <p className="z-small z-muted mt-0.5" style={{ lineHeight: 1.35 }}>
                  {m ? `${m.runs > 1 ? `Its ${m.runs} runs here` : 'Last time here'}: ${m.regs != null ? `${signUps(m.regs)}${m.runs > 1 ? ' typical' : ''}, ` : ''}${landed(m.pct, 'its events')}` : 'Runs something close to this. No measured run under this exact idea.'}
                </p>
              </Link>
            </li>); })}
        </ul>
      ) : <div className="mt-5"><Empty>Nothing this center has run matches an idea shared by three or more centers yet.</Empty></div>}
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
  const { data, error } = useData('centers.json', 'ideas.json', 'catalog', 'engine.json');
  const [mine, setMine] = useMyCenter();
  const progs = useMemo(() => { if (!data) return []; const cat = data[2], c = cat.centerById.get(Number(id)); return c ? cat.programsOfCenter(c.idx).map((i) => cat.prog(i)) : []; }, [data, id]);
  if (error) return <ErrorNote error={error} what="This center" />;
  if (!data) return <Loading rows={3} h={200} />;
  const [cen, ideas, cat, eng] = data;
  const c = cat.centerById.get(Number(id));
  if (!c) return (
    <div className="pt-10 sm:pt-16">
      <h1 className="z-h1">Center not found</h1>
      <div className="mt-8"><Empty>There is no center with the id "{id}". <Link to="/centers" className="z-link">See every center</Link>.</Empty></div>
    </div>
  );
  const st = cen.stats[c.id] || {}, prof = cen.profiles[c.id] || null;
  const lk = lookups(cen.facets);
  const thin = prof && prof.basis !== 'all';
  const isMine = mine === c.id;
  const types = Object.entries(st.types || {}).sort((a, b) => b[1] - a[1]);
  const traj = st.traj || [];
  const now = new Date(), curAy = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const partial = (t) => Number(t.ay.slice(0, 4)) === curAy;
  const nEvents = st.n || 0;
  const camp = st.campuses || [];
  const few = 'fewer than five events took sign-ups';
  const snapshot = [
    [st.typical != null ? num(st.typical) : 'n/a', 'sign-ups at a typical event', st.typical != null ? 'the median event that took sign-ups, last two years' : few],
    [st.top5 != null ? num(st.top5) : 'n/a', 'sign-ups at its biggest events', st.top5 != null ? `average of its five biggest in three years${st.biggest ? `, the largest drew ${num(st.biggest)}` : ''}` : few],
    [st.pace != null ? one(st.pace) : 'n/a', 'events a week', st.pace != null ? 'while in session, over the last twelve months' : 'fewer than 8 events in the last twelve months'],
    [st.jewish != null ? num(st.jewish) : 'n/a', 'Jewish students served', st.jewish != null ? (camp.length > 1 ? (camp.length <= 3 ? `across ${listWords(camp)}` : `across ${camp.length} campuses`) : 'the center\'s own estimate') : 'not listed in the directory'],
    [st.draw_share != null ? sharePct(st.draw_share) : 'n/a', 'of them at its biggest events', st.draw_share != null ? 'biggest events over Jewish students served' : st.jewish == null ? 'needs a Jewish student count' : few],
    [st.rsvp_share != null ? share(st.rsvp_share) : 'n/a', 'of events took sign-ups', st.reliable ? 'enough to score its events' : 'too few to score its events well'],
    [nEvents.toLocaleString(), nEvents === 1 ? 'event on record' : 'events on record', st.first ? `since ${month(st.first)}${st.upcoming ? `, ${st.upcoming} more posted` : ''}` : null],
  ];
  return (
    <div>
      <div className="pt-10 sm:pt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-center">
        <div className="min-w-0">
          <p className="z-small"><Link to="/centers" className="z-link">All centers</Link></p>
          <div className="mt-5 flex items-center gap-4">
            <Logo src={cat.img(c.logo)} />
            <p className="font-semibold min-w-0" style={{ lineHeight: 1.3 }}>{c.campus}{where(c) && <span className="z-muted block">{where(c)}</span>}</p>
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

      <Section id="snap-h" title="At a glance" tight sub={thin ? `${nEvents >= cen.min_events ? `This center has ${plural(nEvents, 'event')} on record, but fewer than ${cen.min_events} of them are from the last three years, and those are the ones the engine reads.` : `This center has ${plural(nEvents, 'event')} on the system, fewer than the ${cen.min_events} needed to read what it does.`} What is known is shown, and the rest says why it is missing.` : null}>
        <div className="z-card grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          {snapshot.map(([v, l, s]) => <Stat key={l} value={v} label={l} sub={s} />)}
        </div>
        {prof && !thin && !st.reliable && <p className="z-note mt-4" style={{ background: 'var(--fog)' }}>This center takes sign-ups for only {share(st.rsvp_share || 0)} of its events, so every sign-up number on this page rests on a small part of what it runs.</p>}
        {(prof?.picks?.new || []).length > 0 && <p className="mt-5"><a href="#picks-h" className="z-btn z-btn-soft z-btn-sm">What should do well here<ArrowRight size={16} aria-hidden="true" /></a></p>}
      </Section>

      {prof && <Kind cen={cen} prof={prof} st={st} lk={lk} />}
      {prof && <DoesWell prof={prof} cat={cat} isMine={isMine} />}
      {prof && (prof.near?.length > 0
        ? <Nearest prof={prof} st={st} cat={cat} cen={cen} isMine={isMine} />
        : <Section id="near-h" title="Nearest centers"><Empty>There is nothing to match on yet. This center has no Jewish student count in the directory and too few events in the last three years to compare it with other centers.</Empty></Section>)}
      {prof && <Picks prof={prof} st={st} cat={cat} ideas={ideas} isMine={isMine} test={eng?.predictor?.test?.full} />}

      <Section id="runs-h" title={isMine ? 'What your center runs' : 'What this center runs'} sub={progs.length ? `${plural(progs.length, 'program')}, most recent first. The number under a flyer is how it did against this center's own normal for that kind of event.` : null}>
        {progs.length ? <Programs progs={progs} cat={cat} /> : <Empty>No programs on record for this center.</Empty>}
      </Section>

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
                <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45 }}>{traj.some(partial) ? 'The lighter bar is the school year in progress. ' : ''}{st.per_year != null ? `${num(st.per_year)} events in the last twelve months.` : ''}</p>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
