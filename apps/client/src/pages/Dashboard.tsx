import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiListWorkflows, type Workflow } from '@/lib/http';

export default function Dashboard() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiListWorkflows()
      .then(setWorkflows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Your Workflows</h1>
        <Link to="/create-workflow" className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
          New Workflow
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : workflows.length === 0 ? (
        <p className="text-muted-foreground">No workflows yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-3">
          {workflows.map((wf) => (
            <Link
              key={wf._id}
              to={`/workflow/${wf._id}`}
              className="border rounded-md p-4 hover:bg-secondary/60 transition"
            >
              <p className="font-medium">{wf._id}</p>
              <p className="text-sm text-muted-foreground">
                {wf.nodes.length} nodes · {wf.edges.length} edges
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}