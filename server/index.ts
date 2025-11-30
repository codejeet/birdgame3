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
  // Persistent tracking (simple)
  score: number;
  fingerprint?: string; // Could be IP + UserAgent hash or similar
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
  mode: 'race' | 'battle';
  battleType?: 'deathmatch' | 'ctf';
}

interface BattlePlayerState {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  hp: number;
  maxHp: number;
  isDead: boolean;
  team?: 'red' | 'blue';
  ammo: number;
  killCount: number;
  deathCount: number;
  lastRespawn: number;
}

interface BattleSession {
  id: string;
  players: Map<string, BattlePlayerState>;
  mode: 'deathmatch' | 'ctf';
  startTime: number;
  isActive: boolean;
  projectiles: Set<string>; // IDs
  pickups: Map<string, { type: 'health' | 'ammo' | 'powerup', position: [number, number, number], active: boolean }>;
  scores: { [key: string]: number }; // Team or Player ID -> Score
  flag?: {
    position: [number, number, number];
    carrierId: string | null;
    homeBase: { red: [number, number, number], blue: [number, number, number] };
  };
}

interface RaceParticipantResult {
  id: string;
  name: string;
  checkpoints: number;
  finished: boolean;
  active: boolean;
  lastCheckpointTime?: number;
  fingerprint?: string; // Add fingerprint to history to award points even if disconnected
}

interface RaceSession {
  id: string;
  players: Set<string>; // Active socket IDs
  history: Map<string, RaceParticipantResult>; // All participants
  startTime: number;
  ringsSeed: number;
  isActive: boolean;
}

// State
const players = new Map<string, PlayerState>();
const lobbies = new Map<string, Lobby>();
const races = new Map<string, RaceSession>();
const battles = new Map<string, BattleSession>();
// Simple persistent score store: Map<Fingerprint, Score>
const globalScores = new Map<string, number>();

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
      if (races.has(player.raceId)) {
        const race = races.get(player.raceId);
        if (race) {
          race.players.delete(playerId);
          io.to(`race:${player.raceId}`).emit('race:playerLeft', { playerId });
        }
      } else if (battles.has(player.raceId)) {
        const battle = battles.get(player.raceId);
        if (battle) {
          battle.players.delete(playerId);
          io.to(`battle:${player.raceId}`).emit('battle:playerLeft', { playerId });

          if (battle.players.size === 0) {
            battles.delete(player.raceId);
          }
        }
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
  // Use IP as simple fingerprint for now (in a real app, use a proper session/auth)
  const ip = socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'] || '';
  const fingerprint = `${ip}-${userAgent}`;

  const savedScore = globalScores.get(fingerprint) || 0;

  const playerState: PlayerState = {
    id: socket.id,
    name: generateBirdName(),
    position: [0, 350, 0],
    rotation: [0, 0, 0, 1],
    inRace: false,
    raceId: null,
    raceCheckpoints: 0,
    lobbyId: null,
    lastUpdate: Date.now(),
    score: savedScore,
    fingerprint
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
  socket.on('lobby:create', (data: { position: [number, number, number], mode?: 'race' | 'battle', battleType?: 'deathmatch' | 'ctf' }) => {
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
      raceStarted: false,
      mode: data.mode || 'race',
      battleType: data.battleType
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

        // Start the game!
        lobby.raceStarted = true;

        if (lobby.mode === 'battle') {
          startBattle(lobby);
          return;
        }

        const raceId = lobby.id;
        const seed = Math.floor(Math.random() * 1000000);

        // Create race session
        const race: RaceSession = {
          id: raceId,
          players: new Set(),
          history: new Map(),
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

            // Add to history
            race.history.set(pid, {
              id: pid,
              name: p.name,
              checkpoints: 0,
              finished: false,
              active: true,
              lastCheckpointTime: Date.now(),
              fingerprint: p.fingerprint
            });

            const playerSocket = io.sockets.sockets.get(pid);
            if (playerSocket) {
              playerSocket.leave(`lobby:${lobby.id}`);
              playerSocket.join(`race:${raceId}`);
            }
          }
        }

        // Calculate start position (in front of portal, facing forward)
        // Ensure portal position is valid before using
        const portalPos = lobby.portalPosition || [0, 350, 0];
        const startPosition: [number, number, number] = [
          portalPos[0],
          portalPos[1],
          portalPos[2] + 100  // 100 units in front of portal
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

  function startBattle(lobby: Lobby) {
    const battleId = lobby.id;
    const battle: BattleSession = {
      id: battleId,
      players: new Map(),
      mode: lobby.battleType || 'deathmatch',
      startTime: Date.now(),
      isActive: true,
      projectiles: new Set(),
      pickups: new Map(),
      scores: {}
    };

    // Initialize pickups (random positions around portal for now)
    for (let i = 0; i < 10; i++) {
      const id = generateId();
      const offset = [
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 200
      ];
      battle.pickups.set(id, {
        type: Math.random() > 0.8 ? 'powerup' : (Math.random() > 0.5 ? 'health' : 'ammo'),
        position: [
          lobby.portalPosition[0] + offset[0],
          lobby.portalPosition[1] + offset[1],
          lobby.portalPosition[2] + offset[2]
        ],
        active: true
      });
    }

    // CTF Setup
    if (battle.mode === 'ctf') {
      battle.flag = {
        position: [lobby.portalPosition[0], lobby.portalPosition[1] + 50, lobby.portalPosition[2]],
        carrierId: null,
        homeBase: {
          red: [lobby.portalPosition[0] - 200, lobby.portalPosition[1], lobby.portalPosition[2]],
          blue: [lobby.portalPosition[0] + 200, lobby.portalPosition[1], lobby.portalPosition[2]]
        }
      };
      battle.scores = { red: 0, blue: 0 };
    }

    battles.set(battleId, battle);

    // Move players
    let teamToggle = false;
    for (const [pid, lobbyPlayer] of lobby.players) {
      const p = players.get(pid);
      if (p) {
        p.inRace = true; // Reusing inRace flag for "in game"
        p.raceId = battleId; // Reusing raceId for "gameId"
        p.lobbyId = null;

        const team = battle.mode === 'ctf' ? (teamToggle ? 'red' : 'blue') : undefined;
        teamToggle = !teamToggle;

        battle.players.set(pid, {
          id: pid,
          name: p.name,
          position: p.position,
          rotation: p.rotation,
          hp: 100,
          maxHp: 100,
          isDead: false,
          team: team,
          ammo: 20,
          killCount: 0,
          deathCount: 0,
          lastRespawn: Date.now()
        });

        if (battle.mode === 'deathmatch') {
          battle.scores[pid] = 0;
        }

        const playerSocket = io.sockets.sockets.get(pid);
        if (playerSocket) {
          playerSocket.leave(`lobby:${lobby.id}`);
          playerSocket.join(`battle:${battleId}`);
        }
      }
    }

    // Notify start
    io.to(`battle:${battleId}`).emit('battle:start', {
      battleId,
      mode: battle.mode,
      players: Array.from(battle.players.values()),
      pickups: Array.from(battle.pickups.entries()),
      flag: battle.flag,
      scores: battle.scores
    });

    // Remove portal
    broadcastPortals();
    console.log(`Battle ${battleId} started (${battle.mode})`);
  }

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

    const race = races.get(player.raceId);
    if (race) {
      const participant = race.history.get(socket.id);
      if (participant) {
        participant.checkpoints = data.checkpoints;
        participant.lastCheckpointTime = Date.now();
      }
    }

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

      // Mark as inactive in history but keep checkpoints
      const participant = race.history.get(socket.id);
      if (participant) {
        participant.active = false;
        participant.checkpoints = player.raceCheckpoints;
      }

      socket.to(`race:${player.raceId}`).emit('race:playerLeft', {
        playerId: socket.id,
        finalCheckpoints: player.raceCheckpoints
      });

      // Check if race is empty or if only one player remains (Last Man Standing)
      if (race.players.size === 0) {
        // RACE OVER - ALL FAILED / LEFT
        // Calculate final standings using history of ALL participants
        const allResults = Array.from(race.history.values());

        // Sort by checkpoints descending, then by time ascending (earlier is better)
        allResults.sort((a, b) => {
          if (b.checkpoints !== a.checkpoints) return b.checkpoints - a.checkpoints;
          // Tie-break: if one finished and other didn't? (Unlikely here as all left, but handled)
          // If checkpoints equal, who reached last checkpoint first wins tie
          const timeA = a.lastCheckpointTime || 0;
          const timeB = b.lastCheckpointTime || 0;
          return timeA - timeB;
        });

        // Assign ranks
        const finalStandings = allResults.map((r, i) => ({
          id: r.id,
          name: r.name,
          checkpoints: r.checkpoints,
          rank: i + 1
        }));

        // Award points to top 3 players
        const pointsAward = [100, 50, 25]; // 1st, 2nd, 3rd

        for (const standing of finalStandings) {
          if (standing.rank <= 3) {
            const points = pointsAward[standing.rank - 1];
            const p = players.get(standing.id);
            // Player might be disconnected (p is undefined), but we should try to update persistent score if possible?
            // We can look up by ID in history? No, history doesn't have fingerprint.
            // But 'players' map might still have them if they just left race but not server?
            // If they disconnected fully, 'players' map won't have them.
            // We'd need to store fingerprint in history to persist offline.
            // For now, only award if online.

            if (p && p.fingerprint) {
              const currentScore = globalScores.get(p.fingerprint) || 0;
              const newScore = currentScore + points;
              globalScores.set(p.fingerprint, newScore);
              p.score = newScore;

              // Notify player of score update
              io.to(standing.id).emit('score:update', { score: newScore });
            }
          }
        }

        // Emit results to anyone still connected (even if not in race room, we can try iterating)
        // But actually, socket.leave() hasn't happened for the current player yet.
        // And previous leavers are gone from room.
        // We can emit to specific socket IDs found in history if they are in 'players'.
        for (const standing of finalStandings) {
          const p = players.get(standing.id);
          if (p) {
            io.to(standing.id).emit('race:ended', { results: finalStandings });
          }
        }

        races.delete(player.raceId);
        console.log(`Race ${player.raceId} ended (All Finished/Failed).`);


      }
    }

    socket.leave(`race:${player.raceId}`);
    player.inRace = false;
    player.raceId = null;
    player.raceCheckpoints = 0;

    console.log(`${player.name} left race`);
  });

  // Handle race win
  socket.on('race:win', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;

    const race = races.get(player.raceId);
    if (race) {
      // Mark winner as finished in history
      const participant = race.history.get(socket.id);
      if (participant) {
        participant.finished = true;
        participant.checkpoints = 999999; // Force highest value for winner
      }

      // Calculate final positions based on history
      const allResults = Array.from(race.history.values());

      // Sort: Finished players first (should only be one if race ends immediately), then by checkpoints, then time
      allResults.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (b.checkpoints !== a.checkpoints) return b.checkpoints - a.checkpoints;
        const timeA = a.lastCheckpointTime || 0;
        const timeB = b.lastCheckpointTime || 0;
        return timeA - timeB;
      });

      const finalStandings = allResults.map((r, i) => ({
        id: r.id,
        name: r.name,
        checkpoints: r.finished ? 20 : r.checkpoints, // Display 20/real count in UI
        rank: i + 1
      }));

      // End race for everyone with results
      io.to(`race:${player.raceId}`).emit('race:ended', {
        results: finalStandings
      });

      // Award points to all participants (1 participation + placement bonus)
      const pointsAward = [100, 50, 25]; // 1st, 2nd, 3rd

      for (const standing of finalStandings) {
        let points = 1; // Participation point
        if (standing.rank <= 3) {
          points += pointsAward[standing.rank - 1];
        }

        const participant = race.history.get(standing.id);
        const fingerprint = participant?.fingerprint;

        if (fingerprint) {
          const currentScore = globalScores.get(fingerprint) || 0;
          const newScore = currentScore + points;
          globalScores.set(fingerprint, newScore);
          console.log(`Updated persistent score for ${standing.name}: ${currentScore} -> ${newScore}`);

          // If player is online, update their state and notify
          const p = players.get(standing.id);
          if (p) {
            p.score = newScore;
            io.to(standing.id).emit('score:update', { score: newScore });
          }
        }
      }

      // Clean up race players
      for (const pid of race.players) {
        const p = players.get(pid);
        if (p) {
          p.inRace = false;
          p.raceId = null;
          p.lobbyId = null; // Ensure lobby ID is cleared
          p.raceCheckpoints = 0;
          const s = io.sockets.sockets.get(pid);
          if (s) s.leave(`race:${race.id}`);
        }
      }
      races.delete(race.id);
      console.log(`Race ${race.id} won by ${player.name}`);
    }
  });

  // ========== BATTLE SYSTEM ==========

  socket.on('battle:shoot', (data: { position: [number, number, number], velocity: [number, number, number], type: 'normal' | 'explosive' }) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;

    const battle = battles.get(player.raceId);
    if (!battle) return;

    const battlePlayer = battle.players.get(socket.id);
    if (!battlePlayer || battlePlayer.isDead || battlePlayer.ammo <= 0) return;

    // Deduct ammo
    battlePlayer.ammo--;

    const projectileId = generateId();
    // We don't track projectile physics on server for now, just broadcast spawn
    // Clients will simulate it.

    io.to(`battle:${battle.id}`).emit('battle:projectile', {
      id: projectileId,
      ownerId: socket.id,
      position: data.position,
      velocity: data.velocity,
      type: data.type
    });

    // Notify ammo update
    socket.emit('battle:ammo', { ammo: battlePlayer.ammo });
  });

  socket.on('battle:hit', (data: { targetId: string, damage: number }) => {
    const shooter = players.get(socket.id);
    if (!shooter || !shooter.raceId) return;

    const battle = battles.get(shooter.raceId);
    if (!battle) return;

    const target = battle.players.get(data.targetId);
    if (!target || target.isDead) return;

    // Apply damage
    target.hp = Math.max(0, target.hp - data.damage);

    io.to(`battle:${battle.id}`).emit('battle:damage', {
      targetId: data.targetId,
      hp: target.hp,
      damage: data.damage,
      shooterId: socket.id
    });

    if (target.hp <= 0) {
      target.isDead = true;
      target.deathCount++;

      const shooterPlayer = battle.players.get(socket.id);
      if (shooterPlayer) {
        shooterPlayer.killCount++;

        // Update score
        if (battle.mode === 'deathmatch') {
          battle.scores[socket.id] = (battle.scores[socket.id] || 0) + 1;
        }
      }

      // Drop flag if carrying
      if (battle.flag && battle.flag.carrierId === data.targetId) {
        battle.flag.carrierId = null;
        // We need target position. It's not in 'data', but it's in 'target' state (which might be slightly old but ok)
        // Actually target.position is available on server state
        battle.flag.position = [...target.position];
        io.to(`battle:${battle.id}`).emit('battle:flagUpdate', { flag: battle.flag });
      }

      io.to(`battle:${battle.id}`).emit('battle:kill', {
        victimId: data.targetId,
        killerId: socket.id,
        scores: battle.scores
      });
    }
  });

  socket.on('battle:respawn', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;

    const battle = battles.get(player.raceId);
    if (!battle) return;

    const battlePlayer = battle.players.get(socket.id);
    if (!battlePlayer || !battlePlayer.isDead) return;

    // Reset stats
    battlePlayer.isDead = false;
    battlePlayer.hp = battlePlayer.maxHp;
    battlePlayer.ammo = 20; // Reset ammo on respawn? Or keep low? Let's reset.
    battlePlayer.lastRespawn = Date.now();

    // Pick random spawn point near center/base
    // For now just random box
    const spawnPos: [number, number, number] = [
      (Math.random() - 0.5) * 200,
      350 + (Math.random() * 50),
      (Math.random() - 0.5) * 200
    ];

    io.to(`battle:${battle.id}`).emit('battle:respawned', {
      playerId: socket.id,
      position: spawnPos,
      hp: battlePlayer.hp,
      ammo: battlePlayer.ammo
    });
  });

  socket.on('battle:pickup', (data: { pickupId: string }) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;

    const battle = battles.get(player.raceId);
    if (!battle) return;

    const pickup = battle.pickups.get(data.pickupId);
    if (!pickup || !pickup.active) return;

    const battlePlayer = battle.players.get(socket.id);
    if (!battlePlayer || battlePlayer.isDead) return;

    // Apply effect
    if (pickup.type === 'health') {
      battlePlayer.hp = Math.min(battlePlayer.maxHp, battlePlayer.hp + 50);
    } else if (pickup.type === 'ammo') {
      battlePlayer.ammo += 10;
    } else if (pickup.type === 'powerup') {
      const effect = Math.random() > 0.5 ? 'rapidfire' : 'speedboost';
      socket.emit('battle:powerup', { effect, duration: 10000 });
    }

    // Deactivate pickup
    pickup.active = false;

    io.to(`battle:${battle.id}`).emit('battle:pickupTaken', {
      pickupId: data.pickupId,
      playerId: socket.id,
      type: pickup.type
    });

    // Respawn pickup after delay
    setTimeout(() => {
      if (battles.has(battle.id)) {
        pickup.active = true;
        io.to(`battle:${battle.id}`).emit('battle:pickupRespawn', {
          pickupId: data.pickupId
        });
      }
    }, 10000);
  });

  socket.on('battle:flagPickup', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    const battle = battles.get(player.raceId);
    if (!battle || !battle.flag) return;

    // Check if already carried
    if (battle.flag.carrierId) return;

    // Check distance (simple server validation using last known pos)
    const dist = Math.sqrt(
      Math.pow(player.position[0] - battle.flag.position[0], 2) +
      Math.pow(player.position[1] - battle.flag.position[1], 2) +
      Math.pow(player.position[2] - battle.flag.position[2], 2)
    );

    if (dist < 20) { // Pickup radius
      battle.flag.carrierId = socket.id;
      io.to(`battle:${battle.id}`).emit('battle:flagUpdate', { flag: battle.flag });
    }
  });

  socket.on('battle:steal', (data: { targetId: string }) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    const battle = battles.get(player.raceId);
    if (!battle || !battle.flag || !battle.flag.carrierId) return;

    // Must be stealing from the current carrier
    if (battle.flag.carrierId !== data.targetId) return;

    // Check distance between thief (socket.id) and carrier (targetId)
    const carrier = battle.players.get(data.targetId);
    // We need the carrier's position. We can get it from the main players map.
    const carrierPlayer = players.get(data.targetId);

    if (!carrierPlayer) return;

    const dist = Math.sqrt(
      Math.pow(player.position[0] - carrierPlayer.position[0], 2) +
      Math.pow(player.position[1] - carrierPlayer.position[1], 2) +
      Math.pow(player.position[2] - carrierPlayer.position[2], 2)
    );

    // Steal radius (slightly larger than pickup to make it feel responsive on collision)
    if (dist < 15) {
      battle.flag.carrierId = socket.id;
      io.to(`battle:${battle.id}`).emit('battle:flagUpdate', { flag: battle.flag });

      // Optional: Notify of steal?
      // io.to(`battle:${battle.id}`).emit('battle:notification', { message: `${player.name} stole the egg!` });
    }
  });

  socket.on('battle:score', () => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    const battle = battles.get(player.raceId);
    if (!battle || !battle.flag || !battle.flag.homeBase) return;

    // Must be carrier
    if (battle.flag.carrierId !== socket.id) return;

    const battlePlayer = battle.players.get(socket.id);
    if (!battlePlayer || !battlePlayer.team) return;

    // Target is OPPOSITE goal
    const targetBase = battlePlayer.team === 'red' ? battle.flag.homeBase.blue : battle.flag.homeBase.red;

    // Check distance to goal
    const dist = Math.sqrt(
      Math.pow(player.position[0] - targetBase[0], 2) +
      Math.pow(player.position[1] - targetBase[1], 2) +
      Math.pow(player.position[2] - targetBase[2], 2)
    );

    if (dist < 20) { // Goal radius
      // Score!
      battle.scores[battlePlayer.team] = (battle.scores[battlePlayer.team] || 0) + 1;

      // Reset flag
      battle.flag.carrierId = null;
      battle.flag.position = [0, 350, 0]; // Reset to center (approx) - ideally use original spawn
      // We lost original spawn. Let's use 0,350,0 or try to store it.
      // For now, center is fine.

      io.to(`battle:${battle.id}`).emit('battle:scoreUpdate', { scores: battle.scores });
      io.to(`battle:${battle.id}`).emit('battle:flagUpdate', { flag: battle.flag });
    }
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
