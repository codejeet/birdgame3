import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Types
interface PlayerState {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
  inRace: boolean;
  raceId: string | null;
  raceCheckpoints: number;
  lobbyId: string | null;
  lastUpdate: number;
}

interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
}

interface Lobby {
  id: string;
  hostId: string;
  hostName: string;
  players: Map<string, LobbyPlayer>;
  portalPosition: [number, number, number];
  createdAt: number;
  countdown: number | null; // null = waiting, number = countdown seconds
  raceStarted: boolean;
}

interface RaceSession {
  id: string;
  players: Set<string>;
  startTime: number;
  ringsSeed: number;
  isActive: boolean;
}

// State
const players = new Map<string, PlayerState>();
const lobbies = new Map<string, Lobby>();
const races = new Map<string, RaceSession>();

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

// Bird name generator
const adjectives = ['Swift', 'Soaring', 'Gliding', 'Diving', 'Majestic', 'Fluffy', 'Speedy', 'Graceful', 'Wild', 'Free'];
const nouns = ['Sparrow', 'Eagle', 'Falcon', 'Robin', 'Hawk', 'Dove', 'Raven', 'Phoenix', 'Owl', 'Finch'];
const generateBirdName = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
};

// Cleanup inactive players
setInterval(() => {
  const now = Date.now();
  for (const [id, player] of players) {
    if (now - player.lastUpdate > 10000) {
      console.log(`Player ${player.name} timed out`);
      handlePlayerLeave(id);
    }
  }
}, 5000);

// Cleanup old lobbies (5 min timeout)
setInterval(() => {
  const now = Date.now();
  for (const [lobbyId, lobby] of lobbies) {
    if (lobby.players.size === 0 || now - lobby.createdAt > 300000) {
      lobbies.delete(lobbyId);
      io.emit('lobby:removed', { lobbyId });
    }
  }
}, 10000);

// Cleanup empty races
setInterval(() => {
  for (const [raceId, race] of races) {
    if (race.players.size === 0) {
      races.delete(raceId);
    }
  }
}, 10000);

function handlePlayerLeave(playerId: string) {
  const player = players.get(playerId);
  if (player) {
    // Remove from lobby if in one
    if (player.lobbyId) {
      const lobby = lobbies.get(player.lobbyId);
      if (lobby) {
        lobby.players.delete(playerId);
        io.to(`lobby:${player.lobbyId}`).emit('lobby:playerLeft', { playerId });
        
        // If host left, assign new host or close lobby
        if (lobby.hostId === playerId) {
          const remaining = Array.from(lobby.players.values());
          if (remaining.length > 0) {
            const newHost = remaining[0];
            lobby.hostId = newHost.id;
            lobby.hostName = newHost.name;
            newHost.isHost = true;
            io.to(`lobby:${player.lobbyId}`).emit('lobby:newHost', { hostId: newHost.id });
          } else {
            lobbies.delete(player.lobbyId);
            io.emit('lobby:removed', { lobbyId: player.lobbyId });
          }
        }
        
        // Broadcast updated portal info
        broadcastPortals();
      }
    }
    
    // Remove from race if in one
    if (player.raceId) {
      const race = races.get(player.raceId);
      if (race) {
        race.players.delete(playerId);
        io.to(`race:${player.raceId}`).emit('race:playerLeft', { playerId });
      }
    }
    
    players.delete(playerId);
    io.emit('player:left', { playerId });
  }
}

function broadcastPortals() {
  const portals = Array.from(lobbies.values())
    .filter(l => !l.raceStarted)
    .map(l => ({
      lobbyId: l.id,
      hostName: l.hostName,
      position: l.portalPosition,
      playerCount: l.players.size
    }));
  io.emit('portals:update', { portals });
}

function getLobbyPlayers(lobby: Lobby): LobbyPlayer[] {
  return Array.from(lobby.players.values());
}

io.on('connection', (socket: Socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Initialize player
  const playerState: PlayerState = {
    id: socket.id,
    name: generateBirdName(),
    position: [0, 350, 0],
    rotation: [0, 0, 0, 1],
    inRace: false,
    raceId: null,
    raceCheckpoints: 0,
    lobbyId: null,
    lastUpdate: Date.now()
  };
  players.set(socket.id, playerState);
  
  // Get active portals
  const portals = Array.from(lobbies.values())
    .filter(l => !l.raceStarted)
    .map(l => ({
      lobbyId: l.id,
      hostName: l.hostName,
      position: l.portalPosition,
      playerCount: l.players.size
    }));
  
  // Send player their info and current world state
  socket.emit('welcome', {
    you: playerState,
    players: Array.from(players.values()).filter(p => p.id !== socket.id),
    portals
  });
  
  // Notify others
  socket.broadcast.emit('player:joined', { player: playerState });
  
  // Handle position updates
  socket.on('player:update', (data: { 
    position: [number, number, number]; 
    rotation: [number, number, number, number];
  }) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = data.position;
      player.rotation = data.rotation;
      player.lastUpdate = Date.now();
      
      socket.broadcast.emit('player:moved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });
  
  // ========== LOBBY SYSTEM ==========
  
  // Create a new race lobby (host creates portal)
  socket.on('lobby:create', (data: { position: [number, number, number] }) => {
    const player = players.get(socket.id);
    if (!player || player.lobbyId) return;
    
    const lobbyId = generateId();
    const lobby: Lobby = {
      id: lobbyId,
      hostId: socket.id,
      hostName: player.name,
      players: new Map(),
      portalPosition: data.position,
      createdAt: Date.now(),
      countdown: null,
      raceStarted: false
    };
    
    // Add host to lobby
    lobby.players.set(socket.id, {
      id: socket.id,
      name: player.name,
      isHost: true,
      ready: true
    });
    
    lobbies.set(lobbyId, lobby);
    player.lobbyId = lobbyId;
    socket.join(`lobby:${lobbyId}`);
    
    // Notify host
    socket.emit('lobby:created', {
      lobbyId,
      players: getLobbyPlayers(lobby),
      portalPosition: data.position
    });
    
    // Broadcast new portal to all players
    broadcastPortals();
    
    console.log(`${player.name} created lobby ${lobbyId}`);
  });
  
  // Join existing lobby via portal
  socket.on('lobby:join', (data: { lobbyId: string }) => {
    const player = players.get(socket.id);
    if (!player || player.lobbyId) return;
    
    const lobby = lobbies.get(data.lobbyId);
    if (!lobby || lobby.raceStarted) {
      socket.emit('lobby:error', { message: 'Lobby not found or race already started' });
      return;
    }
    
    // Add player to lobby
    lobby.players.set(socket.id, {
      id: socket.id,
      name: player.name,
      isHost: false,
      ready: false
    });
    
    player.lobbyId = data.lobbyId;
    socket.join(`lobby:${data.lobbyId}`);
    
    // Notify joiner
    socket.emit('lobby:joined', {
      lobbyId: data.lobbyId,
      players: getLobbyPlayers(lobby),
      portalPosition: lobby.portalPosition,
      isHost: false
    });
    
    // Notify others in lobby
    socket.to(`lobby:${data.lobbyId}`).emit('lobby:playerJoined', {
      player: { id: socket.id, name: player.name, isHost: false, ready: false }
    });
    
    // Broadcast updated portal count
    broadcastPortals();
    
    console.log(`${player.name} joined lobby ${data.lobbyId}`);
  });
  
  // Player toggles ready state
  socket.on('lobby:ready', (data: { ready: boolean }) => {
    const player = players.get(socket.id);
    if (!player || !player.lobbyId) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby) return;
    
    const lobbyPlayer = lobby.players.get(socket.id);
    if (lobbyPlayer) {
      lobbyPlayer.ready = data.ready;
      io.to(`lobby:${player.lobbyId}`).emit('lobby:playerReady', {
        playerId: socket.id,
        ready: data.ready
      });
    }
  });
  
  // Host starts the race
  socket.on('lobby:start', () => {
    const player = players.get(socket.id);
    if (!player || !player.lobbyId) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    // Start countdown
    lobby.countdown = 3;
    io.to(`lobby:${player.lobbyId}`).emit('lobby:countdown', { seconds: 3 });
    
    const countdownInterval = setInterval(() => {
      if (!lobby.countdown) {
        clearInterval(countdownInterval);
        return;
      }
      
      lobby.countdown--;
      
      if (lobby.countdown <= 0) {
        clearInterval(countdownInterval);
        
        // Start the race!
        lobby.raceStarted = true;
        const raceId = lobby.id;
        const seed = Math.floor(Math.random() * 1000000);
        
        // Create race session
        const race: RaceSession = {
          id: raceId,
          players: new Set(),
          startTime: Date.now(),
          ringsSeed: seed,
          isActive: true
        };
        races.set(raceId, race);
        
        // Move all lobby players to race
        for (const [pid, lobbyPlayer] of lobby.players) {
          const p = players.get(pid);
          if (p) {
            p.inRace = true;
            p.raceId = raceId;
            p.raceCheckpoints = 0;
            p.lobbyId = null;
            race.players.add(pid);
            
            const playerSocket = io.sockets.sockets.get(pid);
            if (playerSocket) {
              playerSocket.leave(`lobby:${lobby.id}`);
              playerSocket.join(`race:${raceId}`);
            }
          }
        }
        
        // Calculate start position (in front of portal, facing forward)
        const startPosition: [number, number, number] = [
          lobby.portalPosition[0],
          lobby.portalPosition[1],
          lobby.portalPosition[2] + 100  // 100 units in front of portal
        ];
        
        // Notify all players race is starting
        io.to(`race:${raceId}`).emit('race:start', {
          raceId,
          seed,
          startPosition,
          players: Array.from(race.players).map(pid => {
            const p = players.get(pid);
            return p ? { id: p.id, name: p.name, checkpoints: 0 } : null;
          }).filter(Boolean)
        });
        
        // Remove portal
        broadcastPortals();
        
        console.log(`Race ${raceId} started with ${race.players.size} players`);
      } else {
        io.to(`lobby:${player.lobbyId}`).emit('lobby:countdown', { seconds: lobby.countdown });
      }
    }, 1000);
  });
  
  // Leave lobby
  socket.on('lobby:leave', () => {
    const player = players.get(socket.id);
    if (!player || !player.lobbyId) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (lobby) {
      lobby.players.delete(socket.id);
      socket.leave(`lobby:${player.lobbyId}`);
      
      io.to(`lobby:${player.lobbyId}`).emit('lobby:playerLeft', { playerId: socket.id });
      
      // If host left, assign new host
      if (lobby.hostId === socket.id) {
        const remaining = Array.from(lobby.players.values());
        if (remaining.length > 0) {
          const newHost = remaining[0];
          lobby.hostId = newHost.id;
          lobby.hostName = newHost.name;
          newHost.isHost = true;
          io.to(`lobby:${player.lobbyId}`).emit('lobby:newHost', { hostId: newHost.id });
        } else {
          lobbies.delete(player.lobbyId);
          io.emit('lobby:removed', { lobbyId: player.lobbyId });
        }
      }
      
      broadcastPortals();
    }
    
    player.lobbyId = null;
  });
  
  // ========== RACE SYSTEM ==========
  
  // Handle checkpoint reached in race
  socket.on('race:checkpoint', (data: { checkpoints: number }) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    player.raceCheckpoints = data.checkpoints;
    
    io.to(`race:${player.raceId}`).emit('race:update', {
      playerId: socket.id,
      checkpoints: data.checkpoints
    });
  });
  
  // Handle leaving race (game over)
  socket.on('race:leave', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    const race = races.get(player.raceId);
    if (race) {
      race.players.delete(socket.id);
      socket.to(`race:${player.raceId}`).emit('race:playerLeft', { 
        playerId: socket.id,
        finalCheckpoints: player.raceCheckpoints 
      });
    }
    
    socket.leave(`race:${player.raceId}`);
    player.inRace = false;
    player.raceId = null;
    player.raceCheckpoints = 0;
    
    console.log(`${player.name} left race`);
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    players: players.size,
    lobbies: lobbies.size,
    races: races.size 
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🐦 Bird Game server running on port ${PORT}`);
});
