import React, { useCallback, useEffect, useState } from 'react';
import { parseText } from '../lib/Parser';
import { useRepair } from '../state/RepairStore';
import {
  checksum,
  listSessions,
  loadSessionById,
  deleteSession,
  FileMeta,
} from '../lib/idb';

// Start screen: upload a new GEDCOM file, or re-open a previously-saved one.
// Saved files are keyed by a content checksum, so re-uploading the same file is
// detected as a duplicate and two different files never overwrite each other.

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
    reader.readAsText(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

export function FileLoader() {
  const { dispatch } = useRepair();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FileMeta[]>([]);
  const [highlightId, setHighlightId] = useState<string>();

  const refresh = useCallback(() => {
    listSessions().then(setSaved);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const text = await readFileText(file);
      const id = await checksum(text);

      // Reject a duplicate rather than overwriting or re-adding it.
      const existing = await loadSessionById(id);
      if (existing) {
        setNotice(
          `“${file.name}” is already saved as “${existing.name}”. Open it from the list below, or delete it first to start over.`
        );
        setHighlightId(id);
        refresh();
        input.value = '';
        return;
      }

      const db = parseText(text);
      dispatch({ type: 'LOAD', db, name: file.name, id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openSaved = async (id: string) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const file = await loadSessionById(id);
      if (!file) {
        setError('That saved file could no longer be found.');
        refresh();
        return;
      }
      const db = parseText(file.text);
      dispatch({ type: 'LOAD', db, name: file.name, id: file.id, restored: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await deleteSession(id);
    if (highlightId === id) {
      setHighlightId(undefined);
      setNotice(undefined);
    }
    refresh();
  };

  return (
    <div className="file-loader">
      <h1>GEDCOM Repair</h1>
      <p>Load a GEDCOM (.ged) file to check it for problems and repair them.</p>
      <input type="file" accept=".ged,.gedcom,text/plain" onChange={onUpload} />
      {busy && <p>Parsing…</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {saved.length > 0 && (
        <div className="saved-files">
          <h2>Saved files</h2>
          <p className="saved-files-hint">
            Repairs are saved in your browser. Re-open where you left off:
          </p>
          <ul>
            {saved.map((f) => (
              <li
                key={f.id}
                className={`saved-file${f.id === highlightId ? ' highlight' : ''}`}
              >
                <button
                  className="saved-file-open"
                  onClick={() => openSaved(f.id)}
                  disabled={busy}
                >
                  <span className="saved-file-name">{f.name}</span>
                  <span className="saved-file-meta">
                    {formatSize(f.size)}
                    {formatWhen(f.savedAt) ? ` · ${formatWhen(f.savedAt)}` : ''}
                  </span>
                </button>
                <button
                  className="saved-file-delete"
                  title={`Delete ${f.name}`}
                  aria-label={`Delete ${f.name}`}
                  onClick={() => remove(f.id)}
                  disabled={busy}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
