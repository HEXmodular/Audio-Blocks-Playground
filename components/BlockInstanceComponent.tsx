
import React, { useState, useCallback, useEffect, memo, useRef, useMemo } from 'react';
import { BlockInstance, BlockPort } from '@interfaces/block';
import { ExclamationTriangleIcon } from '@icons/icons';
import DefaultCompactRenderer from './block-renderers/DefaultCompactRenderer';
import BlockStateManager from '@state/BlockStateManager';
import ConnectionDragHandler from '@utils/ConnectionDragHandler';
import { debounce } from '@utils/utils';
import { compactRendererRegistry } from '@/services/block-definitions/compactRendererRegistry';
import './BlockInstanceComponent.css';

const GRID_STEP = 20;
const COMPACT_BLOCK_WIDTH = 120;
const COMPACT_BLOCK_HEADER_HEIGHT = 18;
const PARAM_DISPLAY_HEIGHT = 20; // Height for the single parameter display line
const PORT_STUB_DIAMETER = 12;
const COMPACT_BLOCK_VERTICAL_PADDING = 5; // Top/bottom padding inside the block

// Calculate total height based on content
// inputPortsCount and outputPortsCount were unused, so removed.
const calculateBlockHeight = (hasParam: boolean): number => {
  let contentHeight = 0; // Declare and initialize contentHeight
  if (hasParam) {
    contentHeight += PARAM_DISPLAY_HEIGHT + COMPACT_BLOCK_VERTICAL_PADDING;
  } else {
    contentHeight += COMPACT_BLOCK_VERTICAL_PADDING * 2;
  }
  // Ensure minimum height to make the block tappable and visually balanced
  return Math.max(COMPACT_BLOCK_HEADER_HEIGHT + contentHeight, 60);
};


export const getPortColor = (type: BlockPort['type']): string => {
  switch (type) {
    case 'audio': return 'bg-sky-500';
    case 'number': return 'bg-green-500';
    case 'trigger': return 'bg-pink-500';
    case 'gate': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
};

interface BlockInstanceComponentProps {
  blockInstance: BlockInstance;
  isSelected: boolean;
  onSelect: (instanceId: string | null) => void;
  draggedOverPort?: { instanceId: string; portId: string } | null; // To highlight target port
  parentInstanceId?: string | null;
}

const BlockInstanceComponent: React.FC<BlockInstanceComponentProps> = ({
  blockInstance,
  isSelected,
  onSelect,
  parentInstanceId,
  // draggedOverPort,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: blockInstance?.position?.x, y: blockInstance?.position?.y });
  const [size, setSize] = useState({
    width: blockInstance.width || COMPACT_BLOCK_WIDTH,
    height: blockInstance.height || calculateBlockHeight(true)
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // const [pendingConnection, setPendingConnection] = useState(ConnectionDragHandler.pendingConnection)
  const blockDefinition = blockInstance.definition;
  const draggedOverPort = ConnectionDragHandler.draggedOverPort; // Renamed to avoid conflict with prop
  const onStartConnectionDrag = ConnectionDragHandler.handleStartConnectionDrag;

  const { updateBlockInstance } = BlockStateManager;

  const childInstances = useMemo(() => {
    if (blockDefinition?.category === 'container' && blockInstance.children) {
      const allInstances = BlockStateManager.getBlockInstances();//getBlockInstances();
      return allInstances.filter(inst => blockInstance.children!.includes(inst.instanceId));
    }
    return [];
  }, [blockInstance, blockDefinition]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.js-interactive-element') || (e.target as HTMLElement).closest('[data-port-id]')) {
      return;
    }

    if (e.clientX - blockInstance.position.x !== 0 && e.clientY - blockInstance.position.y !== 0) {
      if (!isDragging) setIsDragging(true);
      setDragStart({
        x: e.clientX - blockInstance.position.x,
        y: e.clientY - blockInstance.position.y,
      });
    }
    if (!isSelected) onSelect(blockInstance.instanceId);

  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.js-interactive-element') || (e.target as HTMLElement).closest('[data-port-id]')) {
      return;
    }
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX - blockInstance.position.x,
      y: e.touches[0].clientY - blockInstance.position.y,
    });
    onSelect(blockInstance.instanceId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      const snappedX = Math.round(newX / GRID_STEP) * GRID_STEP;
      const snappedY = Math.round(newY / GRID_STEP) * GRID_STEP;

      debounce(() => {
        updateBlockInstance(blockInstance.instanceId, {
          position: { x: snappedX, y: snappedY },
        });
      }, 50)(); // Debounce to reduce updates

      setPosition({ x: snappedX, y: snappedY });
    }
  }, [isDragging, dragStart, blockInstance.instanceId, updateBlockInstance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging && e.touches.length > 0) {
      const newX = e.touches[0].clientX - dragStart.x;
      const newY = e.touches[0].clientY - dragStart.y;

      const snappedX = Math.round(newX / GRID_STEP) * GRID_STEP;
      const snappedY = Math.round(newY / GRID_STEP) * GRID_STEP;

      debounce(() => {
        updateBlockInstance(blockInstance.instanceId, {
          position: { x: snappedX, y: snappedY },
        });
      }, 50)(); // Debounce to reduce updates

      setPosition({ x: snappedX, y: snappedY });
    }
  }, [isDragging, dragStart, blockInstance.instanceId, updateBlockInstance]);

  const handleInteractionEnd = useCallback(() => {
    if (isDragging) {
      const { x: dropX, y: dropY } = position; // Current position of the dragged block

      const allInstances = BlockStateManager.getBlockInstances();
      let newParentId: string | undefined | null = null;
      let newParentInstance: BlockInstance | null = null;

      for (const potentialParentInstance of allInstances) {
        if (
          potentialParentInstance.instanceId !== blockInstance.instanceId &&
          potentialParentInstance.definition.category === 'container'
        ) {
          potentialParentInstance.position
          const parentPos = potentialParentInstance.position;
          const parentWidth = potentialParentInstance.width || COMPACT_BLOCK_WIDTH; // Use a fallback if width is not set
          const parentHeight = potentialParentInstance.height || calculateBlockHeight(true); // Use a fallback

          if (
            dropX >= parentPos.x &&
            dropX <= parentPos.x + parentWidth &&
            dropY >= parentPos.y &&
            dropY <= parentPos.y + parentHeight
          ) {
            newParentId = potentialParentInstance.instanceId;
            newParentInstance = potentialParentInstance;
            break; // Found a container, no need to check others
          }
        }
      }

      // Update parentId if it has changed or if it was set and now needs to be cleared
      if (newParentId && newParentInstance && newParentId !== blockInstance.parentId) {
        updateBlockInstance(blockInstance.instanceId, { parentId: newParentId || undefined });
        updateBlockInstance(newParentId, { children: [...(newParentInstance.children || []), blockInstance.instanceId] });
      }
    }

    setIsDragging(false);
    setIsResizing(false);
  }, [isDragging, position, blockInstance.instanceId, blockInstance.parentId, updateBlockInstance, BlockStateManager.getBlockInstances]);

  // Effect for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isDragging, handleMouseMove, handleTouchMove]);

  // Resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  };

  const handleResizeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      width: size.width,
      height: size.height,
    };
  };

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;

      let newWidth = resizeStartRef.current.width + dx;
      let newHeight = resizeStartRef.current.height + dy;

      // Snap to grid
      newWidth = Math.round(newWidth / GRID_STEP) * GRID_STEP;
      newHeight = Math.round(newHeight / GRID_STEP) * GRID_STEP;

      // Enforce minimum size
      newWidth = Math.max(newWidth, COMPACT_BLOCK_WIDTH); // Min width
      newHeight = Math.max(newHeight, calculateBlockHeight(true)); // Min height based on content

      debounce(() => {
        updateBlockInstance(blockInstance.instanceId, {
          width: newWidth,
          height: newHeight,
        } as Partial<BlockInstance>);
      }, 50)();

      setSize({ width: newWidth, height: newHeight });
    }
  }, [isResizing, blockInstance.instanceId, updateBlockInstance]);

  const handleResizeTouchMove = useCallback((e: TouchEvent) => {
    if (isResizing && e.touches.length > 0) {
      const dx = e.touches[0].clientX - resizeStartRef.current.x;
      const dy = e.touches[0].clientY - resizeStartRef.current.y;

      let newWidth = resizeStartRef.current.width + dx;
      let newHeight = resizeStartRef.current.height + dy;

      // Snap to grid
      newWidth = Math.round(newWidth / GRID_STEP) * GRID_STEP;
      newHeight = Math.round(newHeight / GRID_STEP) * GRID_STEP;

      // Enforce minimum size
      newWidth = Math.max(newWidth, COMPACT_BLOCK_WIDTH); // Min width
      newHeight = Math.max(newHeight, calculateBlockHeight(true)); // Min height based on content

      debounce(() => {
        updateBlockInstance(blockInstance.instanceId, {
          width: newWidth,
          height: newHeight,
        } as Partial<BlockInstance>);
      }, 50)();

      setSize({ width: newWidth, height: newHeight });
    }
  }, [isResizing, blockInstance.instanceId, updateBlockInstance]);

  // Effect for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('touchmove', handleResizeTouchMove, { passive: false });
    }
    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('touchmove', handleResizeTouchMove);
    };
  }, [isResizing, handleResizeMouseMove, handleResizeTouchMove]);

  // Effect for ending interaction
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mouseup', handleInteractionEnd);
      document.addEventListener('touchend', handleInteractionEnd);
    }
    return () => {
      document.removeEventListener('mouseup', handleInteractionEnd);
      document.removeEventListener('touchend', handleInteractionEnd);
    }
  }, [isDragging, isResizing, handleInteractionEnd]);

  const getPortY = (index: number, count: number, totalBlockHeight: number) => {
    const usableHeight = totalBlockHeight; //- COMPACT_BLOCK_HEADER_HEIGHT;
    const marginTop = 10;
    const portAreaHeight = usableHeight * 0.70;
    if (count === 0) return marginTop + portAreaHeight / 2;
    if (count === 1) return marginTop + portAreaHeight / 2;
    return marginTop + (portAreaHeight / (count - 1)) * index;
  };

  const CompactRendererComponent = useCallback((compactRendererId?: string) => {
    if (compactRendererId) {
      const CR = compactRendererRegistry[compactRendererId];
      if (CR) {
        return (<CR blockInstance={blockInstance} blockDefinition={blockDefinition}></CR>)
      }
    }

    return <DefaultCompactRenderer
      blockInstance={blockInstance}
      blockDefinition={blockDefinition} />
  }, [
    [blockInstance, blockDefinition]
  ])

  if (!parentInstanceId && blockInstance.parentId) {
    return;
  }

  const handlePortInteractionStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, port: BlockPort, isOutput: boolean) => {
    e.stopPropagation();
    onStartConnectionDrag(blockInstance.instanceId, port, isOutput, e.currentTarget as HTMLDivElement);
  };

  return (
    <div
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: `${size.width}px`,
        minHeight: `${size.height}px`, // Use height from state
      }}
      className={`block-instance-container ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}

      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClickCapture={(e) => {
        if (!(e.target as HTMLElement).closest('.js-interactive-element') && !(e.target as HTMLElement).closest('[data-port-id]')) {
          onSelect(blockInstance.instanceId);
        }
      }}
      aria-labelledby={`${blockInstance.instanceId}-compact-name`}
      data-instance-id={blockInstance.instanceId}
    >
      {/* Header */}
      <div
        style={{ height: `${COMPACT_BLOCK_HEADER_HEIGHT}px` }}
      >
        <h3
          id={`${blockInstance.instanceId}-compact-name`}
          className="block-instance-name"
          title={blockInstance.name}
        >
          {blockInstance.name}
        </h3>
        {blockInstance.error && (
          <span title={`Error: ${blockInstance.error}`}>
            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          </span>
        )}
      </div>

      {/* Body: Custom or Default Compact Renderer */}
      <div
        style={{ minHeight: `calc(100% - ${COMPACT_BLOCK_HEADER_HEIGHT}px)`, position: 'relative' }} // Ensure body fills available space
      >
        {CompactRendererComponent(blockDefinition?.compactRendererId)}
        {blockDefinition?.category === 'container' && (
          <div className="">
            {childInstances.map(child => (
              <BlockInstanceComponent
                key={child.instanceId}
                blockInstance={child}
                parentInstanceId={blockInstance.instanceId}
                isSelected={false} // Child blocks are not selectable directly for now
                onSelect={() => { }} // Child blocks are not selectable directly for now
              />
            ))}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        className="resize-handle"
        onMouseDown={handleResizeMouseDown}
        onTouchStart={handleResizeTouchStart}
        title="Resize Block"
      >
      </div>


      {/* Input Port Stubs */}
      {blockDefinition?.inputs.map((port, index) => {
        const portY = getPortY(index, blockDefinition.inputs.length, size.height); // Use size.height
        const isPendingSource = ConnectionDragHandler.pendingConnection?.fromInstanceId === blockInstance.instanceId && ConnectionDragHandler.pendingConnection.fromPort.id === port.id;
        const isDraggedOver = draggedOverPort?.instanceId === blockInstance.instanceId && draggedOverPort?.portId === port.id;
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-port-type={port.type}
            data-instance-id={blockInstance.instanceId}
            data-is-output="false"
            className={`absolute rounded-full ${getPortColor(port.type)} 
                        ${isPendingSource ? 'opacity-30' : 'hover:ring-2 hover:ring-white/70'}
                        ${isDraggedOver ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-gray-800' : ''}
                        transition-all duration-100 cursor-pointer js-port-stub`}
            style={{
              width: `${PORT_STUB_DIAMETER}px`, height: `${PORT_STUB_DIAMETER}px`,
              left: `${-PORT_STUB_DIAMETER / 1.5}px`,
              top: `${portY - PORT_STUB_DIAMETER / 2}px`,
              transform: 'translateX(0%)',
            }}
            title={`Input: ${port.name} (${port.type})${port.description ? ` - ${port.description}` : ''}`}
            onMouseDown={(e) => handlePortInteractionStart(e, port, false)}
            onTouchStart={(e) => handlePortInteractionStart(e, port, false)}
          />
        );
      })}

      {/* Output Port Stubs */}
      {blockDefinition?.outputs.map((port, index) => {
        const portY = getPortY(index, blockDefinition.outputs.length, size.height); // Use size.height
        const isPendingSource = ConnectionDragHandler.pendingConnection?.fromInstanceId === blockInstance.instanceId && ConnectionDragHandler.pendingConnection.fromPort.id === port.id;
        const isDraggedOver = draggedOverPort?.instanceId === blockInstance.instanceId && draggedOverPort?.portId === port.id;
        return (
          <div
            key={port.id}
            data-port-id={port.id}
            data-port-type={port.type}
            data-instance-id={blockInstance.instanceId}
            data-is-output="true"
            className={`absolute rounded-full ${getPortColor(port.type)}
                        ${isPendingSource ? 'opacity-30' : 'hover:ring-2 hover:ring-white/70'}
                        ${isDraggedOver ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-gray-800' : ''}
                        transition-all duration-100 cursor-pointer js-port-stub`}
            style={{
              width: `${PORT_STUB_DIAMETER}px`, height: `${PORT_STUB_DIAMETER}px`,
              right: `${-PORT_STUB_DIAMETER / 2}px`,
              top: `${portY - PORT_STUB_DIAMETER / 2}px`,
              transform: 'translateX(0%)',
            }}
            title={`Output: ${port.name} (${port.type})${port.description ? ` - ${port.description}` : ''}`}
            onMouseDown={(e) => handlePortInteractionStart(e, port, true)}
            onTouchStart={(e) => handlePortInteractionStart(e, port, true)}
          />
        );
      })}
    </div>
  );
};

// export default BlockInstanceComponent;
export default memo(BlockInstanceComponent, (prevProps, nextProps) => {
  // Compare relevant props to prevent unnecessary re-renders
  const prev = prevProps.blockInstance;
  const next = nextProps.blockInstance;

  if (prev.instanceId !== next.instanceId) return false;
  if (prev.definitionId !== next.definitionId) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (ConnectionDragHandler.draggedOverPort?.instanceId === prev.instanceId || ConnectionDragHandler.draggedOverPort?.instanceId === next.instanceId) return false;

  // Deep comparison for position, width, height, and parameters can be costly.
  // Consider specific checks if performance issues arise.
  const positionChanged = prev.position.x !== next.position.x || prev.position.y !== next.position.y;
  const sizeChanged = (prev.width || COMPACT_BLOCK_WIDTH) !== (next.width || COMPACT_BLOCK_WIDTH) ||
    (prev.height || calculateBlockHeight(true)) !== (next.height || calculateBlockHeight(true));
  const parametersChanged = JSON.stringify(prev.parameters) !== JSON.stringify(next.parameters); // Basic check
  const internalStateChanged = JSON.stringify(prev.internalState) !== JSON.stringify(next.internalState); // Basic check


  if (positionChanged || sizeChanged || parametersChanged || internalStateChanged) return false;


  return true; // Props are equal, don't re-render
});

