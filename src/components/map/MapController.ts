import maplibregl, { type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { PickingInfo } from '@deck.gl/core';
import { advance, circle, distanceNm, greatCircle, moveToward, unwrap, type LonLat } from '@/lib/geo';
import { altitudeRGB } from '@/lib/altitude';
import { glyphFor, type Glyph } from '@/lib/aircraftTypes';
import { NIGHT_COORDS, paintNight, terminatorLines } from '@/lib/sun';
import type { Aircraft, Airport, TracePoint } from '@/lib/types';
import { buildAtlas, bucketFor, GLYPH_SIZE } from './aircraftIcons';

export type Viewport = { center: LonLat; radiusNm: number; zoom: number; bounds: [number, number, number, number] };
export type HoverInfo = { hex: string; x: number; y: number } | null;
export type Layers = { trails: boolean; airports: boolean; night: boolean };
type Events = { select: (hex: string | null) => void; hover: (info: HoverInfo) => void; viewport: (v: Viewport) => void };

type Sprite = {
  a: Aircraft;
  glyph: Glyph;
  pos: LonLat;
  tail: LonLat;
  icon: string;
  size: number;
  angle: number;
  color: [number, number, number];
};

const MAX_EXTRAPOLATE_S = 75;

export class MapController {
  readonly map: maplibregl.Map;
  private overlay: MapboxOverlay;
  private atlas: { url: string; mapping: Record<string, unknown> } | null = null;
  private aircraft = new Map<string, Aircraft>();
  private sprites: Sprite[] = [];
  private spriteByHex = new Map<string, Sprite>();
  private selected: string | null = null;
  private followed = new Set<string>();
  private layers: Layers = { trails: true, airports: true, night: true };
  private route: { flown: LonLat[]; rest: LonLat[]; origin: LonLat | null; dest: LonLat | null; estimated: boolean } | null = null;
  private frame = 0;
  private raf = 0;
  private lastDraw = 0;
  private lastNight = 0;
  private hovered: string | null = null;
  private filter: ((a: Aircraft) => boolean) | null = null;
  private destroyed = false;
  private loaded = false;
  private labels = false;
  private labelSet: Sprite[] = [];
  private lastDeclutter = 0;
  private labelFont = 'monospace';
  private decorations: { center: LonLat; radii: number[]; runways: [LonLat, LonLat][]; active: Set<number> } | null = null;
  readonly selectedMarker: maplibregl.Marker;
  readonly selectedEl: HTMLDivElement;
  private originMarker: maplibregl.Marker;
  private destMarker: maplibregl.Marker;

  private listeners: { [K in keyof Events]: Set<Events[K]> } = { select: new Set(), hover: new Set(), viewport: new Set() };
  private viewport: Viewport | null = null;

  /** Subscribe to map events; returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    this.listeners[event].add(fn);
    return () => { this.listeners[event].delete(fn); };
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<Events[K]>) => void)(...args);
  }

  /** The last viewport the map reported (null before the style loads). */
  getViewport() {
    return this.viewport;
  }

  constructor(container: HTMLElement, opts: { center?: LonLat; zoom?: number; minZoom?: number; maxZoom?: number } = {}) {
    this.map = new maplibregl.Map({
      container,
      style: '/map/style.json',
      center: opts.center ?? [-30, 46],
      zoom: opts.zoom ?? 3,
      minZoom: opts.minZoom ?? 1.6,
      maxZoom: opts.maxZoom ?? 15,
      attributionControl: false,
      fadeDuration: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    this.map.touchZoomRotate.disableRotation();
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __contrail: MapController }).__contrail = this;
    this.map.on('error', (e) => console.warn('[map]', e.error?.message ?? e));

    this.overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      onClick: (info: PickingInfo) => {
        const hex = (info.object as Sprite | undefined)?.a.hex ?? null;
        this.emit('select', hex);
      },
      onHover: (info: PickingInfo) => {
        const hex = (info.object as Sprite | undefined)?.a.hex ?? null;
        if (hex !== this.hovered || hex) {
          this.hovered = hex;
          this.emit('hover', hex ? { hex, x: info.x, y: info.y } : null);
        }
        this.map.getCanvas().style.cursor = hex ? 'pointer' : '';
      },
      getCursor: () => (this.hovered ? 'pointer' : 'grab'),
    });
    this.map.addControl(this.overlay as unknown as maplibregl.IControl);

    this.selectedEl = document.createElement('div');
    this.selectedEl.className = 'ct-selected-marker';
    this.selectedMarker = new maplibregl.Marker({ element: this.selectedEl, anchor: 'center' });
    const mk = (cls: string) => {
      const el = document.createElement('div');
      el.className = cls;
      return new maplibregl.Marker({ element: el, anchor: 'center' });
    };
    this.originMarker = mk('ct-endpoint ct-endpoint--origin');
    this.destMarker = mk('ct-endpoint ct-endpoint--dest');

    this.map.on('load', () => this.onLoad());
    this.map.on('moveend', () => this.emitViewport());
    this.raf = requestAnimationFrame(this.loop);

    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim();
    if (mono) this.labelFont = mono;
    const { canvas, mapping } = buildAtlas();
    this.atlas = { url: canvas.toDataURL('image/png'), mapping };
  }

  private onLoad() {
    this.loaded = true;
    const map = this.map;
    const canvas = document.createElement('canvas');
    paintNight(canvas, new Date());
    map.addSource('night', { type: 'image', url: canvas.toDataURL(), coordinates: NIGHT_COORDS });
    map.addLayer({ id: 'night', type: 'raster', source: 'night', paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });

    map.addSource('terminator', { type: 'geojson', data: this.terminatorData() });
    map.addLayer({
      id: 'terminator-line', type: 'line', source: 'terminator',
      paint: { 'line-color': '#ffb36b', 'line-opacity': 0.32, 'line-width': 1, 'line-dasharray': [3, 4] },
    });
    map.addLayer({
      id: 'terminator-label', type: 'symbol', source: 'terminator',
      layout: {
        'symbol-placement': 'line', 'symbol-spacing': 900, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'],
        'text-size': 10, 'text-letter-spacing': 0.25, 'text-transform': 'uppercase', 'text-offset': [0, -0.9], 'text-keep-upright': true,
      },
      paint: { 'text-color': '#ffb36b', 'text-opacity': 0.75, 'text-halo-color': '#070a10', 'text-halo-width': 1.2 },
    });

    map.addSource('airports', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'airports-dot', type: 'circle', source: 'airports',
      filter: ['any', ['==', ['get', 'size'], 2], ['>=', ['zoom'], 6.5]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 3.5, 12, 5],
        'circle-color': '#070a10',
        'circle-stroke-color': ['case', ['==', ['get', 'size'], 2], 'rgba(190,199,211,0.85)', 'rgba(168,178,191,0.6)'],
        'circle-stroke-width': 1.4,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 1],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 6, 1],
      },
    });
    map.addLayer({
      id: 'airports-label', type: 'symbol', source: 'airports',
      minzoom: 3.6,
      filter: ['any', ['==', ['get', 'size'], 2], ['>=', ['zoom'], 7]],
      layout: {
        'text-field': ['get', 'code'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9.5, 9, 11],
        'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-letter-spacing': 0.08, 'text-optional': true,
        'symbol-sort-key': ['-', 3, ['get', 'size']],
      },
      paint: { 'text-color': '#a3aebe', 'text-halo-color': '#070a10', 'text-halo-width': 1.3 },
    });
    map.addSource('rings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': '#8cc4f4', 'line-opacity': 0.22, 'line-width': 1 } });
    map.addLayer({
      id: 'rings-label', type: 'symbol', source: 'rings',
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 2000, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 9.5, 'text-offset': [0, -0.7], 'text-letter-spacing': 0.08 },
      paint: { 'text-color': '#8cc4f4', 'text-opacity': 0.65, 'text-halo-color': '#070a10', 'text-halo-width': 1 },
    });
    map.addSource('runways', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'runways', type: 'line', source: 'runways',
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': ['case', ['get', 'active'], '#8cc4f4', '#5b6b82'],
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 2.2, 11, 7, 14, 30],
      },
    });
    this.applyDecorations();
    this.applyLayerVisibility();
    this.emitViewport();
  }

  /** Range rings and runways around an airport (airport pages). */
  setDecorations(d: { center: LonLat; radii: number[]; runways: [LonLat, LonLat][]; active?: number[] } | null) {
    this.decorations = d ? { ...d, active: new Set(d.active ?? []) } : null;
    this.applyDecorations();
  }

  private applyDecorations() {
    if (!this.loaded) return;
    const d = this.decorations;
    (this.map.getSource('rings') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: d ? d.radii.map((r) => ({ type: 'Feature', properties: { label: `${r} NM` }, geometry: { type: 'LineString', coordinates: circle(d.center, r, 128) } })) : [],
    });
    (this.map.getSource('runways') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: d ? d.runways.map((rw, i) => ({ type: 'Feature', properties: { active: d.active.has(i) }, geometry: { type: 'LineString', coordinates: rw } })) : [],
    });
  }

  /** ATC-style data blocks next to each aircraft. */
  setLabels(on: boolean) {
    this.labels = on;
  }

  setAirports(list: Airport[]) {
    const apply = () => {
      const src = this.map.getSource('airports') as GeoJSONSource | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: list.map((a) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
          properties: { code: a.iata || a.icao, size: a.size },
        })),
      });
    };
    if (this.loaded) apply();
    else this.map.once('load', apply);
  }

  private terminatorData(): GeoJSON.FeatureCollection {
    const { dusk, dawn } = terminatorLines(new Date());
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { label: 'Sunset' }, geometry: { type: 'MultiLineString', coordinates: dusk } },
        { type: 'Feature', properties: { label: 'Sunrise' }, geometry: { type: 'MultiLineString', coordinates: dawn } },
      ],
    };
  }

  private refreshNight(now: number) {
    if (!this.loaded || now - this.lastNight < 60_000) return;
    this.lastNight = now;
    const canvas = document.createElement('canvas');
    paintNight(canvas, new Date());
    (this.map.getSource('night') as ImageSource | undefined)?.updateImage({ url: canvas.toDataURL(), coordinates: NIGHT_COORDS });
    (this.map.getSource('terminator') as GeoJSONSource | undefined)?.setData(this.terminatorData());
  }

  private emitViewport() {
    const b = this.map.getBounds();
    const c = this.map.getCenter();
    const center: LonLat = [c.lng, c.lat];
    const corners: LonLat[] = [[b.getWest(), b.getNorth()], [b.getEast(), b.getNorth()], [b.getEast(), b.getSouth()], [b.getWest(), b.getSouth()]];
    const radiusNm = Math.max(...corners.map((p) => distanceNm(center, [Math.max(-180, Math.min(180, p[0])), p[1]])));
    this.viewport = { center, radiusNm, zoom: this.map.getZoom(), bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] };
    this.emit('viewport', this.viewport);
  }

  // ------------------------------------------------------------------ data in

  /** Replace the visible traffic. Selected and followed aircraft not in the list are kept until they age out. */
  setTraffic(list: Aircraft[]) {
    const keep = new Map<string, Aircraft>();
    for (const a of list) keep.set(a.hex, a);
    const now = Date.now();
    for (const hex of [this.selected, ...this.followed]) {
      if (!hex || keep.has(hex)) continue;
      const old = this.aircraft.get(hex);
      // selected flights may be crossing an ocean with no receivers: hold on to them much longer
      if (old && now - old.t < (hex === this.selected ? 8 * 3600_000 : 30 * 60_000)) keep.set(hex, old);
    }
    this.aircraft = keep;
    this.rebuildSprites();
  }

  /** Merge fresher records (e.g. from a hex lookup for the selected flight). */
  upsert(list: Aircraft[]) {
    let changed = false;
    for (const a of list) {
      const old = this.aircraft.get(a.hex);
      if (!old || a.t >= old.t) {
        this.aircraft.set(a.hex, a);
        changed = true;
      }
    }
    if (changed) this.rebuildSprites();
  }

  getAircraft(hex: string) {
    return this.aircraft.get(hex);
  }

  allAircraft() {
    return [...this.aircraft.values()];
  }

  setFilter(fn: ((a: Aircraft) => boolean) | null) {
    this.filter = fn;
    this.rebuildSprites();
  }

  private rebuildSprites() {
    const sprites: Sprite[] = [];
    const byHex = new Map<string, Sprite>();
    for (const a of this.aircraft.values()) {
      if (this.filter && !this.filter(a) && a.hex !== this.selected) continue;
      const glyph = glyphFor(a.type, a.cat);
      const prev = this.spriteByHex.get(a.hex);
      const s: Sprite = {
        a, glyph,
        pos: prev?.pos ?? [a.lon, a.lat],
        tail: prev?.tail ?? [a.lon, a.lat],
        icon: '', size: GLYPH_SIZE[glyph], angle: -(a.trk ?? 0),
        color: altitudeRGB(a.alt, a.ground),
      };
      s.icon = `${glyph}:${a.ground ? 'g' : bucketFor(a.alt)}`;
      sprites.push(s);
      byHex.set(a.hex, s);
    }
    // draw high aircraft on top of low ones
    sprites.sort((x, y) => (x.a.ground ? -1 : x.a.alt ?? 0) - (y.a.ground ? -1 : y.a.alt ?? 0));
    this.sprites = sprites;
    this.spriteByHex = byHex;
  }

  setSelected(hex: string | null) {
    this.selected = hex;
    if (!hex) {
      this.selectedMarker.remove();
      this.route = null;
      this.originMarker.remove();
      this.destMarker.remove();
    }
    this.rebuildSprites();
  }

  setFollowed(hexes: string[]) {
    this.followed = new Set(hexes);
  }

  setLayers(layers: Layers) {
    this.layers = layers;
    this.applyLayerVisibility();
  }

  private applyLayerVisibility() {
    if (!this.loaded) return;
    const vis = (on: boolean) => (on ? 'visible' : 'none');
    for (const id of ['night']) this.map.setLayoutProperty(id, 'visibility', vis(this.layers.night));
    for (const id of ['terminator-line', 'terminator-label']) this.map.setLayoutProperty(id, 'visibility', vis(this.layers.night));
    for (const id of ['airports-dot', 'airports-label']) this.map.setLayoutProperty(id, 'visibility', vis(this.layers.airports));
  }

  /**
   * Route geometry for the selected flight: the real flown path when we have a trace, otherwise a great-circle
   * estimate from the origin; the remainder is the great circle to the destination.
   */
  setRoute(opts: { trace: TracePoint[] | null; origin: LonLat | null; dest: LonLat | null; originLabel?: string; destLabel?: string } | null) {
    if (!opts) {
      this.route = null;
      this.originMarker.remove();
      this.destMarker.remove();
      return;
    }
    const sel = this.selected ? this.aircraft.get(this.selected) : null;
    const here: LonLat | null = sel ? [sel.lon, sel.lat] : null;
    let flown: LonLat[] = [];
    let estimated = false;
    if (opts.trace && opts.trace.length > 1) {
      flown = unwrap(opts.trace.map((p) => [p[2], p[1]] as LonLat));
    } else if (opts.origin && here) {
      flown = greatCircle(opts.origin, here);
      estimated = true;
    }
    const rest = here && opts.dest ? greatCircle(here, opts.dest) : [];
    this.route = { flown, rest, origin: opts.origin, dest: opts.dest, estimated };
    if (opts.origin) {
      this.originMarker.getElement().textContent = opts.originLabel ?? '';
      this.originMarker.setLngLat(opts.origin).addTo(this.map);
    } else this.originMarker.remove();
    if (opts.dest) {
      this.destMarker.getElement().textContent = opts.destLabel ?? '';
      this.destMarker.setLngLat(opts.dest).addTo(this.map);
    } else this.destMarker.remove();
  }

  /** Current dead-reckoned position of an aircraft. */
  positionOf(hex: string): LonLat | null {
    const s = this.spriteByHex.get(hex);
    if (s) return s.pos;
    const a = this.aircraft.get(hex);
    return a ? [a.lon, a.lat] : null;
  }

  flyTo(center: LonLat, zoom?: number) {
    this.map.flyTo({ center, zoom: zoom ?? Math.max(this.map.getZoom(), 5.5), speed: 1.4, curve: 1.3, essential: true });
  }

  /** Keep the selected aircraft in view, offset for the side panel on wide screens. */
  ensureVisible(hex: string, padding: { right: number; bottom: number }) {
    const p = this.positionOf(hex);
    if (!p) return;
    const pt = this.map.project(p);
    const c = this.map.getContainer();
    const inX = pt.x > 80 && pt.x < c.clientWidth - padding.right - 40;
    const inY = pt.y > 80 && pt.y < c.clientHeight - padding.bottom - 40;
    if (!inX || !inY) this.map.easeTo({ center: p, padding: { right: padding.right, bottom: padding.bottom, left: 0, top: 0 }, duration: 900 });
  }

  // ------------------------------------------------------------------ animation

  private loop = (ts: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = Date.now();
    this.refreshNight(now);
    // ~30 fps is plenty for aircraft that move a few pixels per second
    if (ts - this.lastDraw < 32) return;
    this.lastDraw = ts;
    this.draw(now);
  };

  private draw(now: number) {
    const centerLon = this.map.getCenter().lng;
    const zoom = this.map.getZoom();
    const trailSeconds = zoom < 4 ? 140 : zoom < 6 ? 75 : 40;
    for (const s of this.sprites) {
      const a = s.a;
      const dt = Math.min(MAX_EXTRAPOLATE_S, Math.max(0, (now - a.t) / 1000));
      const moving = a.gs != null && a.trk != null && (a.ground ? a.gs > 3 : a.gs > 30);
      const shift = 360 * Math.round((centerLon - a.lon) / 360);
      let base = moving ? advance(a.lon, a.lat, a.trk!, a.gs!, dt) : ([a.lon, a.lat] as LonLat);
      // Out of receiver range (no free ocean coverage): keep the selected flight moving along its route as an estimate.
      const lost = (now - a.t) / 1000;
      if (a.hex === this.selected && lost > MAX_EXTRAPOLATE_S && moving && !a.ground && this.route?.dest) {
        base = moveToward([a.lon, a.lat], this.route.dest, (a.gs! * Math.min(lost, 6 * 3600)) / 3600);
      }
      s.pos[0] = base[0] + shift;
      s.pos[1] = base[1];
      if (moving && !a.ground) {
        const t = advance(s.pos[0], s.pos[1], a.trk!, a.gs!, -trailSeconds);
        s.tail[0] = t[0];
        s.tail[1] = t[1];
      } else {
        s.tail[0] = s.pos[0];
        s.tail[1] = s.pos[1];
      }
    }
    this.frame++;
    if (this.selected) {
      const p = this.positionOf(this.selected);
      if (p) {
        this.selectedMarker.setLngLat(p);
        if (!this.selectedMarker.getElement().isConnected) this.selectedMarker.addTo(this.map);
      }
    }
    this.renderLayers(zoom);
  }

  private renderLayers(zoom: number) {
    if (!this.atlas) return;
    const zf = zoom < 2.5 ? 0.46 : zoom < 3.5 ? 0.52 : zoom < 4.5 ? 0.62 : zoom < 5.5 ? 0.74 : zoom < 7 ? 0.88 : 1;
    const frame = this.frame;
    const layers = [];
    const sel = this.selected ? this.spriteByHex.get(this.selected) : null;

    if (this.layers.trails) {
      layers.push(new PathLayer<Sprite>({
        id: 'trails',
        data: this.sprites,
        getPath: (s) => [s.tail, s.pos],
        getColor: (s) => [[...s.color, 0], [...s.color, 120]] as unknown as [number, number, number, number],
        getWidth: 1.6,
        widthUnits: 'pixels',
        capRounded: true,
        updateTriggers: { getPath: frame, getColor: frame },
      }));
    }

    if (this.route) {
      const { flown, rest, estimated } = this.route;
      const n = flown.length;
      const fade = (alphaMax: number) => flown.map((_, i) => [251, 108, 43, Math.round(alphaMax * Math.pow(i / Math.max(1, n - 1), 0.8))]);
      if (n > 1) {
        layers.push(new PathLayer({
          id: 'route-flown-glow', data: [flown], getPath: (d: LonLat[]) => d,
          getColor: () => fade(estimated ? 40 : 60) as unknown as [number, number, number, number],
          getWidth: 9, widthUnits: 'pixels', capRounded: true, jointRounded: true,
        }));
        layers.push(new PathLayer({
          id: 'route-flown', data: [flown], getPath: (d: LonLat[]) => d,
          getColor: () => fade(estimated ? 150 : 255) as unknown as [number, number, number, number],
          getWidth: 2.6, widthUnits: 'pixels', capRounded: true, jointRounded: true,
        }));
      }
      if (rest.length > 1 && sel) {
        // start the remaining path at the live (dead-reckoned) position
        const live = [[sel.pos[0], sel.pos[1]] as LonLat, ...rest.slice(1)];
        layers.push(new PathLayer({
          id: 'route-rest', data: [live], getPath: (d: LonLat[]) => d,
          getColor: [237, 240, 244, 150], getWidth: 1.8, widthUnits: 'pixels', capRounded: true,
          getDashArray: [1.2, 4], dashJustified: true,
          extensions: [new PathStyleExtension({ dash: true })],
          updateTriggers: { getPath: frame },
        } as never));
      }
    }

    if (this.followed.size) {
      const rings = this.sprites.filter((s) => this.followed.has(s.a.hex) && s.a.hex !== this.selected);
      layers.push(new ScatterplotLayer<Sprite>({
        id: 'followed-rings', data: rings, getPosition: (s) => s.pos,
        getRadius: 15, radiusUnits: 'pixels', stroked: true, filled: false,
        getLineColor: [251, 108, 43, 190], getLineWidth: 1.3, lineWidthUnits: 'pixels',
        updateTriggers: { getPosition: frame },
      }));
    }

    layers.push(new IconLayer<Sprite>({
      id: 'aircraft',
      data: this.sprites,
      iconAtlas: this.atlas.url,
      iconMapping: this.atlas.mapping as never,
      getIcon: (s) => (s.a.hex === this.selected ? s.icon.replace(/:.*$/, ':s') : s.icon),
      getPosition: (s) => s.pos,
      getSize: (s) => (s.a.hex === this.selected ? s.size * 1.3 : s.size) * zf,
      getAngle: (s) => s.angle,
      sizeUnits: 'pixels',
      billboard: false,
      alphaCutoff: 0.05,
      pickable: true,
      autoHighlight: false,
      updateTriggers: { getPosition: frame, getIcon: this.selected, getSize: [this.selected, zf] },
    }));

    if (this.labels) {
      const t = performance.now();
      if (t - this.lastDeclutter > 300) {
        this.lastDeclutter = t;
        this.labelSet = this.declutter();
      }
      layers.push(new TextLayer<Sprite>({
        id: 'datablocks',
        data: this.labelSet,
        getPosition: (s) => s.pos,
        getText: (s) => `${s.a.cs || s.a.reg || s.a.hex.toUpperCase()}\n${s.a.alt != null ? String(Math.round(s.a.alt / 100)).padStart(3, '0') : '---'} ${s.a.gs ?? '--'}`,
        getColor: (s) => (s.a.hex === this.selected ? [255, 182, 133, 255] : [201, 238, 240, 230]),
        getSize: 10.5,
        sizeUnits: 'pixels',
        getPixelOffset: [14, -6],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'bottom',
        fontFamily: this.labelFont,
        lineHeight: 1.25,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: [7, 10, 16, 170],
        backgroundPadding: [4, 2, 4, 2],
        updateTriggers: { getPosition: frame, getColor: this.selected },
      }));
    }

    if (sel) {
      // draw the selected aircraft again on top of everything
      layers.push(new IconLayer<Sprite>({
        id: 'aircraft-selected',
        data: [sel],
        iconAtlas: this.atlas.url,
        iconMapping: this.atlas.mapping as never,
        getIcon: (s) => s.icon.replace(/:.*$/, ':s'),
        getPosition: (s) => s.pos,
        getSize: (s) => s.size * 1.3 * zf,
        getAngle: (s) => s.angle,
        sizeUnits: 'pixels',
        billboard: false,
        pickable: true,
        updateTriggers: { getPosition: frame },
      }));
    }
    this.overlay.setProps({ layers });
  }

  /** Keep the data blocks that fit without overlapping: selected first, then aircraft closest to the ground. */
  private declutter(): Sprite[] {
    const W = 64, H = 30, CELL = 64;
    const grid = new Map<string, [number, number][]>();
    const out: Sprite[] = [];
    const c = this.map.getContainer();
    const candidates = this.sprites
      .filter((s) => !s.a.ground || (s.a.gs ?? 0) > 30)
      .sort((x, y) => (x.a.hex === this.selected ? -1 : y.a.hex === this.selected ? 1 : (x.a.alt ?? 0) - (y.a.alt ?? 0)));
    for (const s of candidates) {
      const p = this.map.project(s.pos);
      const x = p.x + 14, y = p.y - 6 - H;
      if (x > c.clientWidth || y > c.clientHeight || x + W < 0 || y + H < 0) continue;
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      let clash = false;
      for (let i = gx - 1; i <= gx + 1 && !clash; i++) {
        for (let j = gy - 1; j <= gy + 1 && !clash; j++) {
          for (const [ox, oy] of grid.get(`${i}:${j}`) ?? []) {
            if (Math.abs(ox - x) < W && Math.abs(oy - y) < H) { clash = true; break; }
          }
        }
      }
      if (clash) continue;
      const key = `${gx}:${gy}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push([x, y]);
      out.push(s);
      if (out.length > 120) break;
    }
    return out;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.selectedMarker.remove();
    this.originMarker.remove();
    this.destMarker.remove();
    this.map.remove();
  }
}
