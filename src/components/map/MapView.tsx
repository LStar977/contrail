'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapController, type HoverInfo, type Viewport } from './MapController';
import { setLiveMap } from './MapContext';
import { useStore } from '@/lib/store';
import { fetchAircraft, fetchTraffic, useRoute, useTrace } from '@/lib/api';
import { loadAirports } from '@/lib/airports';
import { rowToAircraft } from '@/lib/types';
import { routeProgress, wrap180 } from '@/lib/geo';
import { airlinesReady, flightLabel } from '@/lib/airlines';
import HoverCard from './HoverCard';
import { routeFitsTrack, routeMatchesTrace } from '@/lib/flight';

const POLL_MS = 10_000;

export default function MapView({ initialCenter, initialZoom }: { initialCenter?: [number, number]; initialZoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<MapController | null>(null);
  const [hover, setHover] = useState<HoverInfo>(null);

  const selected = useStore((s) => s.selected);
  const followed = useStore((s) => s.followed);
  const layers = useStore((s) => s.layers);
  const filter = useStore((s) => s.filter);
  const selectedAc = useStore((s) => (s.selected ? s.aircraft.get(s.selected) : undefined));

  // ---- create the map once
  useEffect(() => {
    if (!el.current) return;
    const c = new MapController(el.current, { center: initialCenter, zoom: initialZoom });
    setLiveMap(c);
    setCtrl(c);
    const offSelect = c.on('select', (hex) => useStore.getState().select(hex));
    const offHover = c.on('hover', setHover);
    loadAirports().then((list) => c.setAirports(list)).catch(() => {});
    return () => {
      offSelect();
      offHover();
      setLiveMap(null);
      c.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- live traffic polling for whatever the map is showing
  useEffect(() => {
    if (!ctrl) return;
    let vp: Viewport | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    let failures = 0;
    let abort: AbortController | null = null;

    const poll = async () => {
      if (!vp || document.hidden) return schedule(POLL_MS);
      last = Date.now();
      abort?.abort();
      abort = new AbortController();
      const r = Math.min(3000, Math.max(30, vp.radiusNm * 1.12));
      const f = useStore.getState().filter;
      try {
        let list;
        let stale = false;
        let partial = false;
        if (f && f.kind !== 'airline') {
          // worldwide lookups: every A380 in the air, all military traffic, squawk 7700…
          list = await fetchAircraft(f.kind === 'type' ? `type=${f.value}` : f.kind === 'mil' ? 'mil=1' : `sqk=${f.value}`);
        } else {
          const { data, measuredBase } = await fetchTraffic(vp.center[1], wrap180(vp.center[0]), r, abort.signal);
          list = data.ac.map((row) => rowToAircraft(row, measuredBase));
          stale = !!data.stale;
          partial = !!data.partial;
        }
        ctrl.setTraffic(list);
        useStore.getState().setTraffic(list, Date.now(), stale, partial);
        failures = 0;
        // zoomed-out views are heavy for the free feed: refresh them half as often
        schedule(r > 600 ? POLL_MS * 2 : POLL_MS);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        failures++;
        useStore.getState().setError(failures > 1 ? 'Live data is taking a breather. Retrying…' : null);
        schedule(Math.min(60_000, POLL_MS * 2 ** failures));
      }
    };
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };
    const onViewport = (v: Viewport) => {
      vp = v;
      // move-driven refresh, but never more often than every 2.5 s
      schedule(Math.max(350, 2500 - (Date.now() - last)));
    };
    const offViewport = ctrl.on('viewport', onViewport);
    const initial = ctrl.getViewport();
    if (initial) onViewport(initial);
    const onVis = () => { if (!document.hidden) schedule(200); };
    document.addEventListener('visibilitychange', onVis);
    const unsub = useStore.subscribe((s, prev) => { if (s.filter !== prev.filter) schedule(50); });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      abort?.abort();
      document.removeEventListener('visibilitychange', onVis);
      offViewport();
    };
  }, [ctrl]);

  // ---- store → map
  useEffect(() => { ctrl?.setSelected(selected); }, [ctrl, selected]);
  useEffect(() => { ctrl?.setFollowed(followed.map((f) => f.hex)); }, [ctrl, followed]);
  useEffect(() => { ctrl?.setLayers(layers); }, [ctrl, layers]);
  useEffect(() => {
    if (!ctrl) return;
    if (!filter) return ctrl.setFilter(null);
    const v = filter.value;
    ctrl.setFilter(
      filter.kind === 'airline' ? (a) => a.cs.startsWith(v)
        : filter.kind === 'type' ? (a) => a.type === v
          : filter.kind === 'mil' ? (a) => a.mil
            : (a) => a.sq === v,
    );
  }, [ctrl, filter]);
  useEffect(() => {
    // keep the map's copy of the selected aircraft as fresh as the store's (hex lookups land in the store)
    if (ctrl && selectedAc) ctrl.upsert([selectedAc]);
  }, [ctrl, selectedAc]);

  // ---- selected flight path
  const { data: route } = useRoute(selectedAc?.cs || null);
  const { data: trace } = useTrace(selected);
  useEffect(() => {
    if (!ctrl) return;
    if (!selected) return ctrl.setRoute(null);
    let o = route?.origin, d = route?.destination;
    if (o && d && selectedAc && (!routeProgress([o.lon, o.lat], [d.lon, d.lat], [selectedAc.lon, selectedAc.lat]).plausible || !routeMatchesTrace(route, trace) || !routeFitsTrack(route, selectedAc))) {
      o = undefined;
      d = undefined;
    }
    ctrl.setRoute({
      trace: trace?.pts ?? null,
      origin: o ? [o.lon, o.lat] : null,
      dest: d ? [d.lon, d.lat] : null,
      originLabel: o ? o.iata || o.icao : undefined,
      destLabel: d ? d.iata || d.icao : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl, selected, route, trace, !!selectedAc]);

  const label = selectedAc ? flightLabel(selectedAc.cs, airlinesReady(), route?.flight) || selectedAc.reg || selectedAc.hex.toUpperCase() : '';
  const meta = selectedAc
    ? selectedAc.ground ? 'On ground' : `${selectedAc.alt != null ? (selectedAc.alt >= 18000 ? 'FL' + String(Math.round(selectedAc.alt / 100)).padStart(3, '0') : Math.round(selectedAc.alt).toLocaleString('en-US') + ' ft') : '—'} · ${selectedAc.gs ?? '—'} kt`
    : '';

  return (
    <>
      <div ref={el} className="app__map" role="application" aria-label="Live flight map. Select an aircraft to see its flight." />
      {ctrl && selected && selectedAc &&
        createPortal(
          <>
            <span className="ct-glow" />
            <span className="ct-halo" />
            <span className="ct-halo ct-halo--2" />
            <span className="ct-tag">
              <span className="ct-tag__num">{label}</span>
              <span className="ct-tag__meta">{meta}</span>
            </span>
          </>,
          ctrl.selectedEl,
        )}
      {hover && hover.hex !== selected && <HoverCard info={hover} />}
    </>
  );
}
