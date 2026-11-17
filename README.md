# misc-feature-flag-manager

Feature Flag Manager.

## Current state

> Update this section periodically to reflect the state of the project. A roadmap link would be useful to track progress in the future

Current state of the project is described below.

As of today the project allows for any user (no authentication/authorization) to add feature flags, and edit their states freely via a web application.

The feature flags are saved locally. There is no permanent connection to a database to update the state of the feature flags.

React consumes the Fastify backend to get the data. Fastify repository exposes the API contract to the external systems via OpenAPI standard. API documentation is automatically generated using this standard. It includes basic error handling and sensible validation for its endpoints.

React application exposes a md file - runbook. Use playwright to get screenshots of the application and to explain its main features. Short, direct, concise, and clear - so any user regarding its background can start using and understanding the application right away.

> Link to the OpenAPI documentation (md file) and Frontend Runbook/Manual/Instructions (usability based - for final users) to this main README.md file

The repository contains both: backend and frontend code in separate directories.

## Techstack

- Node.js (TypeScript)
- Fastify
- React.js - SPA (vite)
- Tailwind
- vitest for unit testing (both backend and frontend)

## How to run locally

Use Node.js 22.12+ (or 24+) and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. Backend runs on http://127.0.0.1:3001.

Flags are saved in `backend/data/flags.json` and survive restarts. Run one backend process per file. Use `FLAG_STORE_PATH` to change the file location, or `PORT` to change the backend port. When changing the backend port, set `API_PROXY_TARGET` to its URL for the frontend.

- [API documentation](backend/docs/openapi.md). Interactive docs: http://127.0.0.1:3001/docs
- [Frontend runbook](frontend/docs/runbook.md)

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm run docs
```

To run the Playwright flow and refresh the runbook screenshots:

```sh
pnpm exec playwright install chromium
pnpm e2e
```

Use `pnpm e2e:showcase` to watch it in a browser. The flow starts its own servers on ports 3101 and 5174 with separate test data.

## Engineering Tradeoffs

The project has certain assumptions and in this section there are notes regarding to those assumptions and possible changes that might be required in future contributions.

### Performance

- **Latency**: Determine the acceptable latency the system should be able to react to and take care of the cache invalidation according to this value.

### Security

- **Role based authentication**: Users with different roles, such as read/write, read-only permission to view/edit the feature flags.

- **Project/Workspace level access**: Related with the previous one: granular access to specific users to specific projects/workspaces.

- **Add cloud-based persistence**: Feature flags and their statuses are not persisted in a database. This reflects a data integrity risk.

- **Backend security**: Implement backend security: rate limitter

### Reliablity

- **Include Idempotency handling**: In order to prevent multiple changes from overwritting themselves. For instance given the case multiple users edit the same feature flag state nearly at the same time. Only worth considering if this possibility is high likely to happen.

### Scalability

- **Elasticity**: According to the expected/studied load, implement Load balancing and redundant replicas strategies as needed for the backend and db integrations - if needed

### Observability

- **Audit**: Log changes made in feature flags with the user that is associated with such changes for tracing purposes.

- **General logging**: Integrate persistent logging to the system.

### Deployability

- **Deployabilty related scripts**: Use IaC to automate the cloud resource creation/update of the project.

- **CI/CD Pipeline**: To control releases/testing and auditing of what has been executed - GitHub Actions.

### QoL changes

- **Ability to create projects/workspaces**: So feature flags remain organized within these scopes.

- **Integrate end-to-end testing in CI/CD pipeline for fufure changes**

- **APIs implementation**: Full APIs implementation to other missing external services such as databases.
