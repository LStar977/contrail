// Solar position helpers (accurate to a fraction of a degree, plenty for a day/night map).
const RAD = Math.PI / 180;

/** Sub-solar point [lon, lat] for a date. */
export function subsolar(date: Date): [number, number] {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const lon = ((((ra - gmst + 180) % 360) + 360) % 360) - 180;
  return [lon, dec];
}

/** Sun elevation in degrees above the horizon at a place and time. */
export function sunElevation(lon: number, lat: number, date: Date, sub = subsolar(date)): number {
  const [sl, sd] = sub;
  const c = Math.sin(lat * RAD) * Math.sin(sd * RAD) + Math.cos(lat * RAD) * Math.cos(sd * RAD) * Math.cos((lon - sl) * RAD);
  return 90 - Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

/**
 * The terminator (sun elevation 0) as two lines: where the sun is setting and where it is rising.
 * Each meridian crosses the terminator exactly once, so we solve for latitude per longitude.
 */
export function terminatorLines(date: Date) {
  const [sl, sd] = subsolar(date);
  const dec = Math.abs(sd) < 0.05 ? 0.05 * Math.sign(sd || 1) : sd;
  const dusk: [number, number][][] = [[]];
  const dawn: [number, number][][] = [[]];
  let prevSide: 'dusk' | 'dawn' | null = null;
  for (let lon = -540; lon <= 540; lon += 1) {
    const H = lon - sl;
    const lat = Math.atan(-Math.cos(H * RAD) / Math.tan(dec * RAD)) / RAD;
    const h = ((((H + 180) % 360) + 360) % 360) - 180; // hour angle in -180..180
    const side = h > 0 ? 'dusk' : 'dawn';
    const target = side === 'dusk' ? dusk : dawn;
    if (side !== prevSide && target[target.length - 1].length) target.push([]);
    target[target.length - 1].push([lon, lat]);
    prevSide = side;
  }
  const clean = (segs: [number, number][][]) => segs.filter((s) => s.length > 1);
  return { dusk: clean(dusk), dawn: clean(dawn) };
}

const MERC_MAX = 85.051129;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

/**
 * Paints the night side into a canvas laid out in Web Mercator (so it can be dropped onto the map as an
 * image source covering three world copies, lon -540…540). Darkness deepens through civil, nautical and
 * astronomical twilight; a faint warm glow marks the last six degrees of daylight.
 */
export function paintNight(canvas: HTMLCanvasElement, date: Date, width = 1536, height = 512) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  const sub = subsolar(date);
  const yMax = mercY(MERC_MAX);
  const cosSd = Math.cos(sub[1] * RAD), sinSd = Math.sin(sub[1] * RAD);
  const lonCos = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const lon = -540 + ((x + 0.5) / width) * 1080;
    lonCos[x] = Math.cos((lon - sub[0]) * RAD);
  }
  for (let y = 0; y < height; y++) {
    const lat = invMercY(yMax - ((y + 0.5) / height) * 2 * yMax);
    const sinL = Math.sin(lat * RAD), cosL = Math.cos(lat * RAD);
    for (let x = 0; x < width; x++) {
      const c = sinL * sinSd + cosL * cosSd * lonCos[x];
      const elev = 90 - Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
      const i = (y * width + x) * 4;
      if (elev < 0) {
        // 0 → -18°: ease into full night
        const t = Math.min(1, -elev / 18);
        const a = 0.18 + 0.34 * (t * t * (3 - 2 * t));
        img.data[i] = 1; img.data[i + 1] = 3; img.data[i + 2] = 8; img.data[i + 3] = Math.round(a * 255);
      } else if (elev < 6) {
        const t = 1 - elev / 6;
        img.data[i] = 255; img.data[i + 1] = 154; img.data[i + 2] = 77; img.data[i + 3] = Math.round(t * 0.05 * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Corner coordinates for the night image source (three world copies). */
export const NIGHT_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-540, MERC_MAX], [540, MERC_MAX], [540, -MERC_MAX], [-540, -MERC_MAX],
];
