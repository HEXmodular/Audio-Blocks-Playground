import { RefObject } from 'react'; // Assuming React.RefObject for svgRef
import { PendingConnection, BlockPort, Connection, BlockInstance, BlockDefinition } from '@interfaces/common';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectionDragHandlerProps {
  svgRef: RefObject<SVGSVGElement>;
  blockInstances: BlockInstance[];
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  updateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
  onStateChange: () => void; // Callback to trigger re-render in the consuming component
}

export interface IConnectionDragHandler {
  pendingConnection: PendingConnection | null;
  draggedOverPort: { instanceId: string; portId: string } | null;
  handleStartConnectionDrag: (
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement // Changed from HTMLElement for more specificity if known
  ) => void;
  dispose: () => void; // Method to clean up event listeners
}

export class ConnectionDragHandler implements IConnectionDragHandler {
  public pendingConnection: PendingConnection | null = null;
  public draggedOverPort: { instanceId: string; portId: string } | null = null;

  private svgRef: RefObject<SVGSVGElement>;
  private blockInstances: BlockInstance[];
  private getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  private updateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
  private onStateChange: () => void;

  constructor(props: ConnectionDragHandlerProps) {
    this.svgRef = props.svgRef;
    this.blockInstances = props.blockInstances; // Store as a reference, assuming it might change externally. Consider how to update if it does.
    this.getDefinitionForBlock = props.getDefinitionForBlock;
    this.updateConnections = props.updateConnections;
    this.onStateChange = props.onStateChange;

    // Bind event handlers
    this.handleGlobalMouseMove = this.handleGlobalMouseMove.bind(this);
    this.handleGlobalMouseUp = this.handleGlobalMouseUp.bind(this);
    this.handleStartConnectionDrag = this.handleStartConnectionDrag.bind(this);

    // Add event listeners
    document.addEventListener('mousemove', this.handleGlobalMouseMove);
    document.addEventListener('mouseup', this.handleGlobalMouseUp);
  }

  private getPortElementCenter(portElement: HTMLElement): { x: number, y: number } {
    // Implementation from hook
    const rect = portElement.getBoundingClientRect();
    const svgRect = this.svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 };
    return {
      x: rect.left + rect.width / 2 - svgRect.left,
      y: rect.top + rect.height / 2 - svgRect.top,
    };
  }

  public handleStartConnectionDrag(
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement
  ): void {
    // Implementation from hook
    const portCenter = this.getPortElementCenter(portElement);
    this.pendingConnection = {
      fromInstanceId: instanceId,
      fromPort: port,
      fromIsOutput: isOutput,
      startX: portCenter.x,
      startY: portCenter.y,
      currentX: portCenter.x,
      currentY: portCenter.y,
    };
    this.onStateChange();
  }

  private handleGlobalMouseMove(e: MouseEvent): void {
    // Implementation from hook
    if (this.pendingConnection && this.svgRef.current) {
      const svgRect = this.svgRef.current.getBoundingClientRect();
      this.pendingConnection = {
        ...this.pendingConnection,
        currentX: e.clientX - svgRect.left,
        currentY: e.clientY - svgRect.top,
      };

      // The following block for newDraggedOverPort was redundant and the variable unused.
      // The logic is correctly handled by newDraggedOverPortValue later.
      // let newDraggedOverPort: { instanceId: string; portId: string } | null = null;
      // const targetElement = e.target as HTMLElement;
      // const portStub = targetElement.closest<HTMLElement>('.js-port-stub');
      // if (portStub) {
      //   const targetInstanceId = portStub.dataset.instanceId;
      //   const targetPortId = portStub.dataset.portId;
      //   const targetIsOutput = portStub.dataset.isOutput === 'true';
      //   const targetPortType = portStub.dataset.portType as BlockPort['type'];

      //   if (targetInstanceId && targetPortId && this.pendingConnection &&
      //       targetInstanceId !== this.pendingConnection.fromInstanceId &&
      //       targetIsOutput !== this.pendingConnection.fromIsOutput) {

      //     const sourcePortType = this.pendingConnection.fromPort.type;
      //     let typesCompatible = false;
      //     if (sourcePortType === 'audio' && targetPortType === 'audio') typesCompatible = true;
      //     else if ((sourcePortType === 'trigger' || sourcePortType === 'gate') && (targetPortType === 'trigger' || targetPortType === 'gate')) typesCompatible = true;
      //     else if (sourcePortType === 'number' && targetPortType === 'number') typesCompatible = true;
      //     else if (sourcePortType === 'string' && targetPortType === 'string') typesCompatible = true;
      //     else if (sourcePortType === 'boolean' && targetPortType === 'boolean') typesCompatible = true;
      //     else if (sourcePortType === 'any' || targetPortType === 'any') typesCompatible = true;

      //     const toInstance = this.blockInstances.find(i => i.instanceId === targetInstanceId);
      //     const toDef = toInstance ? this.getDefinitionForBlock(toInstance) : undefined;
      //     const toPortDef = toDef?.inputs.find(p => p.id === targetPortId);
      //     // Check for audio param target specifically for output -> input connections
      //     if (this.pendingConnection.fromIsOutput && toPortDef?.audioParamTarget && sourcePortType === 'audio' && toPortDef?.type === 'audio') {
      //       typesCompatible = true;
      //     }


      //     if (typesCompatible) {
      //       newDraggedOverPort = { instanceId: targetInstanceId, portId: targetPortId };
      //     }
      //   }
      // }
      const previousPendingX = this.pendingConnection.currentX;
      const previousPendingY = this.pendingConnection.currentY;

      this.pendingConnection = {
        ...this.pendingConnection,
        currentX: e.clientX - svgRect.left,
        currentY: e.clientY - svgRect.top,
      };

      let stateChanged = false;
      if (this.pendingConnection.currentX !== previousPendingX || this.pendingConnection.currentY !== previousPendingY) {
        stateChanged = true;
      }

      let newDraggedOverPortValue: { instanceId: string; portId: string } | null = null;
      const targetElement = e.target as HTMLElement; // Re-declare targetElement here as the previous one was part of the removed block
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub'); // Re-declare portStub here
      if (portStub) {
        const targetInstanceId = portStub.dataset.instanceId;
        const targetPortId = portStub.dataset.portId;
        const targetIsOutput = portStub.dataset.isOutput === 'true';
        const targetPortType = portStub.dataset.portType as BlockPort['type'];

        if (targetInstanceId && targetPortId && this.pendingConnection && // this.pendingConnection is already checked by outer if
            targetInstanceId !== this.pendingConnection.fromInstanceId &&
            targetIsOutput !== this.pendingConnection.fromIsOutput) {

          const sourcePortType = this.pendingConnection.fromPort.type;
          let typesCompatible = false;
          if (sourcePortType === 'audio' && targetPortType === 'audio') typesCompatible = true;
          else if ((sourcePortType === 'trigger' || sourcePortType === 'gate') && (targetPortType === 'trigger' || targetPortType === 'gate')) typesCompatible = true;
          else if (sourcePortType === 'number' && targetPortType === 'number') typesCompatible = true;
          else if (sourcePortType === 'string' && targetPortType === 'string') typesCompatible = true;
          else if (sourcePortType === 'boolean' && targetPortType === 'boolean') typesCompatible = true;
          else if (sourcePortType === 'any' || targetPortType === 'any') typesCompatible = true;

          const toInstance = this.blockInstances.find(i => i.instanceId === targetInstanceId);
          const toDef = toInstance ? this.getDefinitionForBlock(toInstance) : undefined;
          const toPortDef = toDef?.inputs.find(p => p.id === targetPortId);
          if (this.pendingConnection.fromIsOutput && toPortDef?.audioParamTarget && sourcePortType === 'audio' && toPortDef?.type === 'audio') {
            typesCompatible = true;
          }

          if (typesCompatible) {
            newDraggedOverPortValue = { instanceId: targetInstanceId, portId: targetPortId };
          }
        }
      }

      if (this.draggedOverPort?.instanceId !== newDraggedOverPortValue?.instanceId || this.draggedOverPort?.portId !== newDraggedOverPortValue?.portId) {
        this.draggedOverPort = newDraggedOverPortValue;
        stateChanged = true;
      }

      if (stateChanged) {
        this.onStateChange();
      }
    }
  }

  private handleGlobalMouseUp(e: MouseEvent): void {
    // Implementation from hook
    if (this.pendingConnection) {
      const targetElement = e.target as HTMLElement;
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub');

      if (portStub && this.draggedOverPort) { // Use this.draggedOverPort for consistency as it's already validated
        const targetInstanceId = this.draggedOverPort.instanceId;
        const targetPortId = this.draggedOverPort.portId;
        // Assuming this.draggedOverPort correctly reflects the port mouse is over from handleGlobalMouseMove
        // The conditions for compatibility (instanceId different, isOutput different) are already checked in handleGlobalMouseMove to set draggedOverPort

        const newConnection: Connection = {
            id: `conn_${uuidv4()}`,
            fromInstanceId: this.pendingConnection.fromIsOutput ? this.pendingConnection.fromInstanceId : targetInstanceId,
            fromOutputId: this.pendingConnection.fromIsOutput ? this.pendingConnection.fromPort.id : targetPortId,
            toInstanceId: this.pendingConnection.fromIsOutput ? targetInstanceId : this.pendingConnection.fromInstanceId,
            toInputId: this.pendingConnection.fromIsOutput ? targetPortId : this.pendingConnection.fromPort.id,
        };
        this.updateConnections(prev => {
            // Remove existing connection to the same input port, if any
            const filtered = prev.filter(c => !(c.toInstanceId === newConnection.toInstanceId && c.toInputId === newConnection.toInputId));
            return [...filtered, newConnection];
        });
      }
      this.pendingConnection = null;
      this.draggedOverPort = null;
      this.onStateChange();
    }
  }

  public dispose(): void {
    document.removeEventListener('mousemove', this.handleGlobalMouseMove);
    document.removeEventListener('mouseup', this.handleGlobalMouseUp);
    // No other specific cleanup in the original hook's useEffect return
  }
}
