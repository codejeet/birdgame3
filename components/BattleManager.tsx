import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Group, Color, DoubleSide, AdditiveBlending } from 'three';
import { Projectile, BattlePickup, BattleState, RemotePlayer } from '../types';

interface BattleManagerProps {
    birdPosition: Vector3;
    birdRotation: Quaternion;
    myPlayerId: string | null;
    battle: BattleState | null;
    players: Map<string, RemotePlayer>;
    projectiles: Projectile[];
    pickups: BattlePickup[];
    activePowerups: Map<string, number>;
    onShoot: (position: [number, number, number], velocity: [number, number, number], type: 'normal' | 'explosive') => void;
    onCollectPickup: (pickupId: string) => void;
    onPickupFlag: () => void;
    onStealFlag: (targetId: string) => void;
    onScore: () => void;
    isPaused: boolean;
}

const ProjectileMesh = React.memo(({ projectile }: { projectile: Projectile }) => {
    const meshRef = useRef<Group>(null);
    const [pos, setPos] = useState(new Vector3(...projectile.position));

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // Simple physics: pos += velocity * delta
        const velocity = new Vector3(...projectile.velocity);
        pos.add(velocity.clone().multiplyScalar(delta));

        meshRef.current.position.copy(pos);
        meshRef.current.lookAt(pos.clone().add(velocity));
    });

    return (
        <group ref={meshRef} position={pos}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.2, 1, 8]} />
                <meshStandardMaterial color="yellow" emissive="orange" emissiveIntensity={2} />
            </mesh>
        </group>
    );
});

const PickupMesh = React.memo(({ pickup }: { pickup: BattlePickup }) => {
    const meshRef = useRef<Group>(null);

    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.y += 0.02;
        meshRef.current.position.y = pickup.position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.5;
    });

    const color = pickup.type === 'health' ? 'green' : pickup.type === 'ammo' ? 'yellow' : 'purple';

    return (
        <group ref={meshRef} position={new Vector3(...pickup.position)}>
            <mesh>
                <boxGeometry args={[2, 2, 2]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
            {/* Glow */}
            <pointLight color={color} distance={10} intensity={1} />
        </group>
    );
});

const FlagMesh = React.memo(({ position, carrierId, players, birdPosition, myTeam }: { position?: [number, number, number], carrierId?: string | null, players: Map<string, RemotePlayer>, birdPosition: Vector3, myTeam?: 'red' | 'blue' }) => {
    const meshRef = useRef<Group>(null);
    const [color, setColor] = useState('white');

    useFrame((state) => {
        if (!meshRef.current) return;

        let targetPos = new Vector3(0, 0, 0);
        let newColor = 'white';

        if (carrierId) {
            // Attached to player
            if (players.has(carrierId)) {
                const p = players.get(carrierId);
                if (p) {
                    targetPos.set(...p.position);
                    // Set color based on carrier's team
                    if (p.team === 'red') newColor = '#ff3333';
                    if (p.team === 'blue') newColor = '#3333ff';
                }
            } else {
                // Must be me (local player)
                targetPos.copy(birdPosition);
                // Debugging color for local player
                if (myTeam === 'red') newColor = '#ff3333';
                else if (myTeam === 'blue') newColor = '#3333ff';
                else newColor = '#ffff00'; // Yellow if team is undefined (debug)
            }
            targetPos.y -= 4; // Float BELOW the bird
        } else if (position) {
            targetPos.set(...position);
            targetPos.y += Math.sin(state.clock.elapsedTime * 2) * 1;
        }

        // Lerp position
        meshRef.current.position.lerp(targetPos, 0.2);
        meshRef.current.rotation.y += 0.05;

        // Update color state (for initial render/light)
        if (color !== newColor) setColor(newColor);

        // Pulsating effect on material directly to avoid re-renders
        const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.3;
        if (meshRef.current.children[0] && (meshRef.current.children[0] as any).material) {
            const mat = (meshRef.current.children[0] as any).material;
            mat.emissiveIntensity = pulse;
            mat.color.set(newColor);
            mat.emissive.set(newColor);
        }
    });

    return (
        <group ref={meshRef}>
            {/* Egg Shape - Bigger and Colorful */}
            <mesh scale={[2.5, 3.2, 2.5]}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.1} />
            </mesh>
            <pointLight color={color} distance={20} intensity={2} />
        </group>
    );
});

const GoalMesh = React.memo(({ position, color }: { position: [number, number, number], color: string }) => {
    return (
        <group position={new Vector3(...position)}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[15, 20, 32]} />
                <meshBasicMaterial color={color} transparent opacity={0.5} side={DoubleSide} />
            </mesh>
            {/* Pillar of light */}
            <mesh position={[0, 50, 0]}>
                <cylinderGeometry args={[15, 15, 100, 32, 1, true]} />
                <meshBasicMaterial color={color} transparent opacity={0.1} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
        </group>
    );
});

const PowerupField = React.memo(({ pickups }: { pickups: BattlePickup[] }) => {
    const yLevel = React.useMemo(() => {
        if (pickups.length === 0) return 0;
        // Find lowest pickup
        return Math.min(...pickups.map(p => p.position[1])) - 20;
    }, [pickups]);

    return (
        <group position={[0, yLevel, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[500, 500]} />
                <meshStandardMaterial color="#222" transparent opacity={0.8} roughness={0.8} />
            </mesh>
            <gridHelper args={[500, 50]} position={[0, 0.1, 0]} />
        </group>
    );
});

export const BattleManager: React.FC<BattleManagerProps> = ({
    birdPosition,
    birdRotation,
    myPlayerId,
    battle,
    players,
    projectiles,
    pickups,
    activePowerups,
    onShoot,
    onCollectPickup,
    onPickupFlag,
    onStealFlag,
    onScore,
    isPaused
}) => {
    const lastShootTime = useRef(0);

    // Input handling for shooting
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (isPaused || !battle?.isActive) return;
            if (e.button === 0) { // Left click
                const now = Date.now();

                // Rapid Fire Powerup
                const hasRapidFire = activePowerups.has('rapidfire') && activePowerups.get('rapidfire')! > now;
                const cooldown = hasRapidFire ? 100 : 200;

                if (now - lastShootTime.current > cooldown) {
                    lastShootTime.current = now;

                    // Calculate spawn position (slightly in front of bird)
                    const forward = new Vector3(0, 0, 1).applyQuaternion(birdRotation);
                    const spawnPos = birdPosition.clone().add(forward.clone().multiplyScalar(2));

                    // Calculate velocity
                    const velocity = forward.clone().multiplyScalar(100); // Speed 100

                    onShoot(
                        [spawnPos.x, spawnPos.y, spawnPos.z],
                        [velocity.x, velocity.y, velocity.z],
                        'normal'
                    );
                }
            }
        };

        window.addEventListener('mousedown', handleMouseDown);
        return () => window.removeEventListener('mousedown', handleMouseDown);
    }, [battle, birdPosition, birdRotation, isPaused, onShoot, activePowerups]);

    // Pickup collection and CTF logic
    useFrame(() => {
        if (!battle?.isActive) return;

        // Pickups
        pickups.forEach(p => {
            if (p.active) {
                const pickupPos = new Vector3(...p.position);
                if (pickupPos.distanceTo(birdPosition) < 5) {
                    onCollectPickup(p.id);
                }
            }
        });

        // CTF Logic
        if (battle.mode === 'ctf' && battle.flag) {
            // Pickup Flag
            if (!battle.flag.carrierId) {
                const flagPos = new Vector3(...battle.flag.position);
                if (flagPos.distanceTo(birdPosition) < 15) {
                    onPickupFlag();
                }
            } else if (battle.flag.carrierId !== myPlayerId) {
                // Stealing Logic
                // Check distance to carrier
                const carrier = players.get(battle.flag.carrierId);
                if (carrier) {
                    const carrierPos = new Vector3(...carrier.position);
                    if (carrierPos.distanceTo(birdPosition) < 15) {
                        onStealFlag(battle.flag.carrierId);
                    }
                }
            }

            // Score (Deposit Egg)
            if (battle.flag.carrierId === myPlayerId && battle.flag.homeBase) {
                // Determine enemy base (Goal)
                const myTeam = battle.myTeam;
                if (myTeam) {
                    const targetBase = myTeam === 'red' ? battle.flag.homeBase.blue : battle.flag.homeBase.red;
                    const targetPos = new Vector3(...targetBase);
                    if (targetPos.distanceTo(birdPosition) < 20) {
                        onScore();
                    }
                }
            }
        }
    });

    if (!battle?.isActive) return null;

    return (
        <group>
            {projectiles.map(p => (
                <ProjectileMesh key={p.id} projectile={p} />
            ))}

            {pickups.map(p => (
                p.active && <PickupMesh key={p.id} pickup={p} />
            ))}

            {battle.mode === 'ctf' && battle.flag && (
                <>
                    <FlagMesh
                        position={battle.flag.position}
                        carrierId={battle.flag.carrierId}
                        players={players}
                        birdPosition={birdPosition}
                        myTeam={battle.myTeam}
                    />
                    {battle.flag.homeBase && (
                        <>
                            <GoalMesh position={battle.flag.homeBase.red} color="red" />
                            <GoalMesh position={battle.flag.homeBase.blue} color="blue" />
                        </>
                    )}
                </>
            )}

            {/* Powerup Field */}
            {battle.isActive && <PowerupField pickups={pickups} />}
        </group>
    );
};
