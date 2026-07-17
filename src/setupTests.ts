// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom lacks ResizeObserver, which react-window relies on. Small no-op mock so
// components that (in production) virtualize can still mount in tests. Lists
// under the virtualization threshold render plainly, so tests see all rows.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverMock;

// The Zustand store is a module singleton; unmount then reset it between tests
// for isolation (unmounting first avoids updating live components out of act()).
import { cleanup } from '@testing-library/react';
import { useRepairStore } from './state/RepairStore';
afterEach(() => {
  cleanup();
  useRepairStore.setState(useRepairStore.getInitialState(), true);
});
