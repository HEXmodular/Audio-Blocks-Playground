import BlockStateManager from '@state/BlockStateManager';
import { ContainerBlock } from '@blocks/native-blocks/ContainerBlock';
import { OscillatorBlock } from '@blocks/native-blocks/OscillatorBlock'; // Assuming a simple block for testing

describe('BlockStateManager Container Functionality', () => {
  let blockStateManager: BlockStateManager;

  beforeEach(() => {
    // Ensure a fresh instance for each test
    localStorage.clear(); // Clear local storage to prevent interference between tests
    // BlockStateManager is a singleton, so we need to reset its internal state or re-initialize.
    // For simplicity, we'll rely on localStorage clear and the existing singleton's behavior on init.
    // A more robust approach might involve a reset method on the singleton or dependency injection.
    blockStateManager = BlockStateManager; // Get the singleton instance
    blockStateManager.setAllBlockDefinitions([ContainerBlock, OscillatorBlock]);
    blockStateManager.setAllBlockInstances([]); // Start with no instances
  });

  test('should add a child to a container block', () => {
    const container = blockStateManager.addBlockInstance(ContainerBlock, 'MyContainer');
    const child = blockStateManager.addBlockInstance(OscillatorBlock, 'MyOscillator', { x: 0, y: 0 });

    // Update child to set parentId
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: container.instanceId });

    const updatedContainer = blockStateManager.getBlockInstances().find(b => b.instanceId === container.instanceId);
    const updatedChild = blockStateManager.getBlockInstances().find(b => b.instanceId === child.instanceId);

    expect(updatedContainer?.children).toContain(child.instanceId);
    expect(updatedChild?.parentId).toBe(container.instanceId);
  });

  test('should remove a child from a container block when child is deleted', () => {
    const container = blockStateManager.addBlockInstance(ContainerBlock, 'MyContainer');
    const child = blockStateManager.addBlockInstance(OscillatorBlock, 'MyOscillator', { x: 0, y: 0 });
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: container.instanceId });

    blockStateManager.deleteBlockInstance(child.instanceId);

    const updatedContainer = blockStateManager.getBlockInstances().find(b => b.instanceId === container.instanceId);
    expect(updatedContainer?.children).not.toContain(child.instanceId);
  });

  test('should recursively delete children when a container block is deleted', () => {
    const container = blockStateManager.addBlockInstance(ContainerBlock, 'MyContainer');
    const child1 = blockStateManager.addBlockInstance(OscillatorBlock, 'Child1', { x: 0, y: 0 });
    const child2 = blockStateManager.addBlockInstance(OscillatorBlock, 'Child2', { x: 0, y: 0 });

    blockStateManager.updateBlockInstance(child1.instanceId, { parentId: container.instanceId });
    blockStateManager.updateBlockInstance(child2.instanceId, { parentId: container.instanceId });

    blockStateManager.deleteBlockInstance(container.instanceId);

    expect(blockStateManager.getBlockInstances().find(b => b.instanceId === container.instanceId)).toBeUndefined();
    expect(blockStateManager.getBlockInstances().find(b => b.instanceId === child1.instanceId)).toBeUndefined();
    expect(blockStateManager.getBlockInstances().find(b => b.instanceId === child2.instanceId)).toBeUndefined();
  });

  test('should update parent-child relationships when parentId is changed', () => {
    const container1 = blockStateManager.addBlockInstance(ContainerBlock, 'Container1');
    const container2 = blockStateManager.addBlockInstance(ContainerBlock, 'Container2');
    const child = blockStateManager.addBlockInstance(OscillatorBlock, 'MyOscillator', { x: 0, y: 0 });

    // Add child to container1
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: container1.instanceId });

    let c1 = blockStateManager.getBlockInstances().find(b => b.instanceId === container1.instanceId);
    expect(c1?.children).toContain(child.instanceId);

    // Move child to container2
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: container2.instanceId });

    c1 = blockStateManager.getBlockInstances().find(b => b.instanceId === container1.instanceId);
    const c2 = blockStateManager.getBlockInstances().find(b => b.instanceId === container2.instanceId);
    const updatedChild = blockStateManager.getBlockInstances().find(b => b.instanceId === child.instanceId);

    expect(c1?.children).not.toContain(child.instanceId);
    expect(c2?.children).toContain(child.instanceId);
    expect(updatedChild?.parentId).toBe(container2.instanceId);
  });

  test('should remove child from old parent when parentId is set to null/undefined', () => {
    const container = blockStateManager.addBlockInstance(ContainerBlock, 'MyContainer');
    const child = blockStateManager.addBlockInstance(OscillatorBlock, 'MyOscillator', { x: 0, y: 0 });
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: container.instanceId });

    let cont = blockStateManager.getBlockInstances().find(b => b.instanceId === container.instanceId);
    expect(cont?.children).toContain(child.instanceId);

    // Remove child from container
    blockStateManager.updateBlockInstance(child.instanceId, { parentId: undefined });

    cont = blockStateManager.getBlockInstances().find(b => b.instanceId === container.instanceId);
    const updatedChild = blockStateManager.getBlockInstances().find(b => b.instanceId === child.instanceId);

    expect(cont?.children).not.toContain(child.instanceId);
    expect(updatedChild?.parentId).toBeUndefined();
  });
});
