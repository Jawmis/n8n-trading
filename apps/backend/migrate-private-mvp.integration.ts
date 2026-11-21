import { afterAll, beforeAll, expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { migratePrivateMvp } from './migrate-private-mvp';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? test : test.skip;
let workflowId: mongoose.Types.ObjectId;
let invalidCredentialWorkflowId: mongoose.Types.ObjectId;
let invalidGraphWorkflowId: mongoose.Types.ObjectId;
let jobIds: mongoose.Types.ObjectId[];
let foreignCredentialId: mongoose.Types.ObjectId;

beforeAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  await mongoose.connect(process.env.MONGO_URL!);
  workflowId = new mongoose.Types.ObjectId();
  invalidCredentialWorkflowId = new mongoose.Types.ObjectId();
  invalidGraphWorkflowId = new mongoose.Types.ObjectId();
  jobIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  foreignCredentialId = new mongoose.Types.ObjectId();
  await mongoose.connection.db!.collection('workflows').insertOne({ _id: workflowId, userId: new mongoose.Types.ObjectId(), name: 'Legacy', enabled: true, published: { revision: 1, nodes: [{ credentials: { apiKey: 'legacy-published-secret' } }] }, nodes: [{ id: 'trigger', nodeId: 'timer', type: 'timer', position: { x: 0, y: 0 }, data: { kind: 'TRIGGER', metadata: { time: 60 } } }], edges: [] });
  const ownerId = new mongoose.Types.ObjectId();
  await mongoose.connection.db!.collection('workflows').updateOne({ _id: workflowId }, { $set: { 'nodes.0.credentials': { apiKey: 'legacy-inline-secret' } } });
  await mongoose.connection.db!.collection('credentials').insertOne({ _id: foreignCredentialId, userId: new mongoose.Types.ObjectId(), provider: 'lighter', ciphertext: 'test', iv: 'test', authTag: 'test' });
  await mongoose.connection.db!.collection('workflows').insertOne({ _id: invalidCredentialWorkflowId, userId: ownerId, name: 'Foreign credential', enabled: true, nodes: [{ id: 'trigger', nodeId: 'timer', type: 'timer', position: { x: 0, y: 0 }, data: { kind: 'TRIGGER', metadata: { time: 60 } } }, { id: 'trade', nodeId: 'lighter', type: 'lighter', position: { x: 1, y: 1 }, credentialId: foreignCredentialId, data: { kind: 'ACTION', metadata: { type: 'LONG', symbol: 'BTC', qty: 1 } } }], edges: [{ id: 'edge', source: 'trigger', target: 'trade' }] });
  await mongoose.connection.db!.collection('workflows').insertOne({ _id: invalidGraphWorkflowId, userId: ownerId, name: 'Invalid graph', enabled: true, nodes: [{ id: 'trigger', nodeId: 'timer', type: 'timer', position: { x: 0, y: 0 }, data: { kind: 'TRIGGER', metadata: { time: 60 } } }], edges: [{ id: 'broken', source: 'missing', target: 'trigger' }] });
  await mongoose.connection.db!.collection('executions').insertMany([
    { _id: jobIds[0], workflowId, kind: 'manual', status: 'pending' },
    { _id: jobIds[1], workflowId, kind: 'timer', status: 'running' },
  ]);
  await mongoose.disconnect();
});

afterAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') return;
  await mongoose.connect(process.env.MONGO_URL!);
  await mongoose.connection.db!.collection('workflows').deleteMany({ _id: { $in: [workflowId, invalidCredentialWorkflowId, invalidGraphWorkflowId] } });
  await mongoose.connection.db!.collection('executions').deleteMany({ _id: { $in: jobIds } });
  await mongoose.connection.db!.collection('credentials').deleteOne({ _id: foreignCredentialId });
  await mongoose.disconnect();
});

integration('dry runs, pauses legacy workflows and fails ambiguous jobs once', async () => {
  const previousBackupConfirmation = process.env.MIGRATION_BACKUP_CONFIRMED;
  delete process.env.MIGRATION_BACKUP_CONFIRMED;
  await expect(migratePrivateMvp(true)).rejects.toThrow('MIGRATION_BACKUP_CONFIRMED=yes');
  if (previousBackupConfirmation) process.env.MIGRATION_BACKUP_CONFIRMED = previousBackupConfirmation;
  const dry = await migratePrivateMvp();
  expect(dry.legacyWorkflows).toBe(3);
  expect(dry.validGraphs).toBe(2);
  expect(dry.invalidGraphs).toBe(1);
  expect(dry.invalidCredentials).toBe(2);
  expect(dry.legacyJobs).toBe(2);
  process.env.MIGRATION_BACKUP_CONFIRMED = 'yes';
  const applied = await migratePrivateMvp(true);
  expect(applied.migratedWorkflows).toBe(3);
  expect(applied.failedJobs).toBe(2);
  const again = await migratePrivateMvp(true);
  expect(again.migratedWorkflows).toBe(0);
  expect(again.failedJobs).toBe(0);
  expect(again.legacyWorkflows).toBe(0);
  await mongoose.connect(process.env.MONGO_URL!);
  const workflow = await mongoose.connection.db!.collection('workflows').findOne({ _id: workflowId });
  const job = await mongoose.connection.db!.collection('executions').findOne({ _id: jobIds[0] });
  const runningJob = await mongoose.connection.db!.collection('executions').findOne({ _id: jobIds[1] });
  expect(workflow).toMatchObject({ revision: 0, state: 'draft', enabled: false });
  expect(workflow?.published).toBeUndefined();
  expect((workflow?.nodes?.[0] as { credentials?: unknown })?.credentials).toBeUndefined();
  expect(job?.status).toBe('failure');
  expect(runningJob?.status).toBe('failure');
  await mongoose.disconnect();
});
