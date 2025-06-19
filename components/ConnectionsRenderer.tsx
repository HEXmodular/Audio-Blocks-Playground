import React from 'react';
import { getPortColor as getBlockPortBgColor } from './BlockInstanceComponent';
import { ConnectionState } from '@services/ConnectionState';
import { BlockStateManager } from '@state/BlockStateManager';

const getPortElementCenterForConnectionLine = (
    portElement: Element | null,
    svgRef: React.RefObject<SVGSVGElement>
): { x: number; y: number } => {
    if (!portElement) return { x: 0, y: 0 }; // Return 0,0 if element is not found
    const rect = portElement.getBoundingClientRect();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 }; // Should not happen if svgRef is valid
    return {
        x: rect.left + rect.width / 2 - svgRect.left,
        y: rect.top + rect.height / 2 - svgRect.top,
    };
};

interface ConnectionsRendererProps {
    svgRef: React.RefObject<SVGSVGElement>;
}

const ConnectionsRenderer: React.FC<ConnectionsRendererProps> = ({
    svgRef,
}) => {
    const connections = ConnectionState.getInstance().getConnections();
    const blockInstances = BlockStateManager.getInstance().getBlockInstances();
    const getDefinitionForBlock = BlockStateManager.getInstance().getDefinitionForBlock;
    const onUpdateConnections = ConnectionState.getInstance().updateConnections;

    return (
        <>
            {connections.map(conn => {
                const fromInstance = blockInstances.find(b => b?.instanceId === conn.fromInstanceId);
                const toInstance = blockInstances.find(b => b?.instanceId === conn.toInstanceId);
                if (!fromInstance || !toInstance) return null;

                const fromDef = getDefinitionForBlock(fromInstance);
                const toDef = getDefinitionForBlock(toInstance);
                if (!fromDef || !toDef) return null;

                const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
                const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);
                if (!outputPortDef || !inputPortDef) return null;

                // Querying the DOM directly can be problematic in React if elements are not yet rendered
                // or if their IDs/attributes change. Assuming these elements are stable when this renders.
                let outputPortElem = document.querySelector(`[data-instance-id="${conn.fromInstanceId}"] [data-port-id="${conn.fromOutputId}"]`);
                let inputPortElem = document.querySelector(`[data-instance-id="${conn.toInstanceId}"] [data-port-id="${conn.toInputId}"]`);
                console.log({ outputPortElem, inputPortElem, connId: conn.id }, { fromInstanceId: conn.fromInstanceId, toInstanceId: conn.toInstanceId });

                if (!outputPortElem || !inputPortElem) {
                    console.warn(`[ConnectionsRenderer] Port elements not found for connection ${conn.id}. This might be a timing issue.`);
                    // return null; // Or some fallback rendering / error indicator
                     setTimeout(() => {
                        outputPortElem = document.querySelector(`[data-instance-id="${conn.fromInstanceId}"] [data-port-id="${conn.fromOutputId}"]`);
                        inputPortElem = document.querySelector(`[data-instance-id="${conn.toInstanceId}"] [data-port-id="${conn.toInputId}"]`);
                        console.log({ outputPortElem, inputPortElem, connId: conn.id }, { fromInstanceId: conn.fromInstanceId, toInstanceId: conn.toInstanceId })
                    }, 1000);
                }

                const startPos = getPortElementCenterForConnectionLine(outputPortElem, svgRef);
                const endPos = getPortElementCenterForConnectionLine(inputPortElem, svgRef);
                const portColor = getBlockPortBgColor(outputPortDef.type).replace('bg-', 'stroke-');

                return (
                    <line
                        key={conn.id}
                        x1={startPos.x} y1={startPos.y}
                        x2={endPos.x} y2={endPos.y}
                        className={`connection-line ${portColor} opacity-70 hover:opacity-100`}
                        strokeWidth="3"
                        onDoubleClick={() => onUpdateConnections(prev => prev.filter(c => c.id !== conn.id))}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        aria-label={`Connection from ${fromInstance.name} (${outputPortDef.name}) to ${toInstance.name} (${inputPortDef.name}). Double-click to delete.`}
                    />
                );
            })}
            {/* {pendingConnection && (
                <line
                    x1={pendingConnection.startX} y1={pendingConnection.startY}
                    x2={pendingConnection.currentX} y2={pendingConnection.currentY}
                    className={`connection-line stroke-dashed ${getBlockPortBgColor(pendingConnection.fromPort.type).replace('bg-', 'stroke-')}`}
                    strokeWidth="2.5"
                />
            )} */}
        </>
    );
};

export default ConnectionsRenderer;
