/**
 * This service is responsible for exporting and importing the entire user workspace, including AI-generated block definitions, block instances, connections, and global settings like BPM and selected audio output.
 * It interacts with various state managers and services (`BlockStateManager`, `ConnectionState`, `AudioEngineService`) to gather all necessary data for export and to apply imported data back into the application.
 * The export functionality serializes the workspace into a JSON string and triggers a file download for the user.
 * During import, it carefully restores the application state: it clears existing managed audio nodes, sets up block definitions (prioritizing core definitions and adding imported AI-generated ones), recreates block instances with appropriate initial states, re-establishes connections, and applies global settings.
 * This manager is crucial for allowing users to save, share, and load their complex audio project configurations.
 */
import { BlockInstance } from '@interfaces/block';
// import { Connection } from '@interfaces/connection';
import BlockStateManager from '@state/BlockStateManager'; // Import default instance
import AudioEngineService from '@services/AudioEngineService'; // Import default instance
import ConnectionState from '@services/ConnectionState'; // Import default instance
// import { ALL_BLOCK_DEFINITIONS } from '@constants/constants';
import * as Tone from 'tone'; // For getting BPM

class WorkspacePersistenceManager {
    private static instance: WorkspacePersistenceManager;

    private audioEngineService: typeof AudioEngineService;
    private blockStateManager: typeof BlockStateManager;
    private connectionState: typeof ConnectionState;

    private constructor() {
        this.audioEngineService = AudioEngineService;
        this.blockStateManager = BlockStateManager;
        this.connectionState = ConnectionState;
    }

    public static getInstance(): WorkspacePersistenceManager {
        if (!WorkspacePersistenceManager.instance) {
            WorkspacePersistenceManager.instance = new WorkspacePersistenceManager();
        }
        return WorkspacePersistenceManager.instance;
    }

    public exportWorkspace = () => {
        const workspace = {
            blockDefinitions: this.blockStateManager.getBlockDefinitions().filter(def => def.isAiGenerated),
            blockInstances: this.blockStateManager.getBlockInstances().map(inst => ({
                ...inst,
                instance: null,
                lastChanges: null,
            })),
            connections: this.connectionState.getConnections(),
            globalBpm: Tone.getTransport().bpm.value, // Get BPM directly from Tone.Transport
            selectedSinkId: this.audioEngineService.selectedSinkId,
        };
        console.log("Workspace:", workspace.blockInstances);
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

                if (!workspace || typeof workspace !== 'object') { // Removed this.blockStateManager check as it's now guaranteed
                    throw new Error("Invalid workspace file format.");
                }

                if (this.audioEngineService.isAudioGloballyEnabled) {
                    await this.audioEngineService.toggleGlobalAudio(); // Ensure audio is off during import
                }
                // Note: Original WPM had removeAllManagedNodes(). AudioEngineService.setupNodes() is called later
                // after instances are set, which should handle teardown of old nodes and setup of new ones.
                // Explicitly clearing nodes from AudioNodeCreator might be needed if setupNodes doesn't cover all cases.

                const {
                    // blockDefinitions: importedDefinitions = [],
                    blockInstances: importedInstances = [],
                    connections: importedConnections = [],
                    globalBpm: importedBpm,
                    selectedSinkId: importedSinkId,
                } = workspace;

                // const coreDefsMap = new Map(ALL_BLOCK_DEFINITIONS.map(def => [def.id, def]));
                // importedDefinitions.forEach((def: BlockDefinition) => {
                //     if (!coreDefsMap.has(def.id)) {
                //         coreDefsMap.set(def.id, { ...def, isAiGenerated: true });
                //     }
                // });
                // this.blockStateManager.setAllBlockDefinitions(Array.from(coreDefsMap.values()));

                this.blockStateManager.setAllBlockInstances(importedInstances.map((inst: BlockInstance) => ({
                    ...inst,
                    internalState: {
                        ...(inst.internalState || {}),
                    },
                    logs: inst.logs || [`Instance '${inst.name}' loaded from file.`],
                    modificationPrompts: inst.modificationPrompts || [],
                })));

                // After instances are set, audio nodes need to be processed (includes teardown of old, setup of new)
                await this.audioEngineService.setupNodes();

                this.connectionState.setAllConnections(importedConnections);

                if (typeof importedBpm === 'number' && importedBpm > 0) {
                    this.audioEngineService.setTransportBpm(importedBpm);
                }

                if (typeof importedSinkId === 'string' && this.audioEngineService.availableOutputDevices.find(d => d.deviceId === importedSinkId)) {
                    await this.audioEngineService.setOutputDevice(importedSinkId);
                } else if (importedSinkId) {
                    console.warn(`[System] Imported sinkId "${importedSinkId}" not available. Using default.`);
                    await this.audioEngineService.setOutputDevice('default');
                }

                // Connections should be updated after nodes are set up and instances are placed
                this.audioEngineService.updateAudioGraphConnections();


                console.log("[System] Workspace imported successfully by WorkspacePersistenceManager.");

            } catch (err) {
                console.error("Error importing workspace:", err);
                alert(`Error importing workspace: ${(err as Error).message}`);
            }
        };
        reader.readAsText(file);
    };
}

export default WorkspacePersistenceManager.getInstance();
