import { Link } from 'react-router-dom';
import { useData, plural, share, liftShort, liftPct, centerLabel } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Lift, HBars, Flyer, ProgramCard, FlyerGrid, Finding, tip } from '../components/bits';

const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const low = (s) => (/^(Greek|Israeli)/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
// The app says "center" everywhere, so engine labels that say "Chabad house" are reworded for display.
const say = (s) => s.replace(/Chabad houses/g, 'centers').replace(/Chabad house/g, 'center');
// One group of events against another at the same centers. 1.31 reads as "31% higher".
const gapWords = (r) => { if (r == null) return 'not enough data to compare'; const p = liftPct(r); return Math.abs(p) < 4 ? 'about the same' : `${Math.abs(p)}% ${p > 0 ? 'higher' : 'lower'}`; };
const sample = (n) => (n < 30 ? ' That is a small sample.' : '');
// Example programs: the best performers first (one per center), flyers only.
const examples = (x, cat, n) => { const seen = new Set(); return [...x.top, ...x.flyers].filter((pid) => !seen.has(pid) && seen.add(pid)).map((pid) => cat.prog(pid)).filter((p) => p && p.img).slice(0, n); };

function Names({ x, ideas, n = 5, onFog = true }) {
  const rows = x.ideas.filter((i) => ideas[i.idea]).slice(0, n);
  if (!rows.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((i) => <Link key={i.idea} to={`/idea/${i.idea}`} className="z-pill hover:opacity-80" style={{ background: onFog ? '#fff' : 'var(--fog)', maxWidth: '100%' }} title={`${plural(i.centers, 'program')} under this name`}><span className="truncate">{ideas[i.idea].label}</span><span style={{ opacity: 0.55 }}>{i.centers}</span></Link>)}
    </div>
  );
}

function LiftLine({ x }) {
  if (x.lift == null) return <p className="z-muted" style={{ lineHeight: 1.45 }}>Not enough sign-up data to say how these do. Only {plural(x.scored, 'event')} could be scored, and a lift needs at least 10.</p>;
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-5">
      <Lift value={x.lift} size="lg" />
      <p className="z-small z-muted min-w-0" style={{ lineHeight: 1.4 }}>against each center's own normal, from {plural(x.scored, 'scored event')}.{x.hit != null ? ` ${share(x.hit)} of them beat normal by a fifth or more.` : ''}{sample(x.scored)}</p>
    </div>
  );
}

function AudienceCard({ x, cat, ideas }) {
  const ex = examples(x, cat, 4);
  return (
    <article className="z-card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="z-h3">{say(x.label)}</h3>
        <span className="z-pill" style={{ background: '#fff' }}>{plural(x.centers, 'center')}</span>
      </div>
      <p className="z-muted mt-2" style={{ lineHeight: 1.45 }}>{plural(x.programs, 'program')}, run {x.n.toLocaleString()} times in all.{x.med_regs != null ? ` A typical one draws ${Math.round(x.med_regs)} sign-ups.` : ''}</p>
      <div className="mt-5"><LiftLine x={x} /></div>
      {x.ideas.length > 0 && <div className="mt-6"><p className="font-semibold z-small mb-2">Most common names</p><Names x={x} ideas={ideas} /></div>}
      {ex.length > 0 && (
        <div className="mt-7 pt-6" style={{ borderTop: '1px solid var(--fog-2)' }}>
          <p className="font-semibold z-small mb-3">Ones that did well</p>
          <FlyerGrid cols="grid-cols-2 sm:grid-cols-4">{ex.map((p) => <ProgramCard key={p.i} p={p} />)}</FlyerGrid>
        </div>
      )}
    </article>
  );
}

function PartnerRow({ x, cat, ideas }) {
  const ex = examples(x, cat, 3);
  return (
    <li className="py-5 grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto_7rem] gap-x-6 gap-y-3 items-center" style={{ borderTop: '1px solid var(--fog-2)' }}>
      <div className="min-w-0">
        <h3 className="font-bold" style={{ fontSize: '1.08rem' }}>{say(x.label)}</h3>
        <p className="z-small z-muted mt-0.5">{plural(x.n, 'event')} at {plural(x.centers, 'center')}</p>
      </div>
      <div className="min-w-0 col-span-2 lg:col-span-1 order-3 lg:order-none"><Names x={x} ideas={ideas} n={4} onFog={false} /></div>
      <div className="hidden lg:flex gap-1.5">
        {ex.map((p) => <Link key={p.i} to={`/program/${p.key}`} aria-label={`${p.name}, ${centerLabel(p.center)}`} {...tip([p.name, centerLabel(p.center), p.adj != null ? `${liftShort(p.adj)} against its own normal` : 'No sign-up data'])} style={{ width: 52 }}><Flyer src={p.img} alt="" style={{ borderRadius: 8, aspectRatio: '1 / 1' }} /></Link>)}
      </div>
      <div className="text-right order-2 lg:order-none">
        {x.lift != null ? <><Lift value={x.lift} /><p className="z-small z-muted">{x.scored} scored</p></> : <p className="z-small z-muted" style={{ maxWidth: '7rem', lineHeight: 1.3 }}>Not enough data ({x.scored} scored)</p>}
      </div>
    </li>
  );
}

export default function Niches() {
  const { data, error } = useData('niches.json', 'ideas.json', 'catalog');
  if (error) return <ErrorNote error={error} what="Niches and collabs" />;
  if (!data) return <Loading rows={3} h={220} />;
  const [nx, ideas, cat] = data;
  const aud = nx.audiences, col = nx.collab, off = nx.offsite, one = nx.one_time;
  const up = aud.filter((a) => a.lift != null && a.lift >= 1.1), down = aud.filter((a) => a.lift != null && a.lift <= 0.9);
  const total = one.n + one.recurring_n;
  const ranked = nx.partners.filter((p) => p.lift != null && p.scored >= 30).sort((a, b) => b.lift - a.lift);
  const topPartner = ranked[0] && ranked[0].lift >= 1.1 ? ranked[0] : null;
  const colEx = examples(col, cat, 6), offEx = examples(off, cat, 6);
  const typeRows = (x) => x.types.map((t) => ({ key: t.type, label: cat.types[t.type] || t.type, value: t.n, tip: [cat.types[t.type] || t.type, plural(t.n, 'event'), `${share(t.n / x.n)} of these events`] }));
  return (
    <div>
      <PageHead title="Niches and collabs" lede="Who an event is for, who it is run with, and where it is held. Each group of events is read the same way as everything else in the app: against the same center's normal for that kind of event." />

      <Section id="aud-h" title="Events for one crowd"
        sub={<>{up.length > 0 && <>Events for {list(up.map((a) => low(a.label)))} beat their centers' normal. </>}{down.length > 0 && <>Events for {list(down.map((a) => low(a.label)))} come in below it. </>}Below normal is expected here: an event for one crowd has fewer people to draw from than an open event of the same kind. An event is counted for a crowd when its name says so.</>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {aud.map((a) => <AudienceCard key={a.key} x={a} cat={cat} ideas={ideas} />)}
        </div>
      </Section>

      <Section id="col-h" title="Events run with another group"
        sub={col.paired.ratio != null
          ? `Sharing an event pays. At the ${col.paired.centers} centers with enough of both, events run with another group score ${gapWords(col.paired.ratio)} than the same center's other events.${topPartner ? ` ${topPartner.label} is the partner with the strongest record.` : ''}`
          : 'There are too few centers with both kinds of event to compare collabs with the rest.'}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Finding go title="Collabs against the center's other events" value={col.paired.ratio != null ? liftShort(col.paired.ratio) : 'n/a'}>
            {col.paired.ratio != null ? `Measured inside ${plural(col.paired.centers, 'center')} that each have at least 3 scored collabs and 10 other scored events.` : 'Fewer than 5 centers have enough of both.'}
          </Finding>
          <Finding title="Collabs against normal for their kind" value={col.lift != null ? liftShort(col.lift) : 'n/a'}>
            {plural(col.scored, 'scored event')}. {col.hit != null ? `${share(col.hit)} of them beat normal by a fifth or more.` : ''}
          </Finding>
          <Finding title="Events that name a partner" value={col.n.toLocaleString()}>
            {plural(col.programs, 'program')} at {plural(col.centers, 'center')}. A typical one draws {Math.round(col.med_regs)} sign-ups.
          </Finding>
        </div>
        <p className="z-small z-muted mt-4 max-w-[72ch]" style={{ lineHeight: 1.5 }}>An event counts as a collab when its name or description says so (co-hosted, sponsored by, with Hillel and so on). Collabs nobody wrote down are not counted, so the real number is higher.</p>

        <h3 className="z-h3 mt-14">Who they run them with</h3>
        <p className="z-muted mt-2 max-w-[64ch]" style={{ lineHeight: 1.45 }}>Partners named in event names and descriptions, by how many centers name them. Sinai Scholars and Birthright are programs that centers run, not campus groups, and are listed because events name them the same way.</p>
        <ul className="mt-5">{nx.partners.map((p) => <PartnerRow key={p.key} x={p} cat={cat} ideas={ideas} />)}</ul>

        {colEx.length > 0 && (
          <div className="mt-12">
            <h3 className="z-h3 mb-5">Collabs that did well</h3>
            <FlyerGrid>{colEx.map((p) => <ProgramCard key={p.i} p={p} />)}</FlyerGrid>
          </div>
        )}
      </Section>

      <Section id="off-h" title="Events away from the center"
        sub={`Where an event is held makes little difference to sign-ups. ${share(off.n / total)} of all events are held somewhere else, and they score ${off.paired.ratio != null ? gapWords(off.paired.ratio) : 'about the same'}${off.paired.ratio != null && Math.abs(liftPct(off.paired.ratio)) >= 4 ? ' than' : ' as'} the same center's events at home.`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Finding title="Off-site against the center's events at home" value={off.paired.ratio != null ? liftShort(off.paired.ratio) : 'n/a'}>
            {off.paired.ratio != null ? `Measured inside ${plural(off.paired.centers, 'center')} that have enough scored events of both kinds.` : 'Too few centers have enough of both.'}
          </Finding>
          <Finding title="Off-site against normal for their kind" value={off.lift != null ? liftShort(off.lift) : 'n/a'}>
            {plural(off.scored, 'scored event')}. {off.hit != null ? `${share(off.hit)} beat normal by a fifth or more.` : ''} The two readings point opposite ways and both are small, so call it even.
          </Finding>
          <Finding title="Events held off-site" value={off.n.toLocaleString()}>
            Out of {total.toLocaleString()} events, at {plural(off.centers, 'center')}. A typical one draws {Math.round(off.med_regs)} sign-ups.
          </Finding>
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="z-card">
            <h3 className="font-bold">Where they are held</h3>
            <p className="z-small z-muted mt-1.5 mb-5" style={{ lineHeight: 1.45 }}>Counted from words in the place name a center typed in, so this is a rough tally and most events have no match.</p>
            <HBars rows={off.places.slice(0, 10).map((p) => ({ key: p.place, label: p.place[0].toUpperCase() + p.place.slice(1), value: p.n, tip: [`Place names with "${p.place}"`, plural(p.n, 'event')] }))} format={(v) => v.toLocaleString()} />
          </div>
          <div className="z-card">
            <h3 className="font-bold">What gets taken off-site</h3>
            <p className="z-small z-muted mt-1.5 mb-5" style={{ lineHeight: 1.45 }}>The five most common kinds of off-site event.</p>
            <HBars rows={typeRows(off)} format={(v) => v.toLocaleString()} />
          </div>
        </div>
        {offEx.length > 0 && (
          <div className="mt-12">
            <h3 className="z-h3 mb-5">Off-site events that did well</h3>
            <FlyerGrid>{offEx.map((p) => <ProgramCard key={p.i} p={p} />)}</FlyerGrid>
          </div>
        )}
      </Section>

      {one.paired.ratio != null && (
        <Section id="one-h" title="One-time events against recurring ones"
          sub={`One-time events score ${gapWords(one.paired.ratio)} than recurring ones at the same center. Part of that is built in: a weekly class or a standing lunch settles to its regulars, and a one-time event is often the bigger occasion.`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Finding title="One-time against recurring, same center" value={liftShort(one.paired.ratio)}>Measured inside {plural(one.paired.centers, 'center')} that have enough scored events of both kinds.</Finding>
            <Finding title="One-time events" value={one.n.toLocaleString()}>{share(one.n / total)} of all events were set up to happen once.</Finding>
            <Finding title="Recurring events" value={one.recurring_n.toLocaleString()}>{share(one.recurring_n / total)} came from a repeating schedule, such as a weekly dinner or class.</Finding>
          </div>
        </Section>
      )}
    </div>
  );
}
