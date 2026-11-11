import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { BROKEN, CLEAN } from '../lib/__fixtures__';

// Phase 1 routing: the store still drives rendering, but the URL mirrors it so
// real URLs and the browser back/forward buttons work. These tests exercise the
// address bar directly (jsdom's history under BrowserRouter).

const upload = (container: HTMLElement, text: string) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  return userEvent.upload(input, new File([text], 'test.ged', { type: 'text/plain' }));
};

// Render <App/> already inside the app (the file loader lives at /app; / is the
// marketing page). Tests that assert landing/deep-link behavior set their own URL.
const renderApp = () => {
  window.history.replaceState(null, '', '/app');
  return render(<App />);
};

test('/ shows the marketing landing page with a CTA into the app', async () => {
  render(<App />);
  expect(window.location.pathname).toBe('/');
  expect(
    screen.getByRole('heading', {
      name: /Open, diagnose, and repair broken GEDCOM files/i,
    })
  ).toBeInTheDocument();
  // The primary CTA links into the free checker.
  const cta = screen.getByRole('link', { name: /Check your file/i });
  expect(cta).toHaveAttribute('href', '/app');
});

test('loading a file puts an issue URL in the address bar', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);
  await waitFor(() =>
    expect(window.location.pathname).toMatch(/^\/app\/file\/[^/]+\/issues\/.+/)
  );
});

test('Next advances the selected issue in the URL', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);
  await waitFor(() => expect(window.location.pathname).toMatch(/\/issues\//));

  const first = window.location.pathname;
  fireEvent.click(screen.getByText(/Next/));
  await waitFor(() => expect(window.location.pathname).not.toEqual(first));
  expect(window.location.pathname).toMatch(/\/issues\//);
});

test('back button returns to the previous issue (store follows the URL)', async () => {
  const { container } = renderApp();
  await upload(container, BROKEN);
  await screen.findByText(/2 issues/);
  const detail = () => container.querySelector('.issue-detail');
  await waitFor(() => expect(detail()?.textContent).toContain('Issue 1 of 2'));
  const firstUrl = window.location.pathname;

  fireEvent.click(screen.getByText(/Next/));
  await waitFor(() => expect(detail()?.textContent).toContain('Issue 2 of 2'));

  await act(async () => {
    window.history.back();
  });
  // The store follows the URL change (popstate) a tick after jsdom updates the
  // address bar, so wait for the detail pane itself to reflect issue 1.
  await waitFor(() => expect(detail()?.textContent).toContain('Issue 1 of 2'));
  expect(window.location.pathname).toBe(firstUrl);
});

test('opening a record editor is reflected in the URL, tab kept in the query', async () => {
  const { container } = renderApp();
  await upload(container, CLEAN);
  fireEvent.click(await screen.findByText('Records'));
  fireEvent.click(await screen.findByText('@I1@'));

  await waitFor(() => expect(window.location.pathname).toMatch(/\/record\/I1$/));
  expect(window.location.search).toContain('tab=records');
});

test('deep link to a file with no saved session redirects to /app', async () => {
  window.history.replaceState(null, '', '/app/file/deadbeef-404/issues/X');
  render(<App />);
  // No IndexedDB in jsdom, so the restore finds nothing and bounces to /app.
  await waitFor(() => expect(window.location.pathname).toBe('/app'));
  expect(screen.getByText('GEDCOM Repair')).toBeInTheDocument();
});
