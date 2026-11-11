import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { FixDiff } from './FixDiff';
import { VirtualList } from './VirtualList';
import { useLicenseStore } from '../state/LicenseStore';
import { useRepairStore } from '../state/RepairStore';
import { useUpsellStore } from '../state/UpsellStore';
import { parseText } from '../lib/Parser';
import { checksum, listSessions, loadSessionById, saveSession } from '../lib/idb';
import { BROKEN, CLEAN, ONE_WAY } from '../lib/__fixtures__';
import { installFakeApi, fail } from '../test/fakeApi';

// The working screen end to end, with a real (in-memory) IndexedDB so the
// autosave / saved-files / deep-link paths run: exporting, re-opening saved
// work, and the record editor's edge cases.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  // No session: the app runs with the license unknown (soft gate open).
  installFakeApi({ 'GET /auth/me': fail(500) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderApp = (url = '/app') => {
  window.history.replaceState(null, '', url);
  return render(<App />);
};
const upload = (container: HTMLElement, text: string, name = 'tree.ged') =>
  userEvent.upload(
    container.querySelector('input[type="file"]') as HTMLInputElement,
    new File([text], name, { type: 'text/plain' })
  );
const saved = async (id: string) =>
  waitFor(async () => expect(await loadSessionById(id)).toBeDefined(), { timeout: 3000 });

describe('exporting', () => {
  function captureDownload() {
    const blobs: Blob[] = [];
    const names: string[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:fake'));
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    return { blobs, names };
  }

  it('downloads the repaired file, byte-for-byte what the store holds', async () => {
    const { blobs, names } = captureDownload();
    const { container } = renderApp();
    await upload(container, ONE_WAY);
    fireEvent.click(await screen.findByText('Accept'));
    await screen.findByText('1 fix applied');

    fireEvent.click(screen.getByRole('button', { name: 'Export GEDCOM' }));
    expect(names).toEqual(['repaired.ged']);
    const text = await blobs[0].text();
    expect(text).toContain('1 FAMC @F1@');
    expect(text.replace('1 FAMC @F1@\n', '')).toBe(ONE_WAY);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull(); // temp link cleaned up
  });

  it('exports an untouched file unchanged, including CRLF line endings and a BOM', async () => {
    const original = '﻿' + CLEAN.split('\n').join('\r\n');
    const { blobs } = captureDownload();
    useRepairStore.getState().load(parseText(original), 'win.ged', false, 'x');
    renderApp('/app/file/x');
    fireEvent.click(await screen.findByRole('button', { name: 'Export GEDCOM' }));
    // Blob.text() would strip the BOM while decoding; compare the raw bytes.
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(original)));
  });

  it('asks an unlicensed user to upgrade instead of downloading', async () => {
    const { blobs } = captureDownload();
    const { container } = renderApp();
    await upload(container, ONE_WAY);
    await screen.findByText('Accept');
    act(() => useLicenseStore.setState({ authState: 'anonymous' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export GEDCOM' }));
    expect(blobs).toEqual([]);
    expect(useUpsellStore.getState()).toMatchObject({ open: true, reason: 'export' });
    expect(screen.getByRole('dialog')).toHaveTextContent('Exporting the repaired file needs a license.');
    expect(screen.getByTitle('A license is required to export the repaired file')).toBeInTheDocument();
  });

  it('undo and redo are enabled only when there is something to undo/redo', async () => {
    const { container } = renderApp();
    await upload(container, ONE_WAY);
    const undo = await screen.findByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(screen.getByText('0 fixes applied')).toBeInTheDocument();
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    fireEvent.click(screen.getByText('Accept'));
    await screen.findByText('No issues found.');
    expect(undo).toBeEnabled();

    fireEvent.click(undo);
    expect(await screen.findByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('0 fixes applied')).toBeInTheDocument();
    expect(redo).toBeEnabled();

    fireEvent.click(redo);
    expect(await screen.findByText('No issues found.')).toBeInTheDocument();
    expect(redo).toBeDisabled();
  });
});

describe('saved files', () => {
  it('autosaves repairs and re-opens them from the start screen', async () => {
    const id = await checksum(ONE_WAY);
    const { container } = renderApp();
    await upload(container, ONE_WAY, 'family.ged');
    fireEvent.click(await screen.findByText('Accept'));
    await waitFor(async () => expect((await loadSessionById(id))?.text).toContain('1 FAMC @F1@'), {
      timeout: 3000,
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    expect(window.location.pathname).toBe('/app');

    const row = await screen.findByRole('button', { name: /^family\.ged/ });
    expect(screen.getByRole('heading', { name: 'Saved files' })).toBeInTheDocument();
    fireEvent.click(row);

    // The repaired text comes back (no issues), flagged as a saved session.
    expect(await screen.findByText('No issues found.')).toBeInTheDocument();
    expect(container.querySelector('.file-name')).toHaveTextContent('family.ged');
    expect(container.querySelector('.restored-note')).toHaveTextContent('saved');
    await waitFor(() => expect(window.location.pathname).toBe(`/app/file/${id}`));
  });

  it('keeps the current file when "New file" is declined', async () => {
    const { container } = renderApp();
    await upload(container, ONE_WAY);
    await screen.findByText('Accept');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(useRepairStore.getState().db).toBeDefined();
  });

  it('points at the saved copy instead of re-loading an identical upload', async () => {
    await saveSession(await checksum(BROKEN), 'earlier-name.ged', BROKEN);
    const { container } = renderApp();
    await screen.findByRole('button', { name: /^earlier-name\.ged/ });

    await upload(container, BROKEN, 'same-content.ged');
    expect(await screen.findByText(/“same-content\.ged” is already saved as “earlier-name\.ged”/)).toBeInTheDocument();
    expect(container.querySelector('.saved-file.highlight')).toHaveTextContent('earlier-name.ged');
    expect(useRepairStore.getState().db).toBeUndefined(); // nothing was loaded over it
  });

  it('deletes a saved file, clearing a notice that pointed at it', async () => {
    const id = await checksum(BROKEN);
    await saveSession(id, 'old.ged', BROKEN);
    await saveSession('other', 'keep.ged', CLEAN);
    const { container } = renderApp();
    await screen.findByRole('button', { name: /^old\.ged/ });
    await upload(container, BROKEN);
    await screen.findByText(/already saved/);

    fireEvent.click(screen.getByRole('button', { name: 'Delete old.ged' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^old\.ged/ })).not.toBeInTheDocument());
    expect(screen.queryByText(/already saved/)).not.toBeInTheDocument();
    expect((await listSessions()).map((f) => f.name)).toEqual(['keep.ged']);
  });

  it('reports a saved file that has vanished and refreshes the list', async () => {
    await saveSession('gone', 'gone.ged', CLEAN);
    renderApp();
    const row = await screen.findByRole('button', { name: /^gone\.ged/ });
    // Deleted from another tab after this list was drawn.
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('gedcom-mrt');
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite');
        tx.objectStore('files').delete('gone');
        tx.oncomplete = () => (req.result.close(), resolve());
      };
    });
    fireEvent.click(row);
    expect(await screen.findByText('That saved file could no longer be found.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^gone\.ged/ })).not.toBeInTheDocument());
  });

  it('formats sizes in the list', async () => {
    await saveSession('b', 'bytes.ged', 'x'.repeat(100));
    await saveSession('k', 'kilo.ged', 'x'.repeat(2048));
    await saveSession('m', 'mega.ged', 'x'.repeat(3 * 1024 * 1024));
    renderApp();
    expect(await screen.findByRole('button', { name: /^bytes\.ged/ })).toHaveTextContent('100 B');
    expect(screen.getByRole('button', { name: /^kilo\.ged/ })).toHaveTextContent('2 KB');
    expect(screen.getByRole('button', { name: /^mega\.ged/ })).toHaveTextContent('3.0 MB');
  });
});

describe('deep links', () => {
  it('restores a saved file straight from its URL, at the linked issue', async () => {
    await saveSession('abc123', 'linked.ged', BROKEN);
    const issues = (await import('../lib/Validator')).validate(parseText(BROKEN));
    const second = issues[1];
    const { container } = renderApp(`/app/file/abc123/issues/${encodeURIComponent(second.id)}`);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText(/2 issues/)).toBeInTheDocument();
    expect(container.querySelector('.file-name')).toHaveTextContent('linked.ged');
    await waitFor(() => expect(useRepairStore.getState().selectedIssueId).toBe(second.id));
    expect(container.querySelector('.issue-detail')).toHaveTextContent('has no FAMC back');
  });

  it('opens the record editor from a record URL', async () => {
    await saveSession('abc123', 'linked.ged', CLEAN);
    const { container } = renderApp('/app/file/abc123/record/I2?tab=records');
    expect(await screen.findByRole('heading', { name: /Edit record @I2@/ })).toBeInTheDocument();
    expect(container.querySelector('.sidebar-tabs .active')).toHaveTextContent('Records');
  });
});

describe('record editor', () => {
  const openEditor = async (container: HTMLElement, id = '@I1@') => {
    await upload(container, CLEAN);
    fireEvent.click(await screen.findByText('Records'));
    fireEvent.click(await screen.findByText(id));
    return container.querySelector('.record-editor') as HTMLElement;
  };
  const levels = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLInputElement>('.editor-table .cell-level'));
  const preview = (c: HTMLElement) => c.querySelector('.editor-preview')!.textContent!;

  it('refuses a second level-0 line, which would drop the rest of the record', async () => {
    const { container } = renderApp();
    await openEditor(container);
    const before = preview(container);
    fireEvent.change(levels(container)[2], { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByText('Line 3 is at level 0; only the first line of a record can be.')).toBeInTheDocument();
    expect(container.querySelector('.record-editor')).toBeInTheDocument();
    expect(useRepairStore.getState().applied).toEqual([]);

    // Put it back and the same lines save intact.
    fireEvent.change(levels(container)[2], { target: { value: '1' } });
    expect(preview(container)).toBe(before);
    fireEvent.click(screen.getByText('Save'));
    expect(container.querySelector('.record-editor')).not.toBeInTheDocument();
  });

  it('rejects a non-zero first line and a non-numeric level', async () => {
    const { container } = renderApp();
    await openEditor(container);
    fireEvent.change(levels(container)[0], { target: { value: '1' } });
    fireEvent.change(levels(container)[1], { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Save'));
    const errors = container.querySelector('.editor-errors')!;
    expect(errors).toHaveTextContent('The first line must be at level 0 (the record line).');
    expect(errors).toHaveTextContent('Line 2 has an invalid level "x".');
  });

  it('adds and removes lines, previewing the resulting GEDCOM, and saves them', async () => {
    const { container } = renderApp();
    await openEditor(container);
    const rowsBefore = levels(container).length;

    fireEvent.click(screen.getByText('+ Add line'));
    const rows = container.querySelectorAll('.editor-table tbody tr');
    expect(rows).toHaveLength(rowsBefore + 1);
    const last = within(rows[rows.length - 1] as HTMLElement);
    const [, , tag, value] = last.getAllByRole('textbox');
    fireEvent.change(tag, { target: { value: 'OCCU' } });
    fireEvent.change(value, { target: { value: 'Farmer' } });
    expect(preview(container)).toMatch(/\n1 OCCU Farmer$/);

    // Remove the NAME line (row 2).
    fireEvent.click(container.querySelectorAll('.row-remove')[1]);
    expect(preview(container)).not.toContain('NAME');

    fireEvent.click(screen.getByText('Save'));
    const text = (await import('../lib/model/Serialize')).serializeDatabase(useRepairStore.getState().db!);
    expect(text).toContain('1 OCCU Farmer\n0 @I2@ INDI');
    expect(text).not.toContain('John /Smith/');
    // One atomic, undoable step.
    expect(useRepairStore.getState().applied).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((await import('../lib/model/Serialize')).serializeDatabase(useRepairStore.getState().db!)).toBe(CLEAN);
  });

  it('refuses to save a record with every line removed', async () => {
    const { container } = renderApp();
    await openEditor(container, '@S1@');
    container.querySelectorAll('.row-remove').forEach(() =>
      fireEvent.click(container.querySelector('.row-remove')!)
    );
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('A record needs at least one line.')).toBeInTheDocument();
  });

  it('warns before the tab is closed with unsaved edits, and only then', async () => {
    const { container } = renderApp();
    await openEditor(container);
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    fireEvent.change(screen.getByDisplayValue('John /Smith/'), { target: { value: 'J' } });
    expect(leave()).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Cancel'));
    expect(leave()).toBe(false);
  });

  it('explains when the record being edited no longer exists', async () => {
    const { container } = renderApp();
    await upload(container, CLEAN);
    await screen.findByText('No issues found.');
    act(() => useRepairStore.getState().editRecord('I404'));
    expect(await screen.findByText('Record @I404@ no longer exists.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(container.querySelector('.record-editor')).not.toBeInTheDocument();
  });

  it('filters the record list by id', async () => {
    const { container } = renderApp();
    await upload(container, CLEAN);
    fireEvent.click(await screen.findByText('Records'));
    await screen.findByText('@I1@');
    const search = container.querySelector('.record-search input') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'F1' } });
    expect(screen.queryByText('@I1@')).not.toBeInTheDocument();
    expect(screen.getByText('@F1@')).toBeInTheDocument();
  });
});

describe('FixDiff', () => {
  it('says so instead of crashing when a fix can no longer be previewed', () => {
    const db = parseText(CLEAN);
    render(<FixDiff db={db} fix={{ kind: 'RemoveNode', target: { recordId: 'GONE', path: [0] } }} />);
    expect(screen.getByText(/Cannot preview this fix: No record with id @GONE@/)).toBeInTheDocument();
  });

  it('marks only the lines a fix adds or removes', () => {
    const db = parseText(CLEAN);
    const { container } = render(
      <FixDiff db={db} fix={{ kind: 'RemoveNode', target: { recordId: 'F1', path: [2] } }} />
    );
    expect(container.querySelector('.diff-removed')).toHaveTextContent('- 1 CHIL @I3@');
    expect(container.querySelectorAll('.diff-removed')).toHaveLength(1);
    expect(container.querySelector('.diff-added')).toBeNull();
    expect(container.querySelectorAll('.diff-same')).toHaveLength(3);
  });
});

describe('VirtualList', () => {
  const row = (i: number, style?: React.CSSProperties) => (
    <div key={i} style={style} data-testid="row">
      row {i}
    </div>
  );

  it('renders every row plainly up to the threshold', () => {
    const { container } = render(<VirtualList count={100} rowHeight={20} render={row} className="x" />);
    expect(container.querySelector('.vlist-plain.x')).toBeInTheDocument();
    expect(screen.getAllByTestId('row')).toHaveLength(100);
  });

  it('virtualizes above it, so a huge list does not put every row in the DOM', () => {
    const { container } = render(<VirtualList count={5000} rowHeight={20} render={row} />);
    expect(container.querySelector('.vlist-plain')).not.toBeInTheDocument();
    expect(container.querySelector('.vlist')).toBeInTheDocument();
    expect(screen.queryAllByTestId('row').length).toBeLessThan(200);
  });

  it('renders nothing for an empty list', () => {
    render(<VirtualList count={0} rowHeight={20} render={row} />);
    expect(screen.queryAllByTestId('row')).toHaveLength(0);
  });
});
