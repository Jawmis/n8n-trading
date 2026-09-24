import { expect, test } from '@playwright/test';

test('a new user runs a timer-based paper trade without a broker key', async ({ page }) => {
  const username = `paper_${crypto.randomUUID().slice(0, 12)}`;
  await page.goto('/auth?mode=signup');
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill('long-test-password-123');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page.getByText('Good to see you')).toBeVisible();
  await expect(page.getByText('Paper demo · Ready')).toBeVisible();
  await page.getByRole('link', { name: 'New Workflow' }).click();
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('First paper strategy');
  await page.getByRole('button', { name: 'Create Workflow', exact: true }).click();
  await expect(page.getByText('Every 3600 seconds')).toBeVisible();
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByRole('dialog').getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'LONG' }).click();
  await page.getByRole('dialog').getByRole('combobox').nth(3).click();
  await page.getByRole('option', { name: 'BTC' }).click();
  await page.getByRole('dialog').getByRole('spinbutton').first().fill('1');
  await page.getByRole('button', { name: 'Create Action' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Publish saved draft' }).click();
  await expect(page.getByText('published version', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Enable' }).click();
  await page.getByRole('button', { name: 'Run now' }).click();
  await page.getByRole('link', { name: 'Executions' }).click();
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Status:', { exact: true }).first().locator('..')).toContainText('success');
    await expect(page.getByText('fixed-demo-reference', { exact: false })).toBeVisible();
  }).toPass({ timeout: 15_000 });
});
