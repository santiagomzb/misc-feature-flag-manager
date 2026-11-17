# API

Generated from the Fastify route schemas with `pnpm run docs`.

[OpenAPI contract](openapi.json) · [Interactive documentation](http://127.0.0.1:3001/docs/)

| Method | Path | Action |
| --- | --- | --- |
| GET | /api/flags | List flags |
| POST | /api/flags | Create a flag (disabled by default) |
| GET | /api/flags/{key} | Read a flag |
| PATCH | /api/flags/{key} | Change a flag state |

A flag has a unique `key`, a `description` (empty when omitted), and an `enabled` boolean (false when omitted on creation). Keys start with a lowercase letter and contain lowercase letters, digits, underscores, or hyphens; maximum 80 characters. Descriptions allow up to 500 characters.

Create: `POST /api/flags` with `{"key":"new_checkout","description":"New checkout flow"}`.

Change state: `PATCH /api/flags/new_checkout` with `{"enabled":true}`.

Errors return `{ "message": "..." }`: 400 invalid request, 404 missing flag, 409 duplicate key, 500 storage or unexpected error. Creation returns 201; reads and updates return 200. No authentication is required.

Storage is a local JSON file. Run one backend process per file. Changes are serialized and written with atomic replacement; do not edit the file while the backend is running.
