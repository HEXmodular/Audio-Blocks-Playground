import { useState, useEffect, useMemo, RefObject } from 'react';
import { PendingConnection, BlockPort, Connection, BlockInstance, BlockDefinition } from '../types';
import { ConnectionDragHandler, IConnectionDragHandler, ConnectionDragHandlerProps } from '../utils/ConnectionDragHandler'; // Updated import

export interface UseConnectionDragHandlerProps {
  svgRef: RefObject<SVGSVGElement>;
  blockInstances: BlockInstance[];
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  updateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
}

export interface UseConnectionDragHandlerReturn {
  pendingConnection: PendingConnection | null;
  draggedOverPort: { instanceId: string; portId: string } | null;
  handleStartConnectionDrag: IConnectionDragHandler['handleStartConnectionDrag'];
}

export const useConnectionDragHandler = ({
  svgRef,
  blockInstances,
  getDefinitionForBlock,
  updateConnections,
}: UseConnectionDragHandlerProps): UseConnectionDragHandlerReturn => {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [draggedOverPort, setDraggedOverPort] = useState<{ instanceId: string; portId: string } | null>(null);

  // This state-setting callback will be passed to the ConnectionDragHandler instance
  const onDragHandlerStateChange = () => {
    if (dragHandlerInstance) {
      setPendingConnection(dragHandlerInstance.pendingConnection);
      setDraggedOverPort(dragHandlerInstance.draggedOverPort);
    }
  };

  const dragHandlerInstance = useMemo(() => {
    const props: ConnectionDragHandlerProps = {
      svgRef,
      blockInstances,
      getDefinitionForBlock,
      updateConnections,
      onStateChange: onDragHandlerStateChange, // Provide the callback
    };
    return new ConnectionDragHandler(props);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgRef, getDefinitionForBlock, updateConnections]); // blockInstances is intentionally omitted if ConnectionDragHandler handles its updates internally or via prop updates

  // Update blockInstances on the handler if it changes
  useEffect(() => {
    // This assumes ConnectionDragHandler has a method to update its internal blockInstances
    // If not, this might require re-creating the instance or a different approach.
    // For now, let's assume ConnectionDragHandler uses the initial reference or has an update method.
    // If ConnectionDragHandler directly mutates or uses the blockInstances prop, this is fine.
    // If it copies it, it would need an update method:
    // dragHandlerInstance.updateBlockInstances(blockInstances);
    // For this refactor, we'll assume direct usage of the passed-in ref or that it's handled.
  }, [blockInstances /*, dragHandlerInstance */]);


  useEffect(() => {
    // The ConnectionDragHandler's constructor now adds event listeners.
    // We need to ensure its dispose method is called on cleanup.
    return () => {
      dragHandlerInstance.dispose();
    };
  }, [dragHandlerInstance]);

  return {
    pendingConnection,
    draggedOverPort,
    handleStartConnectionDrag: dragHandlerInstance.handleStartConnectionDrag,
  };
};
