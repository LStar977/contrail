'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchTraffic, useMetar, useRoutes, useWeather, weatherWords } from '@/lib/api';
import { rowToAircraft, type Aircraft, type Airport, type FlightRoute } from '@/lib/types';
import { angleDiff, bearing, distanceNm, routeProgress, type LonLat } from '@/lib/geo';
import { inferRunways, type RunwayRow } from '@/lib/runways';
import { airlinesReady, airlineTile, flightLabel, loadAirlines } from '@/lib/airlines';
import { typeName } from '@/lib/aircraftTypes';
import { fmtAgo, fmtClock, fmtZone } from '@/lib/format';
import { useStore } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { Icon } from '@/components/ui/Icon';

const AirportRadar = dynamic(() => import('./AirportRadar'), { ssr: false });

type Row = { ac: Aircraft; route: FlightRoute; dist: number; eta: number | null; status: [string, string] };
type Candidate = { a: Aircraft; d: number };

/**
 * Which aircraft get a route lookup (40 callsigns per request). The nearest aircraft at a hub are mostly
 * parked at gates, so pick by intent instead: airborne traffic heading here, soonest first; traffic
 * climbing away; then movements on the airfield, taxiing first.
 */
function boardCandidates(list: Aircraft[], here: LonLat, elev: number) {
  const arriving: Candidate[] = [], leaving: Candidate[] = [], ground: Candidate[] = [];
  for (const a of list) {
    if (!a.cs || !/^[A-Z]{3}\d/.test(a.cs)) continue;
    const pos: LonLat = [a.lon, a.lat];
    const d = distanceNm(here, pos);
    if (a.ground) {
      if (d < 5) ground.push({ a, d });
      continue;
    }
    const away = a.trk != null && angleDiff(a.trk, bearing(here, pos)) < (d < 20 ? 70 : 40);
    // an arrival can't be much higher than a normal ~3° descent from here, so this drops overflights
    const lowEnough = (a.alt ?? 0) - elev < d * 350 + 6000;
    if (away && d < 160 && (a.vr ?? 0) > -300) leaving.push({ a, d });
    else if (lowEnough && (d < 25 || (a.trk != null && angleDiff(a.trk, bearing(pos, here)) < 45))) arriving.push({ a, d });
  }
  const timeTo = ({ a, d }: Candidate) => d / Math.max(140, a.gs ?? 250);
  arriving.sort((x, y) => timeTo(x) - timeTo(y));
  leaving.sort((x, y) => x.d - y.d);
  ground.sort((x, y) => (y.a.gs ?? 0) - (x.a.gs ?? 0));
  const out = leaving.slice(0, 26);
  return { arriving: arriving.slice(0, 40), others: [...out, ...ground.slice(0, 40 - out.length)] };
}
const CAT: Record<string, [string, string]> = {
  VFR: ['rgba(107,222,170,0.12)', '#6bdeaa'], MVFR: ['rgba(140,196,244,0.13)', '#8cc4f4'],
  IFR: ['rgba(247,93,89,0.14)', '#f75d59'], LIFR: ['rgba(215,120,255,0.14)', '#d98cff'],
};

export default function AirportView({ airport, runways }: { airport: Airport; runways: RunwayRow[] }) {
  const now = useNow(15_000) || 0;
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [labels, setLabels] = useState(true);
  const [, force] = useState(0);
  const follow = useStore((s) => s.follow);
  useEffect(() => { loadAirlines().then(() => force((n) => n + 1)).catch(() => {}); }, []);
  const here = useMemo<LonLat>(() => [airport.lon, airport.lat], [airport.lon, airport.lat]);

  const { data: traffic, error } = useSWR(['airport', airport.icao], async () => {
    const { data, measuredBase } = await fetchTraffic(airport.lat, airport.lon, 200);
    return data.ac.map((r) => rowToAircraft(r, measuredBase));
  }, { refreshInterval: 8000, revalidateOnFocus: false, keepPreviousData: true });
  const { data: wx } = useWeather(airport.lat, airport.lon);
  const { data: metar } = useMetar(airport.icao);

  const list = useMemo(() => traffic ?? [], [traffic]);
  const candidates = useMemo(() => boardCandidates(list, here, airport.elev), [list, here, airport.elev]);
  const { data: routesIn } = useRoutes(candidates.arriving.map((c) => c.a.cs));
  const { data: routesOut } = useRoutes(candidates.others.map((c) => c.a.cs));
  const routes = useMemo(() => (routesIn || routesOut ? { ...routesOut, ...routesIn } : undefined), [routesIn, routesOut]);

  const runwayInfo = useMemo(() => inferRunways(list, airport, runways), [list, airport, runways]);
  const within30 = useMemo(() => list.filter((a) => distanceNm(here, [a.lon, a.lat]) <= 30).length, [list, here]);

  const { inbound, outbound } = useMemo(() => {
    const inbound: Row[] = [], outbound: Row[] = [];
    for (const { a, d } of [...candidates.arriving, ...candidates.others]) {
      const route = routes?.[a.cs];
      if (!route?.origin || !route.destination) continue;
      const pos: LonLat = [a.lon, a.lat];
      // a callsign route that the aircraft's own position contradicts belongs to some other flight
      if (!a.ground && !routeProgress([route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat], pos).plausible) continue;
      const agl = (a.alt ?? 0) - airport.elev;
      if (route.destination.icao === airport.icao) {
        if (!a.ground && d > 30 && a.trk != null && angleDiff(a.trk, bearing(pos, here)) > 100) continue;
        const eta = a.ground ? null : now + ((d / Math.max(140, a.gs ?? 250)) * 60 + (d > 30 ? 8 : (d / 30) * 8)) * 60_000;
        const status: [string, string] = a.ground ? ['Landed', 'status'] : d < 12 && agl < 4000 ? ['Final', 'status status--info'] : d < 45 && (agl < 12000 || (a.vr ?? 0) < -200) ? ['Approach', 'status status--climb'] : (a.vr ?? 0) < -400 ? ['Descending', 'status'] : ['En route', 'status status--ok'];
        inbound.push({ ac: a, route, dist: d, eta, status });
      } else if (route.origin.icao === airport.icao) {
        if (!a.ground && d > 30 && a.trk != null && angleDiff(a.trk, bearing(here, pos)) > 100) continue;
        const status: [string, string] = a.ground ? ((a.gs ?? 0) >= 5 ? ['Taxiing', 'status'] : ['On ground', 'status']) : (a.vr ?? 0) > 300 ? ['Climbing', 'status status--climb'] : ['En route', 'status status--ok'];
        outbound.push({ ac: a, route, dist: d, eta: null, status });
      }
    }
    // soonest first: airborne arrivals by ETA, then the ones already down; departures taxiing, then airborne, then parked
    inbound.sort((x, y) => (x.eta ?? Infinity) - (y.eta ?? Infinity) || x.dist - y.dist);
    const stage = (r: Row) => (r.ac.ground ? ((r.ac.gs ?? 0) >= 5 ? 0 : 2) : 1);
    outbound.sort((x, y) => stage(x) - stage(y) || x.dist - y.dist);
    return { inbound, outbound };
  }, [candidates, routes, airport, here, now]);

  const airlines = airlinesReady();
  const rows = tab === 'in' ? inbound : outbound;
  const cat = metar?.category ? CAT[metar.category] : null;
  const usAlt = airport.country === 'US' || airport.country === 'CA';
  const nowDate = new Date(now);

  return (
    <>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px 32px', paddingTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
            <span>Airports</span><span aria-hidden="true">/</span><span>{airport.country}</span>
          </nav>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(48px, 7vw, 76px)', lineHeight: 0.82, fontWeight: 650, fontStretch: '125%', letterSpacing: '-0.035em' }}>{airport.iata || airport.icao}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 2 }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{airport.name}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-2)' }} suppressHydrationWarning>
                {airport.city || airport.country} · <span className="mono" style={{ fontSize: 12.5 }}>{airport.icao}</span>
                {wx && ` · ${fmtClock(nowDate, wx.timezone)} local (${fmtZone(nowDate, wx.timezone)})`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {cat && <span className="status status--plain mono" style={{ height: 28, borderRadius: 8, background: cat[0], color: cat[1] }}>{metar!.category}</span>}
            {runwayInfo.landing.length > 0 && <span className="status status--plain" style={{ height: 28, borderRadius: 8, background: 'rgba(140,196,244,0.12)', color: '#b9daf8' }}>Landing {runwayInfo.landing.join(' · ')}</span>}
            {runwayInfo.departing.length > 0 && <span className="status status--plain" style={{ height: 28, borderRadius: 8, background: 'rgba(248,198,85,0.12)', color: '#f9d98d' }}>Departing {runwayInfo.departing.join(' · ')}</span>}
            {metar?.windKt != null && <span className="status status--plain" style={{ height: 28, borderRadius: 8 }}>Wind {metar.windDir === 'VRB' ? 'variable' : `${metar.windDir}°`} · {metar.windKt} kt{metar.gustKt ? ` gusting ${metar.gustKt}` : ''}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn--primary" href={`/`} onClick={() => sessionStorage.setItem('contrail:flyto', JSON.stringify([airport.lon, airport.lat, 9]))}>Open live map<Icon name="arrowRight" size={16} strokeWidth={1.8} /></Link>
        </div>
      </header>

      <div className="grid-2">
        <section className="card" style={{ position: 'relative', height: 600, overflow: 'hidden' }} aria-label={`Live traffic around ${airport.iata || airport.icao}`}>
          <AirportRadar airport={airport} runways={runways} aircraft={list} active={runwayInfo.active} labels={labels} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 16px 36px', background: 'linear-gradient(180deg, rgba(7,10,16,0.88), rgba(7,10,16,0))', pointerEvents: 'none', zIndex: 2 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Live traffic</h2>
              <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--text-2)' }}>{traffic ? `${within30} aircraft within 30 nm` : 'Connecting…'}</div>
            </div>
            <button className="chip" aria-pressed={labels} onClick={() => setLabels((v) => !v)} style={{ pointerEvents: 'auto' }}><span className="chip__dot" />Data blocks</button>
          </div>
        </section>

        <section className="card" style={{ height: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-label="Arrivals and departures">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px 0', borderBottom: '1px solid var(--line)' }}>
            <div role="tablist" aria-label="Board" style={{ display: 'flex', gap: 20 }}>
              {([['in', 'Arrivals', inbound.length], ['out', 'Departures', outbound.length]] as const).map(([id, label, n]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ height: 42, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, borderBottom: `2px solid ${tab === id ? 'var(--signal)' : 'transparent'}`, background: 'transparent', color: tab === id ? 'var(--text)' : '#8b96a6', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {label}<span className="mono" style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--text-2)' }}>{n}</span>
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', paddingBottom: 12 }}>Within 200 nm · times are estimates</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {!traffic ? (
              <p style={{ padding: 18, color: 'var(--text-2)' }}>{error ? 'Live data is taking a breather, retrying…' : 'Listening for traffic…'}</p>
            ) : rows.length === 0 ? (
              <p style={{ padding: 18, color: 'var(--text-2)', fontSize: 13.5 }}>{routes ? `No ${tab === 'in' ? 'arrivals' : 'departures'} with a published route within 200 nm right now.` : 'Matching routes…'}</p>
            ) : rows.map((r) => {
              const a = airlines?.find((x) => x.icao === r.ac.cs.slice(0, 3));
              const t = airlineTile(a?.icao ?? '', a?.iata);
              const label = flightLabel(r.ac.cs, airlines, r.route.flight);
              const other = tab === 'in' ? r.route.origin! : r.route.destination!;
              const alt = r.ac.ground ? 'Ground' : r.ac.alt == null ? '—' : r.ac.alt >= 18000 ? `FL${Math.round(r.ac.alt / 100)}` : `${Math.round(r.ac.alt).toLocaleString('en-US')} ft`;
              return (
                <div key={r.ac.hex} className="board-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span className="tile" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 9, background: t.bg, color: t.fg }}>{t.label}</span>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/?flight=${r.ac.hex}`} style={{ color: 'var(--text)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>{label}</Link>
                      <div style={{ fontSize: 12, color: '#8b96a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab === 'in' ? 'From ' : 'To '}{other.city || other.name} · {r.ac.type ? typeName(r.ac.type) : '—'}</div>
                    </div>
                  </div>
                  <div className="num board-row__alt" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{alt} <span style={{ color: (r.ac.vr ?? 0) > 300 ? '#f8c655' : '#8cc4f4' }}>{(r.ac.vr ?? 0) > 300 ? '↑' : (r.ac.vr ?? 0) < -300 ? '↓' : ''}</span></div>
                  <div className="num board-row__dist" style={{ fontSize: 13, color: '#c9d1dc' }}>{Math.round(r.dist)} nm</div>
                  <div className="num" style={{ fontSize: 13.5, fontWeight: 600 }}>{r.eta && wx ? fmtClock(new Date(r.eta), wx.timezone) : r.eta ? fmtClock(new Date(r.eta)) : '—'}</div>
                  <div style={{ minWidth: 0 }}><span className={r.status[1]}>{r.status[0]}</span></div>
                  <button className="ibtn" style={{ width: 30, height: 30 }} aria-label={`Follow ${label}`} onClick={() => follow({ hex: r.ac.hex, cs: r.ac.cs, label })}><Icon name="star" size={15} /></button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid-3">
        <section className="card card--pad" aria-label="Weather">
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Weather</h2><span style={{ color: 'var(--text-3)' }}>{metar ? `METAR · ${fmtAgo(now - metar.time)}` : 'Open-Meteo'}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 52, lineHeight: 0.9, fontWeight: 600, fontStretch: '125%', letterSpacing: '-0.03em' }}>{metar?.tempC != null ? Math.round(metar.tempC) : wx ? Math.round(wx.tempC) : '—'}°</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{metar?.clouds?.length ? metar.clouds.map((c) => `${{ FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', CLR: 'Clear', SKC: 'Clear', CAVOK: 'Clear' }[c.cover] ?? c.cover}${c.base ? ` at ${c.base.toLocaleString('en-US')} ft` : ''}`).slice(0, 2).join(', ') : wx ? weatherWords(wx.code) : '—'}</span>
              {metar?.wx && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{metar.wx}</span>}
            </div>
          </div>
          {metar && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '12px 16px', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Wind</div><div style={{ fontSize: 14, fontWeight: 500 }}>{metar.windDir === 'VRB' ? 'Variable' : metar.windDir != null ? `${metar.windDir}°` : '—'} · {metar.windKt ?? '—'} kt</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Visibility</div><div style={{ fontSize: 14, fontWeight: 500 }}>{metar.visibility ? `${metar.visibility} sm` : '—'}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Dew point</div><div style={{ fontSize: 14, fontWeight: 500 }}>{metar.dewC != null ? `${Math.round(metar.dewC)}°` : '—'}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{usAlt ? 'Altimeter' : 'QNH'}</div><div style={{ fontSize: 14, fontWeight: 500 }}>{metar.altimeterHpa != null ? (usAlt ? `${(metar.altimeterHpa * 0.02953).toFixed(2)} inHg` : `${Math.round(metar.altimeterHpa)} hPa`) : '—'}</div></div>
            </div>
          )}
          {metar && <code style={{ display: 'block', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-2)', wordBreak: 'break-word' }}>{metar.raw}</code>}
        </section>

        <section className="card card--pad" aria-label="Runways">
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Runways</h2><span style={{ color: 'var(--text-3)' }}>Use inferred from live traffic</span></div>
          <RunwayDiagram runways={runways} landing={runwayInfo.landing} departing={runwayInfo.departing} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 18, height: 5, borderRadius: 2, background: '#8cc4f4' }} /><span style={{ color: 'var(--text-2)', width: 78 }}>Landing</span><span className="mono">{runwayInfo.landing.join(' · ') || '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 18, height: 5, borderRadius: 2, background: '#f8c655' }} /><span style={{ color: 'var(--text-2)', width: 78 }}>Departing</span><span className="mono">{runwayInfo.departing.join(' · ') || '—'}</span></div>
            {!runwayInfo.landing.length && !runwayInfo.departing.length && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Not enough traffic close in right now to tell which way they’re operating.</div>}
          </div>
        </section>

        <section className="card card--pad" aria-label="Right now">
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Right now</h2><span style={{ color: 'var(--text-3)' }}>Updated every 8 s</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
            {([['Within 30 nm', within30], ['Arriving', inbound.filter((r) => !r.ac.ground).length], ['Departed', outbound.filter((r) => !r.ac.ground).length], ['Within 200 nm', list.length]] as const).map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 34, lineHeight: 1, fontWeight: 600, fontStretch: '125%', letterSpacing: '-0.02em' }} className="num">{traffic ? v : '—'}</div><div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>{k}</div></div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Arrivals and departures are matched by callsign route and only include flights currently in receiver range.</p>
        </section>
      </div>
    </>
  );
}

function RunwayDiagram({ runways, landing, departing }: { runways: RunwayRow[]; landing: string[]; departing: string[] }) {
  if (!runways.length) return <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>No runway data for this airport.</p>;
  const lat0 = (runways[0][1] * Math.PI) / 180;
  const pts = runways.flatMap((r) => [[r[2] * Math.cos(lat0), -r[1]], [r[5] * Math.cos(lat0), -r[4]]]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 240, H = 170, pad = 30;
  const k = Math.min((W - 2 * pad) / Math.max(1e-6, maxX - minX), (H - 2 * pad) / Math.max(1e-6, maxY - minY));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const P = (lon: number, lat: number): [number, number] => [ox + (lon * Math.cos(lat0) - minX) * k, oy + (-lat - minY) * k];
  const strip = (s: string) => s.replace(/^0(?=\d)/, '');
  const ink = (id: string) => (landing.includes(id) ? '#b9daf8' : departing.includes(id) ? '#f9d98d' : '#7f8a99');
  const strips = runways.map((r) => {
    const a = P(r[2], r[1]), b = P(r[5], r[4]);
    const lo = strip(r[0]), hi = strip(r[3]);
    const isLand = landing.includes(lo) || landing.includes(hi);
    const isDep = departing.includes(lo) || departing.includes(hi);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return { a, b, lo, hi, ux: dx / len, uy: dy / len, active: isLand || isDep, color: isLand ? '#8cc4f4' : isDep ? '#f8c655' : '#2b3443' };
  }).sort((x, y) => Number(x.active) - Number(y.active)); // runways in use draw on top
  const label = (id: string, [x, y]: [number, number]) => (
    <text x={x} y={y + 3} textAnchor="middle" fill={ink(id)} stroke="#0b0e14" strokeWidth="3" paintOrder="stroke" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)">{id}</text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Runway diagram${landing.length ? `, landing ${landing.join(' and ')}` : ''}${departing.length ? `, departing ${departing.join(' and ')}` : ''}`} style={{ display: 'block', width: '100%', maxWidth: 340, height: 'auto', margin: '0 auto' }}>
      {strips.map((s, i) => (
        <g key={i}>
          <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.color} strokeWidth="7" />
          <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="#070a10" strokeWidth="1" strokeDasharray="4 4" />
        </g>
      ))}
      {/* labels after every strip so a crossing runway never covers them */}
      {strips.map((s, i) => (
        <g key={`l${i}`}>
          {label(s.lo, [s.a[0] - s.ux * 12, s.a[1] - s.uy * 12])}
          {label(s.hi, [s.b[0] + s.ux * 12, s.b[1] + s.uy * 12])}
        </g>
      ))}
    </svg>
  );
}
