import { create } from 'zustand';

// Controls the paywall/upsell modal. Kept separate and tiny so the store gate
// seam (RepairStore.setUpsellHandler) can open it from outside React.

export type UpsellReason = 'apply' | 'export' | 'cloud' | undefined;

interface UpsellState {
  open: boolean;
  reason: UpsellReason;
  show(reason?: UpsellReason): void;
  close(): void;
}

export const useUpsellStore = create<UpsellState>((set) => ({
  open: false,
  reason: undefined,
  show: (reason) => set({ open: true, reason }),
  close: () => set({ open: false, reason: undefined }),
}));
