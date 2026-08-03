import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { appName, appVersion } from '@speedify-status/config';
import {
  healthSchema,
  parseWindow,
  sampleEnvelopeSchema,
  statusResponseSchema,
} from '@speedify-status/contracts';
import { ZodError } from 'zod';
import { buildStatus } from './status/aggregate.js';
import { SampleStore } from './status/store.js';

export interface AppDeps {
  store?: SampleStore;
  logger?: boolean;
  /** When set, require Authorization: Bearer <token> or X-Ingest-Token on ingest. */
  ingestToken?: string;
}

function zodBadRequest(error: ZodError) {
  return {
    statusCode: 400 as const,
    error: 'Bad Request',
    message: 'Validation failed',
    issues: error.issues,
  };
}

function extractIngestToken(request: FastifyRequest): string | undefined {
  const header = request.headers['x-ingest-token'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const auth = request.headers.authorization;
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const store = deps.store ?? new SampleStore();
  const ingestToken = deps.ingestToken ?? process.env.SPEEDIFY_STATUS_INGEST_TOKEN ?? '';
  const app = Fastify({ logger: deps.logger ?? true });

  await app.register(cors, { origin: true });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(zodBadRequest(error));
    }
    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  const healthPayload = () => {
    const latest = store.latest();
    const now = Date.now();
    const lastSampleAgeMs =
      latest === null ? null : Math.max(0, now - (latest.receivedAt ?? latest.ts));
    return {
      status: 'ok' as const,
      service: `${appName}-api`,
      version: appVersion,
      lastSampleAgeMs,
      sampleCount: store.sampleCount,
    };
  };

  app.get('/health', async () => healthSchema.parse(healthPayload()));
  app.get('/api/health', async () => healthSchema.parse(healthPayload()));

  app.post('/api/ingest/sample', async (request, reply) => {
    if (ingestToken) {
      const provided = extractIngestToken(request);
      if (provided !== ingestToken) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing ingest token',
        });
      }
    }
    const body = sampleEnvelopeSchema.parse(request.body);
    const stored = store.ingest(body);
    return reply.status(202).send({
      ok: true,
      ts: stored.ts,
      adapters: stored.adapters.length,
      sampleCount: store.sampleCount,
    });
  });

  app.get('/api/status', async (request) => {
    const query = request.query as { window?: string };
    const window = parseWindow(query.window);
    const payload = buildStatus(store, window);
    return statusResponseSchema.parse(payload);
  });

  Object.assign(app, { sampleStore: store });
  return app;
}
