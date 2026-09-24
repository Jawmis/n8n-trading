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
import { apiDeleteWorkflow, apiDuplicateWorkflow, apiExecuteWorkflow, apiGetWorkflow, apiUpdateWorkflow, apiPublishWorkflow, apiShareWorkflow, apiSetWorkflowEnabled, apiError, type Workflow } from '@/lib/http';
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
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<'viewer' | 'editor' | 'remove'>('viewer');
  const [savedName, setSavedName] = useState('');
  const [savedGraph, setSavedGraph] = useState('');
  const canEdit = workflow?.role !== 'viewer';
  const isOwner = workflow?.role === 'owner';
  const graphJson = JSON.stringify({ nodes: nodes.map(editorNodeToWorkflowNode), edges: edges.map(({ id, source, target }) => ({ id, source, target })) });
  const dirty = !!workflow && (workflow.name !== savedName || graphJson !== savedGraph);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  useEffect(() => {
    if (!workflowId) return;
    let active = true;
    apiGetWorkflow(workflowId).then((wf) => {
      if (!active) return;
      setLoadError(null);
      setWorkflow(wf);
      setSavedName(wf.name);
      const editorNodes = wf.nodes.map(workflowNodeToEditorNode);
      setNodes(editorNodes);
      setEdges(wf.edges);
      setSavedGraph(JSON.stringify({ nodes: editorNodes.map(editorNodeToWorkflowNode), edges: wf.edges.map(({ id, source, target }) => ({ id, source, target })) }));
      if (wf.nodes.length === 0) setShowTriggerSheet(true);
    }).catch(() => { if (active) setLoadError('Could not load this workflow. Please try again.'); });
    return () => { active = false; };
  }, [workflowId]);

  function openActionSheet(source: string | null = null, position: { x: number; y: number } | null = null) {
    if (!canEdit) return;
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
      setNodes((current) => [...current, node]);
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
    const source = connectionSource ?? nodes.at(-1)?.id;
    if (source) {
      setEdges((current) => [...current, { id: `${source}-${nodeId}`, source, target: nodeId }]);
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
        edges: edges.map(({ id, source, target }) => ({ id, source, target })),
      };
      const validation = validateWorkflowGraph(payload);
      if (!validation.success) {
        setSaveError(validation.message);
        return;
      }
      const result = await apiUpdateWorkflow(workflowId, { ...payload, revision: workflow.revision });
      setWorkflow({ ...workflow, ...payload, ...result });
      setSavedName(payload.name);
      setSavedGraph(JSON.stringify({ nodes: payload.nodes, edges: payload.edges }));
      setRunMessage('Draft saved. Publish when ready to run this version.');
    } catch (error) {
      setSaveError(apiError(error, 'Could not save workflow. Check the graph and try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!workflowId || !workflow) return;
    if (dirty || workflow.state !== 'published') { setRunMessage('Save and publish your changes before running.'); return; }
    const payload = {
      nodes: nodes.map(editorNodeToWorkflowNode),
      edges: edges.map(({ id, source, target }) => ({ id, source, target })),
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
    } catch (error) {
      setRunMessage(apiError(error, 'Could not queue workflow'));
    } finally {
      setRunning(false);
    }
  }

  function deleteSelectedNodes() {
    const selected = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (selected.size === 0) return;
    if (!window.confirm('Delete the selected nodes and their connections?')) return;
    setNodes((current) => current.filter((node) => !selected.has(node.id)));
    setEdges((current) => current.filter((edge) => !selected.has(edge.source) && !selected.has(edge.target)));
  }

  function editNode(nodeId: string) {
    if (!canEdit) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    setEditingNodeId(nodeId);
    if (node.data.kind === 'action') setShowActionSheet(true);
    else setShowTriggerSheet(true);
  }

  if (loadError) return <div className="p-6 text-red-600"><p>{loadError}</p><button className="underline" onClick={() => window.location.reload()}>Retry</button> · <Link className="underline" to="/dashboard">Back to dashboard</Link></div>;
  if (!workflow) return <p className="p-6 text-muted-foreground">Loading workflow...</p>;

  return (
    <div className="h-screen flex flex-col">
      {showTriggerSheet && <TriggerSheet onClose={() => { setShowTriggerSheet(false); setEditingNodeId(null); }} initialKind={nodes.find((node) => node.id === editingNodeId)?.type as NodeKind | undefined} initialMetadata={nodes.find((node) => node.id === editingNodeId)?.data.metadata as Partial<import('common/types').PriceTriggerMetadata & import('common/types').TimerNodeMetadata> | undefined} onSelect={addTrigger} />}
      {showActionSheet && <ActionSheet onClose={() => { setShowActionSheet(false); setEditingNodeId(null); }} initialMetadata={nodes.find((node) => node.id === editingNodeId)?.data.metadata as Partial<import('common/types').TradingMetadata & import('common/types').PriceTriggerMetadata & import('common/types').TimerNodeMetadata> | undefined} initialCredentialId={nodes.find((node) => node.id === editingNodeId)?.credentialId} onSelect={addAction} />}
      <div className="flex items-center justify-between p-4 border-b">
        <input
          aria-label="Workflow name"
          disabled={!canEdit}
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
                const result = await apiSetWorkflowEnabled(workflowId, workflow.revision, enabled);
                setWorkflow({ ...workflow, ...result, enabled });
              } catch (error) {
                setSaveError(apiError(error, 'Could not change workflow status. Please try again.'));
              }
            }}
            className="px-4 py-2 rounded-md border"
            disabled={!isOwner || saving}
          >
            {workflow.enabled ? 'Pause' : 'Enable'}
          </button>
          <button
            onClick={() => openActionSheet()}
            disabled={!canEdit}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
          >
            + Add task
          </button>
          {!nodes.some((node) => node.data.kind === 'trigger') && canEdit && <button onClick={() => setShowTriggerSheet(true)}>Add trigger</button>}
          <button onClick={deleteSelectedNodes} disabled={!canEdit || !nodes.some((node) => node.selected)} className="px-4 py-2 rounded-md border disabled:opacity-50">
            Delete selected
          </button>
          <button onClick={handleRun} disabled={running || !isOwner || !workflow.enabled || dirty || workflow.state !== 'published'} className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50">
            {running ? 'Queueing...' : 'Run now'}
          </button>
          <Link
            to={`/workflow/${workflowId}/executions`}
            onClick={(event) => { if (dirty && !window.confirm('Leave with unsaved changes?')) event.preventDefault(); }}
            className="px-4 py-2 rounded-md border"
          >
            Executions
          </Link>
          <button disabled={!isOwner} onClick={async () => { if (!workflowId || !window.confirm('Duplicate this workflow?')) return; try { const duplicate = await apiDuplicateWorkflow(workflowId); navigate(`/workflow/${duplicate.id}`); } catch (error) { setSaveError(apiError(error, 'Could not duplicate workflow.')); } }} className="px-4 py-2 rounded-md border">
            Duplicate
          </button>
          <button disabled={!isOwner} onClick={async () => { if (!workflowId || !window.confirm('Delete this workflow? Its execution and audit records will be retained.')) return; try { await apiDeleteWorkflow(workflowId); navigate('/dashboard'); } catch (error) { setSaveError(apiError(error, 'Could not delete workflow.')); } }} className="px-4 py-2 rounded-md border text-red-600">
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b p-3 text-sm">
        <span>{workflow.role} · {workflow.state} · revision {workflow.revision}{workflow.published ? ` · published version ${workflow.published.revision}` : ' · never published'}{dirty ? ' · unsaved changes' : ''}</span>
        {isOwner && <>
          <button className="rounded border px-3 py-1" disabled={dirty || saving || workflow.state === 'published'} onClick={async () => { if (!workflowId) return; setSaving(true); try { const result = await apiPublishWorkflow(workflowId, workflow.revision); setWorkflow({ ...workflow, ...result }); setSaveError(null); } catch (error) { setSaveError(apiError(error, 'Could not publish workflow.')); } finally { setSaving(false); } }}>Publish saved draft</button>
          <input aria-label="Collaborator username" placeholder="Existing username" className="rounded border px-2 py-1" value={memberName} onChange={(event) => setMemberName(event.target.value)} />
          <select aria-label="Collaborator role" value={memberRole} onChange={(event) => setMemberRole(event.target.value as typeof memberRole)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="remove">Remove access</option></select>
          <button disabled={!memberName || saving} onClick={async () => { if (!workflowId || !window.confirm(`Change access for ${memberName} to ${memberRole}?`)) return; try { const result = await apiShareWorkflow(workflowId, memberName, memberRole); setWorkflow({ ...workflow, ...result }); setRunMessage('Sharing updated.'); } catch (error) { setSaveError(apiError(error, 'Could not update sharing.')); } }}>Update access</button>
          <span>{workflow.members.length} collaborator(s)</span>
        </>}
      </div>
      {runMessage && <p className="px-4 py-2 text-sm text-muted-foreground">{runMessage}</p>}
      {saveError && <p role="alert" className="px-4 py-2 text-sm text-red-600">{saveError} <button className="underline" onClick={() => { if (window.confirm('Discard local changes and reload?')) window.location.reload(); }}>Reload saved workflow</button></p>}
      <div className="flex-1 relative">
        <div className="absolute left-4 top-4 z-10 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Drag from a node handle to add the next task
        </div>
        <ReactFlow
          nodeTypes={nodeTypes}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          deleteKeyCode={null}
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
