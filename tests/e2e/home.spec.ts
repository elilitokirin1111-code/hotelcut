import { expect, test } from '@playwright/test';

test('shows the M0 service overview', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'HotelCut' })).toBeVisible();
  await expect(page.getByText('M0 foundation')).toBeVisible();
});
