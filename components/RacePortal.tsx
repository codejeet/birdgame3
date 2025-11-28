import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, Color, DoubleSide } from 'three';
import { Text } from '@react-three/drei';
import { RacePortalData } from '../types';

interface RacePortalsProps {
  portals: RacePortalData[];
  birdPosition: Vector3;
  onEnterPortal: (lobbyId: string) => void;
  localLobbyId: string | null; // Don't show portal for your own lobby
}

const PORTAL_RADIUS = 15;
const PORTAL_COLLISION_RADIUS = 12;

// Individual portal component
const Portal = React.memo(({ 
  portal, 
  birdPosition, 
  onEnterPortal,
  isOwnPortal 
}: { 
  portal: RacePortalData; 
  birdPosition: Vector3;
  onEnterPortal: (lobbyId: string) => void;
  isOwnPortal: boolean;
}) => {
  const groupRef = useRef<Group>(null);
  const innerRingRef = useRef<any>(null);
  const outerRingRef = useRef<any>(null);
  const particlesRef = useRef<Group>(null);
  const hasTriggered = useRef(false);
  
  // Portal position
  const position = useMemo(() => new Vector3(...portal.position), [portal.position]);
  
  // Particle positions for swirl effect
  const particles = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const radius = 8 + Math.random() * 5;
      pts.push({
        angle,
        radius,
        speed: 0.5 + Math.random() * 0.5,
        yOffset: (Math.random() - 0.5) * 4
      });
    }
    return pts;
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Rotate rings
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = time * 2;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = -time * 1.5;
    }
    
    // Animate particles
    if (particlesRef.current) {
      particlesRef.current.children.forEach((child, i) => {
        const p = particles[i];
        const angle = p.angle + time * p.speed;
        child.position.x = Math.cos(angle) * p.radius;
        child.position.y = Math.sin(angle) * p.radius + p.yOffset;
        child.position.z = Math.sin(time * 2 + i) * 2;
      });
    }
    
    // Pulsing scale
    const pulse = 1 + Math.sin(time * 3) * 0.05;
    groupRef.current.scale.setScalar(pulse);
    
    // Check collision with bird (only for other players' portals)
    if (!isOwnPortal) {
      const dist = birdPosition.distanceTo(position);
      if (dist < PORTAL_COLLISION_RADIUS) {
        if (!hasTriggered.current) {
          hasTriggered.current = true;
          onEnterPortal(portal.lobbyId);
        }
      } else {
        // Reset trigger when player moves away
        if (dist > PORTAL_COLLISION_RADIUS + 5) {
            hasTriggered.current = false;
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Host name and player count */}
      <Text
        position={[0, PORTAL_RADIUS + 3, 0]}
        fontSize={2}
        color="#00ff88"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.1}
        outlineColor="#000000"
      >
        {portal.hostName}'s Race
      </Text>
      <Text
        position={[0, PORTAL_RADIUS + 0.5, 0]}
        fontSize={1.2}
        color="#88ffbb"
        anchorX="center"
        anchorY="middle"
      >
        {portal.playerCount} {portal.playerCount === 1 ? 'player' : 'players'} waiting
      </Text>
      
      {/* Outer ring */}
      <mesh ref={outerRingRef}>
        <torusGeometry args={[PORTAL_RADIUS, 0.8, 16, 64]} />
        <meshStandardMaterial 
          color="#00ff44"
          emissive="#00ff44"
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>
      
      {/* Inner ring */}
      <mesh ref={innerRingRef}>
        <torusGeometry args={[PORTAL_RADIUS * 0.7, 0.5, 16, 48]} />
        <meshStandardMaterial 
          color="#44ffaa"
          emissive="#44ffaa"
          emissiveIntensity={0.8}
          toneMapped={false}
        />
      </mesh>
      
      {/* Portal surface (swirling disc) */}
      <mesh rotation={[0, 0, 0]}>
        <circleGeometry args={[PORTAL_RADIUS - 1, 32]} />
        <meshStandardMaterial 
          color="#003322"
          emissive="#00ff66"
          emissiveIntensity={0.3}
          transparent
          opacity={0.6}
          side={DoubleSide}
        />
      </mesh>
      
      {/* Swirling particles */}
      <group ref={particlesRef}>
        {particles.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial 
              color="#00ffaa"
              emissive="#00ff88"
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      
      {/* Center glow */}
      <pointLight color="#00ff66" intensity={5} distance={50} />
      
      {/* "Fly through to join" text for other players */}
      {!isOwnPortal && (
        <Text
          position={[0, -PORTAL_RADIUS - 2, 0]}
          fontSize={1}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          Fly through to join!
        </Text>
      )}
    </group>
  );
});

export const RacePortals: React.FC<RacePortalsProps> = React.memo(({ 
  portals, 
  birdPosition, 
  onEnterPortal,
  localLobbyId 
}) => {
  return (
    <group>
      {portals.map(portal => (
        <Portal
          key={portal.lobbyId}
          portal={portal}
          birdPosition={birdPosition}
          onEnterPortal={onEnterPortal}
          isOwnPortal={portal.lobbyId === localLobbyId}
        />
      ))}
    </group>
  );
});

