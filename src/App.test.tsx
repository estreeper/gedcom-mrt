import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ONE_WAY } from './lib/__fixtures__';

test('shows the file loader on start', () => {
  const { container } = render(<App />);
  expect(screen.getByText('GEDCOM Repair')).toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
});

test('load → detect one-way link → accept fix → issue clears', async () => {
  const { container } = render(<App />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;

  const file = new File([ONE_WAY], 'test.ged', { type: 'text/plain' });
  userEvent.upload(input, file);

  // The one-way CHIL link is detected.
  const issue = await screen.findByText(/has no FAMC back/);
  fireEvent.click(issue);

  // Reviewing it offers a fix; accepting resolves it.
  const accept = await screen.findByText('Accept');
  fireEvent.click(accept);

  expect(await screen.findByText('No issues found.')).toBeInTheDocument();
});
