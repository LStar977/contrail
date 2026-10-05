'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useAircraftDetail, useMetar, usePhoto, useRoute, useTrace, useWeather, weatherWords } from '@/lib/api';
import { airlineByIcao, airlinesReady, airlineTile, flightLabel, loadAirlines } from '@/lib/airlines';
import { airportsReady, loadAirports } from '@/lib/airports';
import { familyWord, glyphFor, typeName } from '@/lib/aircraftTypes';
import { modelFlight } from '@/lib/flight';
import { describeFlight } from '@/lib/narrative';
import { compassWords, wrap360 } from '@/lib/geo';
import { fmtAgo, fmtAltitude, fmtClock, fmtDuration, fmtInt, fmtLatLon, fmtVerticalRate, fmtZone } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { useMapController } from '@/components/map/MapContext';
import { useNow } from '@/lib/hooks';
import ProfileChart from './ProfileChart';
import Blueprint from './Blueprint';
import Progress from './Progress';

const CAT: Record<string, [string, string]> = {
  VFR: ['rgba(107,222,170,0.12)', '#6bdeaa'], MVFR: ['rgba(140,196,244,0.13)', '#8cc4f4'],
  IFR: ['rgba(247,93,89,0.14)', '#f75d59'], LIFR: ['rgba(215,120,255,0.14)', '#d98cff'],
};

export default function FlightPanel() {
  const hex = useStore((s) => s.selected);
  const live = useStore((s) => (s.selected ? s.aircraft.get(s.selected) : undefined));
  const followed = useStore((s) => (s.selected ? s.followed.some((f) => f.hex === s.selected) : false));
  const { select, follow, unfollow, upsert } = useStore.getState();
  const ctrl = useMapController();
  const now = useNow(1000);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === hex;
  const [, setRefsReady] = useState(0);

  useEffect(() => {
    Promise.all([loadAirports(), loadAirlines()]).then(() => setRefsReady((n) => n + 1)).catch(() => {});
  }, []);

  const { data: detail } = useAircraftDetail(hex);
  useEffect(() => { if (detail) upsert([detail]); }, [detail, upsert]);
  const ac = live ?? detail ?? null;
  const { data: route, isLoading: routeLoading } = useRoute(ac?.cs || null);
  const { data: trace } = useTrace(hex);
  const { data: photo } = usePhoto(hex, ac?.reg);
  const dest = route?.destination;
  const origin = route?.origin;
  const { data: destWx } = useWeather(dest?.lat, dest?.lon);
  const { data: originWx } = useWeather(origin?.lat, origin?.lon);
  const { data: metar } = useMetar(dest?.icao);

  const model = useMemo(() => (ac ? modelFlight(ac, route ?? null, trace ?? null, now) : null), [ac, route, trace, now]);

  if (!hex) return null;
  const airlines = airlinesReady();
  const icaoAirline = ac?.cs.match(/^[A-Z]{3}(?=\d)/)?.[0];
  const al = route?.airline ?? (icaoAirline ? airlineByIcao(airlines, icaoAirline) : undefined) ?? null;
  const tile = airlineTile(al?.icao ?? '', al?.iata);
  const label = ac ? flightLabel(ac.cs, airlines, route?.flight) || ac.reg || hex.toUpperCase() : hex.toUpperCase();

  if (!ac || !model) {
    return (
      <aside className="panel glass" aria-label="Flight details">
        <div className="panel__scroll">
          <div className="panel__head">
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton" style={{ width: 120, height: 20 }} />
              <div className="skeleton" style={{ width: 180, height: 14 }} />
            </div>
            <button className="ibtn" aria-label="Close flight details" onClick={() => select(null)}><Icon name="close" /></button>
          </div>
          <p style={{ color: 'var(--text-2)' }}>Looking for {hex.toUpperCase()}… it may be out of receiver range right now.</p>
        </div>
      </aside>
    );
  }

  const plausible = model.progress?.plausible ?? false;
  const alt = fmtAltitude(ac.alt, ac.ground);
  const vrate = fmtVerticalRate(ac.vr, ac.ground);
  const [lat, lon] = fmtLatLon(ac.lat, ac.lon);
  const story = describeFlight(ac, plausible ? route ?? null : null, airportsReady(), new Date(now));
  const sunny = /sunset|sunrise|night/i.test(story);
  const statusClass = ac.ground ? 'status' : model.phase === 'climb' ? 'status status--climb' : model.phase === 'descent' ? 'status status--info' : 'status status--ok';
  const statusText = ac.ground ? 'On ground' : model.phase === 'climb' ? 'Climbing' : model.phase === 'descent' ? 'Descending' : 'En route';
  const glyph = glyphFor(ac.type, ac.cat);
  const year = Number(trace?.year);
  const age = year > 1950 ? new Date(now).getFullYear() - year : null;
  const leftMin = model.eta ? (model.eta - now) / 60_000 : null;
  const flightMin = model.eta && model.takeoff ? (model.eta - model.takeoff) / 60_000 : null;
  const cat = metar?.category && CAT[metar.category];
  const seenAgo = now - ac.t;

  const share = async () => {
    const url = `${location.origin}/?flight=${hex}`;
    const text = `${label}${origin && dest ? ` · ${origin.iata || origin.icao} → ${dest.iata || dest.icao}` : ''} on Contrail`;
    try {
      if (navigator.share) await navigator.share({ title: label, text, url });
      else await navigator.clipboard.writeText(url);
    } catch {}
  };

  return (
    <aside className={`panel glass${expanded ? '' : ' is-peek'}`} aria-label={`Flight details for ${label}`}>
      <button className="panel__grip" aria-label={expanded ? 'Collapse details' : 'Expand details'} onClick={() => setExpandedFor(expanded ? null : hex)} />
      <div className="panel__scroll">
        <div className="panel__head">
          <div className="tile" style={{ background: tile.bg, color: tile.fg }}>{al ? tile.label : <Icon name="globe" size={20} />}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="panel__title">{label}</h1>
              <span className={statusClass}>{statusText}</span>
            </div>
            <div className="panel__sub">
              <span>{al?.name ?? (ac.cs ? 'Unknown operator' : 'No callsign broadcast')}</span>
              {ac.cs && <><span style={{ color: 'var(--text-4)' }}>·</span><span className="mono">{ac.cs}</span></>}
            </div>
          </div>
          <button className="ibtn" aria-label="Close flight details" onClick={() => select(null)}><Icon name="close" /></button>
        </div>

        {origin && dest && plausible ? (
          <section className="route" aria-label="Route and progress">
            <div className="route__codes">
              <div>
                <div className="route__code">{origin.iata || origin.icao}</div>
                <div className="route__city">{origin.city || origin.name}</div>
              </div>
              <div className="route__dur">{flightMin ? fmtDuration(flightMin) : ''}</div>
              <div style={{ textAlign: 'right' }}>
                <div className="route__code">{dest.iata || dest.icao}</div>
                <div className="route__city">{dest.city || dest.name}</div>
              </div>
            </div>
            <Progress frac={model.progress!.frac} label={`${Math.round(model.progress!.frac * 100)}% of the way from ${origin.city || origin.name} to ${dest.city || dest.name}`} />
            <div className="route__times">
              <div className="route__time">
                <small>{model.takeoff ? 'Took off' : 'First seen'}</small>
                {model.takeoff || model.firstSeen ? (
                  <strong>{fmtClock(new Date((model.takeoff ?? model.firstSeen)!), originWx?.timezone)} <span>{fmtZone(new Date(now), originWx?.timezone)}</span></strong>
                ) : <strong>—</strong>}
                <em>{fmtInt(model.progress!.flown)} nm flown</em>
              </div>
              <div className="route__time">
                <small>{ac.ground ? 'Arrived' : 'Estimated landing'}</small>
                {model.eta ? (
                  <strong>{fmtClock(new Date(model.eta), destWx?.timezone)} <span>{fmtZone(new Date(model.eta), destWx?.timezone)}</span></strong>
                ) : <strong>—</strong>}
                <em className="is-signal">{leftMin != null ? `${fmtDuration(leftMin)} to go · ${fmtInt(model.progress!.left)} nm` : ac.ground ? 'On the ground' : ''}</em>
              </div>
            </div>
          </section>
        ) : (
          <div className="route--unknown">
            {routeLoading ? 'Looking up the route…' : ac.cs
              ? origin && dest && !plausible
                ? `The published route for ${ac.cs} (${origin.iata || origin.icao} → ${dest.iata || dest.icao}) doesn't match this aircraft's track, so we're not showing it. Route databases go out of date.`
                : `No public route for ${ac.cs}. Private, military and cargo flights often don't publish one.`
              : 'This aircraft isn’t broadcasting a callsign, so there’s no route to look up.'}
          </div>
        )}

        <p className={`story${model.estimated ? ' story--est' : sunny ? ' story--sun' : ''}`}>
          <Icon name={model.estimated ? 'signal' : sunny ? 'sunset' : 'pin'} />
          <span>{model.estimated ? `Out of receiver range for ${fmtAgo(seenAgo).replace(' ago', '')}. Position is estimated from its last speed and heading.` : story}</span>
        </p>

        <section className="telemetry" aria-label="Live telemetry">
          <div>
            <div className="label">Altitude</div>
            <div className="telemetry__v"><b>{alt.value}</b><i>{alt.unit}</i></div>
            <div className="telemetry__s">{alt.sub}</div>
          </div>
          <div>
            <div className="label">Speed</div>
            <div className="telemetry__v"><b>{ac.gs ?? '—'}</b><i>kt</i></div>
            <div className="telemetry__s">{ac.gs != null ? `${fmtInt(ac.gs * 1.852)} km/h` : 'No data'}</div>
          </div>
          <div>
            <div className="label">Track</div>
            <div className="telemetry__v"><b>{ac.trk != null ? `${Math.round(wrap360(ac.trk))}°` : '—'}</b></div>
            <div className="telemetry__s">{ac.trk != null ? compassWords(ac.trk).replace(/^./, (c) => c.toUpperCase()) : 'No data'}</div>
          </div>
          <div>
            <div className="label">Vertical</div>
            <div className="telemetry__v"><b>{vrate.value}</b><i>fpm</i></div>
            <div className="telemetry__s">{vrate.sub}</div>
          </div>
          <div>
            {detail?.ws != null && detail.wd != null ? (
              <>
                <div className="label">Wind aloft</div>
                <div className="telemetry__v"><b>{Math.round(detail.ws)}</b><i>kt</i></div>
                <div className="telemetry__s">From {Math.round(detail.wd)}°{detail.oat != null ? ` · ${Math.round(detail.oat)}°C` : ''}</div>
              </>
            ) : (
              <>
                <div className="label">Squawk</div>
                <div className="telemetry__v"><b className="mono" style={{ fontSize: 16 }}>{ac.sq || '—'}</b></div>
                <div className="telemetry__s">{ac.emergency ? 'Emergency code' : 'Transponder code'}</div>
              </>
            )}
          </div>
          <div>
            <div className="label">Position</div>
            <div className="telemetry__pos">{lat}<br />{lon}</div>
          </div>
        </section>

        {model.flownProfile.length > 1 && (
          <section aria-label="Flight profile">
            <div className="section-head" style={{ marginBottom: 10 }}>
              <h2>Flight profile</h2>
              <span>{ac.ground ? 'On the ground' : model.phase === 'cruise' ? `Cruising at ${alt.sub.startsWith('FL') ? alt.sub : alt.value + ' ft'}` : statusText}</span>
            </div>
            <ProfileChart flown={model.flownProfile} predicted={model.predictedProfile} now={now} />
          </section>
        )}

        {photo && (
          <figure className="photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={`${typeName(ac.type, trace?.desc)} ${ac.reg}`} width={photo.width} height={photo.height} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <figcaption>
              <a href={photo.link} target="_blank" rel="noreferrer">© {photo.photographer} · Planespotters.net</a>
            </figcaption>
          </figure>
        )}

        <section className="aircraft" aria-label="Aircraft">
          <Blueprint glyph={glyph} />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="label">Aircraft</div>
            <div className="aircraft__name">{typeName(ac.type, trace?.desc)}</div>
            <div className="aircraft__meta">{[ac.reg, ac.type, age != null ? `${age} yr${age === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || hex.toUpperCase()}</div>
            <div className="aircraft__extra">{familyWord(glyph)} · ICAO {hex.toUpperCase()}</div>
          </div>
        </section>

        {dest && plausible && destWx && (
          <section className="wx" aria-label="Weather at destination">
            <Icon name="cloud" strokeWidth={1.3} style={{ color: 'var(--text-2)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Now at {dest.iata || dest.icao} · {fmtClock(new Date(now), destWx.timezone)} local</div>
              <div style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{Math.round(destWx.tempC)}°</b> {weatherWords(destWx.code)} · Wind {Math.round(destWx.windDir)}° at {Math.round(destWx.windKt)} kt</div>
            </div>
            {cat && <span className="wx__cat" style={{ background: cat[0], color: cat[1] }}>{metar!.category}</span>}
          </section>
        )}

        <p className="panel__foot">
          Live position from <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> receivers{seenAgo > 15_000 ? ` · last update ${fmtAgo(seenAgo)}` : ''}. Routes from adsbdb and hexdb are matched by callsign and can be wrong. Arrival times are estimates.
        </p>
      </div>

      <div className="panel__actions">
        <button
          className={`btn btn--follow ${followed ? 'btn--quiet' : 'btn--primary'}`}
          aria-pressed={followed}
          onClick={() => (followed ? unfollow(hex) : follow({ hex, cs: ac.cs, label }))}
        >
          <Icon name={followed ? 'check' : 'star'} size={18} strokeWidth={1.8} />
          {followed ? 'Following' : 'Follow flight'}
        </button>
        <button className="btn btn--quiet" style={{ width: 44, padding: 0 }} aria-label="Center on map" onClick={() => {
          const p = ctrl.current?.positionOf(hex);
          if (p) ctrl.current?.flyTo(p, Math.max(6, ctrl.current.map.getZoom()));
        }}><Icon name="locate" size={18} /></button>
        <button className="btn btn--quiet" style={{ width: 44, padding: 0 }} aria-label="Share flight" onClick={share}><Icon name="share" size={18} /></button>
      </div>
    </aside>
  );
}
