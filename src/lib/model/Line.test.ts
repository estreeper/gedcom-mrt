import { tokenizeLine } from './Line';

describe('tokenizeLine', () => {
  it('parses a level-0 record with an xref', () => {
    const l = tokenizeLine('0 @I5@ INDI', 1);
    expect(l).toMatchObject({ level: 0, xref: 'I5', tag: 'INDI', malformed: false });
    expect(l.value).toBeUndefined();
  });

  it('parses a level-0 record without an xref (HEAD)', () => {
    const l = tokenizeLine('0 HEAD', 1);
    expect(l).toMatchObject({ level: 0, tag: 'HEAD', malformed: false });
    expect(l.xref).toBeUndefined();
  });

  it('parses a pointer value', () => {
    const l = tokenizeLine('1 FAMC @F3@', 1);
    expect(l).toMatchObject({ level: 1, tag: 'FAMC', value: '@F3@', pointer: 'F3' });
  });

  it('parses a plain value with spaces', () => {
    const l = tokenizeLine('2 DATE 12 JAN 1900', 1);
    expect(l).toMatchObject({ level: 2, tag: 'DATE', value: '12 JAN 1900' });
    expect(l.pointer).toBeUndefined();
  });

  it('handles multi-digit levels', () => {
    const l = tokenizeLine('12 NOTE deep', 1);
    expect(l.level).toBe(12);
    expect(l.malformed).toBe(false);
  });

  it('accepts custom underscore tags', () => {
    const l = tokenizeLine('1 _MILT military service', 1);
    expect(l).toMatchObject({ tag: '_MILT', malformed: false });
  });

  it('does not treat an email-like value as a pointer', () => {
    const l = tokenizeLine('2 EMAIL me@example.com', 1);
    expect(l.value).toBe('me@example.com');
    expect(l.pointer).toBeUndefined();
  });

  it('does not treat two pointers as one', () => {
    const l = tokenizeLine('1 NOTE @F1@ and @F2@', 1);
    expect(l.pointer).toBeUndefined();
  });

  it('preserves an empty value after a trailing delimiter', () => {
    const l = tokenizeLine('1 NAME ', 1);
    expect(l.value).toBe('');
    expect(l.malformed).toBe(false);
  });

  it('flags a blank line as malformed', () => {
    const l = tokenizeLine('', 1);
    expect(l.malformed).toBe(true);
    expect(l.level).toBe(-1);
  });

  it('flags garbage with no level as malformed', () => {
    const l = tokenizeLine('this is not gedcom', 1);
    expect(l.malformed).toBe(true);
  });

  it('flags a level with no tag as malformed but keeps the level', () => {
    const l = tokenizeLine('2', 1);
    expect(l.malformed).toBe(true);
    expect(l.level).toBe(2);
  });

  it('flags an unterminated xref as malformed', () => {
    const l = tokenizeLine('0 @I5 INDI', 1);
    expect(l.malformed).toBe(true);
  });
});
