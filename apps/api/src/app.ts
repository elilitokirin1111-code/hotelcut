import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  DomainConflictError,
  DomainNotFoundError,
  type AuthRepository,
  type HotelCutRepository,
} from '@hotelcut/domain';
import type { AnalysisQueue, RenderQueue } from '@hotelcut/job-queue';
import {
  brandKitSchema,
  createHotelSchema,
  createVideoBriefSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
  hotelSchema,
  idParamsSchema,
  organizationSchema,
  updateHotelSchema,
  upsertBrandKitSchema,
  videoBriefSchema,
  type AiDirectorFeatureFlags,
} from '@hotelcut/schemas';
import type { MultipartObjectStorage } from '@hotelcut/storage';

import { assetRoutes } from './asset-routes.js';
import { aiReviewRoutes } from './ai-review-routes.js';
import { aiTemplateRoutes } from './ai-template-routes.js';
import { configureAuthentication } from './authentication.js';
import { creativeProjectRoutes } from './creative-project-routes.js';
import { feedbackRoutes } from './feedback-routes.js';
import { modelProviderRoutes } from './model-provider-routes.js';
import { projectRoutes } from './project-routes.js';
import { renderRoutes } from './render-routes.js';

interface BuildAppOptions {
  allowDevelopmentIdentity?: boolean;
  analysisQueue?: AnalysisQueue;
  aiDirectorFeatureFlags?: AiDirectorFeatureFlags;
  authRepository?: AuthRepository;
  downloadUrlTtlSeconds?: number;
  guestUserId?: string;
  logger?: boolean;
  modelApiConfigSecret?: string;
  modelProviderFetch?: typeof fetch;
  objectStorage?: MultipartObjectStorage;
  renderQueue?: RenderQueue;
  repository?: HotelCutRepository;
  secureSessionCookie?: boolean;
  sessionTtlSeconds?: number;
  storageBucket?: string;
  uploadUrlTtlSeconds?: number;
}

const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal('ok'),
  version: z.string(),
});

const readinessResponseSchema = z.object({
  checks: z.record(z.string(), z.string()),
  service: z.string(),
  status: z.enum(['ready', 'not_ready']),
});

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainNotFoundError) {
      return reply.code(404).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    }
    if (error instanceof DomainConflictError) {
      return reply.code(409).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    }
    if (error instanceof Error && 'validation' in error && error.validation) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        requestId: request.id,
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: request.id,
    });
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'HotelCut API',
        description: 'Hotel short-video automation platform API',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          developmentUser: {
            type: 'apiKey',
            in: 'header',
            name: 'x-user-id',
            description: 'Non-production compatibility identity; disabled in production.',
          },
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'hotelcut_session',
            description: 'Opaque server-owned session created by email login.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  app.get(
    '/health',
    { schema: { response: { 200: healthResponseSchema }, tags: ['system'] } },
    () => ({
      service: 'hotelcut-api',
      status: 'ok' as const,
      version: '0.1.0',
    }),
  );

  app.get(
    '/ready',
    {
      schema: {
        response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
        tags: ['system'],
      },
    },
    async (_request, reply) => {
      try {
        await options.repository?.ping();
        return {
          checks: { database: options.repository ? 'ok' : 'not_configured', process: 'ok' },
          service: 'hotelcut-api',
          status: 'ready' as const,
        };
      } catch {
        return reply.code(503).send({
          checks: { database: 'failed', process: 'ok' },
          service: 'hotelcut-api',
          status: 'not_ready',
        });
      }
    },
  );

  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };

  configureAuthentication(app, {
    allowDevelopmentIdentity: options.allowDevelopmentIdentity ?? true,
    guestUserId: options.guestUserId,
    repository: options.authRepository,
    secureSessionCookie: options.secureSessionCookie ?? false,
    sessionTtlSeconds: options.sessionTtlSeconds ?? 604_800,
  });

  app.get(
    '/v1/organizations',
    {
      schema: {
        response: { 200: z.array(organizationSchema), 400: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List organizations visible to the current user',
        tags: ['organizations'],
      },
    },
    async (request) => repository().listOrganizations(request.actorUserId),
  );

  app.get(
    '/v1/hotels',
    {
      schema: {
        response: { 200: z.array(hotelSchema), 400: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List hotels in the current user organizations',
        tags: ['hotels'],
      },
    },
    async (request) => repository().listHotels(request.actorUserId),
  );

  app.post(
    '/v1/hotels',
    {
      schema: {
        body: createHotelSchema,
        response: {
          201: hotelSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a hotel in an administered organization',
        tags: ['hotels'],
      },
    },
    async (request, reply) => {
      const hotel = await repository().createHotel(request.actorUserId, request.body);
      return reply.code(201).send(hotel);
    },
  );

  app.get(
    '/v1/hotels/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: hotelSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Get a tenant-scoped hotel',
        tags: ['hotels'],
      },
    },
    async (request) => repository().getHotel(request.actorUserId, request.params.id),
  );

  app.patch(
    '/v1/hotels/:id',
    {
      schema: {
        body: updateHotelSchema,
        params: idParamsSchema,
        response: { 200: hotelSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Update an administered hotel',
        tags: ['hotels'],
      },
    },
    async (request) =>
      repository().updateHotel(request.actorUserId, request.params.id, request.body),
  );

  app.get(
    '/v1/hotels/:hotelId/brand-kit',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: { 200: brandKitSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Get a hotel brand kit',
        tags: ['brand-kits'],
      },
    },
    async (request) => repository().getBrandKit(request.actorUserId, request.params.hotelId),
  );

  app.put(
    '/v1/hotels/:hotelId/brand-kit',
    {
      schema: {
        body: upsertBrandKitSchema,
        params: hotelIdParamsSchema,
        response: { 200: brandKitSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create or replace an administered hotel brand kit',
        tags: ['brand-kits'],
      },
    },
    async (request) =>
      repository().upsertBrandKit(request.actorUserId, request.params.hotelId, request.body),
  );

  app.get(
    '/v1/hotels/:hotelId/video-briefs',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(videoBriefSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List video briefs for a hotel',
        tags: ['video-briefs'],
      },
    },
    async (request) => repository().listVideoBriefs(request.actorUserId, request.params.hotelId),
  );

  app.post(
    '/v1/hotels/:hotelId/video-briefs',
    {
      schema: {
        body: createVideoBriefSchema,
        params: hotelIdParamsSchema,
        response: {
          201: videoBriefSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a video brief for a hotel',
        tags: ['video-briefs'],
      },
    },
    async (request, reply) => {
      const brief = await repository().createVideoBrief(
        request.actorUserId,
        request.params.hotelId,
        request.body,
      );
      return reply.code(201).send(brief);
    },
  );

  app.get(
    '/v1/video-briefs/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: videoBriefSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Get a tenant-scoped video brief',
        tags: ['video-briefs'],
      },
    },
    async (request) => repository().getVideoBrief(request.actorUserId, request.params.id),
  );

  await app.register(assetRoutes, {
    analysisQueue: options.analysisQueue,
    bucket: options.storageBucket ?? 'hotelcut-local',
    objectStorage: options.objectStorage,
    repository: options.repository,
    uploadUrlTtlSeconds: options.uploadUrlTtlSeconds ?? 900,
  });
  await app.register(modelProviderRoutes, {
    configSecret: options.modelApiConfigSecret ?? 'hotelcut-local-model-secret',
    fetchProvider: options.modelProviderFetch,
    repository: options.repository,
  });
  await app.register(creativeProjectRoutes, {
    featureFlags: options.aiDirectorFeatureFlags ?? {
      aiDirectorEnabled: false,
      referenceAnalysisEnabled: false,
      dynamicBlueprintEnabled: false,
      aiReviewEnabled: false,
    },
    configSecret: options.modelApiConfigSecret ?? 'hotelcut-local-model-secret',
    ...(options.modelProviderFetch ? { fetchProvider: options.modelProviderFetch } : {}),
    ...(options.repository ? { repository: options.repository } : {}),
  });
  await app.register(aiTemplateRoutes, {
    featureFlags: options.aiDirectorFeatureFlags ?? { aiDirectorEnabled: false },
    configSecret: options.modelApiConfigSecret ?? 'hotelcut-local-model-secret',
    ...(options.modelProviderFetch ? { fetchProvider: options.modelProviderFetch } : {}),
    ...(options.repository ? { repository: options.repository } : {}),
  });
  await app.register(projectRoutes, {
    repository: options.repository,
  });
  await app.register(aiReviewRoutes, {
    configSecret: options.modelApiConfigSecret ?? 'hotelcut-local-model-secret',
    featureFlags: options.aiDirectorFeatureFlags ?? { aiReviewEnabled: false },
    ...(options.modelProviderFetch ? { fetchProvider: options.modelProviderFetch } : {}),
    ...(options.repository ? { repository: options.repository } : {}),
  });
  await app.register(feedbackRoutes, {
    ...(options.repository ? { repository: options.repository } : {}),
  });
  await app.register(renderRoutes, {
    downloadUrlTtlSeconds: options.downloadUrlTtlSeconds ?? 900,
    objectStorage: options.objectStorage,
    renderQueue: options.renderQueue,
    repository: options.repository,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  return app;
}
