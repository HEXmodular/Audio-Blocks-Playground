

import React from 'react';
import { PlusIcon, PlayIcon, StopIcon, BeakerIcon, SmallTrashIcon } from './icons'; 
import { BlockDefinition } from '../types';

interface ToolbarProps {
  onAddBlockFromDefinition: (definition: BlockDefinition) => void;
  onToggleGeminiPanel: () => void;
  isGeminiPanelOpen: boolean;
  onToggleGlobalAudio: () => void;
  isAudioGloballyEnabled: boolean;
  onToggleTestRunner: () => void;
  allBlockDefinitions: BlockDefinition[];
  onExportWorkspace: () => void;
  onImportWorkspace: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteBlockDefinition: (definitionId: string) => void;
  isCoreDefinition: (definitionId: string) => boolean; // Changed from coreDefinitionIds
  bpm: number;
  onBpmChange: (newBpm: number) => void;
  availableOutputDevices: MediaDeviceInfo[]; // New prop
  selectedSinkId: string;                   // New prop
  onSetOutputDevice: (sinkId: string) => Promise<boolean>; // New prop
}

const Toolbar: React.FC<ToolbarProps> = ({
  onAddBlockFromDefinition,
  onToggleGeminiPanel,
  isGeminiPanelOpen,
  onToggleGlobalAudio,
  isAudioGloballyEnabled,
  onToggleTestRunner,
  allBlockDefinitions,
  onExportWorkspace,
  onImportWorkspace,
  onDeleteBlockDefinition,
  isCoreDefinition: isCoreDefinitionProp, // Renamed to avoid conflict if used directly
  bpm,
  onBpmChange,
  availableOutputDevices,
  selectedSinkId,
  onSetOutputDevice,
}) => {
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = React.useState(false);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  const handleDeleteDefinition = (e: React.MouseEvent, definitionId: string) => {
    e.stopPropagation(); // Prevent block add
    if (window.confirm(`Are you sure you want to delete the block definition for "${allBlockDefinitions.find(d=>d.id===definitionId)?.name || definitionId}"? This cannot be undone.`)) {
      onDeleteBlockDefinition(definitionId);
      setIsAddBlockMenuOpen(false); // Close menu after action
    }
  };
  
  const handleBpmInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseInt(e.target.value, 10);
    if (!isNaN(newBpm) && newBpm > 0 && newBpm <= 999) {
      onBpmChange(newBpm);
    } else if (e.target.value === "") {
        onBpmChange(120); 
    }
  };

  const handleOutputDeviceChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await onSetOutputDevice(event.target.value);
  };


  return (
    <div className="bg-gray-800 p-2 shadow-md flex items-center space-x-2 fixed top-0 left-0 right-0 z-20 h-14">
      <div className="text-xl font-semibold text-sky-400">AudioBlocks</div>
      <div className="relative">
        <button
          onClick={() => setIsAddBlockMenuOpen(!isAddBlockMenuOpen)}
          className="flex items-center bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors"
          aria-haspopup="true"
          aria-expanded={isAddBlockMenuOpen}
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Block
        </button>
        {isAddBlockMenuOpen && (
          <div className="absolute left-0 mt-2 w-72 bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1 z-30 max-h-96 overflow-y-auto">
            {allBlockDefinitions.map((def) => {
              const isThisBlockCore = isCoreDefinitionProp(def.id);
              return (
                <div key={def.id} className="flex items-center justify-between hover:bg-gray-600 group">
                  <button
                    onClick={() => {
                      onAddBlockFromDefinition(def);
                      setIsAddBlockMenuOpen(false);
                    }}
                    className="flex-grow text-left px-4 py-2 text-sm text-gray-200 group-hover:text-sky-300 transition-colors"
                    title={def.description}
                  >
                    {def.name}
                    {def.description && <span className="block text-xs text-gray-400 truncate">({def.description.substring(0,30)}{def.description.length > 30 ? '...' : ''})</span>}
                  </button>
                  {!isThisBlockCore && (
                    <button
                      onClick={(e) => handleDeleteDefinition(e, def.id)}
                      title={`Delete definition: ${def.name}`}
                      className="p-2 text-gray-500 hover:text-red-400 opacity-50 group-hover:opacity-100 transition-opacity mr-2"
                      aria-label={`Delete block definition ${def.name}`}
                    >
                      <SmallTrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
             <button
                onClick={() => {
                  onToggleGeminiPanel();
                  setIsAddBlockMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-sky-400 hover:bg-gray-600 hover:text-sky-300 transition-colors border-t border-gray-600 sticky bottom-0 bg-gray-700"
              >
                ✨ Create with AI...
              </button>
          </div>
        )}
      </div>
      <button
        onClick={onToggleGlobalAudio}
        title={isAudioGloballyEnabled ? "Stop Audio Engine" : "Start Audio Engine"}
        className={`flex items-center ${
          isAudioGloballyEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
        } text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2`}
      >
        {isAudioGloballyEnabled ? <StopIcon className="w-4 h-4 mr-1" /> : <PlayIcon className="w-4 h-4 mr-1" />}
        {isAudioGloballyEnabled ? 'Stop Audio' : 'Start Audio'}
      </button>
      
      {/* BPM Input */}
      <div className="flex items-center ml-2">
        <label htmlFor="bpm-input" className="text-xs text-gray-400 mr-1.5">BPM:</label>
        <input
          type="number"
          id="bpm-input"
          value={bpm.toString()}
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
            value={selectedSinkId}
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
        onClick={onExportWorkspace}
        title="Export Workspace"
        className="flex items-center bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
      >
        Export
      </button>
      <button
        onClick={handleImportClick}
        title="Import Workspace"
        className="flex items-center bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-md text-sm transition-colors ml-2"
      >
        Import
      </button>
      <input
        type="file"
        ref={importFileInputRef}
        onChange={onImportWorkspace}
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
