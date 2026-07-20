import { describe, expect, it } from 'vitest';
import { createApiRuntime, startDemoApiServer } from '../server.js';

describe('loopback demo API', () => {
  it('serves every documented route and closes cleanly', async () => {
    const server = await startDemoApiServer();
    const health = await fetch(`${server.baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual(expect.objectContaining({ ok: true, transport: 'loopback' }));

    const users = await fetch(`${server.baseUrl}/users`);
    expect((await users.json()).users).toHaveLength(2);

    const echo = await fetch(`${server.baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'celestial' }),
    });
    expect(await echo.json()).toEqual({ method: 'POST', received: { hello: 'celestial' } });

    const slow = await fetch(`${server.baseUrl}/slow?ms=5`);
    expect(await slow.json()).toEqual({ ok: true, waitedMs: 5 });

    expect((await fetch(`${server.baseUrl}/error`)).status).toBe(500);
    expect((await fetch(`${server.baseUrl}/missing`)).status).toBe(404);

    await server.close();
    await expect(fetch(`${server.baseUrl}/health`)).rejects.toThrow();
  });

  it('enforces loopback paths, abort timeouts, and runtime disposal', async () => {
    const runtime = createApiRuntime();
    const health = await runtime.request({ method: 'GET', path: '/health', body: '' });
    expect(health.status).toBe(200);
    expect(health.body).toContain('celestial-demo');

    const failure = await runtime.request({ method: 'GET', path: '/error', body: '' });
    expect(failure.status).toBe(500);

    await expect(runtime.request({ method: 'GET', path: '/slow?ms=250', body: '', timeoutMs: 20 })).rejects.toThrow();
    await expect(runtime.request({ method: 'GET', path: '//example.com/', body: '' })).rejects.toThrow('loopback');

    await runtime.dispose();
    expect(runtime.isRunning()).toBe(false);
  });
});
