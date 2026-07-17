import React, { useEffect } from 'react';
import { useRepairStore } from '../../state/RepairStore';
import { useCloudKeyStore } from '../../state/CloudKeyStore';
import { isLicensed } from '../../state/LicenseStore';
import { serializeDatabase } from '../../lib/model/Serialize';
import { saveCloud } from '../../lib/cloud';

// Mirrors the working session to encrypted cloud storage, in parallel with the
// local IndexedDB autosave (RepairProvider). Kept as a separate provider so the
// domain store stays decoupled from auth/crypto/networking. Best-effort: only
// runs when licensed AND the DEK is unlocked in memory.

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useRepairStore.subscribe((state, prev) => {
      if (state.db === prev.db) return;
      if (timer) clearTimeout(timer);
      const { db, fileName, fileId } = state;
      timer = setTimeout(() => {
        const { dek, status } = useCloudKeyStore.getState();
        if (!db || !fileId || status !== 'unlocked' || !dek || !isLicensed()) return;
        saveCloud(fileId, fileName ?? 'file.ged', serializeDatabase(db), dek).catch(
          () => {
            // best-effort mirror; local autosave is the durable copy
          }
        );
      }, 800);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <>{children}</>;
}
