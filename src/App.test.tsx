import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ONE_WAY, CLEAN } from './lib/__fixtures__';

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

test('browse records → manually edit a record → save closes the editor', async () => {
  const { container } = render(<App />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  userEvent.upload(input, new File([CLEAN], 'test.ged', { type: 'text/plain' }));

  // Switch to the Records tab and open @I1@.
  fireEvent.click(await screen.findByText('Records'));
  fireEvent.click(await screen.findByText('@I1@'));

  // Edit the NAME value; the resulting-GEDCOM preview reflects the change.
  const nameField = await screen.findByDisplayValue('John /Smith/');
  fireEvent.change(nameField, { target: { value: 'Johnny /Smith/' } });
  expect(container.querySelector('.editor-preview')?.textContent).toContain(
    'Johnny /Smith/'
  );

  // Saving applies the edit and closes the editor.
  fireEvent.click(screen.getByText('Save'));
  expect(screen.queryByText(/Edit record/)).not.toBeInTheDocument();
});
