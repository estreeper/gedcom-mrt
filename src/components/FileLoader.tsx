import React, { useState } from 'react';
import { parse } from '../lib/Parser';
import { useRepair } from '../state/RepairStore';

// Loads a GEDCOM file and hands the parsed database to the store.

export function FileLoader() {
  const { dispatch } = useRepair();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const db = await parse(file);
      dispatch({ type: 'LOAD', db, name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="file-loader">
      <h1>GEDCOM Repair</h1>
      <p>Load a GEDCOM (.ged) file to check it for problems and repair them.</p>
      <input type="file" accept=".ged,.gedcom,text/plain" onChange={onChange} />
      {busy && <p>Parsing…</p>}
      {error && <p className="error">Could not read file: {error}</p>}
    </div>
  );
}
