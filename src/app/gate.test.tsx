import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { BROKEN } from '../lib/__fixtures__';
import { useLicenseStore } from '../state/LicenseStore';

// The license gate: applying repairs is blocked (non-destructively, with an
// upsell) when the user is known to be unlicensed, and allowed when licensed.

const upload = (container: HTMLElement, text: string) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  return userEvent.upload(input, new File([text], 'test.ged', { type: 'text/plain' }));
};

const renderApp = () => {
  window.history.replaceState(null, '', '/app');
  return render(<App />);
};

type LicenseState = ReturnType<typeof useLicenseStore.getState>;
const setLicense = (partial: Partial<LicenseState>) =>
  act(() => useLicenseStore.setState(partial));

test('an unlicensed user is shown the upsell and no fix is applied', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  // Affirmatively unlicensed (signed out).
  setLicense({ authState: 'anonymous', user: undefined, license: undefined });

  fireEvent.click(screen.getAllByText('Accept')[0]);

  // Non-destructive: the issue list is unchanged...
  expect(screen.getByText(/2 issues/)).toBeInTheDocument();
  expect(screen.queryByText('No issues found.')).not.toBeInTheDocument();
  // ...and the paywall is shown.
  expect(screen.getByText('Unlock repairs')).toBeInTheDocument();
});

test('a signed-out user sees a lock hint on Accept', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);
  setLicense({ authState: 'anonymous' });
  // Lock hints appear on the paid actions (at least Accept and Export).
  await waitFor(() =>
    expect(screen.getAllByLabelText('Licensed feature').length).toBeGreaterThan(0)
  );
});

test('a licensed user can apply a fix normally', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  setLicense({
    authState: 'user',
    user: { id: 'u1', email: 'a@b.com' },
    license: { status: 'active', plan: 'annual', expiresAt: Date.now() + 1e9 },
  });

  fireEvent.click(screen.getAllByText('Accept')[0]);
  // The dangling pointer is resolved and the detail advances; no upsell.
  await screen.findByText('Resolved (1)');
  expect(screen.queryByText('Unlock repairs')).not.toBeInTheDocument();
});
