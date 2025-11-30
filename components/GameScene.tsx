
import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Sky } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Vector3, Quaternion, Group, Color } from 'three';
import { Bird } from './Bird';
import { World } from './World';
import { Collectibles } from './Collectibles';
import { AmbientBirds } from './AmbientBirds';
import { HUD } from './HUD';
import { RingManager } from './RingManager';
import { WaterEffects } from './WaterEffects';
import { AudioController, AudioHandle } from './AudioController';
import { OtherPlayers } from './OtherPlayers';
import { BattleManager } from './BattleManager';
import { RacePortals } from './RacePortal';
import { VictoryScreen } from './VictoryScreen';
import { useMultiplayer } from '../utils/multiplayer';
import { GameStats, RingGameMode } from '../types';

// Simple Procedural Cloud Component
const SimpleCloud: React.FC<{ position: [number, number, number]; scale?: number; opacity?: number }> = React.memo(({ position, scale = 1, opacity = 0.6 }) => {
  return (
    <group position={new Vector3(...position)} scale={[scale, scale, scale]}>
      <mesh position={[0, 0, 0]}>
        <dodecahedronGeometry args={[8, 0]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={opacity} flatShading />
      </mesh>
      <mesh position={[6, -2, 2]} scale={0.7}>
        <dodecahedronGeometry args={[7, 0]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={opacity} flatShading />
      </mesh>
      <mesh position={[-6, 1, -2]} scale={0.8}>
        <dodecahedronGeometry args={[7, 0]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={opacity} flatShading />
      </mesh>
    </group>
  );
});

const Clouds = React.memo(() => (
  <>
    <SimpleCloud position={[-100, 80, -100]} scale={3} />
    <SimpleCloud position={[100, 60, 50]} scale={2.5} />
    <SimpleCloud position={[0, 120, 0]} scale={4} />
    <SimpleCloud position={[200, 90, -100]} scale={3} />
    <SimpleCloud position={[-150, 100, 150]} scale={3} />
    {/* Distant clouds for extended horizon */}
    <SimpleCloud position={[400, 150, 400]} scale={6} opacity={0.4} />
    <SimpleCloud position={[-400, 140, -400]} scale={6} opacity={0.4} />
    <SimpleCloud position={[400, 130, -400]} scale={6} opacity={0.4} />
    <SimpleCloud position={[-400, 160, 400]} scale={6} opacity={0.4} />
    {/* Far clouds */}
    <SimpleCloud position={[800, 200, 800]} scale={10} opacity={0.3} />
    <SimpleCloud position={[-800, 220, -500]} scale={10} opacity={0.3} />
  </>
));

// Navigation Arrow Component
const NavArrow = React.memo(({ birdPos, targetRef, colorTop = '#ffff00', colorBottom = '#ff0066' }: { birdPos: Vector3, targetRef: React.MutableRefObject<Vector3 | null>, colorTop?: string, colorBottom?: string }) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;

    if (!targetRef.current) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    // Position the arrow above the bird
    const arrowPos = birdPos.clone().add(new Vector3(0, 6, 0));
    groupRef.current.position.lerp(arrowPos, 0.2);

    // Make it look at the target
    groupRef.current.lookAt(targetRef.current);
  });

  // Gradient Shader Material
  const gradientMaterial = useMemo(() => ({
    uniforms: {
      colorTop: { value: new Color(colorTop) },
      colorBottom: { value: new Color(colorBottom) }
    },
    vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
    fragmentShader: `
          uniform vec3 colorTop;
          uniform vec3 colorBottom;
          varying vec2 vUv;
          void main() {
            // Mix from bottom (0) to top (1)
            vec3 color = mix(colorBottom, colorTop, vUv.y);
            // Output with high opacity
            gl_FragColor = vec4(color, 1.0);
          }
        `
  }), [colorTop, colorBottom]);

  return (
    <group ref={groupRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.5, 1.5, 4]} />
        <shaderMaterial attach="material" args={[gradientMaterial]} toneMapped={false} />
      </mesh>
    </group>
  );
});

// Waypoint Arrow to nearest Lobby
const LobbyArrow = React.memo(({ birdPos, portals }: { birdPos: Vector3, portals: any[] }) => {
  const groupRef = useRef<Group>(null);
  const targetRef = useRef<Vector3 | null>(null);

  useFrame((state) => {
    if (!groupRef.current) return;

    if (!portals || portals.length === 0) {
      groupRef.current.visible = false;
      return;
    }

    // Find closest portal
    let minDist = Infinity;
    let closestPortal = null;

    portals.forEach(p => {
      const pos = new Vector3(p.position[0], p.position[1], p.position[2]);
      const dist = pos.distanceTo(birdPos);
      if (dist < minDist) {
        minDist = dist;
        closestPortal = pos;
      }
    });

    if (closestPortal) {
      targetRef.current = closestPortal;
      groupRef.current.visible = true;

      // Position above bird
      const arrowPos = birdPos.clone().add(new Vector3(0, 8, 0));
      groupRef.current.position.lerp(arrowPos, 0.2);
      groupRef.current.lookAt(closestPortal);
    } else {
      groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.8, 2, 4]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
});

export const GameScene: React.FC = () => {
  const statsRef = useRef<GameStats>({
    score: 0,
    speed: 0,
    altitude: 0,
    isRingGameActive: false,
    ringGameMode: 'skyward',
    combo: 0,
    raceTimeRemaining: 0,
    raceRingsCollected: 0,
    currentMission: '',
    currentZoneLore: ''
  });

  // Initialize to 350 to match Bird.tsx spawn height, preventing sync issues on first frame
  const birdPosRef = useRef(new Vector3(0, 350, 0));
  const birdRotRef = useRef(new Quaternion());

  // Shared ref for target ring position (for the arrow)
  const targetRingRef = useRef<Vector3 | null>(null);
  const eggTargetRef = useRef<Vector3 | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [showBattleSelect, setShowBattleSelect] = useState(false);
  const [pendingRacePortalPosition, setPendingRacePortalPosition] = useState<[number, number, number] | null>(null);
  const [teleportTarget, setTeleportTarget] = useState<[number, number, number] | null>(null);
  const [teleportRotation, setTeleportRotation] = useState<[number, number, number, number] | null>(null);

  const audioRef = useRef<AudioHandle>(null);

  // Multiplayer
  const multiplayer = useMultiplayer();

  // Check if player is frozen (in lobby waiting)
  const isInLobby = multiplayer.lobby !== null && !multiplayer.inRace;

  const handleShowModeSelect = useCallback(() => {
    setShowModeSelect(true);
    document.exitPointerLock();

    // Store position for portal - spawn it higher and further forward so players don't fly in accidentally
    const pos = birdPosRef.current;
    const forward = new Vector3(0, 0, 1).applyQuaternion(birdRotRef.current);
    const portalPos = pos.clone()
      .add(forward.multiplyScalar(150))  // 150 units forward
      .add(new Vector3(0, 50, 0));       // 50 units higher
    setPendingRacePortalPosition([portalPos.x, portalPos.y, portalPos.z]);
  }, []);

  const handleModeSelect = useCallback((mode: RingGameMode | 'battle') => {
    if (statsRef.current) {
      if (mode === 'battle') {
        setShowBattleSelect(true);
        return;
      }

      if (mode === 'race' && pendingRacePortalPosition) {
        // Create a lobby instead of starting immediately
        multiplayer.createLobby(pendingRacePortalPosition, 'race');
        setShowModeSelect(false);
        // Teleport host to the portal position
        setTeleportTarget(pendingRacePortalPosition);
        return;
      }

      // For non-race modes, start immediately
      statsRef.current.ringGameMode = mode as RingGameMode;
      statsRef.current.isRingGameActive = true;
      setShowModeSelect(false);
      document.body.requestPointerLock();
      audioRef.current?.playGameStart();
    }
  }, [multiplayer, pendingRacePortalPosition]);

  const handleBattleStart = useCallback((type: 'deathmatch' | 'ctf') => {
    if (pendingRacePortalPosition) {
      multiplayer.createLobby(pendingRacePortalPosition, 'battle', type);
      setShowModeSelect(false);
      setShowBattleSelect(false);
      setTeleportTarget(pendingRacePortalPosition);
    }
  }, [multiplayer, pendingRacePortalPosition]);

  // Handle portal entry (joining someone else's lobby)
  const handleEnterPortal = useCallback((lobbyId: string) => {
    // Find the portal position and teleport there
    const portal = multiplayer.activePortals.find(p => p.lobbyId === lobbyId);
    if (portal) {
      setTeleportTarget(portal.position);
    }
    multiplayer.joinLobby(lobbyId);
  }, [multiplayer]);

  // Handle starting the race from lobby
  const handleStartRace = useCallback(() => {
    multiplayer.startRace();
  }, [multiplayer]);

  // Handle leaving the lobby
  const handleLeaveLobby = useCallback(() => {
    multiplayer.leaveLobby();
    setTeleportTarget(null); // Clear any teleport state
  }, [multiplayer]);

  // When race actually starts from lobby
  useEffect(() => {
    // Wait for BOTH inRace and raceStartPosition to be available before initializing
    if (multiplayer.inRace && !statsRef.current.isRingGameActive && multiplayer.raceStartPosition) {
      statsRef.current.ringGameMode = 'race';
      statsRef.current.isRingGameActive = true;
      document.body.requestPointerLock();
      audioRef.current?.playGameStart();

      // Teleport to race start position (in front of where the portal was)
      setTeleportTarget(multiplayer.raceStartPosition);
      // Force rotation to face +Z (same as RingManager's assumption)
      setTeleportRotation([0, 0, 0, 1]);

      // Clear teleport after a short delay so it doesn't interfere with gameplay
      setTimeout(() => {
        setTeleportTarget(null);
        setTeleportRotation(null);
      }, 500);
    }
  }, [multiplayer.inRace, multiplayer.raceStartPosition]);

  const handleBirdMove = useCallback((pos: Vector3) => {
    birdPosRef.current.copy(pos);

    // Send position to server
    multiplayer.updatePosition(
      [pos.x, pos.y, pos.z],
      [birdRotRef.current.x, birdRotRef.current.y, birdRotRef.current.z, birdRotRef.current.w]
    );
  }, [multiplayer]);

  // Handle game over (leave race)
  const handleGameOver = useCallback(() => {
    if (multiplayer.inRace) {
      multiplayer.leaveRace();
      // Ensure local state is cleared immediately when we decide to leave/end
      statsRef.current.isRingGameActive = false;
      statsRef.current.ringGameMode = 'skyward'; // Reset mode to default
      statsRef.current.raceRingsCollected = 0;
      statsRef.current.raceTimeRemaining = 0;
    }
  }, [multiplayer]);

  const handleRaceWin = useCallback(() => {
    if (multiplayer.inRace) {
      multiplayer.winRace();
      // Don't clear state here yet, wait for results screen? 
      // Actually we want to keep flying or stop? 
      // For now, let the victory screen handle the "Return to Lobby" which will clear state.
    }
  }, [multiplayer]);

  // Clean up when race ends (triggered by multiplayer hook state change)
  useEffect(() => {
    // If we are locally in race mode but multiplayer says race ended
    if (!multiplayer.inRace && statsRef.current.ringGameMode === 'race') {
      statsRef.current.isRingGameActive = false;
      statsRef.current.ringGameMode = 'skyward'; // Reset mode to default
      statsRef.current.raceRingsCollected = 0;
      statsRef.current.raceTimeRemaining = 0;
    }
  }, [multiplayer.inRace]);

  const handleCollect = useCallback(() => {
    statsRef.current.score += 1;
    audioRef.current?.playRingCollect();
  }, []);

  const handleFlap = useCallback(() => {
    audioRef.current?.playFlap();
  }, []);

  // Calculate speed multiplier from powerups
  const speedMultiplier = useMemo(() => {
    if (multiplayer.activePowerups.has('speedboost')) {
      const endTime = multiplayer.activePowerups.get('speedboost')!;
      if (endTime > Date.now()) return 1.5;
    }
    return 1.0;
  }, [multiplayer.activePowerups]); // activePowerups is a new Map on update

  // Update egg target
  useEffect(() => {
    if (multiplayer.battle?.mode === 'ctf' && multiplayer.battle.flag?.position) {
      // If I am carrying it, point to goal?
      // If someone else is carrying it, point to them?
      // If dropped, point to it.
      // For now, just point to flag position (which is updated on carrier move if we implemented that? 
      // Wait, server only updates flag position on Drop. 
      // If carried, flag position in battle state might be stale or null?
      // Server sends flag: { position, carrierId }.
      // CTF Nav Arrow Logic
      if (multiplayer.battle?.mode === 'ctf' && multiplayer.battle.flag) {
        const flag = multiplayer.battle.flag;
        const myTeam = multiplayer.battle.myTeam;

        if (flag.carrierId === multiplayer.playerId) {
          // I have the flag -> Point to Enemy Goal
          if (myTeam && flag.homeBase) {
            const targetBase = myTeam === 'red' ? flag.homeBase.blue : flag.homeBase.red;
            eggTargetRef.current = new Vector3(...targetBase);
          }
        } else if (flag.carrierId) {
          // Someone else has the flag
          const carrier = multiplayer.players.get(flag.carrierId);
          if (carrier) {
            // Point to carrier
            eggTargetRef.current = new Vector3(...carrier.position);
          }
        } else {
          // Flag is dropped/neutral -> Point to Flag
          eggTargetRef.current = new Vector3(...flag.position);
        }
      }
    } else {
      eggTargetRef.current = null;
    }
  }, [multiplayer.battle, multiplayer.players, multiplayer.playerId]);

  // Pointer Lock and Pause Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setIsPaused(prev => {
          const next = !prev;
          if (next) {
            document.exitPointerLock();
          }
          return next;
        });
      }
    };

    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;

      if (!isPaused && !document.pointerLockElement) {
        document.body.requestPointerLock();
      }
    };

    const handlePointerLockChange = () => {
      setIsPointerLocked(!!document.pointerLockElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    // Initial check
    setIsPointerLocked(!!document.pointerLockElement);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [isPaused]);

  return (
    <>
      <HUD
        statsRef={statsRef}
        multiplayer={{
          connected: multiplayer.connected,
          playerName: multiplayer.playerName,
          playerCount: multiplayer.players.size,
          inRace: multiplayer.inRace,
          raceParticipants: multiplayer.raceParticipants,
          score: multiplayer.playerScore,
          activePortals: multiplayer.activePortals,
          onJoinLobby: handleEnterPortal,
          battle: multiplayer.battle,
          projectiles: multiplayer.projectiles,
          pickups: multiplayer.pickups,
          shoot: multiplayer.shoot,
          reportHit: multiplayer.reportHit,
          respawn: multiplayer.respawn,
          collectPickup: multiplayer.collectPickup
        }}
      />
      <AudioController ref={audioRef} isPaused={isPaused} />

      {isPaused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white/10 p-10 rounded-3xl border border-white/20 text-center shadow-2xl backdrop-blur-md transform transition-all">
            <h2 className="text-5xl font-black text-white mb-10 tracking-wider drop-shadow-lg italic">PAUSED</h2>
            <div className="flex flex-col gap-4 w-64">
              <button
                onClick={() => {
                  setIsPaused(false);
                }}
                className="px-8 py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all transform hover:scale-105 hover:shadow-lg text-lg uppercase tracking-widest"
              >
                Resume
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-bold rounded-xl transition-all hover:border-white text-lg uppercase tracking-widest"
              >
                Restart
              </button>
            </div>
            <p className="mt-8 text-white/50 text-xs">Click anywhere to capture mouse cursor</p>
          </div>
        </div>
      )}

      {showModeSelect && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-gradient-to-b from-indigo-900 to-purple-900 p-12 rounded-3xl border border-white/20 text-center shadow-2xl transform transition-all max-w-3xl w-full">
            <h2 className="text-4xl font-black text-white mb-2 tracking-wider drop-shadow-lg italic">SELECT MODE</h2>
            <p className="text-blue-200 mb-8 text-lg">Choose your challenge</p>

            <div className="grid grid-cols-4 gap-4">
              <button
                onClick={() => handleModeSelect('mountain')}
                className="group relative overflow-hidden p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400 rounded-2xl transition-all text-left"
              >
                <div className="text-xl font-bold text-yellow-400 mb-2 group-hover:scale-105 transition-transform">MOUNTAIN</div>
                <div className="text-xs text-gray-300">Weave between treacherous mountain peaks.</div>
              </button>

              <button
                onClick={() => handleModeSelect('skyward')}
                className="group relative overflow-hidden p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400 rounded-2xl transition-all text-left"
              >
                <div className="text-xl font-bold text-cyan-400 mb-2 group-hover:scale-105 transition-transform">SKYWARD</div>
                <div className="text-xs text-gray-300">Soar through the clouds in a classic high-altitude test.</div>
              </button>

              <button
                onClick={() => handleModeSelect('race')}
                className="group relative overflow-hidden p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-green-400 rounded-2xl transition-all text-left"
              >
                <div className="text-xl font-bold text-green-400 mb-2 group-hover:scale-105 transition-transform">🏁 RACE</div>
                <div className="text-xs text-gray-300">Create a portal! Other birds can fly through to join.</div>
              </button>

              <button
                onClick={() => handleModeSelect('battle')}
                className="group relative overflow-hidden p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500 rounded-2xl transition-all text-left"
              >
                <div className="text-xl font-bold text-red-500 mb-2 group-hover:scale-105 transition-transform">⚔️ BATTLE</div>
                <div className="text-xs text-gray-300">PVP Combat! Deathmatch & CTF modes.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showBattleSelect && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-gradient-to-b from-red-900 to-rose-900 p-12 rounded-3xl border border-red-500/30 text-center shadow-2xl transform transition-all max-w-2xl w-full">
            <h2 className="text-4xl font-black text-white mb-2 tracking-wider drop-shadow-lg italic">BATTLE MODE</h2>
            <p className="text-red-200 mb-8 text-lg">Choose your battlefield</p>

            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={() => handleBattleStart('deathmatch')}
                className="group relative overflow-hidden p-6 bg-black/20 hover:bg-black/40 border border-red-500/30 hover:border-red-400 rounded-2xl transition-all text-left"
              >
                <div className="text-2xl font-bold text-red-400 mb-2 group-hover:scale-105 transition-transform">💀 DEATHMATCH</div>
                <div className="text-sm text-gray-300">Free for all. Last bird flying wins.</div>
              </button>

              <button
                onClick={() => handleBattleStart('ctf')}
                className="group relative overflow-hidden p-6 bg-black/20 hover:bg-black/40 border border-blue-500/30 hover:border-blue-400 rounded-2xl transition-all text-left"
              >
                <div className="text-2xl font-bold text-blue-400 mb-2 group-hover:scale-105 transition-transform">🚩 CAPTURE THE EGG</div>
                <div className="text-sm text-gray-300">Team based. Steal the enemy egg and bring it home.</div>
              </button>
            </div>

            <button
              onClick={() => setShowBattleSelect(false)}
              className="mt-8 text-white/50 hover:text-white text-sm underline"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Race Lobby Waiting Screen */}
      {multiplayer.lobby && !multiplayer.inRace && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-green-900 to-emerald-900 p-10 rounded-3xl border border-green-500/30 text-center shadow-2xl max-w-lg w-full">
            {multiplayer.lobby.countdown !== null ? (
              // Countdown display
              <div className="py-10">
                <div className="text-8xl font-black text-white animate-pulse">
                  {multiplayer.lobby.countdown}
                </div>
                <div className="text-2xl text-green-300 mt-4">Race starting...</div>
              </div>
            ) : (
              <>
                <h2 className="text-3xl font-black text-white mb-2 tracking-wider">
                  {multiplayer.lobby.isHost ? '🏁 YOUR RACE LOBBY' : '🏁 RACE LOBBY'}
                </h2>
                <p className="text-green-300 mb-6">
                  {multiplayer.lobby.isHost
                    ? 'A portal has appeared! Wait for others to join.'
                    : `Joined ${multiplayer.lobby.players.find(p => p.isHost)?.name}'s race`
                  }
                </p>

                {/* Player list */}
                <div className="bg-black/30 rounded-xl p-4 mb-6">
                  <div className="text-sm text-green-400 uppercase tracking-widest mb-3">Players ({multiplayer.lobby.players.length})</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {multiplayer.lobby.players.map(player => (
                      <div
                        key={player.id}
                        className={`flex items-center justify-between p-2 rounded-lg ${player.id === multiplayer.playerId ? 'bg-green-800/50' : 'bg-black/20'
                          }`}
                      >
                        <span className="text-white font-medium">
                          {player.isHost && '👑 '}{player.name}
                          {player.id === multiplayer.playerId && ' (you)'}
                        </span>
                        <span className={`text-sm ${player.ready ? 'text-green-400' : 'text-gray-400'}`}>
                          {player.ready ? '✓ Ready' : 'Waiting...'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center">
                  {multiplayer.lobby.isHost ? (
                    <button
                      onClick={handleStartRace}
                      disabled={multiplayer.lobby.players.length < 1}
                      className="px-8 py-4 bg-green-500 hover:bg-green-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded-xl transition-all transform hover:scale-105 text-lg uppercase tracking-widest"
                    >
                      Start Race!
                    </button>
                  ) : (
                    <button
                      onClick={() => multiplayer.setReady(!multiplayer.lobby?.players.find(p => p.id === multiplayer.playerId)?.ready)}
                      className="px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition-all transform hover:scale-105 text-lg uppercase tracking-widest"
                    >
                      {multiplayer.lobby.players.find(p => p.id === multiplayer.playerId)?.ready ? 'Not Ready' : 'Ready!'}
                    </button>
                  )}
                  <button
                    onClick={handleLeaveLobby}
                    className="px-8 py-4 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-bold rounded-xl transition-all text-lg uppercase tracking-widest"
                  >
                    Leave
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {multiplayer.raceResults && (
        <VictoryScreen
          results={multiplayer.raceResults.map(r => ({ ...r, isLocal: r.id === multiplayer.playerId }))}
          onClose={() => multiplayer.clearRaceResults()}
        />
      )}

      {!isPaused && !isPointerLocked && !showModeSelect && !multiplayer.raceResults && !/Mobi|Android/i.test(navigator.userAgent) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm px-8 py-4 rounded-full border border-white/10 text-white font-bold tracking-widest animate-pulse">
            CLICK TO CAPTURE MOUSE CURSOR
          </div>
        </div>
      )}

      <Canvas shadows dpr={[1, 2]} camera={{ fov: 60, far: 4000 }}>
        <color attach="background" args={['#87CEEB']} />
        {/* Increased fog distance for larger world feel */}
        <fog attach="fog" args={['#87CEEB', 500, 3500]} />

        <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} distance={450000} />
        <Stars radius={5000} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <ambientLight intensity={0.4} color="#ccccff" />
        <directionalLight
          position={[100, 100, 50]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
          color="#fff0dd"
        />

        <Clouds />

        <World birdPosition={birdPosRef.current} />
        <AmbientBirds isPaused={isPaused || showModeSelect} />

        <Bird
          statsRef={statsRef}
          onMove={handleBirdMove}
          isPaused={isPaused || showModeSelect}
          playFlapSound={handleFlap}
          rotationRef={birdRotRef}
          teleportTarget={teleportTarget}
          teleportRotation={teleportRotation}
          frozen={isInLobby}
          raceStartPosition={multiplayer.inRace ? multiplayer.raceStartPosition : null}
          speedMultiplier={speedMultiplier}
          disableClickToFlap={multiplayer.battle?.isActive}
        />

        <Collectibles
          birdPosition={birdPosRef.current}
          onCollect={handleCollect}
          isPaused={isPaused || showModeSelect}
        />

        {!multiplayer.battle?.isActive && (
          <RingManager
            birdPosition={birdPosRef.current}
            birdRotation={birdRotRef.current}
            statsRef={statsRef}
            audioRef={audioRef}
            isPaused={isPaused || showModeSelect}
            targetRingRef={targetRingRef}
            onShowModeSelect={handleShowModeSelect}
            onGameOver={handleGameOver}
            onRaceWin={handleRaceWin}
            onCheckpoint={multiplayer.updateCheckpoint}
            raceStartPosition={multiplayer.raceStartPosition}
            raceSeed={multiplayer.raceSeed}
            clearRings={isInLobby}
          />
        )}

        <WaterEffects
          birdPosRef={birdPosRef}
          isPaused={isPaused || showModeSelect}
        />

        <BattleManager
          birdPosition={birdPosRef.current}
          birdRotation={birdRotRef.current}
          myPlayerId={multiplayer.playerId}
          battle={multiplayer.battle}
          players={multiplayer.players}
          projectiles={multiplayer.projectiles}
          pickups={multiplayer.pickups}
          activePowerups={multiplayer.activePowerups}
          onShoot={multiplayer.shoot}
          onCollectPickup={multiplayer.collectPickup}
          onPickupFlag={multiplayer.pickupFlag}
          onStealFlag={multiplayer.stealFlag}
          onScore={multiplayer.score}
          isPaused={isPaused || showModeSelect}
        />

        {!multiplayer.battle?.isActive && (
          <NavArrow birdPos={birdPosRef.current} targetRef={targetRingRef} />
        )}
        <NavArrow birdPos={birdPosRef.current} targetRef={eggTargetRef} colorTop="#ffffff" colorBottom="#ffcc00" />

        {/* Lobby Waypoint Arrow */}
        {!multiplayer.inRace && !isInLobby && (
          <LobbyArrow birdPos={birdPosRef.current} portals={multiplayer.activePortals} />
        )}

        {/* Other multiplayer birds */}
        <OtherPlayers
          players={multiplayer.players}
          localPlayerId={multiplayer.playerId}
          battle={multiplayer.battle}
        />

        {/* Race portals from other players' lobbies */}
        <RacePortals
          portals={multiplayer.activePortals}
          birdPosition={birdPosRef.current}
          onEnterPortal={handleEnterPortal}
          localLobbyId={multiplayer.lobby?.lobbyId || null}
        />

        <EffectComposer disableNormalPass={true}>
          <Bloom luminanceThreshold={0.5} mipmapBlur intensity={0.5} radius={0.6} />
          <Vignette eskil={false} offset={0.1} darkness={0.5} />
        </EffectComposer>

      </Canvas>
    </>
  );
};
