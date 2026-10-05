'use client';

import { fmtClock } from '@/lib/format';

const W = 352, H = 88, TOP = 41000;

/** Altitude over time: solid for what's been flown, dashed for the estimate to landing. */
export default function ProfileChart({ flown, predicted, now }: { flown: [number, number][]; predicted: [number, number][]; now: number }) {
  if (flown.length < 2) return null;
  const t0 = flown[0][0];
  const t1 = predicted.length ? predicted[predicted.length - 1][0] : now;
  const maxAlt = Math.max(TOP, ...flown.map((p) => p[1]));
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (a: number) => H - 4 - (a / maxAlt) * (H - 14);
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
  const flownD = line(flown);
  const last = flown[flown.length - 1];
  const areaD = `${flownD}L${x(last[0]).toFixed(1)} ${H}L0 ${H}Z`;
  const nowX = x(Math.min(now, t1));
  const nowPct = (nowX / W) * 100;
  const fl = (a: number) => y(a).toFixed(1);
  return (
    <div className="profile">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Altitude profile of this flight">
        <defs>
          <linearGradient id="ct-prof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fb6c2b" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fb6c2b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={fl(40000)} x2={W} y2={fl(40000)} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
        <line x1="0" y1={fl(20000)} x2={W} y2={fl(20000)} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
        <line x1="0" y1={H - 4} x2={W} y2={H - 4} stroke="rgba(255,255,255,0.14)" />
        <path d={areaD} fill="url(#ct-prof)" />
        {predicted.length > 1 && <path d={line(predicted)} fill="none" stroke="rgba(237,240,244,0.45)" strokeWidth={1.4} strokeDasharray="3 4" />}
        <path d={flownD} fill="none" stroke="#fb6c2b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={nowX} y1="0" x2={nowX} y2={H - 4} stroke="rgba(255,255,255,0.22)" strokeDasharray="2 3" />
        <circle cx={nowX} cy={y(last[1])} r="4" fill="#fb6c2b" stroke="#0b1017" strokeWidth="2" />
        <text x={W} y={Number(fl(40000)) - 3} textAnchor="end" fill="#7f8a99" fontSize="9" fontFamily="var(--font-mono)">FL400</text>
        <text x={W} y={Number(fl(20000)) - 3} textAnchor="end" fill="#7f8a99" fontSize="9" fontFamily="var(--font-mono)">FL200</text>
      </svg>
      <div className="profile__axis">
        <span style={{ left: 0 }}>{fmtClock(new Date(t0), 'UTC')}Z</span>
        {nowPct > 14 && nowPct < 86 && <span style={{ left: `${nowPct}%`, transform: 'translateX(-50%)', color: 'var(--signal-2)' }}>NOW</span>}
        <span style={{ right: 0 }}>{predicted.length ? `~${fmtClock(new Date(t1), 'UTC')}Z` : 'now'}</span>
      </div>
    </div>
  );
}
