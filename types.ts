
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
  shoot: boolean;
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
  // Battle stats
  hp?: number;
  maxHp?: number;
  isDead?: boolean;
  team?: 'red' | 'blue';
  ammo?: number;
  killCount?: number;
  deathCount?: number;
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
  // Battle state
  battle: BattleState | null;
}

// Battle Mode Types
export type BattleModeType = 'deathmatch' | 'ctf';

export interface BattleState {
  isActive: boolean;
  mode: BattleModeType;
  timeLeft: number;
  scores: { [teamOrPlayerId: string]: number }; // Team ID or Player ID -> Score
  myTeam?: 'red' | 'blue'; // For CTF
  flag?: {
    position: [number, number, number];
    carrierId: string | null;
    homeBase: {
      red: [number, number, number];
      blue: [number, number, number];
    };
  };
  respawnTime?: number; // If dead, seconds until respawn
}

export interface BattlePlayer extends RemotePlayer {
  hp: number;
  maxHp: number;
  isDead: boolean;
  team?: 'red' | 'blue';
  ammo: number;
  killCount: number;
  deathCount: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  type: 'normal' | 'explosive';
  createdAt: number;
}

export interface BattlePickup {
  id: string;
  type: 'health' | 'ammo' | 'powerup';
  position: [number, number, number];
  active: boolean;
}

export interface BattleLobbyState extends LobbyState {
  mode: 'race' | 'battle';
  battleType?: BattleModeType;
}
