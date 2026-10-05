// Builds the static reference data the app ships with.
//   node scripts/build-data.mjs
// Sources:
//   OurAirports (public domain)  https://ourairports.com/data/
//   OpenFlights airlines (ODbL)   https://openflights.org/data
import { writeFile, mkdir } from 'node:fs/promises';

const OA = 'https://davidmegginson.github.io/ourairports-data';
const OF = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const r1 = (v) => Math.round(Number(v) * 1e4) / 1e4;

async function airports() {
  const [aText, rText] = await Promise.all([
    fetch(`${OA}/airports.csv`).then((r) => r.text()),
    fetch(`${OA}/runways.csv`).then((r) => r.text()),
  ]);
  const all = parseCSV(aText);
  const keep = all.filter((a) =>
    (a.type === 'large_airport' || (a.type === 'medium_airport' && a.iata_code)) && a.latitude_deg);
  // [icao, iata, name, city, country, lat, lon, size(2 large / 1 medium), elevationFt]
  const list = keep.map((a) => [
    a.icao_code || a.gps_code || a.ident,
    a.iata_code || '',
    a.name,
    a.municipality || '',
    a.iso_country,
    r1(a.latitude_deg),
    r1(a.longitude_deg),
    a.type === 'large_airport' ? 2 : 1,
    a.elevation_ft ? Number(a.elevation_ft) : 0,
  ]);
  const idents = new Map(keep.map((a) => [a.ident, a.icao_code || a.gps_code || a.ident]));
  const runways = {};
  for (const r of parseCSV(rText)) {
    const code = idents.get(r.airport_ident);
    if (!code || r.closed === '1' || !r.le_latitude_deg || !r.he_latitude_deg) continue;
    (runways[code] ||= []).push([
      r.le_ident, r1(r.le_latitude_deg), r1(r.le_longitude_deg),
      r.he_ident, r1(r.he_latitude_deg), r1(r.he_longitude_deg),
      Number(r.length_ft) || 0,
    ]);
  }
  return { list, runways };
}

async function airlines() {
  const text = await fetch(OF).then((r) => r.text());
  const out = [];
  for (const line of text.split('\n')) {
    // id,name,alias,iata,icao,callsign,country,active
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((s) => s.replace(/,$/, '').replace(/^"|"$/g, '').replace(/\\N/g, ''));
    if (!f || f.length < 8) continue;
    const [, name, , iata, icao, callsign, country, active] = f;
    if (active !== 'Y' || !/^[A-Z]{3}$/.test(icao) || !name) continue;
    out.push([icao, /^[A-Z0-9]{2}$/.test(iata) ? iata : '', name, callsign || '', country || '']);
  }
  // de-duplicate by ICAO, keep the first (OpenFlights lists the main carrier first)
  const seen = new Set();
  return out.filter((a) => (seen.has(a[0]) ? false : seen.add(a[0])));
}

const [{ list, runways }, al] = await Promise.all([airports(), airlines()]);
await mkdir('public/data', { recursive: true });
await mkdir('src/data', { recursive: true });
await writeFile('public/data/airports.json', JSON.stringify(list));
await writeFile('src/data/runways.json', JSON.stringify(runways));
await writeFile('public/data/airlines.json', JSON.stringify(al));
console.log(`airports ${list.length}, airports with runways ${Object.keys(runways).length}, airlines ${al.length}`);
