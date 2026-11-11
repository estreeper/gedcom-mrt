import { vi } from 'vitest';

// A stand-in for the backend in frontend tests: replaces global fetch with a
// router over `METHOD /path` keys (paths are relative to /api) and records
// every call, so tests can script server replies and assert on requests.

export interface ApiCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply =
  | { status?: number; json?: unknown; text?: string; bytes?: Uint8Array }
  | Error;
type Handler = Reply | ((call: ApiCall) => Reply | Promise<Reply>);

export function reply(json: unknown, status = 200): Reply {
  return { status, json };
}

export function fail(status: number, message?: string): Reply {
  return { status, json: message === undefined ? undefined : { message } };
}

export function installFakeApi(routes: Record<string, Handler> = {}) {
  const calls: ApiCall[] = [];
  const table = new Map(Object.entries(routes));

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = String(url).replace(/^\/api/, '');
    const raw = init.body;
    const call: ApiCall = {
      method,
      path,
      headers: (init.headers as Record<string, string>) ?? {},
      body: typeof raw === 'string' ? safeJson(raw) : raw,
    };
    calls.push(call);

    const handler = table.get(`${method} ${path}`);
    if (handler === undefined) throw new TypeError(`Failed to fetch (${method} ${path})`);
    const res = typeof handler === 'function' ? await handler(call) : handler;
    if (res instanceof Error) throw res;

    const status = res.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => {
        if (res.json === undefined) throw new SyntaxError('Unexpected end of JSON input');
        return res.json;
      },
      text: async () => res.text ?? JSON.stringify(res.json ?? ''),
      arrayBuffer: async () => (res.bytes ?? new Uint8Array()).slice().buffer,
    } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    /** Add or replace a route mid-test. */
    on(key: string, handler: Handler) {
      table.set(key, handler);
    },
    /** The calls made to one `METHOD /path`. */
    callsTo(key: string): ApiCall[] {
      return calls.filter((c) => `${c.method} ${c.path}` === key);
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
