import { expect, test } from '@playwright/test';

const session = {
  user: {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'owner@hotelcut.example',
    displayName: '演示管理员',
    status: 'active',
  },
  expiresAt: '2026-08-04T08:00:00.000Z',
};

test('runs the authenticated hotel configuration and asset-production workspace', async ({
  page,
}) => {
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
  let analysisRetried = false;
  let uploadCompleted = false;
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
          kind: 'video',
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
  await page.route('**/api/v1/hotels', async (route) => {
    await route.fulfill({
      status: 200,
      json: [hotel],
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '酒店短视频工作空间' })).toBeVisible();
  await page.getByRole('button', { name: '登录工作空间' }).click();

  await expect(page.getByRole('heading', { name: '选择酒店' })).toBeVisible();
  await page.getByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }).click();

  await expect(page.getByRole('heading', { name: '云栖湖畔酒店（虚构）' })).toBeVisible();
  await expect(page.getByLabel('酒店工作空间模块')).toBeVisible();
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

  await page.getByLabel('选择视频文件').setInputFiles({
    name: '新客房素材.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole('button', { name: '上传并自动分析' }).click();
  await expect(page.getByText('上传完成，已进入自动分析队列')).toBeVisible();
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
  expect(browserErrors).toEqual([]);
});
