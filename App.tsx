import React, { useState, useEffect, useRef, useCallback } from 'react';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';
import BlockDetailPanel from '@components/BlockDetailPanel';
import ConnectionsRenderer from '@components/ConnectionsRenderer';
import BlockStateManager from '@state/BlockStateManager';
import { BlockInstance } from '@interfaces/block';
import PubSubService from '@services/PubSubService';

import './App.css';

const App: React.FC = () => {
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(BlockStateManager.getSelectedBlockInstanceId());
  const [appBlockInstances, setAppBlockInstances] = useState<BlockInstance[]>(BlockStateManager.getBlockInstances());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setAppBlockInstances(BlockStateManager.getBlockInstances());
  }, [BlockStateManager.getBlockInstances()]);

  PubSubService.subscribe('insctance-changed', (instances: BlockInstance[]) => {
    setAppBlockInstances(instances);
  });

  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-instance-id]')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(true);
    const point = 'touches' in e ? e.touches[0] : e;
    setPanStart({
      x: point.clientX - panOffset.x,
      y: point.clientY - panOffset.y,
    });
  }, [panOffset]);

  const handlePanMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (isPanning) {
      const point = 'touches' in e ? e.touches[0] : e;
      const newX = point.clientX - panStart.x;
      const newY = point.clientY - panStart.y;
      setPanOffset({ x: newX, y: newY });
    }
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handlePanMove(e);
    const handleMouseUp = () => handlePanEnd();
    const handleTouchMove = (e: TouchEvent) => handlePanMove(e);
    const handleTouchEnd = () => handlePanEnd();

    if (isPanning) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPanning, handlePanMove, handlePanEnd]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 relative overflow-hidden">
      {globalError && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-sm z-50">
          Global Error: {globalError} <button onClick={() => setGlobalError(null)}>&times;</button>
        </div>
      )}
      <Toolbar />
      <main
        className="flex-grow pt-14 relative"
        id="main-workspace-area"
        onMouseDown={handlePanStart}
        onTouchStart={handlePanStart}
      >
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          <ConnectionsRenderer
            svgRef={svgRef as React.RefObject<SVGSVGElement>}
          />
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform={`translate(${panOffset.x % 20},${panOffset.y % 20})`}>
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="lightgray" strokeWidth="0.1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div
          className="absolute top-0 left-0"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          {appBlockInstances.filter(instance => instance).map(instance => (
            <BlockInstanceComponent
              key={instance.instanceId}
              blockInstance={instance}
              isSelected={instance.instanceId == selectedInstanceId}
              onSelect={(id: string | null) => {
                if (selectedInstanceId === id) return;
                BlockStateManager.setSelectedBlockInstanceId(id)
                setSelectedInstanceId(id);
              }}
            />
          ))}
        </div>
      </main>

      {selectedInstanceId && <BlockDetailPanel />}
    </div>
  );
};

export default App;
