import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';

const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'feature-flags-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const storePath = join(directory, 'flags.json');
  const app = await buildApp({ storePath });
  cleanups.push(() => app.close());
  return { app, storePath };
}

test('a new installation has no flags', async () => {
  const { app } = await setup();
  const response = await app.inject({ method: 'GET', url: '/api/flags' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual([]);
});

test('a created flag appears in the list with its disabled default', async () => {
  const { app } = await setup();
  const created = await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'new_checkout', description: 'New checkout flow' } });
  expect(created.statusCode).toBe(201);
  expect(created.json()).toEqual({ key: 'new_checkout', description: 'New checkout flow', enabled: false });
  const listed = await app.inject({ method: 'GET', url: '/api/flags' });
  expect(listed.json()).toEqual([{ key: 'new_checkout', description: 'New checkout flow', enabled: false }]);
});

test('a caller can read a flag and change its enabled state', async () => {
  const { app } = await setup();
  await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'new_checkout' } });
  const initial = await app.inject({ method: 'GET', url: '/api/flags/new_checkout' });
  expect(initial.json()).toEqual({ key: 'new_checkout', description: '', enabled: false });
  const updated = await app.inject({ method: 'PATCH', url: '/api/flags/new_checkout', payload: { enabled: true } });
  expect(updated.statusCode).toBe(200);
  const retrieved = await app.inject({ method: 'GET', url: '/api/flags/new_checkout' });
  expect(retrieved.json()).toEqual({ key: 'new_checkout', description: '', enabled: true });
});

test('duplicate keys are rejected without replacing the flag', async () => {
  const { app } = await setup();
  await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'checkout', enabled: true } });
  const duplicate = await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'checkout' } });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json()).toEqual({ message: 'A flag with this key already exists' });
  expect((await app.inject('/api/flags')).json()).toEqual([{ key: 'checkout', description: '', enabled: true }]);
});

test('invalid create requests are rejected without creating a flag', async () => {
  const { app } = await setup();
  for (const payload of [{}, { key: 'Bad Key' }, { key: 'a'.repeat(81) }, { key: 'valid', description: 'a'.repeat(501) }, { key: 'valid', enabled: 'false' }, { key: 'valid', extra: true }]) {
    const response = await app.inject({ method: 'POST', url: '/api/flags', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBeTypeOf('string');
  }
  expect((await app.inject('/api/flags')).json()).toEqual([]);
});

test('state changes require a boolean and cannot edit other fields', async () => {
  const { app } = await setup();
  await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'checkout' } });
  for (const payload of [{}, { enabled: 'true' }, { enabled: 1 }, { enabled: true, description: 'edit' }]) {
    expect((await app.inject({ method: 'PATCH', url: '/api/flags/checkout', payload })).statusCode).toBe(400);
  }
  expect((await app.inject('/api/flags/checkout')).json().enabled).toBe(false);
});

test('missing flags and unknown endpoints return a useful not-found error', async () => {
  const { app } = await setup();
  for (const request of [{ method: 'GET' as const, url: '/api/flags/missing' }, { method: 'PATCH' as const, url: '/api/flags/missing', payload: { enabled: true } }, { method: 'GET' as const, url: '/missing' }]) {
    const response = await app.inject(request);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: request.url === '/missing' ? 'Route not found' : 'Flag not found' });
  }
});

test('created flags and changed states survive a backend restart', async () => {
  const { app, storePath } = await setup();
  await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'checkout', description: 'Checkout rollout' } });
  await app.inject({ method: 'PATCH', url: '/api/flags/checkout', payload: { enabled: true } });
  await app.close();
  const restarted = await buildApp({ storePath });
  cleanups.push(() => restarted.close());
  expect((await restarted.inject('/api/flags')).json()).toEqual([{ key: 'checkout', description: 'Checkout rollout', enabled: true }]);
});

test('concurrent creates are all persisted across restart', async () => {
  const { app, storePath } = await setup();
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => app.inject({ method: 'POST', url: '/api/flags', payload: { key: `flag_${index}` } })));
  expect(responses.map((response) => response.statusCode)).toEqual(Array(12).fill(201));
  await app.close();
  const restarted = await buildApp({ storePath });
  cleanups.push(() => restarted.close());
  const listed = (await restarted.inject('/api/flags')).json();
  expect(listed).toHaveLength(12);
  expect(listed.map((flag: { key: string }) => flag.key).sort()).toEqual(['flag_0', 'flag_1', 'flag_10', 'flag_11', 'flag_2', 'flag_3', 'flag_4', 'flag_5', 'flag_6', 'flag_7', 'flag_8', 'flag_9']);
});

test('malformed JSON returns a client error', async () => {
  const { app } = await setup();
  const response = await app.inject({ method: 'POST', url: '/api/flags', headers: { 'content-type': 'application/json' }, payload: '{' });
  expect(response.statusCode).toBe(400);
  expect(response.json().message).toBeTypeOf('string');
});

test('a failed save does not publish a flag that was not persisted', async () => {
  const { app, storePath } = await setup();
  await mkdir(storePath);
  const response = await app.inject({ method: 'POST', url: '/api/flags', payload: { key: 'checkout' } });
  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ message: 'Unable to complete the request' });
  expect((await app.inject('/api/flags')).json()).toEqual([]);
});

test('invalid stored flags stop startup instead of discarding existing data', async () => {
  const { app, storePath } = await setup();
  await app.close();
  await writeFile(storePath, JSON.stringify([{ key: 'checkout', enabled: 'yes' }]));
  await expect(buildApp({ storePath })).rejects.toThrow('Invalid flag store');
});

test('OpenAPI describes the flag API and the documentation page is available', async () => {
  const { app } = await setup();
  const response = await app.inject('/docs/json');
  expect(response.statusCode).toBe(200);
  const document = response.json();
  expect(document.openapi).toBe('3.0.3');
  expect(document.paths['/api/flags'].post.requestBody.content['application/json'].schema.required).toEqual(['key']);
  expect(document.paths['/api/flags/{key}'].patch).toBeDefined();
  expect((await app.inject('/docs/')).statusCode).toBe(200);
});
