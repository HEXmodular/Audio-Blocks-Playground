
import { useState, useCallback, useEffect, RefObject } from 'react';
import { PendingConnection, BlockPort, Connection, BlockInstance, BlockDefinition } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface UseConnectionDragHandlerProps {
  svgRef: RefObject<SVGSVGElement>;
  blockInstances: BlockInstance[];
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  updateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
}

export interface UseConnectionDragHandlerReturn {
  pendingConnection: PendingConnection | null;
  draggedOverPort: { instanceId: string; portId: string } | null;
  handleStartConnectionDrag: (
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement
  ) => void;
}

export const useConnectionDragHandler = ({
  svgRef,
  blockInstances,
  getDefinitionForBlock,
  updateConnections,
}: UseConnectionDragHandlerProps): UseConnectionDragHandlerReturn => {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [draggedOverPort, setDraggedOverPort] = useState<{ instanceId: string; portId: string } | null>(null);

  const getPortElementCenter = useCallback((portElement: HTMLElement): { x: number, y: number } => {
    const rect = portElement.getBoundingClientRect();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 };
    return {
      x: rect.left + rect.width / 2 - svgRect.left,
      y: rect.top + rect.height / 2 - svgRect.top,
    };
  }, [svgRef]);

  const handleStartConnectionDrag = useCallback((
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement
  ) => {
    const portCenter = getPortElementCenter(portElement);
    setPendingConnection({
      fromInstanceId: instanceId,
      fromPort: port,
      fromIsOutput: isOutput,
      startX: portCenter.x,
      startY: portCenter.y,
      currentX: portCenter.x,
      currentY: portCenter.y,
    });
  }, [getPortElementCenter]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (pendingConnection && svgRef.current) {
      const svgRect = svgRef.current.getBoundingClientRect();
      setPendingConnection(prev => prev ? ({
        ...prev,
        currentX: e.clientX - svgRect.left,
        currentY: e.clientY - svgRect.top,
      }) : null);

      const targetElement = e.target as HTMLElement;
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub');
      if (portStub) {
        const targetInstanceId = portStub.dataset.instanceId;
        const targetPortId = portStub.dataset.portId;
        const targetIsOutput = portStub.dataset.isOutput === 'true';
        const targetPortType = portStub.dataset.portType as BlockPort['type'];

        if (targetInstanceId && targetPortId && targetInstanceId !== pendingConnection.fromInstanceId && targetIsOutput !== pendingConnection.fromIsOutput) {
          const sourcePortType = pendingConnection.fromPort.type;
          let typesCompatible = false;
          if (sourcePortType === 'audio' && targetPortType === 'audio') typesCompatible = true;
          else if ((sourcePortType === 'trigger' || sourcePortType === 'gate') && (targetPortType === 'trigger' || targetPortType === 'gate')) typesCompatible = true;
          else if (sourcePortType === 'number' && targetPortType === 'number') typesCompatible = true;
          else if (sourcePortType === 'string' && targetPortType === 'string') typesCompatible = true;
          else if (sourcePortType === 'boolean' && targetPortType === 'boolean') typesCompatible = true;
          else if (sourcePortType === 'any' || targetPortType === 'any') typesCompatible = true;
          
          const toInstance = blockInstances.find(i => i.instanceId === targetInstanceId);
          const toDef = toInstance ? getDefinitionForBlock(toInstance) : undefined;
          const toPortDef = toDef?.inputs.find(p => p.id === targetPortId);
          if (sourcePortType === 'audio' && toPortDef?.audioParamTarget && toPortDef?.type === 'audio') {
            typesCompatible = true;
          }

          if (typesCompatible) {
            setDraggedOverPort({ instanceId: targetInstanceId, portId: targetPortId });
            return;
          }
        }
      }
      setDraggedOverPort(null);
    }
  }, [pendingConnection, svgRef, blockInstances, getDefinitionForBlock]);

  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
    if (pendingConnection) {
      const targetElement = e.target as HTMLElement;
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub');

      if (portStub) {
        const targetInstanceId = portStub.dataset.instanceId;
        const targetPortId = portStub.dataset.portId;
        const targetIsOutput = portStub.dataset.isOutput === 'true';
        const targetPortType = portStub.dataset.portType as BlockPort['type'];

        if (targetInstanceId && targetPortId && targetInstanceId !== pendingConnection.fromInstanceId && targetIsOutput !== pendingConnection.fromIsOutput) {
            const sourcePortType = pendingConnection.fromPort.type;
            let typesCompatible = false;
            if (sourcePortType === 'audio' && targetPortType === 'audio') typesCompatible = true;
            else if ((sourcePortType === 'trigger' || sourcePortType === 'gate') && (targetPortType === 'trigger' || targetPortType === 'gate')) typesCompatible = true;
            else if (sourcePortType === 'number' && targetPortType === 'number') typesCompatible = true;
            else if (sourcePortType === 'string' && targetPortType === 'string') typesCompatible = true;
            else if (sourcePortType === 'boolean' && targetPortType === 'boolean') typesCompatible = true;
            else if (sourcePortType === 'any' || targetPortType === 'any') typesCompatible = true;

            const toInstance = blockInstances.find(i => i.instanceId === targetInstanceId);
            const toDef = toInstance ? getDefinitionForBlock(toInstance) : undefined;
            const toPortDef = toDef?.inputs.find(p => p.id === targetPortId);
            if (pendingConnection.fromIsOutput && toPortDef?.audioParamTarget && sourcePortType === 'audio' && toPortDef?.type === 'audio') {
                typesCompatible = true;
            }

            if(typesCompatible){
                const newConnection: Connection = {
                    id: `conn_${uuidv4()}`,
                    fromInstanceId: pendingConnection.fromIsOutput ? pendingConnection.fromInstanceId : targetInstanceId,
                    fromOutputId: pendingConnection.fromIsOutput ? pendingConnection.fromPort.id : targetPortId,
                    toInstanceId: pendingConnection.fromIsOutput ? targetInstanceId : pendingConnection.fromInstanceId,
                    toInputId: pendingConnection.fromIsOutput ? targetPortId : pendingConnection.fromPort.id,
                };
                updateConnections(prev => [
                    ...prev.filter(c => !(c.toInstanceId === newConnection.toInstanceId && c.toInputId === newConnection.toInputId)),
                    newConnection
                ]);
            }
        }
      }
      setPendingConnection(null);
      setDraggedOverPort(null);
    }
  }, [pendingConnection, updateConnections, blockInstances, getDefinitionForBlock]);

  useEffect(() => {
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  return {
    pendingConnection,
    draggedOverPort,
    handleStartConnectionDrag,
  };
};
