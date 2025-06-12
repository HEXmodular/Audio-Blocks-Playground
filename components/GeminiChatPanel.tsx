
import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { BlockInstance, BlockDefinition } from '@interfaces/common';
import { generateBlockDefinitionWithTesting, modifyLogicCodeWithPrompt, GenerateBlockDefinitionResult } from '@services/geminiService';
import { LightBulbIcon } from '@icons/icons';
import { useBlockState } from '@context/BlockStateContext'; // Import useBlockState

interface GeminiChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedBlockInstance: BlockInstance | null;
  // getBlockDefinition removed from props
  onAddBlockFromGeneratedDefinition: (definition: BlockDefinition, instanceName?: string) => void;
  onUpdateBlockLogicCode: (instanceId: string, newLogicCode: string, modificationPrompt: string) => void;
  apiKeyMissing: boolean;
}

export interface GeminiChatPanelRef {
  addSystemMessage: (text: string, isError?: boolean) => void;
}

type Message = {
  id: string;
  sender: 'user' | 'gemini' | 'system';
  text: string;
  isError?: boolean;
};

const GeminiChatPanel = forwardRef<GeminiChatPanelRef, GeminiChatPanelProps>(({
  isOpen,
  onToggle,
  selectedBlockInstance,
  // getBlockDefinition, // Removed from destructuring
  onAddBlockFromGeneratedDefinition,
  onUpdateBlockLogicCode,
  apiKeyMissing
}, ref) => {
  const { getDefinitionById } = useBlockState(); // Consume context

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (sender: Message['sender'], text: string, isError: boolean = false) => {
    setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), sender, text, isError }]);
  };

  useImperativeHandle(ref, () => ({
    addSystemMessage: (text: string, isError: boolean = false) => {
      addMessage('system', text, isError);
    }
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading || apiKeyMissing) return;

    const userPromptText = prompt;
    addMessage('user', userPromptText);
    setPrompt('');
    setIsLoading(true);

    try {
      if (selectedBlockInstance) {
        // Modifying existing block's logic code
        const definition = getDefinitionById(selectedBlockInstance.definitionId); // Use context function
        if (!definition) {
            throw new Error(`Definition for block ${selectedBlockInstance.name} not found.`);
        }
        addMessage('system', `Modifying logic for block: ${selectedBlockInstance.name}...`);
        const newLogicCode = await modifyLogicCodeWithPrompt(
          definition.logicCode, 
          userPromptText,
          { 
            inputs: definition.inputs, 
            outputs: definition.outputs, 
            parameters: definition.parameters,
            name: definition.name,
            description: definition.description // Added description
          }
        );
        onUpdateBlockLogicCode(selectedBlockInstance.instanceId, newLogicCode, userPromptText);
        addMessage('gemini', `Logic code for '${selectedBlockInstance.name}' updated successfully. Check the CODE view.`);
      } else {
        // Generating new block definition with testing
        const result: GenerateBlockDefinitionResult = await generateBlockDefinitionWithTesting(
            userPromptText, 
            (message, isError) => addMessage('system', message, isError) // Pass addMessage as callback for system messages
        );
        
        onAddBlockFromGeneratedDefinition(result.definition, result.definition.name);
        if (result.success) {
            addMessage('gemini', result.message);
        } else {
            // Even if tests failed after retries, the block is added for inspection.
            // The result.message will contain details about test failures.
            addMessage('gemini', result.message, true); 
        }
      }
    } catch (error) {
      console.error("Gemini interaction error:", error);
      addMessage('gemini', `Error: ${(error as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-gray-800 border-l border-gray-700 shadow-2xl flex flex-col z-30 transform transition-transform duration-300 ease-in-out">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-pink-400 flex items-center">
          <LightBulbIcon className="w-5 h-5 mr-2" />
          Gemini AI Assistant
        </h2>
        <button onClick={onToggle} className="text-gray-400 hover:text-white">&times;</button>
      </div>

      {apiKeyMissing && (
         <div className="p-4 bg-red-800 text-red-200 text-sm">
            <strong>Warning:</strong> API_KEY environment variable not set. Gemini functionality is disabled. Please configure it to use the AI assistant.
        </div>
      )}

      <div className="flex-grow p-4 overflow-y-auto space-y-3 text-sm">
        {messages.map(msg => (
          <div key={msg.id} className={`p-2 rounded-lg max-w-[90%] ${
            msg.sender === 'user' ? 'bg-sky-600 text-white self-end ml-auto' :
            msg.sender === 'gemini' ? (msg.isError ? 'bg-red-700 text-red-100' : 'bg-gray-700 text-gray-200') :
            'bg-purple-700 text-purple-100 text-xs italic' // system messages
          }`}>
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-700">
        {selectedBlockInstance && (
          <p className="text-xs text-gray-400 mb-1">
            Context: Modifying block <span className="font-semibold text-sky-400">'{selectedBlockInstance.name}'</span>.
          </p>
        )}
        {!selectedBlockInstance && (
          <p className="text-xs text-gray-400 mb-1">
            Context: Creating a <span className="font-semibold text-sky-400">new block definition</span>.
          </p>
        )}
        <form onSubmit={handleSubmit} ref={formRef}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                if (formRef.current && !isLoading && prompt.trim() && !apiKeyMissing) {
                  formRef.current.requestSubmit();
                }
              }
            }}
            placeholder={apiKeyMissing ? "API Key missing..." : (selectedBlockInstance ? "Describe changes to selected block's logic..." : "Describe the new block you want to create...")}
            rows={3}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 resize-none disabled:opacity-50"
            disabled={isLoading || apiKeyMissing}
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim() || apiKeyMissing}
            className="w-full mt-2 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : (selectedBlockInstance ? 'Update Logic' : 'Generate Block')}
          </button>
        </form>
      </div>
    </div>
  );
});

export default GeminiChatPanel;
