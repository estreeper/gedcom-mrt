import React, { useEffect } from 'react';
import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import {
  setLicenseGate,
  setUpsellHandler,
} from './RepairStore';
import { useUpsellStore } from './UpsellStore';

// Auth + license state for the client. This is the single source of truth for
// "is the user signed in / licensed", and it wires the RepairStore's gate seam.
//
// The gate is SOFT: applying repairs is blocked only when we affirmatively know
// the user is unlicensed (signed out, or signed in without an active license).
// While the status is still unknown — including when the backend is
// unreachable — applying is allowed. That matches the product intent (a savvy
// user bypassing it is acceptable) and keeps the app usable offline.

export type AuthState = 'unknown' | 'anonymous' | 'user';
export type ServerLicenseStatus = 'active' | 'expired' | 'refunded' | 'none';

export interface AccountUser {
  id: string;
  email: string;
}

export interface LicenseInfo {
  status: ServerLicenseStatus;
  plan: 'annual' | null;
  expiresAt: number | null;
}

interface LicenseStore {
  authState: AuthState;
  user?: AccountUser;
  license?: LicenseInfo;
  busy: boolean;
  error?: string;

  refresh(): Promise<void>;
  login(email: string, password: string): Promise<boolean>;
  signup(email: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
  startCheckout(): Promise<void>;
}

async function fetchLicense(): Promise<LicenseInfo | undefined> {
  try {
    return await api.get<LicenseInfo>('/license');
  } catch {
    return undefined;
  }
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  authState: 'unknown',
  busy: false,

  async refresh() {
    try {
      const { user } = await api.get<{ user: AccountUser }>('/auth/me');
      const license = await fetchLicense();
      set({ authState: 'user', user, license, error: undefined });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Affirmatively signed out.
        set({ authState: 'anonymous', user: undefined, license: undefined });
      } else {
        // Network / server error: leave status unknown so the soft gate allows.
        set({ authState: 'unknown' });
      }
    }
  },

  async login(email, password) {
    set({ busy: true, error: undefined });
    try {
      const { user } = await api.post<{ user: AccountUser }>('/auth/login', {
        json: { email, password },
      });
      const license = await fetchLicense();
      set({ authState: 'user', user, license, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: messageOf(err) });
      return false;
    }
  },

  async signup(email, password) {
    set({ busy: true, error: undefined });
    try {
      const { user } = await api.post<{ user: AccountUser }>('/auth/signup', {
        json: { email, password },
      });
      const license = await fetchLicense();
      set({ authState: 'user', user, license, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: messageOf(err) });
      return false;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout', { parse: 'none' });
    } catch {
      // ignore; clear locally regardless
    }
    set({ authState: 'anonymous', user: undefined, license: undefined });
  },

  async startCheckout() {
    set({ busy: true, error: undefined });
    try {
      const { url } = await api.post<{ url: string }>('/checkout');
      window.location.assign(url);
    } catch (err) {
      set({ busy: false, error: messageOf(err) });
    }
  },
}));

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

/** True only when the signed-in user holds an active license. */
export function isLicensed(s = useLicenseStore.getState()): boolean {
  return s.authState === 'user' && s.license?.status === 'active';
}

/** The soft gate: allow applying unless we know the user is unlicensed. */
export function canApplyRepairs(s = useLicenseStore.getState()): boolean {
  if (s.authState === 'unknown') return true; // don't know yet → allow
  return isLicensed(s);
}

export function useIsLicensed(): boolean {
  return useLicenseStore((s) => isLicensed(s));
}

/**
 * Whether to show a "locked" hint on paid actions. True only once we
 * affirmatively know the user is unlicensed (never during the unknown/loading
 * window, so the UI doesn't flash a lock before the gate would actually block).
 */
export function useShowLock(): boolean {
  return useLicenseStore((s) => s.authState !== 'unknown' && !isLicensed(s));
}

// Dedupe the initial fetch across React 18 StrictMode's double-mounted effects.
let initialized = false;

/** Mounts once near the app root: fetches session/license and wires the gate. */
export function LicenseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setLicenseGate(() => canApplyRepairs());
    setUpsellHandler((reason) =>
      useUpsellStore.getState().show(reason as never)
    );
    if (!initialized) {
      initialized = true;
      void useLicenseStore.getState().refresh();
    }
  }, []);
  return React.createElement(React.Fragment, null, children);
}
