
export interface GameState {
  score: number;
  speed: number;
  altitude: number;
  isBoost: boolean;
}

export type RingGameMode = 'skyward' | 'mountain';

export interface GameStats {
  score: number;
  speed: number;
  altitude: number;
  // Mini-game stats
  isRingGameActive: boolean;
  ringGameMode: RingGameMode;
  combo: number;
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
