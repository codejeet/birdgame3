import { Color } from 'three';
import { noise2D } from './noise';

export interface Biome {
    name: string;
    heightParams: {
        scale: number;
        octaves: number;
        persistence: number;
        lacunarity: number;
        exponent: number;
        heightScale: number;
        baseHeight: number;
    };
    colors: {
        low: Color;
        mid: Color;
        high: Color;
        peak: Color;
    };
}

// Define Biomes
export const BIOMES: { [key: string]: Biome } = {
    DESERT: {
        name: 'Desert',
        heightParams: {
            scale: 0.003,
            octaves: 2,
            persistence: 0.5,
            lacunarity: 2.0,
            exponent: 1.2,
            heightScale: 40,
            baseHeight: 5,
        },
        colors: {
            low: new Color('#e6ccb3'), // Sand
            mid: new Color('#d9b382'), // Darker Sand
            high: new Color('#cc9966'), // Reddish Sand
            peak: new Color('#bf8040'), // Dark Rock
        },
    },
    PLAINS: {
        name: 'Plains',
        heightParams: {
            scale: 0.002,
            octaves: 3,
            persistence: 0.5,
            lacunarity: 2.0,
            exponent: 1.0,
            heightScale: 30,
            baseHeight: 10,
        },
        colors: {
            low: new Color('#8fb359'), // Grass
            mid: new Color('#6fa345'), // Darker Grass
            high: new Color('#4f8f33'), // Forest Green
            peak: new Color('#808080'), // Stone
        },
    },
    FOREST: {
        name: 'Forest',
        heightParams: {
            scale: 0.005,
            octaves: 4,
            persistence: 0.6,
            lacunarity: 2.2,
            exponent: 1.1,
            heightScale: 80,
            baseHeight: 15,
        },
        colors: {
            low: new Color('#2d5a27'), // Dark Green
            mid: new Color('#1e421b'), // Darker Green
            high: new Color('#4a3c31'), // Brown (Trunks/Dirt)
            peak: new Color('#666666'), // Stone
        },
    },
    SNOW: {
        name: 'Snow',
        heightParams: {
            scale: 0.004,
            octaves: 5,
            persistence: 0.6,
            lacunarity: 2.0,
            exponent: 1.3,
            heightScale: 150,
            baseHeight: 40,
        },
        colors: {
            low: new Color('#ffffff'), // Snow
            mid: new Color('#e6e6e6'), // Dirty Snow
            high: new Color('#cccccc'), // Grey Rock
            peak: new Color('#a0a0a0'), // Dark Rock
        },
    },
};

// Biome Selection Logic
const TEMP_SCALE = 0.001;
const HUMID_SCALE = 0.001;

export function getBiomeWeights(x: number, z: number): { biome: Biome; weight: number }[] {
    // Generate temperature and humidity values [-1, 1]
    const temp = noise2D(x * TEMP_SCALE, z * TEMP_SCALE);
    const humidity = noise2D(x * HUMID_SCALE + 1000, z * HUMID_SCALE + 1000);

    // Normalize to [0, 1] roughly
    const t = (temp + 1) / 2;
    const h = (humidity + 1) / 2;

    // Determine biome weights based on proximity to "ideal" conditions
    // This is a simplified version; a more robust one would use Voronoi or similar
    // For now, we'll just use simple thresholds with linear blending

    // Define biome centers in (temp, humidity) space
    // Desert: Hot, Dry
    // Plains: Moderate, Moderate
    // Forest: Moderate, Wet
    // Snow: Cold, Any

    const weights: { biome: Biome; weight: number }[] = [];

    // Distance to biome centers
    const distDesert = Math.sqrt(Math.pow(t - 0.8, 2) + Math.pow(h - 0.2, 2));
    const distPlains = Math.sqrt(Math.pow(t - 0.5, 2) + Math.pow(h - 0.5, 2));
    const distForest = Math.sqrt(Math.pow(t - 0.5, 2) + Math.pow(h - 0.8, 2));
    const distSnow = Math.sqrt(Math.pow(t - 0.2, 2)); // Snow depends mostly on temp

    // Convert distances to weights (inverse distance)
    // Use a sharper falloff to make distinct regions
    const wDesert = Math.max(0, 1 - distDesert * 3);
    const wPlains = Math.max(0, 1 - distPlains * 3);
    const wForest = Math.max(0, 1 - distForest * 3);
    const wSnow = Math.max(0, 1 - distSnow * 3);

    const totalWeight = wDesert + wPlains + wForest + wSnow;

    if (totalWeight > 0.001) {
        if (wDesert > 0) weights.push({ biome: BIOMES.DESERT, weight: wDesert / totalWeight });
        if (wPlains > 0) weights.push({ biome: BIOMES.PLAINS, weight: wPlains / totalWeight });
        if (wForest > 0) weights.push({ biome: BIOMES.FOREST, weight: wForest / totalWeight });
        if (wSnow > 0) weights.push({ biome: BIOMES.SNOW, weight: wSnow / totalWeight });
    } else {
        // Fallback to Plains if in a "void" (shouldn't happen often with these params)
        weights.push({ biome: BIOMES.PLAINS, weight: 1 });
    }

    return weights;
}
