// Altitude ramp: low = teal, high = ice. Lightness rises with altitude so cruising traffic reads brightest.
export type RGB = [number, number, number];

const STOPS: [number, RGB][] = [
  [0, [50, 196, 171]],
  [10000, [70, 199, 223]],
  [20000, [134, 198, 246]],
  [30000, [188, 214, 252]],
  [40000, [235, 242, 255]],
];

export const GROUND_RGB: RGB = [112, 124, 140];
export const SIGNAL_RGB: RGB = [251, 108, 43];
export const SIGNAL_LIGHT_RGB: RGB = [255, 151, 92];

export function altitudeRGB(ft: number | null | undefined, onGround = false): RGB {
  if (onGround) return GROUND_RGB;
  if (ft == null || Number.isNaN(ft)) return STOPS[2][1];
  if (ft <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1];
    const [b, cb] = STOPS[i];
    if (ft <= b) {
      const t = (ft - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t].map(Math.round) as RGB;
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export const rgbCss = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const ALTITUDE_GRADIENT_CSS = 'linear-gradient(90deg, #32c4ab, #46c7df 25%, #86c6f6 50%, #bcd6fc 75%, #ebf2ff)';
