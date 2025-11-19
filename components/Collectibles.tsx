
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group } from 'three';
import { OrbData } from '../types';

interface CollectiblesProps {
  birdPosition: Vector3;
  onCollect: () => void;
  isPaused: boolean;
}

export const Collectibles: React.FC<CollectiblesProps> = React.memo(({ birdPosition, onCollect, isPaused }) => {
  // Generate random orb locations over a larger area
  const orbs = useMemo(() => {
    const items: OrbData[] = [];
    // Increased count and range
    for (let i = 0; i < 150; i++) {
      const x = (Math.random() - 0.5) * 3000; // Wider spread
      const z = (Math.random() - 0.5) * 3000;
      const y = 30 + Math.random() * 100; 
      items.push({ id: i, position: [x, y, z], active: true });
    }
    // Add one in the arch
    items.push({ id: 999, position: [0, 160, 0], active: true });
    return items;
  }, []);

  const groupRef = useRef<Group>(null);
  const collectedIds = useRef<Set<number>>(new Set());
  
  // Reusable vector for collision math to avoid GC stutter
  const tempVec = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    if (isPaused || !groupRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Optimized loop: no allocations, direct access
    for (let i = 0; i < orbs.length; i++) {
      if (collectedIds.current.has(orbs[i].id)) continue;
      
      const mesh = groupRef.current.children[i];
      if (!mesh || !mesh.visible) continue;

      const orb = orbs[i];

      // Simple distance culling for animation performance
      const distToBirdX = birdPosition.x - orb.position[0];
      const distToBirdZ = birdPosition.z - orb.position[2];
      // If too far (approx 400 units), don't animate or check detailed collision
      if (Math.abs(distToBirdX) > 400 || Math.abs(distToBirdZ) > 400) continue;

      // Animation
      mesh.rotation.y = time;
      mesh.position.y = orb.position[1] + Math.sin(time * 2 + orb.id) * 0.05;

      // Collision
      // Update tempVec with orb position (x, z are static, y is dynamic from mesh)
      tempVec.set(orb.position[0], mesh.position.y, orb.position[2]);

      // Use distanceToSquared to avoid Math.sqrt
      if (birdPosition.distanceToSquared(tempVec) < 25) { // 5^2 = 25
          collectedIds.current.add(orb.id);
          mesh.visible = false;
          onCollect();
      }
    }
  });

  return (
    <group ref={groupRef}>
      {orbs.map((orb) => (
        <mesh key={orb.id} position={new Vector3(...orb.position)}>
          <icosahedronGeometry args={[1.5, 0]} />
          <meshStandardMaterial 
            color="#ff00ff" 
            emissive="#ff00ff" 
            emissiveIntensity={3} 
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
});
