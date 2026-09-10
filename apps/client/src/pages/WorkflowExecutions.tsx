import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiCancelExecution, apiListExecutions, apiListWorkflowAudit, apiRetryExecution, type ExecutionStatus, type WorkflowAuditEvent, type WorkflowExecution } from '@/lib/http';


export default function WorkflowExecutions() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [audit, setAudit] = useState<WorkflowAuditEvent[]>([]);

  async function refresh() {
    if (!workflowId) return;
    const result = await apiListExecutions(workflowId, page, 25, statusFilter || undefined);
    setExecutions(result.items);
    setTotalPages(result.totalPages);
  }

  useEffect(() => {
    if (!workflowId) return;
    apiListExecutions(workflowId, page, 25, statusFilter || undefined)
      .then((result) => { setExecutions(result.items); setTotalPages(result.totalPages); })
      .catch(() => setError('Could not load execution history. Please try again.'))
      .finally(() => setLoading(false));
    apiListWorkflowAudit(workflowId).then(setAudit).catch(() => undefined);
  }, [workflowId, page, statusFilter]);

  function duration(execution: WorkflowExecution) {
    if (!execution.startTime) return '—';
    if (!execution.endTime) return 'ongoing';
    const end = Date.parse(execution.endTime);
    return `${Math.max(0, end - Date.parse(execution.startTime))} ms`;
  }

  function resultSummary(result: unknown) {
    if (!result || typeof result !== 'object') return String(result ?? '—');
    const value = result as { orderId?: string; transactionHash?: string; response?: unknown };
    return [value.orderId && `order ${value.orderId}`, value.transactionHash && `tx ${value.transactionHash}`, value.response && `response ${JSON.stringify(value.response)}`].filter(Boolean).join(' · ') || JSON.stringify(result);
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/workflow/${workflowId}`} className="text-sm text-muted-foreground underline">
          ← Back to workflow
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-4">Executions</h1>
      <label className="mb-4 flex items-center gap-2 text-sm">
        Status
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as ExecutionStatus | ''); setPage(1); }} className="rounded-md border px-2 py-1">
          <option value="">All</option><option value="pending">Pending</option><option value="running">Running</option><option value="success">Success</option><option value="failure">Failure</option>
        </select>
      </label>

      {error ? (
        <p className="text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : executions.length === 0 ? (
        <p className="text-muted-foreground">No executions yet.</p>
      ) : (
        <div className="grid gap-3">
          {executions.map((exec, i) => (
            <div key={exec.id ?? exec._id ?? i} className="border rounded-md p-4 text-sm">
              <div className="grid gap-1 sm:grid-cols-3"><span><strong>Status:</strong> {exec.status ?? 'unknown'}</span><span><strong>Started:</strong> {exec.startTime ? new Date(exec.startTime).toLocaleString() : '—'}</span><span><strong>Duration:</strong> {duration(exec)}</span></div>
              {exec.error && <p className="mt-2 text-red-600"><strong>Error:</strong> {exec.error}</p>}
              {exec.results && exec.results.length > 0 && <div className="mt-3 space-y-1"><strong>Node results</strong>{exec.results.map((result) => <div key={result.nodeId} className="rounded bg-muted p-2 text-xs"><strong>{result.nodeId}:</strong> {resultSummary(result.result)}</div>)}</div>}
              <span className="mt-3 flex gap-2">
                {(exec.status === 'pending' || exec.status === 'running') && <button className="rounded-md border px-2 py-1" onClick={async () => { try { setActionError(null); await apiCancelExecution(exec._id ?? exec.id ?? ''); await refresh(); } catch { setActionError('Could not cancel execution.'); } }}>Cancel</button>}
                {exec.status === 'failure' && <button className="rounded-md border px-2 py-1" onClick={async () => { try { setActionError(null); await apiRetryExecution(exec._id ?? exec.id ?? ''); await refresh(); } catch { setActionError('Could not retry execution.'); } }}>Retry</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && totalPages > 1 && <div className="mt-4 flex items-center gap-3"><button className="rounded-md border px-3 py-1 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span className="text-sm">Page {page} of {totalPages}</span><button className="rounded-md border px-3 py-1 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
      {audit.length > 0 && <section className="mt-8"><h2 className="mb-2 text-lg font-semibold">Audit history</h2><div className="space-y-1 text-sm">{audit.map((event) => <div key={event._id} className="rounded border px-3 py-2"><strong>{event.action}</strong><span className="ml-2 text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div>)}</div></section>}
      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
    </div>
  );
}
