import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Group, Euler } from 'three';
import { Text } from '@react-three/drei';
import { RemotePlayer } from '../types';

interface OtherPlayersProps {
  players: Map<string, RemotePlayer>;
  localPlayerId: string | null;
}

// Physics constants for prediction
const GRAVITY = -9.8;
const DRAG = 0.98;
const INTERPOLATION_SPEED = 8;
const PREDICTION_BLEND = 0.7; // How much to trust prediction vs direct interpolation

// Single remote bird with physics-based interpolation
const RemoteBird = React.memo(({ player }: { player: RemotePlayer }) => {
  const groupRef = useRef<Group>(null);
  
  // Current interpolated state
  const currentPos = useRef(new Vector3(...player.position));
  const currentQuat = useRef(new Quaternion(...player.rotation));
  
  // Network state (latest received)
  const networkPos = useRef(new Vector3(...player.position));
  const networkQuat = useRef(new Quaternion(...player.rotation));
  const lastNetworkTime = useRef(Date.now());
  
  // Previous network state (for velocity calculation)
  const prevNetworkPos = useRef(new Vector3(...player.position));
  const prevNetworkQuat = useRef(new Quaternion(...player.rotation));
  const prevNetworkTime = useRef(Date.now() - 50);
  
  // Estimated velocity and angular velocity
  const velocity = useRef(new Vector3(0, 0, 0));
  const angularVelocity = useRef(new Quaternion());
  
  // Predicted state
  const predictedPos = useRef(new Vector3(...player.position));
  const predictedQuat = useRef(new Quaternion(...player.rotation));
  
  // Visual refs
  const wingLeftRef = useRef<Group>(null);
  const wingRightRef = useRef<Group>(null);
  const flapPhase = useRef(Math.random() * Math.PI * 2);

  // Generate a consistent color based on player name
  const birdColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < player.name.length; i++) {
      hash = player.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 55%)`;
  }, [player.name]);

  const wingColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < player.name.length; i++) {
      hash = player.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs((hash + 30) % 360);
    return `hsl(${hue}, 60%, 65%)`;
  }, [player.name]);

  // Update when new network data arrives
  useEffect(() => {
    const newPos = new Vector3(...player.position);
    const newQuat = new Quaternion(...player.rotation);
    const now = Date.now();
    
    // Store previous state
    prevNetworkPos.current.copy(networkPos.current);
    prevNetworkQuat.current.copy(networkQuat.current);
    prevNetworkTime.current = lastNetworkTime.current;
    
    // Update network state
    networkPos.current.copy(newPos);
    networkQuat.current.copy(newQuat);
    lastNetworkTime.current = now;
    
    // Calculate velocity from position delta
    const timeDelta = (now - prevNetworkTime.current) / 1000;
    if (timeDelta > 0.01 && timeDelta < 1.0) {
      // Position velocity
      velocity.current.copy(newPos).sub(prevNetworkPos.current).divideScalar(timeDelta);
      
      // Angular velocity (simplified - just store the quaternion difference)
      angularVelocity.current.copy(prevNetworkQuat.current).conjugate().multiply(newQuat);
    }
  }, [player.position, player.rotation]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const now = Date.now();
    const timeSinceUpdate = (now - lastNetworkTime.current) / 1000;
    
    // === PHYSICS PREDICTION ===
    // Predict where the bird should be based on velocity and basic physics
    
    // Start from last known network position
    predictedPos.current.copy(networkPos.current);
    
    // Apply velocity prediction
    const velPrediction = velocity.current.clone().multiplyScalar(timeSinceUpdate);
    predictedPos.current.add(velPrediction);
    
    // Apply simple gravity for falling birds (if moving downward significantly)
    if (velocity.current.y < -2) {
      predictedPos.current.y += 0.5 * GRAVITY * timeSinceUpdate * timeSinceUpdate;
    }
    
    // Apply drag to velocity over time for more realistic deceleration
    const dragFactor = Math.pow(DRAG, timeSinceUpdate * 60);
    
    // Predict rotation using angular velocity
    // Slerp towards predicted rotation based on angular momentum
    predictedQuat.current.copy(networkQuat.current);
    if (timeSinceUpdate < 0.5) {
      // Apply fractional angular velocity
      const t = Math.min(timeSinceUpdate * 2, 1);
      predictedQuat.current.slerp(
        networkQuat.current.clone().multiply(angularVelocity.current),
        t
      );
    }
    
    // === INTERPOLATION ===
    // Blend between direct interpolation and physics prediction
    
    // Calculate target position (blend of network state and prediction)
    const targetPos = new Vector3().lerpVectors(
      networkPos.current,
      predictedPos.current,
      Math.min(timeSinceUpdate * 10, PREDICTION_BLEND)
    );
    
    // Smooth interpolation towards target
    const lerpFactor = 1 - Math.exp(-INTERPOLATION_SPEED * delta);
    currentPos.current.lerp(targetPos, lerpFactor);
    
    // Smooth quaternion interpolation
    currentQuat.current.slerp(predictedQuat.current, lerpFactor);
    
    // Apply to mesh
    groupRef.current.position.copy(currentPos.current);
    groupRef.current.quaternion.copy(currentQuat.current);
    
    // === WING ANIMATION ===
    // Adjust flap speed based on estimated velocity
    const speed = velocity.current.length();
    const flapSpeed = 6 + Math.min(speed * 0.5, 10); // Faster flapping when moving fast
    flapPhase.current += delta * flapSpeed;
    
    // Wing angle based on banking (estimated from angular velocity)
    const bankAngle = Math.atan2(velocity.current.x, Math.max(speed, 1)) * 0.3;
    const flapAngle = Math.sin(flapPhase.current) * (0.3 + speed * 0.02);
    
    if (wingLeftRef.current && wingRightRef.current) {
      wingLeftRef.current.rotation.z = flapAngle + 0.2 - bankAngle * 0.5;
      wingRightRef.current.rotation.z = -flapAngle - 0.2 - bankAngle * 0.5;
      
      // Sweep wings back when diving
      const diveFactor = Math.max(0, -velocity.current.y / 20);
      wingLeftRef.current.rotation.y = diveFactor * 0.3;
      wingRightRef.current.rotation.y = -diveFactor * 0.3;
    }
  });

  return (
    <group ref={groupRef} position={player.position}>
      {/* Name tag - billboard effect handled by Text component */}
      <Text
        position={[0, 2.5, 0]}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {player.name}
        {player.inRace && ` 🏁${player.raceCheckpoints}`}
      </Text>

      {/* Bird Body */}
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.5, 2, 8]} />
        <meshStandardMaterial color={birdColor} roughness={0.4} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0, 1.0]} castShadow>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Wings */}
      <group position={[0, 0, 0.2]}>
        <group ref={wingLeftRef} position={[0.4, 0, 0]}>
          <mesh position={[1.5, 0, 0]} castShadow>
            <boxGeometry args={[3, 0.1, 1]} />
            <meshStandardMaterial color={wingColor} />
          </mesh>
        </group>
        <group ref={wingRightRef} position={[-0.4, 0, 0]}>
          <mesh position={[-1.5, 0, 0]} castShadow>
            <boxGeometry args={[3, 0.1, 1]} />
            <meshStandardMaterial color={wingColor} />
          </mesh>
        </group>
      </group>

      {/* Tail */}
      <mesh position={[0, 0, -1]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[1, 0.1, 1.5]} />
        <meshStandardMaterial color={birdColor} />
      </mesh>

      {/* Race indicator glow */}
      {player.inRace && (
        <pointLight color="#ff6600" intensity={1} distance={10} />
      )}
    </group>
  );
});

export const OtherPlayers: React.FC<OtherPlayersProps> = React.memo(({ players, localPlayerId }) => {
  // Filter out local player
  const remotePlayers = useMemo(() => {
    return Array.from(players.values()).filter(p => p.id !== localPlayerId);
  }, [players, localPlayerId]);

  return (
    <group>
      {remotePlayers.map(player => (
        <RemoteBird key={player.id} player={player} />
      ))}
    </group>
  );
});
