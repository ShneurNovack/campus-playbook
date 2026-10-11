import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS, CONF, liftShort, liftPct, centerLabel, fmtDate, plural } from '../lib/data';

export function PageHead({ title, lede, action, children }) {
  return (
    <div className="pt-10 sm:pt-16 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0"><h1 className="z-h1">{title}</h1>{lede && <p className="z-lede mt-5">{lede}</p>}{children}</div>
      {action}
    </div>
  );
}

export function Section({ title, sub, action, children, id, className = '', tight }) {
  return (
    <section className={`${tight ? 'mt-12 sm:mt-16' : 'mt-20 sm:mt-28'} ${className}`} aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-6">
        <div><h2 id={id} className="z-h2">{title}</h2>{sub && <p className="mt-2 z-muted max-w-[64ch]" style={{ lineHeight: 1.45 }}>{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ children }) => <p className="z-card z-muted" style={{ lineHeight: 1.5 }}>{children}</p>;
export const ErrorNote = ({ error, what = 'This page' }) => (error ? <p className="mt-6 z-note" style={{ background: '#FDECEA', color: 'var(--bad)' }} role="alert">{what} did not load: {error.message}. Reload to try again.</p> : null);
export const Loading = ({ rows = 3, h = 120 }) => <div className="space-y-4 mt-10" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="z-skel" style={{ height: h }} />)}</div>;

export function Seg({ value, onChange, options, label, white, small }) {
  return (
    <div className="max-w-full overflow-x-auto z-scroll">
      <div className="z-seg" role="group" aria-label={label} style={white ? { background: '#fff' } : undefined}>
        {options.map(([k, l]) => <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(k)} style={small ? { height: '1.9rem', padding: '0 0.8rem', fontSize: '0.84rem' } : undefined}>{l}</button>)}
      </div>
    </div>
  );
}

export function StatusPill({ status, onFog }) {
  const s = STATUS[status];
  if (!s) return null;
  const bg = s.bg === '#fff' && !onFog ? 'var(--fog)' : s.bg;
  return <span className="z-pill" style={{ background: bg, color: s.fg }} title={s.note}>{s.label}</span>;
}

// How an event or an idea did against the center's own normal. The number stays in ink; the dot carries the color.
export function Lift({ value, size = 'md', showDot = true }) {
  if (value == null) return <span className="z-muted z-small">No sign-up data</span>;
  const p = liftPct(value);
  const color = p >= 12 ? 'var(--go)' : p <= -12 ? 'var(--cool)' : 'var(--mist)';
  const fs = size === 'lg' ? '2.4rem' : size === 'sm' ? '0.95rem' : '1.25rem';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${p > 0 ? p + '% above' : p < 0 ? Math.abs(p) + '% below' : 'equal to'} the center's own normal`}>
      {showDot && <span aria-hidden="true" style={{ width: size === 'lg' ? 14 : 10, height: size === 'lg' ? 14 : 10, borderRadius: 99, background: color, flex: 'none' }} />}
      <span className="z-num" style={{ fontSize: fs }}>{liftShort(value)}</span>
    </span>
  );
}

export function Meter({ value, max = 1, color = 'var(--ink)', track = 'var(--fog-2)', height = 10 }) {
  return <div style={{ background: track, borderRadius: 999, height, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, Math.min(100, Math.round(((value || 0) / max) * 100)))}%`, background: color, height: '100%', borderRadius: 999, transition: 'width 0.5s ease' }} /></div>;
}

export function Stat({ value, label, sub, onDark }) {
  return (
    <div className="min-w-0">
      <div className="z-num" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.7rem)' }}>{value}</div>
      <div className="mt-1.5 font-semibold" style={{ lineHeight: 1.25 }}>{label}</div>
      {sub && <div className="z-small mt-0.5" style={{ color: onDark ? 'rgba(255,255,255,0.8)' : 'var(--grey)' }}>{sub}</div>}
    </div>
  );
}

// Hover tooltip shared by the charts. Follows the pointer; content is plain text lines.
let tipEl = null;
export function showTip(e, lines) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'z-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
  tipEl.innerHTML = '';
  (Array.isArray(lines) ? lines : [lines]).forEach((l, i) => { const d = document.createElement('div'); d.textContent = l; if (i === 0) d.style.fontWeight = '700'; tipEl.appendChild(d); });
  tipEl.style.display = 'block';
  const x = Math.min(window.innerWidth - tipEl.offsetWidth - 12, e.clientX + 14), y = Math.max(8, e.clientY - tipEl.offsetHeight - 12);
  tipEl.style.left = `${Math.max(8, x)}px`; tipEl.style.top = `${y}px`;
}
export function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
export const tip = (lines) => ({ onMouseMove: (e) => showTip(e, lines), onMouseLeave: hideTip, onFocus: (e) => { const r = e.currentTarget.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top }, lines); }, onBlur: hideTip });

// Columns for a single series (months, weekdays, weeks). One color; an optional highlight set in blue.
export function Columns({ values, labels, height = 120, highlight = [], format = (v) => v, tipFor, color = 'var(--ink)', dim, max }) {
  const mx = max || Math.max(1, ...values.map((v) => v || 0));
  return (
    <div className="flex items-end gap-[3px]" style={{ height: height + 22 }} role="img" aria-label={labels.map((l, i) => `${l}: ${format(values[i])}`).join(', ')}>
      {values.map((v, i) => {
        const h = v ? Math.max(3, Math.round(((v || 0) / mx) * height)) : 0, hi = highlight.includes(i);
        return (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" {...tip(tipFor ? tipFor(i) : [labels[i], String(format(v))])} tabIndex={0}>
            <div style={{ width: '100%', maxWidth: 24, height: h, background: hi ? 'var(--go)' : dim && dim(i) ? 'var(--mist)' : color, borderRadius: '4px 4px 0 0' }} />
            <div className="z-small z-muted mt-1 truncate w-full text-center" style={{ fontSize: '0.72rem', height: 16, color: hi ? 'var(--ink)' : undefined, fontWeight: hi ? 700 : 400 }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bars for a ranked list, value at the tip.
export function HBars({ rows, max, format = (v) => v, color = 'var(--ink)' }) {
  const mx = max || Math.max(1e-9, ...rows.map((r) => r.value || 0));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key || r.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] gap-3 items-center" {...tip(r.tip || [r.label, String(format(r.value))])}>
          <span className="truncate font-semibold z-small">{r.to ? <Link to={r.to} className="hover:underline">{r.label}</Link> : r.label}</span>
          <span style={{ height: 14 }}><span style={{ display: 'block', width: `${Math.max(1.5, ((r.value || 0) / mx) * 100)}%`, height: '100%', background: r.color || color, borderRadius: '0 4px 4px 0' }} /></span>
          <span className="z-small font-semibold tabular-nums">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Flyer({ src, alt = '', wide, className = '', style }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <div className={`z-flyer ${wide ? 'z-flyer-wide' : ''} ${className}`} style={style} aria-hidden="true" />;
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOk(false)} className={`z-flyer ${wide ? 'z-flyer-wide' : ''} ${className}`} style={style} />;
}

// One program as a flyer card. `p` is a catalog row view (cat.prog(i)).
export function ProgramCard({ p, note, wide, hideCenter }) {
  if (!p) return null;
  return (
    <Link to={`/program/${p.key}`} className="block group min-w-0">
      <Flyer src={p.img} alt={`Flyer for ${p.name}`} wide={wide} />
      <div className="mt-2.5 min-w-0">
        <p className="font-bold z-clamp2 group-hover:underline decoration-2 underline-offset-2" style={{ lineHeight: 1.22 }}>{p.name}</p>
        {!hideCenter && <p className="z-small z-muted truncate mt-0.5">{centerLabel(p.center)}</p>}
        <p className="z-small mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {p.adj != null && <Lift value={p.adj} size="sm" />}
          {p.reg != null && <span className="z-muted">{Math.round(p.reg)} sign-ups{p.n > 1 ? ' typical' : ''}</span>}
          {note && <span className="z-muted">{note}</span>}
        </p>
      </div>
    </Link>
  );
}

export function FlyerGrid({ children, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' }) {
  return <div className={`grid ${cols} gap-x-4 gap-y-7`}>{children}</div>;
}

export const CenterLink = ({ c, className = '' }) => (c ? <Link to={`/center/${c.id}`} className={`hover:underline ${className}`}>{centerLabel(c)}</Link> : null);

export function Evidence({ n, centers, conf }) {
  return <span className="z-small z-muted">{conf ? `${CONF[conf]}: ` : ''}{plural(n, 'scored event')} at {plural(centers, 'center')}</span>;
}

// A panel that stays in the fog-card look but lays out a headline number and a line of evidence.
export function Finding({ title, value, children, go }) {
  return (
    <div className="z-card" style={go ? { background: 'var(--go)', color: '#fff' } : undefined}>
      <p className="font-semibold" style={{ opacity: go ? 0.9 : 1 }}>{title}</p>
      <p className="z-num mt-3" style={{ fontSize: 'clamp(2rem, 3.6vw, 2.9rem)' }}>{value}</p>
      {children && <div className="mt-3" style={{ lineHeight: 1.45, color: go ? 'rgba(255,255,255,0.9)' : 'var(--grey)' }}>{children}</div>}
    </div>
  );
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function More({ children, count, label = 'Show all' }) {
  const [open, setOpen] = useState(false);
  return open ? children(true) : <>{children(false)}{count > 0 && <button type="button" className="z-btn z-btn-soft z-btn-sm mt-6" onClick={() => setOpen(true)}>{label} {count}</button>}</>;
}

export const Dot = ({ color = 'var(--ink)', size = 10 }) => <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: 99, background: color, flex: 'none' }} />;
export { fmtDate };
