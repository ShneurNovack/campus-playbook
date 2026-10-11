import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useData, plural, liftWords, STATUS, CONF } from '../lib/data';
import { PageHead, Loading, ErrorNote, Seg, Lift, StatusPill, Evidence, Dot, showTip, hideTip } from '../components/bits';

// The map is a picture of ideas.json: each idea sits at its `xy`, a 2-D layout of the idea embeddings made by
// the engine. Nothing is computed here except where to draw things.
const PAD = 30;            // px kept clear inside the frame so edge dots and labels are not cut
const MAX_K = 8;
const LABELS = 25, LABELS_PHONE = 11;
const LABEL_FONT = '600 11.5px "Funnel Sans", ui-sans-serif, system-ui, sans-serif';
const UP = 1.15, DOWN = 0.9; // lift cut-offs for "Performance"

// A lift only counts when the engine did not mark it thin (5 or more scored events from 3 or more centers).
const perfOf = (i) => (i.lift == null || i.confidence === 'thin' ? 'mid' : i.lift >= UP ? 'up' : i.lift <= DOWN ? 'down' : 'mid');
const momOf = (i) => (i.status === 'new' || i.status === 'rising' ? 'hot' : i.status === 'fading' ? 'cold' : 'mid');
const PAINT = {
  ink: { fill: 'var(--ink)', opacity: 0.35 },
  mid: { fill: 'var(--grey)', opacity: 0.4 },
  up: { fill: 'var(--go)', opacity: 0.9 },
  down: { fill: 'var(--cool)', opacity: 0.95 },
  hot: { fill: 'var(--heat)', opacity: 0.92 },
  cold: { fill: 'var(--cool)', opacity: 0.95 },
};
const classOf = (i, mode) => (mode === 'perf' ? perfOf(i) : mode === 'mom' ? momOf(i) : 'ink');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const scaleFor = (W) => 1.85 * Math.max(0.5, Math.min(1, W / 1050)); // smaller dots on a phone
const radius = (centers, rs) => Math.max(2, Math.sqrt(centers) * rs);
const padFor = (W) => (W < 520 ? 16 : PAD);

function liftLine(i) {
  if (i.lift == null) return 'No scored events yet, so no read on how it does';
  const ev = `${plural(i.n_scored, 'scored event')} at ${plural(i.centers_scored, 'center')}`;
  if (i.confidence === 'thin') return `${cap(liftWords(i.lift, 'their own'))} so far, on thin evidence: ${ev}`;
  return `${cap(liftWords(i.lift, 'their own'))}. ${CONF[i.confidence]}: ${ev}`;
}
const tipLines = (i, types) => [i.label, types[i.type] || i.type, `${plural(i.centers, 'center')}, ${plural(i.n, 'event')} held`, liftLine(i), `${STATUS[i.status]?.label || i.status}. ${i.when}`];

let ctx = null;
function textWidth(s) {
  try { if (!ctx) { ctx = document.createElement('canvas').getContext('2d'); } ctx.font = LABEL_FONT; return ctx.measureText(s).width; } catch (_) { return s.length * 6.4; }
}

// All the dots. Kept apart and memoized so that dragging the map only moves the group.
const Dots = memo(function Dots({ pts, order, k, mode, isOn, marked }) {
  const grow = Math.pow(k, 0.3) / k;
  return order.map((ix) => {
    const p = pts[ix], on = isOn(p.i);
    const st = on ? PAINT[classOf(p.i, mode)] : { fill: 'var(--ink)', opacity: 0.05 };
    const hit = on && marked && marked.has(p.i.id);
    return <circle key={p.i.id} cx={p.x} cy={p.y} r={p.r * grow} fill={hit ? 'var(--ink)' : st.fill} fillOpacity={hit ? 0.9 : st.opacity} />;
  });
});

function Legend({ mode, ideas, rs }) {
  const n = (f) => ideas.filter(f).length.toLocaleString();
  const item = (color, text, count) => <span key={text} className="inline-flex items-center gap-2 whitespace-nowrap"><Dot color={color} size={11} /><span>{text}</span><span className="z-muted tabular-nums">{count}</span></span>;
  if (mode === 'perf') {
    return (
      <div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 z-small font-semibold">
          {item('var(--go)', 'Above normal', n((i) => perfOf(i) === 'up'))}{item('var(--cool)', 'Below normal', n((i) => perfOf(i) === 'down'))}{item('var(--mist)', 'In between, or too little data', n((i) => perfOf(i) === 'mid'))}
        </div>
        <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>Above means sign-ups ran 15% or more over each center's own normal. Below means 10% or more under. Both need at least 5 scored events from 3 centers. {n((i) => i.confidence === 'thin')} of the {ideas.length.toLocaleString()} ideas fall short of that and stay grey.</p>
      </div>
    );
  }
  if (mode === 'mom') {
    return (
      <div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 z-small font-semibold">
          {item('var(--heat)', 'New or rising', n((i) => momOf(i) === 'hot'))}{item('var(--cool)', 'Fading', n((i) => momOf(i) === 'cold'))}{item('var(--mist)', 'Steady, every year, or tied to a holiday', n((i) => momOf(i) === 'mid'))}
        </div>
        <p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>New means first seen in the last 18 months and already at three or more centers. Rising and fading compare how many centers ran the idea this academic year against the same stretch of last year. Holiday ideas follow the Jewish calendar, so no trend is read for them.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 z-small font-semibold">
      {[2, 20, 100].map((c) => <span key={c} className="inline-flex items-center gap-2"><Dot color="rgba(0,0,0,0.35)" size={Math.round(2 * radius(c, rs))} /><span>{c} centers</span></span>)}
      <span className="z-muted font-normal">Dot area follows the number of centers that have run the idea.</span>
    </div>
  );
}

function Picked({ idea, types, onClose }) {
  return (
    <section className="z-card mt-4" aria-live="polite" aria-label="Selected idea">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="z-h3">{idea.label}</h2>
          <p className="z-small z-muted mt-1">{types[idea.type] || idea.type}. {plural(idea.centers, 'center')}, {plural(idea.n, 'event')} held. {idea.when}.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 99, background: '#fff', flex: 'none' }}><X size={17} /></button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusPill status={idea.status} onFog />
        {idea.lift == null || idea.confidence === 'thin'
          ? <span className="z-small z-muted">{liftLine(idea)}</span>
          : <><Lift value={idea.lift} /><Evidence n={idea.n_scored} centers={idea.centers_scored} conf={idea.confidence} /></>}
      </div>
      <Link to={`/idea/${idea.id}`} className="z-btn z-btn-go z-btn-sm mt-5">Open this idea<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
  );
}

export default function IdeaMap() {
  const { data, error } = useData('ideas.json', 'catalog');
  const nav = useNavigate();
  const box = useRef(null), svg = useRef(null), drag = useRef(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [mode, setMode] = useState('none');
  const [type, setType] = useState(null);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(null);
  const [fonts, setFonts] = useState(0);
  const ideas = data ? data[0] : null;
  const { W, H } = size, { k, tx, ty } = view;

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => { const r = e.contentRect; setSize((s) => (Math.abs(s.W - r.width) < 1 && Math.abs(s.H - r.height) < 1 ? s : { W: Math.round(r.width), H: Math.round(r.height) })); setView({ k: 1, tx: 0, ty: 0 }); });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [ideas]);
  useEffect(() => { let live = true; document.fonts?.ready?.then(() => live && setFonts(1)); return () => { live = false; hideTip(); }; }, []);

  // positions in frame pixels at zoom 1, radius by number of centers (area, not width)
  const pts = useMemo(() => {
    if (!ideas || !W) return [];
    return ideas.filter((i) => i.xy).map((i) => ({ i, x: padFor(W) + i.xy[0] * (W - 2 * padFor(W)), y: padFor(W) + i.xy[1] * (H - 2 * padFor(W)), r: radius(i.centers, scaleFor(W)) }));
  }, [ideas, W, H]);
  const s = q.trim().toLowerCase();
  const matches = useMemo(() => (s && ideas ? new Set(ideas.filter((i) => i.label.toLowerCase().includes(s)).map((i) => i.id)) : null), [ideas, s]);
  const isOn = useCallback((i) => (!type || i.type === type) && (!matches || matches.has(i.id)), [type, matches]);
  // draw order: dimmed first, then grey, then colored; bigger dots under smaller ones
  const order = useMemo(() => {
    const rank = (p) => (!isOn(p.i) ? 0 : classOf(p.i, mode) === 'mid' ? 1 : 2);
    return pts.map((_, ix) => ix).sort((a, b) => rank(pts[a]) - rank(pts[b]) || pts[b].r - pts[a].r);
  }, [pts, isOn, mode]);
  const bySize = useMemo(() => [...pts].sort((a, b) => b.i.centers - a.i.centers), [pts]);

  const grow = Math.pow(k, 0.3);
  const sx = (p) => p.x * k + tx, sy = (p) => p.y * k + ty;

  // labels for the biggest ideas in view; a label is skipped when its box would cover one already placed
  const labels = useMemo(() => {
    if (!W) return [];
    const placed = [];
    // big dots count as taken space too, so a label does not sit on top of a neighbor
    const solid = bySize.filter((p) => p.r * grow >= 6.5 && isOn(p.i)).map((p) => { const r = p.r * grow * 0.8; return { x: p.x * k + tx - r, y: p.y * k + ty - r, w: 2 * r, h: 2 * r, id: p.i.id }; });
    const hits = (b, o, mx, my) => b.x < o.x + o.w + mx && o.x < b.x + b.w + mx && b.y < o.y + o.h + my && o.y < b.y + b.h + my;
    const clear = (b) => b.x >= 2 && b.y >= 2 && b.x + b.w <= W - 2 && b.y + b.h <= H - 2 && !placed.some((o) => hits(b, o, 3, 1));
    const free = (b) => clear(b) && !solid.some((o) => o.id !== b.id && hits(b, o, 0, 0));
    let tried = 0;
    for (const p of bySize) {
      if (!isOn(p.i)) continue;
      const x = p.x * k + tx, y = p.y * k + ty, r = p.r * grow;
      if (x < 0 || y < 0 || x > W || y > H) continue;
      if (++tried > 160) break;
      const text = p.i.label.length > 30 ? p.i.label.slice(0, 29).trimEnd() + '…' : p.i.label;
      const w = textWidth(text) + 2, h = 14;
      const spots = [{ x: x + r + 4, y: y - h / 2, a: 'start' }, { x: x - r - 4 - w, y: y - h / 2, a: 'start' }, { x: x - w / 2, y: y - r - h - 2, a: 'start' }, { x: x - w / 2, y: y + r + 2, a: 'start' }];
      const boxes = spots.map((o) => ({ ...o, w, h, id: p.i.id }));
      const b = boxes.find(free) || boxes.find(clear); // in a crowd, sitting on a neighbor beats no label
      if (!b) continue;
      placed.push({ ...b, text });
      if (placed.length >= (W < 520 ? LABELS_PHONE : LABELS)) break;
    }
    return placed;
  }, [bySize, isOn, k, tx, ty, W, H, grow, fonts]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (v) => { const kk = Math.max(1, Math.min(MAX_K, v.k)); return { k: kk, tx: Math.min(0, Math.max(W - W * kk, v.tx)), ty: Math.min(0, Math.max(H - H * kk, v.ty)) }; };
  const zoomAt = useCallback((f, cx, cy) => setView((v) => { const kk = Math.max(1, Math.min(MAX_K, v.k * f)); const x = cx ?? W / 2, y = cy ?? H / 2; return clamp({ k: kk, tx: x - ((x - v.tx) * kk) / v.k, ty: y - ((y - v.ty) * kk) / v.k }); }), [W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // pinch on a trackpad, or Ctrl / Cmd with the wheel, zooms. A plain wheel still scrolls the page.
  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const onWheel = (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 40 ? 0.012 : 0.0035)), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, W]);

  // nearest dot to a point, with a reach of at least 10px so every dot has a 20px target
  const find = (px, py) => {
    let best = null, bs = Infinity;
    for (const p of pts) {
      if (!isOn(p.i)) continue;
      const reach = Math.max(p.r * grow + 3, 10), d = Math.hypot(px - sx(p), py - sy(p));
      if (d <= reach && d / reach < bs) { bs = d / reach; best = p; }
    }
    return best;
  };
  const local = (e) => { const r = svg.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onDown = (e) => { const [x, y] = local(e); drag.current = { x, y, tx, ty, moved: false }; if (k > 1) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ } } };
  const onMove = (e) => {
    const [x, y] = local(e), d = drag.current;
    if (d && (e.buttons || e.pointerType !== 'mouse')) {
      if (Math.hypot(x - d.x, y - d.y) > 5) d.moved = true;
      if (d.moved && k > 1) { hideTip(); setHover(null); setView(clamp({ k, tx: d.tx + x - d.x, ty: d.ty + y - d.y })); }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const p = find(x, y);
    setHover(p ? p.i.id : null);
    if (p) showTip(e, tipLines(p.i, data[1].types)); else hideTip();
  };
  const onUp = (e) => {
    const d = drag.current; drag.current = null;
    if (!d || d.moved) return;
    const [x, y] = local(e), p = find(x, y);
    if (e.pointerType === 'mouse') { if (p) { hideTip(); nav(`/idea/${p.i.id}`); } } else setSel(p ? p.i.id : null);
  };
  const onLeave = () => { drag.current = null; setHover(null); hideTip(); };

  if (error) return <div className="px-5 sm:px-6"><ErrorNote error={error} what="The idea map" /></div>;
  if (!data) return <div className="px-5 sm:px-6"><Loading rows={2} h={300} /></div>;
  const types = data[1].types;
  const typeRows = [...ideas.reduce((m, i) => m.set(i.type, (m.get(i.type) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const byId = (id) => (id == null ? null : ideas[id]);
  const hot = hover != null ? pts.find((p) => p.i.id === hover) : null;
  const picked = sel != null ? pts.find((p) => p.i.id === sel) : null;
  const matchList = matches ? ideas.filter((i) => matches.has(i.id) && (!type || i.type === type)).sort((a, b) => b.centers - a.centers) : [];
  const pill = (on) => ({ height: '2.1rem', fontSize: '0.88rem', background: on ? 'var(--ink)' : 'var(--fog)', color: on ? '#fff' : 'var(--ink)', flex: 'none' });
  const ctl = { width: 40, height: 40, borderRadius: 99 };

  return (
    <div className="px-5 sm:px-6 pb-36 md:pb-28">
      <PageHead title="Idea map" lede={`${ideas.length.toLocaleString()} ideas, each one a program that at least two centers have run. Ideas that centers describe in similar words sit close together.`}
        action={<Seg value={mode} onChange={setMode} label="Color the dots by" options={[['none', 'No color'], ['perf', 'Performance'], ['mom', 'Momentum']]} />} />

      <div className="mt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-3 items-start">
        <div className="relative">
          <Search size={17} aria-hidden="true" className="absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--grey)' }} />
          <input className="z-input" style={{ paddingLeft: '2.5rem', paddingRight: q ? '2.6rem' : undefined }} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an idea on the map" aria-label="Find an idea on the map" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear the search" className="absolute inline-flex items-center justify-center" style={{ right: 8, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 99 }}><X size={16} /></button>}
        </div>
        <div className="flex lg:flex-wrap gap-2 overflow-x-auto z-scroll pb-1 -mx-5 px-5 sm:mx-0 sm:px-0" role="group" aria-label="Kind of event">
          <button type="button" className="z-pill" style={pill(!type)} aria-pressed={!type} onClick={() => setType(null)}>All kinds <span style={{ opacity: 0.6 }}>{ideas.length.toLocaleString()}</span></button>
          {typeRows.map(([t, n]) => <button key={t} type="button" className="z-pill" style={pill(type === t)} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>{types[t] || t} <span style={{ opacity: 0.6 }}>{n}</span></button>)}
        </div>
      </div>

      {matches && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 z-small" aria-live="polite">
          <span className="font-semibold">{matchList.length ? `${plural(matchList.length, 'idea')} match${matchList.length === 1 ? 'es' : ''}:` : `No idea is named "${q.trim()}"${type ? ' in this kind' : ''}.`}</span>
          {matchList.slice(0, 8).map((i) => <Link key={i.id} to={`/idea/${i.id}`} className="z-link">{i.label}</Link>)}
          {matchList.length > 8 && <span className="z-muted">and {matchList.length - 8} more on the map</span>}
        </p>
      )}

      <div className="mt-5"><Legend mode={mode} ideas={ideas} rs={scaleFor(W || 1050)} /></div>

      <div className="relative mt-4">
        <div ref={box} className="relative w-full aspect-square sm:aspect-auto sm:h-[min(78vh,820px)] sm:min-h-[520px] overflow-hidden select-none" style={{ background: 'var(--fog)', borderRadius: 'var(--r-lg)' }}>
          {W > 0 && (
            <svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scatter of ${ideas.length} ideas. Similar ideas sit near each other. Use the search box above to reach any idea by name.`}
              style={{ display: 'block', touchAction: k > 1 ? 'none' : 'manipulation', cursor: hot ? 'pointer' : k > 1 ? 'grab' : 'default' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onLeave} onPointerCancel={onLeave}>
              <g transform={`translate(${tx} ${ty}) scale(${k})`}><Dots pts={pts} order={order} k={k} mode={mode} isOn={isOn} marked={matches} /></g>
              {[picked, hot].map((p, n) => p && <circle key={n} cx={sx(p)} cy={sy(p)} r={p.r * grow + 3} fill="none" stroke="var(--ink)" strokeWidth={2} pointerEvents="none" />)}
              <g pointerEvents="none" style={{ font: LABEL_FONT }}>
                {labels.map((l) => <text key={l.id} x={l.x + 1} y={l.y + 10.5} fill="var(--ink)" stroke="var(--fog)" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">{l.text}</text>)}
              </g>
            </svg>
          )}
        </div>
        <div className="mt-2.5 flex justify-end gap-1.5 sm:mt-0 sm:absolute sm:top-3 sm:right-3 sm:flex-col">
          <button type="button" style={ctl} className="inline-flex items-center justify-center bg-[var(--fog)] sm:bg-white" aria-label="Zoom in" onClick={() => zoomAt(1.6)} disabled={k >= MAX_K}><Plus size={18} /></button>
          <button type="button" style={{ ...ctl, opacity: k <= 1 ? 0.45 : 1 }} className="inline-flex items-center justify-center bg-[var(--fog)] sm:bg-white" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.6)} disabled={k <= 1}><Minus size={18} /></button>
          <button type="button" style={{ ...ctl, opacity: k <= 1 ? 0.45 : 1 }} className="inline-flex items-center justify-center bg-[var(--fog)] sm:bg-white" aria-label="Reset the view" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} disabled={k <= 1}><RotateCcw size={16} /></button>
        </div>
      </div>

      {picked && <Picked idea={byId(sel)} types={types} onClose={() => setSel(null)} />}

      <div className="mt-8 max-w-[70ch]">
        <h2 className="z-h3">How to read the map</h2>
        <p className="mt-3 z-muted" style={{ lineHeight: 1.55 }}>
          Each dot is one idea, and a bigger dot means more centers have run it. Ideas near each other are described in similar words by the centers that run them, so the Sukkot events gather in one area, the Purim events in another and Yom Kippur in a third. Distance on the map is approximate: the layout squeezes a description with many dimensions down to two, so close neighbors mean something and the exact gap between far-apart groups does not. Left and right, up and down have no meaning of their own.
          {' '}<span className="hidden sm:inline">Hover a dot to see how the idea did, and click it to open the idea. The plus and minus buttons zoom, as does a pinch on a trackpad or Ctrl with the scroll wheel, and you can drag the map once you are zoomed in.</span><span className="sm:hidden">Tap a dot to see how the idea did. The plus and minus buttons zoom, and you can drag the map once you are zoomed in.</span>
        </p>
      </div>
    </div>
  );
}
