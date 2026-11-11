import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useRepairStore,
  dispatch,
  sortIssues,
  visibleIssues,
  setLicenseGate,
  setUpsellHandler,
} from './RepairStore';
import { parseText } from '../lib/Parser';
import { serializeDatabase } from '../lib/model/Serialize';
import { Issue } from '../lib/model/Issue';
import { BROKEN, CLEAN, ONE_WAY, DEATH_BEFORE_BIRTH } from '../lib/__fixtures__';

// The session store on its own (no React): the rules every action must keep —
// issues re-derived from the db, resolved/selection kept consistent, undo/redo
// exact, and the license gate non-destructive.

afterEach(() => {
  setLicenseGate(() => true);
  setUpsellHandler(() => {});
});

const s = () => useRepairStore.getState();
const text = () => serializeDatabase(s().db!);
const load = (gedcom: string) => s().load(parseText(gedcom), 'test.ged', false, 'file-1');
const primaryFix = (category: string) =>
  s().issues.find((i) => i.category === category)!.suggestedFixes[0].fix;

// Two families, each with a child missing its FAMC: two bulk-fixable issues.
const TWO_ONE_WAY = `0 HEAD
0 @I1@ INDI
1 NAME A /One/
1 SOUR x
1 BIRT
0 @I2@ INDI
1 NAME B /Two/
1 SOUR x
1 BIRT
0 @F1@ FAM
1 CHIL @I1@
0 @F2@ FAM
1 CHIL @I2@
0 TRLR
`;

describe('sortIssues / visibleIssues', () => {
  const issue = (id: string, severity: Issue['severity'], category: Issue['category']): Issue => ({
    id,
    severity,
    category,
    message: id,
    recordIds: [],
    lineNumbers: [],
    suggestedFixes: [],
  });
  const issues = [
    issue('i1', 'info', 'ORPHAN_INDI'),
    issue('w1', 'warning', 'YOUNG_MARRIAGE'),
    issue('x1', 'invalid', 'DANGLING_POINTER'),
    issue('e1', 'error', 'FUTURE_DATE'),
    issue('x2', 'invalid', 'ASYMMETRIC_LINK'),
    issue('i2', 'info', 'ORPHAN_INDI'),
  ];

  it('orders worst tier first, keeping the original order within a tier', () => {
    expect(sortIssues(issues).map((i) => i.id)).toEqual(['x1', 'x2', 'e1', 'w1', 'i1', 'i2']);
    expect(issues[0].id).toBe('i1'); // input not mutated
  });

  it('applies the category and tier filters together', () => {
    const ids = (...args: Parameters<typeof visibleIssues>) => visibleIssues(...args).map((i) => i.id);
    expect(ids(issues, 'ALL')).toHaveLength(6);
    expect(ids(issues, 'ORPHAN_INDI')).toEqual(['i1', 'i2']);
    expect(ids(issues, 'ALL', 'invalid')).toEqual(['x1', 'x2']);
    expect(ids(issues, 'DANGLING_POINTER', 'invalid')).toEqual(['x1']);
    expect(ids(issues, 'DANGLING_POINTER', 'info')).toEqual([]);
  });
});

describe('load', () => {
  it('validates the file and selects the worst issue', () => {
    load(BROKEN);
    expect(s()).toMatchObject({ fileName: 'test.ged', fileId: 'file-1', restored: false });
    expect(s().issues.map((i) => i.category)).toEqual(['DANGLING_POINTER', 'ASYMMETRIC_LINK']);
    expect(s().selectedIssueId).toBe(s().issues[0].id);
  });

  it('starts a clean slate when a second file is loaded', () => {
    load(BROKEN);
    s().applyFixAction(primaryFix('DANGLING_POINTER'));
    s().setFilter('ASYMMETRIC_LINK');
    s().setSidebarTab('records');
    s().editRecord('I1');
    s().setEditorDirty(true);

    s().load(parseText(CLEAN), 'other.ged', true, 'file-2');
    expect(s()).toMatchObject({
      fileName: 'other.ged',
      fileId: 'file-2',
      restored: true,
      issues: [],
      resolved: [],
      applied: [],
      undone: [],
      filter: 'ALL',
      severityFilter: 'ALL',
      sidebarTab: 'issues',
      selectedIssueId: undefined,
      editingRecordId: undefined,
      editorDirty: false,
    });
  });
});

describe('applying a fix', () => {
  it('re-validates, records the issue as resolved, and advances the selection', () => {
    load(BROKEN);
    const [dangling, asymmetric] = s().issues;
    s().applyFixAction(dangling.suggestedFixes[0].fix);

    expect(text()).not.toContain('FAMC @F99@');
    expect(s().issues.map((i) => i.id)).toEqual([asymmetric.id]);
    expect(s().resolved.map((i) => i.id)).toEqual([dangling.id]);
    expect(s().selectedIssueId).toBe(asymmetric.id);
    expect(s().applied).toHaveLength(1);
  });

  it('closes the record editor and clears redo history', () => {
    load(BROKEN);
    s().applyFixAction(primaryFix('DANGLING_POINTER'));
    s().undo();
    expect(s().undone).toHaveLength(1);
    s().editRecord('I1');
    s().setEditorDirty(true);

    s().applyFixAction(primaryFix('ASYMMETRIC_LINK'));
    expect(s()).toMatchObject({ editingRecordId: undefined, editorDirty: false, undone: [] });
  });

  it('drops a resolved issue from the bulk selection', () => {
    load(BROKEN);
    const [dangling, asymmetric] = s().issues;
    s().setIssueSelection([dangling.id, asymmetric.id]);
    s().applyFixAction(dangling.suggestedFixes[0].fix);
    expect(s().selectedIssueIds).toEqual([asymmetric.id]);
  });

  it('does nothing before a file is loaded', () => {
    s().applyFixAction({ kind: 'RemoveRecord', recordId: 'I1' });
    s().undo();
    s().redo();
    expect(s().db).toBeUndefined();
    expect(s().applied).toEqual([]);
  });
});

describe('the license gate', () => {
  it('blocks applying without changing anything and asks for the upsell', async () => {
    load(BROKEN);
    const before = { text: text(), issues: s().issues, selected: s().selectedIssueId };
    const upsell = vi.fn();
    setLicenseGate(() => false);
    setUpsellHandler(upsell);

    s().applyFixAction(primaryFix('DANGLING_POINTER'));
    s().setIssueSelection(s().issues.map((i) => i.id));
    await s().bulkAccept();

    expect(upsell.mock.calls).toEqual([['apply'], ['apply']]);
    expect(text()).toBe(before.text);
    expect(s().issues).toBe(before.issues);
    expect(s().selectedIssueId).toBe(before.selected);
    expect(s().applied).toEqual([]);
    expect(s().bulkInProgress).toBe(false);
  });
});

describe('undo / redo', () => {
  it('restores the file byte-for-byte and brings the issue back', () => {
    load(BROKEN);
    const [dangling] = s().issues;
    s().applyFixAction(dangling.suggestedFixes[0].fix);
    const fixed = text();

    s().undo();
    expect(text()).toBe(BROKEN);
    expect(s().issues.map((i) => i.id)).toContain(dangling.id);
    expect(s().resolved).toEqual([]);
    expect(s().applied).toEqual([]);

    s().redo();
    expect(text()).toBe(fixed);
    expect(s().resolved.map((i) => i.id)).toEqual([dangling.id]);
    expect(s().undone).toEqual([]);
  });

  it('walks back through several fixes in reverse order, then forward again', () => {
    load(BROKEN);
    s().applyFixAction(primaryFix('DANGLING_POINTER'));
    const afterOne = text();
    s().applyFixAction(primaryFix('ASYMMETRIC_LINK'));
    const afterTwo = text();
    expect(s().issues.some((i) => i.severity === 'invalid')).toBe(false);

    s().undo();
    expect(text()).toBe(afterOne);
    s().undo();
    expect(text()).toBe(BROKEN);
    s().undo(); // nothing left: a no-op
    expect(text()).toBe(BROKEN);

    s().redo();
    s().redo();
    s().redo(); // nothing left: a no-op
    expect(text()).toBe(afterTwo);
  });

  it('undoes an inline date correction exactly', () => {
    load(DEATH_BEFORE_BIRTH);
    const field = s().issues.find((i) => i.category === 'DEATH_BEFORE_BIRTH')!.quickEdit![1];
    s().applyFixAction({
      kind: 'EditLine',
      target: { recordId: field.recordId, path: field.path },
      newValue: '1 JAN 1999',
    });
    expect(s().issues.some((i) => i.category === 'DEATH_BEFORE_BIRTH')).toBe(false);
    s().undo();
    expect(text()).toBe(DEATH_BEFORE_BIRTH);
  });
});

describe('bulkAccept', () => {
  it('applies the primary fix of every selected issue and reports progress', async () => {
    load(TWO_ONE_WAY);
    const ids = s().issues.filter((i) => i.category === 'ASYMMETRIC_LINK').map((i) => i.id);
    expect(ids).toHaveLength(2);
    s().setIssueSelection(ids);

    const running = s().bulkAccept();
    expect(s()).toMatchObject({ bulkInProgress: true, bulkDone: 0, bulkTotal: 2 });
    await running;

    expect(s()).toMatchObject({ bulkInProgress: false, bulkDone: 0, bulkTotal: 0, selectedIssueIds: [] });
    expect(text()).toContain('0 @I1@ INDI\n1 NAME A /One/\n1 SOUR x\n1 BIRT\n1 FAMC @F1@\n');
    expect(text()).toContain('1 FAMC @F2@');
    expect(s().issues.some((i) => i.category === 'ASYMMETRIC_LINK')).toBe(false);
    expect(s().resolved.map((i) => i.id).sort()).toEqual([...ids].sort());
  });

  it('records one undo step per fix, and undoing them all restores the file', async () => {
    load(TWO_ONE_WAY);
    s().setIssueSelection(s().issues.map((i) => i.id));
    await s().bulkAccept();
    expect(s().applied).toHaveLength(2);
    s().undo();
    s().undo();
    expect(text()).toBe(TWO_ONE_WAY);
  });

  it('only touches the selected issues', async () => {
    load(TWO_ONE_WAY);
    const [first] = s().issues.filter((i) => i.category === 'ASYMMETRIC_LINK');
    s().setIssueSelection([first.id]);
    await s().bulkAccept();
    expect(s().issues.filter((i) => i.category === 'ASYMMETRIC_LINK')).toHaveLength(1);
  });

  it('is a no-op when nothing selected has an automatic fix', async () => {
    load(DEATH_BEFORE_BIRTH);
    s().setIssueSelection(s().issues.map((i) => i.id)); // all flag-only
    await s().bulkAccept();
    expect(text()).toBe(DEATH_BEFORE_BIRTH);
    expect(s()).toMatchObject({ bulkInProgress: false, applied: [] });
  });
});

describe('filters, selection and the editor', () => {
  it('selects the first issue the filter leaves visible, and closes the editor', () => {
    load(BROKEN);
    const asymmetric = s().issues.find((i) => i.category === 'ASYMMETRIC_LINK')!;
    s().editRecord('I1');
    s().setFilter('ASYMMETRIC_LINK');
    expect(s()).toMatchObject({ filter: 'ASYMMETRIC_LINK', selectedIssueId: asymmetric.id, editingRecordId: undefined });

    s().setSeverityFilter('info');
    expect(s()).toMatchObject({ severityFilter: 'info', selectedIssueId: undefined });
    s().setSeverityFilter('ALL');
    expect(s().selectedIssueId).toBe(asymmetric.id);
  });

  it('toggles issues in and out of the bulk selection', () => {
    load(BROKEN);
    const [a, b] = s().issues.map((i) => i.id);
    s().toggleIssueSelected(a);
    s().toggleIssueSelected(b);
    s().toggleIssueSelected(a);
    expect(s().selectedIssueIds).toEqual([b]);
  });

  it('selecting an issue leaves the record editor', () => {
    load(BROKEN);
    s().editRecord('I1');
    s().setEditorDirty(true);
    s().selectIssue(s().issues[1].id);
    expect(s()).toMatchObject({ selectedIssueId: s().issues[1].id, editingRecordId: undefined, editorDirty: false });
  });

  it('reset returns to the empty start state', () => {
    load(BROKEN);
    s().applyFixAction(primaryFix('DANGLING_POINTER'));
    s().reset();
    expect(s()).toMatchObject({
      db: undefined,
      fileName: undefined,
      fileId: undefined,
      issues: [],
      resolved: [],
      applied: [],
      selectedIssueId: undefined,
    });
  });
});

describe('dispatch (action-object compatibility layer)', () => {
  it('routes every action type to its store method', async () => {
    dispatch({ type: 'LOAD', db: parseText(ONE_WAY), name: 'a.ged', id: 'x' });
    expect(s().fileId).toBe('x');
    const issue = s().issues[0];

    dispatch({ type: 'SET_SIDEBAR_TAB', tab: 'resolved' });
    dispatch({ type: 'SET_FILTER', filter: 'ASYMMETRIC_LINK' });
    dispatch({ type: 'SET_SEVERITY_FILTER', severityFilter: 'invalid' });
    dispatch({ type: 'TOGGLE_ISSUE_SELECTED', id: issue.id });
    expect(s()).toMatchObject({
      sidebarTab: 'resolved',
      filter: 'ASYMMETRIC_LINK',
      severityFilter: 'invalid',
      selectedIssueIds: [issue.id],
    });
    dispatch({ type: 'SET_ISSUE_SELECTION', ids: [] });
    dispatch({ type: 'EDIT_RECORD', id: 'I1' });
    dispatch({ type: 'SET_EDITOR_DIRTY', value: true });
    expect(s()).toMatchObject({ selectedIssueIds: [], editingRecordId: 'I1', editorDirty: true });
    dispatch({ type: 'CLOSE_EDITOR' });
    dispatch({ type: 'SELECT_ISSUE', id: issue.id });
    expect(s()).toMatchObject({ editingRecordId: undefined, selectedIssueId: issue.id });

    dispatch({ type: 'APPLY_FIX', fix: issue.suggestedFixes[0].fix });
    expect(s().issues).toEqual([]);
    dispatch({ type: 'UNDO' });
    expect(s().issues).toHaveLength(1);
    dispatch({ type: 'REDO' });
    expect(s().issues).toEqual([]);
    dispatch({ type: 'UNDO' });
    dispatch({ type: 'SET_ISSUE_SELECTION', ids: [issue.id] });
    await dispatch({ type: 'BULK_ACCEPT' });
    expect(s().issues).toEqual([]);

    dispatch({ type: 'RESET' });
    expect(s().db).toBeUndefined();
  });
});
