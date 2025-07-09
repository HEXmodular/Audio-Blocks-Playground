
import React, { useState, useCallback, useEffect, memo, useRef } from 'react';
import { BlockInstance, BlockPort } from '@interfaces/block';
import { TrashIcon, ExclamationTriangleIcon, } from '@icons/icons';
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
}

const BlockInstanceComponent: React.FC<BlockInstanceComponentProps> = ({
  blockInstance,
  isSelected,
  onSelect,
  // draggedOverPort,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: blockInstance.position.x, y: blockInstance.position.y });
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

  const onUpdateInstancePosition = BlockStateManager.updateBlockInstance;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.js-interactive-element') || (e.target as HTMLElement).closest('[data-port-id]')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - blockInstance.position.x,
      y: e.clientY - blockInstance.position.y,
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
        onUpdateInstancePosition(blockInstance.instanceId, {
          position: { x: snappedX, y: snappedY },
        });
      }, 50)(); // Debounce to reduce updates

      setPosition({ x: snappedX, y: snappedY });
    }
  }, [isDragging, dragStart, blockInstance.instanceId, onUpdateInstancePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false); // Add this line
  }, []);

  // Effect for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

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
        onUpdateInstancePosition(blockInstance.instanceId, {
          width: newWidth,
          height: newHeight,
        });
      }, 50)();

      setSize({ width: newWidth, height: newHeight });
    }
  }, [isResizing, blockInstance.instanceId, onUpdateInstancePosition]);

  // Effect for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleMouseUp); // Reuse mouseup from drag
    } else {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      // mouseup listener is managed by the drag effect, ensure it's also removed if only resizing was active
      if (!isDragging) {
        document.removeEventListener('mouseup', handleMouseUp);
      }
    }
    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      if (!isDragging) { // Only remove if not also dragging
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
  }, [isResizing, handleResizeMouseMove, handleMouseUp, isDragging]);


  if (!blockDefinition && blockInstance) {
    // const errorBlockHeight = calculateBlockHeight(false); // Not used with current size state
    return (
      <div
        style={{
          transform: `translate(${position?.x}px, ${position?.y}px)`,
          width: `${size.width}px`,
          minHeight: `${size.height}px`,
        }}
        className="absolute bg-red-800 border-2 border-red-600 rounded-md shadow-lg p-3 text-white text-xs flex flex-col justify-center items-center"
      >
        <p className="text-center">Error: Def '{blockInstance.definitionId}' not found for '{blockInstance.name}'.</p>
        <button
          // onClick={() => onDeleteInstance(blockInstance.instanceId)}
          className="mt-1.5 bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded text-xs js-interactive-element"
        >
          Delete
        </button>
      </div>
    );
  }

  // const firstNumericalParamDef = blockDefinition.parameters.find(
  //   p => p.type === 'slider' || p.type === 'knob' || p.type === 'number_input'
  // );
  // const firstNumericalParamInstance = firstNumericalParamDef
  //   ? blockInstance.parameters.find(p => p.id === firstNumericalParamDef.id)
  //   : undefined;

  // const blockHeight = calculateBlockHeight(true); // Now using size.height
  const blockHeight = size.height; // Use dynamic height

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

  return (
    <div
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: `${size.width}px`,
        minHeight: `${size.height}px`, // Use height from state
      }}
      // className={`absolute bg-gray-800 rounded-lg shadow-xl flex flex-col border-2 group
      //             ${isSelected ? 'border-sky-400 ring-2 ring-sky-400 ring-opacity-50' : 'border-gray-700 hover:border-gray-600'} 
      //             transition-all duration-150 cursor-grab active:cursor-grabbing`}
      className={`block-instance-container ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      
                  onMouseDown={handleMouseDown}
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
        // className="flex items-center justify-between px-2.5 py-1 border-b border-gray-700/70"
        style={{ height: `${COMPACT_BLOCK_HEADER_HEIGHT}px`}}
      >
        <h3
          id={`${blockInstance.instanceId}-compact-name`}
          // className="text-xs font-semibold text-gray-100 truncate"
          className="block-instance-name"
          title={blockInstance.name}
        >
          {blockInstance.name}
        </h3>
        {/* <div className="flex items-center space-x-1 js-interactive-element"> */}
          {blockInstance.error && (
            <span title={`Error: ${blockInstance.error}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            </span>
          )}
          {/* delete */}
          {/* <button
            onClick={(e) => {
              e.stopPropagation();
              BlockStateManager.deleteBlockInstance(blockInstance.instanceId);
            }}
            title="Delete Block"
            aria-label={`Delete block ${blockInstance.name}`}
            className="p-0.5 text-gray-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button> */}
        {/* </div> */}
      </div>

      {/* Body: Custom or Default Compact Renderer */}
      <div
        // className="flex-grow flex flex-col justify-center relative"
        style={{ height: `calc(100% - ${COMPACT_BLOCK_HEADER_HEIGHT}px)` }} // Ensure body fills available space
      >
        {CompactRendererComponent(blockDefinition.compactRendererId)}
      </div>

      {/* Resize Handle */}
      <div
        // className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 js-interactive-element"
        className="resize-handle"
        // style={{ background: 'rgba(255,255,255,0.2)', borderTopLeftRadius: '4px' }}
        onMouseDown={handleResizeMouseDown}
        title="Resize Block"
      >
        {/* <ArrowsPointingOutIcon className="w-3 h-3 text-gray-400 absolute bottom-0.5 right-0.5" /> */}
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
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnectionDrag(blockInstance.instanceId, port, false, e.currentTarget as HTMLDivElement);
            }}
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
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnectionDrag(blockInstance.instanceId, port, true, e.currentTarget as HTMLDivElement);
            }}
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

  if (positionChanged || sizeChanged || parametersChanged) return false;


  return true; // Props are equal, don't re-render
});

