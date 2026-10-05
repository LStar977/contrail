import { GLYPH_PATHS } from '@/components/map/aircraftIcons';
import type { Glyph } from '@/lib/aircraftTypes';

/** Blueprint-style planform for the aircraft family, nose pointing right. */
export default function Blueprint({ glyph }: { glyph: Glyph }) {
  const paths = GLYPH_PATHS[glyph];
  return (
    <svg className="aircraft__bp" viewBox="-14 -11 28 22" aria-hidden="true">
      <g transform="rotate(90)" fill="rgba(140,196,244,0.07)" stroke="#8cc4f4" strokeOpacity={0.85} strokeWidth={0.32} strokeLinejoin="round">
        {glyph === 'heli' && <circle r="8.6" fill="none" strokeDasharray="1.2 1.2" />}
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}
