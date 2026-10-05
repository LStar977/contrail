'use client';

import { useStore } from '@/lib/store';
import { airlineByIcao, airlinesReady, airlineTile, flightLabel } from '@/lib/airlines';
import { typeName } from '@/lib/aircraftTypes';
import type { HoverInfo } from './MapController';

export default function HoverCard({ info }: { info: NonNullable<HoverInfo> }) {
  const ac = useStore((s) => s.aircraft.get(info.hex));
  if (!ac) return null;
  const airlines = airlinesReady();
  const al = airlineByIcao(airlines, ac.cs.slice(0, 3));
  const tile = airlineTile(al?.icao ?? '', al?.iata);
  const label = flightLabel(ac.cs, airlines) || ac.reg || ac.hex.toUpperCase();
  const alt = ac.ground ? 'Ground' : ac.alt == null ? '—' : ac.alt >= 18000 ? `FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}` : `${Math.round(ac.alt).toLocaleString('en-US')} ft`;
  const left = Math.min(info.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 226);
  return (
    <div className="hovercard" style={{ left, top: Math.max(8, info.y - 96) }}>
      <div className="hovercard__head">
        {al ? <span className="tile tile--xs" style={{ background: tile.bg, color: tile.fg }}>{tile.label}</span> : null}
        <span className="hovercard__num">{label}</span>
        <span className="hovercard__air">{al?.name ?? (ac.cs ? '' : 'No callsign')}</span>
      </div>
      <div className="hovercard__row"><span>{ac.type ? typeName(ac.type) : 'Unknown type'}</span><span>{ac.reg}</span></div>
      <div className="hovercard__row"><span>{alt}</span><span>{ac.gs != null ? `${ac.gs} kt` : '—'}</span></div>
    </div>
  );
}
