import { expect, test } from '@playwright/test';

import { demoProject } from '../../apps/web/src/editor/demo-data';

const session = {
  user: {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'owner@hotelcut.example',
    displayName: '演示管理员',
    status: 'active',
  },
  expiresAt: '2026-08-04T08:00:00.000Z',
};

test('runs the guest workbench, model setup and asset-production workflow', async ({ page }) => {
  const browserErrors: string[] = [];
  let hotel = {
    id: '30000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    name: '云栖湖畔酒店（虚构）',
    city: '杭州',
    address: '示例路 88 号',
    timezone: 'Asia/Shanghai',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  };
  let brandKit = {
    id: '40000000-0000-4000-8000-000000000001',
    hotelId: hotel.id,
    primaryColor: '#17324D',
    secondaryColor: '#F5EFE6',
    accentColor: '#C99A5B',
    fontFamily: 'Noto Sans SC',
    subtitleStyle: 'clean',
    endingText: '在湖畔，住进一段慢时光',
    contactText: '400-000-0000（演示）',
    logoAssetId: null,
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  };
  const assets = [
    {
      id: '70000000-0000-4000-8000-000000000001',
      hotelId: hotel.id,
      kind: 'video',
      status: 'ready',
      originalFilename: '湖景房介绍.mp4',
      contentType: 'video/mp4',
      byteSize: 8_388_608,
      storageBucket: 'hotelcut-local',
      storageKey: 'hotels/demo/assets/ready/original',
      checksumSha256: 'a'.repeat(64),
      metadata: { durationMs: 30_000, frameRate: 30, height: 1920, width: 1080 },
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:05:00.000Z',
    },
    {
      id: '70000000-0000-4000-8000-000000000002',
      hotelId: hotel.id,
      kind: 'video',
      status: 'failed',
      originalFilename: '大堂口播.mp4',
      contentType: 'video/mp4',
      byteSize: 4_194_304,
      storageBucket: 'hotelcut-local',
      storageKey: 'hotels/demo/assets/failed/original',
      checksumSha256: 'b'.repeat(64),
      metadata: {},
      createdAt: '2026-07-28T08:10:00.000Z',
      updatedAt: '2026-07-28T08:15:00.000Z',
    },
  ];
  let createdTag: Record<string, unknown> | null = null;
  let createdBrief: Record<string, unknown> | null = null;
  let generationRequest: Record<string, unknown> | null = null;
  let savedRevisionRequest: Record<string, unknown> | null = null;
  let renderCreated = false;
  let renderDetailPolls = 0;
  let artifactDownloadRequested = false;
  let analysisRetried = false;
  let uploadCompleted = false;
  let modelConnectionTested = false;
  let aiPlanRequested = false;
  let modelSettings = {
    apiKeyConfigured: false,
    apiKeyHint: null as string | null,
    apiMode: 'responses',
    baseUrl: 'https://api.openai.com/v1',
    createdAt: null as string | null,
    enabled: true,
    hotelId: hotel.id,
    model: 'gpt-5.6',
    provider: 'openai',
    reasoningEffort: 'medium',
    updatedAt: null as string | null,
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.route('**/api/v1/auth/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({ status: 200, json: session });
  });
  await page.route('**/api/v1/organizations', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: '云栖酒店集团（演示）',
          slug: 'cloud-rest-demo',
          createdAt: '2026-07-28T08:00:00.000Z',
          updatedAt: '2026-07-28T08:00:00.000Z',
        },
      ],
    });
  });
  await page.route('**/api/v1/hotels/*/brand-kit', async (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      brandKit = {
        ...brandKit,
        ...input,
        updatedAt: '2026-07-29T08:00:00.000Z',
      };
    }
    await route.fulfill({ status: 200, json: brandKit });
  });
  await page.route('**/api/v1/hotels/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      hotel = {
        ...hotel,
        ...input,
        updatedAt: '2026-07-29T08:00:00.000Z',
      };
    }
    await route.fulfill({ status: 200, json: hotel });
  });
  await page.route('**/api/v1/hotels/*/assets', async (route) => {
    await route.fulfill({ status: 200, json: assets });
  });
  await page.route('**/api/v1/hotels/*/assets/uploads', async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        asset: {
          id: '70000000-0000-4000-8000-000000000003',
          hotelId: hotel.id,
          kind: input.kind,
          status: 'registered',
          originalFilename: input.originalFilename,
          contentType: input.contentType,
          byteSize: input.byteSize,
          storageBucket: 'hotelcut-local',
          storageKey: 'hotels/demo/assets/uploaded/original',
          checksumSha256: input.checksumSha256,
          metadata: {},
          createdAt: '2026-07-29T08:00:00.000Z',
          updatedAt: '2026-07-29T08:00:00.000Z',
        },
        upload: {
          id: '74000000-0000-4000-8000-000000000001',
          assetId: '70000000-0000-4000-8000-000000000003',
          providerUploadId: 'provider-upload-1',
          partSize: 8 * 1024 * 1024,
          partCount: 1,
          status: 'initiated',
          expiresAt: '2026-07-29T08:15:00.000Z',
          completedAt: null,
          createdAt: '2026-07-29T08:00:00.000Z',
          updatedAt: '2026-07-29T08:00:00.000Z',
        },
        parts: [
          {
            partNumber: 1,
            url: 'https://uploads.test/part-1',
            expiresAt: '2026-07-29T08:15:00.000Z',
          },
        ],
      },
    });
  });
  await page.route('https://uploads.test/part-1', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'ETag',
        ETag: '"etag-1"',
      },
    });
  });
  await page.route('https://media.test/thumbnail.jpg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
    });
  });
  await page.route('**/api/v1/assets/**', async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const assetId = parts[parts.indexOf('assets') + 1]!;
    const asset = assets.find((candidate) => candidate.id === assetId) ?? assets[0]!;
    if (url.pathname.endsWith('/derivatives/thumbnail/download')) {
      await route.fulfill({
        status: 200,
        json: { expiresInSeconds: 900, url: 'https://media.test/thumbnail.jpg' },
      });
      return;
    }
    if (url.pathname.endsWith('/analysis/retry')) {
      analysisRetried = true;
      await route.fulfill({
        status: 202,
        json: {
          analysisJobId: '72000000-0000-4000-8000-000000000004',
          assetId,
          status: 'queued',
        },
      });
      return;
    }
    if (url.pathname.endsWith('/segments')) {
      createdTag = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          id: '73000000-0000-4000-8000-000000000001',
          assetId,
          ...createdTag,
          kind: 'manual',
          source: 'manual',
          createdByUserId: session.user.id,
          createdAt: '2026-07-29T08:00:00.000Z',
          updatedAt: '2026-07-29T08:00:00.000Z',
        },
      });
      return;
    }
    if (url.pathname.endsWith('/uploads/complete')) {
      uploadCompleted = true;
      await route.fulfill({
        status: 202,
        json: {
          analysisJobId: '72000000-0000-4000-8000-000000000003',
          assetId: '70000000-0000-4000-8000-000000000003',
          status: 'queued',
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      json: {
        ...asset,
        derivatives:
          asset.status === 'ready'
            ? [
                {
                  id: '71000000-0000-4000-8000-000000000001',
                  assetId,
                  kind: 'thumbnail',
                  storageBucket: 'hotelcut-local',
                  storageKey: `${asset.storageKey}/thumbnail`,
                  contentType: 'image/jpeg',
                  byteSize: 512,
                  checksumSha256: 'c'.repeat(64),
                  createdAt: asset.createdAt,
                  updatedAt: asset.updatedAt,
                },
              ]
            : [],
        segments: [],
        analysisJobs: [
          {
            id: '72000000-0000-4000-8000-000000000001',
            assetId,
            status: asset.status === 'ready' ? 'succeeded' : 'failed',
            attempt: 1,
            maxAttempts: 3,
            logs: [
              {
                at: '2026-07-28T08:05:00.000Z',
                level: asset.status === 'ready' ? 'info' : 'error',
                message: asset.status === 'ready' ? '分析完成' : '无法读取视频',
              },
            ],
            errorCode: asset.status === 'failed' ? 'PROBE_FAILED' : null,
            errorMessage: asset.status === 'failed' ? '无法读取视频' : null,
            startedAt: '2026-07-28T08:01:00.000Z',
            finishedAt: '2026-07-28T08:05:00.000Z',
            createdAt: '2026-07-28T08:00:30.000Z',
            updatedAt: '2026-07-28T08:05:00.000Z',
          },
        ],
      },
    });
  });
  const projectId = '60000000-0000-4000-8000-000000000001';
  const briefId = '50000000-0000-4000-8000-000000000001';
  const generatedProjectDocument = {
    ...demoProject,
    hotelId: hotel.id,
    id: projectId,
    name: '湖畔周末礼遇',
  };
  const videoProject = {
    id: projectId,
    hotelId: hotel.id,
    videoBriefId: briefId,
    name: '湖畔周末礼遇',
    templateKey: 'hotel.promotion',
    status: 'draft',
    currentRevision: 1,
    createdAt: '2026-07-30T02:00:00.000Z',
    updatedAt: '2026-07-30T02:00:00.000Z',
  };
  const videoProjectDetail = {
    project: videoProject,
    currentRevision: {
      id: '61000000-0000-4000-8000-000000000001',
      videoProjectId: projectId,
      revision: 1,
      schemaVersion: '1.0.0',
      projectDocument: generatedProjectDocument,
      createdByUserId: session.user.id,
      createdAt: '2026-07-30T02:00:00.000Z',
    },
  };
  await page.route('**/api/v1/video-project-templates', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          key: 'hotel.host-broll',
          version: '1.0.0',
          name: '真人口播与环境穿插',
          description: '真人讲解为主线，自动穿插大堂、客房和服务画面。',
          minDurationSeconds: 30,
          maxDurationSeconds: 60,
          requiredTags: ['booking', 'lobby', 'room', 'welcome'],
        },
        {
          key: 'hotel.promotion',
          version: '1.0.0',
          name: '酒店活动推广',
          description: '聚焦酒店、服务和活动权益。',
          minDurationSeconds: 15,
          maxDurationSeconds: 25,
          requiredTags: ['exterior', 'promotion', 'room', 'service'],
        },
      ],
    });
  });
  await page.route('**/api/v1/hotels/*/video-projects', async (route) => {
    await route.fulfill({
      status: 200,
      json: generationRequest ? [videoProject] : [],
    });
  });
  await page.route('**/api/v1/hotels/*/video-briefs', async (route) => {
    createdBrief = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        id: briefId,
        hotelId: hotel.id,
        ...createdBrief,
        createdAt: '2026-07-30T02:00:00.000Z',
        updatedAt: '2026-07-30T02:00:00.000Z',
      },
    });
  });
  await page.route('**/api/v1/hotels/*/video-projects/generate', async (route) => {
    generationRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: {
        detail: videoProjectDetail,
        generation: {
          templateKey: 'hotel.promotion',
          templateVersion: '1.0.0',
          seed: 20260730,
          totalSlots: 4,
          selectedSlots: 4,
          usedAssetIds: [assets[0]!.id],
          warnings: [],
        },
      },
    });
  });
  await page.route('**/api/v1/video-projects/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/revisions') && route.request().method() === 'POST') {
      savedRevisionRequest = route.request().postDataJSON() as Record<string, unknown>;
      const baseRevision = Number(savedRevisionRequest['baseRevision']);
      videoProject.currentRevision = baseRevision + 1;
      videoProjectDetail.currentRevision = {
        ...videoProjectDetail.currentRevision,
        id: '61000000-0000-4000-8000-000000000002',
        projectDocument: savedRevisionRequest['projectDocument'] as typeof generatedProjectDocument,
        revision: baseRevision + 1,
        createdAt: '2026-07-30T02:05:00.000Z',
      };
      await route.fulfill({ status: 201, json: videoProjectDetail });
      return;
    }
    await route.fulfill({ status: 200, json: videoProjectDetail });
  });
  const renderJobId = '80000000-0000-4000-8000-000000000001';
  const artifactId = '81000000-0000-4000-8000-000000000001';
  const renderJob = {
    id: renderJobId,
    videoProjectId: projectId,
    projectRevisionId: '61000000-0000-4000-8000-000000000002',
    requestedByUserId: session.user.id,
    status: 'queued',
    attempt: 0,
    maxAttempts: 3,
    progressBasisPoints: 0,
    inputHash: 'd'.repeat(64),
    logs: [],
    cancelRequestedAt: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-07-30T04:00:00.000Z',
    updatedAt: '2026-07-30T04:00:00.000Z',
  };
  const completedRenderJob = {
    ...renderJob,
    status: 'succeeded',
    progressBasisPoints: 10_000,
    logs: [
      {
        timestamp: '2026-07-30T04:00:30.000Z',
        level: 'info',
        stage: 'validating',
        message: 'Quality control completed',
        details: {},
      },
    ],
    startedAt: '2026-07-30T04:00:01.000Z',
    finishedAt: '2026-07-30T04:00:30.000Z',
    updatedAt: '2026-07-30T04:00:30.000Z',
  };
  const renderArtifact = {
    id: artifactId,
    renderJobId,
    kind: 'video',
    storageBucket: 'hotelcut-local',
    storageKey: `renders/${renderJobId}/video.mp4`,
    contentType: 'video/mp4',
    byteSize: 12_345,
    checksumSha256: 'e'.repeat(64),
    createdAt: '2026-07-30T04:00:30.000Z',
  };
  await page.route('**/api/v1/video-projects/*/render-jobs', async (route) => {
    if (route.request().method() === 'POST') {
      renderCreated = true;
      await route.fulfill({ status: 201, json: renderJob });
      return;
    }
    await route.fulfill({ status: 200, json: renderCreated ? [renderJob] : [] });
  });
  await page.route('**/api/v1/render-jobs/*', async (route) => {
    renderDetailPolls += 1;
    const completed = renderDetailPolls >= 2;
    await route.fulfill({
      status: 200,
      json: {
        job: completed
          ? completedRenderJob
          : { ...renderJob, status: 'rendering', progressBasisPoints: 6_500 },
        artifacts: completed ? [renderArtifact] : [],
        qualityReport: completed
          ? {
              id: '82000000-0000-4000-8000-000000000001',
              renderJobId,
              status: 'passed',
              scoreBasisPoints: 10_000,
              details: {
                summary: { passed: 11, warnings: 0, failed: 0 },
                checks: [
                  {
                    name: 'video_duration',
                    status: 'passed',
                    message: 'Rendered duration matches the project',
                  },
                ],
              },
              createdAt: '2026-07-30T04:00:30.000Z',
            }
          : null,
      },
    });
  });
  await page.route('**/api/v1/render-artifacts/*/download', async (route) => {
    artifactDownloadRequested = true;
    await route.fulfill({
      status: 200,
      json: {
        artifact: renderArtifact,
        downloadUrl: 'https://downloads.test/video.mp4?ttl=900',
        expiresAt: '2026-07-30T04:15:00.000Z',
      },
    });
  });
  await page.route('**/api/v1/hotels', async (route) => {
    await route.fulfill({
      status: 200,
      json: [hotel],
    });
  });
  await page.route('**/api/v1/hotels/*/model-provider', async (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      modelSettings = {
        ...modelSettings,
        apiKeyConfigured: Boolean(input['apiKey']) || modelSettings.apiKeyConfigured,
        apiKeyHint: input['apiKey'] ? 'sk-••••6789' : modelSettings.apiKeyHint,
        apiMode: String(input['apiMode']),
        baseUrl: String(input['baseUrl']),
        enabled: Boolean(input['enabled']),
        model: String(input['model']),
        provider: String(input['provider']),
        reasoningEffort: String(input['reasoningEffort']),
        createdAt: '2026-08-04T08:00:00.000Z',
        updatedAt: '2026-08-04T08:00:00.000Z',
      };
    }
    await route.fulfill({ status: 200, json: modelSettings });
  });
  await page.route('**/api/v1/hotels/*/model-provider/test', async (route) => {
    modelConnectionTested = true;
    await route.fulfill({
      status: 200,
      json: {
        latencyMs: 118,
        message: '模型连接成功，已完成一次最小真实请求。',
        model: 'qwen3.7-plus',
        ok: true,
      },
    });
  });
  await page.route('**/api/v1/hotels/*/ai/edit-plan', async (route) => {
    aiPlanRequested = true;
    await route.fulfill({
      status: 200,
      json: {
        cta: '联系酒店',
        hook: '住进湖畔，把周末慢下来。',
        narrative: '先以湖景吸引注意，再展示真实客房与服务细节。',
        recommendedTemplateKey: 'hotel.promotion',
        risks: ['避免出现未经确认的房价'],
        shotStrategy: [
          { purpose: '抓住注意力', seconds: 3, sequence: 1, visual: '湖景开场' },
          { purpose: '建立信任', seconds: 9, sequence: 2, visual: '客房与服务细节' },
        ],
        subtitleStyle: '白色高对比字幕，关键词使用品牌强调色',
      },
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '云栖湖畔酒店（虚构）' })).toBeVisible();
  await expect(page.getByLabel('酒店工作空间模块')).toBeVisible();
  await expect(page.getByRole('heading', { name: '下午好，今天继续产出好内容。' })).toBeVisible();

  await page.getByRole('button', { name: '打开设置' }).click();
  await expect(page.getByRole('heading', { name: '大模型 API 配置' })).toBeVisible();
  await page.getByLabel('服务类型').selectOption('aliyun-bailian');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('qwen3.7-plus');
  await page.getByLabel('API Key').fill('sk-hotelcut-e2e-test-key-123456789');
  await page.getByRole('button', { name: '保存并测试真实连接' }).click();
  await expect(page.getByText('连接成功', { exact: true })).toBeVisible();
  await expect.poll(() => modelConnectionTested).toBe(true);
  await expect.poll(() => modelSettings.provider).toBe('aliyun-bailian');
  await expect.poll(() => modelSettings.apiMode).toBe('chat_completions');

  await page.getByRole('button', { name: '打开素材库' }).click();
  await expect(page.getByRole('heading', { name: '生产素材库' })).toBeVisible();
  await expect(page.getByRole('button', { name: /湖景房介绍\.mp4/ })).toBeVisible();

  await page.getByRole('searchbox', { name: '搜索素材文件名' }).fill('大堂');
  await page.getByRole('button', { name: /大堂口播\.mp4/ }).click();
  await page.getByRole('button', { name: '重新分析' }).click();
  await expect.poll(() => analysisRetried).toBe(true);

  await page.getByRole('searchbox', { name: '搜索素材文件名' }).fill('湖景');
  await page.getByRole('button', { name: /湖景房介绍\.mp4/ }).click();
  await expect(page.getByAltText('湖景房介绍.mp4 缩略图')).toBeVisible();
  await page.getByRole('textbox', { exact: true, name: '标签' }).fill('湖景房');
  await page.getByRole('button', { name: '保存标签' }).click();
  await expect(page.getByText('人工标签已保存')).toBeVisible();
  expect(createdTag).toMatchObject({ endMs: 30_000, label: '湖景房', startMs: 0 });

  await page.getByLabel('选择视频或音频文件').setInputFiles({
    name: '新客房素材.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole('button', { name: '批量上传并自动分析' }).click();
  await expect(page.getByText('1 个素材上传完成，已进入自动分析队列')).toBeVisible();
  expect(uploadCompleted).toBe(true);

  await page.getByRole('button', { name: '打开酒店配置' }).click();
  await expect(page.getByRole('heading', { name: '酒店资料与品牌配置' })).toBeVisible();

  await page.getByLabel('酒店名称').fill('云栖湖畔度假酒店（虚构）');
  await page.getByLabel('城市').fill('苏州');
  await page.getByRole('button', { name: '保存酒店资料' }).click();
  await expect(page.getByText('酒店资料已保存')).toBeVisible();
  await expect(page.getByRole('heading', { name: '云栖湖畔度假酒店（虚构）' })).toBeVisible();

  await page.getByLabel('强调色').fill('#b87333');
  await page.getByLabel('默认片尾文案').fill('今晚，住进湖畔慢时光');
  await page.getByRole('button', { name: '保存品牌配置' }).click();
  await expect(page.getByText('品牌配置已保存')).toBeVisible();
  expect(brandKit).toMatchObject({
    accentColor: '#b87333',
    endingText: '今晚，住进湖畔慢时光',
    logoAssetId: null,
  });

  await page.getByRole('button', { name: '打开视频项目' }).click();
  await expect(page.getByRole('heading', { name: '创建自动剪辑项目' })).toBeVisible();
  await page.getByText('酒店活动推广', { exact: true }).click();
  await page.getByLabel('项目标题').fill('湖畔周末礼遇');
  await page.getByLabel('传播目标').fill('提升周末咨询');
  await page.getByLabel('行动引导（仅使用已确认文案）').fill('联系酒店');
  await page.getByRole('button', { name: '生成真实方案' }).click();
  await expect(page.getByText('住进湖畔，把周末慢下来。')).toBeVisible();
  await expect.poll(() => aiPlanRequested).toBe(true);
  await page.getByRole('button', { name: '生成并保存剪辑项目' }).click();
  await expect(page.getByText('自动剪辑已保存为项目修订 1')).toBeVisible();
  await expect(page.getByText('已匹配 4/4 个画面槽位')).toBeVisible();
  await expect(page.getByText('编排无警告')).toBeVisible();
  expect(createdBrief).toMatchObject({
    callToAction: '联系酒店',
    durationSeconds: 20,
    objective: '提升周末咨询',
    title: '湖畔周末礼遇',
  });
  expect(generationRequest).toMatchObject({
    templateKey: 'hotel.promotion',
    videoBriefId: briefId,
  });

  await page.getByRole('button', { name: '进入 Studio 编辑' }).click();
  await expect(page.getByRole('heading', { name: 'HotelCut Studio' })).toBeVisible();
  await page.getByRole('button', { name: '文案' }).click();
  await page.getByLabel('字幕文本').fill('湖畔周末，慢下来住一晚');
  await page.getByRole('button', { name: '应用字幕' }).click();
  await expect.poll(() => savedRevisionRequest).not.toBeNull();
  expect(savedRevisionRequest).toMatchObject({ baseRevision: 1 });
  await expect(page.getByText('修订 2')).toBeVisible();
  await page.getByRole('button', { name: '返回项目列表' }).click();
  await expect(page.getByRole('heading', { name: '创建自动剪辑项目' })).toBeVisible();

  await page.getByRole('button', { name: '打开渲染中心' }).click();
  await expect(page.getByRole('heading', { name: '渲染中心', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: '渲染当前修订 2' }).click();
  await expect.poll(() => renderCreated).toBe(true);
  await expect(page.getByText('质检通过')).toBeVisible();
  await page.getByRole('button', { name: '生成下载链接' }).click();
  await expect.poll(() => artifactDownloadRequested).toBe(true);
  await expect(page.getByRole('link', { name: '下载成片视频' })).toHaveAttribute(
    'href',
    'https://downloads.test/video.mp4?ttl=900',
  );
  expect(browserErrors).toEqual([]);
});
