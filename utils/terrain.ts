
import { noise2D } from './noise';

export const TERRAIN_SCALE = 0.005;
export const HEIGHT_SCALE = 120;

export function getTerrainHeight(x: number, z: number): number {
  // Layered noise
  let y = noise2D(x * TERRAIN_SCALE, z * TERRAIN_SCALE) * 1.0 + 
          noise2D(x * TERRAIN_SCALE * 2, z * TERRAIN_SCALE * 2) * 0.5 +
          noise2D(x * TERRAIN_SCALE * 4, z * TERRAIN_SCALE * 4) * 0.25;
  
  // Flatten valleys, sharpen peaks
  y = Math.pow(Math.abs(y), 1.5) * (y > 0 ? 1 : -1);
  y *= HEIGHT_SCALE;

  // Ancient mountain at center
  const distToCenter = Math.sqrt(x*x + z*z);
  if (distToCenter < 100) {
      y += (100 - distToCenter) * 1.5; 
  }
  
  return y;
}
