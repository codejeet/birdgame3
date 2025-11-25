import { useRef, useEffect, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RemotePlayer, RaceParticipant } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface MultiplayerHook {
  connected: boolean;
  playerId: string | null;
  playerName: string | null;
  players: Map<string, RemotePlayer>;
  inRace: boolean;
  raceId: string | null;
  raceSeed: number | null;
  raceParticipants: RaceParticipant[];
  updatePosition: (position: [number, number, number], rotation: [number, number, number, number]) => void;
  joinRace: (mode: string) => void;
  leaveRace: () => void;
  updateCheckpoint: (checkpoints: number) => void;
}

export function useMultiplayer(): MultiplayerHook {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [players, setPlayers] = useState<Map<string, RemotePlayer>>(new Map());
  const [inRace, setInRace] = useState(false);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceSeed, setRaceSeed] = useState<number | null>(null);
  const [raceParticipants, setRaceParticipants] = useState<RaceParticipant[]>([]);
  
  // Throttle position updates
  const lastUpdateRef = useRef(0);
  const UPDATE_INTERVAL = 50; // 20 updates per second

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
    });

    socket.on('welcome', (data: {
      you: { id: string; name: string };
      players: RemotePlayer[];
      currentRace: { id: string; playerCount: number } | null;
    }) => {
      setPlayerId(data.you.id);
      setPlayerName(data.you.name);
      
      const playerMap = new Map<string, RemotePlayer>();
      data.players.forEach(p => playerMap.set(p.id, p));
      setPlayers(playerMap);
      
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

    // Race events
    socket.on('race:joined', (data: {
      raceId: string;
      seed: number;
      players: RaceParticipant[];
    }) => {
      setInRace(true);
      setRaceId(data.raceId);
      setRaceSeed(data.seed);
      setRaceParticipants(data.players);
      console.log(`🏁 Joined race ${data.raceId} with ${data.players.length} players`);
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

    socket.on('race:closed', () => {
      console.log('🏁 Race closed to new players');
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

  const joinRace = useCallback((mode: string) => {
    socketRef.current?.emit('race:join', { mode });
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
    updatePosition,
    joinRace,
    leaveRace,
    updateCheckpoint
  };
}

