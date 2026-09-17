export const PARTICLE_GROUP = {
  BLUE_STRUCTURE: 0,
  ORANGE_CORE: 1,
  GOLD_STRUCTURE: 2,
  DUST: 3,
} as const;

export type ParticleGroup =
  (typeof PARTICLE_GROUP)[keyof typeof PARTICLE_GROUP];

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta > 0.000001) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  return {
    h: hue,
    s: maximum <= 0.000001 ? 0 : delta / maximum,
    v: maximum,
  };
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCumulativeWeights(weights: number[]) {
  const cumulative = new Float64Array(weights.length);
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) {
    total += Math.max(0.000001, weights[index]);
    cumulative[index] = total;
  }
  return { cumulative, total };
}

export function pickWeightedIndex(
  cumulative: Float64Array,
  total: number,
  random: () => number,
) {
  const target = random() * total;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function mixChannel(source: number, target: number, amount: number) {
  return clamp(source + (target - source) * amount, 0, 1.45);
}
