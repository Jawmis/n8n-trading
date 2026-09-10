import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { apiDeleteWorkflow, apiDuplicateWorkflow, apiExecuteWorkflow, apiGetWorkflow, apiUpdateWorkflow, type Workflow } from '@/lib/http';
import { TriggerSheet } from '@/component/TriggerSheet';
import { ActionSheet } from '@/component/ActionSheet';
import { Timer } from '@/nodes/triggers/Timer';
import { PriceTrigger } from '@/nodes/triggers/PriceTrigger';
import { Lighter } from '@/nodes/actions/Lighter';
import type { NodeKind, NodeMetadata } from '@/component/CreateWorkflow';
import { validateWorkflowGraph } from 'common/types';
import { editorNodeToWorkflowNode, workflowNodeToEditorNode, type EditorWorkflowNode } from '@/lib/workflow-dto';

const nodeTypes = {
  timer: Timer,
  'price-trigger': PriceTrigger,
  lighter: Lighter,
};


export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<EditorWorkflowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTriggerSheet, setShowTriggerSheet] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [actionPosition, setActionPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    apiGetWorkflow(workflowId).then((wf) => {
      setWorkflow(wf);
      setNodes(
        wf.nodes.map(workflowNodeToEditorNode)
      );
      setEdges(wf.edges);
      if (wf.nodes.length === 0) setShowTriggerSheet(true);
    }).catch(() => setLoadError('Could not load this workflow. Please try again.'));
  }, [workflowId]);

  function openActionSheet(source: string | null = null, position: { x: number; y: number } | null = null) {
    setConnectionSource(source);
    setActionPosition(position);
    setShowActionSheet(true);
  }

  function addTrigger(type: NodeKind, metadata: NodeMetadata) {
    const node: EditorWorkflowNode = {
      id: crypto.randomUUID(), nodeId: type, type, position: { x: 120, y: 220 },
      data: { kind: 'trigger', metadata },
    };
    if (editingNodeId) {
      setNodes((current) => current.map((existing) => existing.id === editingNodeId ? { ...existing, type, nodeId: type, data: { kind: 'trigger', metadata } } : existing));
      setEditingNodeId(null);
    } else {
      setNodes([node]);
    }
    setShowTriggerSheet(false);
  }

  function addAction(type: NodeKind, metadata: NodeMetadata, credentialId?: string) {
    if (editingNodeId) {
      setNodes((current) => current.map((existing) => existing.id === editingNodeId ? { ...existing, type, nodeId: type, credentialId, data: { kind: 'action', metadata } } : existing));
      setEditingNodeId(null);
      setShowActionSheet(false);
      return;
    }
    const nodeId = crypto.randomUUID();
    const position = actionPosition ?? { x: 360 + nodes.length * 40, y: 220 + nodes.length * 30 };
    setNodes((current) => [...current, { id: nodeId, nodeId: type, type, position, data: { kind: 'action', metadata }, credentialId }]);
    if (connectionSource) {
      setEdges((current) => [...current, { id: `${connectionSource}-${nodeId}`, source: connectionSource, target: nodeId }]);
    }
    setConnectionSource(null);
    setActionPosition(null);
    setShowActionSheet(false);
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as EditorWorkflowNode[]);
      const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      if (removed.size > 0) setEdges((current) => current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)));
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  async function handleSave() {
    if (!workflowId || !workflow) return;
    setSaving(true);
    setSaveError(null);
    if (!workflow.name.trim()) {
      setSaveError('Workflow name cannot be blank.');
      setSaving(false);
      return;
    }
    try {
      const payload = {
        name: workflow.name,
        enabled: workflow.enabled,
        nodes: nodes.map(editorNodeToWorkflowNode),
        edges,
      };
      const validation = validateWorkflowGraph(payload);
      if (!validation.success) {
        setSaveError(validation.message);
        return;
      }
      await apiUpdateWorkflow(workflowId, payload);
    } catch {
      setSaveError('Could not save workflow. Check the graph and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!workflowId) return;
    const payload = {
      nodes: nodes.map(editorNodeToWorkflowNode),
      edges,
    };
    const validation = validateWorkflowGraph(payload);
    if (!validation.success) {
      setRunMessage(validation.message);
      return;
    }
    setRunning(true);
    setRunMessage(null);
    try {
      const result = await apiExecuteWorkflow(workflowId);
      setRunMessage(result.message);
    } catch {
      setRunMessage('Could not queue workflow');
    } finally {
      setRunning(false);
    }
  }

  function deleteSelectedNodes() {
    const selected = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (selected.size === 0) return;
    setNodes((current) => current.filter((node) => !selected.has(node.id)));
    setEdges((current) => current.filter((edge) => !selected.has(edge.source) && !selected.has(edge.target)));
  }

  function editNode(nodeId: string) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    setEditingNodeId(nodeId);
    if (node.data.kind === 'action') setShowActionSheet(true);
    else setShowTriggerSheet(true);
  }

  if (loadError) return <div className="p-6 text-red-600"><p>{loadError}</p><Link className="underline" to="/dashboard">Back to dashboard</Link></div>;
  if (!workflow) return <p className="p-6 text-muted-foreground">Loading workflow...</p>;

  return (
    <div className="h-screen flex flex-col">
      {showTriggerSheet && <TriggerSheet onClose={() => { setShowTriggerSheet(false); setEditingNodeId(null); }} initialKind={nodes.find((node) => node.id === editingNodeId)?.type as NodeKind | undefined} initialMetadata={nodes.find((node) => node.id === editingNodeId)?.data.metadata as Partial<import('common/types').PriceTriggerMetadata & import('common/types').TimerNodeMetadata> | undefined} onSelect={addTrigger} />}
      {showActionSheet && <ActionSheet onClose={() => { setShowActionSheet(false); setEditingNodeId(null); }} initialMetadata={nodes.find((node) => node.id === editingNodeId)?.data.metadata as Partial<import('common/types').TradingMetadata & import('common/types').PriceTriggerMetadata & import('common/types').TimerNodeMetadata> | undefined} initialCredentialId={nodes.find((node) => node.id === editingNodeId)?.credentialId} onSelect={addAction} />}
      <div className="flex items-center justify-between p-4 border-b">
        <input
          aria-label="Workflow name"
          className="min-w-52 rounded-md border px-3 py-2 text-xl font-semibold"
          value={workflow.name}
          onChange={(event) => setWorkflow({ ...workflow, name: event.target.value })}
          placeholder="Untitled workflow"
        />
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!workflowId) return;
              const enabled = !workflow.enabled;
              try {
                await apiUpdateWorkflow(workflowId, { name: workflow.name, enabled, nodes: nodes.map(editorNodeToWorkflowNode), edges });
                setWorkflow({ ...workflow, enabled });
              } catch {
                setSaveError('Could not change workflow status. Please try again.');
              }
            }}
            className="px-4 py-2 rounded-md border"
          >
            {workflow.enabled ? 'Pause' : 'Enable'}
          </button>
          <button
            onClick={() => openActionSheet()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
          >
            + Add task
          </button>
          <button onClick={deleteSelectedNodes} disabled={!nodes.some((node) => node.selected)} className="px-4 py-2 rounded-md border disabled:opacity-50">
            Delete selected
          </button>
          <button onClick={handleRun} disabled={running} className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50">
            {running ? 'Queueing...' : 'Run now'}
          </button>
          <Link
            to={`/workflow/${workflowId}/executions`}
            className="px-4 py-2 rounded-md border"
          >
            Executions
          </Link>
          <button onClick={async () => { if (!workflowId || !window.confirm('Duplicate this workflow?')) return; try { const duplicate = await apiDuplicateWorkflow(workflowId); navigate(`/workflow/${duplicate.id}`); } catch { setSaveError('Could not duplicate workflow.'); } }} className="px-4 py-2 rounded-md border">
            Duplicate
          </button>
          <button onClick={async () => { if (!workflowId || !window.confirm('Delete this workflow and its execution history?')) return; try { await apiDeleteWorkflow(workflowId); navigate('/dashboard'); } catch { setSaveError('Could not delete workflow.'); } }} className="px-4 py-2 rounded-md border text-red-600">
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      {runMessage && <p className="px-4 py-2 text-sm text-muted-foreground">{runMessage}</p>}
      {saveError && <p className="px-4 py-2 text-sm text-red-600">{saveError}</p>}
      <div className="flex-1 relative">
        <div className="absolute left-4 top-4 z-10 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Drag from a node handle to add the next task
        </div>
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) => setEdges((current) => addEdge(connection, current))}
          onConnectEnd={(_event, connectionState) => {
            if (!connectionState.isValid && connectionState.fromNode) {
              openActionSheet(connectionState.fromNode.id, connectionState.to ?? { x: 0, y: 0 });
            }
          }}
          onNodeDoubleClick={(_event, node) => editNode(node.id)}
          onPaneClick={() => {
            if (nodes.length > 0) openActionSheet();
          }}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
