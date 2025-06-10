import { useCallback, useRef } from 'react';
import { BlockDefinition, BlockParameter } from '../types';
import {
    NATIVE_OSCILLATOR_BLOCK_DEFINITION,
    NATIVE_LFO_BLOCK_DEFINITION,
    NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION,
    GAIN_BLOCK_DEFINITION,
    NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION,
    NATIVE_DELAY_BLOCK_DEFINITION,
    OSCILLOSCOPE_BLOCK_DEFINITION,
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
} from '../constants';

export interface AllpassInternalNodes {
    inputPassthroughNode: GainNode;
    inputGain1: GainNode;
    inputDelay: DelayNode;
    feedbackGain: GainNode;
    feedbackDelay: DelayNode;
    summingNode: GainNode;
}

export type ManagedNativeNodeInfo = {
    nodeForInputConnections: AudioNode;
    nodeForOutputConnections: AudioNode;
    mainProcessingNode?: AudioNode;
    internalGainNode?: GainNode;
    allpassInternalNodes?: AllpassInternalNodes;
    paramTargetsForCv?: Map<string, AudioParam>;
    definition: BlockDefinition;
    instanceId: string;
    constantSourceValueNode?: ConstantSourceNode;
};

export interface NativeNodeManager {
    setupManagedNativeNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number) => Promise<boolean>;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, currentBpm?: number) => void;
    triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
    triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
    triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
    removeManagedNativeNode: (instanceId: string) => void;
    removeAllManagedNativeNodes: () => void;
    getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;
    managedNativeNodesRef: React.RefObject<Map<string, ManagedNativeNodeInfo>>;
}

interface UseNativeNodeManagerProps {
    appLog: (message: string, isSystem?: boolean) => void;
    onStateChangeForReRender: () => void;
    audioContext: AudioContext | null;
}

export const useNativeNodeManager = ({
    appLog,
    onStateChangeForReRender,
    audioContext,
}: UseNativeNodeManagerProps): NativeNodeManager => {
    const managedNativeNodesRef = useRef<Map<string, ManagedNativeNodeInfo>>(new Map());

    const setupManagedNativeNode = useCallback(async (
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm: number = 120
    ): Promise<boolean> => {
        if (!audioContext || audioContext.state !== 'running') {
            appLog(`[NativeManager Setup] Cannot setup '${definition.name}' (ID: ${instanceId}): Audio system not ready.`, true);
            return false;
        }
        if (managedNativeNodesRef.current.has(instanceId)) {
            appLog(`[NativeManager Setup] Native node for ID '${instanceId}' already exists. Skipping.`, true);
            return true;
        }

        let mainNode: AudioNode | undefined;
        let outputNode: AudioNode;
        let inputConnectNode: AudioNode;
        let internalGain: GainNode | undefined;
        let allpassNodes: AllpassInternalNodes | undefined;
        let constSrcNodeForNumToAudio: ConstantSourceNode | undefined;
        const paramTargets = new Map<string, AudioParam>();

        try {
            switch (definition.id) {
                case NATIVE_OSCILLATOR_BLOCK_DEFINITION.id:
                case NATIVE_LFO_BLOCK_DEFINITION.id:
                case NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id:
                    const osc = audioContext.createOscillator();
                    internalGain = audioContext.createGain();
                    osc.connect(internalGain);
                    osc.start();
                    mainNode = osc;
                    inputConnectNode = internalGain;
                    outputNode = internalGain;
                    paramTargets.set('frequency', osc.frequency);
                    paramTargets.set('gain', internalGain.gain);
                    break;
                case GAIN_BLOCK_DEFINITION.id:
                    const gainNode = audioContext.createGain();
                    mainNode = gainNode;
                    inputConnectNode = gainNode;
                    outputNode = gainNode;
                    paramTargets.set('gain', gainNode.gain);
                    break;
                case NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION.id:
                    const biquad = audioContext.createBiquadFilter();
                    mainNode = biquad;
                    inputConnectNode = biquad;
                    outputNode = biquad;
                    paramTargets.set('frequency', biquad.frequency);
                    paramTargets.set('Q', biquad.Q);
                    paramTargets.set('gain', biquad.gain);
                    break;
                case NATIVE_DELAY_BLOCK_DEFINITION.id:
                    const delay = audioContext.createDelay(5.0);
                    mainNode = delay;
                    inputConnectNode = delay;
                    outputNode = delay;
                    paramTargets.set('delayTime', delay.delayTime);
                    break;
                case OSCILLOSCOPE_BLOCK_DEFINITION.id:
                    const analyser = audioContext.createAnalyser();
                    mainNode = analyser;
                    inputConnectNode = analyser;
                    outputNode = analyser;
                    break;
                case NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id:
                case NATIVE_AR_ENVELOPE_BLOCK_DEFINITION.id:
                    const constSource = audioContext.createConstantSource();
                    constSource.offset.value = 0;
                    constSource.start();
                    mainNode = constSource;
                    inputConnectNode = constSource;
                    outputNode = constSource;
                    break;
                case NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id:
                    const apInputPassthrough = audioContext.createGain();
                    const apInputGain1 = audioContext.createGain();
                    const apInputDelay = audioContext.createDelay(1.0);
                    const apFeedbackGain = audioContext.createGain();
                    const apFeedbackDelay = audioContext.createDelay(1.0);
                    const apSummingNode = audioContext.createGain();
                    apInputGain1.connect(apInputDelay);
                    apInputDelay.connect(apSummingNode);
                    apInputPassthrough.connect(apSummingNode);
                    apSummingNode.connect(apFeedbackDelay);
                    apFeedbackDelay.connect(apFeedbackGain);
                    apFeedbackGain.connect(apSummingNode);
                    allpassNodes = { inputPassthroughNode: apInputPassthrough, inputGain1: apInputGain1, inputDelay: apInputDelay, feedbackGain: apFeedbackGain, feedbackDelay: apFeedbackDelay, summingNode: apSummingNode };
                    mainNode = undefined;
                    inputConnectNode = apInputGain1;
                    outputNode = apSummingNode;
                    paramTargets.set('delayTime', apInputDelay.delayTime);
                    break;
                case NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id:
                    constSrcNodeForNumToAudio = audioContext.createConstantSource();
                    constSrcNodeForNumToAudio.offset.value = 0;
                    constSrcNodeForNumToAudio.start();
                    internalGain = audioContext.createGain();
                    constSrcNodeForNumToAudio.connect(internalGain);
                    mainNode = constSrcNodeForNumToAudio;
                    inputConnectNode = internalGain;
                    outputNode = internalGain;
                    paramTargets.set('gain', internalGain.gain);
                    break;
                default:
                    appLog(`[NativeManager Setup] Definition ID '${definition.id}' not recognized.`, true);
                    return false;
            }

            const nodeInfo: ManagedNativeNodeInfo = { nodeForInputConnections: inputConnectNode, nodeForOutputConnections: outputNode, mainProcessingNode: mainNode, internalGainNode: internalGain, allpassInternalNodes: allpassNodes, paramTargetsForCv: paramTargets, definition: definition, instanceId: instanceId, constantSourceValueNode: constSrcNodeForNumToAudio };
            managedNativeNodesRef.current.set(instanceId, nodeInfo);
            updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm);
            appLog(`[NativeManager Setup] Native node for '${definition.name}' (ID: ${instanceId}) created.`, true);
            onStateChangeForReRender();
            return true;
        } catch (e) {
            const errorMsg = `Failed to construct native node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`;
            console.error(errorMsg, e);
            appLog(errorMsg, true);
            return false;
        }
    }, [audioContext, appLog, onStateChangeForReRender]);

    const updateManagedNativeNodeParams = useCallback((
        instanceId: string,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        currentBpm: number = 120
    ) => {
        if (!audioContext || audioContext.state !== 'running') return;
        const info = managedNativeNodesRef.current.get(instanceId);
        if (!info) return;

        const { mainProcessingNode, paramTargetsForCv, definition, allpassInternalNodes, constantSourceValueNode } = info;

        parameters.forEach(param => {
            const targetAudioParam = paramTargetsForCv?.get(param.id);
            if (targetAudioParam) {
                if (typeof param.currentValue === 'number') {
                    targetAudioParam.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
                }
            } else if (mainProcessingNode) {
                if (definition.id === NATIVE_OSCILLATOR_BLOCK_DEFINITION.id || definition.id === NATIVE_LFO_BLOCK_DEFINITION.id || definition.id === NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id) {
                    const oscNode = mainProcessingNode as OscillatorNode;
                    if (param.id === 'waveform' && typeof param.currentValue === 'string') {
                        oscNode.type = param.currentValue as OscillatorType;
                    }
                    if (param.id === 'frequency' && definition.id === NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id) {
                        const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction');
                        const bpmFraction = bpmFractionParam ? parseFloat(bpmFractionParam.currentValue as string) : 1;
                        const lfoFreq = 1.0 / ((60.0 / currentBpm) * bpmFraction);
                        if (isFinite(lfoFreq) && lfoFreq > 0) {
                            oscNode.frequency.setTargetAtTime(lfoFreq, audioContext.currentTime, 0.01);
                        }
                    }
                } else if (definition.id === NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION.id) {
                    const biquadNode = mainProcessingNode as BiquadFilterNode;
                    if (param.id === 'type' && typeof param.currentValue === 'string') {
                        biquadNode.type = param.currentValue as BiquadFilterType;
                    }
                } else if (definition.id === OSCILLOSCOPE_BLOCK_DEFINITION.id) {
                    const analyserNode = mainProcessingNode as AnalyserNode;
                    if (param.id === 'fftSize' && typeof param.currentValue === 'number') {
                        analyserNode.fftSize = param.currentValue;
                    }
                } else if (allpassInternalNodes && definition.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id) {
                    if (param.id === 'delayTime' && typeof param.currentValue === 'number') {
                        allpassInternalNodes.inputDelay.delayTime.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
                        allpassInternalNodes.feedbackDelay.delayTime.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
                    }
                    if (param.id === 'coefficient' && typeof param.currentValue === 'number') {
                        allpassInternalNodes.inputPassthroughNode.gain.setTargetAtTime(-param.currentValue, audioContext.currentTime, 0.01);
                        allpassInternalNodes.feedbackGain.gain.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
                    }
                }
            }
            if (constantSourceValueNode && definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id && currentInputs && currentInputs.number_in !== undefined) {
                const numberIn = Number(currentInputs.number_in);
                const maxExpectedParam = parameters.find(p => p.id === 'max_input_value');
                const maxExpected = maxExpectedParam ? Number(maxExpectedParam.currentValue) : 255;
                let normalizedValue = maxExpected !== 0 ? (numberIn / maxExpected) * 2 - 1 : 0;
                normalizedValue = Math.max(-1, Math.min(1, normalizedValue));
                constantSourceValueNode.offset.setTargetAtTime(normalizedValue, audioContext.currentTime, 0.01);
            }
        });
    }, [audioContext]);

    const triggerNativeNodeEnvelope = useCallback((instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => {
        if (!audioContext || audioContext.state !== 'running') return;
        const info = managedNativeNodesRef.current.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(0, now);
        constSourceNode.offset.linearRampToValueAtTime(peakLevel, now + attackTime);
        constSourceNode.offset.linearRampToValueAtTime(0, now + attackTime + decayTime);
    }, [audioContext]);

    const triggerNativeNodeAttackHold = useCallback((instanceId: string, attackTime: number, sustainLevel: number) => {
        if (!audioContext || audioContext.state !== 'running') return;
        const info = managedNativeNodesRef.current.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now);
        constSourceNode.offset.linearRampToValueAtTime(sustainLevel, now + attackTime);
    }, [audioContext]);

    const triggerNativeNodeRelease = useCallback((instanceId: string, releaseTime: number) => {
        if (!audioContext || audioContext.state !== 'running') return;
        const info = managedNativeNodesRef.current.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now);
        constSourceNode.offset.linearRampToValueAtTime(0, now + releaseTime);
    }, [audioContext]);

    const removeManagedNativeNode = useCallback((instanceId: string) => {
        const info = managedNativeNodesRef.current.get(instanceId);
        if (info) {
            try {
                info.nodeForOutputConnections.disconnect();
                if (info.mainProcessingNode && info.mainProcessingNode !== info.nodeForOutputConnections && info.mainProcessingNode !== info.nodeForInputConnections) {
                    info.mainProcessingNode.disconnect();
                    if (info.mainProcessingNode instanceof OscillatorNode || info.mainProcessingNode instanceof ConstantSourceNode) {
                        try { info.mainProcessingNode.stop(); } catch (e) { /* already stopped */ }
                    }
                }
                if (info.nodeForInputConnections !== info.nodeForOutputConnections && info.nodeForInputConnections !== info.mainProcessingNode) {
                    info.nodeForInputConnections.disconnect();
                }
                if (info.internalGainNode) info.internalGainNode.disconnect();
                if (info.allpassInternalNodes) Object.values(info.allpassInternalNodes).forEach(node => node.disconnect());
                if (info.constantSourceValueNode) {
                    info.constantSourceValueNode.disconnect();
                    try { info.constantSourceValueNode.stop(); } catch (e) { /* already stopped */ }
                }
            } catch (e) {
                appLog(`[NativeManager Remove] Error disconnecting native node for '${instanceId}': ${(e as Error).message}`, true);
            }
            managedNativeNodesRef.current.delete(instanceId);
            appLog(`[NativeManager Remove] Removed native node for instance '${instanceId}'.`, true);
            onStateChangeForReRender();
        }
    }, [appLog, onStateChangeForReRender]);

    const removeAllManagedNativeNodes = useCallback(() => {
        managedNativeNodesRef.current.forEach((_, instanceId) => {
            removeManagedNativeNode(instanceId);
        });
        appLog("[NativeManager] All managed native nodes removed.", true);
    }, [removeManagedNativeNode, appLog]);

    const getAnalyserNodeForInstance = useCallback((instanceId: string): AnalyserNode | null => {
        const nativeInfo = managedNativeNodesRef.current.get(instanceId);
        if (nativeInfo && nativeInfo.definition.id === OSCILLOSCOPE_BLOCK_DEFINITION.id && nativeInfo.mainProcessingNode instanceof AnalyserNode) {
            return nativeInfo.mainProcessingNode;
        }
        return null;
    }, []);

    return {
        setupManagedNativeNode,
        updateManagedNativeNodeParams,
        triggerNativeNodeEnvelope,
        triggerNativeNodeAttackHold,
        triggerNativeNodeRelease,
        removeManagedNativeNode,
        removeAllManagedNativeNodes,
        getAnalyserNodeForInstance,
        managedNativeNodesRef,
    };
};
