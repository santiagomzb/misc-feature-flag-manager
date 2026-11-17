import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flag-docs-'));
const app = await buildApp({ storePath: join(temporaryDirectory, 'flags.json') });
try {
  await app.ready();
  const specification = app.swagger();
  const outputDirectory = fileURLToPath(new URL('../docs/', import.meta.url));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'openapi.json'), JSON.stringify(specification, null, 2) + '\n');
  const operations: string[] = [];
  for (const [path, methods] of Object.entries(specification.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods ?? {})) {
      if (!operation || typeof operation !== 'object' || !('summary' in operation)) continue;
      operations.push(`| ${method.toUpperCase()} | ${path} | ${operation.summary} |`);
    }
  }
  await writeFile(join(outputDirectory, 'openapi.md'), [
    '# API',
    '',
    'Generated from the Fastify route schemas with `pnpm run docs`.',
    '',
    '[OpenAPI contract](openapi.json) · [Interactive documentation](http://127.0.0.1:3001/docs/)',
    '',
    '| Method | Path | Action |',
    '| --- | --- | --- |',
    ...operations,
    '',
    'A flag has a unique `key`, a `description` (empty when omitted), and an `enabled` boolean (false when omitted on creation). Keys start with a lowercase letter and contain lowercase letters, digits, underscores, or hyphens; maximum 80 characters. Descriptions allow up to 500 characters.',
    '',
    'Create: `POST /api/flags` with `{"key":"new_checkout","description":"New checkout flow"}`.',
    '',
    'Change state: `PATCH /api/flags/new_checkout` with `{"enabled":true}`.',
    '',
    'Errors return `{ "message": "..." }`: 400 invalid request, 404 missing flag, 409 duplicate key, 500 storage or unexpected error. Creation returns 201; reads and updates return 200. No authentication is required.',
    '',
    'Storage is a local JSON file. Run one backend process per file. Changes are serialized and written with atomic replacement; do not edit the file while the backend is running.',
    '',
  ].join('\n'));
} finally {
  await app.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
