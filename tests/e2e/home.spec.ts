import { expect, test } from '@playwright/test';

test('edits and previews a hotel video without touching JSON', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'HotelCut Studio' })).toBeVisible();
  await expect(page.getByLabel('视频预览')).toBeVisible();
  await expect(page.getByLabel('场景列表')).toBeVisible();
  await expect(page.getByLabel('简化时间线')).toBeVisible();

  await page.getByRole('button', { name: '文案' }).click();
  await page.getByLabel('字幕文本').fill('在湖畔，住进一段慢时光');
  await page.getByRole('button', { name: '应用字幕' }).click();

  await expect(page.getByLabel('视频预览').getByText('在湖畔，住进一段慢时光')).toBeVisible();
  await expect(page.getByText('修订 2')).toBeVisible();
});
