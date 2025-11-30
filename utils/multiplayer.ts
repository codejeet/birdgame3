import { useRef, useEffect, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RemotePlayer, RaceParticipant, LobbyPlayer, RacePortalData, LobbyState, BattleState, BattlePlayer, Projectile, BattlePickup, BattleModeType } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface RaceResult {
  id: string;
  name: string;
  rank: number;
  checkpoints: number;
}

interface MultiplayerHook {
  connected: boolean;
  playerId: string | null;
  playerName: string | null;
  playerScore: number;
  players: Map<string, RemotePlayer>;
  // Race state
  inRace: boolean;
  raceId: string | null;
  raceSeed: number | null;
  raceParticipants: RaceParticipant[];
  raceStartPosition: [number, number, number] | null;
  raceResults: RaceResult[] | null;
  // Lobby state
  lobby: LobbyState | null;
  activePortals: RacePortalData[];
  // Actions
  updatePosition: (position: [number, number, number], rotation: [number, number, number, number]) => void;
  createLobby: (position: [number, number, number], mode?: 'race' | 'battle', battleType?: 'deathmatch' | 'ctf') => void;
  joinLobby: (lobbyId: string) => void;
  leaveLobby: () => void;
  setReady: (ready: boolean) => void;
  startRace: () => void;
  leaveRace: () => void;
  winRace: () => void;
  updateCheckpoint: (checkpoints: number) => void;
  // Battle state
  battle: BattleState | null;
  projectiles: Projectile[];
  pickups: BattlePickup[];
  activePowerups: Map<string, number>;
  // Battle actions
  shoot: (position: [number, number, number], velocity: [number, number, number], type: 'normal' | 'explosive') => void;
  reportHit: (targetId: string, damage: number) => void;
  respawn: () => void;
  collectPickup: (pickupId: string) => void;
  pickupFlag: () => void;
  stealFlag: (targetId: string) => void;
  score: () => void;
  clearRaceResults: () => void;
}

export function useMultiplayer(): MultiplayerHook {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [playerScore, setPlayerScore] = useState<number>(0);
  const [players, setPlayers] = useState<Map<string, RemotePlayer>>(new Map());

  // Race state
  const [inRace, setInRace] = useState(false);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceSeed, setRaceSeed] = useState<number | null>(null);
  const [raceParticipants, setRaceParticipants] = useState<RaceParticipant[]>([]);
  const [raceStartPosition, setRaceStartPosition] = useState<[number, number, number] | null>(null);
  const [raceResults, setRaceResults] = useState<RaceResult[] | null>(null);

  // Lobby state
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [activePortals, setActivePortals] = useState<RacePortalData[]>([]);

  // Battle state
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [pickups, setPickups] = useState<BattlePickup[]>([]);
  const [activePowerups, setActivePowerups] = useState<Map<string, number>>(new Map());

  // Throttle position updates
  const lastUpdateRef = useRef(0);
  const UPDATE_INTERVAL = 50;

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🐦 Connected to server');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('🐦 Disconnected from server');
      setConnected(false);
      setInRace(false);
      setRaceId(null);
      setLobby(null);
    });

    socket.on('welcome', (data: {
      you: { id: string; name: string; score: number };
      players: RemotePlayer[];
      portals: RacePortalData[];
    }) => {
      setPlayerId(data.you.id);
      setPlayerName(data.you.name);
      setPlayerScore(data.you.score || 0);

      const playerMap = new Map<string, RemotePlayer>();
      data.players.forEach(p => playerMap.set(p.id, p));
      setPlayers(playerMap);
      setActivePortals(data.portals || []);

      console.log(`🐦 Welcome ${data.you.name}! Score: ${data.you.score}`);
    });

    socket.on('score:update', (data: { score: number }) => {
      console.log(`🐦 Received score update: ${data.score}`);
      setPlayerScore(data.score);
    });

    socket.on('player:joined', (data: { player: RemotePlayer }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        next.set(data.player.id, data.player);
        return next;
      });
    });

    socket.on('player:left', (data: { playerId: string }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        next.delete(data.playerId);
        return next;
      });
    });

    socket.on('player:moved', (data: {
      id: string;
      position: [number, number, number];
      rotation: [number, number, number, number];
    }) => {
      setPlayers(prev => {
        const player = prev.get(data.id);
        if (player) {
          const next = new Map(prev);
          next.set(data.id, {
            ...player,
            position: data.position,
            rotation: data.rotation
          });
          return next;
        }
        return prev;
      });
    });

    // ========== PORTAL EVENTS ==========

    socket.on('portals:update', (data: { portals: RacePortalData[] }) => {
      setActivePortals(data.portals);
    });

    // ========== LOBBY EVENTS ==========

    socket.on('lobby:created', (data: {
      lobbyId: string;
      players: LobbyPlayer[];
      portalPosition: [number, number, number];
    }) => {
      setLobby({
        lobbyId: data.lobbyId,
        isHost: true,
        players: data.players,
        portalPosition: data.portalPosition,
        countdown: null
      });
      console.log(`🏁 Created lobby ${data.lobbyId}`);
    });

    socket.on('lobby:joined', (data: {
      lobbyId: string;
      players: LobbyPlayer[];
      portalPosition: [number, number, number];
      isHost: boolean;
    }) => {
      setLobby({
        lobbyId: data.lobbyId,
        isHost: data.isHost,
        players: data.players,
        portalPosition: data.portalPosition,
        countdown: null
      });
      console.log(`🏁 Joined lobby ${data.lobbyId}`);
    });

    socket.on('lobby:playerJoined', (data: { player: LobbyPlayer }) => {
      setLobby(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: [...prev.players, data.player]
        };
      });
    });

    socket.on('lobby:playerLeft', (data: { playerId: string }) => {
      setLobby(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter(p => p.id !== data.playerId)
        };
      });
    });

    socket.on('lobby:playerReady', (data: { playerId: string; ready: boolean }) => {
      setLobby(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.id === data.playerId ? { ...p, ready: data.ready } : p
          )
        };
      });
    });

    socket.on('lobby:newHost', (data: { hostId: string }) => {
      setLobby(prev => {
        if (!prev) return prev;
        const amIHost = data.hostId === socketRef.current?.id;
        return {
          ...prev,
          isHost: amIHost,
          players: prev.players.map(p => ({
            ...p,
            isHost: p.id === data.hostId
          }))
        };
      });
    });

    socket.on('lobby:countdown', (data: { seconds: number }) => {
      setLobby(prev => {
        if (!prev) return prev;
        return { ...prev, countdown: data.seconds };
      });
    });

    socket.on('lobby:removed', (data: { lobbyId: string }) => {
      setActivePortals(prev => prev.filter(p => p.lobbyId !== data.lobbyId));
    });

    socket.on('lobby:error', (data: { message: string }) => {
      console.error('Lobby error:', data.message);
    });

    // ========== RACE EVENTS ==========

    socket.on('race:start', (data: {
      raceId: string;
      seed: number;
      players: RaceParticipant[];
      startPosition: [number, number, number];
    }) => {
      setLobby(null);
      setInRace(true);
      setRaceId(data.raceId);
      setRaceSeed(data.seed);
      setRaceParticipants(data.players);
      setRaceStartPosition(data.startPosition);
      setRaceResults(null);
      console.log(`🏁 Race started! Seed: ${data.seed}`);
    });

    socket.on('race:playerJoined', (data: { player: RaceParticipant }) => {
      setRaceParticipants(prev => [...prev, data.player]);
    });

    socket.on('race:playerLeft', (data: { playerId: string; finalCheckpoints?: number }) => {
      setRaceParticipants(prev => prev.filter(p => p.id !== data.playerId));
    });

    socket.on('race:ended', (data: { results: RaceResult[] }) => {
      setInRace(false);
      setRaceId(null);
      setRaceSeed(null);
      setRaceParticipants([]);
      setRaceStartPosition(null);
      setRaceResults(data.results);
    });

    socket.on('race:update', (data: { playerId: string; checkpoints: number }) => {
      setRaceParticipants(prev =>
        prev.map(p => p.id === data.playerId ? { ...p, checkpoints: data.checkpoints } : p)
      );
    });

    // ========== BATTLE EVENTS ==========

    socket.on('battle:start', (data: {
      battleId: string;
      mode: BattleModeType;
      players: BattlePlayer[];
      pickups: [string, any][];
      flag: any;
      scores: any;
    }) => {
      setLobby(null);
      setInRace(true); // Reuse inRace for "game active"
      setRaceId(data.battleId);

      setBattle({
        isActive: true,
        mode: data.mode,
        timeLeft: 300,
        scores: data.scores,
        flag: data.flag,
        myTeam: data.players.find(p => p.id === socket.id)?.team
      });

      // Update players with battle stats
      const playerMap = new Map<string, RemotePlayer>();
      data.players.forEach(p => playerMap.set(p.id, p));
      setPlayers(playerMap);

      // Set pickups
      setPickups(data.pickups.map(([id, p]) => ({ id, ...p })));

      console.log(`⚔️ Battle started! Mode: ${data.mode}`);
    });

    socket.on('battle:projectile', (data: Projectile) => {
      setProjectiles(prev => [...prev, { ...data, createdAt: Date.now() }]);
    });

    socket.on('battle:damage', (data: { targetId: string, hp: number, damage: number, shooterId: string }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        const p = next.get(data.targetId);
        if (p) {
          next.set(data.targetId, { ...p, hp: data.hp });
        }
        return next;
      });
    });

    socket.on('battle:kill', (data: { victimId: string, killerId: string, scores: any }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        const victim = next.get(data.victimId);
        if (victim) next.set(data.victimId, { ...victim, isDead: true, deathCount: (victim.deathCount || 0) + 1 });

        const killer = next.get(data.killerId);
        if (killer) next.set(data.killerId, { ...killer, killCount: (killer.killCount || 0) + 1 });

        return next;
      });

      setBattle(prev => prev ? { ...prev, scores: data.scores } : null);
    });

    socket.on('battle:respawned', (data: { playerId: string, position: [number, number, number], hp: number, ammo: number }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        const p = next.get(data.playerId);
        if (p) {
          next.set(data.playerId, {
            ...p,
            position: data.position,
            hp: data.hp,
            isDead: false,
            ammo: data.ammo
          });
        }
        return next;
      });
    });

    socket.on('battle:ammo', (data: { ammo: number }) => {
      setPlayers(prev => {
        const next = new Map(prev);
        const p = next.get(socket.id);
        if (p) {
          next.set(socket.id, { ...p, ammo: data.ammo });
        }
        return next;
      });
    });

    socket.on('battle:pickupTaken', (data: { pickupId: string, playerId: string, type: string }) => {
      setPickups(prev => prev.map(p => p.id === data.pickupId ? { ...p, active: false } : p));
    });

    socket.on('battle:pickupRespawn', (data: { pickupId: string }) => {
      setPickups(prev => prev.map(p => p.id === data.pickupId ? { ...p, active: true } : p));
    });

    socket.on('battle:flagUpdate', (data: { flag: any }) => {
      setBattle(prev => prev ? { ...prev, flag: data.flag } : null);
    });

    socket.on('battle:scoreUpdate', (data: { scores: any }) => {
      setBattle(prev => prev ? { ...prev, scores: data.scores } : null);
    });

    socket.on('battle:powerup', (data: { effect: string, duration: number }) => {
      setActivePowerups(prev => {
        const next = new Map(prev);
        next.set(data.effect, Date.now() + data.duration);
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const updatePosition = useCallback((
    position: [number, number, number],
    rotation: [number, number, number, number]
  ) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;
    lastUpdateRef.current = now;

    socketRef.current?.emit('player:update', { position, rotation });
  }, []);

  const createLobby = useCallback((position: [number, number, number], mode: 'race' | 'battle' = 'race', battleType?: 'deathmatch' | 'ctf') => {
    socketRef.current?.emit('lobby:create', { position, mode, battleType });
  }, []);

  const joinLobby = useCallback((lobbyId: string) => {
    socketRef.current?.emit('lobby:join', { lobbyId });
  }, []);

  const leaveLobby = useCallback(() => {
    socketRef.current?.emit('lobby:leave');
    setLobby(null);
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit('lobby:ready', { ready });
  }, []);

  const startRace = useCallback(() => {
    socketRef.current?.emit('lobby:start');
  }, []);

  const leaveRace = useCallback(() => {
    socketRef.current?.emit('race:leave');
    setInRace(false);
    setRaceId(null);
    setRaceSeed(null);
    setRaceParticipants([]);
    setRaceStartPosition(null);
    setRaceResults(null);
  }, []);

  const winRace = useCallback(() => {
    socketRef.current?.emit('race:win');
    // Don't leave immediately, wait for server to end race for everyone
  }, []);

  const updateCheckpoint = useCallback((checkpoints: number) => {
    socketRef.current?.emit('race:checkpoint', { checkpoints });
  }, []);

  const clearRaceResults = useCallback(() => {
    setRaceResults(null);
  }, []);

  // Battle actions
  const shoot = useCallback((position: [number, number, number], velocity: [number, number, number], type: 'normal' | 'explosive') => {
    socketRef.current?.emit('battle:shoot', { position, velocity, type });
  }, []);

  const reportHit = useCallback((targetId: string, damage: number) => {
    socketRef.current?.emit('battle:hit', { targetId, damage });
  }, []);

  const respawn = useCallback(() => {
    socketRef.current?.emit('battle:respawn');
  }, []);

  const collectPickup = useCallback((pickupId: string) => {
    socketRef.current?.emit('battle:pickup', { pickupId });
  }, []);

  const pickupFlag = useCallback(() => {
    socketRef.current?.emit('battle:flagPickup');
  }, []);

  const stealFlag = useCallback((targetId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('battle:steal', { targetId });
  }, []);

  const score = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('battle:score');
  }, []);

  return {
    connected,
    playerId,
    playerName,
    playerScore,
    players,
    inRace,
    raceId,
    raceSeed,
    raceParticipants,
    raceStartPosition,
    raceResults,
    lobby,
    activePortals,
    updatePosition,
    createLobby,
    joinLobby,
    leaveLobby,
    setReady,
    startRace,
    leaveRace,
    winRace,
    updateCheckpoint,
    clearRaceResults,
    battle,
    projectiles,
    pickups,
    activePowerups,
    shoot,
    reportHit,
    respawn,
    collectPickup,
    pickupFlag,
    stealFlag,
    score
  };
}
