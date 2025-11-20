
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
const NavArrow = React.memo(({ birdPos, targetRef }: { birdPos: Vector3, targetRef: React.MutableRefObject<Vector3 | null> }) => {
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
      colorTop: { value: new Color('#ffff00') },   // Yellow Tip
      colorBottom: { value: new Color('#ff0066') } // Pink Base
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
  }), []);

  return (
    <group ref={groupRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.5, 1.5, 4]} />
        <shaderMaterial attach="material" args={[gradientMaterial]} toneMapped={false} />
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
    currentMission: '',
    currentZoneLore: ''
  });

  // Initialize to 350 to match Bird.tsx spawn height, preventing sync issues on first frame
  const birdPosRef = useRef(new Vector3(0, 350, 0));
  const birdRotRef = useRef(new Quaternion());

  // Shared ref for target ring position (for the arrow)
  const targetRingRef = useRef<Vector3 | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showModeSelect, setShowModeSelect] = useState(false);

  const audioRef = useRef<AudioHandle>(null);

  const handleShowModeSelect = useCallback(() => {
    setShowModeSelect(true);
    document.exitPointerLock();
  }, []);

  const handleModeSelect = useCallback((mode: RingGameMode) => {
    if (statsRef.current) {
      statsRef.current.ringGameMode = mode;
      statsRef.current.isRingGameActive = true;
      setShowModeSelect(false);
      document.body.requestPointerLock();
      audioRef.current?.playGameStart();
    }
  }, []);

  const handleBirdMove = useCallback((pos: Vector3) => {
    birdPosRef.current.copy(pos);
  }, []);

  const handleCollect = useCallback(() => {
    statsRef.current.score += 1;
    audioRef.current?.playRingCollect();
  }, []);

  const handleFlap = useCallback(() => {
    audioRef.current?.playFlap();
  }, []);

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
      <HUD statsRef={statsRef} />
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
          <div className="bg-gradient-to-b from-indigo-900 to-purple-900 p-12 rounded-3xl border border-white/20 text-center shadow-2xl transform transition-all max-w-2xl w-full">
            <h2 className="text-4xl font-black text-white mb-2 tracking-wider drop-shadow-lg italic">SELECT MODE</h2>
            <p className="text-blue-200 mb-8 text-lg">Choose your challenge</p>

            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={() => handleModeSelect('mountain')}
                className="group relative overflow-hidden p-6 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400 rounded-2xl transition-all text-left"
              >
                <div className="text-2xl font-bold text-yellow-400 mb-2 group-hover:scale-105 transition-transform">MOUNTAIN RUNNER</div>
                <div className="text-sm text-gray-300">Weave between treacherous mountain peaks. High intensity low-altitude flying.</div>
              </button>

              <button
                onClick={() => handleModeSelect('skyward')}
                className="group relative overflow-hidden p-6 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400 rounded-2xl transition-all text-left"
              >
                <div className="text-2xl font-bold text-cyan-400 mb-2 group-hover:scale-105 transition-transform">SKYWARD</div>
                <div className="text-sm text-gray-300">Soar through the clouds in a classic high-altitude endurance test.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {!isPaused && !isPointerLocked && !showModeSelect && !/Mobi|Android/i.test(navigator.userAgent) && (
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

        <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
        <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

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
        />

        <Collectibles
          birdPosition={birdPosRef.current}
          onCollect={handleCollect}
          isPaused={isPaused || showModeSelect}
        />

        <RingManager
          birdPosition={birdPosRef.current}
          birdRotation={birdRotRef.current}
          statsRef={statsRef}
          audioRef={audioRef}
          isPaused={isPaused || showModeSelect}
          targetRingRef={targetRingRef}
          onShowModeSelect={handleShowModeSelect}
        />

        <WaterEffects
          birdPosRef={birdPosRef}
          isPaused={isPaused || showModeSelect}
        />

        <NavArrow birdPos={birdPosRef.current} targetRef={targetRingRef} />

        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.5} mipmapBlur intensity={0.5} radius={0.6} />
          <Vignette eskil={false} offset={0.1} darkness={0.5} />
        </EffectComposer>

      </Canvas>
    </>
  );
};
