'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { Dock, Legend, MapControls, Notice, Rail, TabBar, TopBar } from '@/components/shell/Chrome';
import FlightPanel from '@/components/panel/FlightPanel';
import CommandPalette from '@/components/search/CommandPalette';
import { useMapController } from '@/components/map/MapContext';
import { startView } from '@/lib/startView';

// MapLibre and deck.gl need the browser.
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

export default function LiveApp() {
  const selected = useStore((s) => s.selected);
  const selectedAc = useStore((s) => (s.selected ? s.aircraft.get(s.selected) : undefined));
  const ctrl = useMapController();
  const flewTo = useRef<string | null>(null);
  // "Open live map" from an airport page hands over a place to start from
  const [start] = useState<{ center?: [number, number]; zoom?: number }>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const v = sessionStorage.getItem('contrail:flyto');
      sessionStorage.removeItem('contrail:flyto');
      if (v) { const [lon, lat, zoom] = JSON.parse(v) as number[]; return { center: [lon, lat], zoom }; }
    } catch {}
    return startView();
  });

  // deep links: /?flight=<icao hex>
  useEffect(() => {
    const hex = new URLSearchParams(location.search).get('flight');
    if (hex && /^[0-9a-f]{6}$/i.test(hex)) useStore.getState().select(hex.toLowerCase());
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set('flight', selected); else url.searchParams.delete('flight');
    history.replaceState(history.state, '', url.toString());
  }, [selected]);

  // bring a newly selected aircraft into view once we know where it is
  useEffect(() => {
    if (!selected || !selectedAc || flewTo.current === selected) return;
    flewTo.current = selected;
    const c = ctrl.current;
    if (!c) return;
    const wide = window.innerWidth > 860;
    c.ensureVisible(selected, { right: wide ? 420 : 0, bottom: wide ? 0 : Math.round(window.innerHeight * 0.3) });
  }, [ctrl, selected, selectedAc]);

  // Escape closes the flight panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useStore.getState().paletteOpen) useStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <main className={`app${selected ? ' has-panel' : ''}`}>
        <h1 className="sr-only">Contrail live flight map</h1>
        <MapView initialCenter={start.center} initialZoom={start.zoom} />
        <div className="scrim-top" />
        <div className="scrim-bottom" />
        <TopBar />
        <Rail active="map" />
        <Notice />
        <Legend />
        <Dock />
        <MapControls />
        <FlightPanel />
        <TabBar active="map" />
      </main>
      <CommandPalette />
    </>
  );
}
