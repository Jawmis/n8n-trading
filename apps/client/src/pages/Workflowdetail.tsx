import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { apiGetWorkflow, apiUpdateWorkflow, type Workflow } from '@/lib/http';


export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    apiGetWorkflow(workflowId).then((wf) => {
      setWorkflow(wf);
      setNodes(
        wf.nodes.map((n) => ({
          id: n.id,
          position: n.position,
          data: n.data,
          type: n.type,
        }))
      );
      setEdges(wf.edges);
    });
  }, [workflowId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  async function handleSave() {
    if (!workflowId) return;
    setSaving(true);
    try {
      await apiUpdateWorkflow(workflowId, { nodes, edges });
    } finally {
      setSaving(false);
    }
  }

  if (!workflow) return <p className="p-6 text-muted-foreground">Loading workflow...</p>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-semibold">Workflow {workflow._id}</h1>
        <div className="flex gap-2">
          <Link
            to={`/workflow/${workflowId}/executions`}
            className="px-4 py-2 rounded-md border"
          >
            Executions
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}