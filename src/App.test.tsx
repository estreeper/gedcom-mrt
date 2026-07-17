import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ONE_WAY, CLEAN, BROKEN } from './lib/__fixtures__';

const upload = (container: HTMLElement, text: string) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  userEvent.upload(input, new File([text], 'test.ged', { type: 'text/plain' }));
};

test('shows the file loader on start', () => {
  const { container } = render(<App />);
  expect(screen.getByText('GEDCOM Repair')).toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
});

test('accepting the only fix clears the issue list and records it as resolved', async () => {
  const { container } = render(<App />);
  upload(container, ONE_WAY);

  // The one issue is auto-selected, so its Accept button is shown immediately.
  fireEvent.click(await screen.findByText('Accept'));

  expect(await screen.findByText('No issues found.')).toBeInTheDocument();
  expect(screen.getByText('Resolved (1)')).toBeInTheDocument();
});

test('auto-selects the top issue and advances to the next after accepting', async () => {
  const { container } = render(<App />);
  upload(container, BROKEN);

  // Two issues; the higher-severity dangling pointer is selected first.
  await screen.findByText(/2 issues/);
  const detail = () => container.querySelector('.issue-detail');
  expect(detail()?.textContent).toContain('no such record exists');

  // Accepting it advances the detail pane to the remaining (asymmetric) issue.
  fireEvent.click(screen.getAllByText('Accept')[0]);
  expect(detail()?.textContent).toContain('has no FAMC back');
  expect(screen.getByText('Resolved (1)')).toBeInTheDocument();
});

test('previous/next move between issues without wrapping', async () => {
  const { container } = render(<App />);
  upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  const detail = () => container.querySelector('.issue-detail');

  // First issue: Previous is hidden, Next is shown.
  expect(detail()?.textContent).toContain('Issue 1 of 2');
  expect(detail()?.textContent).toContain('no such record exists'); // dangling
  expect(screen.queryByText(/Previous/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByText(/Next/));
  expect(detail()?.textContent).toContain('Issue 2 of 2');
  expect(detail()?.textContent).toContain('has no FAMC back'); // asymmetric

  // Last issue: Next is hidden, Previous is shown.
  expect(screen.queryByText(/Next/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Previous/));
  expect(detail()?.textContent).toContain('Issue 1 of 2');
});

test('detail shows a human-friendly message; list keeps the technical one', async () => {
  const { container } = render(<App />);
  upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  // Select the asymmetric issue via the list.
  fireEvent.click(
    container.querySelector('.issue-list .severity-warning') as HTMLElement
  );
  const human = container.querySelector('.issue-message.human');
  expect(human?.textContent).toContain('Child /Smith/'); // name, not @I3@
  expect(human?.textContent).not.toContain('@I3@');

  // The suggested fix also has a human-friendly label above its technical one.
  expect(container.querySelector('.fix-human')?.textContent).toContain(
    'Link Child /Smith/ back to'
  );
  expect(container.querySelector('.fix-technical')?.textContent).toContain(
    'Add FAMC @F1@ to @I3@'
  );

  // The Issues column still shows the technical message.
  const listRow = container.querySelector('.issue-list .severity-warning');
  expect(listRow?.textContent).toContain('@I3@');
});

test('filtering by issue type narrows the list', async () => {
  const { container } = render(<App />);
  upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  const rows = () => container.querySelectorAll('.issue-list .issue-row');
  expect(rows()).toHaveLength(2);

  fireEvent.change(screen.getByLabelText('Type'), {
    target: { value: 'ASYMMETRIC_LINK' },
  });
  expect(rows()).toHaveLength(1);
  expect(rows()[0].textContent).toContain('has no FAMC back');

  fireEvent.change(screen.getByLabelText('Type'), {
    target: { value: 'DANGLING_POINTER' },
  });
  expect(rows()).toHaveLength(1);
  expect(rows()[0].textContent).toContain('no such record exists');
});

test('resolved issues show in the Resolved tab', async () => {
  const { container } = render(<App />);
  upload(container, BROKEN);
  await screen.findByText(/2 issues/);

  fireEvent.click(screen.getAllByText('Accept')[0]); // resolve the dangling pointer
  fireEvent.click(screen.getByText('Resolved (1)'));

  const resolved = container.querySelector('.resolved-list') as HTMLElement;
  expect(within(resolved).getByText(/no such record exists/)).toBeInTheDocument();
});

test('browse records → manually edit a record → save closes the editor', async () => {
  const { container } = render(<App />);
  upload(container, CLEAN);

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
