import { Connection } from '../types';

const LOCAL_STORAGE_KEY = 'audioBlocks_connections';

type ConnectionStateListener = (connections: Connection[]) => void;

export class ConnectionState {
  private connections: Connection[] = [];
  private listeners: ConnectionStateListener[] = [];

  constructor() {
    this.loadFromLocalStorage();
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.connections));
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.connections])); // Pass a copy
  }

  public getConnections(): Connection[] {
    return [...this.connections]; // Return a copy
  }

  public updateConnections(updater: Connection[] | ((prev: Connection[]) => Connection[])): void {
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
