
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3 } from 'three';

const COUNT = 300; // Increased count for larger world
const tempObject = new Object3D();

interface AmbientBirdsProps {
    isPaused: boolean;
}

export const AmbientBirds = React.memo(({ isPaused }: AmbientBirdsProps) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  const birds = useMemo(() => {
    return new Array(COUNT).fill(0).map(() => ({
      position: new Vector3(
        (Math.random() - 0.5) * 2400, // Wider spawn area
        30 + Math.random() * 50,
        (Math.random() - 0.5) * 2400
      ),
      velocity: new Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize().multiplyScalar(0.2),
      phase: Math.random() * Math.PI * 2
    }));
  }, []);

  useFrame((state) => {
    if (isPaused || !meshRef.current) return;
    
    const time = state.clock.getElapsedTime();

    birds.forEach((bird, i) => {
      bird.position.add(bird.velocity);

      // Wrap around a larger area
      if (Math.abs(bird.position.x) > 1200) bird.velocity.x *= -1;
      if (Math.abs(bird.position.z) > 1200) bird.velocity.z *= -1;
      
      const yOffset = Math.sin(time * 2 + bird.phase) * 0.1;
      bird.position.y += yOffset;

      tempObject.position.copy(bird.position);
      tempObject.lookAt(bird.position.clone().add(bird.velocity));
      
      const flap = Math.sin(time * 10 + bird.phase);
      tempObject.scale.set(1, 1 + flap * 0.2, 1);

      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <coneGeometry args={[0.2, 0.8, 4]} />
      <meshStandardMaterial color="white" />
    </instancedMesh>
  );
});
