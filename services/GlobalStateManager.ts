// TODO: add time signature to global state
import PubSubService from './PubSubService';

const LOCAL_STORAGE_TEMPO_KEY = 'audioBlocks_globalTempo';
const DEFAULT_TEMPO = 120; // Default tempo in BPM

export class GlobalStateManager {
  private static _instance: GlobalStateManager | null = null;
  private _currentTempo: number;

  private constructor() {
    this._currentTempo = this._loadTempo();
  }

  public static getInstance(): GlobalStateManager {
    if (GlobalStateManager._instance === null) {
      GlobalStateManager._instance = new GlobalStateManager();
    }
    return GlobalStateManager._instance;
  }

  private _loadTempo(): number {
    try {
      const savedTempo = localStorage.getItem(LOCAL_STORAGE_TEMPO_KEY);
      console.log('[GlobalStateManager]: Loading tempo from localStorage:', savedTempo);
      if (savedTempo !== null) {
        const parsedTempo = parseFloat(savedTempo);
        if (!isNaN(parsedTempo) && parsedTempo > 0) {
          return parsedTempo;
        }
      }
    } catch (error) {
      console.error('[GlobalStateManager]: Failed to load tempo from localStorage, using default:', error);
    }
    return DEFAULT_TEMPO;
  }

  private _saveTempo(bpm: number): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_TEMPO_KEY, bpm.toString());
    } catch (error) {
      console.error('[GlobalStateManager]: Failed to save tempo to localStorage:', error);
    }
  }

  public getTempo(): number {
    return this._currentTempo;
  }

  public setTempo(bpm: number): void {
    if (bpm <= 0) {
      console.warn('[GlobalStateManager]: Attempted to set tempo to a non-positive value. Tempo must be greater than 0.');
      return;
    }
    if (this._currentTempo !== bpm) {
      this._currentTempo = bpm;
      this._saveTempo(bpm);
      console.log('[GlobalStateManager]: Saving tempo to localStorage:', bpm);
      PubSubService.publish('globalTempoChanged', bpm);
    }
  }
}

export default GlobalStateManager.getInstance();
