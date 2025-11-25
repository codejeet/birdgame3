
import React, { useMemo, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Vector3 } from 'three';
import { getTerrainHeight, getTerrainColor } from '../utils/terrain';

const CHUNK_SIZE = 200;
const SEGMENTS = 32;
const RENDER_DISTANCE = 8; // Increased from 4 to 8 for larger visible world (1600m radius)

interface ChunkProps {
  xOffset: number;
  zOffset: number;
}

const Chunk = React.memo(({ xOffset, zOffset }: ChunkProps) => {
  const { positions, colors, indices } = useMemo(() => {
    const pos = [];
    const col = [];
    const indicesArr = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      for (let j = 0; j <= SEGMENTS; j++) {
        const x = (i / SEGMENTS) * CHUNK_SIZE + xOffset - CHUNK_SIZE / 2;
        const z = (j / SEGMENTS) * CHUNK_SIZE + zOffset - CHUNK_SIZE / 2;

        const y = getTerrainHeight(x, z);

        pos.push(x, y, z);

        const c = getTerrainColor(x, z, y);
        col.push(c.r, c.g, c.b);
      }
    }

    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const a = i * (SEGMENTS + 1) + j;
        const b = i * (SEGMENTS + 1) + j + 1;
        const c = (i + 1) * (SEGMENTS + 1) + j;
        const d = (i + 1) * (SEGMENTS + 1) + j + 1;
        indicesArr.push(a, b, d);
        indicesArr.push(a, d, c);
      }
    }

    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(col),
      indices: new Uint16Array(indicesArr)
    };
  }, [xOffset, zOffset]);

  return (
    <mesh receiveShadow>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={colors.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          attach="index"
          array={indices}
          count={indices.length}
          itemSize={1}
        />
      </bufferGeometry>
      <meshStandardMaterial
        vertexColors
        roughness={0.8}
        flatShading
        side={DoubleSide}
      />
    </mesh>
  );
});

const AncientArch = React.memo(() => (
  <group position={[0, 160, 0]}>
    <mesh position={[-8, 10, 0]} castShadow>
      <boxGeometry args={[4, 20, 4]} />
      <meshStandardMaterial color="#555" />
    </mesh>
    <mesh position={[8, 10, 0]} castShadow>
      <boxGeometry args={[4, 20, 4]} />
      <meshStandardMaterial color="#555" />
    </mesh>
    <mesh position={[0, 22, 0]} castShadow>
      <boxGeometry args={[24, 4, 4]} />
      <meshStandardMaterial color="#555" />
    </mesh>
    <mesh position={[0, 15, 0]}>
      <octahedronGeometry args={[2, 0]} />
      <meshStandardMaterial color="cyan" emissive="cyan" emissiveIntensity={2} />
    </mesh>
  </group>
));

// Water that follows the bird loosely to simulate infinity
const InfiniteWater = React.memo(({ birdPosition }: { birdPosition: Vector3 }) => {
  const ref = useRef<any>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.position.set(birdPosition.x, 10, birdPosition.z);
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[CHUNK_SIZE * (RENDER_DISTANCE * 2 + 1), CHUNK_SIZE * (RENDER_DISTANCE * 2 + 1)]} />
      <meshStandardMaterial
        color="#0099ff"
        transparent
        opacity={0.6}
        roughness={0.1}
        metalness={0.1}
      />
    </mesh>
  );
});

interface WorldProps {
  birdPosition: Vector3;
}

export const World = React.memo(({ birdPosition }: WorldProps) => {
  const [chunks, setChunks] = useState<string[]>([]);
  const currentChunkRef = useRef({ x: -999, z: -999 });

  useFrame(() => {
    const cx = Math.round(birdPosition.x / CHUNK_SIZE);
    const cz = Math.round(birdPosition.z / CHUNK_SIZE);

    if (cx !== currentChunkRef.current.x || cz !== currentChunkRef.current.z) {
      currentChunkRef.current = { x: cx, z: cz };

      const newChunks: string[] = [];
      for (let x = cx - RENDER_DISTANCE; x <= cx + RENDER_DISTANCE; x++) {
        for (let z = cz - RENDER_DISTANCE; z <= cz + RENDER_DISTANCE; z++) {
          newChunks.push(`${x}:${z}`);
        }
      }
      setChunks(newChunks);
    }
  });

  return (
    <group>
      {chunks.map(key => {
        const [x, z] = key.split(':').map(Number);
        return <Chunk key={key} xOffset={x * CHUNK_SIZE} zOffset={z * CHUNK_SIZE} />;
      })}
      <InfiniteWater birdPosition={birdPosition} />
      <AncientArch />
    </group>
  );
});
