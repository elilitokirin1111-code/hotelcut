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

test('signs in and enters a tenant-scoped hotel workspace', async ({ page }) => {
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
