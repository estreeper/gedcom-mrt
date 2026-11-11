import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { installFakeApi, reply, fail } from '../test/fakeApi';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('calls relative /api paths with the session cookie included', async () => {
    const server = installFakeApi({ 'GET /thing': reply({ a: 1 }) });
    expect(await api.get('/thing')).toEqual({ a: 1 });
    const [url, init] = server.fetchMock.mock.calls[0];
    expect(url).toBe('/api/thing');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init?.body).toBeUndefined();
  });

  it('sends a JSON body with its content type, keeping extra headers', async () => {
    const server = installFakeApi({ 'POST /thing': reply({ ok: true }) });
    await api.post('/thing', { json: { email: 'a@b.co' }, headers: { 'x-extra': '1' } });
    const [, init] = server.fetchMock.mock.calls[0];
    expect(init?.body).toBe('{"email":"a@b.co"}');
    expect(init?.headers).toEqual({ 'x-extra': '1', 'Content-Type': 'application/json' });
  });

  it('sends a raw body untouched', async () => {
    const server = installFakeApi({ 'PUT /blob': reply({}) });
    const bytes = new Uint8Array([1, 2, 3]);
    await api.put('/blob', { body: bytes, headers: { 'content-type': 'application/octet-stream' } });
    expect(server.fetchMock.mock.calls[0][1]?.body).toBe(bytes);
  });

  it('uses each HTTP verb', async () => {
    const server = installFakeApi({
      'GET /v': reply(1),
      'POST /v': reply(2),
      'PUT /v': reply(3),
      'DELETE /v': reply(4),
    });
    expect([await api.get('/v'), await api.post('/v'), await api.put('/v'), await api.del('/v')]).toEqual([1, 2, 3, 4]);
    expect(server.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });

  it('parses the response as asked', async () => {
    installFakeApi({
      'GET /bytes': { bytes: new Uint8Array([9, 8, 7]) },
      'GET /text': { text: 'hello' },
      'GET /nothing': { status: 200 },
      'GET /no-content': { status: 204 },
    });
    expect(new Uint8Array(await api.get<ArrayBuffer>('/bytes', { parse: 'arrayBuffer' }))).toEqual(
      new Uint8Array([9, 8, 7])
    );
    expect(await api.get('/text', { parse: 'text' })).toBe('hello');
    // 'none' must not try to read a body that isn't JSON.
    expect(await api.get('/nothing', { parse: 'none' })).toBeUndefined();
    expect(await api.get('/no-content')).toBeUndefined();
  });

  it("throws an ApiError carrying the status and the server's message", async () => {
    installFakeApi({ 'POST /login': fail(401, 'Incorrect email or password.') });
    const err = await api.post('/login').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Incorrect email or password.',
      body: { message: 'Incorrect email or password.' },
    });
  });

  it('falls back to the status line when the error body is not JSON or has no message', async () => {
    installFakeApi({ 'GET /html': fail(502), 'GET /odd': { status: 500, json: { error: 'x' } } });
    await expect(api.get('/html')).rejects.toMatchObject({ status: 502, message: '502 Error' });
    await expect(api.get('/odd')).rejects.toMatchObject({ status: 500, message: '500 Error' });
  });

  it('lets a network failure propagate as-is (not an ApiError)', async () => {
    installFakeApi({ 'GET /down': new TypeError('Failed to fetch') });
    const err = await api.get('/down').catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('passes an abort signal through', async () => {
    const server = installFakeApi({ 'GET /slow': reply({}) });
    const controller = new AbortController();
    await api.get('/slow', { signal: controller.signal });
    expect(server.fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
