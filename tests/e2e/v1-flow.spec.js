const { test, expect } = require('@playwright/test');

test('rider can search, book, view, and cancel a seeded trip', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Search rides' }).click();
  await expect(page.getByText(/Found \d+ ride/)).toBeVisible();
  await expect(page.getByText('Divyasree Orion to Gachibowli')).toBeVisible();

  await page.getByRole('button', { name: 'Book seat' }).first().click();
  await page.getByRole('button', { name: 'Bookings' }).click();

  await expect(page.getByText('Divyasree Orion to Gachibowli')).toBeVisible();
  await expect(page.getByText(/confirmed/i)).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/cancelled/i)).toBeVisible();
});
