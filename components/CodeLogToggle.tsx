

import React from 'react';
import { BlockView } from '@types/types';
import { CpuChipIcon, CodeIcon, CommandLineIcon, LightBulbIcon, LinkIcon, BeakerIcon } from '@icons/icons'; // Added BeakerIcon

interface CodeLogToggleProps {
  currentView: BlockView;
  onViewChange: (view: BlockView) => void;
  hasError: boolean;
  availableViews?: BlockView[]; // Optional: if not provided, all views are shown
}

const ALL_POSSIBLE_VIEWS: { view: BlockView; icon: React.ReactNode; label: string }[] = [
    { view: BlockView.UI, icon: <CpuChipIcon className={`w-5 h-5`} />, label: 'UI' }, // Error indicator handled separately
    { view: BlockView.CONNECTIONS, icon: <LinkIcon />, label: 'Connections' },
    { view: BlockView.CODE, icon: <CodeIcon />, label: 'Code' },
    { view: BlockView.LOGS, icon: <CommandLineIcon />, label: 'Logs' },
    { view: BlockView.PROMPT, icon: <LightBulbIcon />, label: 'Prompt Info' },
    { view: BlockView.TESTS, icon: <BeakerIcon />, label: 'Tests' },
];


const CodeLogToggle: React.FC<CodeLogToggleProps> = ({ currentView, onViewChange, hasError, availableViews }) => {
  const viewsToRender = availableViews 
    ? ALL_POSSIBLE_VIEWS.filter(v => availableViews.includes(v.view))
    : ALL_POSSIBLE_VIEWS;

  return (
    <div className="flex space-x-1 bg-gray-700 p-1 rounded-md">
      {viewsToRender.map(({ view, icon, label }) => (
        <button
          key={view}
          title={label}
          onClick={() => onViewChange(view)}
          className={`p-1.5 rounded-md ${
            currentView === view ? 'bg-sky-500 text-white' : 'text-gray-400 hover:bg-gray-600 hover:text-sky-300'
          } transition-all duration-150 relative`}
          aria-label={`View ${label}`}
        >
          {/* Special handling for error icon on UI view button */}
          {view === BlockView.UI ? <CpuChipIcon className={`w-5 h-5 ${hasError && currentView !== BlockView.UI ? 'text-red-400' : ''}`} /> : icon}
          {view === BlockView.UI && hasError && (
            <span className="absolute top-0 right-0 block h-2 w-2 transform -translate-y-1/2 translate-x-1/2 rounded-full bg-red-500 ring-2 ring-gray-700" aria-hidden="true"></span>
          )}
        </button>
      ))}
    </div>
  );
};

export default CodeLogToggle;
