import { useRef, useEffect, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RemotePlayer, RaceParticipant, LobbyPlayer, RacePortalData, LobbyState } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface MultiplayerHook {
  connected: boolean;
  playerId: string | null;
  playerName: string | null;
  players: Map<string, RemotePlayer>;
  // Race state
  inRace: boolean;
  raceId: string | null;
  raceSeed: number | null;
  raceParticipants: RaceParticipant[];
  raceStartPosition: [number, number, number] | null;
  // Lobby state
  lobby: LobbyState | null;
  activePortals: RacePortalData[];
  // Actions
  updatePosition: (position: [number, number, number], rotation: [number, number, number, number]) => void;
  createLobby: (position: [number, number, number]) => void;
  joinLobby: (lobbyId: string) => void;
  leaveLobby: () => void;
  setReady: (ready: boolean) => void;
  startRace: () => void;
  leaveRace: () => void;
  updateCheckpoint: (checkpoints: number) => void;
}

export function useMultiplayer(): MultiplayerHook {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [players, setPlayers] = useState<Map<string, RemotePlayer>>(new Map());
  
  // Race state
  const [inRace, setInRace] = useState(false);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceSeed, setRaceSeed] = useState<number | null>(null);
  const [raceParticipants, setRaceParticipants] = useState<RaceParticipant[]>([]);
  const [raceStartPosition, setRaceStartPosition] = useState<[number, number, number] | null>(null);
  
  // Lobby state
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [activePortals, setActivePortals] = useState<RacePortalData[]>([]);
  
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
      you: { id: string; name: string };
      players: RemotePlayer[];
      portals: RacePortalData[];
    }) => {
      setPlayerId(data.you.id);
      setPlayerName(data.you.name);
      
      const playerMap = new Map<string, RemotePlayer>();
      data.players.forEach(p => playerMap.set(p.id, p));
      setPlayers(playerMap);
      setActivePortals(data.portals || []);
      
      console.log(`🐦 Welcome ${data.you.name}! ${data.players.length} other birds flying`);
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
      console.log(`🏁 Race started! Seed: ${data.seed}`);
    });

    socket.on('race:playerJoined', (data: { player: RaceParticipant }) => {
      setRaceParticipants(prev => [...prev, data.player]);
    });

    socket.on('race:playerLeft', (data: { playerId: string; finalCheckpoints?: number }) => {
      setRaceParticipants(prev => prev.filter(p => p.id !== data.playerId));
    });

    socket.on('race:update', (data: { playerId: string; checkpoints: number }) => {
      setRaceParticipants(prev => 
        prev.map(p => p.id === data.playerId ? { ...p, checkpoints: data.checkpoints } : p)
      );
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

  const createLobby = useCallback((position: [number, number, number]) => {
    socketRef.current?.emit('lobby:create', { position });
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
  }, []);

  const updateCheckpoint = useCallback((checkpoints: number) => {
    socketRef.current?.emit('race:checkpoint', { checkpoints });
  }, []);

  return {
    connected,
    playerId,
    playerName,
    players,
    inRace,
    raceId,
    raceSeed,
    raceParticipants,
    raceStartPosition,
    lobby,
    activePortals,
    updatePosition,
    createLobby,
    joinLobby,
    leaveLobby,
    setReady,
    startRace,
    leaveRace,
    updateCheckpoint
  };
}
