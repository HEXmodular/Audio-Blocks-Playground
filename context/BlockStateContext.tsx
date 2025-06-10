import React, { createContext, useContext, useState, useMemo, ReactNode, useCallback } from 'react';
import { BlockInstance, BlockDefinition, BlockParameter } from '../types'; // Assuming BlockParameter is used by BlockStateManager or types
import { BlockStateManager, getDefaultOutputValue } from '../state/BlockStateManager'; // getDefaultOutputValue might not be directly needed by provider, but good for BSM context
// ALL_BLOCK_DEFINITIONS is not imported here, assuming BlockStateManager handles initial loading of core defs.

interface BlockStateContextValues {
  blockStateManager: BlockStateManager; // Expose the manager instance
  blockDefinitions: BlockDefinition[];
  blockInstances: BlockInstance[];
  addBlockInstance: (definition: BlockDefinition, name?: string, position?: { x: number; y: number }) => BlockInstance;
  updateBlockInstance: (instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => void;
  deleteBlockInstance: (instanceId: string) => void;
  addBlockDefinition: (definition: BlockDefinition) => void;
  updateBlockDefinition: (definitionId: string, updates: Partial<BlockDefinition>) => void;
  deleteBlockDefinition: (definitionId: string) => boolean;
  getDefinitionById: (definitionId: string) => BlockDefinition | undefined;
  addLogToBlockInstance: (instanceId: string, message: string, type?: 'info' | 'warning' | 'error') => void;
}

const BlockStateContext = createContext<BlockStateContextValues | undefined>(undefined);

export const BlockStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [blockDefinitions, setBlockDefinitions] = useState<BlockDefinition[]>([]);
  const [blockInstances, setBlockInstances] = useState<BlockInstance[]>([]);

  const blockStateManager = useMemo(() => {
    console.log("BlockStateProvider: Initializing BlockStateManager");
    // BlockStateManager constructor takes setters for definitions and instances
    return new BlockStateManager(setBlockDefinitions, setBlockInstances);
  }, []); // Empty dependency array ensures it's created once

  const addBlockInstance = useCallback(
    (definition: BlockDefinition, name?: string, position?: { x: number; y: number }) =>
      blockStateManager.addBlockInstance(definition, name, position),
    [blockStateManager]
  );

  const updateBlockInstance = useCallback((instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => {
    blockStateManager.updateBlockInstance(instanceId, updates);
  }, [blockStateManager]);

  const deleteBlockInstance = useCallback((instanceId: string) => {
    blockStateManager.deleteBlockInstance(instanceId);
  }, [blockStateManager]);

  const addBlockDefinition = useCallback((definition: BlockDefinition) => {
    blockStateManager.addBlockDefinition(definition);
  }, [blockStateManager]);

  const updateBlockDefinition = useCallback((definitionId: string, updates: Partial<BlockDefinition>) => {
    blockStateManager.updateBlockDefinition(definitionId, updates);
  }, [blockStateManager]);

  const deleteBlockDefinition = useCallback((definitionId: string) => {
    return blockStateManager.deleteBlockDefinition(definitionId);
  }, [blockStateManager]);

  // Note: BlockStateManager uses getDefinitionForBlock(id) internally,
  // this context version might be named getDefinitionById for clarity if it directly uses BSM's method.
  // The prompt uses getDefinitionById. BlockStateManager has getDefinitionForBlock(id) and getDefinitionForInstance(instance).
  // Assuming getDefinitionById in context should call blockStateManager.getDefinitionForBlock(definitionId).
  const getDefinitionById = useCallback((definitionId: string) => {
    return blockStateManager.getDefinitionForBlock(definitionId);
  }, [blockStateManager]);

  const addLogToBlockInstance = useCallback((instanceId: string, message: string, type?: 'info' | 'warning' | 'error') => {
    blockStateManager.addLogToBlockInstance(instanceId, message, type);
  }, [blockStateManager]);

  const value: BlockStateContextValues = {
    blockStateManager, // Exposing the whole manager
    blockDefinitions,
    blockInstances,
    addBlockInstance,
    updateBlockInstance,
    deleteBlockInstance,
    addBlockDefinition,
    updateBlockDefinition,
    deleteBlockDefinition,
    getDefinitionById,
    addLogToBlockInstance,
  };

  return <BlockStateContext.Provider value={value}>{children}</BlockStateContext.Provider>;
};

export const useBlockState = (): BlockStateContextValues => {
  const context = useContext(BlockStateContext);
  if (context === undefined) {
    throw new Error('useBlockState must be used within a BlockStateProvider');
  }
  return context;
};
