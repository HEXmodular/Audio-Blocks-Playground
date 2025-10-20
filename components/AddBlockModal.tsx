import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Add useCallback
import BlockStateManager from '@state/BlockStateManager';
import { BlockDefinition } from '@interfaces/block';
import styles from './AddBlockModal.module.css';

// Local BlockDefinition interface removed, using imported one.

interface AddBlockModalProps {
  // appBlockDefinitionsFromCtx: BlockDefinition[]; // REMOVE THIS LINE
  // onAddBlockFromDefinition: (definition: BlockDefinition) => void; // REMOVE THIS LINE
  onToggleGeminiPanel: () => void;
  onClose: () => void;
}

const GROUP_ORDER = ['data', 'audio', 'control', 'logic', 'ai', 'i/o', 'filter', 'oscillator', 'instrument', '8-bit', 'pitch', 'effects', 'container'];

const AddBlockModal: React.FC<AddBlockModalProps> = ({
  // appBlockDefinitionsFromCtx, // REMOVE THIS
  // onAddBlockFromDefinition, // REMOVE THIS
  onToggleGeminiPanel,
  onClose,
}) => {
  const [filterText, setFilterText] = useState('');
  const [blockDefinitions, setBlockDefinitions] = useState<BlockDefinition[]>([]);

  useEffect(() => {
    const definitions = BlockStateManager.getBlockDefinitions();
    setBlockDefinitions(definitions);
  }, []); // Empty dependency array means this runs once on mount

  const handleSelectBlock = useCallback((definition: BlockDefinition) => {
    BlockStateManager.addBlockInstance(definition);
    onClose(); // Call the onClose prop to close the modal
  }, [onClose]); // Dependency: onClose prop

  // Clicks on the modal content should not propagate to the overlay
  const handleModalContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
  };

  const filteredBlocks = useMemo(() => {
    if (!filterText) {
      return blockDefinitions; // CHANGED
    }
    return blockDefinitions.filter(def => // CHANGED
      def.name.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [blockDefinitions, filterText]); // CHANGED dependency

  const groupedAndFilteredBlocks = useMemo(() => {
    const groups: Record<string, BlockDefinition[]> = GROUP_ORDER.reduce((acc, group) => {
      acc[group] = [];
      return acc;
    }, {} as Record<string, BlockDefinition[]>);


    filteredBlocks.forEach(def => {
      if (groups[def.category]) {
        groups[def.category].push(def);
      } else {
        console.error(`Error adding block to group: ${def.category}`);
      }
    });
    return groups;
  }, [filteredBlocks]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 text-white w-screen h-screen p-6 flex flex-col"
        onClick={handleModalContentClick}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-semibold text-sky-400">Add Block</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-3xl p-2"
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
          className="w-full p-3 mb-4 bg-gray-700 text-white rounded-md border border-gray-600 placeholder-gray-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none flex-shrink-0"
          aria-label="Filter blocks by name"
        />

        <div className="flex-grow bg-gray-750 p-4 rounded-md overflow-y-auto border border-gray-600 min-h-[0] mb-4">
          {filteredBlocks.length > 0 ? (
            GROUP_ORDER.map(groupTitle => {
              const blocksInGroup = groupedAndFilteredBlocks[groupTitle];
              if (blocksInGroup && blocksInGroup.length > 0) {
                return (
                  <div key={groupTitle} 
                  // className="mb-4"
                  
                  > 
                    <h3 className="text-xl font-semibold text-sky-300 mt-2 mb-3 sticky top-0 bg-gray-750 py-2 z-10"> {/* Adjusted padding and margin for header */}
                      {groupTitle.toUpperCase()}
                    </h3>
                    <div className={styles.blockGroup}
                    // className="flex flex-wrap gap-3"
                    > {/* Changed to gap-3 for slightly more spacing */}
                      {blocksInGroup.map((def) => (
                        <div // Changed div to button for clickability and semantics
                          className={styles.blockTitle}
                          key={def.id}
                          onClick={() => handleSelectBlock(def)}
                          // className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          title={def.description || def.name} // Keep title for tooltip, but description not displayed inline
                        >
                          {def.name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })
          ) : blockDefinitions.length === 0 ? ( // CHANGED
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
          }}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center text-lg flex-shrink-0"
        >
          <span className="mr-2 text-xl">✨</span> Create with AI
        </button>
      </div>
    </div>
  );
};

export default AddBlockModal;
