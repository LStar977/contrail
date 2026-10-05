import { ImageResponse } from 'next/og';

export const alt = 'Contrail · The sky, live';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PLANE = 'M0 -10C0.9 -10 1.3 -8.8 1.3 -7.4L1.3 -2.4L9.6 2.4L9.6 4.3L1.3 1.9L1 6.4L3.8 8.4L3.8 9.7L0 8.8L-3.8 9.7L-3.8 8.4L-1 6.4L-1.3 1.9L-9.6 4.3L-9.6 2.4L-1.3 -2.4L-1.3 -7.4C-1.3 -8.8 -0.9 -10 0 -10Z';

export default function Image() {
  // a scatter of "traffic" to suggest the live map
  const dots = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 197) % 1200;
    const y = 260 + ((i * 89) % 340);
    const r = (i * 53) % 360;
    const c = ['#32c4ab', '#46c7df', '#86c6f6', '#bcd6fc', '#ebf2ff'][i % 5];
    return { x, y, r, c };
  });
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#070a10', color: '#edf0f4', position: 'relative' }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', left: 0, top: 0 }}>
          <defs>
            <linearGradient id="t" x1="1100" y1="470" x2="620" y2="300" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fb6c2b" stopOpacity="0" />
              <stop offset="1" stopColor="#fb6c2b" />
            </linearGradient>
          </defs>
          {dots.map((d, i) => (
            <path key={i} d={PLANE} fill={d.c} opacity={0.5} transform={`translate(${d.x} ${d.y}) rotate(${d.r}) scale(0.6)`} />
          ))}
          <path d="M1120 480 C 980 330, 820 290, 640 300" stroke="url(#t)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={PLANE} fill="#fb6c2b" transform="translate(632 300) rotate(-92) scale(1.9)" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="72" height="72" viewBox="0 0 28 28">
            <path d="M3.5 23.5C7 14 13.5 8.6 21.6 7.3" fill="none" stroke="#fb6c2b" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="22.4" cy="7.2" r="3.4" fill="#fb6c2b" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>contrail</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3 }}>The sky, live.</div>
          <div style={{ fontSize: 30, color: '#a8b2bf' }}>Free live flight tracking on open ADS-B data</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
