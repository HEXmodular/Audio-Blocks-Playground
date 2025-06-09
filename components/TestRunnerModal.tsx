
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { runTests, LogFn } from '../test-runner';
import { verifyAudioPathHealth, VerifyAudioPathHealthOptions } from '../utils/audioHealthUtils';
import { BlockInstance, Connection } from '../types';
import { OSCILLATOR_BLOCK_DEFINITION, AUDIO_OUTPUT_BLOCK_DEFINITION } from '../constants';
import { AudioEngine } from '../hooks/useAudioEngine';


// Import all test files to register them with the testRegistry
import '../tests/sample.test';
import '../tests/geminiService.test';
import '../tests/blockStateHelpers.test';


type AudioEngineControlsForTest = AudioEngine;

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioEngineControls: AudioEngineControlsForTest;
  blockInstances: BlockInstance[];
  connections: Connection[];
}

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'pass' | 'fail' | 'suite' | 'summary' | 'hookError' | 'healthCheck';
}

// Helper function to attempt audio health check with retries
async function attemptAudioHealthCheckWithRetries(
  logFn: LogFn,
  options: VerifyAudioPathHealthOptions,
  oscillatorName: string,
  audioOutName: string
) {
  const MAX_RETRIES = 5; // Adjusted max retries
  const RETRY_DELAY_MS = 1200; // Adjusted retry delay

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await verifyAudioPathHealth(options);
      logFn(`Audio Path Health Check: PASSED on attempt ${attempt + 1}. Path from '${oscillatorName}' to '${audioOutName}' is active.`, 'pass');
      return; // Success
    } catch (e: any) {
      const errorMessage = e.message || "";
      const isNodeNotFoundError = errorMessage.includes("WorkletNode or port not found for instance") || errorMessage.includes("Failed to retrieve samples");
      const isPathSilentError = errorMessage.includes("Audio path appears silent");

      let nodeOrPathSpecificInstanceId = options.audioOutInstanceId; // Default to audioOutInstanceId for node errors
      if(isPathSilentError && errorMessage.includes(options.oscillatorInstanceId)) {
        // If error message indicates oscillator, make log more specific (though usually sample request is on audioOut)
        nodeOrPathSpecificInstanceId = options.oscillatorInstanceId;
      }


      if (isNodeNotFoundError || isPathSilentError) {
        let retryReason = isNodeNotFoundError
            ? `Failed to find node/port or retrieve samples for AudioOutput '${audioOutName}' (ID: ${options.audioOutInstanceId})`
            : `Audio path silent for path '${oscillatorName}' to '${audioOutName}'`;

        if (attempt < MAX_RETRIES) {
          logFn(`Audio Path Health Check (Attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${retryReason}. Retrying in ${RETRY_DELAY_MS}ms... (Error: ${errorMessage.substring(0, 150)})`, 'healthCheck');
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          const finalFailureMsg = `${retryReason}. Not resolved after ${MAX_RETRIES + 1} attempts. Original error: ${errorMessage.substring(0,200)}`;
          logFn(`Audio Path Health Check: FAILED - ${finalFailureMsg}`, 'fail');
          throw new Error(`[AudioHealthCheck-RetryFailed] ${finalFailureMsg}`);
        }
      } else {
        // Different error, fail immediately
        logFn(`Audio Path Health Check: FAILED with non-retryable error on path from '${oscillatorName}' to '${audioOutName}': ${errorMessage}`, 'fail');
        throw e; // Re-throw original error
      }
    }
  }
}


const TestRunnerModal: React.FC<TestRunnerModalProps> = ({
    isOpen,
    onClose,
    audioEngineControls,
    blockInstances,
    connections
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number; duration: number } | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef(isOpen);

  const logCallback = useCallback<LogFn>((message, type) => {
    setLogs(prevLogs => [...prevLogs, { id: Date.now().toString() + Math.random().toString(), message, type }]);
  }, []);

  const handleRunAudioHealthCheck = useCallback(async () => {
    logCallback('--- Starting Audio Path Health Check ---', 'healthCheck');

    if (audioEngineControls.audioInitializationError) {
      const errorMsg = `Audio Path Health Check: SKIPPED - Audio system has an initialization error: "${audioEngineControls.audioInitializationError}"`;
      logCallback(errorMsg, 'fail');
      logCallback('--- Audio Path Health Check Complete ---', 'healthCheck');
      // Re-throw to ensure the test run is marked as failed due to this pre-existing condition.
      throw new Error(errorMsg);
    }

    const oscillator =
      blockInstances.find(b => b.name === "Debug Oscillator" && b.definitionId === OSCILLATOR_BLOCK_DEFINITION.id) ||
      blockInstances.find(b => b.definitionId === OSCILLATOR_BLOCK_DEFINITION.id);

    const audioOutput =
      blockInstances.find(b => b.name === "Debug Audio Out" && b.definitionId === AUDIO_OUTPUT_BLOCK_DEFINITION.id) ||
      blockInstances.find(b => b.definitionId === AUDIO_OUTPUT_BLOCK_DEFINITION.id);

    if (!oscillator || !audioOutput) {
      let missingMsg = "Audio Path Health Check: SKIPPED - Required instances not found.";
      if (!oscillator) missingMsg += " Missing Oscillator instance (expected name 'Debug Oscillator' or any oscillator).";
      if (!audioOutput) missingMsg += " Missing AudioOutput instance (expected name 'Debug Audio Out' or any audio output).";
      logCallback(missingMsg, 'healthCheck');
      logCallback('--- Audio Path Health Check Complete ---', 'healthCheck');
      return;
    }

    logCallback(`Health Check Target: Oscillator='${oscillator.name}' (ID: ${oscillator.instanceId}), AudioOutput='${audioOutput.name}' (ID: ${audioOutput.instanceId})`, 'info');

    const healthCheckOptions: VerifyAudioPathHealthOptions = {
        oscillatorInstanceId: oscillator.instanceId,
        audioOutInstanceId: audioOutput.instanceId,
        audioEngine: audioEngineControls,
        blockInstances,
        connections,
        timeoutMs: 2500,
    };

    try {
      await attemptAudioHealthCheckWithRetries(logCallback, healthCheckOptions, oscillator.name, audioOutput.name);
    } catch (e: any) {
      throw e;
    } finally {
        logCallback('--- Audio Path Health Check Complete ---', 'healthCheck');
    }
  }, [logCallback, blockInstances, connections, audioEngineControls]);


  const handleRunTests = useCallback(async () => {
    setIsRunning(true);
    setLogs([]);
    setSummary(null);
    let unitTestResults: { total: number; passed: number; failed: number; duration: number } | null = null;
    let healthCheckError: Error | null = null;

    try {
      unitTestResults = await runTests(logCallback);
      setSummary(unitTestResults); // Set summary for unit tests first
    } catch (e) {
      logCallback(`Unhandled error during unit test execution: ${(e as Error).message}`, 'fail');
      console.error("Error caught by handleRunTests (unit tests):", e);
      // Initialize summary if it's null to reflect failure
      unitTestResults = unitTestResults || { total: 0, passed: 0, failed: 0, duration: 0};
      unitTestResults.failed +=1; // Increment failed count or set appropriately
      setSummary(unitTestResults);
    }

    try {
        await handleRunAudioHealthCheck();
    } catch (e: any) {
        healthCheckError = e as Error; // Store health check error
        logCallback(`Audio Health Check Error: ${healthCheckError.message}`, 'fail');
        console.error("Error caught by handleRunTests (health check):", e);
    }

    // Update summary if health check failed
    if (healthCheckError) {
        setSummary(prevSummary => {
            const baseSummary = prevSummary || { total: 0, passed: 0, failed: 0, duration: 0 };
            // Consider if health check "failure" counts as a failed test, or is separate
            // For now, let's increment the failed count if it's not already reflected.
            // This assumes health check is like one additional test.
            return { ...baseSummary, failed: baseSummary.failed + 1 };
        });
    }

    setIsRunning(false);
  }, [logCallback, handleRunAudioHealthCheck]);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (justOpened) {
      if (!isRunning) {
        // Add an initial delay before running tests to allow app setup.
        const timerId = setTimeout(() => {
          handleRunTests();
        }, 1000); // 1-second delay

        return () => clearTimeout(timerId); // Cleanup timeout
      }
    }
  }, [isOpen, isRunning, handleRunTests]);


  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-gray-800 p-5 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-sky-400">Test Runner</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-sky-400 text-2xl transition-colors"
            aria-label="Close Test Runner"
          >
            &times;
          </button>
        </div>
        <button
          onClick={handleRunTests}
          disabled={isRunning}
          className="mb-4 w-full bg-sky-600 hover:bg-sky-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50"
        >
          {isRunning ? 'Running Tests...' : 'Re-run Tests'}
        </button>
        <div
          ref={logsContainerRef}
          className="flex-grow overflow-y-auto bg-gray-900 p-3.5 rounded-lg space-y-1 text-xs font-mono border border-gray-700 shadow-inner"
          aria-live="polite"
          aria-atomic="false"
        >
          {logs.map(log => (
            <div key={log.id} className={`whitespace-pre-wrap break-words ${
              log.type === 'pass' ? 'text-green-400' :
              log.type === 'fail' || log.type === 'hookError' ? 'text-red-400' :
              log.type === 'suite' ? 'text-sky-300 font-bold mt-1.5' :
              log.type === 'summary' ? 'text-yellow-300' :
              log.type === 'healthCheck' ? 'text-teal-300 italic' :
              'text-gray-400' // info type
            }`}>
              {log.message}
            </div>
          ))}
           {isRunning && logs.length === 0 && <p className="text-gray-500">Initializing test run...</p>}
        </div>
        {summary && !isRunning && (
          <div className="mt-4 p-3.5 bg-gray-700 rounded-lg text-gray-200 border border-gray-600">
            <h3 className="font-semibold text-md text-yellow-300 mb-1.5">Summary (Unit Tests & Health Check)</h3>
            <p>Total unit tests: {summary.total}</p>
            <p className="text-green-400">Passed: {summary.passed}</p>
            <p className="text-red-400">Failed: {summary.failed}</p>
            <p>Duration: {summary.duration.toFixed(2)}ms</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestRunnerModal;
