import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  HotelCutRepository,
  PersistModelProviderSettingsInput,
  StoredModelProviderSettings,
} from '@hotelcut/domain';

import { buildApp } from './app.js';
import { decryptModelApiKey } from './model-provider-routes.js';

const actorUserId = '20000000-0000-4000-8000-000000000001';
const hotelId = '30000000-0000-4000-8000-000000000001';
const configSecret = 'hotelcut-test-model-secret';
const apiKey = 'sk-hotelcut-test-key-123456789';
const apps: FastifyInstance[] = [];

function requestBodyText(body: RequestInit['body']): string {
  if (typeof body !== 'string') {
    throw new Error('Expected a JSON string request body');
  }
  return body;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

function createRepository() {
  let settings: StoredModelProviderSettings | null = null;
  const getModelProviderSettings = vi.fn(() => Promise.resolve(settings));
  const upsertModelProviderSettings = vi.fn(
    (_actorUserId: string, scopedHotelId: string, input: PersistModelProviderSettingsInput) => {
      settings = {
        ...input,
        createdAt: '2026-08-04T08:00:00.000Z',
        hotelId: scopedHotelId,
        id: '90000000-0000-4000-8000-000000000001',
        updatedAt: '2026-08-04T08:00:00.000Z',
      };
      return Promise.resolve(settings);
    },
  );
  const repository = {
    getHotel: vi.fn(() => Promise.resolve({ name: '西湖酒店', city: '杭州' })),
    getModelProviderSettings,
    listAssets: vi.fn(() => Promise.resolve([])),
    upsertModelProviderSettings,
  } as unknown as HotelCutRepository;
  return { getModelProviderSettings, repository, upsertModelProviderSettings };
}

describe('model provider routes', () => {
  it('encrypts API keys at rest and only returns redacted settings', async () => {
    const { repository, upsertModelProviderSettings } = createRepository();
    const app = await buildApp({
      allowDevelopmentIdentity: false,
      guestUserId: actorUserId,
      modelApiConfigSecret: configSecret,
      repository,
    });
    apps.push(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotelId}/model-provider`,
      payload: {
        apiKey,
        apiMode: 'responses',
        baseUrl: 'https://api.openai.com/v1/',
        enabled: true,
        model: 'gpt-5.6',
        provider: 'openai',
        reasoningEffort: 'medium',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(apiKey);
    expect(response.json()).toMatchObject({
      apiKeyConfigured: true,
      apiKeyHint: 'sk-••••6789',
      baseUrl: 'https://api.openai.com/v1',
      hotelId,
      model: 'gpt-5.6',
    });
    const persisted = upsertModelProviderSettings.mock.calls[0]?.[2];
    expect(persisted?.encryptedApiKey).not.toBe(apiKey);
    expect(decryptModelApiKey(persisted!.encryptedApiKey!, configSecret)).toBe(apiKey);
  });

  it('runs a real provider-shaped connectivity call and returns a structured edit plan', async () => {
    const { repository } = createRepository();
    const plan = {
      cta: '立即预订',
      hook: '住进西湖边，把风景留在窗前。',
      narrative: '先以窗景吸引注意，再展示真实客房与服务细节。',
      recommendedTemplateKey: 'hotel.host-broll',
      risks: ['避免出现未经确认的房价'],
      shotStrategy: [
        { purpose: '抓住注意力', seconds: 3, sequence: 1, visual: '西湖窗景' },
        { purpose: '建立信任', seconds: 9, sequence: 2, visual: '客房和服务细节' },
      ],
      subtitleStyle: '白色高对比字幕，关键词使用品牌强调色',
    };
    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ model: 'gpt-5.6-sol', output_text: 'HOTELCUT_OK' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ model: 'gpt-5.6-sol', output_text: JSON.stringify(plan) }), {
          status: 200,
        }),
      );
    const app = await buildApp({
      allowDevelopmentIdentity: false,
      guestUserId: actorUserId,
      modelApiConfigSecret: configSecret,
      modelProviderFetch: providerFetch,
      repository,
    });
    apps.push(app);
    await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotelId}/model-provider`,
      payload: {
        apiKey,
        apiMode: 'responses',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        model: 'gpt-5.6',
        provider: 'openai',
        reasoningEffort: 'medium',
      },
    });

    const connection = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/model-provider/test`,
    });
    const editPlan = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/ai/edit-plan`,
      payload: {
        callToAction: '立即预订',
        durationSeconds: 25,
        objective: '展示真实入住体验',
        platform: 'douyin',
        targetAudience: '周末亲子游客',
        title: '西湖亲子房推广',
        tone: '可信、轻快',
      },
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({ ok: true, model: 'gpt-5.6-sol' });
    expect(editPlan.statusCode).toBe(200);
    expect(editPlan.json()).toEqual(plan);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    const [connectionUrl, connectionInit] = providerFetch.mock.calls[0]!;
    expect(connectionUrl).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(connectionInit?.headers).get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(JSON.parse(requestBodyText(connectionInit?.body)) as unknown).toMatchObject({
      input: 'Reply with exactly HOTELCUT_OK.',
      model: 'gpt-5.6',
      store: false,
    });
    const planBody = JSON.parse(requestBodyText(providerFetch.mock.calls[1]![1]?.body)) as unknown;
    expect(planBody).toMatchObject({
      text: {
        format: {
          name: 'hotelcut_edit_plan',
          strict: true,
          type: 'json_schema',
        },
      },
    });
  });
});
