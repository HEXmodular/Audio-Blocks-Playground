import React, { useState, useEffect, useRef } from 'react';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';
import BlockDetailPanel from '@components/BlockDetailPanel';
import BlockStateManager from '@state/BlockStateManager';
import ConnectionsRenderer from '@components/ConnectionsRenderer';
import { BlockInstance } from '@interfaces/common';
import { ConnectionDragHandler } from '@utils/ConnectionDragHandler';
import ConnectionState from '@services/ConnectionState';

const App: React.FC = () => {
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(BlockStateManager.getSelectedBlockInstanceId());
  const [appBlockInstances, setAppBlockInstances] = useState<BlockInstance[]>(BlockStateManager.getBlockInstances());
  const [_connectionDragStateCounter, setConnectionDragStateCounter] = useState(0); // Used to trigger re-renders for connection dragging
  const svgRef = useRef<SVGSVGElement | null>(null);


  useEffect(() => {
    // Initialize ConnectionDragHandler
    if (svgRef.current) {
      ConnectionDragHandler.getInstance({
        svgRef: svgRef as React.RefObject<SVGSVGElement>, // Cast needed as current might be null initially but useEffect runs after render
        blockInstances: BlockStateManager.getBlockInstances(),
        getDefinitionForBlock: BlockStateManager.getDefinitionForBlock,
        updateConnections: ConnectionState.updateConnections,
        onStateChange: () => setConnectionDragStateCounter(prev => prev + 1),
      });
    }
    // Listener for BlockStateManager updates
    const handleBlockInstancesChanged = () => {
      console.log("Block instances updated, refreshing App state.");
      setAppBlockInstances([...BlockStateManager.getBlockInstances()]); // Ensure new array instance for re-render
       // Also update the handler's knowledge of block instances
      const handler = ConnectionDragHandler.getInstance();
      // This is a bit of a hack, ideally the handler would have a dedicated update method
      // or subscribe to changes itself. For now, we re-initialize its known instances.
      // This assumes that other props (svgRef, getDefinition, updateConnections, onStateChange) are stable.
      if (svgRef.current && (handler as any).svgRef) { // Check if handler was initialized
         (handler as any).blockInstances = BlockStateManager.getBlockInstances();
      }
    };

    BlockStateManager.subscribe(handleBlockInstancesChanged);

    // Initial fetch
    handleBlockInstancesChanged();


    // Listener for selected block instance
     const handleSelectedInstanceChanged = (newId: string | null) => {
      setSelectedInstanceId(newId);
    };
    BlockStateManager.subscribeSelectedBlock(handleSelectedInstanceChanged);


    return () => {
      BlockStateManager.unsubscribe(handleBlockInstancesChanged);
      BlockStateManager.unsubscribeSelectedBlock(handleSelectedInstanceChanged);
      // Optionally, dispose the ConnectionDragHandler instance if the App unmounts,
      // though as a singleton, it might persist for the app's lifetime.
      // ConnectionDragHandler.getInstance().dispose(); // If a dispose method is added
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  // This effect updates the ConnectionDragHandler's blockInstances whenever appBlockInstances changes.
  // This is important if blocks are added/removed AFTER the initial setup.
  useEffect(() => {
    const handler = ConnectionDragHandler.getInstance();
    if ((handler as any).svgRef) { // Check if handler was initialized
        (handler as any).blockInstances = appBlockInstances;
    }
  }, [appBlockInstances]);


  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 relative overflow-hidden">
      {globalError && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-sm z-50">
          Global Error: {globalError} <button onClick={() => setGlobalError(null)}>&times;</button>
        </div>
      )}
      <Toolbar />
      <main className="flex-grow pt-14 relative" id="main-workspace-area">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          <ConnectionsRenderer
            svgRef={svgRef as React.RefObject<SVGSVGElement>}
          />
        </svg>

        {appBlockInstances.filter(instance => instance).map(instance => (
          <BlockInstanceComponent
            key={instance.instanceId}
            blockInstance={instance}
            isSelected={instance.instanceId === selectedInstanceId}
            onSelect={(id: string | null) => {
              BlockStateManager.setSelectedBlockInstanceId(id)
              setSelectedInstanceId(id);
            }} // Update BlockStateManager
          />
        ))}
      </main>

      {/* Render BlockDetailPanel if an instance is selected */}
      {selectedInstanceId && <BlockDetailPanel />}

      {/* <GeminiChatPanel
       ref={geminiChatPanelRef}
       isOpen={isGeminiPanelOpen}
       onToggle={() => setIsGeminiPanelOpen(!isGeminiPanelOpen)}
       selectedBlockInstance={selectedBlockInstance}  
        getBlockDefinition is now sourced from context
        onAddBlockFromGeneratedDefinition={(definition, instanceName) => {
          blockInstanceController?.addBlockFromDefinition(definition, instanceName);
          setIsGeminiPanelOpen(false);
        }}
        onUpdateBlockLogicCode={(instanceId: string, newLogicCode: string, modificationPrompt: string) => {
          const instance = appBlockInstances.find(i => i.instanceId === instanceId); // Use new state
          if (instance && blockInstanceController && ctxGetDefinitionById && ctxUpdateBlockDefinition) {
            const definition = ctxGetDefinitionById(instance.definitionId);
            if (definition) {
              ctxUpdateBlockDefinition(definition.id, { logicCode: newLogicCode });
              blockInstanceController.updateInstance(instanceId, prev => ({
                ...prev,
                modificationPrompts: [...(prev.modificationPrompts || []), modificationPrompt],
                error: null,
              }));
              console.log(`[System] Logic code for block '${instance.name}' (def: ${definition.id}) updated by AI.`);
            }
          }
        }}
        apiKeyMissing={!process.env.API_KEY}
      /> */}
    </div>
  );
};

export default App;
