/**
 * This service manages the state of logical connections between audio blocks within the application's graph.
 * It is responsible for persisting these connections to the browser's `localStorage`, allowing the user's graph layout to be saved and restored across sessions.
 * The class provides methods to get, update, and set all connections, ensuring that any changes trigger notifications to subscribed listeners.
 * This notification system allows other parts of the application, such as the UI or the audio engine's graph connector, to react dynamically to modifications in the connection topology.
 * It acts as a centralized store and source of truth for the user-defined connections in the audio block interface.
 */
import { Connection } from '@interfaces/common';

const LOCAL_STORAGE_KEY = 'audioBlocks_connections';

type ConnectionStateListener = (connections: Connection[]) => void;

class ConnectionState {
  private static instance: ConnectionState | null = null; // Singleton instance
  private connections: Connection[] = [];
  private listeners: ConnectionStateListener[] = [];

  private constructor() { // Make the constructor private
    this.loadFromLocalStorage();
  }

  public static getInstance(): ConnectionState {
    if (!ConnectionState.instance) {
      ConnectionState.instance = new ConnectionState();
    }
    return ConnectionState.instance;
  }

  private loadFromLocalStorage(): void {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        this.connections = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse connections from localStorage", e);
        this.connections = [];
      }
    } else {
      this.connections = [];
    }
  }

  private persistToLocalStorage(): void {
    try {
      const connectionsJson = JSON.stringify(this.connections);
      localStorage.setItem(LOCAL_STORAGE_KEY, connectionsJson);
    } catch (error) {
      console.error("ConnectionState: Failed to stringify connections or save to localStorage:", error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.connections])); // Pass a copy
  }

  public getConnections(): Connection[] {
    return [...this.connections]; // Return a copy
  }

  public updateConnections = (updater: Connection[] | ((prev: Connection[]) => Connection[])): void => {
    if (typeof updater === 'function') {
      this.connections = updater(this.connections);
    } else {
      this.connections = updater;
    }
    this.persistToLocalStorage();
    this.notifyListeners();
  }

  public setAllConnections(newConnections: Connection[]): void {
    this.connections = [...newConnections]; // Ensure it's a new array
    this.persistToLocalStorage();
    this.notifyListeners();
  }

  public onStateChange(callback: ConnectionStateListener): () => void {
    this.listeners.push(callback);
    // Return an unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

export default ConnectionState.getInstance();