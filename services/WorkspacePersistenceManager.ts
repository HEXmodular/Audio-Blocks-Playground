/**
 * This service is responsible for exporting and importing the entire user workspace, including AI-generated block definitions, block instances, connections, and global settings like BPM and selected audio output.
 * It interacts with various state managers and services (`BlockStateManager`, `ConnectionState`, `AudioEngineService`) to gather all necessary data for export and to apply imported data back into the application.
 * The export functionality serializes the workspace into a JSON string and triggers a file download for the user.
 * During import, it carefully restores the application state: it clears existing managed audio nodes, sets up block definitions (prioritizing core definitions and adding imported AI-generated ones), recreates block instances with appropriate initial states, re-establishes connections, and applies global settings.
 * This manager is crucial for allowing users to save, share, and load their complex audio project configurations.
 */
// services/WorkspacePersistenceManager.ts
import { BlockDefinition, BlockInstance, Connection } from '@interfaces/common'; // Adjust path
import { BlockStateManager } from '@state/BlockStateManager'; // Adjust path
import { AudioEngineService } from '@services/AudioEngineService'; // Adjust path
import { ConnectionState } from '@services/ConnectionState'; // Adjust path
import { ALL_BLOCK_DEFINITIONS } from '@constants/constants'; // Adjust path

export class WorkspacePersistenceManager {
    private getBlockDefinitions: () => BlockDefinition[];
    private getBlockInstances: () => BlockInstance[];
    private getConnections: () => Connection[];
    private getGlobalBpm: () => number;
    private getSelectedSinkId: () => string | null;

    private audioEngineService: AudioEngineService;
    private blockStateManager: BlockStateManager;
    private connectionState: ConnectionState;

    private setGlobalBpm: (bpm: number) => void;
    private setSelectedInstanceId: (id: string | null) => void;
    // coreDefinitionIds is derived internally now

    constructor(
        getBlockDefinitions: () => BlockDefinition[],
        getBlockInstances: () => BlockInstance[],
        getConnections: () => Connection[],
        getGlobalBpm: () => number,
        getSelectedSinkId: () => string | null,
        audioEngineService: AudioEngineService,
        blockStateManager: BlockStateManager,
        connectionState: ConnectionState,
        setGlobalBpm: (bpm: number) => void,
        setSelectedInstanceId: (id: string | null) => void
    ) {
        this.getBlockDefinitions = getBlockDefinitions;
        this.getBlockInstances = getBlockInstances;
        this.getConnections = getConnections;
        this.getGlobalBpm = getGlobalBpm;
        this.getSelectedSinkId = getSelectedSinkId;
        this.audioEngineService = audioEngineService;
        this.blockStateManager = blockStateManager;
        this.connectionState = connectionState;
        this.setGlobalBpm = setGlobalBpm;
        this.setSelectedInstanceId = setSelectedInstanceId;
    }

    public exportWorkspace = () => {
        const workspace = {
            blockDefinitions: this.getBlockDefinitions().filter(def => def.isAiGenerated), // Save only AI generated ones not in core
            blockInstances: this.getBlockInstances(),
            connections: this.getConnections(),
            globalBpm: this.getGlobalBpm(),
            selectedSinkId: this.getSelectedSinkId(),
        };
        const jsonString = JSON.stringify(workspace, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `audioblocks_workspace_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
        console.log("[System] Workspace exported by WorkspacePersistenceManager.");
    };

    public importWorkspace = async (file: File) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonString = e.target?.result as string;
                const workspace = JSON.parse(jsonString);

                if (!workspace || typeof workspace !== 'object' || !this.blockStateManager) { // Check blockStateManager
                    throw new Error("Invalid workspace file format or context not ready.");
                }

                if (this.audioEngineService.isAudioGloballyEnabled) {
                    await this.audioEngineService.toggleGlobalAudio(); // Use the service method
                }
                this.audioEngineService.removeAllManagedNodes();

                const {
                    blockDefinitions: importedDefinitions = [],
                    blockInstances: importedInstances = [],
                    connections: importedConnections = [],
                    globalBpm: importedBpm,
                    selectedSinkId: importedSinkId,
                } = workspace;

                const coreDefsMap = new Map(ALL_BLOCK_DEFINITIONS.map(def => [def.id, def]));
                importedDefinitions.forEach((def: BlockDefinition) => {
                    if (!coreDefsMap.has(def.id)) {
                        coreDefsMap.set(def.id, { ...def, isAiGenerated: true });
                    }
                });
                this.blockStateManager.setAllBlockDefinitions(Array.from(coreDefsMap.values()));

                this.blockStateManager.setAllBlockInstances(importedInstances.map((inst: BlockInstance) => ({
                    ...inst,
                    internalState: {
                        ...(inst.internalState || {}),
                        needsAudioNodeSetup: true,
                        lyriaServiceReady: false,
                        autoPlayInitiated: false,
                    },
                    logs: inst.logs || [`Instance '${inst.name}' loaded from file.`],
                    modificationPrompts: inst.modificationPrompts || [],
                })));
                this.connectionState.setAllConnections(importedConnections);

                if (typeof importedBpm === 'number' && importedBpm > 0) {
                    this.setGlobalBpm(importedBpm);
                }

                if (typeof importedSinkId === 'string' && this.audioEngineService.availableOutputDevices.find(d => d.deviceId === importedSinkId)) {
                    await this.audioEngineService.setOutputDevice(importedSinkId);
                } else if (importedSinkId) {
                    console.warn(`[System] Imported sinkId "${importedSinkId}" not available. Using default.`);
                    await this.audioEngineService.setOutputDevice('default');
                }

                console.log("[System] Workspace imported successfully by WorkspacePersistenceManager.");
                this.setSelectedInstanceId(null);

            } catch (err) {
                console.error("Error importing workspace:", err);
                alert(`Error importing workspace: ${(err as Error).message}`);
            }
            // Reset file input if possible - this is tricky as the manager doesn't own the input element
            // The caller (App.tsx wrapper) will need to handle this.
        };
        reader.readAsText(file);
    };
}
