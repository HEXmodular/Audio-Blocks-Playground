import React, { useState, useMemo } from 'react';

interface BlockDefinition {
  id: string;
  name: string;
  description?: string;
  isAiGenerated?: boolean; // Added for grouping
  runsAtAudioRate?: boolean; // Added for grouping
  // Add other properties of BlockDefinition if known
}

interface AddBlockModalProps {
  appBlockDefinitionsFromCtx: BlockDefinition[];
  onAddBlockFromDefinition: (definition: BlockDefinition) => void;
  onToggleGeminiPanel: () => void;
  onClose: () => void;
}

const GROUP_AI = "AI Generated";
const GROUP_AUDIO = "Audio Rate Blocks";
const GROUP_CONTROL = "Control & Logic Blocks";
const GROUP_ORDER = [GROUP_AI, GROUP_AUDIO, GROUP_CONTROL];

const AddBlockModal: React.FC<AddBlockModalProps> = ({
  appBlockDefinitionsFromCtx,
  onAddBlockFromDefinition,
  onToggleGeminiPanel,
  onClose,
}) => {
  const [filterText, setFilterText] = useState('');

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
  };

  const filteredBlocks = useMemo(() => {
    if (!filterText) {
      return appBlockDefinitionsFromCtx;
    }
    return appBlockDefinitionsFromCtx.filter(def =>
      def.name.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [appBlockDefinitionsFromCtx, filterText]);

  const groupedAndFilteredBlocks = useMemo(() => {
    const groups: Record<string, BlockDefinition[]> = {
      [GROUP_AI]: [],
      [GROUP_AUDIO]: [],
      [GROUP_CONTROL]: [],
    };

    filteredBlocks.forEach(def => {
      if (def.isAiGenerated) {
        groups[GROUP_AI].push(def);
      } else if (def.runsAtAudioRate) {
        groups[GROUP_AUDIO].push(def);
      } else {
        groups[GROUP_CONTROL].push(def);
      }
    });
    return groups;
  }, [filteredBlocks]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={handleModalContentClick}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-sky-400">Add Block</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-3xl"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <input
          type="text"
          placeholder="Filter blocks by name..."
          value={filterText}
          onChange={handleFilterChange}
          className="w-full p-3 mb-4 bg-gray-700 text-white rounded-md border border-gray-600 placeholder-gray-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          aria-label="Filter blocks by name"
        />

        <div className="flex-grow bg-gray-750 p-4 rounded-md overflow-y-auto border border-gray-600 min-h-[200px] mb-4">
          {filteredBlocks.length > 0 ? (
            GROUP_ORDER.map(groupTitle => {
              const blocksInGroup = groupedAndFilteredBlocks[groupTitle];
              if (blocksInGroup && blocksInGroup.length > 0) {
                return (
                  <div key={groupTitle} className="mb-3">
                    <h3 className="text-lg font-semibold text-sky-300 mt-2 mb-2 sticky top-0 bg-gray-750 py-1">
                      {groupTitle}
                    </h3>
                    {blocksInGroup.map((def) => (
                      <div
                        key={def.id}
                        onClick={() => onAddBlockFromDefinition(def)}
                        className="p-3 mb-2 bg-gray-700 hover:bg-gray-600 rounded-md cursor-pointer transition-colors"
                        title={def.description || def.name}
                      >
                        <div className="font-medium">{def.name}</div>
                        {def.description && (
                          <div className="text-sm text-gray-400 truncate">
                            {def.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })
          ) : appBlockDefinitionsFromCtx.length === 0 ? (
            <div className="text-gray-400 text-center py-10">
              No blocks available to add.
            </div>
          ) : (
            <div className="text-gray-400 text-center py-10">
              No blocks match your filter "{filterText}".
            </div>
          )}
        </div>

        <button
          onClick={() => {
            onToggleGeminiPanel();
            onClose();
          }}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center text-lg"
        >
          <span className="mr-2 text-xl">✨</span> Create with AI
        </button>
      </div>
    </div>
  );
};

export default AddBlockModal;
