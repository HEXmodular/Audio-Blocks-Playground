
import { useState, useEffect, useCallback } from 'react';
import { Connection } from '../types';

export const useConnectionState = () => {
  const [connections, setConnections] = useState<Connection[]>(() => {
    const saved = localStorage.getItem('audioBlocks_connections');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('audioBlocks_connections', JSON.stringify(connections));
  }, [connections]);

  const updateConnections = useCallback((updater: Connection[] | ((prev: Connection[]) => Connection[])) => {
    setConnections(updater);
  }, []);

  const setAllConnections = useCallback((newConnections: Connection[]) => {
    setConnections(newConnections);
  }, []);

  return {
    connections,
    updateConnections,
    setAllConnections,
  };
};
