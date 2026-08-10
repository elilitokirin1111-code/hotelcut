import type { FastifyPluginCallback } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { HotelCutRepository } from '@hotelcut/domain';
import {
  createCreativeFeedbackEventSchema,
  creativeFeedbackEventSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
} from '@hotelcut/schemas';

interface FeedbackRouteOptions {
  repository?: HotelCutRepository;
}

export const feedbackRoutes: FastifyPluginCallback<FeedbackRouteOptions> = (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) throw new Error('HotelCut repository is not configured');
    return options.repository;
  };

  app.post(
    '/v1/hotels/:hotelId/creative-feedback-events',
    {
      schema: {
        body: createCreativeFeedbackEventSchema,
        params: hotelIdParamsSchema,
        response: { 201: creativeFeedbackEventSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Record one tenant-scoped AI creative feedback event',
        tags: ['ai-director', 'feedback'],
      },
    },
    async (request, reply) => {
      const event = await repository().createCreativeFeedbackEvent(
        request.actorUserId,
        request.params.hotelId,
        request.body,
      );
      return reply.code(201).send(event);
    },
  );

  app.get(
    '/v1/hotels/:hotelId/creative-feedback-events',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: { 200: z.array(creativeFeedbackEventSchema), 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'List feedback signals for prompt and strategy optimization',
        tags: ['ai-director', 'feedback'],
      },
    },
    async (request) =>
      repository().listCreativeFeedbackEvents(request.actorUserId, request.params.hotelId),
  );
};
