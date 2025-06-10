import { useState, useCallback, useEffect, useRef } from 'react';
import { AudioDeviceService } from '../services/AudioDeviceService'; // Import the service

export interface AudioDeviceManager {
    availableOutputDevices: MediaDeviceInfo[];
    selectedSinkId: string;
    listOutputDevices: () => Promise<void>; // Keep this for explicit refresh if needed
    setOutputDevice: (sinkId: string) => Promise<boolean>;
}

interface UseAudioDeviceManagerProps {
    appLog: (message: string, isSystem?: boolean) => void;
    onStateChangeForReRender: () => void; // Still used for triggering re-renders
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

    const handleDeviceListChanged = useCallback((devices: MediaDeviceInfo[]) => {
        _setAvailableOutputDevices(devices);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    const handleSelectedSinkIdChanged = useCallback((sinkId: string) => {
        _setSelectedSinkId(sinkId);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    const serviceRef = useRef<AudioDeviceService | null>(null);
    if (serviceRef.current === null) {
        serviceRef.current = new AudioDeviceService(
            appLog,
            handleDeviceListChanged,
            handleSelectedSinkIdChanged
        );
    }
    const service = serviceRef.current;

    // Effect to update the service with the current audioContext and masterGainNode
    useEffect(() => {
        service.setAudioNodes(audioContext, masterGainNode);
    }, [service, audioContext, masterGainNode]);

    // Effect to manage the device change listener lifecycle
    useEffect(() => {
        service.startDeviceChangeListener();
        // Initial listing
        service.listOutputDevices();

        return () => {
            service.stopDeviceChangeListener();
            // service.cleanup(); // Or call cleanup if it does more than just stop listener
        };
    }, [service]); // Service is stable

    const listOutputDevices = useCallback(async () => {
        // This can now just be a call to the service's method
        await service.listOutputDevices();
    }, [service]);

    const setOutputDevice = useCallback(async (sinkId: string): Promise<boolean> => {
        return service.setOutputDevice(sinkId);
    }, [service]);

    // Expose current state from the hook's state variables, which are updated by service callbacks
    return {
        availableOutputDevices,
        selectedSinkId,
        listOutputDevices,
        setOutputDevice,
    };
};
