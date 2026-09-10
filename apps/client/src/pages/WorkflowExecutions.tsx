import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiListExecutions, type WorkflowExecution } from '@/lib/http';


export default function WorkflowExecutions() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
