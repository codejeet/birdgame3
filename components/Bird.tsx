
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion, Euler, Group } from 'three';
import { useControls } from '../utils/controls';
import { getTerrainHeight } from '../utils/terrain';
import { GameStats } from '../types';

interface BirdProps {
  statsRef: React.MutableRefObject<GameStats>;
  onMove: (pos: Vector3) => void;
  isPaused: boolean;
  playFlapSound: () => void;
  rotationRef?: React.MutableRefObject<Quaternion>;
}

type BirdMode = 'flying' | 'walking';

const WATER_LEVEL = 10;

export const Bird = React.memo(({ statsRef, onMove, isPaused, playFlapSound, rotationRef }: BirdProps) => {
  const birdRef = useRef<Group>(null);
  const { camera } = useThree();
  const controls = useControls();
  
  const mode = useRef<BirdMode>('flying');
  const takeoffTimer = useRef(0);
  const takeoffCooldown = useRef(0);
  const lastFlapSoundTime = useRef(0);

  // Physics state - Spawn high to clear any mountain
  const position = useRef(new Vector3(0, 350, 0));
  const speed = useRef(0.5); // Forward speed for flying
  const velocity = useRef(new Vector3(0, 0, 0)); // 3D Velocity for walking
  const quaternion = useRef(new Quaternion());
  
  // Visuals
  const bank = useRef(0);
  const hopOffset = useRef(0);
  const wingLeftRef = useRef<Group>(null);
  const wingRightRef = useRef<Group>(null);
  const flapOffset = useRef(0);

  // Safe Spawn Check
  useEffect(() => {
      const terrainY = getTerrainHeight(position.current.x, position.current.z);
      const safeY = Math.max(terrainY, WATER_LEVEL);
      if (position.current.y < safeY + 50) {
          position.current.y = safeY + 100;
      }
  }, []);

  useFrame((state, delta) => {
    if (isPaused || !birdRef.current) return;

    const { forward, backward, left, right, rollLeft, rollRight, boost, flap, dive, reset, mouseX, mouseY } = controls.current;

    // Reset Logic
    if (reset) {
        position.current.set(0, 350, 0);
        speed.current = 0.5;
        velocity.current.set(0, 0, 0);
        quaternion.current.identity();
        mode.current = 'flying';
        // Recalculate terrain height to ensure we don't spawn inside a mountain if the terrain seed is different or if 0,0 is high
        const terrainY = getTerrainHeight(0, 0);
        const safeY = Math.max(terrainY, WATER_LEVEL);
        if (position.current.y < safeY + 50) position.current.y = safeY + 100;
    }

    // Cooldown management
    if (takeoffCooldown.current > 0) {
        takeoffCooldown.current -= delta;
    }

    const terrainHeight = getTerrainHeight(position.current.x, position.current.z);
    // Determine collision surface (Terrain or Water)
    const surfaceHeight = Math.max(terrainHeight, WATER_LEVEL);
    const distToSurface = position.current.y - surfaceHeight;
    const floorLimit = surfaceHeight + 2; // Center offset for bird standing

    // Audio Trigger Logic
    const now = state.clock.getElapsedTime();
    // If flapping (Space held) and enough time passed since last sound
    if (flap && (now - lastFlapSoundTime.current > 0.5)) {
        playFlapSound();
        lastFlapSoundTime.current = now;
    }

    // --- STATE MACHINE ---

    if (mode.current === 'flying') {
        // --- FLYING LOGIC ---
        
        const pitchSpeed = 1.5 * delta;
        const yawSpeed = 1.0 * delta;
        const rollSpeed = 2.0 * delta;
        const baseSpeed = boost ? 1.2 : 0.6;
        
        const dz = 0.05;
        const mX = Math.abs(mouseX) < dz ? 0 : mouseX;
        const mY = Math.abs(mouseY) < dz ? 0 : mouseY;

        // Pitch & Yaw: Mouse ONLY
        let pitchInput = mY; 
        pitchInput = Math.max(-1, Math.min(1, pitchInput));

        let yawInput = -mX; 
        yawInput = Math.max(-1, Math.min(1, yawInput));

        // Dive Logic (Right Click) - Explicit Dive
        if (dive) {
            // Force pitch down significantly when diving
            pitchInput = 0.8; 
        }

        const rollInput = (rollLeft ? 1 : 0) - (rollRight ? 1 : 0);

        // Speed Physics: Gravity, Drag, and Thrust
        // Calculate current vertical angle
        const forwardVec = new Vector3(0, 0, 1).applyQuaternion(quaternion.current);
        const upDot = forwardVec.y; // 1 is up, -1 is down

        // Gravity acceleration
        // Modified: Only apply strong gravity acceleration when explicity diving.
        // Otherwise, apply very weak acceleration for "calm" flight.
        const gravityEffect = dive ? 3.0 : 0.2; 
        speed.current -= upDot * gravityEffect * delta;

        // Drag / Thrust
        if (dive) {
             // Aerodynamic dive - HIGH DRAG but HIGH SPEED CAP
             if (speed.current > 2.0) { // Higher cap for dive
                speed.current -= (speed.current - 2.0) * 2.0 * delta; 
             }
        } else {
             // Normal Flight
             if (speed.current > baseSpeed) {
                 // Aerodynamic Drag: decay excess speed slowly
                 speed.current -= (speed.current - baseSpeed) * 0.5 * delta;
             } else {
                 // Engine/Wing Thrust: accelerate to base speed
                 speed.current += (baseSpeed - speed.current) * 2.0 * delta;
             }
        }
        
        // Min speed to prevent stalling completely
        if (speed.current < 0.2) speed.current = 0.2; 

        // Flap to gain altitude/speed (Only if high enough or not diving)
        // Using !dive allows flapping while looking down if not strictly in "dive mode"
        if (flap && distToSurface > 25 && !dive) {
            speed.current += 2.0 * delta; 
            position.current.y += 10 * delta; 
        }

        // Rotation
        const q = quaternion.current;
        const qPitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitchInput * pitchSpeed);
        const qYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawInput * yawSpeed);
        const qRoll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rollInput * rollSpeed);

        q.multiply(qPitch);
        q.multiply(qRoll);
        q.premultiply(qYaw); 
        q.normalize();

        // Move
        const moveVec = forwardVec.clone().multiplyScalar(speed.current * 50 * delta);
        position.current.add(moveVec);

        // --- TRANSITIONS ---

        // 1. Manual Land (Space near ground)
        // MUST CHECK takeoffCooldown to prevent immediate re-landing after walking takeoff
        if (distToSurface <= 25 && flap && takeoffCooldown.current <= 0) {
            mode.current = 'walking';
            velocity.current.set(0, 0, 0);
            // Level out
            const euler = new Euler().setFromQuaternion(q, 'YXZ');
            euler.x = 0;
            euler.z = 0;
            q.setFromEuler(euler);
        } 
        // 2. Auto Land (Collision with terrain/water)
        else if (position.current.y < floorLimit) {
            mode.current = 'walking';
            position.current.y = floorLimit;
            velocity.current.set(0, 0, 0);
            // Level out
            const euler = new Euler().setFromQuaternion(q, 'YXZ');
            euler.x = 0;
            euler.z = 0;
            q.setFromEuler(euler);
        }

        // Visuals
        const targetBank = yawInput * 0.5;
        bank.current += (targetBank - bank.current) * delta * 5;
        
        flapOffset.current += delta * (flap ? 20 : (boost ? 15 : 8));
        
        // Wing Animation
        if (wingLeftRef.current && wingRightRef.current) {
            if (dive) {
                // Tuck wings while diving (Right Click)
                wingLeftRef.current.rotation.z = Math.PI / 1.5;
                wingRightRef.current.rotation.z = -Math.PI / 1.5;
            } else {
                // Flap wings
                const wingRot = Math.sin(flapOffset.current) * 0.5;
                wingLeftRef.current.rotation.z = wingRot;
                wingRightRef.current.rotation.z = -wingRot;
            }
        }

    } else {
        // --- WALKING / FLOATING LOGIC ---

        // Check if we are on water or land
        const isFloating = surfaceHeight === WATER_LEVEL;

        // Mouse Yaw (Turning)
        const yawSpeed = 2.5 * delta;
        const mX = Math.abs(mouseX) < 0.05 ? 0 : mouseX;
        
        // Rotate Body
        const q = quaternion.current;
        const qYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -mX * yawSpeed);
        q.premultiply(qYaw);
        
        // Movement (WASD)
        const moveSpeed = isFloating ? 8.0 : 15.0; // Slower in water
        const moveDir = new Vector3();
        if (forward) moveDir.z += 1;
        if (backward) moveDir.z -= 1;
        if (left) moveDir.x += 1;
        if (right) moveDir.x -= 1;
        
        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().applyQuaternion(q);
            // Animation update
            if (isFloating) {
                hopOffset.current += delta * 5; // Paddling rhythm
            } else {
                hopOffset.current += delta * 15; // Walking rhythm
            }
        } else {
            // Idle Animation
            if (isFloating) {
                 hopOffset.current += delta * 2; // Gentle water bob
            } else {
                 hopOffset.current = 0;
            }
        }

        // Physics
        velocity.current.x = moveDir.x * moveSpeed;
        velocity.current.z = moveDir.z * moveSpeed;
        
        // Gravity
        velocity.current.y -= 60 * delta;

        // Ground/Water Interaction
        if (position.current.y <= floorLimit) {
            position.current.y = floorLimit;
            velocity.current.y = 0;

            // Jump (Space) - Only if not holding space for a long time (start of press)
            if (flap && takeoffTimer.current < 0.1) {
                 velocity.current.y = 25;
            }
        }

        // Apply Velocity
        position.current.add(velocity.current.clone().multiplyScalar(delta));

        // --- TAKEOFF LOGIC (Hold Space) ---
        if (flap) {
            takeoffTimer.current += delta;
            if (takeoffTimer.current > 0.4) {
                // Transition to flying
                mode.current = 'flying';
                speed.current = 0.8;
                velocity.current.set(0,0,0);
                position.current.y += 10; // Boost up significantly to clear ground
                takeoffCooldown.current = 2.0; // Prevent landing logic for 2 seconds
                takeoffTimer.current = 0;

                // Pitch up for takeoff
                const euler = new Euler().setFromQuaternion(q, 'YXZ');
                euler.x = -0.5; 
                q.setFromEuler(euler);
            }
        } else {
            takeoffTimer.current = 0;
        }

        // --- TRANSITION TO FLIGHT (Falling) ---
        // If falling and high above ground/surface (e.g. jumped off cliff)
        if (distToSurface > 30 && velocity.current.y < -10) {
            mode.current = 'flying';
            speed.current = 0.5; // Reset flight speed
            velocity.current.set(0,0,0);
            
            // Dive pitch
            const euler = new Euler().setFromQuaternion(q, 'YXZ');
            euler.x = 0.2; 
            q.setFromEuler(euler);
        }

        // Visuals: Fold wings
        if (wingLeftRef.current && wingRightRef.current) {
            wingLeftRef.current.rotation.z = Math.PI / 1.5; // Folded back
            wingRightRef.current.rotation.z = -Math.PI / 1.5;
        }
        
        // Visual vertical offset for mesh (Hop vs Bob)
        let visualYOffset = 0;
        if (isFloating) {
            // Smooth Sine wave for floating
            visualYOffset = Math.sin(hopOffset.current) * 0.3 - 0.5; // Sit slightly lower in water
        } else {
            // Absolute Sine wave for hopping (bounce)
            visualYOffset = Math.abs(Math.sin(hopOffset.current)) * 0.5;
        }
        
        birdRef.current.position.y = position.current.y + visualYOffset;
    }

    // --- COMMON SYNC ---
    
    if (mode.current === 'flying') {
        const visualQ = quaternion.current.clone();
        const bankQ = new Quaternion().setFromAxisAngle(new Vector3(0,0,1), bank.current);
        visualQ.multiply(bankQ);
        birdRef.current.quaternion.copy(visualQ);
        birdRef.current.position.copy(position.current);
    } else {
        birdRef.current.quaternion.copy(quaternion.current);
        // Position y is handled via visualYOffset above to separate physics from animation
        birdRef.current.position.x = position.current.x;
        birdRef.current.position.z = position.current.z;
    }
    
    // Update external Rotation Ref if provided
    if (rotationRef) {
        rotationRef.current.copy(quaternion.current);
    }

    // Camera Follow
    const camDist = mode.current === 'walking' ? 10 : 15;
    const camHeight = mode.current === 'walking' ? 4 : 5;
    const camOffset = new Vector3(0, camHeight, -camDist).applyQuaternion(quaternion.current);
    
    if (mode.current === 'walking') camOffset.y += 2; // Look down slightly

    const targetCamPos = position.current.clone().add(camOffset);
    
    // Prevent camera clipping underground
    // Calculate camera terrain height
    const camTerrainHeight = getTerrainHeight(targetCamPos.x, targetCamPos.z);
    const camSafeHeight = Math.max(camTerrainHeight, WATER_LEVEL) + 2;
    
    if (targetCamPos.y < camSafeHeight) {
        targetCamPos.y = camSafeHeight;
    }

    camera.position.lerp(targetCamPos, delta * 3.0);
    
    const lookAtOffset = new Vector3(0, 0, 20).applyQuaternion(quaternion.current);
    const targetLookAt = position.current.clone().add(lookAtOffset);
    camera.lookAt(targetLookAt);

    // Updates
    statsRef.current.speed = mode.current === 'flying' ? speed.current : velocity.current.length();
    statsRef.current.altitude = position.current.y;
    onMove(position.current);
  });

  return (
    <group ref={birdRef}>
      {/* Bird Body */}
      <mesh castShadow receiveShadow rotation={[Math.PI/2, 0, 0]}>
        <coneGeometry args={[0.5, 2, 8]} />
        <meshStandardMaterial color="#ffaa00" roughness={0.4} />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0, 1.0]} castShadow>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Wings */}
      <group position={[0, 0, 0.2]}>
        <group ref={wingLeftRef} position={[0.4, 0, 0]}>
             <mesh position={[1.5, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[3, 0.1, 1]} />
                <meshStandardMaterial color="#ffcc00" />
            </mesh>
        </group>
        <group ref={wingRightRef} position={[-0.4, 0, 0]}>
             <mesh position={[-1.5, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[3, 0.1, 1]} />
                <meshStandardMaterial color="#ffcc00" />
            </mesh>
        </group>
      </group>

      {/* Tail */}
      <mesh position={[0, 0, -1]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[1, 0.1, 1.5]} />
          <meshStandardMaterial color="#cc8800" />
      </mesh>
    </group>
  );
});
