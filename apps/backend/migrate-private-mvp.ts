import mongoose from 'mongoose';
import { validateWorkflowGraph } from 'common/types';

type Counts = { legacyWorkflows: number; validGraphs: number; invalidGraphs: number; legacyJobs: number; migratedWorkflows: number; failedJobs: number };

export async function migratePrivateMvp(apply = false): Promise<Counts> {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error('MONGO_URL is required');
  if (apply && process.env.MIGRATION_BACKUP_CONFIRMED !== 'yes') throw new Error('Set MIGRATION_BACKUP_CONFIRMED=yes after verifying a restorable backup');
  await mongoose.connect(url);
  const counts: Counts = { legacyWorkflows: 0, validGraphs: 0, invalidGraphs: 0, legacyJobs: 0, migratedWorkflows: 0, failedJobs: 0 };
  try {
    const workflows = mongoose.connection.db!.collection('workflows');
    const jobs = mongoose.connection.db!.collection('executions');
    const legacy = workflows.find({ $or: [{ revision: { $exists: false } }, { state: { $exists: false } }, { enabled: true, published: { $exists: false } }] });
    for await (const workflow of legacy) {
      counts.legacyWorkflows++;
      const nodes = (workflow.nodes ?? []).map(({ credentials: _credentials, ...node }: Record<string, unknown>) => node);
      const graph = validateWorkflowGraph({ nodes, edges: workflow.edges ?? [] });
      if (graph.success) counts.validGraphs++;
      else counts.invalidGraphs++;
      if (!apply) continue;
      const result = await workflows.updateOne({ _id: workflow._id, $or: [{ revision: { $exists: false } }, { state: { $exists: false } }, { enabled: true, published: { $exists: false } }] }, {
        $set: { revision: workflow.revision ?? 0, state: 'draft', enabled: false, members: workflow.members ?? [] },
        $unset: { runRequestedAt: 1 },
      });
      counts.migratedWorkflows += result.modifiedCount;
    }
    const legacyJobFilter = { status: { $in: ['pending', 'running'] }, snapshot: { $exists: false } };
    counts.legacyJobs = await jobs.countDocuments(legacyJobFilter);
    if (apply && counts.legacyJobs) {
      const result = await jobs.updateMany(legacyJobFilter, { $set: { status: 'failure', error: 'Legacy job held for manual review during private MVP migration', endTime: new Date() }, $unset: { queueKey: 1, activeKey: 1, leaseUntil: 1 } });
      counts.failedJobs = result.modifiedCount;
    }
    return counts;
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply');
  migratePrivateMvp(apply).then((counts) => {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
