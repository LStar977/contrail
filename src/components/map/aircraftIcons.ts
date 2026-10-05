import { altitudeRGB, GROUND_RGB, SIGNAL_RGB, type RGB } from '@/lib/altitude';
import type { Glyph } from '@/lib/aircraftTypes';

// Top-down silhouettes, nose up, drawn in a 24×24 box centred on 0,0.
const AIRLINER = 'M0 -10C0.9 -10 1.3 -8.8 1.3 -7.4L1.3 -2.4L9.6 2.4L9.6 4.3L1.3 1.9L1 6.4L3.8 8.4L3.8 9.7L0 8.8L-3.8 9.7L-3.8 8.4L-1 6.4L-1.3 1.9L-9.6 4.3L-9.6 2.4L-1.3 -2.4L-1.3 -7.4C-1.3 -8.8 -0.9 -10 0 -10Z';
export const GLYPH_PATHS: Record<Glyph, string[]> = {
  heavy4: [AIRLINER, 'M3.3 -0.9h1.4v2.6h-1.4zM6.5 0.9h1.4v2.6h-1.4zM-4.7 -0.9h1.4v2.6h-1.4zM-7.9 0.9h1.4v2.6h-1.4z'],
  heavy: [AIRLINER],
  jet: [AIRLINER],
  regional: ['M0 -10C0.85 -10 1.2 -8.9 1.2 -7.6L1.2 -1.8L8.6 1.6L8.6 3L1.2 1.6L1.1 6.6L4.6 8.4L4.6 9.6L0 9L-4.6 9.6L-4.6 8.4L-1.1 6.6L-1.2 1.6L-8.6 3L-8.6 1.6L-1.2 -1.8L-1.2 -7.6C-1.2 -8.9 -0.85 -10 0 -10Z', 'M1.5 3.4h1.6v3.4h-1.6zM-3.1 3.4h1.6v3.4h-1.6z'],
  turboprop: ['M0 -9.5C0.8 -9.5 1.1 -8.4 1.1 -7.2L1.1 -2.2L10 -1.6L10 0.6L1.1 0.8L0.9 6.2L3.6 7.4L3.6 8.6L0 8.2L-3.6 8.6L-3.6 7.4L-0.9 6.2L-1.1 0.8L-10 0.6L-10 -1.6L-1.1 -2.2L-1.1 -7.2C-1.1 -8.4 -0.8 -9.5 0 -9.5Z', 'M3.6 -4.4h1.6v3.4h-1.6zM-5.2 -4.4h1.6v3.4h-1.6z'],
  light: ['M0 -7.5C0.7 -7.5 1 -6.6 1 -5.6L1 -3.2L8 -3.2L8 -1.4L1 -1.4L0.7 4.6L3 5.6L3 6.8L0 6.5L-3 6.8L-3 5.6L-0.7 4.6L-1 -1.4L-8 -1.4L-8 -3.2L-1 -3.2L-1 -5.6C-1 -6.6 -0.7 -7.5 0 -7.5Z'],
  heli: ['M0 -4.5C2 -4.5 2.8 -1.5 2.8 0.8C2.8 3 1.5 4.2 0 4.2C-1.5 4.2 -2.8 3 -2.8 0.8C-2.8 -1.5 -2 -4.5 0 -4.5ZM-0.7 4L0.7 4L0.7 9.5L-0.7 9.5Z'],
};

export const GLYPHS: Glyph[] = ['heavy4', 'heavy', 'jet', 'regional', 'turboprop', 'light', 'heli'];
export const GLYPH_SIZE: Record<Glyph, number> = { heavy4: 28, heavy: 26, jet: 22, regional: 19, turboprop: 19, light: 15, heli: 19 };

export const ALT_BUCKETS = 13; // 0, 3.5k, 7k … 42k ft
export const bucketFor = (ft: number | null) => (ft == null ? 6 : Math.max(0, Math.min(ALT_BUCKETS - 1, Math.round(ft / 3500))));

const CELL = 64;
const SCALE = 2.55;
type IconDef = { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; mask: boolean };

/**
 * Pre-coloured icon atlas: every glyph in every altitude colour, plus ground grey and the signal orange.
 * Baking the dark outline into the bitmap keeps aircraft legible over any basemap.
 */
export function buildAtlas(): { canvas: HTMLCanvasElement; mapping: Record<string, IconDef> } {
  const variants: [string, RGB][] = [];
  for (let b = 0; b < ALT_BUCKETS; b++) variants.push([String(b), altitudeRGB(b * 3500)]);
  variants.push(['g', GROUND_RGB], ['s', SIGNAL_RGB]);

  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = variants.length * CELL * dpr;
  canvas.height = GLYPHS.length * CELL * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const mapping: Record<string, IconDef> = {};

  GLYPHS.forEach((glyph, row) => {
    const paths = GLYPH_PATHS[glyph].map((d) => new Path2D(d));
    variants.forEach(([key, rgb], col) => {
      ctx.save();
      ctx.translate(col * CELL + CELL / 2, row * CELL + CELL / 2);
      ctx.scale(SCALE, SCALE);
      ctx.lineJoin = 'round';
      if (glyph === 'heli') {
        ctx.beginPath();
        ctx.arc(0, 0, 8.6, 0, Math.PI * 2);
        ctx.setLineDash([2.2, 2.2]);
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(7,10,16,0.9)';
        ctx.stroke();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = `rgb(${rgb.join(',')})`;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const p of paths) {
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = 'rgba(7,10,16,0.95)';
        ctx.stroke(p);
      }
      ctx.fillStyle = `rgb(${rgb.join(',')})`;
      for (const p of paths) ctx.fill(p);
      ctx.restore();
      mapping[`${glyph}:${key}`] = { x: col * CELL * dpr, y: row * CELL * dpr, width: CELL * dpr, height: CELL * dpr, anchorX: CELL, anchorY: CELL, mask: false };
    });
  });
  return { canvas, mapping };
}
