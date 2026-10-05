// Where to open the map without asking for location: the browser's time zone is a good-enough hint.
const CITIES: Record<string, [number, number]> = {
  'America/New_York': [-74, 40.7], 'America/Chicago': [-87.6, 41.9], 'America/Denver': [-105, 39.7], 'America/Los_Angeles': [-118.2, 34.05],
  'America/Phoenix': [-112, 33.4], 'America/Anchorage': [-149.9, 61.2], 'America/Toronto': [-79.4, 43.7], 'America/Vancouver': [-123.1, 49.3],
  'America/Mexico_City': [-99.1, 19.4], 'America/Sao_Paulo': [-46.6, -23.5], 'America/Argentina/Buenos_Aires': [-58.4, -34.6], 'America/Bogota': [-74.1, 4.7],
  'Europe/London': [-0.1, 51.5], 'Europe/Paris': [2.35, 48.86], 'Europe/Berlin': [13.4, 52.5], 'Europe/Madrid': [-3.7, 40.4], 'Europe/Rome': [12.5, 41.9],
  'Europe/Amsterdam': [4.9, 52.37], 'Europe/Dublin': [-6.26, 53.35], 'Europe/Istanbul': [29, 41], 'Europe/Moscow': [37.6, 55.75], 'Europe/Stockholm': [18.07, 59.33],
  'Asia/Dubai': [55.3, 25.2], 'Asia/Kolkata': [77.2, 28.6], 'Asia/Singapore': [103.8, 1.35], 'Asia/Hong_Kong': [114.2, 22.3], 'Asia/Shanghai': [121.5, 31.2],
  'Asia/Tokyo': [139.7, 35.7], 'Asia/Seoul': [127, 37.5], 'Australia/Sydney': [151.2, -33.9], 'Australia/Melbourne': [145, -37.8], 'Pacific/Auckland': [174.8, -36.85],
  'Africa/Johannesburg': [28, -26.2], 'Africa/Cairo': [31.2, 30], 'Africa/Lagos': [3.4, 6.5], 'Africa/Nairobi': [36.8, -1.3],
};
const REGIONS: [string, [number, number], number][] = [
  ['America/', [-96, 38], 3.6], ['Europe/', [10, 50], 4.2], ['Asia/', [105, 30], 3.4], ['Australia/', [134, -27], 3.8],
  ['Africa/', [20, 5], 3.4], ['Pacific/', [170, -15], 3.2], ['Atlantic/', [-30, 46], 3],
];

export function startView(): { center: [number, number]; zoom: number } {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  const phone = typeof window !== 'undefined' && window.innerWidth < 600;
  const adjust = phone ? -0.7 : 0;
  if (CITIES[tz]) return { center: CITIES[tz], zoom: 4.8 + adjust };
  const r = REGIONS.find(([p]) => tz.startsWith(p));
  if (r) return { center: r[1], zoom: r[2] + adjust };
  return { center: [-30, 46], zoom: 3 + adjust };
}
