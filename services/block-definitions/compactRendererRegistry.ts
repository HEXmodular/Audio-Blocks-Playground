import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';

// Import the actual renderer components
import OscillatorCompactRenderer from '@blocks/native-blocks/renderers/OscillatorCompactRenderer';
import GainCompactRenderer from '@blocks/native-blocks/renderers/GainCompactRenderer';
import ManualGateRenderer from '@blocks/native-blocks/renderers/ManualGateRenderer';
import StepSequencerRenderer from '@blocks/native-blocks/renderers/StepSequencerRenderer';
// Import DefaultCompactRenderer if you decide to register it, though current plan uses it as a direct fallback.
// import DefaultCompactRenderer from '@components/block-renderers/DefaultCompactRenderer';


export interface CompactRendererRegistry {
  [id: string]: React.FC<CompactRendererProps>;
}

export const compactRendererRegistry: CompactRendererRegistry = {
  'oscillator': OscillatorCompactRenderer, // Using simple IDs like 'oscillator'
  'gain': GainCompactRenderer,
  'manual-gate': ManualGateRenderer,
  'StepSequencerRenderer': StepSequencerRenderer,
  // If you wanted to register the default, it might be:
  // 'default': DefaultCompactRenderer,
};

// Function to get a renderer, could be useful
export const getCompactRendererById = (id: string | undefined): React.FC<CompactRendererProps> | undefined => {
  if (!id) return undefined;
  return compactRendererRegistry[id];
};
