import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { UpsellModal } from './billing/UpsellModal';
import { useLicenseStore, LicenseInfo } from '../state/LicenseStore';
import { useUpsellStore } from '../state/UpsellStore';
import { installFakeApi, reply, fail } from '../test/fakeApi';

// The account-facing pages (auth, account, billing, checkout return, upsell),
// rendered through the real route table against a fake backend.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const USER = { id: 'u1', email: 'pat@example.com' };
const license = (status: LicenseInfo['status']): LicenseInfo => ({
  status,
  plan: status === 'none' ? null : 'annual',
  expiresAt: status === 'none' ? null : Date.UTC(2030, 5, 15),
});
const signedIn = (status: LicenseInfo['status'] = 'none') =>
  useLicenseStore.setState({ authState: 'user', user: USER, license: license(status) });
const signedOut = () => useLicenseStore.setState({ authState: 'anonymous' });

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const where = () => screen.getByTestId('where').textContent;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
      <UpsellModal />
      <Where />
    </MemoryRouter>
  );
}

async function fillCredentials(email = 'pat@example.com', password = 'password123') {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
}

describe('AuthPage', () => {
  it('signs in and returns to the page that asked for it', async () => {
    const server = installFakeApi({
      'POST /auth/login': reply({ user: USER }),
      'GET /license': reply(license('active')),
    });
    renderAt('/login?next=/account');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(where()).toBe('/account');
    expect(server.callsTo('POST /auth/login')[0].body).toEqual({
      email: 'pat@example.com',
      password: 'password123',
    });
  });

  it('creates an account from the signup form and lands in the app by default', async () => {
    const server = installFakeApi({
      'POST /auth/signup': reply({ user: USER }),
      'GET /license': reply(license('none')),
    });
    renderAt('/signup');
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(where()).toBe('/app'));
    expect(server.callsTo('POST /auth/signup')).toHaveLength(1);
  });

  it('shows the server error and stays on the form when sign-in fails', async () => {
    installFakeApi({ 'POST /auth/login': fail(401, 'Incorrect email or password.') });
    renderAt('/login');
    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(where()).toBe('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('does not carry a failed sign-in error over to the signup form', async () => {
    installFakeApi({ 'POST /auth/login': fail(401, 'Incorrect email or password.') });
    renderAt('/login?next=/account');
    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Incorrect email or password.');

    await userEvent.click(screen.getByRole('link', { name: 'Create one' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByText('Incorrect email or password.')).not.toBeInTheDocument();
    // ...and the return path survives the switch, in both directions.
    expect(where()).toBe('/signup?next=/account');
    await userEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(where()).toBe('/login?next=/account');
  });

  it('disables the submit button while the request is in flight', async () => {
    let release!: () => void;
    installFakeApi({
      'POST /auth/login': () => new Promise((r) => (release = () => r(fail(401, 'No.')))),
    });
    renderAt('/login');
    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: 'Please wait…' })).toBeDisabled();
    await act(async () => release());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('passes the return path to Google login', () => {
    renderAt('/login?next=/account/billing');
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google?next=%2Faccount%2Fbilling'
    );
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example'])(
    'ignores an off-site next (%s)',
    async (next) => {
      installFakeApi({
        'POST /auth/login': reply({ user: USER }),
        'GET /license': reply(license('none')),
      });
      renderAt(`/login?next=${encodeURIComponent(next)}`);
      expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
        'href',
        '/api/auth/oauth/google?next=%2Fapp'
      );
      await fillCredentials();
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(where()).toBe('/app'));
    }
  );
});

describe('AccountPage', () => {
  it('waits while the session is still unknown', () => {
    renderAt('/account');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(where()).toBe('/account');
  });

  it('sends a signed-out visitor to sign in, and back afterwards', async () => {
    signedOut();
    renderAt('/account');
    await waitFor(() => expect(where()).toBe('/login?next=/account'));
  });

  it.each([
    ['active', 'Active', 'Manage / renew'],
    ['none', 'None', 'Get a license — $35'],
    ['expired', 'Expired', 'Get a license — $35'],
    ['refunded', 'Refunded', 'Get a license — $35'],
  ] as const)('shows a %s license as "%s" with the "%s" action', (status, label, action) => {
    signedIn(status);
    const { container } = renderAt('/account');
    expect(screen.getByText('pat@example.com')).toBeInTheDocument();
    expect(container.querySelector('.badge-license')).toHaveTextContent(label);
    expect(container.querySelector('.badge-license')).toHaveClass(status === 'active' ? 'active' : 'inactive');
    expect(screen.getByRole('link', { name: action })).toHaveAttribute('href', '/account/billing');
    // The expiry only matters (and only shows) while the license is active.
    const expiry = new Date(Date.UTC(2030, 5, 15)).toLocaleDateString();
    if (status === 'active') expect(screen.getByText(expiry)).toBeInTheDocument();
    else expect(screen.queryByText('Access until')).not.toBeInTheDocument();
  });

  it('signs out and returns to the landing page', async () => {
    signedIn('active');
    const server = installFakeApi({ 'POST /auth/logout': reply({ ok: true }) });
    renderAt('/account');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(where()).toBe('/'));
    expect(server.callsTo('POST /auth/logout')).toHaveLength(1);
    expect(useLicenseStore.getState().authState).toBe('anonymous');
  });
});

describe('BillingPage', () => {
  it('sends a signed-out visitor to sign in first', async () => {
    signedOut();
    renderAt('/account/billing');
    await waitFor(() => expect(where()).toBe('/login?next=/account/billing'));
  });

  it('starts checkout and stays busy while the browser leaves for it', async () => {
    signedIn('none');
    const server = installFakeApi({
      'POST /checkout': reply({ url: 'https://checkout.stripe.test/pay/cs_1' }),
    });
    renderAt('/account/billing');
    expect(screen.getByRole('heading', { name: 'Get a license' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Buy for $35' }));
    await waitFor(() => expect(server.callsTo('POST /checkout')).toHaveLength(1));
    // Still "redirecting" (busy) with no error: the browser is leaving the page.
    // (jsdom can't navigate, so the redirect itself isn't observable here.)
    expect(await screen.findByRole('button', { name: 'Redirecting…' })).toBeDisabled();
    expect(useLicenseStore.getState().error).toBeUndefined();
  });

  it('shows why checkout could not start and lets the user retry', async () => {
    signedIn('none');
    installFakeApi({ 'POST /checkout': fail(503, 'Payments are not configured.') });
    renderAt('/account/billing');
    await userEvent.click(screen.getByRole('button', { name: 'Buy for $35' }));
    expect(await screen.findByText('Payments are not configured.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy for $35' })).toBeEnabled();
  });

  it('offers a renewal to a licensed user and notes a canceled checkout', () => {
    signedIn('active');
    renderAt('/account/billing?canceled=1');
    expect(screen.getByRole('heading', { name: 'Renew your license' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another year — $35' })).toBeInTheDocument();
    expect(screen.getByText(/Checkout was canceled/)).toBeInTheDocument();
  });
});

describe('CheckoutReturn', () => {
  it('confirms as soon as the webhook has granted the license, then enters the app', async () => {
    vi.useFakeTimers();
    let polls = 0;
    installFakeApi({
      'GET /auth/me': reply({ user: USER }),
      // The webhook lands just after the redirect: the first poll is too early.
      'GET /license': () => reply(license(++polls >= 2 ? 'active' : 'none')),
    });
    renderAt('/checkout/return?session_id=cs_1');
    expect(screen.getByRole('heading', { name: 'Confirming your purchase…' })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(screen.getByRole('heading', { name: /You’re all set/ })).toBeInTheDocument();
    expect(polls).toBe(2);

    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(where()).toBe('/app');
  });

  it('gives up politely if the license has not appeared after several tries', async () => {
    vi.useFakeTimers();
    const server = installFakeApi({
      'GET /auth/me': reply({ user: USER }),
      'GET /license': reply(license('none')),
    });
    renderAt('/checkout/return');
    await act(() => vi.advanceTimersByTimeAsync(7000));
    expect(screen.getByRole('heading', { name: 'Almost there…' })).toBeInTheDocument();
    expect(server.callsTo('GET /license')).toHaveLength(6);
    expect(where()).toBe('/checkout/return');
  });

  it('stops polling once the page is left', async () => {
    vi.useFakeTimers();
    const server = installFakeApi({
      'GET /auth/me': reply({ user: USER }),
      'GET /license': reply(license('none')),
    });
    const { unmount } = renderAt('/checkout/return');
    await act(() => vi.advanceTimersByTimeAsync(500));
    unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(server.callsTo('GET /license').length).toBeLessThanOrEqual(2);
  });
});

describe('UpsellModal', () => {
  const open = (reason?: 'apply' | 'export' | 'cloud') =>
    act(() => useUpsellStore.getState().show(reason));

  it('is hidden until something gated is attempted', () => {
    renderAt('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['apply', 'Applying repairs needs a license.'],
    ['export', 'Exporting the repaired file needs a license.'],
    ['cloud', 'Encrypted cloud storage needs a license.'],
    [undefined, 'This feature needs a license.'],
  ] as const)('explains what was blocked (%s)', (reason, text) => {
    renderAt('/');
    open(reason);
    expect(screen.getByRole('dialog')).toHaveTextContent(text);
  });

  it('sends a visitor to sign up and back to where they were', async () => {
    signedOut();
    renderAt('/account/billing?canceled=1');
    // (the billing page itself redirects a signed-out visitor to login first)
    await waitFor(() => expect(where()).toBe('/login?next=/account/billing'));
    open('apply');
    fireEvent.click(screen.getByRole('button', { name: 'Create an account to unlock' }));
    expect(where()).toBe(`/signup?next=${encodeURIComponent('/login?next=/account/billing')}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes a signed-in user straight to checkout', async () => {
    signedIn('none');
    const server = installFakeApi({ 'POST /checkout': fail(503, 'Payments are not configured.') });
    renderAt('/');
    open('export');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for $35' }));
    await waitFor(() => expect(server.callsTo('POST /checkout')).toHaveLength(1));
  });

  it('closes', () => {
    renderAt('/');
    open('apply');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useUpsellStore.getState()).toMatchObject({ open: false, reason: undefined });
  });
});
