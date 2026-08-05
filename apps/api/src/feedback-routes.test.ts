import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HotelCutRepository } from '@hotelcut/domain';
import type { CreativeFeedbackEvent } from '@hotelcut/schemas';

import { buildApp } from './app.js';

const actorUserId = '20000000-0000-4000-8000-000000000001';
const hotelId = '30000000-0000-4000-8000-000000000001';
const creativeProjectId = '91000000-0000-4000-8000-000000000001';
const scriptId = '93000000-0000-4000-8000-000000000001';
const apps: FastifyInstance[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('AI creative feedback routes', () => {
  it('records and lists tenant-scoped optimization signals', async () => {
    const events: CreativeFeedbackEvent[] = [];
    const createCreativeFeedbackEvent = vi.fn<HotelCutRepository['createCreativeFeedbackEvent']>(
      (actor, requestedHotelId, input) => {
        const event: CreativeFeedbackEvent = {
          id: '99000000-0000-4000-8000-000000000001',
          hotelId: requestedHotelId,
          actorUserId: actor,
          eventType: input.eventType,
          creativeProjectId: input.creativeProjectId ?? null,
          videoProjectId: input.videoProjectId ?? null,
          subjectId: input.subjectId ?? null,
          metadata: input.metadata ?? {},
          createdAt: '2026-08-05T08:00:00.000Z',
        };
        events.push(event);
        return Promise.resolve(event);
      },
    );
    const repository = {
      createCreativeFeedbackEvent,
      listCreativeFeedbackEvents: vi.fn(() => Promise.resolve(events)),
    } as unknown as HotelCutRepository;
    const app = await buildApp({ repository });
    apps.push(app);

    const created = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'POST',
      payload: {
        eventType: 'script_selected',
        creativeProjectId,
        subjectId: scriptId,
        metadata: { revision: 2 },
      },
      url: `/v1/hotels/${hotelId}/creative-feedback-events`,
    });
    const listed = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'GET',
      url: `/v1/hotels/${hotelId}/creative-feedback-events`,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ eventType: 'script_selected', subjectId: scriptId });
    expect(listed.json()).toHaveLength(1);
    expect(createCreativeFeedbackEvent).toHaveBeenCalledWith(
      actorUserId,
      hotelId,
      expect.objectContaining({ creativeProjectId, eventType: 'script_selected' }),
    );
  });
});
