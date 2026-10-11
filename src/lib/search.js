// Vector search in the browser. The engine publishes one 256-dimension int8 vector per program (vectors.bin).
// A typed idea is embedded by the Worker (bge-m3, projected into the same space) and compared here with every
// program: about 3.4 million multiplications, a few milliseconds. A light word-match is blended in so that a rare
// exact word in a name ("pickleball") is not outvoted by general similarity.
import { load, catalog } from './data';

let ready = null;
export function searchIndex() {
  if (!ready) {
    ready = Promise.all([load('vectors.bin'), catalog()]).then(([buf, cat]) => {
      const dims = cat.dims, M = new Int8Array(buf), n = M.length / dims;
      const norm = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0; const o = i * dims; for (let j = 0; j < dims; j++) s += M[o + j] * M[o + j]; norm[i] = Math.sqrt(s) || 1; }
      // word index over names
      const df = new Map(), toks = new Array(n);
      for (let i = 0; i < n; i++) { const t = tokens(cat.programs.name[i]); toks[i] = t; for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1); }
      // About 950 programs were posted with a name and nothing else (flag 8). Their vectors are bare titles, and a
      // typed query is a bare title too, so it looks a little like all of them whatever the subject. `style` is
      // that shared direction and `share` how much of it each program carries; text search leaves it out.
      const style = new Float32Array(dims), share = new Float32Array(n), fl = cat.programs.fl;
      for (let i = 0; i < n; i++) if (fl[i] & 8) { const o = i * dims; for (let j = 0; j < dims; j++) style[j] += M[o + j] / norm[i]; }
      let sl = 0; for (let j = 0; j < dims; j++) sl += style[j] * style[j];
      sl = Math.sqrt(sl) || 1; for (let j = 0; j < dims; j++) style[j] /= sl;
      for (let i = 0; i < n; i++) { let s = 0; const o = i * dims; for (let j = 0; j < dims; j++) s += M[o + j] * style[j]; share[i] = s / norm[i]; }
      return { M, n, dims, norm, toks, df, cat, style, share };
    }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'at', 'in', 'on', 'of', 'a', 'an', 'to', 'our', 'your', 'night', 'chabad', 'event']);
export const tokens = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

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
  for (let i = 0; i < n; i++) { let s = 0; const o = i * dims; for (let j = 0; j < dims; j++) s += M[o + j] * q[j]; out[i] = s / norm[i]; }
  return out;
}

export function vectorOf(ix, i) {
  const { M, dims, norm } = ix, v = new Float32Array(dims), o = i * dims;
  for (let j = 0; j < dims; j++) v[j] = M[o + j] / norm[i];
  return v;
}

// cosine of a typed query against every program, with the bare-title likeness taken out
export function scoreText(ix, q) {
  const out = scoreAll(ix, q);
  let qs = 0; for (let j = 0; j < ix.dims; j++) qs += q[j] * ix.style[j];
  if (qs > 0) for (let i = 0; i < ix.n; i++) out[i] -= ix.share[i] * qs;
  return out;
}

// 0..1: how much of the query's rare words appear in the name
export function wordMatch(ix, text) {
  const q = [...new Set(tokens(text))];
  const idf = (w) => Math.log(1 + ix.n / (1 + (ix.df.get(w) || 0)));
  const total = q.reduce((s, w) => s + idf(w), 0) || 1;
  const out = new Float32Array(ix.n);
  if (!q.length) return out;
  for (let i = 0; i < ix.n; i++) {
    const t = ix.toks[i]; let s = 0;
    for (const w of q) if (t.includes(w) || t.includes(w + 's') || (w.endsWith('s') && t.includes(w.slice(0, -1)))) s += idf(w);
    out[i] = s / total;
  }
  return out;
}

// Search by text. Returns [{ i, sim, score }] best first. sim is the plain cosine; score adds the word match.
export async function searchText(text, { limit = 60, filter = null, lexical = 0.12 } = {}) {
  const [ix, q] = await Promise.all([searchIndex(), embed(text)]);
  const sims = scoreText(ix, q), words = lexical ? wordMatch(ix, text) : null;
  return rank(ix, sims, words, lexical, limit, filter);
}

export async function searchLike(i, { limit = 30, filter = null } = {}) {
  const ix = await searchIndex();
  const sims = scoreAll(ix, vectorOf(ix, i));
  sims[i] = -1;
  return rank(ix, sims, null, 0, limit, filter);
}

function rank(ix, sims, words, lexical, limit, filter) {
  const idx = [];
  for (let i = 0; i < ix.n; i++) if (!filter || filter(i)) idx.push(i);
  const score = (i) => sims[i] + (words ? lexical * words[i] : 0);
  idx.sort((a, b) => score(b) - score(a));
  return { hits: idx.slice(0, limit).map((i) => ({ i, sim: sims[i], score: score(i) })), sims, ix };
}
