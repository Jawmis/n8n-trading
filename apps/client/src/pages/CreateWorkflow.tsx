import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCreateWorkflow, apiError } from '@/lib/http';
 

export default function CreateWorkflow() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Untitled workflow');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleCreate() {
    setCreating(true);
    try {
      setError(null);
      const { id } = await apiCreateWorkflow({ name, enabled: false, nodes: [{ id: crypto.randomUUID(), nodeId: 'timer', type: 'timer', position: { x: 120, y: 220 }, data: { kind: 'TRIGGER', metadata: { time: 3600 } } }], edges: [] });
      navigate(`/workflow/${id}`);
    } catch (error) {
      setError(apiError(error, 'Could not create workflow. Please try again.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Create a New Workflow</h1>
      <input aria-label="Workflow name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className="rounded border px-3 py-2" />
      <p>Start with a paused, hourly timer. Edit and publish it before enabling.</p>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button
        onClick={handleCreate}
        disabled={creating || !name.trim()}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Workflow'}
      </button>
    </div>
  );
}
