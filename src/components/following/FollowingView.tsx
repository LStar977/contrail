'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { useFollowedLive } from '@/components/shell/Chrome';
import { airlinesReady, airlineTile, loadAirlines } from '@/lib/airlines';
import { fmtAgo, fmtDuration } from '@/lib/format';
import { Icon, PlaneGlyph } from '@/components/ui/Icon';
import { useLandingAlerts } from './useLandingAlerts';
import { useNow } from '@/lib/hooks';

export default function FollowingView() {
  const items = useFollowedLive();
  const unfollow = useStore((s) => s.unfollow);
  const setPalette = useStore((s) => s.setPalette);
  const [, force] = useState(0);
  const alerts = useLandingAlerts(items);
  const now = useNow(15_000);
  useEffect(() => { loadAirlines().then(() => force((n) => n + 1)).catch(() => {}); }, []);
  const airlines = airlinesReady();
  const live = items.filter((i) => i.seen && !i.ac?.ground).length;

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1, fontWeight: 650, fontStretch: '125%', letterSpacing: '-0.02em' }}>Following</h1>
          <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
            {items.length ? `${live} in the air · ${items.length - live} not live right now` : 'Flights you follow show up here and on the map.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {alerts.supported && (
            <button className={`btn ${alerts.enabled ? 'btn--quiet' : ''}`} onClick={alerts.toggle} aria-pressed={alerts.enabled}>
              <Icon name="bell" size={18} />{alerts.enabled ? 'Landing alerts on' : 'Turn on landing alerts'}
            </button>
          )}
          <button className="btn btn--primary" onClick={() => setPalette(true)}><Icon name="plus" size={18} />Follow a flight</button>
        </div>
      </header>

      {alerts.enabled && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
          Alerts work while Contrail is open in a tab. There’s no push server, so nothing is sent when it’s closed.
        </p>
      )}

      {!items.length ? (
        <div className="empty">
          <PlaneGlyph size={28} color="#86c6f6" rotate={45} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Nothing followed yet</div>
          <div style={{ maxWidth: 520 }}>Pick any aircraft on the map and press <b>Follow flight</b>, or search for a flight number like <span className="mono">BA 117</span> or a callsign like <span className="mono">UAL901</span>.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <Link className="btn btn--quiet" href="/">Open the live map</Link>
            <button className="btn btn--quiet" onClick={() => setPalette(true)}>Search</button>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {items.map((it) => {
            const a = airlines?.find((x) => x.icao === it.cs.slice(0, 3));
            const tile = airlineTile(a?.icao ?? '', a?.iata);
            const o = it.route?.origin, d = it.route?.destination;
            const statusClass = !it.seen ? 'status' : it.ac?.ground ? 'status' : it.ac && (it.ac.vr ?? 0) < -400 ? 'status status--info' : 'status status--ok';
            const status = !it.seen ? (it.ac ? `Last seen ${fmtAgo(now - it.ac.t)}` : 'Not airborne yet') : it.ac?.ground ? 'On the ground' : (it.ac?.vr ?? 0) < -400 ? 'Descending' : 'En route';
            return (
              <article key={it.hex} className="card card--pad" style={{ gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="tile" style={{ background: tile.bg, color: tile.fg, width: 36, height: 36, borderRadius: 10, fontSize: 11 }}>{a ? tile.label : '·'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 650, fontStretch: '112%' }}>{it.label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.name ?? it.cs ?? it.hex.toUpperCase()}</div>
                  </div>
                  <span className={statusClass}>{status}</span>
                </div>
                {o && d ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                    <div><div style={{ fontSize: 28, lineHeight: 0.95, fontWeight: 600, fontStretch: '125%', letterSpacing: '-0.02em' }}>{o.iata || o.icao}</div><div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--text-2)' }}>{o.city || o.name}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 28, lineHeight: 0.95, fontWeight: 600, fontStretch: '125%', letterSpacing: '-0.02em' }}>{d.iata || d.icao}</div><div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--text-2)' }}>{d.city || d.name}</div></div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{it.cs ? 'Route not published for this callsign.' : 'No callsign broadcast.'}</div>
                )}
                {it.frac != null && (
                  <div style={{ position: 'relative', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${it.frac * 100}%`, borderRadius: 2, background: 'linear-gradient(90deg, rgba(251,108,43,0.15), #fb6c2b)' }} />
                    <span style={{ position: 'absolute', left: `${it.frac * 100}%`, top: -3, width: 9, height: 9, marginLeft: -4.5, borderRadius: '50%', background: '#fb6c2b', boxShadow: '0 0 0 3px #0c1118' }} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, color: it.leftMin != null ? 'var(--signal-2)' : 'var(--text-3)' }}>{it.leftMin != null ? `${fmtDuration(it.leftMin)} to go` : ''}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link className="btn btn--quiet" style={{ height: 36, padding: '0 12px', fontSize: 13 }} href={`/?flight=${it.hex}`}>Open on map</Link>
                    <button className="btn btn--quiet" style={{ height: 36, width: 36, padding: 0 }} aria-label={`Stop following ${it.label}`} onClick={() => unfollow(it.hex)}><Icon name="close" size={16} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
