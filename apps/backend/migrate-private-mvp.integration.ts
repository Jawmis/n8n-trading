import { afterAll, beforeAll, expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { migratePrivateMvp } from './migrate-private-mvp';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? test : test.skip;
let workflowId: mongoose.Types.ObjectId;
let jobId: mongoose.Types.ObjectId;

beforeAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  await mongoose.connect(process.env.MONGO_URL!);
  workflowId = new mongoose.Types.ObjectId();
  jobId = new mongoose.Types.ObjectId();
  await mongoose.connection.db!.collection('workflows').insertOne({ _id: workflowId, userId: new mongoose.Types.ObjectId(), name: 'Legacy', enabled: true, nodes: [{ id: 'trigger', nodeId: 'timer', type: 'timer', position: { x: 0, y: 0 }, data: { kind: 'TRIGGER', metadata: { time: 60 } } }], edges: [] });
  await mongoose.connection.db!.collection('executions').insertOne({ _id: jobId, workflowId, kind: 'manual', status: 'pending' });
  await mongoose.disconnect();
});

afterAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  await mongoose.connect(process.env.MONGO_URL!);
  await mongoose.connection.db!.collection('workflows').deleteOne({ _id: workflowId });
  await mongoose.connection.db!.collection('executions').deleteOne({ _id: jobId });
  await mongoose.disconnect();
});

integration('dry runs, pauses legacy workflows and fails ambiguous jobs once', async () => {
  const dry = await migratePrivateMvp();
  expect(dry.legacyWorkflows).toBe(1);
  expect(dry.validGraphs).toBe(1);
  expect(dry.legacyJobs).toBe(1);
  process.env.MIGRATION_BACKUP_CONFIRMED = 'yes';
  const applied = await migratePrivateMvp(true);
  expect(applied.migratedWorkflows).toBe(1);
  expect(applied.failedJobs).toBe(1);
  const again = await migratePrivateMvp(true);
  expect(again.migratedWorkflows).toBe(0);
  expect(again.failedJobs).toBe(0);
  await mongoose.connect(process.env.MONGO_URL!);
  const workflow = await mongoose.connection.db!.collection('workflows').findOne({ _id: workflowId });
  const job = await mongoose.connection.db!.collection('executions').findOne({ _id: jobId });
  expect(workflow).toMatchObject({ revision: 0, state: 'draft', enabled: false });
  expect(job?.status).toBe('failure');
  await mongoose.disconnect();
});
