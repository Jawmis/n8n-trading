import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { apiExecuteWorkflow, apiGetWorkflow, apiUpdateWorkflow, type Workflow } from '@/lib/http';
import { TriggerSheet } from '@/component/TriggerSheet';
import { ActionSheet } from '@/component/ActionSheet';
import { Timer } from '@/nodes/triggers/Timer';
import { PriceTrigger } from '@/nodes/triggers/PriceTrigger';
import { Lighter } from '@/nodes/actions/Lighter';
import { Backpack } from '@/nodes/actions/Backpack';
import { HyperLiquid } from '@/nodes/actions/Hyperliquid';
import type { NodeKind, NodeMetadata } from '@/component/CreateWorkflow';

const nodeTypes = {
  timer: Timer,
  'price-trigger': PriceTrigger,
  lighter: Lighter,
  backpack: Backpack,
  hyperliquid: HyperLiquid,
};


export default function WorkflowDetail() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [showTriggerSheet, setShowTriggerSheet] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [actionPosition, setActionPosition] = useState<{ x: number; y: number } | null>(null);

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
      if (wf.nodes.length === 0) setShowTriggerSheet(true);
    });
  }, [workflowId]);

  function openActionSheet(source: string | null = null, position: { x: number; y: number } | null = null) {
    setConnectionSource(source);
    setActionPosition(position);
    setShowActionSheet(true);
  }

  function addTrigger(type: NodeKind, metadata: NodeMetadata) {
    const node: Node = {
      id: crypto.randomUUID(), type, position: { x: 120, y: 220 },
      data: { kind: 'trigger', metadata },
    };
    setNodes([node]);
    setShowTriggerSheet(false);
  }

  function addAction(type: NodeKind, metadata: NodeMetadata) {
    const nodeId = crypto.randomUUID();
    const position = actionPosition ?? { x: 360 + nodes.length * 40, y: 220 + nodes.length * 30 };
    setNodes((current) => [...current, { id: nodeId, type, position, data: { kind: 'action', metadata } }]);
    if (connectionSource) {
      setEdges((current) => [...current, { id: `${connectionSource}-${nodeId}`, source: connectionSource, target: nodeId }]);
    }
    setConnectionSource(null);
    setActionPosition(null);
    setShowActionSheet(false);
  }

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

  async function handleRun() {
    if (!workflowId) return;
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

  if (!workflow) return <p className="p-6 text-muted-foreground">Loading workflow...</p>;

  return (
    <div className="h-screen flex flex-col">
      {showTriggerSheet && <TriggerSheet onSelect={addTrigger} />}
      {showActionSheet && <ActionSheet onClose={() => setShowActionSheet(false)} onSelect={addAction} />}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-semibold">Workflow {workflow._id}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openActionSheet()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
          >
            + Add task
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
          onConnectEnd={(_event, connectionState: any) => {
            if (!connectionState.isValid && connectionState.fromNode) {
              openActionSheet(connectionState.fromNode.id, connectionState.to ?? connectionState.from);
            }
          }}
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
