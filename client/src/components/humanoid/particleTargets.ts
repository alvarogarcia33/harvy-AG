import {
  FLOW_FAMILY,
  FORMATION_CONFIG,
  type FlowFamily,
} from "./formationConfig";
import { mulberry32, rgbToHsv } from "./particleUtils";

/** Exact real reference used by ParticleHumanoid. */
export const REFERENCE_IMAGE =
  "/assets/humanoid-reference-real.jpeg";
export const DEFAULT_REFERENCE_URL = REFERENCE_IMAGE;

export interface ReferenceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const REFERENCE_CROP: ReferenceCrop = {
  x: 270,
  y: 255,
  width: 805,
  height: 620,
};

const REFERENCE_EXCLUSIONS: ReferenceCrop[] = [
  { x: 850, y: 520, width: 225, height: 160 },
];

export const PARTICLE_GROUP = {
  CYAN_STRUCTURE: 0,
  ORANGE_CORE: 1,
  GOLD_NECK: 2,
  OUTER_DUST: 3,
} as const;

export type ParticleGroup =
  (typeof PARTICLE_GROUP)[keyof typeof PARTICLE_GROUP];

export interface ParticleTargetOptions {
  maxParticles?: number;
  luminanceThreshold?: number;
  maxRgbThreshold?: number;
  seed?: number;
  crop?: ReferenceCrop;
  exclusions?: ReferenceCrop[];
  cellSize?: number;
}

export interface ParticleTargetData {
  count: number;
  sourceCandidateCount: number;
  sourceWidth: number;
  sourceHeight: number;
  aspect: number;
  crop: ReferenceCrop;
  position: Float32Array;
  targetPosition: Float32Array;
  startPosition: Float32Array;
  control1: Float32Array;
  control2: Float32Array;
  color: Float32Array;
  size: Float32Array;
  seed: Float32Array;
  brightness: Float32Array;
  phase: Float32Array;
  group: Float32Array;
  flowFamily: Float32Array;
  delay: Float32Array;
  duration: Float32Array;
  groupCounts: [number, number, number, number];
  debugReferenceUrl: string;
}

interface PixelCandidate {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  luminance: number;
  maxRgb: number;
  saturation: number;
  hue: number;
  contrast: number;
  importance: number;
  group: ParticleGroup;
}

interface DistanceField {
  distance: Int16Array;
  nearestGroup: Uint8Array;
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      const message = `ParticleHumanoid: no se pudo cargar REFERENCE_IMAGE: ${sourceUrl}`;
      console.error(message);
      reject(new Error(message));
    };
    image.src = sourceUrl;
  });
}

function resolveCrop(
  imageWidth: number,
  imageHeight: number,
  crop?: ReferenceCrop,
): ReferenceCrop {
  if (!crop) return { x: 0, y: 0, width: imageWidth, height: imageHeight };
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(crop.y)));
  const width = Math.max(1, Math.min(imageWidth - x, Math.round(crop.width)));
  const height = Math.max(1, Math.min(imageHeight - y, Math.round(crop.height)));
  return { x, y, width, height };
}

function isExcluded(x: number, y: number, exclusions: ReferenceCrop[]) {
  return exclusions.some(
    (region) =>
      x >= region.x &&
      x < region.x + region.width &&
      y >= region.y &&
      y < region.y + region.height,
  );
}

function isInsideHumanoidEnvelope(
  localX: number,
  localY: number,
  crop: ReferenceCrop,
) {
  const normalizedX =
    (localX / Math.max(1, crop.width - 1) - 0.5) * 2;
  const normalizedY = localY / Math.max(1, crop.height - 1);
  if (normalizedY <= 0.64) {
    const headX = normalizedX / 0.37;
    const headY = (normalizedY - 0.32) / 0.37;
    return headX * headX + headY * headY <= 1.2;
  }
  const shoulderHalfWidth = Math.min(
    0.98,
    0.28 + (normalizedY - 0.64) * 2.05,
  );
  return Math.abs(normalizedX) <= shoulderHalfWidth;
}

function pixelLuminance(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
) {
  const offset = (y * width + x) * 4;
  return (
    0.2126 * (data[offset] / 255) +
    0.7152 * (data[offset + 1] / 255) +
    0.0722 * (data[offset + 2] / 255)
  );
}

function localContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  center: number,
) {
  let sum = 0;
  let samples = 0;
  for (const [offsetX, offsetY] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ]) {
    const sampleX = x + offsetX;
    const sampleY = y + offsetY;
    if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
      continue;
    }
    sum += Math.abs(center - pixelLuminance(data, width, sampleX, sampleY));
    samples += 1;
  }
  return samples > 0 ? sum / samples : 0;
}

function classifyChromaticPixel(
  hue: number,
  saturation: number,
  luminance: number,
  maxRgb: number,
  contrast: number,
  normalizedX: number,
  normalizedY: number,
  luminanceThreshold: number,
  maxRgbThreshold: number,
): ParticleGroup | null {
  const usefulBrightness =
    luminance >= luminanceThreshold ||
    maxRgb >= maxRgbThreshold ||
    contrast >= 0.045;
  const cyanUseful =
    hue >= 0.46 &&
    hue <= 0.7 &&
    (saturation >= 0.13 ||
      (saturation >= 0.075 && contrast >= 0.085)) &&
    usefulBrightness;
  if (cyanUseful) return PARTICLE_GROUP.CYAN_STRUCTURE;

  const warm = hue <= 0.18 || hue >= 0.98;
  if (warm && saturation >= 0.1 && usefulBrightness) {
    const central = normalizedX >= 0.24 && normalizedX <= 0.76;
    if (central && normalizedY <= 0.54) return PARTICLE_GROUP.ORANGE_CORE;
    if (central && normalizedY > 0.42) return PARTICLE_GROUP.GOLD_NECK;
  }

  if (luminance >= 0.66 && normalizedX >= 0.3 && normalizedX <= 0.7) {
    return normalizedY < 0.56
      ? PARTICLE_GROUP.ORANGE_CORE
      : PARTICLE_GROUP.CYAN_STRUCTURE;
  }
  return null;
}

function nearbySupport(
  labels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 2,
) {
  let support = 0;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    const sampleY = y + offsetY;
    if (sampleY < 0 || sampleY >= height) continue;
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const sampleX = x + offsetX;
      if (sampleX < 0 || sampleX >= width) continue;
      if (labels[sampleY * width + sampleX] > 0) support += 1;
    }
  }
  return support;
}

function buildDistanceField(
  labels: Uint8Array,
  width: number,
  height: number,
  maxDistance: number,
): DistanceField {
  const distance = new Int16Array(labels.length);
  distance.fill(-1);
  const nearestGroup = new Uint8Array(labels.length);
  const queue = new Int32Array(labels.length);
  let read = 0;
  let write = 0;

  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === 0) continue;
    distance[index] = 0;
    nearestGroup[index] = labels[index] - 1;
    queue[write++] = index;
  }

  while (read < write) {
    const current = queue[read++];
    const currentDistance = distance[current];
    if (currentDistance >= maxDistance) continue;
    const x = current % width;
    const y = Math.floor(current / width);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const nextY = y + offsetY;
      if (nextY < 0 || nextY >= height) continue;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        if (nextX < 0 || nextX >= width) continue;
        const next = nextY * width + nextX;
        if (distance[next] >= 0) continue;
        distance[next] = currentDistance + 1;
        nearestGroup[next] = nearestGroup[current];
        queue[write++] = next;
      }
    }
  }
  return { distance, nearestGroup };
}

function collectCandidates(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  crop: ReferenceCrop,
  luminanceThreshold: number,
  maxRgbThreshold: number,
  exclusions: ReferenceCrop[],
) {
  const labels = new Uint8Array(crop.width * crop.height);
  const strongPixels: Array<PixelCandidate | null> = new Array(
    crop.width * crop.height,
  ).fill(null);

  for (let localY = 0; localY < crop.height; localY += 1) {
    const pixelY = crop.y + localY;
    for (let localX = 0; localX < crop.width; localX += 1) {
      const pixelX = crop.x + localX;
      if (isExcluded(pixelX, pixelY, exclusions)) continue;
      if (!isInsideHumanoidEnvelope(localX, localY, crop)) continue;
      const offset = (pixelY * canvasWidth + pixelX) * 4;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const maxRgb = Math.max(r, g, b);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const { h, s } = rgbToHsv(r, g, b);
      const contrast = localContrast(
        data,
        canvasWidth,
        canvasHeight,
        pixelX,
        pixelY,
        luminance,
      );
      const normalizedX = localX / Math.max(1, crop.width - 1);
      const normalizedY = localY / Math.max(1, crop.height - 1);
      const group = classifyChromaticPixel(
        h,
        s,
        luminance,
        maxRgb,
        contrast,
        normalizedX,
        normalizedY,
        luminanceThreshold,
        maxRgbThreshold,
      );
      if (group === null) continue;
      const importance =
        luminance * 0.36 +
        maxRgb * 0.2 +
        s * 0.18 +
        Math.min(contrast * 5, 1) * 0.26;
      const index = localY * crop.width + localX;
      labels[index] = group + 1;
      strongPixels[index] = {
        x: localX,
        y: localY,
        r,
        g,
        b,
        luminance,
        maxRgb,
        saturation: s,
        hue: h,
        contrast,
        importance,
        group,
      };
    }
  }

  const field = buildDistanceField(labels, crop.width, crop.height, 14);
  const candidates: PixelCandidate[][] = [[], [], [], []];

  for (let localY = 0; localY < crop.height; localY += 1) {
    const pixelY = crop.y + localY;
    for (let localX = 0; localX < crop.width; localX += 1) {
      const pixelX = crop.x + localX;
      if (isExcluded(pixelX, pixelY, exclusions)) continue;
      if (!isInsideHumanoidEnvelope(localX, localY, crop)) continue;
      const index = localY * crop.width + localX;
      const strong = strongPixels[index];
      if (strong) {
        if (
          strong.group === PARTICLE_GROUP.CYAN_STRUCTURE &&
          nearbySupport(labels, crop.width, crop.height, localX, localY, 2) <= 3
        ) {
          strong.group = PARTICLE_GROUP.OUTER_DUST;
        }
        candidates[strong.group].push(strong);
        continue;
      }

      const distance = field.distance[index];
      if (distance < 1 || distance > 14) continue;
      const offset = (pixelY * canvasWidth + pixelX) * 4;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const maxRgb = Math.max(r, g, b);
      const minimum = Math.min(r, g, b);
      const chroma = maxRgb - minimum;
      if (maxRgb < 0.115 || chroma < 0.035) continue;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luminance < 0.06) continue;
      const { h, s } = rgbToHsv(r, g, b);
      const contrast = localContrast(
        data,
        canvasWidth,
        canvasHeight,
        pixelX,
        pixelY,
        luminance,
      );
      const nearestGroup = field.nearestGroup[index] as ParticleGroup;
      const immediateStructuralDetail =
        distance <= 1 &&
        nearestGroup !== PARTICLE_GROUP.OUTER_DUST &&
        (contrast >= 0.045 || s >= 0.12);
      const group = immediateStructuralDetail
        ? nearestGroup
        : PARTICLE_GROUP.OUTER_DUST;
      const normalizedX = localX / Math.max(1, crop.width - 1);
      const normalizedY = localY / Math.max(1, crop.height - 1);
      const faceInterior =
        Math.pow((normalizedX - 0.5) / 0.235, 2) +
          Math.pow((normalizedY - 0.35) / 0.32, 2) <
        1;
      if (group === PARTICLE_GROUP.OUTER_DUST && faceInterior) continue;
      const dustFalloff = 1 - distance / 15;
      const importance =
        luminance * 0.28 +
        maxRgb * 0.14 +
        s * 0.16 +
        Math.min(contrast * 5, 1) * 0.22 +
        dustFalloff * 0.2;
      candidates[group].push({
        x: localX,
        y: localY,
        r,
        g,
        b,
        luminance,
        maxRgb,
        saturation: s,
        hue: h,
        contrast,
        importance,
        group,
      });
    }
  }
  return candidates;
}

function stratifiedOrder(
  candidates: PixelCandidate[],
  cropWidth: number,
  cellSize: number,
) {
  const cellsAcross = Math.ceil(cropWidth / cellSize);
  const buckets = new Map<number, PixelCandidate[]>();
  for (const candidate of candidates) {
    const key =
      Math.floor(candidate.y / cellSize) * cellsAcross +
      Math.floor(candidate.x / cellSize);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  }
  const orderedBuckets: PixelCandidate[][] = Array.from(buckets.values());
  for (const bucket of orderedBuckets) {
    bucket.sort((a, b) => b.importance - a.importance);
  }
  orderedBuckets.sort(
    (a, b) => (b[0]?.importance ?? 0) - (a[0]?.importance ?? 0),
  );

  const ordered: PixelCandidate[] = [];
  let rank = 0;
  let added = true;
  while (added) {
    added = false;
    for (const bucket of orderedBuckets) {
      if (rank >= bucket.length) continue;
      ordered.push(bucket[rank]);
      added = true;
    }
    rank += 1;
  }
  return ordered;
}

function buildFlowFamily(
  targetX: number,
  targetY: number,
  group: ParticleGroup,
): FlowFamily {
  if (group === PARTICLE_GROUP.OUTER_DUST) return FLOW_FAMILY.DUST;
  if (group === PARTICLE_GROUP.ORANGE_CORE) return FLOW_FAMILY.FACE;
  if (group === PARTICLE_GROUP.GOLD_NECK) return FLOW_FAMILY.NECK;
  if (targetY < -0.35) {
    return targetX < 0
      ? FLOW_FAMILY.LEFT_SHOULDER
      : FLOW_FAMILY.RIGHT_SHOULDER;
  }
  return targetX < 0 ? FLOW_FAMILY.LEFT_HEAD : FLOW_FAMILY.RIGHT_HEAD;
}

function setVec3(array: Float32Array, index: number, x: number, y: number, z: number) {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

function buildFormationAttributes(
  index: number,
  targetX: number,
  targetY: number,
  group: ParticleGroup,
  random: () => number,
  startPosition: Float32Array,
  control1: Float32Array,
  control2: Float32Array,
  delay: Float32Array,
  duration: Float32Array,
  flowFamily: Float32Array,
) {
  const seed = random();
  const family = buildFlowFamily(targetX, targetY, group);
  const side = targetX < 0 ? -1 : 1;
  const [emitterX, emitterY, emitterZ] = FORMATION_CONFIG.emitterPosition;
  const spawnAngle = seed * Math.PI * 2;
  const spawnRadius = FORMATION_CONFIG.spawnRadius * (0.24 + random() * 0.76);
  setVec3(
    startPosition,
    index,
    emitterX + Math.cos(spawnAngle) * spawnRadius,
    emitterY + Math.sin(spawnAngle) * spawnRadius * 0.62,
    emitterZ + (random() - 0.5) * spawnRadius * 0.7,
  );

  let p1X = side * FORMATION_CONFIG.curveSpread * (0.1 + seed * 0.18);
  let p1Y = emitterY + 0.5 + seed * 0.25;
  let p2X = targetX * 0.72 + side * FORMATION_CONFIG.curveSpread * 0.18;
  let p2Y = targetY - 0.28;
  let baseDelay = 0.7;
  let baseDuration = 1.55;

  if (
    family === FLOW_FAMILY.LEFT_SHOULDER ||
    family === FLOW_FAMILY.RIGHT_SHOULDER
  ) {
    p1X = side * FORMATION_CONFIG.curveSpread * (0.28 + seed * 0.22);
    p1Y = emitterY + 0.38 + seed * 0.2;
    p2X = targetX * 0.68 + side * FORMATION_CONFIG.curveSpread * 0.28;
    p2Y = targetY - 0.18 + seed * 0.12;
    baseDelay = 0.42;
    baseDuration = 1.45;
  } else if (
    family === FLOW_FAMILY.LEFT_HEAD ||
    family === FLOW_FAMILY.RIGHT_HEAD
  ) {
    p1X = side * FORMATION_CONFIG.curveSpread * (0.16 + seed * 0.2);
    p1Y = emitterY + 0.82 + seed * 0.22;
    p2X = targetX * 0.76 + side * FORMATION_CONFIG.curveSpread * 0.22;
    p2Y = targetY - 0.42 + seed * 0.16;
    baseDelay = 1.25 + Math.max(0, targetY) * 0.42;
    baseDuration = 1.75;
  } else if (family === FLOW_FAMILY.FACE) {
    p1X = side * FORMATION_CONFIG.curveSpread * (0.1 + seed * 0.12);
    p1Y = emitterY + 0.82 + seed * 0.18;
    p2X = targetX * 0.68 + side * 0.08;
    p2Y = targetY - 0.34;
    baseDelay = 2.25;
    baseDuration = 1.38;
  } else if (family === FLOW_FAMILY.NECK) {
    p1X = targetX * 0.18 + (seed - 0.5) * 0.08;
    p1Y = emitterY + 0.54 + seed * 0.18;
    p2X = targetX * 0.72;
    p2Y = targetY - 0.22;
    baseDelay = 0.15;
    baseDuration = 1.28;
  } else if (family === FLOW_FAMILY.DUST) {
    p1X = side * FORMATION_CONFIG.curveSpread * (0.2 + seed * 0.34);
    p1Y = emitterY + 0.72 + seed * 0.38;
    p2X = targetX + side * FORMATION_CONFIG.curveSpread * (0.14 + seed * 0.2);
    p2Y = targetY - 0.32 + seed * 0.22;
    baseDelay = 2.75;
    baseDuration = 1.5;
  }

  const controlZ =
    FORMATION_CONFIG.flowStrength * (0.34 + seed * 0.66) * side;
  setVec3(control1, index, p1X, p1Y, controlZ);
  setVec3(control2, index, p2X, p2Y, -controlZ * 0.5);

  const targetHeight = Math.min(1, Math.max(0, (targetY + 2) / 4));
  const distance = Math.hypot(targetX - emitterX, targetY - emitterY);
  let particleDuration =
    baseDuration + distance * 0.16 + random() * 0.32;
  let particleDelay =
    baseDelay + targetHeight * 0.18 + random() * 0.28;
  particleDuration = Math.min(2.4, particleDuration);
  particleDelay = Math.min(
    particleDelay,
    FORMATION_CONFIG.formationDuration - particleDuration - 0.05,
  );
  delay[index] = Math.max(0.1, particleDelay);
  duration[index] = particleDuration;
  flowFamily[index] = family;
}

export async function buildParticleTargets(
  sourceUrl = REFERENCE_IMAGE,
  options: ParticleTargetOptions = {},
): Promise<ParticleTargetData> {
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("ParticleHumanoid: Canvas 2D no está disponible.");
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const isBuiltInReference = sourceUrl === REFERENCE_IMAGE;
  const crop = resolveCrop(
    canvas.width,
    canvas.height,
    options.crop ?? (isBuiltInReference ? REFERENCE_CROP : undefined),
  );
  const exclusions =
    options.exclusions ?? (isBuiltInReference ? REFERENCE_EXCLUSIONS : []);
  const luminanceThreshold = options.luminanceThreshold ?? 0.095;
  const maxRgbThreshold = options.maxRgbThreshold ?? 0.155;
  const maxParticles = Math.max(
    25000,
    Math.min(35000, Math.round(options.maxParticles ?? FORMATION_CONFIG.particleCount)),
  );
  const cellSize = Math.max(
    3,
    Math.min(6, Math.round(options.cellSize ?? FORMATION_CONFIG.samplingCellSize)),
  );
  const random = mulberry32(options.seed ?? 0x7a31c9e5);
  const candidates = collectCandidates(
    pixels.data,
    canvas.width,
    canvas.height,
    crop,
    luminanceThreshold,
    maxRgbThreshold,
    exclusions,
  );
  const sourceCandidateCount = candidates.reduce(
    (sum, groupCandidates) => sum + groupCandidates.length,
    0,
  );
  const orderedByGroup = candidates.map((groupCandidates) =>
    stratifiedOrder(groupCandidates, crop.width, cellSize),
  );

  const dustQuota = Math.min(
    3000,
    Math.floor(maxParticles * FORMATION_CONFIG.dustDensity),
  );
  const ratios = [0.62, 0.11, 0.13];
  const quotas = [
    Math.floor(maxParticles * ratios[0]),
    Math.floor(maxParticles * ratios[1]),
    Math.floor(maxParticles * ratios[2]),
    dustQuota,
  ];
  const selectedByGroup = orderedByGroup.map((ordered, groupIndex) =>
    ordered.slice(0, quotas[groupIndex]),
  );
  let selectedCount = selectedByGroup.reduce(
    (sum, groupCandidates) => sum + groupCandidates.length,
    0,
  );
  const fillCycle = [0, 0, 0, 1, 2];
  const cursors = selectedByGroup.map((selected) => selected.length);
  let cycleIndex = 0;
  let stalled = 0;
  while (selectedCount < maxParticles && stalled < fillCycle.length) {
    const groupIndex = fillCycle[cycleIndex % fillCycle.length];
    cycleIndex += 1;
    if (cursors[groupIndex] < orderedByGroup[groupIndex].length) {
      selectedByGroup[groupIndex].push(
        orderedByGroup[groupIndex][cursors[groupIndex]++],
      );
      selectedCount += 1;
      stalled = 0;
    } else {
      stalled += 1;
    }
  }

  const count = selectedCount;
  const worldHeight = 4;
  const worldWidth = worldHeight * (crop.width / crop.height);
  const position = new Float32Array(count * 3);
  const targetPosition = new Float32Array(count * 3);
  const startPosition = new Float32Array(count * 3);
  const control1 = new Float32Array(count * 3);
  const control2 = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const brightness = new Float32Array(count);
  const phase = new Float32Array(count);
  const group = new Float32Array(count);
  const flowFamily = new Float32Array(count);
  const delay = new Float32Array(count);
  const duration = new Float32Array(count);
  const groupCounts: [number, number, number, number] = [0, 0, 0, 0];
  let particleIndex = 0;

  selectedByGroup.forEach((groupCandidates, groupIndex) => {
    groupCandidates.forEach((pixel) => {
      const offset = particleIndex * 3;
      const targetX =
        (pixel.x / Math.max(1, crop.width - 1) - 0.5) * worldWidth;
      const targetY =
        (0.5 - pixel.y / Math.max(1, crop.height - 1)) * worldHeight;
      targetPosition[offset] = targetX;
      targetPosition[offset + 1] = targetY;
      color[offset] = pixel.r;
      color[offset + 1] = pixel.g;
      color[offset + 2] = pixel.b;

      const visualBrightness = Math.max(pixel.luminance, pixel.maxRgb * 0.68);
      brightness[particleIndex] = visualBrightness;
      const baseSize =
        groupIndex === PARTICLE_GROUP.OUTER_DUST
          ? 0.28
          : groupIndex === PARTICLE_GROUP.ORANGE_CORE
            ? 0.7
            : groupIndex === PARTICLE_GROUP.GOLD_NECK
              ? 0.78
              : 0.86;
      const brightnessScale =
        groupIndex === PARTICLE_GROUP.OUTER_DUST
          ? 0.5
          : groupIndex === PARTICLE_GROUP.ORANGE_CORE
            ? 1.2
            : groupIndex === PARTICLE_GROUP.GOLD_NECK
              ? 1.3
              : 1.58;
      size[particleIndex] = baseSize + visualBrightness * brightnessScale;
      seed[particleIndex] = random();
      phase[particleIndex] = random();
      group[particleIndex] = groupIndex;
      buildFormationAttributes(
        particleIndex,
        targetX,
        targetY,
        groupIndex as ParticleGroup,
        random,
        startPosition,
        control1,
        control2,
        delay,
        duration,
        flowFamily,
      );
      position[offset] = startPosition[offset];
      position[offset + 1] = startPosition[offset + 1];
      position[offset + 2] = startPosition[offset + 2];
      groupCounts[groupIndex] += 1;
      particleIndex += 1;
    });
  });

  const debugCanvas = document.createElement("canvas");
  debugCanvas.width = crop.width;
  debugCanvas.height = crop.height;
  const debugContext = debugCanvas.getContext("2d");
  if (debugContext) {
    debugContext.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  }

  return {
    count,
    sourceCandidateCount,
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    aspect: crop.width / crop.height,
    crop,
    position,
    targetPosition,
    startPosition,
    control1,
    control2,
    color,
    size,
    seed,
    brightness,
    phase,
    group,
    flowFamily,
    delay,
    duration,
    groupCounts,
    debugReferenceUrl: debugCanvas.toDataURL("image/jpeg", 0.9),
  };
}
