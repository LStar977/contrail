'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { fetchTraffic, useWeather } from '@/lib/api';
import { rowToAircraft, type Aircraft } from '@/lib/types';
import { advance, bearing, compass16, compassWords, distanceNm, type LonLat } from '@/lib/geo';
import { altitudeRGB, rgbCss } from '@/lib/altitude';
import { airlinesReady, airlineTile, flightLabel, loadAirlines } from '@/lib/airlines';
import { glyphFor, typeName } from '@/lib/aircraftTypes';
import { GLYPH_PATHS } from '@/components/map/aircraftIcons';
import { Icon } from '@/components/ui/Icon';
import { useLocalStorage, useNow } from '@/lib/hooks';

type Here = { lat: number; lon: number; label: string };
const KEY = 'contrail:here';
const RANGE_NM = 15;
const DEMOS: Here[] = [
  { lat: 40.6782, lon: -73.9442, label: 'Brooklyn, New York' },
  { lat: 51.4613, lon: -0.3037, label: 'Richmond, London' },
  { lat: 33.9164, lon: -118.3526, label: 'Hawthorne, Los Angeles' },
  { lat: 35.6595, lon: 139.7005, label: 'Shibuya, Tokyo' },
];

type Sighting = { ac: Aircraft; pos: LonLat; dist: number; brg: number; elev: number };

export default function OverheadView() {
  const [stored, setStored] = useLocalStorage(KEY);
  const here = useMemo<Here | null>(() => {
    try { return stored ? (JSON.parse(stored) as Here) : null; } catch { return null; }
  }, [stored]);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mode, setMode] = useState<'radar' | 'sky'>('radar');
  const [sel, setSel] = useState<string | null>(null);
  const [, force] = useState(0);
  const now = useNow(1000);

  useEffect(() => {
    loadAirlines().then(() => force((n) => n + 1)).catch(() => {});
  }, []);
  const choose = (h: Here) => {
    setSel(null);
    setStored(JSON.stringify(h));
  };
  const locate = () => {
    if (!navigator.geolocation) { setGeoError('This browser can’t share its location.'); return; }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); choose({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), label: 'Your location' }); },
      (e) => { setLocating(false); setGeoError(e.code === 1 ? 'Location permission was declined. Pick a place below instead.' : 'Couldn’t get your location. Pick a place below instead.'); },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  };

  const { data, error } = useSWR(here ? ['overhead', here.lat, here.lon] : null, async () => {
    const { data, measuredBase } = await fetchTraffic(here!.lat, here!.lon, 25);
    return data.ac.map((r) => rowToAircraft(r, measuredBase));
  }, { refreshInterval: 6000, revalidateOnFocus: false, keepPreviousData: true });
  const { data: wx } = useWeather(here?.lat, here?.lon, { upper: true });

  const sightings = useMemo<Sighting[]>(() => {
    if (!here || !data) return [];
    const me: LonLat = [here.lon, here.lat];
    const out: Sighting[] = [];
    for (const ac of data) {
      if (ac.ground || ac.alt == null) continue;
      const dt = Math.min(60, Math.max(0, (now - ac.t) / 1000));
      const pos = ac.gs != null && ac.trk != null ? advance(ac.lon, ac.lat, ac.trk, ac.gs, dt) : ([ac.lon, ac.lat] as LonLat);
      const dist = distanceNm(me, pos);
      if (dist > RANGE_NM) continue;
      const elev = (Math.atan2(ac.alt * 0.3048, Math.max(dist, 0.05) * 1852) * 180) / Math.PI;
      out.push({ ac, pos, dist, brg: bearing(me, pos), elev });
    }
    return out.sort((a, b) => b.elev - a.elev);
  }, [here, data, now]);

  const selected = sightings.find((s) => s.ac.hex === sel) ?? sightings[0] ?? null;
  const airlines = airlinesReady();
  const contrail = (s: Sighting) => (s.ac.alt ?? 0) >= 26000 && (wx?.t250 == null ? (s.ac.alt ?? 0) >= 31000 : wx.t250 <= -40 && (wx.rh250 ?? 0) >= 50);

  if (!here) {
    return (
      <>
        <Header />
        <section className="card card--pad" style={{ maxWidth: 640, gap: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>What’s flying over you right now?</div>
          <p style={{ margin: 0, color: 'var(--text-2)' }}>Contrail works out every aircraft within {RANGE_NM} nautical miles, how high it is, and exactly where to look. Your location stays in this browser.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={locate} aria-busy={locating}><Icon name="locate" size={18} />{locating ? 'Locating…' : 'Use my location'}</button>
          </div>
          {geoError && <p style={{ margin: 0, color: 'var(--warn)', fontSize: 13 }}>{geoError}</p>}
          <div className="label" style={{ marginTop: 6 }}>Or look up from</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DEMOS.map((d) => <button key={d.label} className="chip" onClick={() => choose(d)}><span className="chip__dot" />{d.label}</button>)}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--text-2)' }}>
            <Icon name="pin" size={16} style={{ color: '#5aa9f0' }} />{here.label} · {sightings.length} aircraft within {RANGE_NM} nm
          </span>
          <button className="chip" onClick={() => setStored(null)}>Change place</button>
        </div>
      </Header>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div role="group" aria-label="View" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
            {(['radar', 'sky'] as const).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} style={{ height: 40, border: 0, borderRadius: 11, cursor: 'pointer', fontWeight: 600, background: mode === m ? '#1d2532' : 'transparent', color: mode === m ? 'var(--text)' : '#8b96a6' }}>
                {m === 'radar' ? 'Radar' : 'Sky view'}
              </button>
            ))}
          </div>
          {mode === 'radar' ? <Radar sightings={sightings} selected={selected?.ac.hex ?? null} onPick={setSel} /> : <Sky sightings={sightings} selected={selected?.ac.hex ?? null} onPick={setSel} />}
          {error && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--warn)' }}>Live data is taking a breather, retrying…</p>}
          {!sightings.length && data && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Nothing within {RANGE_NM} nm right now. Quiet skies, or no receiver close enough to hear them.</p>}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected && <SelectedCard s={selected} airlines={airlines} contrail={contrail(selected)} />}
          <section className="card" style={{ padding: 8 }} aria-label="All aircraft overhead">
            <div className="label" style={{ padding: '10px 12px 6px' }}>Highest in the sky first</div>
            {sightings.slice(0, 30).map((s) => {
              const label = flightLabel(s.ac.cs, airlines) || s.ac.reg || s.ac.hex.toUpperCase();
              const a = airlines?.find((x) => x.icao === s.ac.cs.slice(0, 3));
              const t = airlineTile(a?.icao ?? '', a?.iata);
              const on = selected?.ac.hex === s.ac.hex;
              return (
                <button key={s.ac.hex} onClick={() => setSel(s.ac.hex)} aria-pressed={on} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 10px', border: 0, borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(251,108,43,0.1)' : 'transparent', color: 'var(--text)' }}>
                  <span className="tile tile--sm" style={{ background: t.bg, color: t.fg, width: 34, height: 34 }}>{a ? t.label : fallbackTile(s.ac)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label} <span style={{ fontWeight: 400, color: '#8b96a6' }}>· {s.ac.type ? typeName(s.ac.type) : 'Unknown type'}</span></span>
                    <span style={{ display: 'block', fontSize: 12.5, color: '#8b96a6' }}>{Math.round(s.ac.alt ?? 0).toLocaleString('en-US')} ft{(s.ac.vr ?? 0) > 400 ? ' · climbing' : (s.ac.vr ?? 0) < -400 ? ' · descending' : ''}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 650 }} className="num">{Math.round(s.elev)}° up</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8b96a6' }}>{compass16(s.brg)} · {s.dist.toFixed(1)} nm</span>
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      </div>
    </>
  );
}

const fallbackTile = (ac: Aircraft) => (/^[A-Z]{3}\d/.test(ac.cs) ? ac.cs.slice(0, 3) : glyphFor(ac.type, ac.cat) === 'heli' ? 'H' : 'GA');

function Header({ children }: { children?: ReactNode }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1, fontWeight: 650, fontStretch: '125%', letterSpacing: '-0.02em' }}>Overhead</h1>
      {children}
    </header>
  );
}

function Glyph({ ac, color, size, rotate }: { ac: Aircraft; color: string; size: number; rotate: number }) {
  const g = glyphFor(ac.type, ac.cat);
  return (
    <g transform={`rotate(${rotate}) scale(${size / 22})`}>
      {g === 'heli' && <circle r="8.6" fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="2.2 2.2" />}
      {GLYPH_PATHS[g].map((d, i) => <path key={i} d={d} fill={color} stroke="#070a10" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" />)}
    </g>
  );
}

function Radar({ sightings, selected, onPick }: { sightings: Sighting[]; selected: string | null; onPick: (hex: string) => void }) {
  const R = 160;
  const k = R / RANGE_NM;
  const sel = sightings.find((s) => s.ac.hex === selected);
  return (
    <div style={{ position: 'relative', aspectRatio: '1 / 1', maxWidth: 520, width: '100%', margin: '0 auto' }}>
      <svg viewBox="-190 -190 380 380" role="img" aria-label={`Radar, north up, ${sightings.length} aircraft within ${RANGE_NM} nautical miles`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <radialGradient id="ov-bg"><stop offset="0" stopColor="rgba(140,196,244,0.07)" /><stop offset="1" stopColor="rgba(140,196,244,0.01)" /></radialGradient>
          <linearGradient id="ov-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(140,196,244,0)" /><stop offset="1" stopColor="rgba(140,196,244,0.22)" /></linearGradient>
        </defs>
        <circle r={R} fill="url(#ov-bg)" stroke="rgba(140,196,244,0.25)" />
        {[5, 10].map((nm) => <circle key={nm} r={nm * k} fill="none" stroke="rgba(140,196,244,0.14)" />)}
        <line x1={-R} y1="0" x2={R} y2="0" stroke="rgba(140,196,244,0.08)" />
        <line x1="0" y1={-R} x2="0" y2={R} stroke="rgba(140,196,244,0.08)" />
        <g style={{ transformOrigin: '0 0', animation: 'ct-sweep 5s linear infinite' }}>
          <path d={`M0 0 L${R} 0 A${R} ${R} 0 0 0 ${R * Math.cos(-0.9)} ${R * Math.sin(-0.9)} Z`} fill="url(#ov-sweep)" />
        </g>
        <text x="0" y={-R - 10} textAnchor="middle" fill="#fb6c2b" fontSize="12" fontWeight="600" fontFamily="var(--font-mono)">N</text>
        <text x={R + 12} y="4" textAnchor="middle" fill="#7f8a99" fontSize="11" fontFamily="var(--font-mono)">E</text>
        <text x="0" y={R + 18} textAnchor="middle" fill="#7f8a99" fontSize="11" fontFamily="var(--font-mono)">S</text>
        <text x={-R - 12} y="4" textAnchor="middle" fill="#7f8a99" fontSize="11" fontFamily="var(--font-mono)">W</text>
        {[5, 10, 15].map((nm) => <text key={nm} x={nm * k * 0.707 + 4} y={nm * k * 0.707 + 12} fill="rgba(140,196,244,0.55)" fontSize="9" fontFamily="var(--font-mono)">{nm === 15 ? '15 nm' : nm}</text>)}
        {sel && <line x1="0" y1="0" x2={Math.sin((sel.brg * Math.PI) / 180) * sel.dist * k} y2={-Math.cos((sel.brg * Math.PI) / 180) * sel.dist * k} stroke="rgba(251,108,43,0.6)" strokeDasharray="3 4" />}
        {sightings.map((s) => {
          const x = Math.sin((s.brg * Math.PI) / 180) * s.dist * k;
          const y = -Math.cos((s.brg * Math.PI) / 180) * s.dist * k;
          const on = s.ac.hex === selected;
          const color = on ? '#fb6c2b' : rgbCss(altitudeRGB(s.ac.alt));
          return (
            <g key={s.ac.hex} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ cursor: 'pointer' }} onClick={() => onPick(s.ac.hex)}>
              <circle r="14" fill="transparent" />
              {on && <circle r="15" fill="none" stroke="#fb6c2b" strokeWidth="1.4" />}
              <Glyph ac={s.ac} color={color} size={on ? 22 : 17} rotate={s.ac.trk ?? 0} />
              {(on || s.elev > 8) && <text x="13" y="-8" fill={on ? '#ffb685' : '#a8b2bf'} fontSize="9.5" fontFamily="var(--font-mono)">{s.ac.cs || s.ac.reg || s.ac.hex.toUpperCase()}</text>}
            </g>
          );
        })}
        <circle r="6" fill="#5aa9f0" stroke="#fff" strokeWidth="2.4" />
      </svg>
    </div>
  );
}

function Sky({ sightings, selected, onPick }: { sightings: Sighting[]; selected: string | null; onPick: (hex: string) => void }) {
  const W = 360, H = 260;
  const x = (brg: number) => 12 + (brg / 360) * (W - 24);
  const y = (elev: number) => H - 30 - Math.sqrt(Math.min(90, elev) / 90) * (H - 50);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sky chart: aircraft by compass direction and height above the horizon" style={{ width: '100%', height: 'auto', borderRadius: 14, background: 'linear-gradient(180deg, #0b1220, #101a2c 62%, #1c2333)' }}>
      {[5, 20, 45, 75].map((e) => (
        <g key={e}>
          <line x1="0" x2={W} y1={y(e)} y2={y(e)} stroke="rgba(140,196,244,0.13)" strokeDasharray="3 4" />
          <text x="6" y={y(e) - 4} fill="rgba(140,196,244,0.6)" fontSize="9" fontFamily="var(--font-mono)">{e}°</text>
        </g>
      ))}
      <rect x="0" y={H - 30} width={W} height="30" fill="#0a0e15" />
      <line x1="0" x2={W} y1={H - 30} y2={H - 30} stroke="rgba(255,255,255,0.2)" />
      {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'].map((d, i) => (
        <text key={i} x={x(i * 45)} y={H - 11} textAnchor="middle" fill={d === 'N' ? '#fb6c2b' : '#7f8a99'} fontSize="10" fontFamily="var(--font-mono)" fontWeight={d === 'N' ? 600 : 400}>{d}</text>
      ))}
      {sightings.map((s) => {
        const on = s.ac.hex === selected;
        const cx = x(s.brg), cy = y(s.elev);
        return (
          <g key={s.ac.hex} style={{ cursor: 'pointer' }} onClick={() => onPick(s.ac.hex)}>
            <circle cx={cx} cy={cy} r="12" fill="transparent" />
            <circle cx={cx} cy={cy} r={on ? 6 : 4.5} fill={on ? '#fb6c2b' : rgbCss(altitudeRGB(s.ac.alt))} stroke={on ? 'rgba(251,108,43,0.35)' : 'rgba(0,0,0,0.35)'} strokeWidth="4" />
            <text x={cx > W - 70 ? cx - 9 : cx + 9} y={cy - 7} textAnchor={cx > W - 70 ? 'end' : 'start'} fill={on ? '#ffb685' : '#c9d1dc'} fontSize="9.5" fontFamily="var(--font-mono)">{s.ac.cs || s.ac.reg || s.ac.hex.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SelectedCard({ s, airlines, contrail }: { s: Sighting; airlines: ReturnType<typeof airlinesReady>; contrail: boolean }) {
  const label = flightLabel(s.ac.cs, airlines) || s.ac.reg || s.ac.hex.toUpperCase();
  const a = airlines?.find((x) => x.icao === s.ac.cs.slice(0, 3));
  const t = airlineTile(a?.icao ?? '', a?.iata);
  const e = Math.round(s.elev);
  const ex = 6 + 62 * Math.cos((e * Math.PI) / 180), ey = 68 - 62 * Math.sin((e * Math.PI) / 180);
  const ax = 6 + 24 * Math.cos((e * Math.PI) / 180), ay = 68 - 24 * Math.sin((e * Math.PI) / 180);
  return (
    <section className="card card--pad" aria-label="Selected aircraft" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="tile" style={{ background: t.bg, color: t.fg, width: 40, height: 40, fontSize: 11 }}>{a ? t.label : fallbackTile(s.ac)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 650, fontStretch: '112%' }}>{label}</div>
          <div style={{ fontSize: 12.5, color: '#8b96a6' }}>{[a?.name, s.ac.type ? typeName(s.ac.type) : null, s.ac.reg].filter(Boolean).join(' · ')}</div>
        </div>
        {contrail && <span className="status status--plain" style={{ background: 'rgba(251,108,43,0.12)', color: 'var(--signal-2)' }}>Contrail likely</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M6 68H72" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
          <path d="M68 68A62 62 0 0 0 6 6" fill="none" stroke="rgba(140,196,244,0.25)" strokeWidth="1.2" strokeDasharray="2 3" />
          <path d={`M6 68L${ex.toFixed(1)} ${ey.toFixed(1)}`} stroke="#fb6c2b" strokeWidth="1.6" strokeDasharray="3 3" />
          <path d={`M30 68A24 24 0 0 0 ${ax.toFixed(1)} ${ay.toFixed(1)}`} fill="none" stroke="#fb6c2b" strokeWidth="1.6" />
          <circle cx={ex} cy={ey} r="4.5" fill="#fb6c2b" />
          <circle cx="6" cy="68" r="3" fill="#5aa9f0" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontSize: 42, lineHeight: 1, fontWeight: 600, fontStretch: '125%', letterSpacing: '-0.03em' }}>{e}°</span><span style={{ fontSize: 14, color: 'var(--text-2)' }}>up</span></div>
          <div style={{ marginTop: 4, fontSize: 14 }}>Look <b style={{ fontWeight: 600 }}>{compassWords(s.brg)}</b>, {s.dist.toFixed(1)} nm away</div>
          <div style={{ fontSize: 12.5, color: '#8b96a6' }}>{Math.round(s.ac.alt ?? 0).toLocaleString('en-US')} ft · {s.ac.gs ?? '—'} kt{(s.ac.vr ?? 0) > 400 ? ' · climbing' : (s.ac.vr ?? 0) < -400 ? ' · descending' : ''}</div>
        </div>
        <svg width="52" height="52" viewBox="-26 -26 52 52" aria-hidden="true" style={{ flex: 'none' }}>
          <circle r="23" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
          <text x="0" y="-13" textAnchor="middle" fill="#7f8a99" fontSize="8" fontFamily="var(--font-mono)">N</text>
          <g transform={`rotate(${s.brg.toFixed(0)})`}><path d="M0 -19L5 -6H-5Z" fill="#fb6c2b" /><path d="M0 -6V6" stroke="#fb6c2b" strokeWidth="1.6" /></g>
        </svg>
      </div>
      <Link className="btn btn--quiet" href={`/?flight=${s.ac.hex}`} style={{ alignSelf: 'flex-start' }}>Open on the live map<Icon name="arrowRight" size={16} /></Link>
    </section>
  );
}
