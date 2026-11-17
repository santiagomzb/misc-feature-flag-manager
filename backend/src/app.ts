import Fastify, { type FastifyError } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

type Flag = { key: string; description: string; enabled: boolean };

const keySchema = { type: "string", pattern: "^[a-z][a-z0-9_-]*$", maxLength: 80 };
const createSchema = {
  type: "object",
  required: ["key"],
  additionalProperties: false,
  properties: {
    key: keySchema,
    description: { type: "string", maxLength: 500 },
    enabled: { type: "boolean" },
  },
};
const flagSchema = {
  type: "object",
  required: ["key", "description", "enabled"],
  additionalProperties: false,
  properties: {
    key: keySchema,
    description: { type: "string", maxLength: 500 },
    enabled: { type: "boolean" },
  },
};
const errorSchema = {
  type: "object",
  required: ["message"],
  properties: { message: { type: "string" } },
};
const paramsSchema = { type: "object", required: ["key"], properties: { key: keySchema } };
const errors = { 400: errorSchema, 404: errorSchema, 409: errorSchema, 500: errorSchema };

export async function buildApp(options: { storePath?: string; logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  await app.register(swagger, {
    openapi: { openapi: "3.0.3", info: { title: "Feature Flag Manager API", version: "0.1.0" } },
  });
  await app.register(swaggerUI, { routePrefix: "/docs" });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: "Route not found" }));
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ message: error.message });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
      return reply.code(error.statusCode).send({ message: error.message });
    request.log.error(error);
    return reply.code(500).send({ message: "Unable to complete the request" });
  });
  const storePath =
    options.storePath ??
    process.env.FLAG_STORE_PATH ??
    fileURLToPath(new URL("../data/flags.json", import.meta.url));
  let flags: Flag[] = [];
  try {
    const stored: unknown = JSON.parse(await readFile(storePath, "utf8"));
    if (
      !Array.isArray(stored) ||
      stored.some(
        (flag) =>
          !flag ||
          typeof flag !== "object" ||
          typeof flag.key !== "string" ||
          !/^[a-z][a-z0-9_-]*$/.test(flag.key) ||
          flag.key.length > 80 ||
          typeof flag.description !== "string" ||
          flag.description.length > 500 ||
          typeof flag.enabled !== "boolean",
      ) ||
      new Set(stored.map((flag) => flag.key)).size !== stored.length
    )
      throw new Error("Invalid flag store");
    flags = stored;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async function save(next: Flag[]) {
    await mkdir(dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(next, null, 2) + "\n");
      await rename(temporaryPath, storePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    flags = next;
  }
  app.addHook("onClose", async () => {
    await pending;
  });
  app.get(
    "/api/flags",
    {
      schema: {
        summary: "List flags",
        response: { 200: { type: "array", items: flagSchema }, 500: errorSchema },
      },
    },
    async () => flags,
  );
  app.post<{ Body: { key: string; description?: string; enabled?: boolean } }>(
    "/api/flags",
    {
      schema: {
        summary: "Create a flag (disabled by default)",
        body: createSchema,
        response: { 201: flagSchema, ...errors },
      },
    },
    async (request, reply) =>
      serialize(async () => {
        if (flags.some((flag) => flag.key === request.body.key))
          return reply.code(409).send({ message: "A flag with this key already exists" });
        const flag = {
          key: request.body.key,
          description: request.body.description ?? "",
          enabled: request.body.enabled ?? false,
        };
        await save([...flags, flag]);
        return reply.code(201).send(flag);
      }),
  );
  app.get<{ Params: { key: string } }>(
    "/api/flags/:key",
    {
      schema: {
        summary: "Read a flag",
        params: paramsSchema,
        response: { 200: flagSchema, ...errors },
      },
    },
    async (request, reply) => {
      const flag = flags.find((flag) => flag.key === request.params.key);
      return flag ?? reply.code(404).send({ message: "Flag not found" });
    },
  );
  app.patch<{ Params: { key: string }; Body: { enabled: boolean } }>(
    "/api/flags/:key",
    {
      schema: {
        summary: "Change a flag state",
        params: paramsSchema,
        body: {
          type: "object",
          required: ["enabled"],
          additionalProperties: false,
          properties: { enabled: { type: "boolean" } },
        },
        response: { 200: flagSchema, ...errors },
      },
    },
    async (request, reply) =>
      serialize(async () => {
        const flag = flags.find((flag) => flag.key === request.params.key);
        if (!flag) return reply.code(404).send({ message: "Flag not found" });
        const updated = { ...flag, enabled: request.body.enabled };
        await save(flags.map((existing) => (existing.key === updated.key ? updated : existing)));
        return updated;
      }),
  );
  return app;
}
