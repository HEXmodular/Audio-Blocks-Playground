

import React, { useMemo, useCallback, useState } from 'react'; // Added useState
import { PlusIcon, PlayIcon, StopIcon, BeakerIcon } from '@icons/icons';
import { BlockDefinition, BlockInstance, Connection } from '@interfaces/common';
import AddBlockModal from './AddBlockModal';
import { WorkspacePersistenceManager } from '@services/WorkspacePersistenceManager';
import AudioEngineServiceInstance from '@services/AudioEngineService'; // Corrected import
import { BlockStateManager } from '../state/BlockStateManager';
import { ConnectionState } from '@services/ConnectionState';
// import { useBlockState } from '@context/BlockStateContext'; // Import useBlockState // Removed

interface ToolbarProps {
  appBlockDefinitionsFromCtx: BlockDefinition[];
  appBlockInstancesFromCtx: BlockInstance[];
  connections: Connection[];
  globalBpm: number;
  selectedSinkId: string;
  audioEngineService: typeof AudioEngineServiceInstance; // Use type of the instance
  ctxBlockStateManager: BlockStateManager;
  connectionState: ConnectionState;
  setGlobalBpm: (bpm: number) => void;
  setSelectedInstanceId: (id: string | null) => void;
  onAddBlockFromDefinition: (definition: BlockDefinition) => void;
  onToggleGeminiPanel: () => void;
  isGeminiPanelOpen: boolean;
  onToggleGlobalAudio: () => void;
  isAudioGloballyEnabled: boolean;
  onToggleTestRunner: () => void;
  // allBlockDefinitions and onDeleteBlockDefinition removed from props
  // onExportWorkspace and onImportWorkspace are now fully internal
  // coreDefinitionIds: Set<string>; // Removed unused prop
  availableOutputDevices: MediaDeviceInfo[];
  // selectedSinkId is already listed in the new props
  onSetOutputDevice: (sinkId: string) => Promise<boolean>;
}

const Toolbar: React.FC<ToolbarProps> = ({
  appBlockDefinitionsFromCtx,
  appBlockInstancesFromCtx,
  connections,
  globalBpm,
  selectedSinkId,
  audioEngineService,
  ctxBlockStateManager,
  connectionState,
  setGlobalBpm,
  setSelectedInstanceId,
  onAddBlockFromDefinition,
  onToggleGeminiPanel,
  isGeminiPanelOpen,
  onToggleGlobalAudio,
  isAudioGloballyEnabled,
  onToggleTestRunner,
  // onExportWorkspaceProp, // Removed
  // onImportWorkspaceProp, // Removed
  // coreDefinitionIds, // Removed from destructuring
  availableOutputDevices,
  onSetOutputDevice,
}) => {
  // const { blockDefinitions, deleteBlockDefinition } = useBlockState(); // Consume context

  const workspacePersistenceManager = useMemo(() => {
    if (!ctxBlockStateManager || !audioEngineService || !connectionState || !selectedSinkId) return null;
    return new WorkspacePersistenceManager(
      () => appBlockDefinitionsFromCtx,
      () => appBlockInstancesFromCtx,
      () => connections,
      () => globalBpm,
      () => selectedSinkId, // Changed from syncedGlobalAudioState.selectedSinkId
      audioEngineService,
      ctxBlockStateManager,
      connectionState,
      setGlobalBpm, // Prop directly
      setSelectedInstanceId // Prop directly
    );
  }, [
    appBlockDefinitionsFromCtx,
    appBlockInstancesFromCtx,
    connections,
    globalBpm,
    selectedSinkId, // Changed from syncedGlobalAudioState
    audioEngineService,
    ctxBlockStateManager,
    connectionState,
    setGlobalBpm,
    setSelectedInstanceId
  ]);

  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false); // New state for modal
  const importFileInputRef = React.useRef<HTMLInputElement>(null);

  // Import function now internal to Toolbar
  const handleImportWorkspaceTrigger = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && workspacePersistenceManager) {
      workspacePersistenceManager.importWorkspace(event.target.files[0]);
      event.target.value = ""; // Reset file input
    }
  }, [workspacePersistenceManager]);

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  // handleExportClick is removed, logic inlined in button onClick

  // const handleDeleteDefinition = (e: React.MouseEvent, definitionId: string) => { // Removed unused function
  //   e.stopPropagation(); // Prevent block add
  //   // Use appBlockDefinitionsFromCtx (from props) for the confirmation message
  //   if (window.confirm(`Are you sure you want to delete the block definition for "${appBlockDefinitionsFromCtx.find((d: BlockDefinition)=>d.id===definitionId)?.name || definitionId}"? This cannot be undone.`)) {
  //     // deleteBlockDefinition(definitionId); // Assumes deleteBlockDefinition is already correctly sourced from BSM
  //     // setIsAddBlockMenuOpen(false); // This state is removed
  //   }
  // };
  
  const handleBpmInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseInt(e.target.value, 10);
    if (!isNaN(newBpm) && newBpm > 0 && newBpm <= 999) {
      setGlobalBpm(newBpm);
      audioEngineService.setTransportBpm(newBpm); // Also update in engine
    } else if (e.target.value === "") {
        setGlobalBpm(120);
        audioEngineService.setTransportBpm(120); // Also update in engine
    }
  };

  const handleOutputDeviceChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await onSetOutputDevice(event.target.value);
  };

  // State for UI, distinct from engine's actual master volume for mute/unmute
  const [uiMasterVolume, setUiMasterVolume] = useState(0.7);
  const [isMutedByToolbar, setIsMutedByToolbar] = useState(false);

  const handleMasterVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolumeLinear = parseFloat(event.target.value);
    setUiMasterVolume(newVolumeLinear);
    if (!isMutedByToolbar) {
      // Assuming setMasterVolume in engine takes linear 0-1 and converts to dB or appropriate scale
      audioEngineService.setMasterVolume(newVolumeLinear);
    }
  };

  const toggleMasterMute = () => {
    const newMuteState = !isMutedByToolbar;
    setIsMutedByToolbar(newMuteState);
    if (newMuteState) {
      audioEngineService.setMasterVolume(-Infinity); // Or a very low dB value
    } else {
      audioEngineService.setMasterVolume(uiMasterVolume); // Restore to UI volume
    }
  };


  return (
    <div className="bg-gray-800 p-2 shadow-md flex items-center space-x-2 fixed top-0 left-0 right-0 z-20 h-14">
      <div className="text-xl font-semibold text-sky-400">AudioBlocks</div>
      {/* Add Block Button - Toggles Modal */}
      <div className="relative">
        <button
          onClick={() => setIsAddBlockModalOpen(true)} // Toggle modal
          className="flex items-center bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors"
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Block
        </button>
      </div>

      {/* AddBlockModal */}
      {isAddBlockModalOpen && (
        <AddBlockModal
          appBlockDefinitionsFromCtx={appBlockDefinitionsFromCtx}
          onAddBlockFromDefinition={(definition) => {
            onAddBlockFromDefinition(definition);
            setIsAddBlockModalOpen(false); // Close modal after adding
          }}
          onToggleGeminiPanel={() => {
            onToggleGeminiPanel();
            // Optionally close the modal when opening Gemini panel
            // setIsAddBlockModalOpen(false);
          }}
          onClose={() => setIsAddBlockModalOpen(false)}
        />
      )}

      <button
        onClick={onToggleGlobalAudio} // This prop likely triggers a method in App.tsx that calls GlobalAudioStateSyncer
        title={isAudioGloballyEnabled ? "Stop Audio Transport" : "Start Audio Transport"}
        className={`flex items-center ${
          isAudioGloballyEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
        } text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2`}
      >
        {isAudioGloballyEnabled ? <StopIcon className="w-4 h-4 mr-1" /> : <PlayIcon className="w-4 h-4 mr-1" />}
        {isAudioGloballyEnabled ? 'Stop Transport' : 'Start Transport'}
      </button>
      
      {/* Master Volume Control (Example) */}
      <div className="flex items-center ml-2">
        <label htmlFor="master-volume" className="text-xs text-gray-400 mr-1.5">Vol:</label>
        <input
          type="range"
          id="master-volume"
          min="0"
          max="1" // Linear volume for UI
          step="0.01"
          value={isMutedByToolbar ? 0 : uiMasterVolume}
          onChange={handleMasterVolumeChange}
          className="w-20 h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          disabled={isMutedByToolbar}
        />
        <button onClick={toggleMasterMute} className="ml-1.5 text-xs p-1 bg-gray-700 hover:bg-gray-600 rounded">
            {isMutedByToolbar || uiMasterVolume === 0 ? "Unmute" : "Mute"}
        </button>
      </div>

      {/* BPM Input */}
      <div className="flex items-center ml-2">
        <label htmlFor="bpm-input" className="text-xs text-gray-400 mr-1.5">BPM:</label>
        <input
          type="number"
          id="bpm-input"
          value={globalBpm.toString()}
          onChange={handleBpmInputChange}
          min="1"
          max="999"
          className="bg-gray-700 text-white w-16 px-2 py-1 rounded-md text-sm border border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
          aria-label="Global Beats Per Minute (BPM)"
        />
      </div>

      {/* Audio Output Device Selector */}
      {availableOutputDevices.length > 0 && (typeof AudioContext !== 'undefined' && (AudioContext.prototype as any).setSinkId) && (
        <div className="flex items-center ml-2">
          <label htmlFor="output-device-select" className="text-xs text-gray-400 mr-1.5">Output:</label>
          <select
            id="output-device-select"
            value={selectedSinkId} // selectedSinkId is directly from props
            onChange={handleOutputDeviceChange}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded-md border border-gray-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 max-w-[150px] truncate"
            title={selectedSinkId === 'default' ? 'Default Output Device' : availableOutputDevices.find(d => d.deviceId === selectedSinkId)?.label || selectedSinkId}
            aria-label="Select Audio Output Device"
          >
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Device ${device.deviceId.substring(0, 8)}...`}
              </option>
            ))}
          </select>
        </div>
      )}


      <button
        onClick={onToggleTestRunner}
        title="Run Tests"
        className="flex items-center bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
      >
        <BeakerIcon className="w-4 h-4 mr-1" />
        Run Tests
      </button>

      {/* Workspace Management Buttons */}
      <button
        onClick={() => {
          if (workspacePersistenceManager) {
            workspacePersistenceManager.exportWorkspace();
          }
        }}
        title="Export Workspace"
        className="flex items-center bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
        disabled={!workspacePersistenceManager}
      >
        Export
      </button>
      <button
        onClick={handleImportClick} // This just clicks the hidden input
        title="Import Workspace"
        className="flex items-center bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
        disabled={!workspacePersistenceManager}
      >
        Import
      </button>
      <input
        type="file"
        ref={importFileInputRef}
        onChange={handleImportWorkspaceTrigger} // Use the new handler
        accept=".json"
        className="hidden"
        aria-hidden="true"
      />

       <button
        onClick={onToggleGeminiPanel}
        className={`ml-auto flex items-center ${isGeminiPanelOpen ? 'bg-pink-600' : 'bg-pink-500'} hover:bg-pink-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors`}
      >
        <span className="mr-1 text-lg">✨</span> Gemini
      </button>
    </div>
  );
};

export default Toolbar;
