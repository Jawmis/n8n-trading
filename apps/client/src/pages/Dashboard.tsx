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
    <div className="min-h-screen bg-slate-50 p-6 text-slate-950 md:p-10">
      <div className="mx-auto max-w-6xl">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-medium text-teal-600">N8N Trading</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Good to see you</h1><p className="mt-1 text-slate-500">Manage your automated trading workspace.</p></div>
        <div className="flex flex-wrap gap-2">
        <Link to="/create-workflow" className="rounded-xl bg-slate-950 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800">
          New Workflow
        </Link>
        <Link to="/credentials" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-medium transition hover:bg-slate-100">
          Credentials
        </Link>
        <button onClick={() => apiSignout().then(() => navigate('/auth'))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-medium transition hover:bg-slate-100">
          Sign out
        </button>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Workflows</p><p className="mt-2 text-3xl font-semibold">{workflows.length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Active automations</p><p className="mt-2 text-3xl font-semibold">{workflows.filter((workflow) => workflow.enabled).length}</p></div><div className="rounded-2xl border border-teal-100 bg-teal-50 p-5"><p className="text-sm text-teal-700">Trading mode</p><p className="mt-2 text-xl font-semibold text-teal-950">Paper first</p></div></div>

      {error ? (
        <div className="flex items-center gap-3 text-sm text-red-600">
          <p>{error}</p>
          <button type="button" className="underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">Loading your workflows...</div>
      ) : workflows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-lg font-medium">Your workspace is ready.</p><p className="mt-2 text-slate-500">Create your first workflow to start automating a strategy.</p><Link to="/create-workflow" className="mt-5 inline-block rounded-xl bg-slate-950 px-4 py-2.5 font-medium text-white">Create first workflow</Link></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((wf) => (
            <Link
              key={wf._id}
              to={`/workflow/${wf._id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{wf.name || 'Untitled workflow'}</p><p className="mt-1 text-sm text-slate-500">{wf.nodes.length} nodes · {wf.edges.length} connections</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${wf.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{wf.enabled ? 'Active' : 'Paused'}</span></div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
