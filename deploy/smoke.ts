const api = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3000';
const username = `smoke_${crypto.randomUUID().slice(0, 12)}`;
let token = '';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function main() {
  const ready = await request<{ status: string }>('/readyz');
  if (ready.status !== 'ready') throw new Error('API is not ready');
  await request('/signup', 'POST', { username, password: 'smoke-test-password-123' });
  const signIn = await request<{ token: string }>('/signin', 'POST', { username, password: 'smoke-test-password-123' });
  token = signIn.token;
  const status = await request<{ mode: string; ready: boolean }>('/trading/status');
  if (status.mode !== 'paper' || !status.ready) throw new Error('Paper demo must be ready for the smoke test');
  const trigger = { id: 'trigger', nodeId: 'timer', type: 'timer', position: { x: 0, y: 0 }, data: { kind: 'TRIGGER', metadata: { time: 3600 } } };
  const action = { id: 'action', nodeId: 'lighter', type: 'lighter', position: { x: 200, y: 0 }, data: { kind: 'ACTION', metadata: { type: 'LONG', symbol: 'BTC', qty: 1 } } };
  const edges = [{ id: 'trigger-action', source: 'trigger', target: 'action' }];
  const created = await request<{ id: string }>('/workflow', 'POST', { name: 'Smoke paper trade', enabled: false, nodes: [trigger, action], edges });
  const id = created.id;
  try {
    await request(`/workflow/${id}/publish`, 'POST', { revision: 0 });
    await request(`/workflow/${id}/enabled`, 'PUT', { revision: 1, enabled: true });
    try { await request(`/workflow/${id}/execute`, 'POST'); } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('409')) throw error;
    }
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const history = await request<{ items: Array<{ status: string; results?: Array<{ result?: { mode?: string; priceSource?: string } }> }> }>(`/workflow/executions/${id}`);
      const succeeded = history.items.find((item) => item.status === 'success' && item.results?.some((node) => node.result?.mode === 'paper' && node.result.priceSource === 'fixed-demo-reference'));
      if (succeeded) { console.log(JSON.stringify({ status: 'passed', mode: status.mode, workflowId: id })); return; }
      const failed = history.items.find((item) => item.status === 'failure');
      if (failed) throw new Error('Paper execution failed');
      await Bun.sleep(500);
    }
    throw new Error('Timed out waiting for paper execution');
  } finally {
    await request(`/workflow/${id}`, 'DELETE');
  }
}

await main();
