import type { HotelCutRepository } from '@hotelcut/domain';
import {
  createVideoProjectSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
  idParamsSchema,
  projectRevisionSchema,
  saveProjectRevisionSchema,
  videoProjectDetailSchema,
  videoProjectSchema,
} from '@hotelcut/schemas';
import { parseHotelVideoProject, type HotelVideoProjectV1 } from '@hotelcut/timeline';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

interface ProjectRouteOptions {
  repository?: HotelCutRepository | undefined;
}

class ProjectRequestError extends Error {
  readonly validation: readonly { message: string }[];

  constructor(message: string) {
    super(message);
    this.name = 'ProjectRequestError';
    this.validation = [{ message }];
  }
}

function validateProjectDocument(value: unknown): HotelVideoProjectV1 {
  try {
    return parseHotelVideoProject(value);
  } catch (error) {
    throw new ProjectRequestError(
      error instanceof Error ? error.message : 'Invalid HotelVideoProject document',
    );
  }
}

export const projectRoutes: FastifyPluginCallback<ProjectRouteOptions> = (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) {
      throw new Error('HotelCut repository is not configured');
    }
    return options.repository;
  };

  app.get(
    '/v1/hotels/:hotelId/video-projects',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: {
          200: z.array(videoProjectSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List editable video projects for a hotel',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().listVideoProjects(request.actorUserId, request.params.hotelId),
  );

  app.post(
    '/v1/hotels/:hotelId/video-projects',
    {
      schema: {
        body: createVideoProjectSchema,
        params: hotelIdParamsSchema,
        response: {
          201: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Create a project and immutable first revision',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const projectDocument = validateProjectDocument(request.body.projectDocument);
      if (projectDocument.id !== request.body.id) {
        throw new ProjectRequestError('Project document id must match the requested project id');
      }
      if (projectDocument.hotelId !== request.params.hotelId) {
        throw new ProjectRequestError('Project document hotelId must match the route hotelId');
      }
      const result = await repository().createVideoProject(
        request.actorUserId,
        request.params.hotelId,
        {
          ...request.body,
          projectDocument,
          schemaVersion: projectDocument.schemaVersion,
        },
      );
      return reply.code(201).send(result);
    },
  );

  app.get(
    '/v1/video-projects/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Load the current editable project revision',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().getVideoProject(request.actorUserId, request.params.id),
  );

  app.get(
    '/v1/video-projects/:id/revisions',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: z.array(projectRevisionSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List immutable revisions for a project',
        tags: ['video-projects'],
      },
    },
    async (request) => repository().listProjectRevisions(request.actorUserId, request.params.id),
  );

  app.post(
    '/v1/video-projects/:id/revisions',
    {
      schema: {
        body: saveProjectRevisionSchema,
        params: idParamsSchema,
        response: {
          201: videoProjectDetailSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Autosave a validated immutable project revision',
        tags: ['video-projects'],
      },
    },
    async (request, reply) => {
      const projectDocument = validateProjectDocument(request.body.projectDocument);
      if (projectDocument.id !== request.params.id) {
        throw new ProjectRequestError('Project document id must match the route project id');
      }
      const result = await repository().saveProjectRevision(
        request.actorUserId,
        request.params.id,
        {
          ...request.body,
          projectDocument,
          schemaVersion: projectDocument.schemaVersion,
        },
      );
      return reply.code(201).send(result);
    },
  );
};
