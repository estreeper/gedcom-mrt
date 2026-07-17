// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// We migrated the test runner from Jest to Vitest. A couple of test files use
// the `jest.*` API (spyOn/restoreAllMocks); alias it to Vitest's `vi` so those
// tests run unchanged. `vi` is API-compatible for the methods in use.
import { vi } from 'vitest';
(globalThis as unknown as { jest: typeof vi }).jest = vi;

// jsdom lacks ResizeObserver, which react-window relies on. Small no-op mock so
// components that (in production) virtualize can still mount in tests. Lists
// under the virtualization threshold render plainly, so tests see all rows.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverMock;

// The Zustand store is a module singleton; unmount then reset it between tests
// for isolation (unmounting first avoids updating live components out of act()).
import { cleanup } from '@testing-library/react';
import { useRepairStore } from './state/RepairStore';
import { useLicenseStore } from './state/LicenseStore';
import { useUpsellStore } from './state/UpsellStore';
afterEach(() => {
  cleanup();
  useRepairStore.setState(useRepairStore.getInitialState(), true);
  // Reset auth/license to the unknown (soft-permissive) state and close any
  // upsell modal so tests don't leak license state into one another.
  useLicenseStore.setState(
    { authState: 'unknown', user: undefined, license: undefined, busy: false, error: undefined },
    false
  );
  useUpsellStore.setState({ open: false, reason: undefined }, false);
  // The app now uses a real router (BrowserRouter over jsdom's history), so
  // reset the URL between tests — otherwise a test that navigated to
  // /app/file/... would start the next test's <App/> render there.
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', '/');
  }
});
