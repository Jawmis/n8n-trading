import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiListWorkflows, apiSignout, type Workflow } from '@/lib/http';

export default function Dashboard() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiListWorkflows()
      .then(setWorkflows)
      .catch(() => setError('Could not load workflows. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Your Workflows</h1>
        <Link to="/create-workflow" className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
          New Workflow
        </Link>
        <Link to="/credentials" className="px-4 py-2 rounded-md border">
          Credentials
        </Link>
        <button onClick={() => apiSignout().then(() => navigate('/auth'))} className="px-4 py-2 rounded-md border">
          Sign out
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 text-sm text-red-600">
          <p>{error}</p>
          <button type="button" className="underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : loading ? (
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
