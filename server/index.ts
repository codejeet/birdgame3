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
  lastUpdate: number;
}

interface RaceSession {
  id: string;
  players: Set<string>;
  startTime: number;
  ringsSeed: number; // Shared seed for deterministic ring generation
  isActive: boolean;
}

// State
const players = new Map<string, PlayerState>();
const races = new Map<string, RaceSession>();
let currentOpenRace: string | null = null; // Race that's accepting new players

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
    if (now - player.lastUpdate > 10000) { // 10 second timeout
      console.log(`Player ${player.name} timed out`);
      handlePlayerLeave(id);
    }
  }
}, 5000);

// Cleanup empty races
setInterval(() => {
  for (const [raceId, race] of races) {
    if (race.players.size === 0) {
      races.delete(raceId);
      if (currentOpenRace === raceId) {
        currentOpenRace = null;
      }
    }
  }
}, 10000);

function handlePlayerLeave(playerId: string) {
  const player = players.get(playerId);
  if (player) {
    // Remove from race if in one
    if (player.raceId) {
      const race = races.get(player.raceId);
      if (race) {
        race.players.delete(playerId);
        io.to(player.raceId).emit('race:playerLeft', { playerId });
      }
    }
    players.delete(playerId);
    io.emit('player:left', { playerId });
  }
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
    lastUpdate: Date.now()
  };
  players.set(socket.id, playerState);
  
  // Send player their info and current world state
  socket.emit('welcome', {
    you: playerState,
    players: Array.from(players.values()).filter(p => p.id !== socket.id),
    currentRace: currentOpenRace ? {
      id: currentOpenRace,
      playerCount: races.get(currentOpenRace)?.players.size || 0
    } : null
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
      
      // Broadcast to others (throttled on client side)
      socket.broadcast.emit('player:moved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });
  
  // Handle joining a race
  socket.on('race:join', (data: { mode: string }) => {
    const player = players.get(socket.id);
    if (!player || player.inRace) return;
    
    let race: RaceSession;
    
    // Join existing open race or create new one
    if (currentOpenRace && races.has(currentOpenRace)) {
      race = races.get(currentOpenRace)!;
    } else {
      // Create new race
      const raceId = generateId();
      race = {
        id: raceId,
        players: new Set(),
        startTime: Date.now(),
        ringsSeed: Math.floor(Math.random() * 1000000),
        isActive: true
      };
      races.set(raceId, race);
      currentOpenRace = raceId;
      
      // Close race to new players after 30 seconds
      setTimeout(() => {
        if (currentOpenRace === raceId) {
          currentOpenRace = null;
          io.to(raceId).emit('race:closed'); // No more players can join
        }
      }, 30000);
    }
    
    // Add player to race
    race.players.add(socket.id);
    player.inRace = true;
    player.raceId = race.id;
    player.raceCheckpoints = 0;
    
    socket.join(race.id);
    
    // Notify player they joined
    socket.emit('race:joined', {
      raceId: race.id,
      seed: race.ringsSeed,
      players: Array.from(race.players).map(pid => {
        const p = players.get(pid);
        return p ? { id: p.id, name: p.name, checkpoints: p.raceCheckpoints } : null;
      }).filter(Boolean)
    });
    
    // Notify other race participants
    socket.to(race.id).emit('race:playerJoined', {
      player: { id: player.id, name: player.name, checkpoints: 0 }
    });
    
    console.log(`${player.name} joined race ${race.id}`);
  });
  
  // Handle checkpoint reached in race
  socket.on('race:checkpoint', (data: { checkpoints: number }) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    player.raceCheckpoints = data.checkpoints;
    
    // Broadcast to race participants
    io.to(player.raceId).emit('race:update', {
      playerId: socket.id,
      checkpoints: data.checkpoints
    });
  });
  
  // Handle leaving race (game over or quit)
  socket.on('race:leave', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    const race = races.get(player.raceId);
    if (race) {
      race.players.delete(socket.id);
      socket.to(player.raceId).emit('race:playerLeft', { 
        playerId: socket.id,
        finalCheckpoints: player.raceCheckpoints 
      });
    }
    
    socket.leave(player.raceId);
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
    races: races.size 
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🐦 Bird Game server running on port ${PORT}`);
});

