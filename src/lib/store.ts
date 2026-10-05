'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Aircraft } from './types';

export type Followed = { hex: string; cs: string; label: string; addedAt: number };
export type LayerState = { trails: boolean; airports: boolean; night: boolean };
/** airline: callsign prefix · type: ICAO type code (polled worldwide) · mil: military · sqk: squawk code (polled worldwide) */
export type MapFilter = { kind: 'airline' | 'type' | 'mil' | 'sqk'; value: string; label: string } | null;

type State = {
  // live
  aircraft: Map<string, Aircraft>;
  inView: number;
  updatedAt: number;
  stale: boolean;
  partial: boolean;
  error: string | null;
  // ui
  selected: string | null;
  paletteOpen: boolean;
  filter: MapFilter;
  // persisted
  layers: LayerState;
  followed: Followed[];

  setTraffic: (list: Aircraft[], at: number, stale?: boolean, partial?: boolean) => void;
  upsert: (list: Aircraft[]) => void;
  setError: (msg: string | null) => void;
  select: (hex: string | null) => void;
  setPalette: (open: boolean) => void;
  setFilter: (f: MapFilter) => void;
  toggleLayer: (k: keyof LayerState) => void;
  follow: (f: Omit<Followed, 'addedAt'>) => void;
  unfollow: (hex: string) => void;
  isFollowed: (hex: string) => boolean;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      aircraft: new Map(),
      inView: 0,
      updatedAt: 0,
      stale: false,
      partial: false,
      error: null,
      selected: null,
      paletteOpen: false,
      filter: null,
      layers: { trails: true, airports: true, night: true },
      followed: [],

      setTraffic: (list, at, stale = false, partial = false) => {
        const next = new Map<string, Aircraft>();
        for (const a of list) next.set(a.hex, a);
        // keep what we know about followed/selected aircraft that fell out of view
        const prev = get().aircraft;
        for (const hex of [get().selected, ...get().followed.map((f) => f.hex)]) {
          if (hex && !next.has(hex) && prev.has(hex)) next.set(hex, prev.get(hex)!);
        }
        set({ aircraft: next, inView: list.length, updatedAt: at, stale, partial, error: null });
      },
      upsert: (list) => {
        if (!list.length) return;
        const next = new Map(get().aircraft);
        for (const a of list) {
          const old = next.get(a.hex);
          if (!old || a.t >= old.t) next.set(a.hex, a);
        }
        set({ aircraft: next });
      },
      setError: (error) => set({ error }),
      select: (selected) => set({ selected }),
      setPalette: (paletteOpen) => set({ paletteOpen }),
      setFilter: (filter) => set({ filter }),
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      follow: (f) =>
        set((s) => (s.followed.some((x) => x.hex === f.hex) ? s : { followed: [...s.followed, { ...f, addedAt: Date.now() }].slice(-20) })),
      unfollow: (hex) => set((s) => ({ followed: s.followed.filter((f) => f.hex !== hex) })),
      isFollowed: (hex) => get().followed.some((f) => f.hex === hex),
    }),
    {
      name: 'contrail',
      partialize: (s) => ({ layers: s.layers, followed: s.followed }),
    },
  ),
);
