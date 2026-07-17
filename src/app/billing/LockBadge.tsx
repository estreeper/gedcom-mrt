import React from 'react';
import { useShowLock } from '../../state/LicenseStore';

// A small lock hint rendered next to paid actions (Accept, Accept All, Save,
// Export) when the user is known to be unlicensed. Clicking the action itself
// still opens the upsell (via the store gate / export gate); this is just a cue.

export function LockBadge({ title }: { title?: string }) {
  const locked = useShowLock();
  if (!locked) return null;
  return (
    <span
      className="lock-badge"
      title={title ?? 'A license is required to apply repairs'}
      aria-label="Licensed feature"
    >
      🔒
    </span>
  );
}
