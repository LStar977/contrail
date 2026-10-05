'use client';

import { useCallback, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------- a shared clock

const clockSubs = new Map<number, (cb: () => void) => () => void>();
function clockSubscribe(ms: number) {
  let sub = clockSubs.get(ms);
  if (!sub) {
    sub = (cb) => {
      const id = setInterval(cb, ms);
      return () => clearInterval(id);
    };
    clockSubs.set(ms, sub);
  }
  return sub;
}

/** Current time, ticking every `ms`. Returns 0 during server rendering. */
export function useNow(ms = 1000): number {
  return useSyncExternalStore(clockSubscribe(ms), () => Math.floor(Date.now() / ms) * ms, () => 0);
}

// ---------------------------------------------------------------- localStorage as an external store

const STORAGE_EVENT = 'contrail-storage';
function storageSubscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(STORAGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(STORAGE_EVENT, cb);
  };
}
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** A localStorage value that stays in sync across components and tabs (null on the server). */
export function useLocalStorage(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(storageSubscribe, () => read(key), () => null);
  const set = useCallback((v: string | null) => {
    try {
      if (v == null) localStorage.removeItem(key);
      else localStorage.setItem(key, v);
    } catch {}
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, [key]);
  return [value, set];
}

// ---------------------------------------------------------------- browser capabilities

const noopSubscribe = () => () => {};
/** True in browsers that support the Notifications API. */
export const useNotificationsSupported = () =>
  useSyncExternalStore(noopSubscribe, () => typeof window !== 'undefined' && 'Notification' in window, () => false);

function permissionSubscribe(cb: () => void) {
  window.addEventListener(STORAGE_EVENT, cb);
  window.addEventListener('focus', cb);
  return () => {
    window.removeEventListener(STORAGE_EVENT, cb);
    window.removeEventListener('focus', cb);
  };
}
export const useNotificationPermission = () =>
  useSyncExternalStore(permissionSubscribe, () => ('Notification' in window ? Notification.permission : 'denied'), () => 'default' as NotificationPermission);
