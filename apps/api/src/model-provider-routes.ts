import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type { HotelCutRepository, StoredModelProviderSettings } from '@hotelcut/domain';
import {
  aiEditPlanInputSchema,
  aiEditPlanSchema,
  errorResponseSchema,
  hotelIdParamsSchema,
  modelProviderConnectionResultSchema,
  modelProviderSettingsSchema,
  upsertModelProviderSettingsSchema,
  type ModelProviderSettings,
} from '@hotelcut/schemas';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { projectTemplates } from './project-generation.js';

type ProviderFetch = typeof fetch;

interface ModelProviderRouteOptions {
  configSecret: string;
  fetchProvider?: ProviderFetch | undefined;
  repository?: HotelCutRepository | undefined;
}

const defaultProviderSettings = {
  apiMode: 'responses' as const,
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  model: 'gpt-5.6',
  provider: 'openai' as const,
  reasoningEffort: 'medium' as const,
};

const editPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'recommendedTemplateKey',
    'hook',
    'narrative',
    'shotStrategy',
    'subtitleStyle',
    'cta',
    'risks',
  ],
  properties: {
    recommendedTemplateKey: { type: 'string' },
    hook: { type: 'string' },
    narrative: { type: 'string' },
    shotStrategy: {
      type: 'array',
      minItems: 2,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sequence', 'purpose', 'visual', 'seconds'],
        properties: {
          sequence: { type: 'integer', minimum: 1 },
          purpose: { type: 'string' },
          visual: { type: 'string' },
          seconds: { type: 'integer', minimum: 1, maximum: 60 },
        },
      },
    },
    subtitleStyle: { type: 'string' },
    cta: { type: 'string' },
    risks: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
} as const;

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptModelApiKey(apiKey: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptModelApiKey(value: string, secret: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('MODEL_API_KEY_FORMAT_INVALID');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secret),
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function apiKeyHint(apiKey: string): string {
  return apiKey.length <= 8 ? '••••••••' : `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
}

function publicSettings(
  hotelId: string,
  stored: StoredModelProviderSettings | null,
): ModelProviderSettings {
  if (!stored) {
    return modelProviderSettingsSchema.parse({
      hotelId,
      ...defaultProviderSettings,
      apiKeyConfigured: false,
      apiKeyHint: null,
      createdAt: null,
      updatedAt: null,
    });
  }
  return modelProviderSettingsSchema.parse({
    hotelId: stored.hotelId,
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    apiMode: stored.apiMode,
    model: stored.model,
    reasoningEffort: stored.reasoningEffort,
    enabled: stored.enabled,
    apiKeyConfigured: Boolean(stored.encryptedApiKey),
    apiKeyHint: stored.apiKeyHint,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  });
}

function providerEndpoint(settings: StoredModelProviderSettings): string {
  const base = settings.baseUrl.replace(/\/+$/, '');
  return settings.apiMode === 'responses' ? `${base}/responses` : `${base}/chat/completions`;
}

function providerErrorMessage(value: unknown, apiKey: string): string {
  const raw =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : '模型服务返回了未知错误';
  return raw
    .replaceAll(apiKey, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .slice(0, 400);
}

function responseOutputText(
  payload: unknown,
  apiMode: StoredModelProviderSettings['apiMode'],
): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  if (apiMode === 'responses') {
    if (typeof record['output_text'] === 'string') {
      return record['output_text'];
    }
    const output = Array.isArray(record['output']) ? record['output'] : [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = Array.isArray((item as Record<string, unknown>)['content'])
        ? ((item as Record<string, unknown>)['content'] as unknown[])
        : [];
      for (const part of content) {
        if (part && typeof part === 'object') {
          const text = (part as Record<string, unknown>)['text'];
          if (typeof text === 'string') return text;
        }
      }
    }
    return '';
  }
  const choices: unknown[] = Array.isArray(record['choices'])
    ? (record['choices'] as unknown[])
    : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as Record<string, unknown>)['message'];
  if (!message || typeof message !== 'object') return '';
  return typeof (message as Record<string, unknown>)['content'] === 'string'
    ? ((message as Record<string, unknown>)['content'] as string)
    : '';
}

function responseModel(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const model = (payload as Record<string, unknown>)['model'];
  return typeof model === 'string' && model ? model : fallback;
}

async function callProvider(
  settings: StoredModelProviderSettings,
  apiKey: string,
  body: Record<string, unknown>,
  fetchProvider: ProviderFetch,
): Promise<{ payload: unknown; latencyMs: number }> {
  const startedAt = Date.now();
  const response = await fetchProvider(providerEndpoint(settings), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const latencyMs = Date.now() - startedAt;
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nested = record['error'];
    const message =
      nested && typeof nested === 'object'
        ? (nested as Record<string, unknown>)['message']
        : (record['message'] ?? payload);
    throw new Error(`HTTP ${response.status}: ${providerErrorMessage(message, apiKey)}`);
  }
  return { payload, latencyMs };
}

function connectionBody(settings: StoredModelProviderSettings): Record<string, unknown> {
  if (settings.apiMode === 'responses') {
    return {
      model: settings.model,
      input: 'Reply with exactly HOTELCUT_OK.',
      max_output_tokens: 128,
      reasoning: { effort: settings.reasoningEffort },
      store: false,
    };
  }
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [{ role: 'user', content: 'Reply with exactly HOTELCUT_OK.' }],
    max_tokens: 24,
    temperature: 0,
  };
  if (settings.provider === 'aliyun-bailian') {
    body['enable_thinking'] = false;
  }
  return body;
}

function planBody(settings: StoredModelProviderSettings, input: string): Record<string, unknown> {
  const instructions =
    '你是酒店竖屏短视频剪辑策划。仅使用输入中已确认的事实，不编造价格、地址、联系方式或权益。输出必须匹配给定 JSON Schema。CTA 只能原样使用输入的已确认 CTA；没有 CTA 时返回空字符串。';
  if (settings.apiMode === 'responses') {
    return {
      model: settings.model,
      instructions,
      input,
      max_output_tokens: 4_000,
      reasoning: { effort: settings.reasoningEffort },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'hotelcut_edit_plan',
          strict: true,
          schema: editPlanJsonSchema,
        },
      },
    };
  }
  if (settings.provider === 'aliyun-bailian') {
    return {
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: `${instructions}\n仅返回合法 JSON，不要使用 Markdown。JSON 必须匹配此 Schema：${JSON.stringify(editPlanJsonSchema)}`,
        },
        { role: 'user', content: input },
      ],
      temperature: 0.2,
      enable_thinking: false,
      response_format: { type: 'json_object' },
    };
  }
  return {
    model: settings.model,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: input },
    ],
    max_tokens: 4_000,
    temperature: 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'hotelcut_edit_plan',
        strict: true,
        schema: editPlanJsonSchema,
      },
    },
  };
}

function assetSummary(metadata: Record<string, unknown>) {
  const vision =
    metadata['vision'] && typeof metadata['vision'] === 'object'
      ? (metadata['vision'] as Record<string, unknown>)
      : {};
  return {
    summary: typeof vision['summary'] === 'string' ? vision['summary'] : null,
    tags: Array.isArray(vision['tags']) ? vision['tags'].slice(0, 12) : [],
    sellingPoints: Array.isArray(vision['sellingPoints'])
      ? vision['sellingPoints'].slice(0, 8)
      : [],
  };
}

export const modelProviderRoutes: FastifyPluginCallback<ModelProviderRouteOptions> = (
  fastify,
  options,
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const repository = (): HotelCutRepository => {
    if (!options.repository) throw new Error('HotelCut repository is not configured');
    return options.repository;
  };
  const fetchProvider = options.fetchProvider ?? fetch;

  app.get(
    '/v1/hotels/:hotelId/model-provider',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: { 200: modelProviderSettingsSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Read redacted model provider settings',
        tags: ['model-provider'],
      },
    },
    async (request) =>
      publicSettings(
        request.params.hotelId,
        await repository().getModelProviderSettings(request.actorUserId, request.params.hotelId),
      ),
  );

  app.put(
    '/v1/hotels/:hotelId/model-provider',
    {
      schema: {
        body: upsertModelProviderSettingsSchema,
        params: hotelIdParamsSchema,
        response: {
          200: modelProviderSettingsSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Save encrypted model provider settings',
        tags: ['model-provider'],
      },
    },
    async (request) => {
      const store = repository();
      const existing = await store.getModelProviderSettings(
        request.actorUserId,
        request.params.hotelId,
      );
      const apiKey = request.body.apiKey?.trim();
      const stored = await store.upsertModelProviderSettings(
        request.actorUserId,
        request.params.hotelId,
        {
          provider: request.body.provider,
          baseUrl: request.body.baseUrl.replace(/\/+$/, ''),
          apiMode: request.body.apiMode,
          model: request.body.model,
          reasoningEffort: request.body.reasoningEffort,
          enabled: request.body.enabled,
          encryptedApiKey: apiKey
            ? encryptModelApiKey(apiKey, options.configSecret)
            : (existing?.encryptedApiKey ?? null),
          apiKeyHint: apiKey ? apiKeyHint(apiKey) : (existing?.apiKeyHint ?? null),
        },
      );
      return publicSettings(request.params.hotelId, stored);
    },
  );

  app.post(
    '/v1/hotels/:hotelId/model-provider/test',
    {
      schema: {
        params: hotelIdParamsSchema,
        response: { 200: modelProviderConnectionResultSchema, 404: errorResponseSchema },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Run a billable model connectivity test',
        tags: ['model-provider'],
      },
    },
    async (request) => {
      const settings = await repository().getModelProviderSettings(
        request.actorUserId,
        request.params.hotelId,
      );
      if (!settings?.enabled || !settings.encryptedApiKey) {
        return {
          ok: false,
          model: settings?.model ?? defaultProviderSettings.model,
          latencyMs: 0,
          message: '请先启用模型服务并保存 API Key。',
        };
      }
      const apiKey = decryptModelApiKey(settings.encryptedApiKey, options.configSecret);
      try {
        const result = await callProvider(
          settings,
          apiKey,
          connectionBody(settings),
          fetchProvider,
        );
        const output = responseOutputText(result.payload, settings.apiMode).trim();
        return {
          ok: Boolean(output),
          model: responseModel(result.payload, settings.model),
          latencyMs: result.latencyMs,
          message: output
            ? '模型连接成功，已完成一次最小真实请求。'
            : '模型接口可访问，但没有返回可识别的文本。',
        };
      } catch (error) {
        return {
          ok: false,
          model: settings.model,
          latencyMs: 0,
          message: providerErrorMessage(error, apiKey),
        };
      }
    },
  );

  app.post(
    '/v1/hotels/:hotelId/ai/edit-plan',
    {
      schema: {
        body: aiEditPlanInputSchema,
        params: hotelIdParamsSchema,
        response: {
          200: aiEditPlanSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
        security: [{ sessionCookie: [] }, { developmentUser: [] }],
        summary: 'Generate a structured AI edit plan from verified hotel inputs',
        tags: ['model-provider'],
      },
    },
    async (request, reply) => {
      const store = repository();
      const settings = await store.getModelProviderSettings(
        request.actorUserId,
        request.params.hotelId,
      );
      if (!settings?.enabled || !settings.encryptedApiKey) {
        return reply.code(409).send({
          code: 'MODEL_PROVIDER_NOT_CONFIGURED',
          message: '请先在“设置”中保存并启用大模型 API。',
          requestId: request.id,
        });
      }
      const [hotel, assets] = await Promise.all([
        store.getHotel(request.actorUserId, request.params.hotelId),
        store.listAssets(request.actorUserId, request.params.hotelId),
      ]);
      const modelInput = JSON.stringify({
        hotel: { name: hotel.name, city: hotel.city },
        brief: request.body,
        availableTemplates: projectTemplates,
        readyAssets: assets
          .filter((asset) => asset.status === 'ready')
          .slice(0, 30)
          .map((asset) => ({
            id: asset.id,
            filename: asset.originalFilename,
            kind: asset.kind,
            ...assetSummary(asset.metadata),
          })),
      });
      const apiKey = decryptModelApiKey(settings.encryptedApiKey, options.configSecret);
      try {
        const result = await callProvider(
          settings,
          apiKey,
          planBody(settings, modelInput),
          fetchProvider,
        );
        const plan = aiEditPlanSchema.parse(
          JSON.parse(responseOutputText(result.payload, settings.apiMode)),
        );
        if (!projectTemplates.some((template) => template.key === plan.recommendedTemplateKey)) {
          throw new Error('模型返回了当前系统不支持的模板。');
        }
        return plan;
      } catch (error) {
        return reply.code(502).send({
          code: 'MODEL_PROVIDER_REQUEST_FAILED',
          message: providerErrorMessage(error, apiKey),
          requestId: request.id,
        });
      }
    },
  );
};
