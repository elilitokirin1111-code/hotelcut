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
  await page.route('**/api/v1/hotels', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          organizationId: '10000000-0000-4000-8000-000000000001',
          name: '云栖湖畔酒店（虚构）',
          city: '杭州',
          address: '示例路 88 号',
          timezone: 'Asia/Shanghai',
          createdAt: '2026-07-28T08:00:00.000Z',
          updatedAt: '2026-07-28T08:00:00.000Z',
        },
      ],
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '酒店短视频工作空间' })).toBeVisible();
  await page.getByRole('button', { name: '登录工作空间' }).click();

  await expect(page.getByRole('heading', { name: '选择酒店' })).toBeVisible();
  await page.getByRole('button', { name: '进入 云栖湖畔酒店（虚构）' }).click();

  await expect(page.getByRole('heading', { name: '云栖湖畔酒店（虚构）' })).toBeVisible();
  await expect(page.getByLabel('酒店工作空间模块')).toBeVisible();
  expect(browserErrors).toEqual([]);
});
