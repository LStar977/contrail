'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { fetchAircraft } from '@/lib/api';
import { loadAirports, searchAirports } from '@/lib/airports';
import { airlineByIata, airlineTile, flightLabel, loadAirlines, type Airline } from '@/lib/airlines';
import { typeName } from '@/lib/aircraftTypes';
import type { Aircraft, Airport } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { useMapController } from '@/components/map/MapContext';

type Item =
  | { kind: 'flight'; id: string; ac: Aircraft; title: string; sub: string; side: string }
  | { kind: 'airport'; id: string; ap: Airport; title: string; sub: string; side: string }
  | { kind: 'airline'; id: string; al: Airline; title: string; sub: string; side: string }
  | { kind: 'special'; id: string; title: string; sub: string; side: string; filter: { kind: 'type' | 'mil' | 'sqk'; value: string; label: string } };

const SPECIALS: Item[] = [
  { kind: 'special', id: 'sp-a388', title: 'Every Airbus A380 in the air', sub: 'The double-decker, worldwide', side: 'A388', filter: { kind: 'type', value: 'A388', label: 'Airbus A380' } },
  { kind: 'special', id: 'sp-b748', title: 'Every Boeing 747-8 in the air', sub: 'The last of the jumbos', side: 'B748', filter: { kind: 'type', value: 'B748', label: 'Boeing 747-8' } },
  { kind: 'special', id: 'sp-mil', title: 'Military aircraft', sub: 'Tankers, transports and patrols broadcasting ADS-B', side: 'MIL', filter: { kind: 'mil', value: '1', label: 'Military' } },
  { kind: 'special', id: 'sp-7700', title: 'Emergencies right now', sub: 'Aircraft squawking 7700', side: '7700', filter: { kind: 'sqk', value: '7700', label: 'Squawk 7700' } },
];

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPalette);

  // global shortcut: ⌘K / Ctrl+K toggles, "/" opens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useStore.getState().paletteOpen); }
      else if (e.key === '/' && !typing && !useStore.getState().paletteOpen) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // mounting fresh on every open resets the query and selection
  return open ? <Palette close={() => setOpen(false)} /> : null;
}

function Palette({ close }: { close: () => void }) {
  const aircraft = useStore((s) => s.aircraft);
  const { select, setFilter, upsert } = useStore.getState();
  const ctrl = useMapController();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [airports, setAirports] = useState<Airport[] | null>(null);
  const [airlines, setAirlines] = useState<Airline[] | null>(null);
  const [remote, setRemote] = useState<{ key: string; list: Aircraft[] }>({ key: '', list: [] });
  const [searchingKey, setSearchingKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAirports().then(setAirports).catch(() => {});
    loadAirlines().then(setAirlines).catch(() => {});
  }, []);

  // remote exact lookups: callsign, IATA flight number, registration, hex
  const lookups = useMemo(() => {
    const n = norm(q);
    if (n.length < 3) return [];
    const tasks: string[] = [];
    if (/^[A-Z]{3}\d{1,4}[A-Z]?$/.test(n)) tasks.push(`callsign=${n}`);
    const iata = n.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
    if (iata) {
      const al = airlineByIata(airlines, iata[1]);
      if (al) tasks.push(`callsign=${al.icao}${iata[2]}`);
    }
    if (/^[A-Z0-9]{1,2}-?[A-Z0-9]{2,5}$/.test(q.trim().toUpperCase()) && /[A-Z]/.test(n) && n.length >= 4) tasks.push(`reg=${q.trim().toUpperCase()}`);
    if (/^[0-9A-F]{6}$/.test(n)) tasks.push(`hex=${n.toLowerCase()}`);
    return tasks;
  }, [q, airlines]);
  const lookupKey = lookups.join('&');
  useEffect(() => {
    if (!lookupKey) return;
    const id = setTimeout(async () => {
      setSearchingKey(lookupKey);
      const res = await Promise.allSettled(lookupKey.split('&').map((t) => fetchAircraft(t)));
      setSearchingKey('');
      setRemote({ key: lookupKey, list: res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])) });
    }, 320);
    return () => clearTimeout(id);
  }, [lookupKey]);
  const remoteList = useMemo(() => (remote.key === lookupKey ? remote.list : []), [remote, lookupKey]);
  const searching = !!searchingKey && searchingKey === lookupKey;

  const items = useMemo<Item[]>(() => {
    const n = norm(q);
    if (!n) return SPECIALS;
    const out: Item[] = [];
    const seen = new Set<string>();
    const pushFlight = (ac: Aircraft) => {
      if (seen.has(ac.hex)) return;
      seen.add(ac.hex);
      const label = flightLabel(ac.cs, airlines) || ac.reg || ac.hex.toUpperCase();
      out.push({
        kind: 'flight', id: ac.hex, ac, title: label,
        sub: [ac.cs && ac.cs !== label ? ac.cs : null, ac.type ? typeName(ac.type) : null, ac.reg].filter(Boolean).join(' · '),
        side: ac.ground ? 'On ground' : ac.alt != null ? (ac.alt >= 18000 ? `FL${Math.round(ac.alt / 100)}` : `${Math.round(ac.alt).toLocaleString('en-US')} ft`) : '',
      });
    };
    for (const ac of remoteList) pushFlight(ac);
    // flights already on the map: prefix match on callsign, IATA-style label, registration or hex
    let iataPrefix: string | null = null;
    const m = n.match(/^([A-Z0-9]{2})(\d*)$/);
    if (m) { const al = airlineByIata(airlines, m[1]); if (al) iataPrefix = al.icao + m[2]; }
    for (const ac of aircraft.values()) {
      if (out.length >= 8) break;
      const reg = norm(ac.reg);
      if ((ac.cs && (ac.cs.startsWith(n) || (iataPrefix && ac.cs.startsWith(iataPrefix)))) || (reg && reg.startsWith(n) && n.length >= 3) || ac.hex.toUpperCase() === n) pushFlight(ac);
    }
    for (const ap of airports ? searchAirports(airports, q, 5) : []) {
      out.push({ kind: 'airport', id: ap.icao, ap, title: ap.name, sub: `${ap.iata ? ap.iata + ' · ' : ''}${ap.icao} · ${ap.city || ap.country}`, side: ap.iata || ap.icao });
    }
    if (airlines && n.length >= 2) {
      const ql = q.trim().toLowerCase();
      const hits = airlines.filter((a) => a.iata === n || a.icao === n || (ql.length >= 3 && (a.name.toLowerCase().startsWith(ql) || a.callsign.toLowerCase().startsWith(ql)))).slice(0, 3);
      for (const al of hits) out.push({ kind: 'airline', id: `al-${al.icao}`, al, title: al.name, sub: `Show only ${al.name} on the map`, side: [al.iata, al.icao].filter(Boolean).join(' · ') });
    }
    if (/^[A-Z]\d{2,3}[A-Z0-9]?$|^[A-Z]{2}\d{2}$|^[A-Z]\d[A-Z0-9]{2}$/.test(n) && n.length === 4) {
      out.push({ kind: 'special', id: `type-${n}`, title: `Every ${typeName(n)} in the air`, sub: 'Worldwide, from open ADS-B data', side: n, filter: { kind: 'type', value: n, label: typeName(n) } });
    }
    for (const s of SPECIALS) if (s.title.toUpperCase().includes(q.trim().toUpperCase()) && q.trim().length >= 3) out.push(s);
    return out.slice(0, 14);
  }, [q, remoteList, aircraft, airports, airlines]);

  const run = (it: Item | undefined) => {
    if (!it) return;
    if (it.kind === 'flight') {
      upsert([it.ac]);
      ctrl.current?.upsert([it.ac]);
      select(it.ac.hex);
      ctrl.current?.flyTo([it.ac.lon, it.ac.lat], 6.5);
      if (location.pathname !== '/') router.push(`/?flight=${it.ac.hex}`);
    } else if (it.kind === 'airport') {
      router.push(`/airport/${it.ap.iata || it.ap.icao}`);
    } else if (it.kind === 'airline') {
      setFilter({ kind: 'airline', value: it.al.icao, label: it.al.name });
      if (location.pathname !== '/') router.push('/');
    } else {
      setFilter(it.filter);
      select(null);
      ctrl.current?.map.flyTo({ center: [0, 30], zoom: 1.8, speed: 1.6 });
      if (location.pathname !== '/') router.push('/');
    }
    close();
  };
  const cur = items[active];

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(cur); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  const groups: [string, Item[]][] = [];
  for (const it of items) {
    const g = !q.trim() ? 'Try' : it.kind === 'flight' ? 'Live flights' : it.kind === 'airport' ? 'Airports' : it.kind === 'airline' ? 'Airlines' : 'Explore';
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(it); else groups.push([g, [it]]);
  }

  return (
    <>
      <div className="palette-scrim" onClick={close} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className="palette__input">
          <Icon name="search" style={{ color: 'var(--signal)' }} />
          <label htmlFor="ct-q" className="sr-only">Search flights, airports, airlines and aircraft</label>
          <input
            id="ct-q" ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} autoComplete="off" spellCheck={false} autoFocus
            placeholder="Flight, airport, airline or tail number" role="combobox" aria-expanded="true" aria-controls="ct-results"
            aria-activedescendant={cur ? `ct-opt-${cur.id}` : undefined}
          />
          {searching && <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>searching…</span>}
          <button className="ibtn" style={{ width: 'auto', padding: '0 8px', height: 26 }} onClick={close} aria-label="Close search"><kbd>esc</kbd></button>
        </div>
        <div className="palette__body">
          <div className="palette__list" id="ct-results" role="listbox" aria-label="Results">
            {items.length === 0 ? (
              <div className="palette__empty">
                <Icon name="search" size={32} strokeWidth={1.3} style={{ color: 'var(--text-4)' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{searching ? 'Searching the sky…' : `Nothing matches “${q}”`}</div>
                <div style={{ fontSize: 13, maxWidth: 360 }}>Try a flight number like BA 117, a callsign like UAL901, an airport like JFK, or a tail number like G-XLEL.</div>
              </div>
            ) : groups.map(([g, list]) => (
              <div key={g}>
                <div className="palette__group label">{g}</div>
                {list.map((it) => {
                  const i = items.indexOf(it);
                  return (
                    <button key={it.id} id={`ct-opt-${it.id}`} role="option" aria-selected={i === active} className="palette__row" onMouseMove={() => i !== active && setActive(i)} onClick={() => run(it)}>
                      <RowIcon it={it} />
                      <span className="palette__row-main">
                        <span className="palette__row-title">{it.title}</span>
                        <span className="palette__row-sub">{it.sub}</span>
                      </span>
                      <span className="palette__row-side mono">{it.side}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {cur && <Preview it={cur} onRun={() => run(cur)} />}
        </div>
        <div className="palette__foot">
          <div className="palette__hints">
            <span><kbd>↑</kbd><kbd>↓</kbd>Move</span>
            <span><kbd>↵</kbd>Open</span>
            <span><kbd>esc</kbd>Close</span>
          </div>
          <span>Live from open ADS-B receivers</span>
        </div>
      </div>
    </>
  );
}

function RowIcon({ it }: { it: Item }) {
  if (it.kind === 'flight' || it.kind === 'airline') {
    const icao = it.kind === 'flight' ? it.ac.cs.slice(0, 3) : it.al.icao;
    const iata = it.kind === 'airline' ? it.al.iata : undefined;
    const t = airlineTile(icao, iata ?? (it.kind === 'flight' ? it.title.split(' ')[0] : undefined));
    return <span className="tile tile--sm" style={{ background: t.bg, color: t.fg, width: 34, height: 34 }}>{t.label.slice(0, 3)}</span>;
  }
  if (it.kind === 'airport') return <span className="tile tile--sm" style={{ background: '#1a2230', color: '#edf0f4', width: 34, height: 34 }}><Icon name="tower" size={18} /></span>;
  return <span className="tile tile--sm" style={{ background: '#13202e', color: '#8cc4f4', width: 34, height: 34 }}><Icon name="globe" size={18} /></span>;
}

function Preview({ it, onRun }: { it: Item; onRun: () => void }) {
  const facts: [string, string][] = [];
  let cta = 'Open';
  if (it.kind === 'flight') {
    const a = it.ac;
    facts.push(['Callsign', a.cs || '—'], ['Aircraft', a.type ? typeName(a.type) : '—'], ['Registration', a.reg || '—'],
      ['Altitude', a.ground ? 'On the ground' : a.alt != null ? `${Math.round(a.alt).toLocaleString('en-US')} ft` : '—'], ['Speed', a.gs != null ? `${a.gs} kt` : '—']);
    cta = 'Show on map';
  } else if (it.kind === 'airport') {
    const a = it.ap;
    facts.push(['City', a.city || '—'], ['Codes', [a.iata, a.icao].filter(Boolean).join(' · ')], ['Elevation', `${a.elev.toLocaleString('en-US')} ft`], ['Position', `${a.lat.toFixed(2)}, ${a.lon.toFixed(2)}`]);
    cta = 'Open airport';
  } else if (it.kind === 'airline') {
    facts.push(['Codes', [it.al.iata, it.al.icao].filter(Boolean).join(' · ')], ['Callsign', it.al.callsign || '—'], ['Country', it.al.country || '—']);
    cta = 'Filter the map';
  } else {
    facts.push(['Coverage', 'Worldwide'], ['Refreshes', 'Every 10 seconds']);
    cta = 'Show on map';
  }
  return (
    <aside className="palette__preview" aria-label="Preview">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RowIcon it={it} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 650, fontStretch: '118%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
          <div style={{ fontSize: 12.5, color: '#8b96a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
        </div>
      </div>
      <dl className="palette__facts">
        {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={onRun}>{cta}<Icon name="arrowRight" size={16} strokeWidth={1.8} /></button>
    </aside>
  );
}
