'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useLocalStorage, useNotificationPermission, useNotificationsSupported } from '@/lib/hooks';
import type { Aircraft, FlightRoute } from '@/lib/types';

type Item = { hex: string; label: string; ac: Aircraft | null; route: FlightRoute | null; seen: boolean };
const KEY = 'contrail:alerts';

/**
 * Browser notifications for followed flights: takeoff, start of descent and landing.
 * Runs only while a Contrail tab is open; state transitions are inferred from live ADS-B.
 */
export function useLandingAlerts(items: Item[]) {
  const supported = useNotificationsSupported();
  const permission = useNotificationPermission();
  const [pref, setPref] = useLocalStorage(KEY);
  const enabled = supported && permission === 'granted' && pref === '1';
  const last = useRef(new Map<string, 'ground' | 'climb' | 'cruise' | 'descent'>());

  const toggle = useCallback(async () => {
    if (!('Notification' in window)) return;
    if (enabled) {
      setPref('0');
      return;
    }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPref(p === 'granted' ? '1' : '0');
  }, [enabled, setPref]);

  useEffect(() => {
    for (const it of items) {
      if (!it.ac || !it.seen) continue;
      const vr = it.ac.vr ?? 0;
      const phase = it.ac.ground ? 'ground' : vr > 500 ? 'climb' : vr < -800 ? 'descent' : 'cruise';
      const prev = last.current.get(it.hex);
      last.current.set(it.hex, phase);
      if (!enabled || !prev || prev === phase) continue;
      const dest = it.route?.destination;
      const where = dest ? ` at ${dest.city || dest.name}` : '';
      let body: string | null = null;
      if (prev === 'ground' && phase === 'climb') body = `${it.label} has taken off.`;
      else if (phase === 'descent' && prev === 'cruise') body = `${it.label} has started its descent${dest ? ` into ${dest.city || dest.name}` : ''}.`;
      else if (phase === 'ground' && prev !== 'ground') body = `${it.label} has landed${where}.`;
      if (body) {
        try { new Notification('Contrail', { body, tag: `${it.hex}:${phase}`, icon: '/icon-192.png' }); } catch {}
      }
    }
  }, [items, enabled]);

  return { supported, enabled, toggle };
}
