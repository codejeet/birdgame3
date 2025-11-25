import { noise2D } from './noise';
import { getBiomeWeights, Biome } from './biomes';
import { Color } from 'three';

export const TERRAIN_SCALE = 0.005; // Base scale, though biomes override this
export const HEIGHT_SCALE = 120; // Base height scale

// Helper to get height for a specific biome
function getBiomeHeight(x: number, z: number, biome: Biome): number {
  const { scale, octaves, persistence, lacunarity, exponent, heightScale, baseHeight } = biome.heightParams;

  let amplitude = 1;
  let frequency = scale;
  let noiseValue = 0;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    noiseValue += noise2D(x * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Normalize to [-1, 1]
  noiseValue /= maxValue;

  // Apply exponent for valley/peak shaping (preserve sign)
  const sign = noiseValue > 0 ? 1 : -1;
  noiseValue = Math.pow(Math.abs(noiseValue), exponent) * sign;

  return noiseValue * heightScale + baseHeight;
}

export function getTerrainHeight(x: number, z: number): number {
  const weights = getBiomeWeights(x, z);
  let totalHeight = 0;

  for (const { biome, weight } of weights) {
    totalHeight += getBiomeHeight(x, z, biome) * weight;
  }

  // Ancient mountain at center (preserve this feature)
  const distToCenter = Math.sqrt(x * x + z * z);
  if (distToCenter < 100) {
    totalHeight += (100 - distToCenter) * 1.5;
  }

  return totalHeight;
}

export function getTerrainColor(x: number, z: number, height: number): Color {
  const weights = getBiomeWeights(x, z);
  const finalColor = new Color(0, 0, 0);

  for (const { biome, weight } of weights) {
    let biomeColor = new Color();
    const { low, mid, high, peak } = biome.colors;
    const { baseHeight, heightScale } = biome.heightParams;

    // Normalize height relative to this biome's range for coloring
    // This is an approximation, as the actual height might be blended
    const relativeHeight = (height - baseHeight) / heightScale;

    if (relativeHeight < -0.2) biomeColor.copy(low);
    else if (relativeHeight < 0.2) biomeColor.copy(low).lerp(mid, (relativeHeight + 0.2) / 0.4);
    else if (relativeHeight < 0.6) biomeColor.copy(mid).lerp(high, (relativeHeight - 0.2) / 0.4);
    else if (relativeHeight < 1.0) biomeColor.copy(high).lerp(peak, (relativeHeight - 0.6) / 0.4);
    else biomeColor.copy(peak);

    finalColor.add(biomeColor.multiplyScalar(weight));
  }

  return finalColor;
}
