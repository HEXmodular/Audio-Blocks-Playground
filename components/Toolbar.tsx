

import React, { useMemo, useCallback, useState } from 'react'; // Added useState
import { PlusIcon, PlayIcon, StopIcon, BeakerIcon } from '@icons/icons';
import * as Tone from 'tone'; // Added Tone import
import AudioEngineService from '@services/AudioEngineService';
import AddBlockModal from '@components/AddBlockModal'; // Import AddBlockModal
// import { BlockDefinition } from '@interfaces/common'; // Import BlockDefinition
// import BlockStateManager from '@state/BlockStateManager'; // Import BlockStateManager
import WorkspacePersistenceManager from '@services/WorkspacePersistenceManager'; // Added


interface ToolbarProps {
  // isAddBlockModalOpen: boolean; // REMOVE
  // onToggleAddBlockModal: () => void; // REMOVE
}

const Toolbar: React.FC<ToolbarProps> = ({
  // isAddBlockModalOpen, // REMOVE
  // onToggleAddBlockModal, // REMOVE
}) => {
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleToolbarToggleGeminiPanel = useCallback(() => {
    // Placeholder for actual Gemini Panel logic
    console.log("Toggle Gemini Panel clicked");
    // Potentially call a service or dispatch an action for Gemini Panel
    setIsModalVisible(false); // CHANGED
  }, []); // CHANGED (dependency on onToggleAddBlockModal removed)

  // Import function now internal to Toolbar
  const handleImportWorkspaceTrigger = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] ) {
      WorkspacePersistenceManager.importWorkspace(event.target.files[0]);
      event.target.value = ""; // Reset file input
    }
  }

  // const handleImportClick = () => { // This will be inlined
  //   importFileInputRef.current?.click();
  // };

  // const handleDeleteDefinition = (e: React.MouseEvent, definitionId: string) => { // Removed unused function
  //   e.stopPropagation(); // Prevent block add
  //   // Use appBlockDefinitionsFromCtx (from props) for the confirmation message
  //   if (window.confirm(`Are you sure you want to delete the block definition for "${appBlockDefinitionsFromCtx.find((d: BlockDefinition)=>d.id===definitionId)?.name || definitionId}"? This cannot be undone.`)) {
  //     // deleteBlockDefinition(definitionId); // Assumes deleteBlockDefinition is already correctly sourced from BSM
  //     // setIsAddBlockMenuOpen(false); // This state is removed
  //   }
  // };


  // State for UI, distinct from engine's actual master volume for mute/unmute
  // const [uiMasterVolume, setUiMasterVolume] = useState(0.7);
  // const [isMutedByToolbar, setIsMutedByToolbar] = useState(false);

  const toneTransport =  Tone.getTransport();


  return (
    <div className="bg-gray-800 p-2 shadow-md flex items-center space-x-2 fixed top-0 left-0 right-0 z-20 h-14">
      <div className="text-xl font-semibold text-sky-400">AudioBlocks</div>
      {/* Add Block Button - Toggles Modal */}
      <div className="relative">
        <button
          onClick={() => setIsModalVisible(true)} // Toggle modal
          className="flex items-center bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors"
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Block
        </button>
      </div>

      {/* AddBlockModal */}
      {isModalVisible && ( // CHANGED
        <AddBlockModal
          onToggleGeminiPanel={handleToolbarToggleGeminiPanel}
          onClose={() => setIsModalVisible(false)} // CHANGED
        />
      )}

      <button
        // Use the new prop and fetch state from Tone.js
          title={toneTransport.state === "started" ? "Stop Audio Transport" : "Start Audio Transport"}
          className={`flex items-center ${
            toneTransport.state === "started" ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
          } text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2`}
          onClick={async () => {
            // AudioEngineService.toggleGlobalAudio()
            if (toneTransport.state === "started") {
              AudioEngineService.stopTransport();   
              // toneTransport.stop();
            } else {
              await Tone.start()
              AudioEngineService.initialize();  // <--- Existing line
              AudioEngineService.updateAudioGraphConnections();
              // await toneTransport.start();
              // console.log("Transport started");
            }
          }}
              >    {toneTransport.state !== "started" ? <StopIcon className="w-4 h-4 mr-1" /> : <PlayIcon className="w-4 h-4 mr-1" />}
        {toneTransport.state === "started" ? 'Stop Transport' : 'Start Transport'}
      </button>
      
      {/* Master Volume Control (Example) */}
      {/* <div className="flex items-center ml-2">
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
      </div> */}

      {/* BPM Input */}
      {/* <div className="flex items-center ml-2">
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
      </div> */}

      {/* Audio Output Device Selector */}
      {/* {availableOutputDevices.length > 0 && (typeof AudioContext !== 'undefined' && (AudioContext.prototype as any).setSinkId) && (
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
      )} */}


      {/* <button
        onClick={onToggleTestRunner}
        title="Run Tests"
        className="flex items-center bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
      >
        <BeakerIcon className="w-4 h-4 mr-1" />
        Run Tests
      </button> */}

      {/* Workspace Management Buttons */}
      <button
        onClick={() => {
            WorkspacePersistenceManager.exportWorkspace();
        }}
        title="Export Workspace"
        className="flex items-center bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
        // disabled={!workspacePersistenceManager}
      >
        Export
      </button>
      <button
        onClick={() => importFileInputRef.current?.click()} // Inlined handleImportClick
        title="Import Workspace"
        className="flex items-center bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
        // disabled={!workspacePersistenceManager}
      >
        Import
      </button>
      <input
        type="file"
        ref={importFileInputRef}
        onChange={handleImportWorkspaceTrigger} // Use the new handler defined above
        accept=".json"
        className="hidden"
        aria-hidden="true"
      />

       {/* <button
        onClick={handleToolbarToggleGeminiPanel} // Changed from onToggleGeminiPanel, assumes it's available in this scope
        className={`ml-auto flex items-center bg-pink-500 hover:bg-pink-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors`} // Removed isGeminiPanelOpen dependency
      >
        <span className="mr-1 text-lg">✨</span> Gemini
      </button>  */}
    </div>
  );
};

export default Toolbar;
