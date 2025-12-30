import { create } from 'zustand'
import BlockStateManager from '@state/BlockStateManager'
import { BlockDefinition, BlockInstance } from '@interfaces'

export const useBlocks = create((set) => ({
  blocks: BlockStateManager.getBlockInstances(),
  updateBlockInstance: (id: string, update: Partial<BlockInstance>) => set(() => {
    BlockStateManager.updateBlockInstance(id, update)
    return { blocks: BlockStateManager.getBlockInstances() }
  }),
  updateBlockInstanceParameter: (id: string, parameterId: string, value: any) => set(() => {
    BlockStateManager.updateBlockInstanceParameter(id, parameterId, value)
    return { blocks: BlockStateManager.getBlockInstances() }
  }),
  addBlockInstance: (definition: BlockDefinition) => set(() => {
    BlockStateManager.addBlockInstance(definition)
    return { blocks: BlockStateManager.getBlockInstances() }
  }),

}))