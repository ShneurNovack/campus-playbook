import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData, plural, liftShort, liftPct, liftWords, DAYS, DAY3, MONTHS } from '../lib/data';
import { PageHead, Section, Loading, ErrorNote, Seg, Lift, Columns, tip } from '../components/bits';

// ---- words and numbers used only on this page
const words = (x) => liftWords(x, 'their own');
const N = (n) => Number(n || 0).toLocaleString();
const hourA = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const hourLong = (h) => (h === 0 ? '12\u00a0am' : h < 12 ? `${h}\u00a0am` : h === 12 ? '12\u00a0pm' : `${h - 12}\u00a0pm`);
const slotName = (c) => `${DAYS[c.wd]} ${hourLong(c.hour)}`;
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));
const pct = (x) => { const p = liftPct(x); return p === 0 ? '0%' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`; };
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const lower = (s) => (/^(Shabbat|Israel|Tefillin)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const THIN = 'Thin evidence';

// One blue, light to dark, for lift. Greys to ink for counts. The last two blues carry white text.
const LIFT_STEPS = [[0.8, '#DCE2FF'], [0.9, '#BCC7FF'], [1.0, '#95A5FF'], [1.1, '#6279FF'], [1.2, '#2F4BFF'], [Infinity, '#0F22B0']];
const LIFT_TICKS = ['−20%', '−10%', 'Normal', '+10%', '+20%'];
const COUNT_STEPS = ['#D9DCE1', '#B4B8BF', '#868B94', '#4C5058', '#000000'];
const liftStep = (x) => LIFT_STEPS.findIndex(([t]) => x < t);
const countStep = (n, max) => Math.min(4, Math.floor(Math.pow(n / Math.max(1, max), 0.4) * 5));

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// On a phone the wide tables scroll sideways. Start them on the column that matters, not on 7 am.
function useCenterOn(deps) {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current, el = box?.querySelector('[data-center="1"]');
    if (box && el && box.scrollWidth > box.clientWidth + 4) box.scrollLeft = Math.max(0, el.offsetLeft + el.offsetWidth / 2 - box.clientWidth / 2);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

function hebrewMonthNow() {
  try {
    const m = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long' }).format(new Date()).toLowerCase();
    return { tis: 'Tishrei', hes: 'Cheshvan', kis: 'Kislev', tev: 'Tevet', she: 'Shvat', ada: 'Adar', nis: 'Nisan', iya: 'Iyar', siv: 'Sivan', tam: 'Tammuz', av: 'Av', elu: 'Elul' }[m.slice(0, 3)] || null;
  } catch (_) { return null; }
}

// ---- the type selector
function TypePills({ value, onChange, options }) {
  const on = useRef(null);
  useEffect(() => { on.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, []);
  return (
    <div className="mt-9 -mx-5 px-5 sm:mx-0 sm:px-0 overflow-x-auto z-scroll">
      <div className="flex sm:flex-wrap gap-2 w-max sm:w-auto pb-1" role="group" aria-label="Kind of event">
        {options.map(([k, l]) => (
          <button key={k} ref={value === k ? on : undefined} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={`z-btn z-btn-sm ${value === k ? '' : 'z-btn-soft'}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// ---- section 3: the three answer panels
function SlotPanel({ title, sub, slots, kind, go, empty, mixOf }) {
  const fg = go ? 'rgba(255,255,255,0.86)' : 'var(--grey)';
  return (
    <div className="z-card flex flex-col" style={go ? { background: 'var(--go)', color: '#fff' } : undefined}>
      <h3 className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, fontSize: '1rem', lineHeight: 1.3 }}>{title}</h3>
      <p className="z-small mt-1" style={{ color: fg }}>{sub}</p>
      {slots.length === 0 ? <p className="mt-5" style={{ lineHeight: 1.5, color: fg }}>{empty}</p> : (
        <ol className="mt-4">
          {slots.map((c, i) => {
            const mix = mixOf ? mixOf(c, kind !== 'common') : null;
            return (
              <li key={`${c.wd}-${c.hour}`} className="py-3.5 flex items-start justify-between gap-4" style={{ borderTop: i ? `1px solid ${go ? 'rgba(255,255,255,0.25)' : 'var(--fog-2)'}` : 'none' }}>
                <div className="min-w-0">
                  <p className="z-num" style={{ fontSize: i === 0 ? 'clamp(1.6rem, 2.3vw, 1.85rem)' : '1.25rem' }}>{slotName(c)}</p>
                  <p className="z-small mt-1.5" style={{ color: fg }}>
                    {kind === 'common' ? `${N(c.n)} events at ${plural(c.centers, 'center')}` : `${plural(c.scored, 'scored event')} at ${plural(c.scored_centers, 'center')}`}
                  </p>
                  {mix && <p className="z-small mt-0.5" style={{ color: fg }}>{mix}</p>}
                </div>
                <div className="text-right flex-none">
                  {kind === 'common' ? (
                    c.lift == null ? <span className="z-small z-muted">Too few scored</span>
                      : c.ok ? <Lift value={c.lift} size={i === 0 ? 'md' : 'sm'} />
                        : <span className="z-small z-muted whitespace-nowrap">{pct(c.lift)}, thin</span>
                  ) : go ? <span className="z-num whitespace-nowrap" style={{ fontSize: i === 0 ? '1.6rem' : '1.15rem' }}>{liftShort(c.lift)}</span>
                    : <Lift value={c.lift} size={i === 0 ? 'md' : 'sm'} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---- section 4: weekday by hour
function HeatTable({ cells, mode }) {
  const box = useCenterOn([cells, mode]);
  const { hours, by, max, maxCell, hidden, busy } = useMemo(() => {
    const total = cells.reduce((a, c) => a + c.n, 0) || 1, col = new Map();
    cells.forEach((c) => { const e = col.get(c.hour) || { n: 0, lift: false }; e.n += c.n; e.lift = e.lift || c.lift != null; col.set(c.hour, e); });
    const keep = [...col.entries()].filter(([, e]) => e.lift || e.n >= Math.max(2, total * 0.004)).map(([h]) => h);
    const src = keep.length ? keep : [...col.keys()];
    const lo = Math.min(...src), hi = Math.max(...src), hs = [];
    for (let h = lo; h <= hi; h++) hs.push(h);
    const shown = cells.filter((c) => c.hour >= lo && c.hour <= hi);
    const top = shown.reduce((a, c) => (c.n > (a?.n || 0) ? c : a), null);
    const busy = hs.reduce((a, h) => ((col.get(h)?.n || 0) > (col.get(a)?.n || 0) ? h : a), hs[0]);
    return { hours: hs, by: new Map(shown.map((c) => [c.wd * 100 + c.hour, c])), max: top?.n || 1, maxCell: top, hidden: total - shown.reduce((a, c) => a + c.n, 0), busy };
  }, [cells]);
  if (!cells.length) return <p className="z-muted">No events to show.</p>;
  const tipFor = (c) => {
    const l = [slotName(c), `${N(c.n)} ${c.n === 1 ? 'event' : 'events'} at ${plural(c.centers, 'center')}`, c.scored ? `${N(c.scored)} scored, from ${plural(c.scored_centers, 'center')}` : 'None scored'];
    if (c.lift == null) l.push('Too few scored events to say how it does');
    else { l.push(`Lift ${pct(c.lift)}: ${words(c.lift)}`); if (!c.ok) l.push('The evidence is thin: fewer than 25 scored events or fewer than 6 centers'); }
    return l;
  };
  return (
    <div>
      <p className="sm:hidden z-small z-muted mb-3">Swipe sideways for the other hours.</p>
      <div ref={box} className="relative overflow-x-auto z-scroll -mx-1 px-1 pb-2">
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, tableLayout: 'fixed', width: '100%', minWidth: `calc(3.1rem + ${hours.length} * 2.75rem)` }}>
          <caption className="sr-only">{mode === 'lift' ? 'How events did in each weekday and hour, against their own center\'s normal' : 'How many events were held in each weekday and hour'}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: '3.1rem', position: 'sticky', left: 0, background: 'var(--fog)', zIndex: 1 }}><span className="sr-only">Day</span></th>
              {hours.map((h) => <th key={h} scope="col" data-center={h === busy ? 1 : undefined} className="z-muted" style={{ fontSize: '0.74rem', fontWeight: 600, paddingBottom: 4 }}><span aria-hidden="true">{hourA(h)}</span><span className="sr-only">{hourLong(h)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d, wd) => (
              <tr key={d}>
                <th scope="row" className="text-left font-bold" style={{ fontSize: '0.86rem', position: 'sticky', left: 0, background: 'var(--fog)', zIndex: 1 }}><span aria-hidden="true">{DAY3[wd]}</span><span className="sr-only">{d}</span></th>
                {hours.map((h) => {
                  const c = by.get(wd * 100 + h);
                  const base = { height: '2.35rem', borderRadius: 7, textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, padding: 0, fontVariantNumeric: 'tabular-nums' };
                  if (!c) return <td key={h} style={base} />;
                  if (mode !== 'lift') { const s = countStep(c.n, max); return <td key={h} style={{ ...base, background: COUNT_STEPS[s], color: s >= 3 ? '#fff' : '#000' }} {...tip(tipFor(c))}>{compact(c.n)}</td>; }
                  if (c.lift == null) return <td key={h} style={base} {...tip(tipFor(c))}><span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: '#C2C6CD' }} /><span className="sr-only">too few scored events</span></td>;
                  if (!c.ok) return <td key={h} style={{ ...base, background: '#fff', color: 'var(--grey)', fontWeight: 600, outline: '1.5px dotted #8E94A0', outlineOffset: -2 }} {...tip(tipFor(c))}>{pct(c.lift)}<span className="sr-only">, thin evidence</span></td>;
                  const s = liftStep(c.lift);
                  return <td key={h} style={{ ...base, background: LIFT_STEPS[s][1], color: s >= 4 ? '#fff' : '#000' }} {...tip(tipFor(c))}>{pct(c.lift)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-4 z-small z-muted">
        {mode === 'lift' ? (
          <>
            <div aria-hidden="true">
              <div className="flex">{LIFT_STEPS.map(([, col]) => <span key={col} style={{ width: 44, height: 14, background: col }} />)}</div>
              <div className="relative" style={{ height: 18, width: 264 }}>{LIFT_TICKS.map((t, i) => <span key={t} className="absolute" style={{ left: (i + 1) * 44, top: 3, transform: 'translateX(-50%)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{t}</span>)}</div>
            </div>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" style={{ width: 30, height: 18, borderRadius: 5, background: '#fff', outline: '1.5px dotted #8E94A0', outlineOffset: -2 }} />Thin evidence, read with care</span>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-flex items-center justify-center" style={{ width: 18, height: 18 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: '#C2C6CD' }} /></span>Events held, too few scored</span>
            <span>Blank: no events</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2.5"><span>Fewer</span><span className="flex" aria-hidden="true">{COUNT_STEPS.map((col) => <span key={col} style={{ width: 34, height: 14, background: col }} />)}</span><span>More</span></span>
            {maxCell && <span>The darkest cell is {slotName(maxCell)} with {N(maxCell.n)} events. The shading is compressed so the small slots stay visible.</span>}
          </>
        )}
      </div>
      {hidden > 0 && <p className="z-small z-muted mt-3">{plural(hidden, 'event')} outside these hours {hidden === 1 ? 'is' : 'are'} not shown.</p>}
    </div>
  );
}

// ---- lift as columns that rise or fall from the "normal" line. Used for weekdays, hours, months, fifths.
function LiftColumns({ rows, height = 170, highlight = -1, labels = true, minCol = 0, label, dense }) {
  const box = useCenterOn([rows.length, highlight, minCol]);
  const vals = rows.filter((r) => r.lift != null).map((r) => r.lift);
  const up = Math.max(0.08, ...vals.map((v) => v - 1)), down = Math.max(0.08, ...vals.map((v) => 1 - v));
  const PAD = 19, usable = height - PAD * 2, baseY = PAD + usable * (up / (up + down));
  const chart = (
    <div className="relative flex gap-[3px]" style={{ minWidth: minCol ? rows.length * minCol : undefined }} role="img" aria-label={`${label}: ${rows.map((r) => `${r.long || r.label} ${r.lift == null ? 'not enough data' : pct(r.lift) + (r.ok === false ? ' (thin evidence)' : '')}`).join(', ')}`}>
      <div aria-hidden="true" className="absolute inset-x-0" style={{ top: baseY, height: 1, background: 'var(--ink)', opacity: 0.55 }} />
      {rows.map((r, i) => {
        const hi = i === highlight, thin = r.lift != null && r.ok === false;
        const h = r.lift == null ? 0 : Math.max(2, Math.round((Math.abs(r.lift - 1) / (up + down)) * usable)), above = r.lift != null && r.lift >= 1;
        return (
          <div key={r.key ?? r.label} className="flex-1 min-w-0" data-center={i === highlight ? 1 : undefined} {...tip(r.tip)} tabIndex={0} style={{ outlineOffset: 0 }}>
            <div className="relative" style={{ height }}>
              {r.lift != null && (
                <>
                  <div className="absolute left-1/2" style={{ width: '100%', maxWidth: 24, transform: 'translateX(-50%)', top: above ? baseY - h : baseY, height: h, borderRadius: above ? '4px 4px 0 0' : '0 0 4px 4px', background: thin ? '#fff' : hi ? 'var(--go)' : 'var(--ink)', outline: thin ? '1.5px dotted #8E94A0' : 'none', outlineOffset: -1.5 }} />
                  <div className="absolute inset-x-0 text-center whitespace-nowrap" style={{ top: above ? baseY - h - 17 : baseY + h + 3, fontSize: dense ? '0.64rem' : '0.7rem', lineHeight: '14px', fontWeight: thin ? 500 : 700, color: thin ? 'var(--grey)' : 'var(--ink)' }}>{dense ? pct(r.lift).replace('%', '') : pct(r.lift)}</div>
                </>
              )}
            </div>
            {labels && (
              <div className="text-center mt-1.5">
                <div className="truncate" style={{ fontSize: '0.78rem', fontWeight: hi ? 800 : 600 }}>{r.label}</div>
                {r.cap != null && <div className="z-muted truncate" style={{ fontSize: '0.68rem', marginTop: 1 }}>{r.cap}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
  return minCol ? <div ref={box} className="relative overflow-x-auto z-scroll pb-1">{chart}</div> : chart;
}

// Twelve months as two aligned rows: how events did (lift) over how many were held (count).
function MonthPair({ rows, labels, short, highlight, name, liftTitle, countTip }) {
  const [ref, w] = useWidth();
  const narrow = w > 0 && w < rows.length * 40, scroll = narrow && !short;
  const inner = (
    <div style={{ minWidth: scroll ? rows.length * 60 : undefined }}>
      <p className="z-small font-semibold">{liftTitle}{narrow && !scroll ? ', in percent' : ''}</p>
      <LiftColumns rows={rows} labels={false} highlight={highlight} height={150} label={name} dense={narrow && !scroll} />
      <p className="z-small font-semibold mt-4 mb-1">Events held</p>
      <Columns values={rows.map((r) => r.n)} labels={narrow && short ? short : labels} height={64} highlight={highlight >= 0 ? [highlight] : []} format={(v) => N(v)} tipFor={countTip} />
    </div>
  );
  return <div ref={ref} className="mt-5 min-w-0">{scroll && <p className="z-small z-muted mb-3">Swipe sideways for the rest of the year.</p>}{scroll ? <div className="relative overflow-x-auto z-scroll pb-1">{inner}</div> : inner}</div>;
}

const barTip = (title, r) => [title, `${N(r.n)} ${r.n === 1 ? 'event' : 'events'}${r.centers != null ? ` at ${plural(r.centers, 'center')}` : ''}`, r.scored != null ? `${N(r.scored)} scored` : null,
  r.lift == null ? 'Too few scored events to say how it does' : `Lift ${pct(r.lift)}: ${words(r.lift)}`, r.lift != null && r.ok === false ? 'The evidence is thin' : null].filter(Boolean);

const bestOf = (rows) => rows.reduce((a, r, i) => (r.lift != null && r.ok && (a < 0 || r.lift > rows[a].lift) ? i : a), -1);
const worstOf = (rows) => rows.reduce((a, r, i) => (r.lift != null && r.ok && (a < 0 || r.lift < rows[a].lift) ? i : a), -1);

// ---- section 6b: one semester's curve. Two of these sit side by side on the same y scale.
function WeekCurve({ rows, lo, hi, season }) {
  const [ref, w] = useWidth();
  const H = 220, L = 46, R = 14, T = 24, B = 28;
  const pts = rows.filter((r) => r.lift != null);
  const x = (wk) => L + ((wk - 1) / 15) * Math.max(1, w - L - R), y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const step = hi - lo > 0.75 ? 0.2 : 0.1, ticks = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  if (!ticks.includes(1)) ticks.push(1);
  const segs = [];
  let cur = [];
  rows.forEach((r) => { if (r.lift == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(r); });
  if (cur.length) segs.push(cur);
  const top = pts.reduce((a, r) => (!a || r.lift > a.lift ? r : a), null), bot = pts.reduce((a, r) => (!a || r.lift < a.lift ? r : a), null);
  return (
    <div ref={ref} className="min-w-0">
      {pts.length < 2 ? <div className="flex items-center z-muted" style={{ height: H, lineHeight: 1.5 }}>Not enough scored events in any week of the {season} semester to draw this. A week needs 12.</div> : w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`${season} semester, week by week: ${rows.map((r) => `week ${r.week} ${r.lift == null ? 'no data' : pct(r.lift)}`).join(', ')}`} style={{ display: 'block', overflow: 'visible' }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={v === 1 ? 'var(--ink)' : 'var(--mist)'} strokeWidth={1} opacity={v === 1 ? 0.55 : 1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="var(--grey)">{v === 1 ? 'Normal' : pct(v)}</text>
            </g>
          ))}
          {[1, 4, 8, 12, 16].map((wk) => <text key={wk} x={x(wk)} y={H - 7} textAnchor={wk === 1 ? 'start' : 'middle'} fontSize="11.5" fill="var(--grey)">{wk === 1 ? 'Week 1' : wk}</text>)}
          {segs.filter((s) => s.length > 1).map((s) => <path key={s[0].week} d={s.map((r, i) => `${i ? 'L' : 'M'}${x(r.week).toFixed(1)},${y(r.lift).toFixed(1)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {pts.map((r) => <circle key={r.week} cx={x(r.week)} cy={y(r.lift)} r={r === top ? 5 : 3.2} fill={r === top ? 'var(--go)' : 'var(--ink)'} stroke="var(--fog)" strokeWidth={r === top ? 2 : 1} />)}
          {top && <text x={x(top.week)} y={y(top.lift) - 10} textAnchor={top.week <= 2 ? 'start' : top.week >= 15 ? 'end' : 'middle'} fontSize="12" fontWeight="700" fill="var(--ink)">{pct(top.lift)}</text>}
          {bot && bot !== top && <text x={x(bot.week)} y={y(bot.lift) + 18} textAnchor={bot.week <= 2 ? 'start' : bot.week >= 15 ? 'end' : 'middle'} fontSize="12" fontWeight="700" fill="var(--ink)">{pct(bot.lift)}</text>}
          {pts.map((r) => <circle key={`h${r.week}`} cx={x(r.week)} cy={y(r.lift)} r={12} fill="transparent" tabIndex={0} {...tip([`Week ${r.week} of the ${season} semester`, `Lift ${pct(r.lift)}: ${words(r.lift)}`, `${plural(r.n, 'scored event')}`])} />)}
        </svg>
      )}
    </div>
  );
}

// average of a run of weeks, weighted by the events behind each point. Only describes what the chart shows.
function runOf(rows) {
  const s = rows.filter((r) => r.lift != null);
  if (s.length < 3) return null;
  const n = s.reduce((a, r) => a + r.n, 0);
  return Math.exp(s.reduce((a, r) => a + r.n * Math.log(r.lift), 0) / n);
}

function fallSpring(fs, key) {
  const r = fs?.spring_vs_fall;
  if (r == null) return { head: 'Not enough data', body: `Fall against spring needs centers that ran at least three of these in each semester of the same academic year. ${fs?.pairs ? `Only ${plural(fs.pairs, 'center-year')} ${fs.pairs === 1 ? 'qualifies' : 'qualify'}` : 'None qualify'} so far, and five are needed.` };
  const p = Math.round((r - 1) * 100), thin = fs.pairs < 20;
  const head = Math.abs(p) < 3 ? 'About even' : p < 0 ? `Fall, by ${Math.abs(p)}%` : `Spring, by ${p}%`;
  const say = Math.abs(p) < 3 ? 'Spring and fall events draw about the same sign-ups at the same center.' : `Spring events draw about ${Math.abs(p)}% ${p < 0 ? 'fewer' : 'more'} sign-ups than fall at the same center.`;
  return { head, body: `${say} That is the typical gap between a center's spring median and its own fall median in the same academic year, across ${plural(fs.pairs, 'center-year')}.${thin ? ' That is a small sample, so treat it as a hint.' : ''}${/^holiday/.test(key) ? ' Fall and spring hold different holidays, so this compares Rosh Hashana and Sukkot with Purim and Pesach, not the same event twice.' : ''}` };
}

// ---- section 9: one row per secular date, bar left for below normal (slate), right for above (ink)
function SecularRows({ rows }) {
  const vals = rows.filter((r) => r.lift != null).map((r) => r.lift);
  const up = Math.max(0.05, ...vals.map((v) => v - 1)), down = Math.max(0.05, ...vals.map((v) => 1 - v)), zero = (down / (up + down)) * 100;
  const NOTE = { sept_11: 'Falls in week two or three of the fall semester, when everything runs high.', july_4: 'Summer break. Few students are on campus.', new_year: 'Winter break.' };
  const grid = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_6.5rem_minmax(0,13.5rem)] gap-x-6 gap-y-2 items-center';
  return (
    <div>
      <div className={`${grid} hidden md:grid z-small z-muted font-semibold pb-2`}><span>The date</span><span>Events held around it, against their own normal</span><span /><span>Shabbat dinners alone</span></div>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={`${grid} py-4`} style={{ borderTop: '1px solid var(--fog-2)' }}>
            <div className="min-w-0 order-1">
              <p className="font-bold" style={{ fontSize: '1.08rem' }}>{r.label}</p>
              <p className="z-small z-muted">{N(r.n)} events at {plural(r.centers, 'center')}</p>
              {NOTE[r.key] && <p className="z-small z-muted">{NOTE[r.key]}</p>}
            </div>
            <div className="order-3 md:order-2 col-span-2 md:col-span-1 relative" style={{ height: 16 }} {...tip([r.label, r.lift == null ? 'Too few scored events to say' : `${words(r.lift).replace(/^./, (ch) => ch.toUpperCase())}`, `${N(r.n)} events at ${plural(r.centers, 'center')}`])}>
              {r.lift != null && <span className="absolute" style={{ top: 1, height: 14, left: r.lift >= 1 ? `${zero}%` : `${zero - ((1 - r.lift) / (up + down)) * 100}%`, width: `max(2px, ${(Math.abs(r.lift - 1) / (up + down)) * 100}%)`, background: r.lift >= 1 ? 'var(--ink)' : 'var(--cool)', borderRadius: r.lift >= 1 ? '0 4px 4px 0' : '4px 0 0 4px' }} />}
              <span aria-hidden="true" className="absolute" style={{ left: `${zero}%`, top: -6, bottom: -6, width: 1, background: 'var(--ink)', opacity: 0.55 }} />
            </div>
            <div className="order-2 md:order-3 text-right">{r.lift == null ? <span className="z-small z-muted whitespace-nowrap">Too few scored</span> : <span className="z-num" style={{ fontSize: '1.2rem', color: r.lift < 1 ? 'var(--cool-ink)' : 'var(--ink)' }}>{liftShort(r.lift)}</span>}</div>
            <div className="order-4 col-span-2 md:col-span-1 z-small">
              <span className="md:hidden z-muted">Shabbat dinners alone: </span>
              {r.dinner_lift == null ? <span className="z-muted">too few scored dinners ({r.dinner_n})</span> : <><span className="font-bold" style={{ color: r.dinner_lift < 1 ? 'var(--cool-ink)' : 'var(--ink)' }}>{liftShort(r.dinner_lift)}</span><span className="z-muted"> on {plural(r.dinner_n, 'scored dinner')}</span></>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const H3 = ({ children }) => <h3 className="font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, fontSize: '1rem', lineHeight: 1.3 }}>{children}</h3>;

export default function Timing() {
  const { data, error } = useData('timing.json');
  const [params, setParams] = useSearchParams();
  if (error) return <ErrorNote error={error} what="The timing page" />;
  if (!data) return <Loading rows={3} h={200} />;
  const [T] = data;
  const O = T.overall;
  const typeKeys = Object.keys(T.types).sort((a, b) => T.types[b].n - T.types[a].n);
  const key = T.types[params.get('type')] ? params.get('type') : 'all';
  const isAll = key === 'all';
  const fixed = !isAll && !O.free_types.includes(key);
  const S = isAll
    ? { label: 'All free-choice events', n: O.n_free, scored: O.scored_free, grid: O.free_grid, best: O.best, worst: O.worst, common: O.common, weekday: O.weekday, hour: O.hour, month: O.month, fall_spring: O.fall_spring, weeks: O.weeks }
    : T.types[key];
  const mode = ['count', 'all'].includes(params.get('view')) ? params.get('view') : 'lift';
  const put = (f) => { const p = new URLSearchParams(params); f(p); setParams(p, { replace: true, preventScrollReset: true }); };
  const pick = (k) => put((p) => { if (k === 'all') p.delete('type'); else { p.set('type', k); if (p.get('view') === 'all') p.set('view', 'count'); } });
  const setMode = (v) => put((p) => { if (v === 'lift') p.delete('view'); else p.set('view', v); });
  const typeLabel = (t) => T.types[t]?.label || t.replace(/_/g, ' ');
  const what = isAll ? 'free-choice events' : `events of this kind`;

  // which single type fills most of a slot in the overall view, if one does
  const mixOf = isAll ? (c, scored) => {
    let top = null;
    O.free_types.forEach((t) => { const g = T.types[t]?.grid.find((x) => x.wd === c.wd && x.hour === c.hour); const v = g ? (scored ? g.scored : g.n) : 0; if (v && (!top || v > top.v)) top = { t, v }; });
    const of = scored ? c.scored : c.n;
    return top && of && top.v / of >= 0.6 ? `${typeLabel(top.t)}: ${Math.round((top.v / of) * 100)}% of the ${scored ? 'scored ' : ''}events here` : null;
  } : null;

  const bestKeys = new Set(S.best.map((c) => c.wd * 100 + c.hour));
  const worst = S.worst.filter((c) => c.lift < 1 && !bestKeys.has(c.wd * 100 + c.hour));
  const nOk = S.grid.filter((c) => c.ok && c.lift != null).length;
  const need = `A slot needs ${T.min_scored} scored events from ${T.min_centers} centers before it counts.`;

  // weekday and hour bars
  const wdRows = S.weekday.map((r) => ({ ...r, label: DAY3[r.key], long: DAYS[r.key], cap: compact(r.n), tip: barTip(DAYS[r.key], r) }));
  const hrSrc = S.hour.filter((r) => r.lift != null || r.n >= Math.max(2, S.n * 0.004));
  const hLo = hrSrc.length ? Math.min(...hrSrc.map((r) => r.key)) : 0, hHi = hrSrc.length ? Math.max(...hrSrc.map((r) => r.key)) : -1, hrRows = [];
  for (let h = hLo; h <= hHi; h++) { const r = S.hour.find((q) => q.key === h) || { key: h, n: 0, scored: 0, lift: null, ok: false }; hrRows.push({ ...r, label: hourA(h), long: hourLong(h), cap: compact(r.n), tip: barTip(hourLong(h), r) }); }
  const wB = bestOf(wdRows), wW = worstOf(wdRows), hrB = bestOf(hrRows), hrW = worstOf(hrRows);
  const scoredDays = S.weekday.filter((r) => r.lift != null && r.scored >= T.min_scored);
  const sumScored = scoredDays.reduce((a, r) => a + r.scored, 0);
  const avg = sumScored >= 100 ? Math.exp(scoredDays.reduce((a, r) => a + r.scored * Math.log(r.lift), 0) / sumScored) : null;
  const span = (rows, b, w, name) => (b < 0 ? `No ${name} has enough scored events yet.` : b === w ? `Only ${rows[b].long} has enough scored events to read: ${words(rows[b].lift)}.` : `${rows[b].long} does best (${pct(rows[b].lift)}). ${rows[w].long} is lowest (${pct(rows[w].lift)}).`);

  // the semester
  const fs = fallSpring(S.fall_spring, key), fsr = S.fall_spring.spring_vs_fall == null ? null : (100 + Math.round((S.fall_spring.spring_vs_fall - 1) * 100)) / 100;
  const wk = { fall: S.weeks?.fall || [], spring: S.weeks?.spring || [] };
  const wkVals = [...wk.fall, ...wk.spring].filter((r) => r.lift != null).map((r) => r.lift);
  const lo = Math.min(0.8, Math.floor(Math.min(1, ...wkVals) * 10 + 1e-9) / 10), hi = Math.max(1.2, Math.ceil(Math.max(1, ...wkVals) * 10 - 1e-9) / 10);
  const ends = ['fall', 'spring'].map((s) => ({ s, early: runOf(wk[s].slice(0, 4)), late: runOf(wk[s].slice(12, 16)) })).filter((e) => e.early != null && e.late != null);
  const peak = (rows) => rows.filter((r) => r.lift != null).reduce((a, r) => (!a || r.lift > a.lift ? r : a), null);
  let earlyHead, earlyBody;
  if (isAll) {
    const th = O.third, a = th[0], z = th[th.length - 1], top = th.reduce((x, r) => (r.lift != null && (!x || r.lift > x.lift) ? r : x), null), bot = th.reduce((x, r) => (r.lift != null && (!x || r.lift < x.lift) ? r : x), null);
    const d = a.lift != null && z.lift != null ? a.lift - z.lift : null;
    earlyHead = d == null ? 'Not enough data' : d > 0.03 ? 'Early does better' : d < -0.03 ? 'Late does better' : 'Early and late are about even';
    earlyBody = top && bot ? `Events in the ${lower(top.label).replace(' of the semester', '')} of the semester run ${words(top.lift)}. The ${lower(bot.label)} is the weakest stretch, at ${words(bot.lift)}. Each bar is a fifth of the semester, from each center's own first week to its last.` : '';
  } else if (ends.length) {
    const pos = ends.filter((e) => e.early - e.late > 0.03), neg = ends.filter((e) => e.early - e.late < -0.03);
    earlyHead = pos.length && neg.length ? 'It depends on the semester' : pos.length ? `Early does better${pos.length < ends.length ? ` in ${pos[0].s}` : ''}` : neg.length ? `Late does better${neg.length < ends.length ? ` in ${neg[0].s}` : ''}` : 'Early and late are about even';
    earlyBody = ends.map((e) => `In ${e.s}, the first four weeks average ${pct(e.early)} and weeks 13 to 16 average ${pct(e.late)}.`).join(' ') + (ends.length < 2 ? ' The other semester does not have enough scored events per week.' : '');
  } else { earlyHead = 'Not enough data'; earlyBody = 'Too few weeks have the 12 scored events needed to compare the start of the semester with the end.'; }

  // months
  const mNow = new Date().getMonth();
  const mRows = S.month.map((r, i) => ({ ...r, label: MONTHS[i], long: MONTH_LONG[i], tip: barTip(MONTH_LONG[i], r) }));
  const mB = bestOf(mRows), mW = worstOf(mRows), mCur = mRows[mNow];
  const hNow = hebrewMonthNow(), hIdx = T.hebrew_months.findIndex((m) => m.month === hNow);
  const hRows = T.hebrew_months.map((m) => ({ ...m, key: m.month, label: m.month, tip: [m.month, `${N(m.n)} events of every kind at ${plural(m.centers, 'center')}`, m.lift == null ? 'Too few scored free-choice events to say' : `Free-choice events: ${words(m.lift)}`] }));
  const hebB = hRows.reduce((a, r, i) => (r.lift != null && (a < 0 || r.lift > hRows[a].lift) ? i : a), -1);
  const hebW = hRows.reduce((a, r, i) => (r.lift != null && (a < 0 || r.lift < hRows[a].lift) ? i : a), -1);
  const secular = [...T.secular].sort((a, b) => (b.lift ?? -1) - (a.lift ?? -1));
  const sb = T.secular.find((s) => s.key === 'super_bowl'), hw = T.secular.find((s) => s.key === 'halloween');
  const jTop = [...T.jewish].filter((j) => j.lift_all != null).sort((a, b) => b.lift_all - a.lift_all);

  const modes = isAll ? [['lift', 'How it does'], ['count', 'How often'], ['all', 'How often, with Shabbat']] : [['lift', 'How it does'], ['count', 'How often']];
  const m = isAll || mode !== 'all' ? mode : 'count';
  const cells = m === 'all' ? O.all_grid : S.grid;

  return (
    <div>
      <PageHead title="When to hold it" lede={'"How often" counts when centers schedule their events, which shows habit. "How it does" reads each event\'s sign-ups against that same center\'s own normal for that kind of event, which shows whether a day or an hour works.'} />
      <TypePills value={key} onChange={pick} options={[['all', 'All free-choice events'], ...typeKeys.map((t) => [t, T.types[t].label])]} />
      <p className="mt-5 z-muted max-w-[70ch]" style={{ lineHeight: 1.5 }}>
        {isAll
          ? `${N(O.n_free)} events a center chose the time for (classes, socials, food, speakers, trips and the like), ${N(O.scored_free)} of them scored. Shabbat meals, holiday events and services are left out of this view because the calendar picks their day. Pick one above to see it alone.`
          : `${S.label}: ${N(S.n)} events at ${plural(S.centers, 'center')}, ${N(S.scored)} of them scored.${S.median_regs != null ? ` A typical one draws ${N(Math.round(S.median_regs))} ${Math.round(S.median_regs) === 1 ? 'sign-up' : 'sign-ups'}.` : ''}${fixed ? ' The calendar fixes the day for this kind of event, so read the hours here more than the days. For holidays, the weekday only shows where the holiday happened to fall.' : ''}`}
      </p>

      <Section id="ans-h" tight title={isAll ? 'The short answer' : `The short answer for ${lower(S.label)}`} sub={`Best and worst only list slots with enough behind them. ${need}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SlotPanel go kind="best" title="Best reliable slots" sub="Where events most beat their own center's normal" slots={S.best} mixOf={mixOf}
            empty={`There is not enough scored data yet. ${need} No slot for ${lower(S.label)} has that.`} />
          <SlotPanel kind="common" title="Most common slots" sub="Where centers schedule the most, with how it does" slots={S.common} mixOf={mixOf} empty="No events to count." />
          <SlotPanel kind="worst" title="Slots that underperform" sub="Reliable slots that run below normal" slots={worst} mixOf={mixOf}
            empty={nOk === 0 ? 'There is not enough scored data yet to name a weak slot.' : nOk <= S.best.length ? `Only ${plural(nOk, 'slot')} ${nOk === 1 ? 'has' : 'have'} enough scored events, so there is nothing else to compare ${nOk === 1 ? 'it' : 'them'} with.` : 'No reliable slot runs below normal.'} />
        </div>
      </Section>

      <Section id="grid-h" title="Every day and hour" sub={m === 'lift' ? 'Darker blue means events in that slot did better against their own center\'s normal. The usual rise and fall of a semester is already taken out, so a slot is not rewarded for landing in week two.' : m === 'all' ? 'Every event of every kind, Shabbat and holidays included. Friday night and Saturday lunch carry most of the calendar.' : `How many ${what} were held in each slot. This is habit, not a result.`}
        action={<Seg value={m} onChange={setMode} label="What the table shows" options={modes} />}>
        <div className="z-card"><HeatTable cells={cells} mode={m === 'lift' ? 'lift' : 'count'} /></div>
      </Section>

      <Section id="bars-h" title="By day, and by hour" sub={`Each bar rises or falls from the line, which is a typical event of this kind at the same center. The grey number under each label is how many events were held.${avg != null && Math.abs(avg - 1) >= 0.02 ? ` The average across this view sits at ${pct(avg)}, so compare the bars with each other as much as with the line.${avg > 1.08 ? ' Centers that run only a few of these a year are measured against their usual event of any kind, which is part of why this kind sits above the line.' : ''}` : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-4">
          <div className="z-card"><H3>Day of the week</H3><p className="z-small z-muted mt-1 mb-4" style={{ minHeight: '2.4em' }}>{span(wdRows, wB, wW, 'day')}</p><LiftColumns rows={wdRows} highlight={wB} label="Lift by day of the week" /></div>
          <div className="z-card"><H3>Hour of the day</H3><p className="z-small z-muted mt-1 mb-4" style={{ minHeight: '2.4em' }}>{hrRows.length ? span(hrRows, hrB, hrW, 'hour') : 'No hours to show.'}</p>{hrRows.length > 0 && <LiftColumns rows={hrRows} highlight={hrB} minCol={hrRows.length > 9 ? 36 : 0} label="Lift by hour of the day" />}{hrRows.length > 9 && <p className="sm:hidden z-small z-muted mt-3">Swipe sideways for the other hours.</p>}</div>
        </div>
        <p className="z-small z-muted mt-4">Blue marks the best reliable bar. A dotted outline means thin evidence. No bar means too few scored events.</p>
      </Section>

      <Section id="sem-h" title="Fall or spring, early or late" sub="Two different comparisons. Fall against spring uses raw sign-ups at the same center in the same academic year. Early against late uses lift, week by week, counted from each center's own first week.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="z-card">
            <H3>Which semester draws more</H3>
            <p className="z-num mt-4" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)' }}>{fs.head}</p>
            <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>{fs.body}</p>
            {fsr != null && (
              <div className="mt-6 space-y-2.5" role="img" aria-label={`For every 100 sign-ups a fall event draws, a spring event at the same center draws about ${Math.round(fsr * 100)}`}>
                {[['Fall', 1], ['Spring', fsr]].map(([l, v]) => (
                  <div key={l} className="grid grid-cols-[3.6rem_minmax(0,1fr)_2.4rem] gap-3 items-center" {...tip([l, l === 'Fall' ? 'Set to 100 for comparison' : `${Math.round(v * 100)} sign-ups for every 100 in fall, at the same center`, `${N(l === 'Fall' ? S.fall_spring.fall_n : S.fall_spring.spring_n)} events held`])}>
                    <span className="font-semibold z-small">{l}</span>
                    <span style={{ height: 14 }}><span style={{ display: 'block', height: '100%', width: `${(v / Math.max(1, fsr)) * 100}%`, background: v === Math.max(1, fsr) && Math.abs(fsr - 1) >= 0.03 ? 'var(--go)' : 'var(--ink)', borderRadius: '0 4px 4px 0' }} /></span>
                    <span className="z-small font-semibold tabular-nums text-right">{Math.round(v * 100)}</span>
                  </div>
                ))}
                <p className="z-small z-muted pt-1">Sign-ups for a typical event, with fall set to 100.</p>
              </div>
            )}
            <p className="z-small z-muted mt-3">Held in fall: {N(S.fall_spring.fall_n)}. Held in spring: {N(S.fall_spring.spring_n)}.</p>
          </div>
          <div className="z-card">
            <H3>Start of the semester or the end</H3>
            <p className="z-num mt-4" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)' }}>{earlyHead}</p>
            <p className="mt-3 z-muted" style={{ lineHeight: 1.5 }}>{earlyBody}</p>
            {isAll && <div className="mt-5"><LiftColumns height={140} label="Lift by fifth of the semester" highlight={O.third.reduce((a, r, i) => (r.lift != null && (a < 0 || r.lift > O.third[a].lift) ? i : a), -1)}
              rows={O.third.map((r, i) => ({ ...r, key: i, label: ['First fifth', 'Second', 'Middle', 'Fourth', 'Last fifth'][i], long: r.label, cap: compact(r.n), tip: [r.label, r.lift == null ? 'Too few scored events' : `Lift ${pct(r.lift)}: ${words(r.lift)}`, `${plural(r.n, 'scored event')}`] }))} /></div>}
          </div>
        </div>
        <div className="z-card mt-4">
          <H3>Week by week through the semester</H3>
          <p className="z-small z-muted mt-1 max-w-[76ch]" style={{ lineHeight: 1.45 }}>Both charts share one scale. The line at "Normal" is the center's own usual for that kind of event. A gap means that week had fewer than 12 scored events.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mt-5">
            {['fall', 'spring'].map((s) => { const p = peak(wk[s]); return (
              <div key={s} className="min-w-0">
                <p className="font-bold">{s === 'fall' ? 'Fall' : 'Spring'}{p && <span className="z-muted font-semibold">, best in week {p.week}</span>}</p>
                <WeekCurve rows={wk[s]} lo={lo} hi={hi} season={s} />
              </div>); })}
          </div>
        </div>
      </Section>

      <Section id="month-h" title="Month of the year" sub={`${isAll ? 'Free-choice events' : S.label}, by civil month. The top row is how events did, with the semester's own shape taken out, so it shows what is left once "early in the semester" is accounted for. The bottom row is how many were held.`}>
        <div className="z-card">
          <p className="mb-2" style={{ lineHeight: 1.45 }}>
            <span className="font-bold">{MONTH_LONG[mNow]}, the current month: </span>
            <span className="z-muted">{mCur.lift == null ? 'too few scored events to say' : `${words(mCur.lift)}${mCur.ok ? '' : ' on thin evidence'}`}, {N(mCur.n)} events held.{mB >= 0 && mW >= 0 && mB !== mW ? ` ${mRows[mB].long} is the best month (${pct(mRows[mB].lift)}) and ${mRows[mW].long} the weakest (${pct(mRows[mW].lift)}).` : ''}</span>
          </p>
          <MonthPair rows={mRows} labels={MONTHS} short={MONTHS.map((x) => x[0])} highlight={mNow} name="Lift by month" liftTitle="How events did" countTip={(i) => [MONTH_LONG[i], `${N(mRows[i].n)} events at ${plural(mRows[i].centers, 'center')}`, `${N(mRows[i].scored)} scored`]} />
        </div>
      </Section>

      <Section id="jew-h" title="The Jewish calendar" sub="From here down the page covers every kind of event, whatever is selected above. Each holiday counts the events held during it and the events about it. The number on the right compares them with everything else the same center runs.">
        <ul>
          {T.jewish.map((j) => (
            <li key={j.key} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto] gap-x-6 gap-y-2.5 items-center py-4" style={{ borderTop: '1px solid var(--fog-2)' }}>
              <div className="min-w-0 order-1">
                <p className="font-bold" style={{ fontSize: '1.08rem' }}>{j.label}</p>
                <p className="z-small z-muted">{N(j.n)} events at {plural(j.centers, 'center')}, {j.per_center_year} per center a year</p>
              </div>
              <div className="order-3 md:order-2 col-span-2 md:col-span-1 flex flex-wrap gap-1.5">
                {j.types.filter((t) => t.n / j.n >= 0.05).slice(0, 4).map((t) => <span key={t.type} className="z-pill" title={`${N(t.n)} of ${N(j.n)} events`}>{typeLabel(t.type)}<span className="z-muted font-semibold">{Math.round((t.n / j.n) * 100)}%</span></span>)}
              </div>
              <div className="order-2 md:order-3 text-right">{j.lift_all == null ? <span className="z-small z-muted">Too few scored</span> : <Lift value={j.lift_all} />}</div>
            </li>
          ))}
        </ul>
        {jTop.length > 1 && <p className="z-small z-muted mt-4 max-w-[76ch]" style={{ lineHeight: 1.45 }}>{jTop[0].label} events draw the most against a center's usual event ({pct(jTop[0].lift_all)}), {jTop[jTop.length - 1].label} the least ({pct(jTop[jTop.length - 1].lift_all)}). A holiday needs 20 scored events to get a number. Shabbat dinners and classes show up under a holiday when they fall inside it.</p>}
        <div className="z-card mt-8">
          <H3>Hebrew months</H3>
          <p className="z-small z-muted mt-1 max-w-[76ch]" style={{ lineHeight: 1.45 }}>
            The top row is how free-choice events did in each month, against their own normal. The bottom row counts events of every kind.
            {hebB >= 0 && hebW >= 0 ? ` ${hRows[hebB].month} runs highest (${pct(hRows[hebB].lift)}) and ${hRows[hebW].month} lowest (${pct(hRows[hebW].lift)}).` : ''} Elul and Av open the fall semester and Tammuz is summer, so part of this is the academic year showing through.
          </p>
          <MonthPair rows={hRows} labels={hRows.map((r) => r.month)} highlight={hIdx} name="Lift by Hebrew month" liftTitle="How free-choice events did" countTip={(i) => hRows[i].tip} />
          {hIdx >= 0 && <p className="z-small z-muted mt-3">Blue marks the current month, {hRows[hIdx].month}.</p>}
        </div>
      </Section>

      <Section id="sec-h" title="Secular holidays and moments" sub={`Free-choice events and Shabbat dinners held in the few days around each date, sorted from best to worst.${sb?.lift != null ? ` Super Bowl weekend ${sb.lift >= 0.97 ? 'does not hurt' : 'costs a little'}: events run ${words(sb.lift)}${sb.dinner_lift != null ? `, and Shabbat dinners alone ${pct(sb.dinner_lift)}` : ''}.` : ''}${hw?.lift != null ? ` Halloween ${hw.lift > 1.03 ? 'helps' : 'does not help'}: ${words(hw.lift)}.` : ''} These numbers keep the semester's shape in, so a date early in the semester starts ahead.`}>
        <SecularRows rows={secular} />
      </Section>

      <Section id="how-h" title="How to read this page" tight>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="z-card"><H3>Lift is against their own normal</H3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>Every event is compared with its own center's median for the same kind of event in the year around it. +10% means events in that slot drew 10% more than those centers usually draw. Big and small centers count the same.</p></div>
          <div className="z-card"><H3>{T.min_scored} scored events from {T.min_centers} centers</H3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>A slot only counts as reliable with that much behind it. Anything thinner is drawn with a dotted outline and left out of the best and worst lists. Events with no sign-ups are counted as held but never scored.</p></div>
          <div className="z-card"><H3>Sign-ups are not attendance</H3><p className="mt-2.5 z-muted" style={{ lineHeight: 1.5 }}>These are sign-ups on each center's public page. Walk-ins are not counted, and many centers do not take sign-ups for every event. A slot that looks weak here may still fill a room.</p></div>
        </div>
      </Section>
    </div>
  );
}

