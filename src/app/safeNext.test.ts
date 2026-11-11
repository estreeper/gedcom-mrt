import { safeNext } from './safeNext';

describe('safeNext', () => {
  it.each(['/app', '/account/billing?canceled=1', '/app/file/abc/issues/X%3A1?tab=records'])(
    'keeps the in-app path %s',
    (path) => expect(safeNext(path)).toBe(path)
  );

  it.each([
    ['an absolute URL', 'https://evil.example/'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash the browser reads as a slash', '/\\evil.example'],
    ['a backslash later in the path', '/app\\x'],
    ['a tab the browser strips', '/\t/evil.example'],
    ['a newline the browser strips', '/\n/evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'app'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls back to /app for %s', (_name, value) => expect(safeNext(value)).toBe('/app'));
});
