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
          position: connectionInfo.from
        });
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
      {selectAction && <ActionSheet onSelect={(type, metadata) => {
        const nodeId = Math.random().toString();

        setNodes((currentNodes) => [...currentNodes, {
          id: nodeId,
          type,
          data: {
            kind: "action",
            metadata,
          },
          position: selectAction.position
        }]);
        setEdges((currentEdges) => [...currentEdges, {
          id: `${selectAction.startingNodeId} - ${nodeId}`,
          source: selectAction.startingNodeId,
          target: nodeId,
        }]);
        setSelectAction(null);
      }} />
      }
      <ReactFlow
        nodeTypes={nodeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        fitView
      />
    </div>
  );

}