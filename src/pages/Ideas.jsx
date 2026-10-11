// The Idea lab. Type an event idea; the browser compares it with every program in the network (search.js) and
// runs the engine's neighbor system on the result: where would this land among a center's own events, judged from
// similar events at similar centers. The rest of the page reads the same neighbors: when they ran, how they were
// packaged, what they were called. Nothing here replaces the engine's own analysis.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { useData, useMyCenter, load, plural, centerLabel, liftWords, fmtDate, hourLabel, DAYS, MONTHS, CONF } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Empty, Flyer, Lift, StatusPill, Seg, ProgramCard, FlyerGrid, Columns, CenterLink, More } from '../components/bits';
import { searchIndex, embed, scoreAll, wordingMatch, blend, strength, predict, signUps, signUpRange, place, placeOf, expectWords, CLOSE, RELATED, MATCH } from '../lib/search';
import { PickCenter } from './Home';

// What a cosine means for a typed idea against a program (search.js): an exact name scores 0.9 and up, a close
// match 0.60 or more, a related program 0.45 or more, and nonsense tops out near 0.33.
// An estimate needs evidence: at least MIN_CLOSE close matches or MIN_RELATED related programs, and MIN_VOTERS of
// them with sign-ups that place them among their own center's events.
const MIN_CLOSE = 3, MIN_RELATED = 6, MIN_VOTERS = 3;
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EXAMPLES = ['sushi in the sukkah', 'pickleball tournament', 'challah bake for sororities', 'mental health panel', 'welcome back bbq'];
const RECENT_DAYS = 60;
const JUNK = /^\s*(test|testing|tbd|untitled)\s*$/i;
const clampLog = (pct) => Math.max(-1.5, Math.min(1.5, Math.log(pct / 100)));
const gm = (logs, prior = 4) => (logs.length ? Math.exp(logs.reduce((s, x) => s + x, 0) / (logs.length + prior)) : null);
const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s&+]/gu, ' ').replace(/\s+/g, ' ').trim();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const cap = (s) => s.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
// "Around Sukkot" reads as "around Sukkot" mid-sentence; month ranges keep their capitals.
const whenText = (w) => (/^(Around|Any|First|Last|During)\b/.test(w || '') ? w[0].toLowerCase() + w.slice(1) : w || '');

// ---------------------------------------------------------------- the search
let indexLoaded = false;
async function runSearch(q) {
  const vecP = embed(q).then((v) => ({ v }), (embedError) => ({ embedError }));
  const [ix, text, timing, themes, engine, ideas, centers] = await Promise.all([searchIndex(), load('text.json'), load('timing.json'), load('themes.json'), load('engine.json'), load('ideas.json'), load('centers.json')]);
  indexLoaded = true;
  const { v, embedError } = await vecP;
  const words = wordingMatch(ix, q), sims = v ? scoreAll(ix, v) : null;
  const P = ix.cat.programs, cos = new Float32Array(ix.n), score = new Float32Array(ix.n), order = [];
  for (let i = 0; i < ix.n; i++) {
    if (JUNK.test(P.name[i])) continue;
    // cos is what the tiers and the estimate read: the plain cosine. score orders the lists: the cosine blended
    // with the wording match. Without the embedding (the service failed) both come from the wording alone, where
    // the same name is a close match and half of the wording is related.
    cos[i] = sims ? strength(sims[i], words[i]) : words[i] > 0 ? 0.25 + 0.4 * words[i] : 0;
    score[i] = sims ? blend(sims[i], words[i]) : cos[i];
    if (score[i] >= 0.2) order.push(i);
  }
  order.sort((a, b) => score[b] - score[a] || P.nl[b] - P.nl[a] || P.n[b] - P.n[a]);
  return { q, ix, cat: ix.cat, cos, score, order, semantic: !!sims, text, timing, themes, engine, ideas, centers, embedError: embedError || null };
}

function useLab(q) {
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    if (!q) { setState({ status: 'idle' }); return undefined; }
    let live = true;
    setState({ status: 'loading', first: !indexLoaded });
    runSearch(q).then((res) => { if (live) setState({ status: 'done', res }); }).catch((error) => { if (live) setState({ status: 'error', error }); });
    return () => { live = false; };
  }, [q]);
  return state;
}

// Everything the result dashboard shows, from the ranked neighbors.
function analyze(res, month, mine) {
  const { cat, cos, score, order, text, timing, themes, ideas, centers } = res, P = cat.programs;
  // matches: related by meaning, or carried by the wording. related and close are read from the cosine alone.
  const matches = order.filter((i) => cos[i] >= RELATED || score[i] >= MATCH);
  const related = matches.filter((i) => cos[i] >= RELATED), close = related.filter((i) => cos[i] >= CLOSE);
  const closeCenters = new Set(close.map((i) => P.c[i]));

  // the neighbor system (engine/neighbors.py, run in search.js on the plain cosines)
  const me = mine != null ? cat.centerById.get(mine) : null, prof = me ? centers.profiles[me.id] : null, st = me ? centers.stats[me.id] : null;
  const gated = close.length < MIN_CLOSE && related.length < MIN_RELATED;
  const est = res.semantic && !gated ? predict(res.ix, centers, cos, me ? me.id : null) : null;
  const kind = gated ? 'new' : !res.semantic ? 'words' : !est || est.pct == null || est.n < MIN_VOTERS ? 'unmeasured' : 'est';
  // the evidence around it: close matches at this center's nearest centers, and at the center itself
  const nearIdx = new Map((prof?.near || []).map((x, k) => [cat.centerById.get(x.id)?.idx, k]));
  const nearClose = close.filter((i) => nearIdx.has(P.c[i])).sort((a, b) => nearIdx.get(P.c[a]) - nearIdx.get(P.c[b]) || score[b] - score[a]);
  const byNear = new Map();
  for (const i of nearClose) { const g = byNear.get(P.c[i]); if (g) g.push(i); else byNear.set(P.c[i], [i]); }
  const nearMeans = [...byNear.values()].map((g) => mean(g.filter((i) => P.pc[i] != null).map((i) => P.pc[i] / 100))).filter((x) => x != null);
  const own = me ? matches.filter((i) => P.c[i] === me.idx) : [], ownClose = own.filter((i) => cos[i] >= CLOSE);
  const fit = { me, prof, spread: st?.spread || null, typical: st?.typical ?? null, nearCount: nearIdx.size, nearClose, nearRan: byNear.size, nearMeasured: nearMeans.length, nearPct: mean(nearMeans), own, ownClose };

  // timing, from every dated occurrence of the close matches
  const months = new Array(12).fill(0), mLogs = months.map(() => []), mCenters = months.map(() => new Set()), allLogs = [];
  const wd = new Array(7).fill(0), hr = new Map(), types = new Map(); let events = 0;
  for (const i of close) {
    types.set(P.t[i], (types.get(P.t[i]) || 0) + 1);
    wd[P.wd[i]]++; hr.set(P.hr[i], (hr.get(P.hr[i]) || 0) + 1);
    for (const [d, regs, a] of text.occ[i] || []) {
      if (regs < 0) continue; // posted, not yet held
      const m = cat.date(d).getUTCMonth();
      months[m]++; events++;
      if (a > 0) { const l = clampLog(a); mLogs[m].push(l); mCenters[m].add(P.c[i]); allLogs.push(l); }
    }
  }
  const mi = month - 1, ranked = months.map((n, m) => [n, m]).sort((a, b) => b[0] - a[0]);
  const topMonths = ranked.filter(([n], k) => n > 0 && (k === 0 || (k === 1 && n >= 0.5 * ranked[0][0]))).map(([, m]) => m);
  const typeKey = types.size ? cat.type_keys[[...types.entries()].sort((a, b) => b[1] - a[1])[0][0]] : null;
  const topWd = wd.indexOf(Math.max(...wd)), topHr = [...hr.entries()].sort((a, b) => b[1] - a[1])[0];
  const when = {
    events, months, topMonths, share: pct(months[mi], events),
    monthLift: mLogs[mi].length >= 10 && mCenters[mi].size >= 4 ? gm(mLogs[mi]) : null, monthScored: mLogs[mi].length, monthCenters: mCenters[mi].size,
    allLift: gm(allLogs), allScored: allLogs.length,
    wd: topWd, wdShare: pct(wd[topWd], close.length), hour: topHr ? topHr[0] : null, hourShare: topHr ? pct(topHr[1], close.length) : 0,
    typeKey, typeShare: typeKey ? pct(Math.max(...types.values()), close.length) : 0, slot: (typeKey && timing.types[typeKey]?.best?.[0]) || null,
  };

  // nearest ideas and Shabbat themes: best match plus half of the second best
  const bag = new Map();
  const add = (key, s) => { const b = bag.get(key) || [0, 0, 0]; if (s > b[0]) { b[1] = b[0]; b[0] = s; } else if (s > b[1]) b[1] = s; b[2]++; bag.set(key, b); };
  for (const i of matches) {
    const th = P.th[i];
    if (th && th.length) add(`t:${th[0]}`, score[i]);
    else if (P.idea[i] >= 0) add(`i:${P.idea[i]}`, score[i]);
  }
  const themeById = new Map(themes.themes.map((t) => [t.id, t]));
  const nearestAll = [...bag.entries()].map(([key, [a, b, n]]) => ({ key, score: a + 0.5 * b, best: a, n })).sort((x, y) => y.score - x.score)
    .map((x) => (x.key[0] === 't' ? { ...x, theme: themeById.get(x.key.slice(2)) } : { ...x, idea: ideas[Number(x.key.slice(2))] }))
    .filter((x) => x.theme || x.idea);
  // The engine sometimes splits one idea into several with the same name. Show the widest, and say so.
  const byLabel = new Map();
  for (const x of nearestAll) { const k = (x.theme ? 't:' : 'i:') + norm((x.theme || x.idea).label); const g = byLabel.get(k); if (g) g.push(x); else byLabel.set(k, [x]); }
  const nearest = [...byLabel.values()].map((g) => ({ ...g.reduce((b, x) => ((x.theme || x.idea).centers > (b.theme || b.idea).centers ? x : b), g[0]), score: g[0].score, twins: g.length - 1 })).slice(0, gated ? 3 : 5);

  // flyers: best matches that have one, at most two per center
  const perCenter = new Map(), flyers = [];
  for (const i of matches) {
    if (!P.img[i]) continue;
    const k = perCenter.get(P.c[i]) || 0; if (k >= 2) continue;
    perCenter.set(P.c[i], k + 1); flyers.push(i);
    if (flyers.length >= 12) break;
  }

  // wording: one real description per center, from the best matches
  const seenC = new Set(), seenT = new Set(), wording = [];
  for (const i of matches.slice(0, 80)) {
    if (seenC.has(P.c[i])) continue;
    const d = (text.desc[i] || '').trim(), s = (text.short[i] || '').trim();
    const t = d.length >= 60 && d.length <= 480 ? d : s.length >= 45 ? s : d.length > 480 ? d.slice(0, 440).replace(/\s+\S*$/, '') + '…' : '';
    if (!t || norm(t) === norm(P.name[i]) || /https?:\/\//.test(t)) continue;
    const sig = norm(t).slice(0, 60); if (seenT.has(sig)) continue;
    seenC.add(P.c[i]); seenT.add(sig); wording.push({ i, t });
    if (wording.length >= 6) break;
  }

  // names among the close matches
  const nm = new Map();
  for (const i of close) { const k = norm(P.name[i]); if (!k) continue; const e = nm.get(k) || { n: 0, shown: new Map() }; e.n++; e.shown.set(P.name[i].trim(), (e.shown.get(P.name[i].trim()) || 0) + 1); nm.set(k, e); }
  const names = [...nm.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((e) => ({ n: e.n, name: [...e.shown.entries()].sort((a, b) => b[1] - a[1] || (a[0] === a[0].toUpperCase()) - (b[0] === b[0].toUpperCase()))[0][0] }));

  return { kind, gated, matches, related, close, closeCenters, est, fit, when, nearest, flyers, wording, names, distinctNames: nm.size };
}

// ---------------------------------------------------------------- result panels
const tier = (res, i) => (res.cos[i] >= CLOSE ? 'close match' : res.cos[i] >= RELATED ? 'related' : res.score[i] >= MATCH ? 'shares the wording' : 'loosely related');

// Where a program landed among its own center's events, with its typical sign-ups under it.
function Landed({ i, P, soft = 'var(--grey)' }) {
  if (P.pc[i] == null) return <span className="z-small whitespace-nowrap" style={{ color: soft }}>{P.n[i] === 0 ? 'Not held yet' : 'No sign-ups taken'}</span>;
  return (
    <span className="text-right whitespace-nowrap">
      <span className="font-bold block" style={{ fontSize: '0.92rem' }}>{cap(place(P.pc[i] / 100))}</span>
      {P.reg[i] != null && <span className="z-small block" style={{ color: soft }}>{plural(Math.round(P.reg[i]), 'sign-up')}</span>}
    </span>
  );
}

function MatchRow({ i, res }) {
  const p = res.cat.prog(i);
  return (
    <li style={{ borderTop: '1px solid var(--fog-2)' }}>
      <Link to={`/program/${p.key}`} className="group grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3">
        <span className="min-w-0">
          <span className="font-bold block truncate group-hover:underline decoration-2 underline-offset-2">{p.name}</span>
          <span className="z-small z-muted block truncate">{centerLabel(p.center).replace(/[,\s]+$/, '')}, {tier(res, i)}{p.n === 0 && p.up > 0 ? ', coming up' : p.n > 1 ? `, run ${p.n} times` : ''}</span>
        </span>
        <Landed i={i} P={res.cat.programs} />
      </Link>
    </li>
  );
}

function Tile({ value, label, sub, soft }) {
  return (
    <div className="min-w-0">
      <div className="z-num" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.7rem)' }}>{value}</div>
      <div className="mt-1.5 font-semibold" style={{ lineHeight: 1.25 }}>{label}</div>
      <div className="z-small mt-0.5" style={{ color: soft }}>{sub}</div>
    </div>
  );
}

function Verdict({ res, A }) {
  const { cat, engine, q } = res, P = cat.programs, t = engine.predictor?.test?.full;
  const { kind, close, related, closeCenters, est, fit } = A, { me } = fit, nc = closeCenters.size, loose = related.length - close.length;
  const blue = kind === 'est' && est.pct >= 0.67;
  const ink = blue ? '#fff' : 'var(--ink)', soft = blue ? 'rgba(255,255,255,0.86)' : 'var(--grey)', rule = blue ? 'rgba(255,255,255,0.25)' : 'var(--fog-2)';
  const link = blue ? { color: '#fff', textDecorationColor: 'rgba(255,255,255,0.5)' } : undefined;
  const wordy = A.matches.length - related.length;
  const head = kind === 'est' ? expectWords(est.pct, !!me)
    : kind === 'new' ? (A.matches.length ? 'Nothing close enough in the network yet' : 'New to the network')
    : kind === 'words' ? 'No estimate without the meaning search'
    : `${plural(nc, 'center')} ${nc === 1 ? 'has' : 'have'} run something like this, but too few took sign-ups to estimate it.`;

  // the range, in sign-ups for a chosen center with a spread, in words otherwise
  const range = kind === 'est' && me && fit.spread ? signUpRange(signUps(fit.spread, est.lo), signUps(fit.spread, est.hi)) : null;
  const spanWords = kind === 'est' ? (place(est.lo) === place(est.hi) ? place(est.lo).replace(/^the /, 'in the ') : `anywhere from ${place(est.lo)} to ${place(est.hi)}`) : '';
  const line = kind === 'est'
    ? (me
      ? (range ? `Likely ${range} at ${centerLabel(me)}${fit.typical != null ? `; your typical event draws ${Math.round(fit.typical)}` : ''}.` : `${centerLabel(me)} has too few events with sign-ups to turn that into a number, so this is a place among your events only. Half of the similar results landed ${spanWords} of a center's events.`)
      : `That is the estimate for a typical center, with every center counted the same. Half of the similar results landed ${spanWords} of their own center's events.`)
    : kind === 'new'
      ? (A.matches.length
        ? `${related.length ? `Only ${plural(related.length, 'program')} of ${cat.count.toLocaleString()} ${related.length === 1 ? 'is' : 'are'} related to "${q}" by meaning` : `None of the ${cat.count.toLocaleString()} programs in the network is related to "${q}" by meaning`}${wordy > 0 ? `, and ${wordy} more share some of its wording` : ''}. That is too little to estimate from, so no estimate is shown.`
        : `None of the ${cat.count.toLocaleString()} programs in the network is close to "${q}", or even loosely related. Either no center has posted it, or it is worded in a way the search does not connect.`)
      : kind === 'words' ? `The estimate is read from how close each program is in meaning, and the service that measures that did not answer. The programs below match on wording only.`
        : `Only ${plural(est?.n || 0, 'related program')} ${est?.n === 1 ? 'has' : 'have'} sign-ups that place ${est?.n === 1 ? 'it' : 'them'} among their own center's events, and an estimate needs at least ${MIN_VOTERS}.`;

  const tiles = me && kind === 'est' && fit.nearCount
    ? [[close.length, close.length === 1 ? 'close match' : 'close matches', 'programs much like it'], [nc, nc === 1 ? 'center' : 'centers', 'ran a close match'], [fit.nearRan, `of your ${fit.nearCount} nearest centers`, 'ran a close match']]
    : [[close.length, close.length === 1 ? 'close match' : 'close matches', 'programs much like it'], [loose, 'related', 'same family, different event'], [nc, nc === 1 ? 'center' : 'centers', 'ran a close match']];
  const mineRun = fit.ownClose[0] != null ? fit.ownClose[0] : null, top = res.order.slice(0, 6);
  const ownNear = mineRun == null ? fit.own.find((i) => res.cos[i] >= RELATED && P.pc[i] != null) ?? null : null;

  return (
    <section aria-labelledby="verdict-h" className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="p-6 sm:p-8" style={{ background: blue ? 'var(--go)' : 'var(--fog)', color: ink, borderRadius: 'var(--r-lg)' }}>
        <h2 id="verdict-h" className="z-h1" style={{ fontSize: 'clamp(1.9rem, 3.8vw, 2.9rem)' }}>{head}</h2>
        <p className="mt-4 max-w-[58ch]" style={{ lineHeight: 1.5, color: range ? ink : soft, fontSize: range ? '1.2rem' : '1.05rem', fontWeight: range ? 600 : 400 }}>{line}</p>
        <div className="mt-7 grid grid-cols-3 gap-4">{tiles.map(([v, l, s]) => <Tile key={l} value={v.toLocaleString()} label={l} sub={s} soft={soft} />)}</div>

        {kind === 'est' && (
          <div className="mt-7 pt-6" style={{ borderTop: `1px solid ${rule}`, lineHeight: 1.5 }}>
            <p className="max-w-[62ch]">
              {close.length ? `${plural(close.length, 'program')} at ${plural(nc, 'center')} ${close.length === 1 ? 'is a close match' : 'are close matches'} for "${q}".` : `No program is a close match for "${q}", so the estimate leans on ${plural(related.length, 'related program')}.`}
              {close.length > 0 && close.length < MIN_CLOSE && ` That is thin, so the estimate also leans on ${plural(loose, 'related program')}.`}
              {me && fit.nearCount > 0 && (fit.nearRan
                ? ` ${fit.nearRan} of your ${fit.nearCount} nearest centers ran one${fit.nearPct != null ? `, and it landed ${placeOf(fit.nearPct)} on average` : ', but none took sign-ups for it'}.`
                : ` None of your ${fit.nearCount} nearest centers has run one, so the estimate comes from centers less like yours, which count for less.`)}
              {me && (mineRun != null
                ? <> You ran something close yourself: <Link to={`/program/${P.key[mineRun]}`} className="z-link" style={link}>{P.name[mineRun]}</Link>{P.pc[mineRun] != null ? `, which landed ${placeOf(P.pc[mineRun] / 100, 'your')}${P.reg[mineRun] != null ? ` with ${plural(Math.round(P.reg[mineRun]), 'sign-up')}` : ''}. Your own result counts eight times as much as another center's.` : ', with no sign-ups recorded.'}</>
                : ownNear != null
                  ? <> You have not run a close match yourself. The nearest thing you ran, <Link to={`/program/${P.key[ownNear]}`} className="z-link" style={link}>{P.name[ownNear]}</Link>, landed {placeOf(P.pc[ownNear] / 100, 'your')}{P.reg[ownNear] != null ? ` with ${plural(Math.round(P.reg[ownNear]), 'sign-up')}` : ''}, and it counts eight times as much as another center's result.</>
                  : ' You have not run a close match yourself.')}
            </p>
            {!me && (
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <p className="font-semibold max-w-[40ch]">Choose your center for an answer about yours: where this should land among your own events, and how many sign-ups to expect.</p>
                <PickCenter cat={cat} />
              </div>
            )}
            {t && (
              <p className="z-small mt-5 max-w-[66ch]" style={{ color: soft }}>
                An estimate, not a forecast: in a replay of the last twelve months, the top fifth of these estimates landed in their center's top third {Math.round(t.top_fifth_in_top_third * 100)}% of the time and the bottom fifth {Math.round(t.bottom_fifth_in_top_third * 100)}%{range ? `; sign-up numbers were within a factor of 1.5 only ${Math.round(t.within_1_5x * 100)}% of the time` : ''}. About {Math.max(1, Math.round(est.eff))} past programs carry the weight of this one. <Link to="/engine" className="z-link" style={link}>How it was tested</Link>
              </p>
            )}
          </div>
        )}
        {kind === 'new' && <p className="z-small mt-6 max-w-[62ch]" style={{ lineHeight: 1.5, color: soft }}>The search reads program names and descriptions, so if you think centers do run this, try the words a flyer would use.</p>}
      </div>
      <div className="z-card">
        <h3 className="font-bold">{kind === 'new' ? (A.matches.length ? 'The nearest programs' : 'The nearest programs, none of them close') : 'The closest programs'}</h3>
        {top.length ? <ul className="mt-3">{top.map((i) => <MatchRow key={i} i={i} res={res} />)}</ul> : <p className="z-muted mt-3" style={{ lineHeight: 1.5 }}>Nothing in the network comes near this.</p>}
        {top.length > 0 && <p className="z-small z-muted mt-3" style={{ lineHeight: 1.45 }}>On the right, where each program landed among its own center's events, with its typical sign-ups.</p>}
      </div>
    </section>
  );
}

function Fact({ value, label, children }) {
  return (
    <div className="py-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
      <div className="flex items-baseline justify-between gap-4"><span className="font-semibold">{label}</span><span className="z-num text-right" style={{ fontSize: '1.45rem' }}>{value}</span></div>
      {children && <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>{children}</p>}
    </div>
  );
}

function TimingFit({ res, A, month }) {
  const { cat } = res, w = A.when, M = MONTH_FULL[month - 1];
  if (w.events < 5) return <Section id="lab-when-h" title="When this kind of event is run"><Empty>{w.events ? `The close matches have only ${plural(w.events, 'past event')} between them, too few to read a season from.` : 'None of the close matches has been held yet, so there is no season to read.'}</Empty></Section>;
  const names = w.topMonths.map((m) => MONTH_FULL[m]);
  const ratio = w.monthLift != null && w.allLift ? w.monthLift / w.allLift : null;
  const typeLabel = w.typeKey ? cat.types[w.typeKey] : null, s = w.slot;
  return (
    <Section id="lab-when-h" title="When this kind of event is run" sub={`Read from the ${plural(w.events, 'dated event')} behind the ${plural(A.close.length, 'close match', 'close matches')}. Your month is in blue.`}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="z-card">
          <h3 className="z-h3">{w.topMonths.includes(month - 1) ? `${w.share}% of these happen in ${M}, your month.${names.length > 1 ? ` ${names.filter((x) => x !== M)[0]} is the other busy one.` : ''}` : `Most of these happen in ${names.join(' and ')}. ${w.share}% happen in ${M}.`}</h3>
          <div className="mt-6"><Columns values={w.months} labels={MONTHS} highlight={[month - 1]} height={150} tipFor={(i) => [MONTH_FULL[i], `${plural(w.months[i], 'event')}, ${pct(w.months[i], w.events)}% of the total`]} /></div>
          <p className="mt-5 z-muted" style={{ lineHeight: 1.5 }}>
            {ratio == null
              ? `There is not enough data to say whether it does better or worse in ${M}: ${w.monthScored ? `only ${plural(w.monthScored, 'scored event')} at ${plural(w.monthCenters, 'center')} that month` : 'no scored events that month'}.`
              : `${ratio >= 1.1 ? `It has done better in ${M}` : ratio <= 0.9 ? `It has done worse in ${M}` : `${M} is about the same as the rest of the year`}: ${liftWords(w.monthLift)} from ${plural(w.monthScored, 'scored event')} at ${plural(w.monthCenters, 'center')}, against ${liftWords(w.allLift)} across all ${w.allScored.toLocaleString()} scored events.`}
          </p>
        </div>
        <div className="z-card" style={{ paddingTop: '0.6rem', paddingBottom: '0.8rem' }}>
          <div style={{ marginTop: -1 }}>
            <Fact label="Most common day" value={DAYS[w.wd]}>{w.wdShare}% of the close matches usually run on a {DAYS[w.wd]}.</Fact>
            {w.hour != null && <Fact label="Most common start" value={hourLabel(w.hour)}>{w.hourShare}% of them usually start in that hour.</Fact>}
            {typeLabel && (
              <Fact label="Best reliable slot" value={s ? `${DAYS[s.wd].slice(0, 3)} ${hourLabel(s.hour)}` : 'n/a'}>
                {s ? `${w.typeShare}% of the close matches are "${typeLabel}" events. Across the network that type does best on ${DAYS[s.wd]} at ${hourLabel(s.hour)}: ${liftWords(s.lift)}, from ${plural(s.scored, 'scored event')} at ${plural(s.scored_centers, 'center')}.` : `${w.typeShare}% of the close matches are "${typeLabel}" events. No day and hour for that type has enough scored events to call it reliable.`}
              </Fact>
            )}
          </div>
          <Link to="/timing" className="z-btn z-btn-soft z-btn-sm mt-2" style={{ background: '#fff' }}>All timing<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </Section>
  );
}

// The close matches at this center's nearest centers (and at the center itself), one row each.
function NearFit({ res, A }) {
  const { cat, q } = res, P = cat.programs, { me, prof, nearCount, nearClose, own } = A.fit;
  if (!me) return null;
  const perCenter = new Map(), rows = [];
  for (const i of nearClose) { const k = perCenter.get(P.c[i]) || 0; if (k >= 2) continue; perCenter.set(P.c[i], k + 1); rows.push(i); }
  const mineRows = (A.fit.ownClose.length ? A.fit.ownClose : own).slice(0, 3), shown = rows.slice(0, 12);
  const cols = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_8.5rem_10.5rem] gap-x-5 items-center';
  const row = (i, you) => { const p = cat.prog(i); return (
    <li key={i} className={`${cols} py-3.5`} style={{ borderTop: '1px solid var(--fog-2)' }}>
      <span className="hidden md:block min-w-0 truncate font-semibold">{you ? `${centerLabel(p.center)} (you)` : <CenterLink c={p.center} />}</span>
      <span className="min-w-0">
        <Link to={`/program/${p.key}`} className="font-bold block truncate hover:underline decoration-2 underline-offset-2">{p.name}</Link>
        <span className="z-small z-muted block truncate"><span className="md:hidden">{you ? `${centerLabel(p.center)} (you)` : <CenterLink c={p.center} />}, </span>{tier(res, i)}{p.n > 1 ? `, run ${p.n} times` : p.n === 0 ? ', not held yet' : ''}</span>
      </span>
      <span className="hidden md:block text-right tabular-nums font-semibold">{p.reg != null ? Math.round(p.reg) : <span className="z-muted font-normal z-small">none taken</span>}</span>
      <span className="text-right">
        <span className="font-bold block" style={{ fontSize: '0.95rem' }}>{P.pc[i] != null ? cap(place(P.pc[i] / 100)) : <span className="z-muted font-normal z-small">Not measured</span>}</span>
        <span className="md:hidden z-small z-muted block">{p.reg != null ? plural(Math.round(p.reg), 'sign-up') : ''}</span>
      </span>
    </li>); };
  return (
    <Section id="lab-near-fit-h" title="How it did at centers like yours"
      sub={!nearCount ? `There is nothing on record to match ${centerLabel(me)} with other centers yet, so there are no nearest centers to read from.`
        : `Close matches for "${q}" at the ${nearCount} centers most like ${centerLabel(me)} (matched on their biggest events, pace, Jewish population and what does well there). Sign-ups are each program's typical count, and the place is among that center's own events.`}
      action={<Link to={`/center/${me.id}`} className="z-btn z-btn-soft z-btn-sm">Your center's page<ArrowRight size={16} aria-hidden="true" /></Link>}>
      {shown.length + mineRows.length === 0 ? (nearCount > 0 && <Empty>None of your {nearCount} nearest centers has run a close match, and neither have you. You would be the first among centers like yours.</Empty>) : (
        <div>
          <div className={`${cols} hidden md:grid z-small z-muted font-semibold pb-2`}><span>Center</span><span>Program</span><span className="text-right">Sign-ups</span><span className="text-right">Place among its events</span></div>
          <ul>
            {mineRows.map((i) => row(i, true))}
            {shown.map((i) => row(i, false))}
          </ul>
          {!shown.length && nearCount > 0 && <p className="z-small z-muted mt-3">None of your {nearCount} nearest centers has run a close match.</p>}
          {prof && rows.length > shown.length && <p className="z-small z-muted mt-3">Showing {shown.length} of {rows.length}.</p>}
        </div>
      )}
    </Section>
  );
}

function NearCard({ x, typeLabel }) {
  const t = x.theme, d = t || x.idea, scoredN = t ? t.n_measured : d.n_scored, scoredC = t ? t.centers_measured : d.centers_scored;
  const thin = d.confidence === 'thin' || d.lift == null;
  return (
    <Link to={t ? `/themes/${t.id}` : `/idea/${d.id}`} className="z-card flex flex-col">
      <div className="flex flex-wrap items-center gap-2"><span className="z-pill" style={{ background: '#fff' }}>{t ? 'Shabbat theme' : 'Idea'}</span><StatusPill status={d.status} onFog /></div>
      <h3 className="z-h3 mt-4">{d.label}</h3>
      <p className="z-small z-muted mt-1.5">{plural(d.centers, 'center')}{typeLabel ? `, ${typeLabel}` : ''}{d.when ? `, ${whenText(d.when)}` : ''}{x.twins ? `. ${plural(x.twins, 'smaller idea')} ${x.twins === 1 ? 'shares' : 'share'} this name.` : ''}</p>
      <div className="mt-auto pt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {thin ? <span className="font-semibold">Too little to score</span> : <Lift value={d.lift} />}
        <span className="z-small z-muted">{thin ? '' : `${CONF[d.confidence]}: `}{plural(scoredN || 0, 'scored event')} at {plural(scoredC || 0, 'center')}</span>
      </div>
    </Link>
  );
}

function Results({ res, month, mine }) {
  const A = useMemo(() => analyze(res, month, mine), [res, month, mine]);
  const { cat } = res, isNew = A.kind === 'new';
  return (
    <div>
      {res.embedError && <p className="mt-6 z-note" role="status" style={{ lineHeight: 1.45 }}>The meaning search failed: {res.embedError.message.replace(/\.$/, '')}. These results fall back to matching the words of your idea against program names, so events worded differently are missed, the counts are rougher than usual and no estimate is made.</p>}
      <Verdict res={res} A={A} />
      {!isNew && A.fit.me && <NearFit res={res} A={A} />}
      {!isNew && <TimingFit res={res} A={A} month={month} />}
      {A.nearest.length > 0 && (
        <Section id="lab-near-h" title={isNew ? 'The nearest ideas, loosely related' : 'Closest ideas and Shabbat themes'} sub="An idea is the same program run by several centers. Each card opens its full record: every center, every flyer, how it did. The percentage on a card is the idea's own score against each center's normal for that kind of event, which is a different yardstick from the estimate above.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{A.nearest.map((x) => <NearCard key={x.key} x={x} typeLabel={x.idea ? cat.types[x.idea.type] : null} />)}</div>
        </Section>
      )}
      {A.flyers.length > 0 && (
        <Section id="lab-fly-h" title={isNew ? 'Flyers from the loosely related programs' : 'Flyers'} sub="The best matches that posted a flyer, at most two from any center. Sign-ups are that program's typical count; the percentage is against that center's normal for the same kind of event.">
          <FlyerGrid>{A.flyers.map((i) => <ProgramCard key={i} p={cat.prog(i)} />)}</FlyerGrid>
        </Section>
      )}
      {A.wording.length > 0 && (
        <Section id="lab-word-h" title="How others worded it" sub="Descriptions as the centers posted them, one per center, from the best matches.">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {A.wording.map(({ i, t }) => { const p = cat.prog(i); return (
              <figure key={i} className="z-card flex flex-col">
                <blockquote style={{ lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t}</blockquote>
                <figcaption className="mt-auto pt-4 z-small"><Link to={`/program/${p.key}`} className="z-link">{p.name}</Link><span className="z-muted">, <CenterLink c={p.center} /></span></figcaption>
              </figure>); })}
          </div>
        </Section>
      )}
      {!isNew && A.close.length >= 3 && A.names.length > 0 && (
        <Section id="lab-name-h" title="What they called it" sub={`The most common names among the ${plural(A.close.length, 'close match', 'close matches')}, with how many programs use each. ${plural(A.distinctNames, 'different name')} in all.`}>
          <ul className="flex flex-wrap gap-2.5">
            {A.names.map((x) => <li key={x.name} className="z-pill" style={{ height: '2.5rem', fontSize: '1rem', padding: '0 1.1rem', maxWidth: '100%' }}><span className="truncate">{x.name}</span><span className="z-muted" style={{ fontWeight: 600 }}>{x.n}</span></li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- browse
function IdeaTile({ t, cat, note }) {
  const img = cat.img(t.img) || (t.img_pid != null ? cat.prog(t.img_pid)?.img : null) || (t.top_pid != null ? cat.prog(t.top_pid)?.img : null);
  return (
    <Link to={`/idea/${t.idea}`} className="block group min-w-0">
      <Flyer src={img} alt="" />
      <p className="font-bold mt-2.5 z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22 }}>{t.label}</p>
      <p className="z-small z-muted mt-0.5" style={{ lineHeight: 1.35 }}>{note}</p>
    </Link>
  );
}

const pillBtn = (on) => ({ background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', height: '2.1rem', padding: '0 0.95rem', fontSize: '0.9rem', cursor: 'pointer', flex: 'none' });

function Directory({ ideas, cat }) {
  const [type, setType] = useState('all');
  const [find, setFind] = useState('');
  const [sort, setSort] = useState('centers');
  const [staples, setStaples] = useState(false);
  const [shown, setShown] = useState(30);
  useEffect(() => { setShown(30); }, [type, find, sort, staples]);
  const nStaple = useMemo(() => ideas.filter((i) => i.staple).length, [ideas]);
  const types = useMemo(() => { const m = new Map(); ideas.forEach((i) => { if (staples || !i.staple) m.set(i.type, (m.get(i.type) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [ideas, staples]);
  const list = useMemo(() => {
    const s = find.trim().toLowerCase();
    const out = ideas.filter((i) => (staples || !i.staple) && (type === 'all' || i.type === type) && (!s || i.label.toLowerCase().includes(s) || i.names.some((n) => n.name.toLowerCase().includes(s))));
    const solid = (i) => (i.lift != null && i.confidence !== 'thin' ? 1 : 0);
    if (sort === 'centers') out.sort((a, b) => b.centers - a.centers || b.n - a.n);
    else if (sort === 'lift') out.sort((a, b) => solid(b) - solid(a) || (b.lift || 0) - (a.lift || 0));
    else out.sort((a, b) => (b.first?.date || '').localeCompare(a.first?.date || '') || b.centers - a.centers);
    return out;
  }, [ideas, type, find, sort, staples]);
  const cols = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.2fr)_6.5rem_5.5rem_9.5rem] gap-x-5 items-center';
  return (
    <Section id="all-h" title="All ideas" sub={`${ideas.length.toLocaleString()} ideas, each run by at least two centers. A lift is only ranked when the engine has at least some evidence for it. The rest say so.`}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1" style={{ minWidth: '14rem', maxWidth: '24rem' }}>
          <span className="sr-only">Filter ideas by name</span>
          <Search size={17} aria-hidden="true" className="absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--grey)' }} />
          <input className="z-input" style={{ paddingLeft: '2.5rem' }} placeholder="Filter by name" value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
        <Seg value={sort} onChange={setSort} label="Sort ideas" options={[['centers', 'Most centers'], ['lift', 'Best lift'], ['new', 'Newest first']]} />
        <button type="button" className="z-pill" aria-pressed={staples} onClick={() => setStaples((v) => !v)} style={pillBtn(staples)} title="A staple is a standing program, run a dozen times or more per center, like the weekly Shabbat dinner">{staples ? 'Hide' : 'Show'} {nStaple} weekly staples</button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto md:flex-wrap z-scroll pb-1" role="group" aria-label="Filter by type">
        <button type="button" className="z-pill" aria-pressed={type === 'all'} onClick={() => setType('all')} style={pillBtn(type === 'all')}>All types</button>
        {types.map(([k, n]) => <button key={k} type="button" className="z-pill" aria-pressed={type === k} onClick={() => setType(type === k ? 'all' : k)} style={pillBtn(type === k)}>{cat.types[k] || k}<span style={{ opacity: 0.55 }}>{n}</span></button>)}
      </div>
      {list.length === 0 ? <div className="mt-6"><Empty>No idea matches that. Try fewer letters, another type, or type it into the box at the top of the page to search every program by meaning.</Empty></div> : (
        <div className="mt-6">
          <div className={`${cols} hidden md:grid z-small z-muted font-semibold pb-2`}><span>Idea</span><span>Type</span><span>Trend</span><span className="text-right">Centers</span><span className="text-right">Lift</span></div>
          <ul>
            {list.slice(0, shown).map((i) => { const thin = i.lift == null || i.confidence === 'thin'; return (
              <li key={i.id} style={{ borderTop: '1px solid var(--fog-2)' }}>
                <Link to={`/idea/${i.id}`} className={`${cols} py-3.5 group`}>
                  <span className="min-w-0">
                    <span className="font-bold block truncate group-hover:underline decoration-2 underline-offset-2">{i.label}</span>
                    <span className="z-small z-muted block truncate"><span className="md:hidden">{plural(i.centers, 'center')}, {cat.types[i.type] || i.type}, </span>{sort === 'new' && i.first ? `first seen ${fmtDate(i.first.date, { month: 'short', year: 'numeric' })}` : whenText(i.when)}</span>
                  </span>
                  <span className="hidden md:block z-small z-muted truncate">{cat.types[i.type] || i.type}</span>
                  <span className="hidden md:block"><StatusPill status={i.status} /></span>
                  <span className="hidden md:block text-right font-semibold tabular-nums">{i.centers}</span>
                  <span className="text-right">
                    {thin ? <span className="z-small z-muted whitespace-nowrap">Too little data</span> : <span className="inline-flex flex-col items-end"><Lift value={i.lift} size="sm" /><span className="z-small z-muted whitespace-nowrap" style={{ fontSize: '0.76rem' }}>{i.n_scored} scored, {i.centers_scored} centers</span></span>}
                  </span>
                </Link>
              </li>); })}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {shown < list.length && <button type="button" className="z-btn z-btn-soft z-btn-sm" onClick={() => setShown((n) => n + 30)}>Show 30 more</button>}
            <span className="z-small z-muted">Showing {Math.min(shown, list.length).toLocaleString()} of {plural(list.length, 'idea')}</span>
          </div>
        </div>
      )}
    </Section>
  );
}

function Browse({ home, ideas, cat }) {
  const [tab, setTab] = useState(home.hot.length ? 'hot' : 'rising');
  const trend = tab === 'hot' ? home.hot : home.rising;
  const [older, setOlder] = useState(false);
  // home.json "new" keeps the 24 most widely adopted ideas of the past 400 days, which crowds out the newest.
  // The ideas of the last few weeks are read straight from each idea's first run.
  const cutoff = new Date(new Date(home.today + 'T12:00:00Z').getTime() - RECENT_DAYS * 864e5).toISOString().slice(0, 10);
  const fresh = ideas.filter((i) => i.first && i.first.date >= cutoff && !i.staple).sort((a, b) => b.centers - a.centers || b.first.date.localeCompare(a.first.date)).slice(0, 12)
    .map((i) => ({ idea: i.id, label: i.label, centers: i.centers, first: i.first, img_pid: i.flyers[0] }));
  const freshIds = new Set(fresh.map((t) => t.idea)), earlier = home.new.filter((t) => !freshIds.has(t.idea));
  return (
    <>
      <Section id="trend-h" title="Trending right now" sub={`The last ${home.window.back} days and the next ${home.window.ahead}, already posted. "Most centers" counts who is running an idea in that window. "Up on last year" compares with the same weeks a year ago.`}
        action={<Seg value={tab} onChange={setTab} label="Which trend" options={[['hot', 'Most centers'], ['rising', 'Up on last year']]} />}>
        {trend.length ? <FlyerGrid>{trend.slice(0, 12).map((t) => <IdeaTile key={t.idea} t={t} cat={cat} note={tab === 'hot' ? `${plural(t.centers, 'center')} now${t.last_year ? `, ${t.last_year} a year ago` : ''}` : `${t.centers} centers now, ${t.last_year} a year ago`} />)}</FlyerGrid>
          : <Empty>{tab === 'hot' ? 'Nothing is being run by two or more centers right now.' : 'Nothing is clearly up on the same weeks last year.'}</Empty>}
      </Section>
      <Section id="new-h" title="New in the last few weeks" sub={fresh.length
        ? `Ideas whose first run anywhere was in the last ${RECENT_DAYS} days and that a second center has already picked up. Two centers is too few to read a result from, so treat these as things to watch.`
        : `No idea first seen in the last ${RECENT_DAYS} days has reached a second center yet. These are the newest that have, from the past year.`}>
        {fresh.length > 0 && <FlyerGrid>{fresh.map((t) => <IdeaTile key={t.idea} t={t} cat={cat} note={`${plural(t.centers, 'center')}, first seen ${fmtDate(t.first.date, { month: 'short', day: 'numeric' })}`} />)}</FlyerGrid>}
        {(older || !fresh.length) && earlier.length > 0 && <div className={fresh.length ? 'mt-10' : ''}>
          {fresh.length > 0 && <p className="font-bold mb-5">Earlier in the past year, the most widely adopted first</p>}
          <FlyerGrid>{earlier.map((t) => <IdeaTile key={t.idea} t={t} cat={cat} note={`${plural(t.centers, 'center')}, first seen ${fmtDate(t.first.date, { month: 'short', year: 'numeric' })}`} />)}</FlyerGrid>
        </div>}
        {!older && fresh.length > 0 && earlier.length > 0 && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setOlder(true)}>Show {earlier.length} from earlier in the past year</button>}
        {!fresh.length && !earlier.length && <Empty>No new idea has reached a second center this year.</Empty>}
      </Section>
      <Section id="usual-h" title="Usually run around now" sub="Ideas with a strong pull toward the next four weeks, counted over every year in the data. Holiday ideas follow the Jewish calendar, the rest follow the civil one.">
        {home.usual.length ? <More count={Math.max(0, home.usual.length - 6)} label="Show the other">{(open) => <FlyerGrid>{home.usual.slice(0, open ? 24 : 6).map((t) => <IdeaTile key={t.idea} t={t} cat={cat} note={`${Math.round(t.share * 100)}% of its past runs fall in the next four weeks`} />)}</FlyerGrid>}</More> : <Empty>Nothing has a strong pull toward the next four weeks.</Empty>}
      </Section>
      <Directory ideas={ideas} cat={cat} />
    </>
  );
}

// ---------------------------------------------------------------- the page
export default function Ideas() {
  const { data, error } = useData('home.json', 'ideas.json', 'catalog');
  const [sp, setSp] = useSearchParams();
  const [mine] = useMyCenter();
  const q = (sp.get('q') || '').trim().slice(0, 200);
  const mUrl = Math.round(Number(sp.get('m'))), month = mUrl >= 1 && mUrl <= 12 ? mUrl : null;
  const [draft, setDraft] = useState(q);
  const [mDraft, setMDraft] = useState(month || new Date().getMonth() + 1);
  useEffect(() => { setDraft(q); }, [q]);
  useEffect(() => { if (month) setMDraft(month); }, [month]);
  const lab = useLab(q);
  const go = (text, m = mDraft) => { const t = text.trim(); if (t) setSp({ q: t, m: String(m) }); else setSp({}); };
  const pickMonth = (m) => { setMDraft(m); if (q) setSp({ q, m: String(m) }, { replace: true }); };
  const count = data ? data[2].count.toLocaleString() : '13,000';
  return (
    <div>
      <PageHead title="Idea lab" lede={`Describe an event you are thinking of running. The lab compares it with all ${count} programs in the network and estimates where it would land among your own events, from how similar events did at the centers most like yours. It also shows when it is run and how others packaged it.`} />
      <form className="mt-9 p-5 sm:p-7" style={{ background: 'var(--fog)', borderRadius: 'var(--r-lg)' }} onSubmit={(e) => { e.preventDefault(); go(draft); }} role="search" aria-label="Test an event idea">
        <label htmlFor="lab-q" className="z-h3 block" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Describe an event idea</label>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
          <div className="relative min-w-0">
            <input id="lab-q" className="z-input" style={{ background: '#fff', height: '4rem', fontSize: 'clamp(1.1rem, 2.2vw, 1.4rem)', fontWeight: 600, padding: '0 3rem 0 1.2rem', borderRadius: 20 }} placeholder="Sushi in the sukkah" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} autoComplete="off" enterKeyHint="search" />
            {draft && <button type="button" aria-label="Clear the idea" onClick={() => { setDraft(''); if (q) setSp({}); }} className="absolute inline-flex items-center justify-center hover:bg-[var(--fog)]" style={{ right: 12, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 99 }}><X size={18} aria-hidden="true" /></button>}
          </div>
          <label className="flex items-center gap-2.5 font-semibold" style={{ background: '#fff', borderRadius: 20, height: '4rem', padding: '0 1.1rem' }}>
            <span className="z-muted whitespace-nowrap">When</span>
            <select aria-label="The month you would run it" value={mDraft} onChange={(e) => pickMonth(Number(e.target.value))} className="font-bold bg-transparent flex-1 md:flex-none" style={{ height: '100%', cursor: 'pointer', outline: 'none' }}>
              {MONTH_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <button type="submit" className="z-btn z-btn-go" style={{ height: '4rem', borderRadius: 20, fontSize: '1.08rem', padding: '0 1.8rem' }} disabled={!draft.trim() || lab.status === 'loading'}>Test this idea</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="z-small z-muted mr-1">Try</span>
          {EXAMPLES.map((x) => <button key={x} type="button" className="z-pill" style={{ background: '#fff', cursor: 'pointer', height: '2rem' }} onClick={() => { setDraft(x); go(x); }}>{x}</button>)}
        </div>
      </form>

      <div aria-live="polite">
        {lab.status === 'loading' && (
          <div className="mt-8" aria-busy="true">
            <p className="font-semibold">Comparing "{q}" with {count} programs.{lab.first ? ' The first search downloads the search index (about 3.4 MB) and the event descriptions. Later searches are instant.' : ''}</p>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 mt-4"><div className="z-skel" style={{ height: 320 }} /><div className="z-skel" style={{ height: 320 }} /></div>
          </div>
        )}
        {lab.status === 'error' && <ErrorNote error={lab.error} what="The search index" />}
        {lab.status === 'done' && lab.res.q === q && <Results res={lab.res} month={month || mDraft} mine={mine} />}
      </div>

      {error && <ErrorNote error={error} what="The idea lists" />}
      {!data && !error && <Loading rows={2} h={220} />}
      {data && <Browse home={data[0]} ideas={data[1]} cat={data[2]} />}
    </div>
  );
}
