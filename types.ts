
export interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export enum AppState {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED'
}

export interface DeviceState {
  isLocked: boolean;
  activeApp: string | null;
  battery: number;
  signal: string;
}

export interface TranscriptionPart {
  text: string;
}

export interface AppSettings {
  stopCommands: string;
  showTranscription: boolean;
  visionEnabled: boolean;
  personality: 'cheerful' | 'formal' | 'secretive' | 'playful' | 'neutral';
  musicEnabled: boolean;
  currentTrack: string;
  musicVolume: number;
}
