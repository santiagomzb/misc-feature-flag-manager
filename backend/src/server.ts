import { buildApp } from './app.js';

const app = await buildApp({ logger: true });
try {
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
  });
}
