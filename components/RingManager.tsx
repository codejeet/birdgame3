
import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Euler, Color, Object3D } from 'three';
import { RingData, GameStats } from '../types';
import { AudioHandle } from './AudioController';
import { noise2D } from '../utils/noise';
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
}

const RING_GAP = 80;
const RING_RADIUS_NORMAL = 8;
const RING_RADIUS_SMALL = 5;
const COOLDOWN_PERIOD = 10.0; // Seconds
const MAX_SPAWN_SPEED = 1.5;

// Reusable dummy for calculations
const dummyObj = new Object3D();

export const RingManager: React.FC<RingManagerProps> = React.memo(({ birdPosition, birdRotation, statsRef, audioRef, isPaused, targetRingRef, onShowModeSelect }) => {
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

    // Path generation state
    const pathCursor = useRef(new Vector3());
    const pathDirection = useRef(new Vector3(0, 0, 1));
    const pathNoiseOffset = useRef(0);

    // Helper to create a ring
    const spawnRing = (pos: Vector3, dir: Vector3, type: RingData['type']) => {
        // Ensure strictly above water (water level is 10) and Terrain
        const tH = getTerrainHeight(pos.x, pos.z);
        const safeY = Math.max(tH, 10) + 25; // Minimum clearance

        if (pos.y < safeY) pos.y = safeY;

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
    };

    useFrame((state, delta) => {
        if (isPaused) return;
        const time = state.clock.getElapsedTime();

        // Handle Reset
        if (controls.current.reset) {
            if (!resetProcessed.current) {
                resetProcessed.current = true;

                // Reset Game State
                gameActive.current = false;
                statsRef.current.isRingGameActive = false;
                statsRef.current.combo = 0;
                spawnCount.current = 0;

                // Clear rings
                ringsRef.current = [];

                // Force spawn starter ring at fixed start position aligned with Bird.tsx reset
                // Bird resets to (0, 350, 0) facing +Z
                const resetStartPos = new Vector3(0, 350, 200);
                const resetForward = new Vector3(0, 0, 1);

                nextRingId.current = 0;
                spawnRing(resetStartPos, resetForward, 'starter');
                setRings([...ringsRef.current]);
                lastSpawnTime.current = time;
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

            if (uncollectedCount < 10) {
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

                pathCursor.current.add(pathDirection.current.clone().multiplyScalar(RING_GAP));

                pathCursor.current.add(pathDirection.current.clone().multiplyScalar(RING_GAP));

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

                const rand = Math.random();
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
                }

            } else if (distSq > 200 * 200) {
                // MISS (Too far away)
                targetRing.passed = true;
                if (gameActive.current) {
                    // Game Over immediately on miss
                    endGame(time);
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
