'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapController } from '@/components/map/MapController';
import { circle, type LonLat } from '@/lib/geo';
import type { Aircraft, Airport } from '@/lib/types';
import type { RunwayRow } from '@/lib/runways';

/** Live approach radar for one airport, built on the same map engine as the main map. */
export default function AirportRadar({ airport, runways, aircraft, active, labels }: { airport: Airport; runways: RunwayRow[]; aircraft: Aircraft[]; active: number[]; labels: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<MapController | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!el.current) return;
    const c = new MapController(el.current, { center: [airport.lon, airport.lat], zoom: 8, minZoom: 5, maxZoom: 13 });
    const off = c.on('select', (hex) => { if (hex) router.push(`/?flight=${hex}`); });
    const ring = circle([airport.lon, airport.lat], 26);
    const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
    c.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 12, duration: 0 });
    c.setLayers({ trails: true, airports: true, night: false });
    setCtrl(c);
    return () => {
      off();
      c.destroy();
    };
  }, [airport.lon, airport.lat, router]);

  useEffect(() => {
    ctrl?.setDecorations({
      center: [airport.lon, airport.lat],
      radii: [5, 10, 20, 30],
      runways: runways.map((r) => [[r[2], r[1]], [r[5], r[4]]] as [LonLat, LonLat]),
      active,
    });
  }, [ctrl, airport, runways, active]);
  useEffect(() => { ctrl?.setTraffic(aircraft); }, [ctrl, aircraft]);
  useEffect(() => { ctrl?.setLabels(labels); }, [ctrl, labels]);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} role="application" aria-label={`Live traffic around ${airport.name}`} />;
}
