// Where to send someone after signing in. `next` arrives in the query string,
// so it is attacker-controlled: only a path inside this app is honoured.
//
// Browsers treat a backslash like a slash and skip tabs/newlines when
// resolving a URL, so `/\evil.example` or `/<tab>/evil.example` leave the site
// just as `//evil.example` does. Mirrors the server's check in
// server/src/routes/oauth.ts, which receives this value for Google login.

export const DEFAULT_NEXT = '/app';

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT;
  for (const ch of next) {
    if (ch === '\\' || ch < ' ' || ch === '\x7f') return DEFAULT_NEXT;
  }
  return next;
}
