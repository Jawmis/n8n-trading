import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { CredentialModel, ExecutionModel, WorkflowModel } from 'db/client';
import { encryptCredential } from 'db/credentials';
import { executeWorkflow, type WorkflowLike } from './execute';
import { pollOnce } from './index';
import type { LighterClient } from './executors/lighter';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? test : test.skip;
const globals = globalThis as typeof globalThis & { LIGHTER_CLIENT?: LighterClient };
let workflowId: mongoose.Types.ObjectId;
let credentialId: mongoose.Types.ObjectId;
let snapshot: WorkflowLike;
let quotes = 0;

beforeAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  await mongoose.connect(process.env.MONGO_URL!);
  await ExecutionModel.init();
});

beforeEach(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  process.env.TRADING_MODE = 'paper';
  process.env.TRADING_KILL_SWITCH = 'false';
  process.env.MAX_ORDER_QUANTITY = '10';
  process.env.MAX_ORDER_NOTIONAL = '1000000';
  const userId = new mongoose.Types.ObjectId();
  const credential = await CredentialModel.create({ userId, provider: 'lighter', ...encryptCredential({ apiKey: 'test-only-secret', accountIndex: 0, apiIndex: 0 }) });
  credentialId = credential._id;
  const node = (id: string, kind: 'ACTION' | 'TRIGGER') => ({ id, nodeId: kind === 'ACTION' ? 'lighter' : 'timer', type: kind === 'ACTION' ? 'lighter' : 'timer', position: { x: 0, y: 0 }, credentialId: kind === 'ACTION' ? credentialId.toString() : undefined, data: { kind, metadata: kind === 'ACTION' ? { type: 'LONG', qty: 1, symbol: 'BTC' } : { time: 3600 } } });
  const workflow = await WorkflowModel.create({ userId, enabled: true, nodes: [node('t', 'TRIGGER'), node('a', 'ACTION'), node('b', 'ACTION')], edges: [{ id: 'ta', source: 't', target: 'a' }, { id: 'ab', source: 'a', target: 'b' }] });
  workflowId = workflow._id;
  snapshot = JSON.parse(JSON.stringify({ _id: workflowId, userId, nodes: workflow.toObject().nodes, edges: workflow.toObject().edges }));
  quotes = 0;
  globals.LIGHTER_CLIENT = { getMarketPrice: async () => { quotes++; return { price: 100 }; }, placeOrder: async () => { throw new Error('Live orders must never be sent in this suite'); } };
});

afterEach(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  delete globals.LIGHTER_CLIENT;
  await ExecutionModel.deleteMany({ workflowId });
  await WorkflowModel.deleteOne({ _id: workflowId });
  await CredentialModel.deleteOne({ _id: credentialId });
});
afterAll(async () => { if (process.env.RUN_INTEGRATION_TESTS === '1') await mongoose.disconnect(); });

integration('executes a persisted snapshot despite database-only fields', async () => {
  const id = await executeWorkflow(snapshot);
  const job = await ExecutionModel.findById(id);
  expect(job!.status).toBe('success');
  expect(job!.results).toHaveLength(2);
  expect(JSON.stringify(job!.results)).not.toContain('test-only-secret');
  expect(quotes).toBe(0);
});

integration('paper actions run without broker credentials', async () => {
  snapshot.nodes = snapshot.nodes.map((node) => ({ ...node, credentialId: undefined }));
  const id = await executeWorkflow(snapshot);
  const job = await ExecutionModel.findById(id);
  expect(job!.status).toBe('success');
  expect(job!.results).toHaveLength(2);
  expect(quotes).toBe(0);
});

integration('cancellation before the next action prevents downstream actions', async () => {
  const job = await ExecutionModel.create({ workflowId, kind: 'manual', status: 'running' });
  process.env.TRADING_KILL_SWITCH = 'true';
  await expect(executeWorkflow(snapshot, job._id)).rejects.toThrow();
  expect(quotes).toBe(0);
  expect((await ExecutionModel.findById(job._id))!.status).toBe('failure');
});

integration('disabled workflows do not execute or schedule', async () => {
  await WorkflowModel.updateOne({ _id: workflowId }, { $set: { enabled: false, published: snapshot } });
  await expect(executeWorkflow(snapshot)).rejects.toThrow();
  await pollOnce();
  expect(quotes).toBe(0);
  expect(await ExecutionModel.countDocuments({ workflowId, kind: 'timer' })).toBe(0);
});

integration('converging branches execute each action once', async () => {
  snapshot.edges.push({ id: 'tb', source: 't', target: 'b' } as typeof snapshot.edges[number]);
  await executeWorkflow(snapshot);
  expect(quotes).toBe(0);
  expect((await ExecutionModel.findOne({ workflowId }))!.results).toHaveLength(2);
});

integration('a join waits for both predecessor actions', async () => {
  snapshot.nodes.push({ id: 'c', nodeId: 'lighter', type: 'lighter', position: { x: 0, y: 0 }, data: { kind: 'ACTION', metadata: { type: 'LONG', qty: 1, symbol: 'BTC' } } });
  snapshot.edges = [
    { id: 'ta', source: 't', target: 'a' },
    { id: 'tb', source: 't', target: 'b' },
    { id: 'ac', source: 'a', target: 'c' },
    { id: 'bc', source: 'b', target: 'c' },
  ];
  const id = await executeWorkflow(snapshot);
  const job = await ExecutionModel.findById(id);
  expect((job!.results as Array<{ nodeId: string }>).map((result) => result.nodeId)).toEqual(['a', 'b', 'c']);
});

integration('invalid stored graphs fail the job without waiting for lease expiry', async () => {
  const job = await ExecutionModel.create({ workflowId, kind: 'manual', status: 'running' });
  await expect(executeWorkflow({ ...snapshot, edges: [] }, job._id)).rejects.toThrow();
  expect((await ExecutionModel.findById(job._id))!.status).toBe('failure');
  expect(quotes).toBe(0);
});
