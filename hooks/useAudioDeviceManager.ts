import { useState, useCallback, useEffect } from 'react';

export interface AudioDeviceManager {
    availableOutputDevices: MediaDeviceInfo[];
    selectedSinkId: string;
    listOutputDevices: () => Promise<void>;
    setOutputDevice: (sinkId: string) => Promise<boolean>;
}

interface UseAudioDeviceManagerProps {
    appLog: (message: string, isSystem?: boolean) => void;
    onStateChangeForReRender: () => void;
    audioContext: AudioContext | null;
    masterGainNode: GainNode | null;
}

export const useAudioDeviceManager = ({
    appLog,
    onStateChangeForReRender,
    audioContext,
    masterGainNode,
}: UseAudioDeviceManagerProps): AudioDeviceManager => {
    const [availableOutputDevices, _setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedSinkId, _setSelectedSinkId] = useState<string>('default');

    // Re-wrapped setters to call onStateChangeForReRender, as per original useAudioEngine logic
    const setAvailableOutputDevices = useCallback((devices: MediaDeviceInfo[]) => {
        _setAvailableOutputDevices(devices);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    const setSelectedSinkId = useCallback((sinkId: string) => {
        _setSelectedSinkId(sinkId);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    const listOutputDevices = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            appLog("[AudioDeviceManager] enumerateDevices not supported.", true);
            return;
        }
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
            setAvailableOutputDevices(audioOutputDevices); // Uses the wrapped setter
        } catch (err) {
            appLog(`[AudioDeviceManager] Error listing output devices: ${(err as Error).message}`, true);
        }
    }, [appLog, setAvailableOutputDevices]);

    const setOutputDevice = useCallback(async (sinkId: string): Promise<boolean> => {
        if (!audioContext || !(audioContext as any).setSinkId) {
            appLog("[AudioDeviceManager] setSinkId is not supported by this browser or AudioContext not initialized.", true);
            return false;
        }
        try {
            // Disconnect masterGainNode from current destination before changing sinkId
            if (masterGainNode && audioContext.destination) {
                 // Check if masterGainNode is connected before trying to disconnect
                try {
                    // A bit of a hack: try/catch a disconnect. If it's not connected, it might throw.
                    // A more robust way would be to track connection state, but that's more involved.
                    masterGainNode.disconnect(audioContext.destination);
                } catch(e) {
                    // appLog(`[AudioDeviceManager] Master gain was not connected or error on disconnect: ${(e as Error).message}`, true);
                    // If it throws, it might mean it wasn't connected, so we can proceed.
                }
            }

            await (audioContext as any).setSinkId(sinkId);
            setSelectedSinkId(sinkId); // Uses the wrapped setter
            appLog(`[AudioDeviceManager] Audio output device set to: ${sinkId}`, true);

            // Reconnect masterGainNode to the new destination
            if (masterGainNode) {
                masterGainNode.connect(audioContext.destination);
            }
            return true;
        } catch (err) {
            appLog(`[AudioDeviceManager] Error setting output device: ${(err as Error).message}`, true);
            // Attempt to reconnect to the previous or default destination as a fallback
            if (masterGainNode && audioContext?.destination) {
                try {
                    masterGainNode.connect(audioContext.destination);
                } catch (e) {
                    appLog(`[AudioDeviceManager] Failed to fallback connect masterGain: ${(e as Error).message}`, true);
                }
            }
            return false;
        }
    }, [audioContext, masterGainNode, appLog, setSelectedSinkId]);

    useEffect(() => {
        listOutputDevices(); // Initial call
        navigator.mediaDevices?.addEventListener('devicechange', listOutputDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', listOutputDevices);
        };
    }, [listOutputDevices]);

    return {
        availableOutputDevices,
        selectedSinkId,
        listOutputDevices,
        setOutputDevice,
    };
};
