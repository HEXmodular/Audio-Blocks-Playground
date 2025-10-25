// для обеспечения функций протягивания соединений в редакторе блоков.
// нужно для того чтобы два разных компонента могли использовать один и тот же обработчик перетаскивания соединений
// BlockInstanceComponent и ConnectionsRenderer

import { RefObject } from 'react';
import { BlockPort } from '@interfaces/block';
import { PendingConnection, Connection } from '@interfaces/connection';

import { v4 as uuidv4 } from 'uuid';
import BlockStateManager from '@state/BlockStateManager';
import ConnectionState from '@services/ConnectionState';

export interface ConnectionDragHandlerProps {
  svgRef: RefObject<SVGSVGElement>;
  updateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
}

export interface IConnectionDragHandler {
  pendingConnection: PendingConnection | null;
  draggedOverPort: { instanceId: string; portId: string } | null;
  handleStartConnectionDrag: (
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement,
  ) => void;
  dispose: () => void;
}

class ConnectionDragHandler implements IConnectionDragHandler {
  private static instance: ConnectionDragHandler | null = null;

  public pendingConnection: PendingConnection | null = null;
  public draggedOverPort: { instanceId: string; portId: string } | null = null;
  public onStateChange: () => void = () => {};

  private svgRef!: RefObject<SVGSVGElement>;
  // private blockInstances!: BlockInstance[];
  // private updateConnections!: (updater: (prev: Connection[]) => Connection[]) => void;

  private constructor() {
    // Private constructor to prevent direct instantiation
    this.handleGlobalMouseMove = this.handleGlobalMouseMove.bind(this);
    this.handleGlobalMouseUp = this.handleGlobalMouseUp.bind(this);
    this.handleStartConnectionDrag = this.handleStartConnectionDrag.bind(this);
    this.pendingConnectionValue = this.pendingConnectionValue.bind(this);

    document.addEventListener('mousemove', this.handleGlobalMouseMove);
    document.addEventListener('mouseup', this.handleGlobalMouseUp);
  }

  public pendingConnectionValue(): PendingConnection | null {
    return this.pendingConnection;  
  }

  public static getInstance(): ConnectionDragHandler {
    if (!ConnectionDragHandler.instance) {
      ConnectionDragHandler.instance = new ConnectionDragHandler();
    }
    return ConnectionDragHandler.instance;
  }

  private getPortElementCenter(portElement: HTMLElement, svgRef?: RefObject<SVGSVGElement>): { x: number; y: number } {
    const rect = portElement.getBoundingClientRect();
    // const svgRect = svgRef?.current?.getBoundingClientRect();
    // if (!svgRect) return { x: 0, y: 0 };
    return {
      x: rect.left + rect.width / 2, //- svgRect.left,
      y: rect.top + rect.height / 2, //- svgRect.top,
    };
  }

  public handleStartConnectionDrag(
    instanceId: string,
    port: BlockPort,
    isOutput: boolean,
    portElement: HTMLDivElement,
  ): void {
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
  }

  private handleGlobalMouseMove(e: MouseEvent): void {
    if (this.pendingConnection ) { //&& this.svgRef?.current
      // const svgRect = this.svgRef.current.getBoundingClientRect();
      const previousPendingX = this.pendingConnection.currentX;
      const previousPendingY = this.pendingConnection.currentY;

      this.pendingConnection = {
        ...this.pendingConnection,
        currentX: e.clientX, //- svgRect.left,
        currentY: e.clientY, //- svgRect.top,
      };

      let stateChanged = false;
      if (this.pendingConnection.currentX !== previousPendingX || this.pendingConnection.currentY !== previousPendingY) {
        stateChanged = true;
      }

      let newDraggedOverPortValue: { instanceId: string; portId: string } | null = null;
      const targetElement = e.target as HTMLElement;
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub');
      if (portStub) {
        const targetInstanceId = portStub.dataset.instanceId;
        const targetPortId = portStub.dataset.portId;
        const targetIsOutput = portStub.dataset.isOutput === 'true';
        const targetPortType = portStub.dataset.portType as BlockPort['type'];

        if (
          targetInstanceId &&
          targetPortId &&
          this.pendingConnection &&
          targetInstanceId !== this.pendingConnection.fromInstanceId &&
          targetIsOutput !== this.pendingConnection.fromIsOutput
        ) {
          const sourcePortType = this.pendingConnection.fromPort.type;
          let typesCompatible = false;
          if (sourcePortType === 'audio' && targetPortType === 'audio') typesCompatible = true;
          else if (sourcePortType === 'сс' && targetPortType === 'audio') typesCompatible = true;
          else if (
            (['trigger', 'gate'].includes(sourcePortType)) &&
            (['trigger', 'gate'].includes(targetPortType))
          ) typesCompatible = true;
          else if (sourcePortType === 'number' && targetPortType === 'number') typesCompatible = true;
          else if (sourcePortType === 'number' && targetPortType === 'string') typesCompatible = true;
          else if (sourcePortType === 'string' && targetPortType === 'string') typesCompatible = true;
          else if (sourcePortType === 'boolean' && targetPortType === 'boolean') typesCompatible = true;
          else if (sourcePortType === 'note' && targetPortType === 'note') typesCompatible = true;
          else if (sourcePortType === 'any' || targetPortType === 'any') typesCompatible = true;

          const toInstance = BlockStateManager.getBlockInstances().find((i) => i.instanceId === targetInstanceId);
          const toDef = toInstance ? toInstance.definition : undefined;
          const toPortDef = toDef?.inputs.find((p) => p.id === targetPortId);
          if (
            this.pendingConnection.fromIsOutput &&
            toPortDef?.audioParamTarget &&
            sourcePortType === 'audio' &&
            toPortDef?.type === 'audio'
          ) {
            typesCompatible = true;
          }

          if (typesCompatible) {
            newDraggedOverPortValue = { instanceId: targetInstanceId, portId: targetPortId };
          }
        }
      }

      if (
        this.draggedOverPort?.instanceId !== newDraggedOverPortValue?.instanceId ||
        this.draggedOverPort?.portId !== newDraggedOverPortValue?.portId
      ) {
        this.draggedOverPort = newDraggedOverPortValue;
        stateChanged = true;
      }

    }
  }

  private handleGlobalMouseUp(e: MouseEvent): void {
    if (this.pendingConnection) {
      const targetElement = e.target as HTMLElement;
      const portStub = targetElement.closest<HTMLElement>('.js-port-stub');

      if (portStub && this.draggedOverPort) {
        const targetInstanceId = this.draggedOverPort.instanceId;
        const targetPortId = this.draggedOverPort.portId;

        const newConnection: Connection = {
          id: `conn_${uuidv4()}`,
          fromInstanceId: this.pendingConnection.fromIsOutput
            ? this.pendingConnection.fromInstanceId
            : targetInstanceId,
          fromOutputId: this.pendingConnection.fromIsOutput
            ? this.pendingConnection.fromPort.id
            : targetPortId,
          toInstanceId: this.pendingConnection.fromIsOutput
            ? targetInstanceId
            : this.pendingConnection.fromInstanceId,
          toInputId: this.pendingConnection.fromIsOutput
            ? targetPortId
            : this.pendingConnection.fromPort.id,
        };
        
        const toInstance = BlockStateManager.getBlockInstances().find(b => b.instanceId === newConnection.toInstanceId);
        const toPort = toInstance?.definition.inputs.find(p => p.id === newConnection.toInputId);

        const fromInstance = BlockStateManager.getBlockInstances().find(b => b.instanceId === newConnection.fromInstanceId);
        const fromPort = fromInstance?.definition.outputs.find(p => p.id === newConnection.fromOutputId);

        if (toPort?.type === 'audio' && fromPort?.type === 'audio') {
          ConnectionState.updateConnections((prev) => [...prev, newConnection]);
        } else {
          ConnectionState.updateConnections((prev) => {
            const filtered = prev.filter(
              (c) => !(c.toInstanceId === newConnection.toInstanceId && c.toInputId === newConnection.toInputId)
            );
            return [...filtered, newConnection];
          });
        }
      }
      this.pendingConnection = null;
      this.draggedOverPort = null;
    }
  }

  public dispose(): void {
    document.removeEventListener('mousemove', this.handleGlobalMouseMove);
    document.removeEventListener('mouseup', this.handleGlobalMouseUp);
  }
}

export default ConnectionDragHandler.getInstance();
