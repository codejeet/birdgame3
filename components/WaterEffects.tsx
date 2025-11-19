
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3, Color, AdditiveBlending } from 'three';

const WATER_LEVEL = 10;
const RIPPLE_COUNT = 50;
const SPLASH_COUNT = 80;

interface WaterEffectsProps {
  birdPosRef: React.MutableRefObject<Vector3>;
  isPaused: boolean;
}

export const WaterEffects: React.FC<WaterEffectsProps> = React.memo(({ birdPosRef, isPaused }) => {
  const rippleRef = useRef<InstancedMesh>(null);
  const splashRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  
  // Speed calculation
  const lastPos = useRef<Vector3>(new Vector3());
  
  // Data layout: [x, y, z, age, life, scale]
  const ripples = useRef(new Float32Array(RIPPLE_COUNT * 6));
  const rippleIdx = useRef(0);
  const rippleTimer = useRef(0);

  // Data layout: [x, y, z, vx, vy, vz, active(1/0)]
  const splashes = useRef(new Float32Array(SPLASH_COUNT * 7));
  const splashIdx = useRef(0);
  const splashTimer = useRef(0);

  useFrame((state, delta) => {
    if (isPaused || !rippleRef.current || !splashRef.current) return;
    if (delta > 0.1) return; // Skip large delta spikes

    const birdPos = birdPosRef.current;
    
    // Initialize lastPos
    if (lastPos.current.lengthSq() === 0) {
        lastPos.current.copy(birdPos);
        return;
    }
    
    const moveDist = birdPos.distanceTo(lastPos.current);
    const speed = moveDist / delta;
    lastPos.current.copy(birdPos);

    const isTouchingWater = Math.abs(birdPos.y - WATER_LEVEL) < 1.5;
    
    // --- RIPPLES (Wake) ---
    if (isTouchingWater && speed > 5.0) {
        rippleTimer.current += delta;
        // Spawn rate depends on speed, clamp for performance
        const spawnRate = Math.max(0.05, 0.5 / (speed / 10)); 
        
        if (rippleTimer.current > spawnRate) {
            rippleTimer.current = 0;
            const idx = rippleIdx.current;
            const offset = idx * 6;
            
            ripples.current[offset] = birdPos.x;
            ripples.current[offset + 1] = WATER_LEVEL + 0.05;
            ripples.current[offset + 2] = birdPos.z;
            ripples.current[offset + 3] = 0; // age
            ripples.current[offset + 4] = 2.0; // life
            ripples.current[offset + 5] = 1.0; // max scale multiplier

            rippleIdx.current = (idx + 1) % RIPPLE_COUNT;
        }
    }

    // Update Ripples
    for (let i = 0; i < RIPPLE_COUNT; i++) {
        const offset = i * 6;
        let age = ripples.current[offset + 3];
        const life = ripples.current[offset + 4];
        
        if (age < life) {
            age += delta;
            ripples.current[offset + 3] = age;
            
            const x = ripples.current[offset];
            const y = ripples.current[offset + 1];
            const z = ripples.current[offset + 2];
            
            const progress = age / life;
            // Expand outward
            const scale = 1.0 + progress * 8.0; 
            const alpha = Math.max(0, 1.0 - progress);

            dummy.position.set(x, y, z);
            dummy.rotation.x = -Math.PI / 2;
            dummy.scale.set(scale, scale, 1);
            dummy.updateMatrix();
            
            rippleRef.current.setMatrixAt(i, dummy.matrix);
            rippleRef.current.setColorAt(i, new Color(1, 1, 1).multiplyScalar(alpha * 0.4)); 
        } else {
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
            rippleRef.current.setMatrixAt(i, dummy.matrix);
        }
    }
    rippleRef.current.instanceMatrix.needsUpdate = true;
    if (rippleRef.current.instanceColor) rippleRef.current.instanceColor.needsUpdate = true;


    // --- SPLASHES (Droplets) ---
    // Trigger splashes when moving fast on water
    if (isTouchingWater && speed > 15.0) {
        splashTimer.current += delta;
        if (splashTimer.current > 0.02) {
             splashTimer.current = 0;
             
             // Spawn burst
             for(let k=0; k<3; k++) {
                const idx = splashIdx.current;
                const offset = idx * 7;
                
                // Random position around bird
                const angle = Math.random() * Math.PI * 2;
                const radius = 0.5 + Math.random() * 1.5;
                
                splashes.current[offset] = birdPos.x + Math.cos(angle) * radius;
                splashes.current[offset + 1] = WATER_LEVEL + 0.2;
                splashes.current[offset + 2] = birdPos.z + Math.sin(angle) * radius;
                
                // Velocity: Up and outward, influenced by speed
                const forwardVelocityFactor = 0.2; // Carry some momentum? Maybe just chaos.
                splashes.current[offset + 3] = Math.cos(angle) * 5 + (Math.random()-0.5)*5;
                splashes.current[offset + 4] = 10 + Math.random() * 10; // Up force
                splashes.current[offset + 5] = Math.sin(angle) * 5 + (Math.random()-0.5)*5;
                splashes.current[offset + 6] = 1; // Active

                splashIdx.current = (idx + 1) % SPLASH_COUNT;
             }
        }
    }

    // Update Splashes
    for(let i=0; i<SPLASH_COUNT; i++) {
        const offset = i * 7;
        if (splashes.current[offset + 6] > 0) {
            const vx = splashes.current[offset + 3];
            let vy = splashes.current[offset + 4];
            const vz = splashes.current[offset + 5];
            
            vy -= 40 * delta; // Gravity
            splashes.current[offset + 4] = vy;
            
            splashes.current[offset] += vx * delta;
            splashes.current[offset + 1] += vy * delta;
            splashes.current[offset + 2] += vz * delta;
            
            // Hit water
            if (splashes.current[offset + 1] < WATER_LEVEL) {
                splashes.current[offset + 6] = 0; 
                dummy.scale.set(0,0,0);
            } else {
                dummy.position.set(splashes.current[offset], splashes.current[offset+1], splashes.current[offset+2]);
                // Scale down based on falling? or constant.
                dummy.scale.set(1,1,1);
                dummy.rotation.set(Math.random(), Math.random(), Math.random());
            }
            dummy.updateMatrix();
            splashRef.current.setMatrixAt(i, dummy.matrix);
        } else {
            dummy.scale.set(0,0,0);
            dummy.updateMatrix();
            splashRef.current.setMatrixAt(i, dummy.matrix);
        }
    }
    splashRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Ripples - Additive blending for "light on water" look */}
      <instancedMesh ref={rippleRef} args={[undefined, undefined, RIPPLE_COUNT]}>
         <ringGeometry args={[0.8, 1.2, 16]} />
         <meshBasicMaterial 
            color="#aaddff" 
            transparent 
            blending={AdditiveBlending} 
            depthWrite={false}
         />
      </instancedMesh>

      {/* Splashes - Solid cubes */}
      <instancedMesh ref={splashRef} args={[undefined, undefined, SPLASH_COUNT]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#e0f7fa" roughness={0.1} />
      </instancedMesh>
    </>
  );
});
