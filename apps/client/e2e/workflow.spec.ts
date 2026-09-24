import { expect, test } from '@playwright/test';

const workflow = {
  _id: 'test-workflow', userId: 'owner', name: 'Hourly check', enabled: false,
  revision: 0, state: 'draft', role: 'owner', members: [],
  nodes: [{ id: 'timer', nodeId: 'timer', type: 'timer', position: { x: 120, y: 220 }, data: { kind: 'TRIGGER', metadata: { time: 60 } } }], edges: [],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('http://localhost:3000/**', async (route) => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ json: workflow });
  });
});

test('creates a valid paused timer workflow and shows seconds', async ({ page }) => {
  await page.route('http://localhost:3000/workflow', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.nodes[0].data.metadata.time).toBe(3600);
    expect(body.enabled).toBe(false);
    expect(body.name).toBe('Morning strategy');
    await route.fulfill({ json: { id: workflow._id } });
  });
  await page.goto('/create-workflow');
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Morning strategy');
  await page.getByRole('button', { name: 'Create Workflow', exact: true }).click();
  await expect(page.getByText('Every 60 seconds')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run now' })).toBeDisabled();
});

test('stale save preserves local changes and offers reload', async ({ page }) => {
  await page.route(`http://localhost:3000/workflow/${workflow._id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON().revision).toBe(0);
      await route.fulfill({ status: 409, json: { message: 'Workflow changed since it was loaded. Reload before saving.' } });
    } else await route.fulfill({ json: workflow });
  });
  await page.goto(`/workflow/${workflow._id}`);
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Local edits');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Workflow changed');
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue('Local edits');
  await expect(page.getByRole('button', { name: 'Reload saved workflow' })).toBeVisible();
});

test('viewer can inspect but cannot edit or run', async ({ page }) => {
  await page.route(`http://localhost:3000/workflow/${workflow._id}`, (route) => route.fulfill({ json: { ...workflow, role: 'viewer' } }));
  await page.goto(`/workflow/${workflow._id}`);
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Run now' })).toBeDisabled();
});

test('timer editing validates positive seconds', async ({ page }) => {
  await page.goto(`/workflow/${workflow._id}`);
  await page.getByText('Every 60 seconds').dblclick();
  await page.getByRole('spinbutton').fill('0');
  await page.getByRole('button', { name: 'Update Trigger' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('spinbutton').fill('120');
  await page.getByRole('button', { name: 'Update Trigger' }).click();
  await expect(page.getByText('Every 120 seconds')).toBeVisible();
});
