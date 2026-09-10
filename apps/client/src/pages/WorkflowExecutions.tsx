import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiCancelExecution, apiListExecutions, apiRetryExecution, type WorkflowExecution } from '@/lib/http';


export default function WorkflowExecutions() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refresh() {
    if (!workflowId) return;
    const result = await apiListExecutions(workflowId);
    setExecutions(result.items);
  }

  useEffect(() => {
    if (!workflowId) return;
    apiListExecutions(workflowId)
      .then((result) => setExecutions(result.items))
      .catch(() => setError('Could not load execution history. Please try again.'))
      .finally(() => setLoading(false));
  }, [workflowId]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/workflow/${workflowId}`} className="text-sm text-muted-foreground underline">
          ← Back to workflow
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-4">Executions</h1>

      {error ? (
        <p className="text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : executions.length === 0 ? (
        <p className="text-muted-foreground">No executions yet.</p>
      ) : (
        <div className="grid gap-3">
          {executions.map((exec, i) => (
            <pre key={exec.id ?? i} className="border rounded-md p-4 text-xs overflow-auto">
              {JSON.stringify(exec, null, 2)}
              <span className="mt-3 flex gap-2 text-sm">
                {(exec.status === 'pending' || exec.status === 'running') && <button className="rounded-md border px-2 py-1" onClick={async () => { try { setActionError(null); await apiCancelExecution(exec._id ?? exec.id ?? ''); await refresh(); } catch { setActionError('Could not cancel execution.'); } }}>Cancel</button>}
                {exec.status === 'failure' && <button className="rounded-md border px-2 py-1" onClick={async () => { try { setActionError(null); await apiRetryExecution(exec._id ?? exec.id ?? ''); await refresh(); } catch { setActionError('Could not retry execution.'); } }}>Retry</button>}
              </span>
            </pre>
          ))}
        </div>
      )}
      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
    </div>
  );
}
