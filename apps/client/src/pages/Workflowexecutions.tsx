import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiListExecutions } from '@/lib/http';

export default function WorkflowExecutions() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workflowId) return;
    apiListExecutions(workflowId)
      .then(setExecutions)
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

      {loading ? (
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