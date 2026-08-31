import { useState, useCallback } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriggerSheet } from './TriggerSheet';
import { PriceTrigger} from '@/nodes/triggers/PriceTrigger';
import { Timer } from '@/nodes/triggers/Timer';
import { Lighter} from '@/nodes/actions/Lighter';
import { type PriceTriggerMetadata, type TimerNodeMetadata, type TradingMetadata } from 'common/types';
import { ActionSheet } from './ActionSheet';
import { Backpack } from '@/nodes/actions/Backpack';
import { HyperLiquid } from '@/nodes/actions/Hyperliquid';

const nodeTypes = {
  "price-trigger": PriceTrigger,
  "timer": Timer,
  "lighter": Lighter,
  "backpack": Backpack,
  "hyperliquid" : HyperLiquid

};

 
export type NodeKind = "price-trigger" | "timer" | "hyperliquid" | "backpack" | "lighter"; 

interface NodeType{
  type: NodeKind,
    data: {
      kind: "action" | "trigger",
      metadata: NodeMetadata,


    },
  id: string,
  position: { x: number, y: number }
}


export type NodeMetadata = TradingMetadata | PriceTriggerMetadata | TimerNodeMetadata;

interface Edge{
    id: string,
    source: string,
    target: string
}

 
export function CreateWorkflow() {
  const [nodes, setNodes] = useState<NodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectAction, setSelectAction] = useState<
   { position : {
          x: number,
     y: number
   },
      startingNodeId: string,
     
  } | null
    >(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showTriggerSheet, setShowTriggerSheet] = useState(true);
 
  const onNodesChange = useCallback(
    (changes: any) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: any) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (params : any) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );
  const onConnectEnd = useCallback(
    (_params: unknown, connectionInfo: any) => {
      if (!connectionInfo?.isValid) {
        setSelectAction({
          startingNodeId: connectionInfo.fromNode.id,
          position: connectionInfo.to ?? connectionInfo.from
        });
        setShowActionSheet(true);
      }
    },
    [],
  );
 
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {showTriggerSheet && !nodes.length && <TriggerSheet onSelect={(type, metadata) => {
        const newNode: NodeType = {
          id: Math.random().toString(),
          type,
          data: {
            kind: "trigger",
            metadata,
          },
          position: { x: 0, y: 0 }
        };

        setNodes((currentNodes) => [...currentNodes, newNode]);
        setShowTriggerSheet(false);
      }} />}
      {showActionSheet && <ActionSheet onClose={() => {
        setShowActionSheet(false);
        setSelectAction(null);
      }} onSelect={(type, metadata) => {
        const nodeId = Math.random().toString();
        const startingNodeId = selectAction?.startingNodeId;

        setNodes((currentNodes) => [...currentNodes, {
          id: nodeId,
          type,
          data: {
            kind: "action",
            metadata,
          },
          position: selectAction?.position ?? {
            x: 120 + (currentNodes.length % 3) * 240,
            y: 140 + Math.floor(currentNodes.length / 3) * 160,
          }
        }]);
        if (startingNodeId) {
          setEdges((currentEdges) => [...currentEdges, {
            id: `${startingNodeId} - ${nodeId}`,
            source: startingNodeId,
            target: nodeId,
          }]);
        }
        setSelectAction(null);
        setShowActionSheet(false);
      }} />
      }
      <div className="relative h-full w-full">
        <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-md border bg-background p-2 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setSelectAction(null);
              setShowActionSheet(true);
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            + Add trade action
          </button>
          <span className="flex items-center px-2 text-xs text-muted-foreground">
            Connect nodes by dragging from a handle
          </span>
        </div>
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => {
            if (nodes.length > 0) {
              setSelectAction(null);
              setShowActionSheet(true);
            }
          }}
          fitView
        />
      </div>
    </div>
  );

}
