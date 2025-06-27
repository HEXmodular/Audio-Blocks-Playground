import React, { useState } from 'react';

import { getPortColor as getBlockPortBgColor } from './BlockInstanceComponent';
import ConnectionState from '@services/ConnectionState';
import PubSubService from '@services/PubSubService';

import BlockStateManager from '@state/BlockStateManager';
import ConnectionDragHandler from '@utils/ConnectionDragHandler';

import { BlockInstance } from '@interfaces/block';
import { Connection } from '@interfaces/connection';

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
    const [retryAttemptsMap, setRetryAttemptsMap] = useState<Record<string, number>>({});
    const [, setForceUpdateKey] = useState<number>(0); // Value of forceUpdateKey is not directly used, only its change
    const [pendingConnection, setPendingConnection] = useState(ConnectionDragHandler.pendingConnection)
    const [blockInstances, setBlockInstances] = useState(BlockStateManager.getBlockInstances());
    const [connections, setConnections] = useState(ConnectionState.getConnections());
    
    PubSubService.subscribe('connections-changed', (connections: Connection[]) => {
        setConnections(connections);
    })

    PubSubService.subscribe('insctance-changed', (instances: BlockInstance[]) => {
        setBlockInstances(instances);
    })

    const onUpdateConnections = ConnectionState.updateConnections;

    ConnectionDragHandler.onStateChange = () => {
        if (ConnectionDragHandler.pendingConnection) {
            setPendingConnection(ConnectionDragHandler.pendingConnection);
        } else {
            setPendingConnection(null);
        }
    };

    // forceUpdateKey is implicitly used by being part of the component's state,
    // so changing it will trigger a re-render of ConnectionsRenderer.
    return (
        <>
            {connections.map(conn => {
                const fromInstance = blockInstances.find(b => b?.instanceId === conn.fromInstanceId);
                const toInstance = blockInstances.find(b => b?.instanceId === conn.toInstanceId);
                if (!fromInstance || !toInstance) return null;

                const fromDef = fromInstance.definition;
                const toDef = toInstance.definition;
                if (!fromDef || !toDef) return null;

                const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
                const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);
                if (!outputPortDef || !inputPortDef) return null;

                // Querying the DOM directly can be problematic in React if elements are not yet rendered
                // or if their IDs/attributes change. Assuming these elements are stable when this renders.
                let outputPortElem = document.querySelector(`[data-instance-id="${conn.fromInstanceId}"] [data-port-id="${conn.fromOutputId}"]`);
                let inputPortElem = document.querySelector(`[data-instance-id="${conn.toInstanceId}"] [data-port-id="${conn.toInputId}"]`);
                // console.log({ outputPortElem, inputPortElem, connId: conn.id }, { fromInstanceId: conn.fromInstanceId, toInstanceId: conn.toInstanceId });

                if (!outputPortElem || !inputPortElem) {
                    const currentAttempts = retryAttemptsMap[conn.id] || 0;
                    if (currentAttempts < 10) {
                        setRetryAttemptsMap(prev => ({ ...prev, [conn.id]: currentAttempts + 1 }));
                        setTimeout(() => setForceUpdateKey(prev => prev + 1), 100);
                        return null; // Skip rendering this line for now
                    } else {
                        // console.warn(`[ConnectionsRenderer] Could not find port elements for connection ${conn.id} after 10 retries. Giving up on this connection for now.`);
                        // Optionally, mark as "given up" in retryAttemptsMap to prevent further logs if needed,
                        // e.g., setRetryAttemptsMap(prev => ({ ...prev, [conn.id]: Infinity }));
                        return null; // Stop trying to render this connection
                    }
                } else {
                    // Elements are found, clear any retry state for this connection if it existed
                    if (retryAttemptsMap[conn.id]) {
                        setRetryAttemptsMap(prev => {
                            const { [conn.id]: _, ...rest } = prev;
                            return rest;
                        });
                    }
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
            {pendingConnection && (
                <line
                    x1={pendingConnection.startX} y1={pendingConnection.startY}
                    x2={pendingConnection.currentX} y2={pendingConnection.currentY}
                    className={`connection-line stroke-dashed ${getBlockPortBgColor(pendingConnection.fromPort.type).replace('bg-', 'stroke-')}`}
                    strokeWidth="2.5"
                />
            )}
        </>
    );
};

export default ConnectionsRenderer;

