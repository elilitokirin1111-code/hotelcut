import type { FastifyPluginCallback } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { DomainNotFoundError, type HotelCutRepository } from '@hotelcut/domain';
import {
  aiDirectorFeatureFlagsSchema,
  createCreativeProjectSchema,
  creativeProjectIdParamsSchema,
  creativeProjectSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
  updateCreativeProjectSchema,
  type AiDirectorFeatureFlags,
} from '@hotelcut/schemas';

interface CreativeProjectRouteOptions {
  featureFlags: AiDirectorFeatureFlags;
  repository?: HotelCutRepository;
}

export const creativeProjectRoutes: FastifyPluginCallback<CreativeProjectRouteOptions> = (
  fastify,
  options,
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };
  const requireAiDirector = (): void => {
    if (!options.featureFlags.aiDirectorEnabled) {
      throw new DomainNotFoundError('AI Director is disabled');
    }
  };

  app.get(
    '/v1/ai-director/features',
    {
      schema: {
        response: { 200: aiDirectorFeatureFlagsSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Read AI Director feature availability',
        tags: ['ai-director'],
      },
    },
    () => options.featureFlags,
  );

  app.post(
    '/v1/hotels/:hotelId/creative-projects',
    {
      schema: {
        body: createCreativeProjectSchema,
        params: hotelIdParamsSchema,
        response: {
          201: creativeProjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create an immutable-history AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request, reply) => {
      requireAiDirector();
      const project = await repository().createCreativeProject(
        request.actorUserId,
        request.params.hotelId,
        request.body,
      );
      return reply.code(201).send(project);
    },
  );

  app.get(
    '/v1/hotels/:hotelId/creative-projects',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(creativeProjectSchema),
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List active AI creative projects for a hotel',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().listCreativeProjects(request.actorUserId, request.params.hotelId);
    },
  );

  app.get(
    '/v1/creative-projects/:projectId',
    {
      schema: {
        params: creativeProjectIdParamsSchema,
        response: { 200: creativeProjectSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Load one tenant-scoped AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().getCreativeProject(request.actorUserId, request.params.projectId);
    },
  );

  app.patch(
    '/v1/creative-projects/:projectId',
    {
      schema: {
        body: updateCreativeProjectSchema,
        params: creativeProjectIdParamsSchema,
        response: {
          200: creativeProjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Update the selected pointers or lifecycle of an AI creative project',
        tags: ['ai-director'],
      },
    },
    async (request) => {
      requireAiDirector();
      return repository().updateCreativeProject(
        request.actorUserId,
        request.params.projectId,
        request.body,
      );
    },
  );
};
