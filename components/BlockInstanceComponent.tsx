
import React, { useState, useCallback, useEffect } from 'react';
import { BlockInstance, BlockDefinition, BlockPort } from '@interfaces/common';
import { TrashIcon, ExclamationTriangleIcon } from '@icons/icons';

const GRID_STEP = 20;
const COMPACT_BLOCK_WIDTH = 120; 
const COMPACT_BLOCK_HEADER_HEIGHT = 38;
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
    case 'trigger': return 'bg-pink-500';
    case 'gate': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
};

interface BlockInstanceComponentProps {
  blockInstance: BlockInstance;
  isSelected: boolean;
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  onSelect: (instanceId: string | null) => void;
  onUpdateInstancePosition: (instanceId: string, updates: Partial<Pick<BlockInstance, 'position'>>) => void;
  onDeleteInstance: (instanceId: string) => void;
  onStartConnectionDrag: (
    instanceId: string, 
    port: BlockPort, 
    isOutput: boolean, 
    portElement: HTMLDivElement
  ) => void;
  pendingConnectionSource?: { instanceId: string; portId: string } | null; // To dim source port during drag
  draggedOverPort?: { instanceId: string; portId: string } | null; // To highlight target port
}

const BlockInstanceComponent: React.FC<BlockInstanceComponentProps> = ({
  blockInstance,
  isSelected,
  getDefinitionForBlock,
  onSelect,
  onUpdateInstancePosition,
  onDeleteInstance,
  onStartConnectionDrag,
  pendingConnectionSource,
  draggedOverPort,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const blockDefinition = getDefinitionForBlock(blockInstance);

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

      onUpdateInstancePosition(blockInstance.instanceId, { 
        position: { x: snappedX, y: snappedY },
      });
    }
  }, [isDragging, dragStart, blockInstance.instanceId, onUpdateInstancePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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


  if (!blockDefinition) {
  const errorBlockHeight = calculateBlockHeight(false);
    return (
        <div 
            style={{ 
                transform: `translate(${blockInstance.position.x}px, ${blockInstance.position.y}px)`,
                width: `${COMPACT_BLOCK_WIDTH}px`,
                height: `${errorBlockHeight}px`,
            }}
            className="absolute bg-red-800 border-2 border-red-600 rounded-md shadow-lg p-3 text-white text-xs flex flex-col justify-center items-center"
        >
            <p className="text-center">Error: Def '{blockInstance.definitionId}' not found for '{blockInstance.name}'.</p>
            <button
                onClick={() => onDeleteInstance(blockInstance.instanceId)}
                className="mt-1.5 bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded text-xs js-interactive-element"
            >
                Delete
            </button>
        </div>
    );
  }
  
  const firstNumericalParamDef = blockDefinition.parameters.find(
    p => p.type === 'slider' || p.type === 'knob' || p.type === 'number_input'
  );
  const firstNumericalParamInstance = firstNumericalParamDef
    ? blockInstance.parameters.find(p => p.id === firstNumericalParamDef.id)
    : undefined;

  const blockHeight = calculateBlockHeight(!!firstNumericalParamInstance);

  const getPortY = (index: number, count: number, totalBlockHeight: number) => {
    const usableHeight = totalBlockHeight - COMPACT_BLOCK_HEADER_HEIGHT;
    const marginTop = COMPACT_BLOCK_HEADER_HEIGHT + usableHeight * 0.15; 
    const portAreaHeight = usableHeight * 0.70; 
    if (count === 0) return marginTop + portAreaHeight / 2;
    if (count === 1) return marginTop + portAreaHeight / 2;
    return marginTop + (portAreaHeight / (count -1)) * index;
  };

  return (
    <div
      style={{ 
        transform: `translate(${blockInstance.position.x}px, ${blockInstance.position.y}px)`,
        width: `${COMPACT_BLOCK_WIDTH}px`,
        height: `${blockHeight}px`,
      }}
      className={`absolute bg-gray-800 rounded-lg shadow-xl flex flex-col border-2 group
                  ${isSelected ? 'border-sky-400 ring-2 ring-sky-400 ring-opacity-50' : 'border-gray-700 hover:border-gray-600'} 
                  transition-all duration-150 cursor-grab active:cursor-grabbing`}
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
        className="flex items-center justify-between px-2.5 py-1 border-b border-gray-700/70"
        style={{ height: `${COMPACT_BLOCK_HEADER_HEIGHT}px`, flexShrink: 0 }}
      >
        <h3 
          id={`${blockInstance.instanceId}-compact-name`}
          className="text-xs font-semibold text-gray-100 truncate"
          title={blockInstance.name}
        >
          {blockInstance.name}
        </h3>
        <div className="flex items-center space-x-1 js-interactive-element">
          {blockInstance.error && (
            <span title={`Error: ${blockInstance.error}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteInstance(blockInstance.instanceId); }}
            title="Delete Block"
            aria-label={`Delete block ${blockInstance.name}`}
            className="p-0.5 text-gray-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Optional Main Parameter Display */}
      <div className="flex-grow flex flex-col justify-center px-2.5 py-1 relative">
        {firstNumericalParamInstance && firstNumericalParamDef && (
          <div 
              className="flex items-center justify-start"
              style={{ height: `${PARAM_DISPLAY_HEIGHT}px`}}
              title={`${firstNumericalParamDef.name}: ${Number(firstNumericalParamInstance.currentValue).toFixed(firstNumericalParamDef.step && firstNumericalParamDef.step < 1 ? 2 : (firstNumericalParamDef.step && firstNumericalParamDef.step >= 1 ? 0 : 2))}`}
          >
              <span className="text-[10px] text-gray-400 truncate mr-1.5 flex-shrink-0">{firstNumericalParamDef.name}:</span>
              <span className="text-xs text-sky-300 font-mono truncate">
                  {Number(firstNumericalParamInstance.currentValue).toFixed(
                    firstNumericalParamDef.step && firstNumericalParamDef.step < 1 ? 2 : 
                    (firstNumericalParamDef.step && firstNumericalParamDef.step >= 1 && Math.floor(firstNumericalParamDef.step) === firstNumericalParamDef.step ? 0 : 2)
                  )}
              </span>
          </div>
        )}
        {!firstNumericalParamInstance && (
           <div className="h-full" style={{minHeight: `${PARAM_DISPLAY_HEIGHT}px` }}></div> 
        )}
      </div>

      {/* Input Port Stubs */}
      {blockDefinition.inputs.map((port, index) => {
        const portY = getPortY(index, blockDefinition.inputs.length, blockHeight);
        const isPendingSource = pendingConnectionSource?.instanceId === blockInstance.instanceId && pendingConnectionSource?.portId === port.id;
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
              left: `${-PORT_STUB_DIAMETER / 2}px`, 
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
      {blockDefinition.outputs.map((port, index) => {
        const portY = getPortY(index, blockDefinition.outputs.length, blockHeight);
        const isPendingSource = pendingConnectionSource?.instanceId === blockInstance.instanceId && pendingConnectionSource?.portId === port.id;
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

export default BlockInstanceComponent;
