// Data layer. The engine writes blobs; the app reads them once and keeps them. Nothing here computes anything
// the engine already computed, except the vector search, which runs in the browser (see search.js).
import { useEffect, useState } from 'react';

const cache = new Map();
export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`/data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name} did not load (${r.status})`);
      return name.endsWith('.bin') ? r.arrayBuffer() : r.json();
    }).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name);
}

const DAY = 86400e3;
let catP = null;
// The catalog arrives as columns. This wraps it with lookups and a row view.
export function catalog() {
  if (!catP) {
    catP = load('catalog.json').then((c) => {
      const P = c.programs, epoch = Date.parse(c.epoch + 'T12:00:00Z');
      c.date = (d) => new Date(epoch + d * DAY);
      c.dayOf = (date) => Math.round((date.getTime() - epoch) / DAY);
      c.img = (p) => (p ? (p.startsWith('http') ? p : c.img_prefix + p) : null);
      c.centerById = new Map(c.centers.map((x, i) => [x.id, { ...x, idx: i }]));
      c.centers.forEach((x, i) => { x.idx = i; });
      c.byKey = new Map(P.key.map((k, i) => [k, i]));
      c.prog = (i) => (i == null || i < 0 || i >= c.count ? null : {
        i, key: P.key[i], name: P.name[i], center: c.centers[P.c[i]], type: c.type_keys[P.t[i]], typeLabel: c.types[c.type_keys[P.t[i]]],
        hol: P.hol[i], aud: P.aud[i] || [], n: P.n[i], up: P.up[i], first: c.date(P.first[i]), last: c.date(P.last[i]), firstDay: P.first[i], lastDay: P.last[i],
        reg: P.reg[i], max: P.mx[i], adj: P.adj[i] == null ? null : P.adj[i] / 100, scored: P.ns[i], img: c.img(P.img[i]), idea: P.idea[i], themes: P.th[i] || [],
        wd: P.wd[i], hour: P.hr[i], collab: !!(P.fl[i] & 1), offsite: !!(P.fl[i] & 2), recurring: !!(P.fl[i] & 4),
      });
      c.programsOfCenter = (idx) => { const out = []; for (let i = 0; i < c.count; i++) if (P.c[i] === idx) out.push(i); return out; };
      return c;
    }).catch((e) => { catP = null; throw e; });
  }
  return catP;
}

// useData('home.json', 'catalog') -> { data: [home, catalog], error, loading }
export function useData(...names) {
  const key = names.join('|');
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all(names.map((n) => (n === 'catalog' ? catalog() : load(n))))
      .then((data) => { if (live) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (live) setState({ data: null, error, loading: false }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// "My center" is remembered in the browser. It is optional everywhere.
const KEY = 'cp.center';
const listeners = new Set();
export function getMyCenter() { try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch (_) { return null; } }
export function setMyCenter(id) { try { if (id) localStorage.setItem(KEY, String(id)); else localStorage.removeItem(KEY); } catch (_) { /* private mode */ } listeners.forEach((f) => f(id || null)); }
export function useMyCenter() {
  const [id, setId] = useState(getMyCenter());
  useEffect(() => { listeners.add(setId); return () => listeners.delete(setId); }, []);
  return [id, setMyCenter];
}

// ---- words and numbers
export const plural = (n, one, many) => `${Number(n).toLocaleString()} ${n === 1 ? one : many || one + 's'}`;
export const fmtDate = (d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => (d ? new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', opts) : '');
export const fmtDay = (d) => fmtDate(d, { month: 'short', day: 'numeric' });
export const fmtWeekday = (d) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' });
export const hourLabel = (h) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 1.34 -> "34% above normal". The yardstick is always the center's own normal.
export const liftPct = (x) => (x == null ? null : Math.round((x - 1) * 100));
export const liftShort = (x) => { if (x == null) return 'n/a'; if (x >= 3) return `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`; const p = liftPct(x); return p === 0 ? 'Normal' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`; };
export const liftWords = (x, who = 'their') => { if (x == null) return 'not enough sign-up data'; if (x >= 3) return `${x >= 10 ? Math.round(x) : x.toFixed(1)} times ${who} normal`; const p = liftPct(x); return Math.abs(p) < 4 ? `about ${who} normal` : `${Math.abs(p)}% ${p > 0 ? 'above' : 'below'} ${who} normal`; };
export const share = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const STATUS = {
  new: { label: 'New', bg: 'var(--heat)', fg: '#fff', note: 'First seen in the last 18 months' },
  rising: { label: 'Rising', bg: 'var(--heat-tint)', fg: 'var(--heat-ink)', note: 'More centers are running it than a year ago' },
  evergreen: { label: 'Every year', bg: 'var(--ink)', fg: '#fff', note: 'Run by many centers, year after year' },
  steady: { label: 'Steady', bg: '#fff', fg: 'var(--ink)', note: 'About as common as it was' },
  fading: { label: 'Fading', bg: 'var(--cool-tint)', fg: 'var(--cool-ink)', note: 'Fewer centers are running it than a year ago' },
  seasonal: { label: 'Holiday', bg: '#fff', fg: 'var(--ink)', note: 'Tied to a Jewish holiday, so no trend is read from year to year' },
};
export const CONF = { strong: 'Solid evidence', some: 'Some evidence', thin: 'Thin evidence' };
export const centerLabel = (c) => (c ? c.short || c.campus || c.name : '');
