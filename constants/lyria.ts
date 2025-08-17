// // This file previously contained LYRIA_MASTER_BLOCK_DEFINITION and LYRIA_PROMPT_BLOCK_DEFINITION.
// // These definitions have been migrated to their respective CreatableNode class implementations
// // (e.g., services/lyria-blocks/LyriaMaster.ts) or are managed elsewhere.

// import { BlockDefinition } from "@interfaces";
// import { createParameterDefinitions } from "@constants/constants";

// // LYRIA_SCALE_OPTIONS was also removed as it was part of LYRIA_MASTER_BLOCK_DEFINITION.

// // All imports previously here (BlockDefinition, Scale as AppScale, createParameterDefinitions)
// // are no longer needed in this file.

// export const LYRIA_PROMPT_BLOCK_DEFINITION: BlockDefinition = {
//     id: 'lyria-realtime-prompt-v1',
//     name: 'Lyria Realtime Prompt',
//     description: 'Creates a single prompt object for Lyria with text and weight.',
//     category: 'ai',
//     inputs: [
//       { id: 'text_in', name: 'Text In', type: 'string', description: 'Overrides prompt text parameter.' },
//       { id: 'weight_in', name: 'Weight In', type: 'number', description: 'Overrides prompt weight parameter (0-1).' }
//     ],
//     outputs: [
//       { id: 'prompt_out', name: 'Prompt Object', type: 'any', description: '{text: string, weight: number}' }
//     ],
//     parameters: createParameterDefinitions([
//       { id: 'prompt_text', name: 'Prompt Text', type: 'text_input', defaultValue: '', description: 'Text content of the prompt.' },
//       { id: 'prompt_weight', name: 'Weight', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Weight of the prompt (0.0 to 1.0).' }
//     ]),
//     logicCode: `
//   // Lyria Realtime Prompt Block Logic
//   const textParam = params.prompt_text;
//   const weightParam = params.prompt_weight;
  
//   const textInput = inputs.text_in;
//   const weightInput = inputs.weight_in; // number between 0 and 1
  
//   const effectiveText = (textInput !== null && textInput !== undefined && typeof textInput === 'string' && textInput.trim() !== "") ? textInput : textParam;
//   let effectiveWeight = weightParam;
  
//   if (weightInput !== null && weightInput !== undefined && typeof weightInput === 'number' && !isNaN(weightInput)) {
//     effectiveWeight = Math.max(0, Math.min(1, weightInput)); // Clamp to 0-1
//   }
  
//   const promptObject = {
//     text: effectiveText,
//     weight: effectiveWeight
//   };
  
//   setOutput('prompt_out', promptObject);
//   // __custom_block_logger__(\`Lyria Prompt: \${JSON.stringify(promptObject)}\`);
  
//   return {};
//     `.trim(),
//     initialPrompt: 'Create a Lyria Realtime Prompt block. Inputs: text_in (string), weight_in (number 0-1). Outputs: prompt_out (any, for {text, weight} object). Parameters: "Prompt Text" (text_input), "Prompt Weight" (slider 0-1). Logic forms the output object from inputs or parameters.',
//   };
