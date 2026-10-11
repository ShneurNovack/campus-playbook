// Search in the browser, in two parts that are blended, and the neighbor estimate that runs on the result.
// 1. Meaning. The engine publishes one 256-dimension int8 vector per program (vectors.bin). A typed idea is
//    embedded by the Worker (bge-m3, projected into the same space) and compared here with every program:
//    about 3.4 million multiplications, a few milliseconds.
// 2. Wording. A character n-gram match on program names, built here when the index loads. Vectors alone put
//    "Coffee & Kabbalah" below general "class" events for the typed idea "kabbalah class"; the shared letters
//    bring it back. In the engine's test of 50 typed ideas, vectors alone scored 0.77 (nDCG at 20) and vectors
//    plus a wording match on name and blurb 0.83. On names alone, as here, the same test gives 0.82.
import { load, catalog } from './data';

// score = (cosine + LAM x wording) / (1 + LAM)
export const LAM = 0.4;
// Plain cosine of a typed idea against a program: an exact name scores 0.9 and up, nonsense tops out near 0.33.
export const CLOSE = 0.60, RELATED = 0.45;
// A search result counts as a match when its meaning is related, or when the wording carries it over the line.
export const MATCH = 0.36;
export const blend = (sim, wording) => (sim + LAM * wording) / (1 + LAM);
// How strong a match is, for deciding what counts as close or related and for weighing votes. Vectors alone score a
// typed idea low against a longer name that contains it ("mental health panel" against "Mental Health Shabbat"), so
// a strong wording match (half the typed words' n-grams or more) adds to the cosine. A weak one adds nothing, which
// keeps "pickleball" from calling "Pickle Making" close.
export const strength = (sim, wording) => Math.min(1, sim + (wording >= 0.5 ? LAM * wording : 0));
export const isMatch = (sim, wording) => sim >= RELATED || blend(sim, wording) >= MATCH;

let ready = null;
export function searchIndex() {
  if (!ready) {
    ready = Promise.all([load('vectors.bin'), catalog()]).then(([buf, cat]) => {
      const dims = cat.dims, M = new Int8Array(buf), n = M.length / dims;
      const norm = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0; const o = i * dims; for (let j = 0; j < dims; j++) s += M[o + j] * M[o + j]; norm[i] = Math.sqrt(s) || 1; }
      return { M, n, dims, norm, cat, lex: wordingIndex(cat.programs.name) };
    }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ---------------------------------------------------------------- wording
// Character n-grams inside words: lowercased, punctuation to spaces, each word padded with a space, n = 3, 4, 5.
// " bbq " gives " bb", "bbq", "bq ", " bbq", "bbq ", " bbq ". Calls `add` once per n-gram, repeats included.
// A word of four letters or more is also added whole, at WHOLE times the weight of an n-gram, so that the typed
// "kabbalah" prefers "Coffee & Kabbalah" to "Kabbalat Shabbat" (which shares every n-gram but the last).
// On the engine's 50 test ideas the whole words change nothing overall (nDCG at 20: 0.813 without, 0.815 with).
const NGRAM = [3, 4, 5], MAX_DF = 0.3, MIN_DF = 2, WHOLE = 2;
function grams(text, add) {
  const words = (text || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ');
  for (const w of words) {
    if (!w) continue;
    const p = ` ${w} `;
    for (const k of NGRAM) for (let a = 0; a + k <= p.length; a++) add(p.slice(a, a + k));
    if (WHOLE && p.length > 5) add(p);
  }
}
const count = (text) => { const m = new Map(); grams(text, (g) => m.set(g, (m.get(g) || 0) + 1)); return m; };

// TF-IDF with sublinear tf, kept as an inverted index: n-gram -> { ids (program indexes), tf (only when some
// program repeats the n-gram), idf }. N-grams in more than 30% of names, or in only one, are dropped.
// 13,424 names give about 17,000 n-grams and 650,000 postings: 1.3 MB in typed arrays, built in under half a second.
export function wordingIndex(names) {
  const n = names.length, df = new Map();
  const per = names.map((nm) => { const m = count(nm); for (const g of m.keys()) df.set(g, (df.get(g) || 0) + 1); return m; });
  const Ids = n < 65536 ? Uint16Array : Uint32Array, post = new Map();
  for (const [g, d] of df) if (d >= MIN_DF && d <= MAX_DF * n) post.set(g, { ids: new Ids(d), tf: null, idf: (Math.log((1 + n) / (1 + d)) + 1) * (g.length > 5 ? WHOLE : 1), k: 0 });
  const len = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const [g, tf] of per[i]) {
      const e = post.get(g);
      if (!e) continue;
      if (tf > 1) { if (!e.tf) e.tf = new Uint8Array(e.ids.length).fill(1); e.tf[e.k] = Math.min(255, tf); }
      e.ids[e.k++] = i;
      const w = (1 + Math.log(tf)) * e.idf; s += w * w;
    }
    len[i] = Math.sqrt(s) || 1;
  }
  return { n, post, len };
}

// Cosine (0 to 1) between the n-grams of a typed text and those of every program name.
export function wordingMatch(ix, text) {
  const { n, post, len } = ix.lex, out = new Float32Array(n);
  let qs = 0;
  for (const [g, tf] of count(text)) {
    const e = post.get(g);
    if (!e) continue;
    const w = (1 + Math.log(tf)) * e.idf, { ids, tf: tfs } = e;
    qs += w * w;
    if (tfs) for (let k = 0; k < ids.length; k++) out[ids[k]] += w * (1 + Math.log(tfs[k])) * e.idf;
    else { const wd = w * e.idf; for (let k = 0; k < ids.length; k++) out[ids[k]] += wd; }
  }
  if (!qs) return out;
  qs = Math.sqrt(qs);
  for (let i = 0; i < n; i++) if (out[i]) out[i] = Math.min(1, out[i] / (qs * len[i]));
  return out;
}
export const wordMatch = wordingMatch;   // the older name

// ---------------------------------------------------------------- meaning
const memo = new Map();
export async function embed(text) {
  const key = text.trim().toLowerCase();
  if (memo.has(key)) return memo.get(key);
  const res = await fetch('/api/embed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.trim() }) });
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many searches at once. Wait a moment and try again.' : `The search service did not answer (${res.status})`);
  const { v } = await res.json();
  const bin = atob(v), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const vec = new Float32Array(bytes.buffer);
  memo.set(key, vec);
  return vec;
}

// cosine of the query against every program
export function scoreAll(ix, q) {
  const { M, n, dims, norm } = ix, out = new Float32Array(n);
  let ql = 0; for (let j = 0; j < dims; j++) ql += q[j] * q[j];
  ql = Math.sqrt(ql) || 1;
  for (let i = 0; i < n; i++) { let s = 0; const o = i * dims; for (let j = 0; j < dims; j++) s += M[o + j] * q[j]; out[i] = s / (norm[i] * ql); }
  return out;
}
export const scoreText = scoreAll;   // a typed query needs no correction in this space

export function vectorOf(ix, i) {
  const { M, dims, norm } = ix, v = new Float32Array(dims), o = i * dims;
  for (let j = 0; j < dims; j++) v[j] = M[o + j] / norm[i];
  return v;
}

// Search by text. Returns { hits: [{ i, sim, wording, score }] best first, sims, words, ix }. `sim` is the plain
// cosine; `score` is the blend with the wording match. Pass lexical: 0 for meaning alone.
export async function searchText(text, { limit = 60, filter = null, lexical = LAM } = {}) {
  const [ix, q] = await Promise.all([searchIndex(), embed(text)]);
  const sims = scoreAll(ix, q), words = lexical ? wordingMatch(ix, text) : null;
  return rank(ix, sims, words, lexical, limit, filter);
}

export async function searchLike(i, { limit = 30, filter = null } = {}) {
  const ix = await searchIndex();
  const sims = scoreAll(ix, vectorOf(ix, i));
  sims[i] = -1;
  return rank(ix, sims, null, 0, limit, filter);
}

function rank(ix, sims, words, lam, limit, filter) {
  const idx = [];
  for (let i = 0; i < ix.n; i++) if (!filter || filter(i)) idx.push(i);
  const score = (i) => (words ? (sims[i] + lam * words[i]) / (1 + lam) : sims[i]);
  idx.sort((a, b) => score(b) - score(a));
  return { hits: idx.slice(0, limit).map((i) => ({ i, sim: sims[i], wording: words ? words[i] : 0, score: score(i) })), sims, words, ix };
}

// ---------------------------------------------------------------- the neighbor estimate
// engine/neighbors.py, run in the browser for an event that is not in the catalog (a typed idea):
//   weight(past program j) = cosine(idea, j)^4 x sqrt(runs_j / (runs_j + 1)) x center weight
//   center weight          = 8 when j was run by the asking center, else how alike the two centers are (0 to 1);
//                            1 for everyone when no center is asking
//   predicted place        = weighted average of where the 100 heaviest programs landed among their own
//                            center's events (a percentile, 0 to 1)
//   range                  = the weighted 25th and 75th percentile of those same 100
// The constants come from centers.json `method`. Only programs with a measured place can vote.
const UNKNOWN_LIKENESS = Math.exp(-(1.5 ** 2) / 2);   // a center the likeness matrix does not know
let votersMemo = null;
function voters(ix) {
  if (votersMemo && votersMemo.ix === ix) return votersMemo.list;
  const { cat } = ix, P = cat.programs, ok = cat.type_keys.map((k) => cat.event_types.includes(k)), list = [];
  for (let i = 0; i < ix.n; i++) if (P.pc[i] != null && P.nl[i] >= 1 && ok[P.t[i]]) list.push(i);
  votersMemo = { ix, list: Int32Array.from(list) };
  return votersMemo.list;
}

// How alike the asking center is to every center, indexed like cat.centers. Null when no center is asking.
export function likeness(ix, cen, my) {
  const me = my == null ? null : ix.cat.centerById.get(my);
  if (!me) return null;
  const pos = new Map(cen.sim.ids.map((id, k) => [id, k])), row = cen.sim.rows[pos.get(my)];
  return Float32Array.from(ix.cat.centers, (c) => (c.id === my ? 1 : row && pos.has(c.id) ? row[pos.get(c.id)] / 100 : UNKNOWN_LIKENESS));
}

// cosines: one per program (the plain cosine, not the blend). Returns { pct, lo, hi, eff, n, used }:
// eff = how many programs carry real weight, (sum w)^2 / sum(w^2); n = voters related to the idea (cosine of
// RELATED or more); used = the programs that voted, heaviest first, as [index, weight].
export function predict(ix, cen, cosines, my = null) {
  const P = ix.cat.programs, { power = 4, k = 100, own = 8 } = cen.method || {};
  const like = likeness(ix, cen, my), mine = like ? ix.cat.centerById.get(my).idx : -1, list = voters(ix);
  const w = new Float64Array(list.length), order = [];
  let n = 0;
  for (let a = 0; a < list.length; a++) {
    const i = list[a], c = cosines[i];
    if (c >= RELATED) n++;
    if (!(c > 0)) continue;
    w[a] = c ** power * Math.sqrt(P.nl[i] / (P.nl[i] + 1)) * (like ? (P.c[i] === mine ? own : like[P.c[i]]) : 1);
    if (w[a] > 0) order.push(a);
  }
  order.sort((a, b) => w[b] - w[a]);
  const top = order.slice(0, Math.min(k, list.length - 1));
  let sw = 0, sw2 = 0, swy = 0;
  for (const a of top) { const y = P.pc[list[a]] / 100; sw += w[a]; sw2 += w[a] * w[a]; swy += w[a] * y; }
  if (!sw) return { pct: null, lo: null, hi: null, eff: 0, n, used: [] };
  const byPlace = [...top].sort((a, b) => P.pc[list[a]] - P.pc[list[b]]);
  const at = (q) => { let cum = 0; for (const a of byPlace) { cum += w[a]; if (cum / sw >= q) return P.pc[list[a]] / 100; } return P.pc[list[byPlace[byPlace.length - 1]]] / 100; };
  return { pct: swy / sw, lo: at(0.25), hi: at(0.75), eff: (sw * sw) / sw2, n, used: top.map((a) => [list[a], w[a]]) };
}

// A place (percentile, 0 to 1) turned into sign-ups through a center's own spread: 21 numbers, its sign-ups at
// every 5th percentile. Null when the center has too few measured events for a spread.
export function signUps(spread, p) {
  if (!spread || p == null) return null;
  const x = Math.max(0, Math.min(1, p)) * (spread.length - 1), a = Math.floor(x), b = Math.min(spread.length - 1, a + 1);
  return spread[a] + (spread[b] - spread[a]) * (x - a);
}

// A place in words. place(0.85) -> "the top fifth". Never show the bare number.
export function place(p) {
  if (p == null) return 'not measured';
  return p >= 0.9 ? 'the top 10%' : p >= 0.8 ? 'the top fifth' : p >= 0.67 ? 'the top third' : p >= 0.6 ? 'the upper half' : p > 0.4 ? 'around the middle'
    : p > 0.33 ? 'the lower half' : p > 0.2 ? 'the bottom third' : p > 0.1 ? 'the bottom fifth' : 'the bottom 10%';
}
// "landed in the top fifth of their events", "landed around the middle of their events"
export const placeOf = (p, whose = 'their') => `${place(p).replace(/^the /, 'in the ')} of ${whose} events`;
// A predicted place as a headline for the asking center, or for a typical center when no center is asking.
export function expectWords(p, mine = true) {
  if (p == null) return '';
  if (mine) return p >= 0.9 ? 'Should land in your top 10%' : p >= 0.8 ? 'Should land in your top fifth' : p >= 0.67 ? 'Should land in your top third'
    : p >= 0.6 ? 'Should do a little better than your average event' : p > 0.4 ? 'About an average event for you' : p > 0.33 ? 'Likely a little under your average event' : 'Likely one of your smaller events';
  return p >= 0.9 ? 'At most centers this lands in the top 10% of their events' : p >= 0.8 ? 'At most centers this lands in the top fifth of their events' : p >= 0.67 ? 'At most centers this lands in the top third of their events'
    : p >= 0.6 ? 'At most centers this does a little better than their average event' : p > 0.4 ? 'At most centers this is about an average event' : p > 0.33 ? 'At most centers this lands a little under their average event' : 'At most centers this is one of their smaller events';
}
// "9 to 13 sign-ups", or "about 9 sign-ups" when both ends round to the same number. Null without numbers.
export function signUpRange(lo, hi) {
  if (lo == null || hi == null) return null;
  const a = Math.round(Math.min(lo, hi)), b = Math.round(Math.max(lo, hi));
  return a === b ? `about ${a.toLocaleString()} ${a === 1 ? 'sign-up' : 'sign-ups'}` : `${a.toLocaleString()} to ${b.toLocaleString()} sign-ups`;
}
