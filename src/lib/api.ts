// Thin fetch wrapper for the backend REST API. The SPA and API are served from
// the same origin in production (the Fastify server serves both), so the client
// always uses relative `/api` paths and cookie-based sessions — no CORS, no
// base URL. VITE_API_BASE overrides the base for local dev pointing at a
// separately-run backend.

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  /** JSON body to send (sets Content-Type). */
  json?: unknown;
  /** Raw body (e.g. an encrypted blob) sent as-is. */
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Expected response: 'json' (default), 'arrayBuffer', 'text', or 'none'. */
  parse?: 'json' | 'arrayBuffer' | 'text' | 'none';
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include', // send/receive the session cookie
    headers,
    body,
    signal: opts.signal,
  });

  if (!res.ok) {
    let errBody: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      errBody = await res.json();
      if (errBody && typeof errBody === 'object' && 'message' in errBody) {
        message = String((errBody as { message: unknown }).message);
      }
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new ApiError(res.status, message, errBody);
  }

  const parse = opts.parse ?? 'json';
  if (parse === 'none' || res.status === 204) return undefined as T;
  if (parse === 'arrayBuffer') return (await res.arrayBuffer()) as T;
  if (parse === 'text') return (await res.text()) as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
  put: <T>(path: string, opts?: RequestOptions) => request<T>('PUT', path, opts),
  del: <T>(path: string, opts?: RequestOptions) =>
    request<T>('DELETE', path, opts),
};
