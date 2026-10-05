// Derives Contrail's "Night Flight" basemap from OpenFreeMap's dark style.
//   node scripts/build-style.mjs
// Tiles, glyphs and sprites still come from OpenFreeMap (© OpenMapTiles, data © OpenStreetMap contributors).
import { writeFile, mkdir } from 'node:fs/promises';

const style = await fetch('https://tiles.openfreemap.org/styles/dark').then((r) => r.json());

const C = {
  land: '#111823',
  water: '#070a10',
  waterLine: '#0a0f17',
  landuse: '#141c28',
  park: '#131d24',
  building: '#18202c',
  buildingLine: '#1f2836',
  runway: '#2b3442',
  taxiway: '#1d2531',
  aeroArea: '#18202b',
  road: '#18212d',
  roadMajor: '#1e2835',
  motorway: '#243040',
  casing: '#0d131c',
  rail: '#1a2230',
  border: '#2c3646',
  borderState: '#202a37',
  label: '#677386',
  labelDim: '#4f5b6c',
  halo: '#070a10',
};

const drop = new Set([
  'road_oneway', 'road_oneway_opposite', 'highway_name_other', 'highway_name_motorway',
  'landcover_wood', 'railway_transit_dashline', 'railway_minor_dashline', 'railway_dashline',
  'place_other', 'water_name',
]);

const paint = {
  background: { 'background-color': C.land },
  water: { 'fill-color': C.water, 'fill-antialias': false },
  landcover_ice_shelf: { 'fill-color': '#151d29', 'fill-opacity': 0.6 },
  landcover_glacier: { 'fill-color': '#151d29', 'fill-opacity': 0.5 },
  landuse_residential: { 'fill-color': C.landuse, 'fill-opacity': 0.5 },
  landuse_park: { 'fill-color': C.park, 'fill-opacity': 0.6 },
  waterway: { 'line-color': C.waterLine },
  building: { 'fill-color': C.building, 'fill-outline-color': C.buildingLine },
  'aeroway-taxiway': { 'line-color': C.taxiway },
  'aeroway-runway-casing': { 'line-color': C.aeroArea },
  'aeroway-area': { 'fill-color': C.aeroArea, 'fill-opacity': 1 },
  'aeroway-runway': { 'line-color': C.runway },
  road_area_pier: { 'fill-color': C.land },
  road_pier: { 'line-color': C.land },
  highway_path: { 'line-color': C.road, 'line-opacity': 0.6 },
  highway_minor: { 'line-color': C.road, 'line-opacity': 0.8 },
  highway_major_casing: { 'line-color': C.casing },
  highway_major_inner: { 'line-color': C.roadMajor },
  highway_major_subtle: { 'line-color': C.roadMajor },
  highway_motorway_casing: { 'line-color': C.casing },
  highway_motorway_inner: { 'line-color': C.motorway },
  highway_motorway_subtle: { 'line-color': C.road },
  railway_transit: { 'line-color': C.rail },
  railway_minor: { 'line-color': C.rail },
  railway: { 'line-color': C.rail },
  boundary_state: { 'line-color': C.borderState },
  'boundary_country_z0-4': { 'line-color': C.border },
  'boundary_country_z5-': { 'line-color': C.border },
};

const labelPaint = (color, extra = {}) => ({
  'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.5, ...extra,
});

style.name = 'Contrail Night Flight';
delete style.sources.ne2_shaded;
style.layers = style.layers
  .filter((l) => !drop.has(l.id))
  .map((l) => {
    const next = { ...l, paint: { ...(l.paint || {}) }, layout: { ...(l.layout || {}) } };
    if (paint[l.id]) Object.assign(next.paint, paint[l.id]);
    if (l.id === 'landcover_wood') delete next.paint['fill-pattern'];
    if (l.type === 'symbol' && l.id.startsWith('place_')) {
      const country = l.id.startsWith('place_country');
      Object.assign(next.paint, labelPaint(country ? C.labelDim : C.label));
      if (country) {
        next.layout['text-transform'] = 'uppercase';
        next.layout['text-letter-spacing'] = 0.18;
      }
      next.layout['text-field'] = ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
      if (country) next.paint['text-opacity'] = 0.75;
      if (l.id === 'place_state') next.minzoom = 5;
      if (l.id === 'place_city') next.minzoom = 5;
      if (l.id === 'place_village' || l.id === 'place_suburb') next.minzoom = 10;
      if (l.id === 'place_town') next.minzoom = 8;
      delete next.paint['icon-opacity'];
      delete next.layout['icon-image'];
    }
    if (l.id === 'highway_motorway_inner') next.paint['line-color'] = C.motorway;
    return next;
  });

await mkdir('public/map', { recursive: true });
await writeFile('public/map/style.json', JSON.stringify(style));
console.log(`style.json written: ${style.layers.length} layers`);
