import { BlockPort } from "./block";

export interface Connection {
    id: string;
    fromInstanceId: string;
    fromOutputId: string; 
    toInstanceId: string;
    toInputId: string;   
  }

export interface PendingConnection {
    fromInstanceId: string;
    fromPort: BlockPort;
    fromIsOutput: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  }