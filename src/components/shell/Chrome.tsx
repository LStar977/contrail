'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useStore } from '@/lib/store';
import { ALTITUDE_GRADIENT_CSS } from '@/lib/altitude';
import { fetchAircraft, useRoutes } from '@/lib/api';
import { airlinesReady, airlineTile, loadAirlines } from '@/lib/airlines';
import { routeProgress } from '@/lib/geo';
import { routeFitsTrack } from '@/lib/flight';
import { fmtDuration, fmtUtc } from '@/lib/format';
import { Icon, Logo } from '@/components/ui/Icon';
import { useMapController } from '@/components/map/MapContext';
import { useLandingAlerts } from '@/components/following/useLandingAlerts';
import { useNow } from '@/lib/hooks';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Contrail home">
      <Logo />
      {!compact && <span className="brand__word">contrail</span>}
    </Link>
  );
}

function useClock() {
  const t = useNow(15_000);
  return t ? new Date(t) : null;
}

export function TopBar() {
  const inView = useStore((s) => s.inView);
  const stale = useStore((s) => s.stale || !!s.error);
  const setPalette = useStore((s) => s.setPalette);
  const now = useClock();
  return (
    <header className="topbar">
      <Brand />
      <button className="searchbtn glass" onClick={() => setPalette(true)} aria-label="Search flights, airports and aircraft (⌘K)">
        <Icon name="search" size={18} />
        <span>Search flights, airports, tail numbers</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="stats glass" aria-live="polite">
        <span className={`stats__dot${stale ? ' is-stale' : ''}`} />
        <span className="num" style={{ fontWeight: 600 }}>{inView ? inView.toLocaleString('en-US') : '—'}</span>
        <span style={{ color: 'var(--text-2)' }}>in view</span>
        <span className="stats__sep" />
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }} suppressHydrationWarning>{now ? fmtUtc(now) : ''}</span>
      </div>
    </header>
  );
}

export function Rail({ active }: { active: 'map' | 'airports' | 'following' | 'overhead' }) {
  const count = useStore((s) => s.followed.length);
  const setPalette = useStore((s) => s.setPalette);
  return (
    <nav className="rail glass" aria-label="Primary">
      <Link href="/" className="ibtn" aria-label="Live map" aria-current={active === 'map' ? 'page' : undefined}><Icon name="globe" /></Link>
      <button className={`ibtn${active === 'airports' ? ' is-active' : ''}`} aria-label="Find an airport" onClick={() => setPalette(true)}><Icon name="tower" /></button>
      <Link href="/following" className="ibtn" aria-label={`Following, ${count} flights`} aria-current={active === 'following' ? 'page' : undefined}>
        <Icon name="star" />
        {count > 0 && <span className="badge">{count}</span>}
      </Link>
      <Link href="/overhead" className="ibtn" aria-label="What’s overhead" aria-current={active === 'overhead' ? 'page' : undefined}><Icon name="overhead" /></Link>
    </nav>
  );
}

export function Legend() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const chips: [keyof typeof layers, string][] = [['trails', 'Trails'], ['airports', 'Airports'], ['night', 'Day & night']];
  return (
    <section className="legend glass" aria-label="Map layers">
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ color: 'var(--text-2)' }}>Altitude</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>feet</span>
        </div>
        <div className="legend__ramp" style={{ background: ALTITUDE_GRADIENT_CSS }} />
        <div className="legend__ticks"><span>0</span><span>10k</span><span>20k</span><span>30k</span><span>40k+</span></div>
      </div>
      <div className="legend__chips">
        {chips.map(([k, label]) => (
          <button key={k} className="chip" aria-pressed={layers[k]} onClick={() => toggle(k)}>
            <span className="chip__dot" />{label}
          </button>
        ))}
        {filter && (
          <button className="chip" aria-pressed="true" onClick={() => setFilter(null)} aria-label={`Clear filter ${filter.label}`}>
            <span className="chip__dot" />{filter.label}<Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="legend__credit">
        Aircraft <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> (ODbL), <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a> · Map <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
      </div>
    </section>
  );
}

/** Followed flights, kept fresh with a batched hex lookup even when they're off-screen. */
export function useFollowedLive() {
  const followed = useStore((s) => s.followed);
  const upsert = useStore((s) => s.upsert);
  const hexes = followed.map((f) => f.hex).sort().join(',');
  const { data } = useSWR(hexes ? `followed:${hexes}` : null, () => fetchAircraft(`hex=${hexes}`), { refreshInterval: 15_000, revalidateOnFocus: false });
  useEffect(() => { if (data?.length) upsert(data); }, [data, upsert]);
  const aircraft = useStore((s) => s.aircraft);
  const { data: routes } = useRoutes(followed.map((f) => f.cs).filter(Boolean));
  const now = useNow(15_000);
  return followed.map((f) => {
    const ac = aircraft.get(f.hex) ?? null;
    const route = f.cs ? routes?.[f.cs] ?? null : null;
    let frac: number | null = null;
    let leftMin: number | null = null;
    if (ac && route?.origin && route.destination) {
      const p = routeProgress([route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat], [ac.lon, ac.lat]);
      if (p.plausible && routeFitsTrack(route, ac)) {
        frac = p.frac;
        if (!ac.ground) leftMin = (p.left / Math.max(160, ac.gs ?? 420)) * 60 + (p.left > 120 ? 14 : (p.left / 120) * 14);
      }
    }
    const seen = ac ? now - ac.t < 5 * 60_000 : false;
    return { ...f, ac, route, frac, leftMin, seen };
  });
}

export function Dock() {
  const items = useFollowedLive();
  useLandingAlerts(items);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const setPalette = useStore((s) => s.setPalette);
  const ctrl = useMapController();
  const [, force] = useState(0);
  useEffect(() => { loadAirlines().then(() => force((n) => n + 1)).catch(() => {}); }, []);
  if (!items.length) return null;
  const airlines = airlinesReady();
  return (
    <nav className="dock glass" aria-label="Flights you follow">
      <span className="dock__star" aria-hidden="true"><Icon name="star" size={16} fill="currentColor" strokeWidth={0} /></span>
      <div className="dock__list">
        {items.map((it) => {
          const icao = it.cs.slice(0, 3);
          const a = airlines?.find((x) => x.icao === icao);
          const tile = airlineTile(a?.icao ?? '', a?.iata);
          const status = !it.seen ? 'Not live' : it.ac?.ground ? 'On ground' : it.leftMin != null ? fmtDuration(it.leftMin) : 'Airborne';
          return (
            <button key={it.hex} className="dock__item" aria-pressed={selected === it.hex} aria-label={`${it.label}, ${status}`}
              onClick={() => {
                select(it.hex);
                const p = it.ac ? ctrl.current?.positionOf(it.hex) : null;
                if (p) ctrl.current?.flyTo(p);
              }}>
              <span className="tile tile--xs" style={{ background: tile.bg, color: tile.fg }}>{a ? tile.label : '·'}</span>
              <span className="dock__meta">
                <span className="dock__num">{it.label}</span>
                <span className="dock__row">
                  <span className="dock__bar"><span style={{ width: `${Math.round((it.frac ?? 0) * 100)}%` }} /></span>
                  <span className="dock__left">{status}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button className="ibtn dock__add" aria-label="Follow another flight" onClick={() => setPalette(true)}><Icon name="plus" size={18} /></button>
    </nav>
  );
}

export function MapControls() {
  const ctrl = useMapController();
  const [locating, setLocating] = useState(false);
  return (
    <div className="controls">
      <div className="controls__group glass">
        <button className="ibtn" aria-label="Zoom in" onClick={() => ctrl.current?.map.zoomIn()}><Icon name="plus" size={18} /></button>
        <span className="controls__sep" />
        <button className="ibtn" aria-label="Zoom out" onClick={() => ctrl.current?.map.zoomOut()}><Icon name="minus" size={18} /></button>
      </div>
      <button className="ibtn glass" aria-label="Show my location" aria-busy={locating} onClick={() => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (p) => { setLocating(false); ctrl.current?.flyTo([p.coords.longitude, p.coords.latitude], 8); },
          () => setLocating(false),
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
        );
      }}><Icon name="locate" size={18} /></button>
    </div>
  );
}

export function TabBar({ active }: { active: 'map' | 'overhead' | 'following' }) {
  const tabs = useMemo(() => [
    { id: 'map', href: '/', label: 'Map', icon: 'globe' as const },
    { id: 'overhead', href: '/overhead', label: 'Overhead', icon: 'overhead' as const },
    { id: 'following', href: '/following', label: 'Following', icon: 'star' as const },
  ], []);
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={active === t.id ? 'page' : undefined}>
          <Icon name={t.icon} size={24} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Notice() {
  const error = useStore((s) => s.error);
  const filter = useStore((s) => s.filter);
  const inView = useStore((s) => s.inView);
  const updatedAt = useStore((s) => s.updatedAt);
  const partial = useStore((s) => s.partial);
  const msg = error ?? (filter ? `Showing ${filter.label} only`
    : partial ? 'The live feed is busy, so this shows traffic near the middle of the map for now.'
      : updatedAt && inView === 0 ? 'No aircraft with live positions here right now. Ocean areas have no free receiver coverage.' : null);
  if (!msg) return null;
  return <div className="notice glass" role="status">{msg}</div>;
}
