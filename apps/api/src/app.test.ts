import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('API health routes', () => {
  it('reports liveness', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'hotelcut-api',
      status: 'ok',
    });
  });

  it('reports readiness', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready' });
  });

  it('publishes the M2 OpenAPI document and UI', async () => {
    const app = await buildApp();
    apps.push(app);

    const documentResponse = await app.inject({ method: 'GET', url: '/docs/json' });
    const uiResponse = await app.inject({ method: 'GET', url: '/docs/' });
    const document = documentResponse.json<{
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    }>();

    expect(documentResponse.statusCode).toBe(200);
    expect(document).toMatchObject({
      info: { title: 'HotelCut API', version: '0.1.0' },
    });
    expect(document.paths).toHaveProperty('/v1/hotels');
    expect(document.paths).toHaveProperty('/v1/hotels/{hotelId}/assets/uploads');
    expect(document.paths).toHaveProperty('/v1/assets/{assetId}');
    expect(document.paths).toHaveProperty('/v1/assets/{assetId}/analysis/retry');
    expect(uiResponse.statusCode).toBe(200);
  });
});
