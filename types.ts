
export interface GameState {
  score: number;
  speed: number;
  altitude: number;
  isBoost: boolean;
}

export type RingGameMode = 'skyward' | 'mountain' | 'race';

export interface GameStats {
  score: number;
  speed: number;
  altitude: number;
  // Mini-game stats
  isRingGameActive: boolean;
  ringGameMode: RingGameMode;
  combo: number;
  // Race mode stats
  raceTimeRemaining: number;
  raceRingsCollected: number;
  // AI Content
  currentMission: string;
  currentZoneLore: string;
}

export interface ControlsState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  boost: boolean;
  flap: boolean;
  dive: boolean;
  reset: boolean;
  mouseDown: boolean;
  mouseX: number;
  mouseY: number;
  mobileTap: boolean;
}

export type OrbData = {
  id: number;
  position: [number, number, number];
  active: boolean;
};

export type RingType = 'starter' | 'normal' | 'small' | 'moving';

export interface RingData {
  id: number;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles
  type: RingType;
  active: boolean;
  scale: number;
  passed: boolean;
}

// Multiplayer types
export interface RemotePlayer {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion wxyz
  inRace: boolean;
  raceCheckpoints: number;
}

export interface RaceParticipant {
  id: string;
  name: string;
  checkpoints: number;
}

// Race Lobby types
export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
}

export interface RacePortalData {
  lobbyId: string;
  hostName: string;
  position: [number, number, number];
  playerCount: number;
}

export interface LobbyState {
  lobbyId: string | null;
  isHost: boolean;
  players: LobbyPlayer[];
  portalPosition: [number, number, number] | null;
  countdown: number | null; // null = not started, number = seconds remaining
}

export interface MultiplayerState {
  connected: boolean;
  playerId: string | null;
  playerName: string | null;
  players: Map<string, RemotePlayer>;
  inRace: boolean;
  raceId: string | null;
  raceSeed: number | null;
  raceParticipants: RaceParticipant[];
  // Lobby state
  lobby: LobbyState | null;
  activePortals: RacePortalData[];
}
