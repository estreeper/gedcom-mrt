import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { UnlockDialog } from './UnlockDialog';
import { useCloudKeyStore } from '../../state/CloudKeyStore';
import { useLicenseStore } from '../../state/LicenseStore';
import { useRepairStore } from '../../state/RepairStore';
import { createEnvelope, decryptText, encryptText, encryptToBase64 } from '../../lib/crypto/keys';
import { checksum } from '../../lib/idb';
import { CLEAN, ONE_WAY } from '../../lib/__fixtures__';
import { installFakeApi, reply, fail } from '../../test/fakeApi';

// Zero-knowledge cloud storage from the user's side: setting up / unlocking the
// passphrase, and the encrypted mirror of the working file. Real Web Crypto,
// fake backend.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const USER = { id: 'u1', email: 'pat@example.com' };
const ACTIVE = { status: 'active' as const, plan: 'annual' as const, expiresAt: Date.UTC(2030, 0, 1) };

/** A fake backend for a signed-in, licensed user, optionally with an envelope. */
function cloudServer(envelope?: string) {
  let stored = envelope;
  const server = installFakeApi({
    'GET /auth/me': reply({ user: USER }),
    'GET /license': reply(ACTIVE),
    'GET /keybag': () => (stored ? reply({ envelope: stored }) : fail(404, 'No key envelope yet.')),
    'PUT /keybag': (call) => {
      stored = (call.body as { envelope: string }).envelope;
      return reply({ ok: true });
    },
    'GET /files': reply({ files: [] }),
  });
  useLicenseStore.setState({ authState: 'user', user: USER, license: ACTIVE });
  return { ...server, envelope: () => stored };
}

async function existingEnvelope(passphrase: string) {
  const { dek, envelope, recoveryKey } = await createEnvelope(passphrase);
  return { dek, recoveryKey, json: JSON.stringify(envelope) };
}

describe('UnlockDialog — first-time setup', () => {
  it('validates the passphrase, then enables storage and shows the recovery key once', async () => {
    const server = cloudServer();
    const onClose = vi.fn();
    render(<UnlockDialog onClose={onClose} />);
    expect(await screen.findByRole('heading', { name: 'Set up cloud storage' })).toBeInTheDocument();

    const pass = screen.getByLabelText('Encryption passphrase');
    const confirm = screen.getByLabelText('Confirm passphrase');
    const submit = screen.getByRole('button', { name: 'Enable cloud storage' });

    await userEvent.type(pass, 'short');
    await userEvent.type(confirm, 'short');
    await userEvent.click(submit);
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();

    await userEvent.clear(pass);
    await userEvent.type(pass, 'long enough passphrase');
    await userEvent.click(submit);
    expect(screen.getByText('Passphrases do not match.')).toBeInTheDocument();
    expect(server.callsTo('PUT /keybag')).toHaveLength(0);

    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'long enough passphrase');
    await userEvent.click(submit);

    expect(await screen.findByRole('heading', { name: 'Save your recovery key' })).toBeInTheDocument();
    const shown = document.querySelector('.recovery-key')!.textContent!;
    expect(shown).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(server.envelope()).toBeDefined();
    // The dialog stays up until the user confirms they've stored the key.
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'I’ve saved it' }));
    expect(onClose).toHaveBeenCalled();
    expect(useCloudKeyStore.getState()).toMatchObject({ status: 'unlocked', recoveryKeyOnce: undefined });
  });

  it('shows a server error from setup', async () => {
    const server = cloudServer();
    server.on('PUT /keybag', fail(500, 'Storage is down.'));
    render(<UnlockDialog onClose={() => {}} />);
    await screen.findByRole('heading', { name: 'Set up cloud storage' });
    await userEvent.type(screen.getByLabelText('Encryption passphrase'), 'long enough passphrase');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'long enough passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Enable cloud storage' }));
    expect(await screen.findByText('Storage is down.')).toBeInTheDocument();
  });
});

describe('UnlockDialog — returning user', () => {
  it('rejects a wrong passphrase, then unlocks and closes with the right one', async () => {
    const { json } = await existingEnvelope('correct horse battery');
    cloudServer(json);
    const onClose = vi.fn();
    render(<UnlockDialog onClose={onClose} />);
    expect(await screen.findByRole('heading', { name: 'Unlock cloud storage' })).toBeInTheDocument();

    const pass = screen.getByLabelText('Passphrase');
    await userEvent.type(pass, 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Incorrect passphrase.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.clear(pass);
    await userEvent.type(pass, 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useCloudKeyStore.getState().status).toBe('unlocked');
  });

  it('recovers with the recovery key and a new passphrase', async () => {
    const { json, recoveryKey, dek } = await existingEnvelope('forgotten passphrase');
    const secret = await encryptText(dek, 'family secrets');
    const server = cloudServer(json);
    const onClose = vi.fn();
    render(<UnlockDialog onClose={onClose} />);
    await screen.findByRole('heading', { name: 'Unlock cloud storage' });

    await userEvent.click(screen.getByRole('button', { name: /Forgot passphrase/ }));
    await userEvent.type(screen.getByLabelText('Recovery key'), recoveryKey);
    await userEvent.type(screen.getByLabelText('New passphrase'), 'a brand new one');
    await userEvent.click(screen.getByRole('button', { name: 'Recover & set passphrase' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.callsTo('PUT /keybag')).toHaveLength(1);
    expect(await decryptText(useCloudKeyStore.getState().dek!, secret)).toBe('family secrets');
  });

  it('can switch back from recovery to the passphrase form', async () => {
    cloudServer((await existingEnvelope('whatever pass')).json);
    render(<UnlockDialog onClose={() => {}} />);
    await screen.findByRole('heading', { name: 'Unlock cloud storage' });
    await userEvent.click(screen.getByRole('button', { name: /Forgot passphrase/ }));
    expect(screen.getByLabelText('Recovery key')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use passphrase instead' }));
    expect(screen.queryByLabelText('Recovery key')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument();
  });

  it('closes from the × button without unlocking', async () => {
    cloudServer((await existingEnvelope('whatever pass')).json);
    const onClose = vi.fn();
    render(<UnlockDialog onClose={onClose} />);
    await screen.findByRole('heading', { name: 'Unlock cloud storage' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCloudKeyStore.getState().status).toBe('locked');
  });
});

describe('cloud storage in the app', () => {
  const renderApp = () => {
    window.history.replaceState(null, '', '/app');
    return render(<App />);
  };
  const upload = (container: HTMLElement, text: string, name = 'tree.ged') =>
    userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([text], name, { type: 'text/plain' })
    );

  it('offers cloud storage only to licensed users', async () => {
    installFakeApi({ 'GET /auth/me': fail(401, 'Not signed in.') });
    useLicenseStore.setState({ authState: 'anonymous' });
    renderApp();
    await screen.findByText(/Load a GEDCOM/);
    expect(screen.queryByText(/cloud storage/i)).not.toBeInTheDocument();
  });

  it('walks a licensed user through setup from the start screen', async () => {
    cloudServer();
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Enable \/ unlock cloud storage/ }));
    await screen.findByRole('heading', { name: 'Set up cloud storage' });
    await userEvent.type(screen.getByLabelText('Encryption passphrase'), 'long enough passphrase');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'long enough passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Enable cloud storage' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’ve saved it' }));

    expect(await screen.findByText(/Cloud storage on/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // "lock" forgets the key again.
    await userEvent.click(screen.getByRole('button', { name: 'lock' }));
    expect(await screen.findByRole('button', { name: /Enable \/ unlock cloud storage/ })).toBeInTheDocument();
    expect(useCloudKeyStore.getState().dek).toBeUndefined();
  });

  it('mirrors the working file to the cloud as ciphertext once unlocked', async () => {
    const { dek } = await existingEnvelope('p');
    const server = cloudServer();
    const id = await checksum(ONE_WAY);
    server.on(`PUT /files/${id}`, reply({ ok: true }));
    useCloudKeyStore.setState({ status: 'unlocked', dek });

    const { container } = renderApp();
    await upload(container, ONE_WAY, 'my-tree.ged');
    await screen.findByText('Accept');

    const put = async () => {
      await waitFor(() => expect(server.callsTo(`PUT /files/${id}`).length).toBeGreaterThan(0), {
        timeout: 3000,
      });
      return server.callsTo(`PUT /files/${id}`).at(-1)!;
    };
    const first = await put();
    const body = first.body as Uint8Array<ArrayBuffer>;
    expect(new TextDecoder().decode(body)).not.toContain('Smith');
    expect(first.headers['x-file-name']).not.toContain('my-tree');
    expect(await decryptText(dek, body)).toBe(ONE_WAY);

    // A repair is mirrored too.
    const before = server.callsTo(`PUT /files/${id}`).length;
    fireEvent.click(screen.getByText('Accept'));
    await waitFor(() => expect(server.callsTo(`PUT /files/${id}`).length).toBeGreaterThan(before), {
      timeout: 3000,
    });
    const repaired = await decryptText(dek, (await put()).body as Uint8Array<ArrayBuffer>);
    expect(repaired).toContain('1 FAMC @F1@');
  });

  it('does not upload while the key is locked', async () => {
    const server = cloudServer();
    const { container } = renderApp();
    await upload(container, ONE_WAY);
    await screen.findByText('Accept');
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(server.calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('lists, opens and deletes a file that exists only in the cloud', async () => {
    const { dek } = await existingEnvelope('p');
    const server = cloudServer();
    let files = [
      { id: 'cloudfile1', name: await encryptToBase64(dek, 'grandma.ged'), size: 321, savedAt: 1700000000000 },
    ];
    server.on('GET /files', () => reply({ files }));
    server.on('GET /files/cloudfile1', async () => ({ bytes: await encryptText(dek, CLEAN) }));
    server.on('DELETE /files/cloudfile1', () => {
      files = [];
      return reply({ ok: true });
    });
    server.on('PUT /files/cloudfile1', reply({ ok: true }));
    useCloudKeyStore.setState({ status: 'unlocked', dek });

    const { container } = renderApp();
    const row = await screen.findByRole('button', { name: /^grandma\.ged/ });
    expect(row).toHaveTextContent('☁ only');
    expect(row).toHaveTextContent('321 B');

    await userEvent.click(row);
    expect(await screen.findByText('No issues found.')).toBeInTheDocument();
    expect(container.querySelector('.file-name')).toHaveTextContent('grandma.ged');
    expect(useRepairStore.getState()).toMatchObject({ fileId: 'cloudfile1', restored: true });

    // Back on the start screen, delete it.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'New file' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete grandma.ged' }));
    await waitFor(() => expect(screen.queryByText(/grandma\.ged/)).not.toBeInTheDocument());
    expect(server.callsTo('DELETE /files/cloudfile1')).toHaveLength(1);
  });
});
