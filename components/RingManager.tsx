
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Euler, Color, Object3D } from 'three';
import { RingData, GameStats } from '../types';
import { AudioHandle } from './AudioController';
import { noise2D } from '../utils/noise';
import { SeededRNG } from '../utils/rng';
import { getTerrainHeight } from '../utils/terrain';
import { useControls } from '../utils/controls';

interface RingManagerProps {
    birdPosition: Vector3;
    birdRotation: Quaternion;
    statsRef: React.MutableRefObject<GameStats>;
    audioRef: React.RefObject<AudioHandle>;
    isPaused: boolean;
    targetRingRef: React.MutableRefObject<Vector3 | null>;
    onShowModeSelect: () => void;
    onGameOver?: () => void;
    onRaceWin?: () => void;
    onCheckpoint?: (checkpoints: number) => void;
    raceStartPosition?: [number, number, number] | null;
    raceSeed?: number | null;
    clearRings?: boolean;
}

const RING_GAP = 80;
const RING_RADIUS_NORMAL = 8;
const RING_RADIUS_SMALL = 5;
const COOLDOWN_PERIOD = 10.0; // Seconds
const MAX_SPAWN_SPEED = 1.5;

// Race mode settings
const RACE_BASE_GAP = 80;           // Starting distance between rings
const RACE_GAP_INCREMENT = 8;       // How much farther each ring gets
const RACE_MAX_GAP = 180;           // Maximum distance cap (reached around ring 12-13)
const RACE_TIME_PER_DISTANCE = 0.08; // Seconds per unit of distance
const RACE_BASE_TIME_BONUS = 3.0;   // Base seconds for each ring
const RACE_FIRST_RING_TIME = 30.0;   // Time to reach the first ring
const RACE_TOTAL_RINGS = 20;

// Reusable dummy for calculations
const dummyObj = new Object3D();

// Race Line Component
const RaceLine = React.memo(({ rings }: { rings: RingData[] }) => {
    // Only draw lines between active or upcoming rings
    const points = useMemo(() => {
        // Filter passed rings that are far behind? No, keep path visible for context or just next few?
        // Let's draw the full path of current rings
        // But the rings array only holds *active* rings in the manager's view (some might be culled)
        // Wait, ringsRef/rings state in Manager holds ~20 rings.
        return rings.map(r => new Vector3(...r.position));
    }, [rings]);

    if (points.length < 2) return null;

    return (
        <line>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={points.length}
                    array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
                    itemSize={3}
                />
            </bufferGeometry>
            <lineBasicMaterial color="#ffff00" opacity={0.5} transparent linewidth={2} />
        </line>
    );
});

export const RingManager: React.FC<RingManagerProps> = React.memo(({ birdPosition, birdRotation, statsRef, audioRef, isPaused, targetRingRef, onShowModeSelect, onGameOver, onRaceWin, onCheckpoint, raceStartPosition, raceSeed, clearRings }) => {
    const controls = useControls();
    // State
    const [rings, setRings] = useState<RingData[]>([]);

    // Internal refs for logic to avoid re-renders
    const ringsRef = useRef<RingData[]>([]);
    const gameActive = useRef(false);
    const nextRingId = useRef(0);
    const resetProcessed = useRef(false);
    const spawnCount = useRef(0);
    const lastSpawnTime = useRef(-100); // Allow immediate spawn at start
    const rngRef = useRef<SeededRNG>(new SeededRNG(123)); // Default seed

    // Handle external clear signal (e.g. entering lobby)
    useEffect(() => {
        if (clearRings) {
            ringsRef.current = [];
            setRings([]);
            gameActive.current = false;
            statsRef.current.isRingGameActive = false;
        }
    }, [clearRings]);

    // Race mode state
    const raceStartTime = useRef(0);
    const lastRaceUpdateTime = useRef(0);
    const raceCurrentGap = useRef(RACE_BASE_GAP);

    // Path generation state
    const pathCursor = useRef(new Vector3());
    const pathDirection = useRef(new Vector3(0, 0, 1));
    const pathNoiseOffset = useRef(0);

    // Helper to create a ring
    const spawnRing = (pos: Vector3, dir: Vector3, type: RingData['type'], forceHeight: boolean = false) => {
        // Ensure strictly above water (water level is 10) and Terrain
        const tH = getTerrainHeight(pos.x, pos.z);
        const safeY = Math.max(tH, 10) + 25; // Minimum clearance

        if (!forceHeight && pos.y < safeY) pos.y = safeY;

        // Fix Orientation: Make the ring look at the direction of travel so the hole aligns with it.
        dummyObj.position.copy(pos);
        dummyObj.lookAt(pos.clone().add(dir));
        // Torus geometry is in XY plane (hole along Z). lookAt aligns Z to target. Perfect.

        const newRing: RingData = {
            id: nextRingId.current++,
            position: [pos.x, pos.y, pos.z],
            rotation: [dummyObj.rotation.x, dummyObj.rotation.y, dummyObj.rotation.z],
            type: type,
            active: true,
            scale: type === 'small' ? 0.6 : 1.0,
            passed: false
        };

        ringsRef.current.push(newRing);
        setRings([...ringsRef.current]);
    };

    // Initialize Starter Ring
    const spawnStarterRing = () => {
        // Spawn directly in front of the bird
        const forward = new Vector3(0, 0, 1).applyQuaternion(birdRotation).normalize();

        // Ensure it is reasonably close so the player can see it immediately
        const dist = 200;

        const startPos = birdPosition.clone().add(forward.multiplyScalar(dist));

        // Ensure it's not underground or underwater
        const tH = getTerrainHeight(startPos.x, startPos.z);
        const safeY = Math.max(tH, 10) + 30;

        if (startPos.y < safeY) startPos.y = safeY;

        // Clear existing
        ringsRef.current = [];
        nextRingId.current = 0;

        spawnRing(startPos, forward, 'starter');
    };

    const endGame = (time: number) => {
        gameActive.current = false;
        statsRef.current.isRingGameActive = false;
        statsRef.current.combo = 0;
        audioRef.current?.playGameOver();

        // Clear rings and set last spawn time to now, enforcing the cooldown
        ringsRef.current = [];
        setRings([]);
        lastSpawnTime.current = time;
        
        // Notify multiplayer of game over
        onGameOver?.();
    };

    useFrame((state, delta) => {
        if (isPaused) return;
        const time = state.clock.getElapsedTime();

                // Handle Reset
        if (controls.current.reset) {
            if (!resetProcessed.current) {
                resetProcessed.current = true;

                // If in race mode, DO NOT reset game state completely, just respawn bird at start
                if (statsRef.current.ringGameMode === 'race' && raceStartPosition) {
                    // Reset race progress locally? No, that would be cheating/confusing if checkpoints are server tracked
                    // Actually user requested "start them at the beginning of the race"
                    // This implies resetting progress? Or just position?
                    // Usually in racing games "respawn" puts you at last checkpoint.
                    // But "Reset" might mean restart level.
                    // Given the query "start them at the beginning of the race", it likely means full restart of position.
                    // But if we reset rings, we desync from server race state?
                    // Server tracks checkpoints.
                    
                    // Let's assume "Reset Position to Start" but keep race active.
                    // However, if they fly back to start, they can't re-collect rings they already got?
                    // Or maybe they want to restart the run?
                    // If others are racing, restarting run puts you at disadvantage.
                    
                    // IMPORTANT: The query says "start them at the beginning of the race".
                    // This aligns with Bird.tsx reset logic.
                    // We should probably NOT clear rings if we want them to continue racing from start?
                    // OR if they want to retry, maybe we should clear collected rings?
                    // But `ringsRef` state is local.
                    // Let's reset local rings so they can try again.
                    // But checkpoints are server authoritative.
                    
                    // Simplest interpretation: Visual reset.
                    // To support "re-flying" the race, we need to regenerate the rings.
                    
                    // Reset Rings to initial state
                    ringsRef.current = [];
                    nextRingId.current = 0;
                    pathCursor.current.set(raceStartPosition[0], raceStartPosition[1], raceStartPosition[2]);
                    pathDirection.current.set(0, 0, 1);
                    if (raceSeed) {
                        rngRef.current = new SeededRNG(raceSeed);
                        pathNoiseOffset.current = (raceSeed % 1000) / 10.0;
                    }
                    
                    // Spawn first ring again
                    const firstRingPos = pathCursor.current.clone().add(new Vector3(0, 0, 40));
                    pathCursor.current.copy(firstRingPos);
                    spawnRing(firstRingPos, pathDirection.current, 'normal', true);
                    spawnCount.current = 1;
                    
                    // Reset local stats
                    statsRef.current.raceRingsCollected = 0;
                    statsRef.current.combo = 0;
                    
                    // Notify server of reset? 
                    // Ideally we should send checkpoint 0 update.
                    onCheckpoint?.(0);
                    
                    setRings([...ringsRef.current]);
                    lastSpawnTime.current = time;
                    
                } else {
                    // Standard Mode Reset
                    gameActive.current = false;
                    statsRef.current.isRingGameActive = false;
                    statsRef.current.combo = 0;
                    spawnCount.current = 0;

                    // Clear rings
                    ringsRef.current = [];

                    // Force spawn starter ring at fixed start position
                    const resetStartPos = new Vector3(0, 350, 200);
                    const resetForward = new Vector3(0, 0, 1);

                    nextRingId.current = 0;
                    spawnRing(resetStartPos, resetForward, 'starter');
                    setRings([...ringsRef.current]);
                    lastSpawnTime.current = time;
                }
            }
            // While reset is held, do not process other logic
            return;
        } else {
            resetProcessed.current = false;
        }

        // Sync gameActive ref with stats (handled by GameScene for mode select)
        if (statsRef.current.isRingGameActive && !gameActive.current) {
            gameActive.current = true;
            spawnCount.current = 0;
            
                // Initialize race mode
                if (statsRef.current.ringGameMode === 'race') {
                    raceStartTime.current = time;
                    lastRaceUpdateTime.current = time;
                    raceCurrentGap.current = RACE_BASE_GAP;
                    statsRef.current.raceTimeRemaining = RACE_FIRST_RING_TIME;
                    statsRef.current.raceRingsCollected = 0;
                    
                    // Clear any existing rings
                    ringsRef.current = [];
                    nextRingId.current = 0;
                    
                    // Initialize Seeded RNG if raceSeed provided
                    if (raceSeed) {
                        rngRef.current = new SeededRNG(raceSeed);
                    }
                    
                    // Set path cursor to race start position if available
                    if (raceStartPosition) {
                        // Set cursor exactly to start position
                        pathCursor.current.set(raceStartPosition[0], raceStartPosition[1], raceStartPosition[2]);
                        
                        // Reset direction to face +Z
                        pathDirection.current.set(0, 0, 1); 
                        // Use seed for deterministic path noise
                        pathNoiseOffset.current = raceSeed ? (raceSeed % 1000) / 10.0 : Math.random() * 100;
                        
                        // Calculate first ring position: 40 units DIRECTLY ahead (+Z)
                        // No noise, no fancy math, just straight ahead
                        const firstRingPos = pathCursor.current.clone().add(new Vector3(0, 0, 40));
                        
                        // Update cursor to this new position so next rings continue from here
                        pathCursor.current.copy(firstRingPos);

                        spawnRing(firstRingPos, pathDirection.current, 'normal', true);
                        spawnCount.current = 1;
                    } else {
                        // Fallback to bird position
                        pathCursor.current.copy(birdPosition);
                        pathDirection.current.set(0, 0, 1).applyQuaternion(birdRotation).normalize();
                    }
                    
                    setRings([...ringsRef.current]);
                }
            }
        
        // Race mode timer tick
        if (gameActive.current && statsRef.current.ringGameMode === 'race') {
            const elapsed = time - lastRaceUpdateTime.current;
            lastRaceUpdateTime.current = time;
            statsRef.current.raceTimeRemaining -= elapsed;
            
            // End race when time runs out
            if (statsRef.current.raceTimeRemaining <= 0) {
                statsRef.current.raceTimeRemaining = 0;
                endGame(time);
            }
        }



        // 1. Init logic (Only if empty and not active - usually for initial load or after miss)
        if (ringsRef.current.length === 0 && !gameActive.current) {
            const now = state.clock.getElapsedTime();
            const timeSinceLastSpawn = now - lastSpawnTime.current;
            const currentSpeed = statsRef.current.speed;
            if (timeSinceLastSpawn > COOLDOWN_PERIOD && currentSpeed < MAX_SPAWN_SPEED) {
                spawnStarterRing();
                lastSpawnTime.current = now;
            }
        }

        // 2. Update Target Ref for Arrow
        const targetRing = ringsRef.current.find(r => !r.passed);
        if (targetRing) {
            // Calculate exact target position (handling moving rings)
            let pos = new Vector3(...targetRing.position);
            if (targetRing.type === 'moving') {
                const offset = Math.sin(time * 0.1 + targetRing.id) * 25;
                const up = new Vector3(0, 1, 0).applyEuler(new Euler(...targetRing.rotation));
                pos.add(up.multiplyScalar(offset));
            }

            if (!targetRingRef.current) targetRingRef.current = new Vector3();
            targetRingRef.current.copy(pos);
        } else {
            targetRingRef.current = null;
        }

        // 3. Path Generation (Only if active)
        if (gameActive.current) {
            const uncollectedCount = ringsRef.current.filter(r => !r.passed).length;

            // In race mode, only spawn one ring at a time with increasing gap
            const maxUncollected = statsRef.current.ringGameMode === 'race' ? 1 : 10;

            if (uncollectedCount < maxUncollected) {
                pathNoiseOffset.current += 0.1;

                // Ramp up noise intensity to ensure path starts straight relative to player
                const noiseIntensity = Math.min(1.0, spawnCount.current / 6.0);

                const yawTurn = noise2D(pathNoiseOffset.current, 0) * 2.0 * noiseIntensity;
                const pitchTurn = noise2D(0, pathNoiseOffset.current) * 1.5 * noiseIntensity;

                const turnQ = new Quaternion().setFromEuler(new Euler(pitchTurn * 0.5, yawTurn * 0.5, 0));
                pathDirection.current.applyQuaternion(turnQ).normalize();

                if (Math.abs(pathCursor.current.x) > 2000) pathDirection.current.x *= -1;
                if (Math.abs(pathCursor.current.z) > 2000) pathDirection.current.z *= -1;
                if (pathCursor.current.y < 50) pathDirection.current.y += 0.2;
                if (pathCursor.current.y > 300) pathDirection.current.y -= 0.2;
                pathDirection.current.normalize();

                // Use increasing gap for race mode
                const currentGap = statsRef.current.ringGameMode === 'race' ? raceCurrentGap.current : RING_GAP;

                // Move cursor forward by gap amount
                pathCursor.current.add(pathDirection.current.clone().multiplyScalar(currentGap));
                
                // Note: Removed the double-add that was causing gaps to be 2x intended size
                // pathCursor.current.add(pathDirection.current.clone().multiplyScalar(currentGap));

                // TERRAIN AVOIDANCE & MOUNTAIN MODE LOGIC
                const tH = getTerrainHeight(pathCursor.current.x, pathCursor.current.z);

                let targetY = pathCursor.current.y;

                if (statsRef.current.ringGameMode === 'mountain') {
                    // Mountain Mode: Hug the terrain + 30
                    const mountainTarget = tH + 30;
                    // Smoothly pull towards mountain target
                    targetY = targetY * 0.8 + mountainTarget * 0.2;

                    // Ensure we don't go underground
                    const safeY = Math.max(tH, 10) + 25;
                    if (targetY < safeY) targetY = safeY;

                    pathCursor.current.y = targetY;

                    // Bias direction to follow terrain slope roughly
                    if (pathCursor.current.y < tH + 50) {
                        pathDirection.current.y += 0.1; // Pitch up if too low
                    } else if (pathCursor.current.y > tH + 100) {
                        pathDirection.current.y -= 0.1; // Pitch down if too high
                    }

                } else {
                    // Skyward Mode (Default): Just avoid terrain
                    const safeY = Math.max(tH, 10) + 40; // Clearance
                    if (pathCursor.current.y < safeY) {
                        pathCursor.current.y = safeY;
                        // Pitch up to avoid getting stuck dragging along the ground
                        pathDirection.current.y = Math.abs(pathDirection.current.y) + 0.3;
                        pathDirection.current.normalize();
                    }
                }

                const rand = statsRef.current.ringGameMode === 'race' ? rngRef.current.next() : Math.random();
                let type: RingData['type'] = 'normal';
                if (rand > 0.7) type = 'small';
                if (rand > 0.9) type = 'moving';

                spawnRing(pathCursor.current, pathDirection.current, type);
                spawnCount.current++;
            }
        }

        // 4. Collision & Miss Logic
        const birdPos = birdPosition;
        let dirty = false;

        if (targetRing) {
            // Recalculate dynamic position for collision check
            const ringPos = new Vector3(...targetRing.position);
            if (targetRing.type === 'moving') {
                // Match visual oscillation
                const offset = Math.sin(time * 0.1 + targetRing.id) * 25;
                const up = new Vector3(0, 1, 0).applyEuler(new Euler(...targetRing.rotation));
                ringPos.add(up.multiplyScalar(offset));
            }

            const distSq = birdPos.distanceToSquared(ringPos);

            let hitRadius = RING_RADIUS_NORMAL;
            if (targetRing.type === 'small') hitRadius = RING_RADIUS_SMALL;
            if (targetRing.type === 'starter') hitRadius = 12;

            if (distSq < hitRadius * hitRadius) {
                // HIT!
                targetRing.passed = true;
                targetRing.active = false;
                dirty = true;

                if (targetRing.type === 'starter') {
                    // Trigger Mode Selection instead of immediate start
                    onShowModeSelect();

                    // Prepare path cursor but don't start game active state yet
                    pathCursor.current.copy(ringPos);
                    pathDirection.current.set(0, 0, 1).applyQuaternion(birdRotation).normalize();
                    pathNoiseOffset.current = Math.random() * 100;

                } else {
                    audioRef.current?.playRingCollect();
                    statsRef.current.score += 1;
                    statsRef.current.combo += 1;

                    if (targetRing.type === 'small') statsRef.current.score += 1;
                    if (targetRing.type === 'moving') statsRef.current.score += 2;
                    
                    // Race mode: track rings collected and calculate time for next ring
                    if (statsRef.current.ringGameMode === 'race') {
                        statsRef.current.raceRingsCollected += 1;
                        
                        // Notify multiplayer of checkpoint
                        onCheckpoint?.(statsRef.current.raceRingsCollected);
                        
                        // Check for WIN
                        if (statsRef.current.raceRingsCollected >= RACE_TOTAL_RINGS) {
                            statsRef.current.isRingGameActive = false;
                            gameActive.current = false;
                            onRaceWin?.();
                        } else {
                            // Increase gap for next ring (capped at max)
                            raceCurrentGap.current = Math.min(raceCurrentGap.current + RACE_GAP_INCREMENT, RACE_MAX_GAP);
                            
                            // Calculate time for next ring based on distance
                            const nextRingTime = RACE_BASE_TIME_BONUS + (raceCurrentGap.current * RACE_TIME_PER_DISTANCE);
                            statsRef.current.raceTimeRemaining = nextRingTime;
                            lastRaceUpdateTime.current = time;
                        }
                    }
                }

            } else if (distSq > 400 * 400) {
                // In race mode, disable distance despawning
                if (gameActive.current && statsRef.current.ringGameMode === 'race') {
                    return;
                }

                // MISS (Too far away)
                targetRing.passed = true;
                if (gameActive.current) {
                    // In race mode, missing doesn't end the game - only time running out does
                    // In other modes, game over on miss
                    if (statsRef.current.ringGameMode !== 'race') {
                    endGame(time);
                    } else {
                        // Reset combo on miss in race mode
                        statsRef.current.combo = 0;
                        dirty = true;
                    }
                } else {
                    // Only respawn if cooldown passed AND speed is low enough
                    const now = state.clock.getElapsedTime();
                    const timeSinceLastSpawn = now - lastSpawnTime.current;
                    const currentSpeed = statsRef.current.speed;

                    if (timeSinceLastSpawn > COOLDOWN_PERIOD && currentSpeed < MAX_SPAWN_SPEED) {
                        spawnStarterRing();
                        lastSpawnTime.current = now;
                        dirty = true;
                    } else {
                        // Clear rings so init logic can retry when ready
                        ringsRef.current = [];
                        dirty = true;
                    }
                }
            }
        }

        // Cleanup
        if (ringsRef.current.length > 20) {
            const passedCount = ringsRef.current.filter(r => r.passed).length;
            if (passedCount > 5) {
                ringsRef.current.shift();
                dirty = true;
            }
        }

        if (dirty) {
            setRings([...ringsRef.current]);
        }
    });

    return (
        <group>
            {rings.map((ring) => (
                <RingMesh
                    key={ring.id}
                    data={ring}
                    isNext={!ring.passed && ring.id === rings.find(r => !r.passed)?.id}
                />
            ))}
            {/* Draw Race Line connecting the rings */}
            {statsRef.current.ringGameMode === 'race' && <RaceLine rings={rings} />}
        </group>
    );
});

const RingMesh = React.memo(({ data, isNext }: { data: RingData, isNext: boolean }) => {
    const ref = useRef<any>(null);

    useFrame((state) => {
        if (!ref.current) return;
        if (data.passed && !data.active) {
            ref.current.visible = false;
            return;
        }

        if (data.type === 'starter') {
            ref.current.rotation.z += 0.02;
            const scale = 1.0 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
            ref.current.scale.set(scale, scale, scale);
        }

        if (data.type === 'moving') {
            // Much slower frequency (0.1) for very gentle movement
            const yOffset = Math.sin(state.clock.elapsedTime * 0.1 + data.id) * 25;
            ref.current.position.y = yOffset;
        }

        if (isNext && data.type !== 'starter') {
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.1;
            ref.current.scale.set(data.scale * pulse, data.scale * pulse, data.scale * pulse);
        }
    });

    const color = useMemo(() => {
        if (data.type === 'starter') return '#ffff00';
        if (data.type === 'small') return '#00ffff';
        if (data.type === 'moving') return '#ff3333';
        return '#ffcc00';
    }, [data.type]);

    return (
        <group position={data.position} rotation={data.rotation}>
            <mesh ref={ref} scale={data.scale}>
                <torusGeometry args={[6, 0.5, 16, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={isNext ? 2.0 : 0.5}
                    toneMapped={false}
                />
            </mesh>
            {isNext && (
                <pointLight position={data.position} color={color} intensity={2} distance={20} />
            )}
        </group>
    );
});
