export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function fmtAltitude(ft: number | null, ground: boolean): { value: string; unit: string; sub: string } {
  if (ground) return { value: 'Ground', unit: '', sub: 'On the ground' };
  if (ft == null) return { value: '—', unit: '', sub: 'No altitude' };
  const fl = ft >= 18000 ? `FL${String(Math.round(ft / 100)).padStart(3, '0')}` : 'Below transition';
  return { value: fmtInt(Math.round(ft / 25) * 25), unit: 'ft', sub: fl };
}

export function fmtDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${fmtDuration(m)} ago`;
}

/** Time in a given IANA zone, e.g. "19:20". */
export function fmtClock(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
}

/** Short zone label, e.g. "EDT" or "CEST" (falls back to "GMT+2" style where no abbreviation exists). */
export function fmtZone(date: Date, timeZone?: string): string {
  const name = (locale: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  };
  const us = name('en-US');
  if (us && !us.startsWith('GMT')) return us;
  const gb = name('en-GB');
  return gb && !gb.startsWith('GMT') ? gb : us || gb;
}

export const fmtUtc = (date: Date) => `${fmtClock(date, 'UTC')} UTC`;

export function fmtLatLon(lat: number, lon: number): [string, string] {
  return [`${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`, `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`];
}

export function fmtVerticalRate(vr: number | null, ground: boolean): { value: string; sub: string } {
  if (ground) return { value: '0', sub: 'On the ground' };
  if (vr == null) return { value: '—', sub: 'No data' };
  if (Math.abs(vr) < 200) return { value: '0', sub: 'Level' };
  return { value: `${vr > 0 ? '+' : '−'}${fmtInt(Math.abs(Math.round(vr / 50) * 50))}`, sub: vr > 0 ? 'Climbing' : 'Descending' };
}

/** Rough timezone for a coordinate when we don't have one: whole hours from longitude. Only used as a last resort. */
export const approxOffsetHours = (lon: number) => Math.round(lon / 15);
