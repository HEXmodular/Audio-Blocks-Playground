import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';

import { BlockStateManager } from './state/BlockStateManager'; // Added
import ConnectionsRenderer from '@components/ConnectionsRenderer';

const App: React.FC = () => {
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
 
  const appBlockInstances = useMemo(() => {
    return BlockStateManager.getInstance().getBlockInstances();
  }, []);
  

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 relative overflow-hidden">
      {globalError && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-sm z-50">
          Global Error: {globalError} <button onClick={() => setGlobalError(null)}>&times;</button>
        </div>
      )}
      <Toolbar/>
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
            onSelect={(id: string | null) => setSelectedInstanceId(id)}
          />
        ))}
      </main>

        {/* <BlockDetailPanel
          blockInstance={selectedBlockInstance}
          // blockInstances={appBlockInstances} // Added prop
          // connections={connections}
          onClosePanel={() => setSelectedInstanceId(null)}
          // onUpdateConnections={connectionState.updateConnections}
        /> */}

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
