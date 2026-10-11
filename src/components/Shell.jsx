import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { Zap, Utensils, FlaskConical, Clock3, Images, CalendarClock, Users, Building2, Orbit, SlidersHorizontal, Menu, X, MapPin } from 'lucide-react';
import { useData, useMyCenter, centerLabel } from '../lib/data';

export const NAV = [
  { to: '/', label: 'Now', end: true, icon: Zap },
  { to: '/themes', label: 'Shabbat themes', short: 'Themes', icon: Utensils },
  { to: '/ideas', label: 'Idea lab', short: 'Ideas', icon: FlaskConical },
  { to: '/timing', label: 'Timing', icon: Clock3 },
  { to: '/library', label: 'Library', icon: Images },
  { to: '/coming', label: 'Coming up', short: 'Coming', icon: CalendarClock },
  { to: '/niches', label: 'Niches', icon: Users, more: true },
  { to: '/centers', label: 'Centers', icon: Building2, more: true },
  { to: '/map', label: 'Map', icon: Orbit, more: true },
  { to: '/engine', label: 'Engine', icon: SlidersHorizontal, more: true },
];
const SECTION = [['/themes', '/themes'], ['/idea', '/ideas'], ['/program', '/library'], ['/center', '/centers']];

function CenterPicker({ onClose }) {
  const { data } = useData('catalog');
  const [mine, setMine] = useMyCenter();
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); const esc = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data[0].centers.filter((c) => !s || `${c.name} ${c.campus} ${c.short} ${c.city} ${c.state}`.toLowerCase().includes(s)).sort((a, b) => (a.campus || a.name).localeCompare(b.campus || b.name));
  }, [data, q]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose your center">
      <div className="w-full max-w-[34rem] flex flex-col" style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '1.5rem', maxHeight: '76vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="z-h3">Your center</h2><p className="z-small z-muted mt-1.5" style={{ lineHeight: 1.45 }}>Pick it and the app weighs everything toward centers like yours. It is only remembered in this browser.</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center justify-center hover:bg-[var(--fog)]" style={{ width: 36, height: 36, borderRadius: 99, flex: 'none' }}><X size={18} /></button>
        </div>
        <input ref={box} className="z-input mt-4" placeholder="Search by school or city" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-3 overflow-y-auto z-scroll flex-1 min-h-0">
          {mine && <li><button type="button" className="w-full text-left px-3 py-2.5 font-semibold hover:bg-[var(--fog)]" style={{ borderRadius: 12, color: 'var(--grey)' }} onClick={() => { setMine(null); onClose(); }}>No center (show the whole network)</button></li>}
          {list.map((c) => (
            <li key={c.id}><button type="button" className="w-full text-left px-3 py-2.5 hover:bg-[var(--fog)]" style={{ borderRadius: 12, background: c.id === mine ? 'var(--go-tint)' : undefined }} onClick={() => { setMine(c.id); onClose(); }}>
              <span className="font-bold">{c.campus || c.name}</span><span className="z-small z-muted block truncate">{c.name}{c.city ? `, ${c.city}` : ''}</span>
            </button></li>
          ))}
          {data && !list.length && <li className="px-3 py-4 z-muted">No center matches that.</li>}
        </ul>
      </div>
    </div>
  );
}

export default function Shell() {
  const loc = useLocation();
  const [mine] = useMyCenter();
  const { data } = useData('catalog');
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const section = SECTION.find(([p]) => loc.pathname.startsWith(p))?.[1];
  const me = mine && data ? data[0].centerById.get(mine) : null;
  const wide = loc.pathname === '/map';
  const pill = (n) => ({ isActive }) => { const on = isActive || section === n.to; return { color: on ? '#fff' : 'var(--ink)', background: on ? 'var(--ink)' : 'transparent' }; };
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="sticky top-0 z-30" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'saturate(1.4) blur(14px)' }}>
        <div className={`${wide ? 'px-5 sm:px-6' : 'max-w-[1240px] mx-auto px-5 sm:px-8'} h-[4.2rem] flex items-center justify-between gap-3 xl:gap-5`}>
          <NavLink to="/" className="z-display flex flex-none items-center gap-2.5 text-[1.3rem] whitespace-nowrap" style={{ fontWeight: 800 }}>
            <span aria-hidden="true" className="relative inline-block" style={{ width: 26, height: 26, borderRadius: 8, background: '#000' }}>
              <span className="absolute" style={{ left: 5, bottom: 5, width: 4, height: 7, borderRadius: 2, background: '#fff' }} />
              <span className="absolute" style={{ left: 11, bottom: 5, width: 4, height: 11, borderRadius: 2, background: '#fff' }} />
              <span className="absolute" style={{ left: 17, bottom: 5, width: 4, height: 16, borderRadius: 2, background: 'var(--go)' }} />
            </span>
            <span className="hidden sm:inline">Campus Playbook</span>
          </NavLink>
          <nav className="hidden md:flex items-center gap-0.5 min-w-0" aria-label="Main">
            {NAV.filter((n) => !n.more).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="px-2.5 xl:px-3.5 h-10 inline-flex items-center rounded-full text-[0.95rem] font-semibold transition-colors whitespace-nowrap" style={pill(n)}>
                {n.short ? <><span className="lg:hidden">{n.short}</span><span className="hidden lg:inline">{n.label}</span></> : n.label}
              </NavLink>
            ))}
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="px-3 h-10 inline-flex items-center gap-1.5 rounded-full text-[0.95rem] font-semibold" style={{ background: NAV.some((n) => n.more && (loc.pathname.startsWith(n.to) || section === n.to)) ? 'var(--ink)' : 'transparent', color: NAV.some((n) => n.more && (loc.pathname.startsWith(n.to) || section === n.to)) ? '#fff' : 'var(--ink)' }}>More</button>
              {menu && <div className="absolute right-0 mt-2 p-2 w-52" style={{ background: '#fff', border: '1px solid var(--mist)', borderRadius: 18 }}>{NAV.filter((n) => n.more).map((n) => <NavLink key={n.to} to={n.to} className="block px-3 py-2.5 font-semibold hover:bg-[var(--fog)]" style={{ borderRadius: 12 }}>{n.label}</NavLink>)}</div>}
            </div>
          </nav>
          <button type="button" onClick={() => setPicking(true)} className="flex-none inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-[0.9rem] font-semibold max-w-[11.5rem]" style={{ background: me ? 'var(--go-tint)' : 'var(--fog)' }} title={me ? me.name : 'Choose your center'}>
            <MapPin size={15} aria-hidden="true" style={{ flex: 'none' }} /><span className="truncate">{me ? centerLabel(me) : 'Your center'}</span>
          </button>
        </div>
      </header>

      <main key={loc.pathname} className={`z-page ${wide ? '' : 'max-w-[1240px] mx-auto px-5 sm:px-8 pb-36 md:pb-28'}`}>
        <Outlet />
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 px-0.5 pt-1.5" aria-label="Main" style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid var(--fog-2)', paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}>
        {NAV.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="flex flex-col items-center gap-0.5 py-1.5 text-[0.66rem] font-semibold" style={({ isActive }) => ({ color: isActive || section === n.to ? 'var(--ink)' : 'var(--grey)' })}>
            {({ isActive }) => (<><n.icon size={21} strokeWidth={isActive || section === n.to ? 2.6 : 1.9} aria-hidden="true" />{n.short || n.label}</>)}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMenu((m) => !m)} className="flex flex-col items-center gap-0.5 py-1.5 text-[0.66rem] font-semibold" style={{ color: menu ? 'var(--ink)' : 'var(--grey)' }}><Menu size={21} aria-hidden="true" />More</button>
      </nav>
      {menu && (
        <div className="md:hidden fixed inset-x-3 z-40 p-2 grid grid-cols-2 gap-1" style={{ bottom: '4.6rem', background: '#fff', border: '1px solid var(--mist)', borderRadius: 22 }}>
          {NAV.slice(4).map((n) => <NavLink key={n.to} to={n.to} className="flex items-center gap-2.5 px-3.5 py-3 font-semibold" style={{ borderRadius: 14, background: 'var(--fog)' }}><n.icon size={18} aria-hidden="true" />{n.label}</NavLink>)}
        </div>
      )}
      {picking && <CenterPicker onClose={() => setPicking(false)} />}
    </div>
  );
}
