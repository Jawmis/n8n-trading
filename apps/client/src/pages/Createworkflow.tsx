import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCreateWorkflow } from '@/lib/http';

export default function CreateWorkflow() {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function handleCreate() {
    setCreating(true);
    try {
      const { id } = await apiCreateWorkflow({ nodes: [], edges: [] });
      navigate(`/workflow/${id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Create a New Workflow</h1>
      <button
        onClick={handleCreate}
        disabled={creating}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Workflow'}
      </button>
    </div>
  );
}