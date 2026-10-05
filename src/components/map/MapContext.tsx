'use client';

import type { MapController } from './MapController';

// The live map is a single, page-level object; other components reach it through this handle.
let current: MapController | null = null;
const handle = {
  get current() {
    return current;
  },
};

export function setLiveMap(c: MapController | null) {
  current = c;
}

export const useMapController = () => handle;
