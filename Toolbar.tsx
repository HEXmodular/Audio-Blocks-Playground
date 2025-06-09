
import React from 'react';
import { PlusIcon, PlayIcon, StopIcon, BeakerIcon } from './icons'; 
// import { ALL_BLOCK_DEFINITIONS } from '../constants'; // No longer directly imported here
import { BlockDefinition } from '../types';

interface ToolbarProps {
  onAddBlockFromDefinition: (definition: BlockDefinition) => void;
  onToggleGeminiPanel: () => void;
  isGeminiPanelOpen: boolean;
  onToggleGlobalAudio: () => void;
  isAudioGloballyEnabled: boolean;
  onToggleTestRunner: () => void;
  allBlockDefinitions: BlockDefinition[]; // Now passed as a prop
  onExportWorkspace: () => void;
  onImportWorkspace: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onAddBlockFromDefinition,
  onToggleGeminiPanel,
  isGeminiPanelOpen,
  onToggleGlobalAudio,
  isAudioGloballyEnabled,
  onToggleTestRunner,
  allBlockDefinitions, // Use this prop
  onExportWorkspace,
  onImportWorkspace,
}) => {
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = React.useState(false);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importFileInputRef.current?.click();
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
          <div className="absolute left-0 mt-2 w-60 bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1 z-30 max-h-96 overflow-y-auto">
            {allBlockDefinitions.map((def) => (
              <button
                key={def.id}
                onClick={() => {
                  onAddBlockFromDefinition(def);
                  setIsAddBlockMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-sky-300 transition-colors"
                title={def.description}
              >
                {def.name} 
                {def.description && <span className="block text-xs text-gray-400 truncate">({def.description.substring(0,30)}{def.description.length > 30 ? '...' : ''})</span>}
              </button>
            ))}
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
