export const FORMATION_CONFIG = {
  particleCount: 32000,
  samplingDensity: 1,
  samplingCellSize: 4,
  formationDuration: 5,
  settleDuration: 0.6,
  holdDuration: 2,
  flowStrength: 0.16,
  curveSpread: 0.82,
  turbulenceStrength: 0.095,
  particleSize: 1.5,
  emitterSize: 68,
  emitterGlow: 1.55,
  emitterPosition: [-0.078, -1.72, 0.04] as const,
  faceEmitterSize: 330,
  faceEmitterGlow: 1.52,
  faceEmitterPosition: [-0.078, 0.48, 0.08] as const,
  spawnRadius: 0.055,
  dustDensity: 0.1,
  loopAnimation: true,
} as const;

export const FORMATION_CYCLE_DURATION =
  FORMATION_CONFIG.formationDuration +
  FORMATION_CONFIG.settleDuration +
  FORMATION_CONFIG.holdDuration;

export const FLOW_FAMILY = {
  LEFT_SHOULDER: 0,
  RIGHT_SHOULDER: 1,
  LEFT_HEAD: 2,
  RIGHT_HEAD: 3,
  FACE: 4,
  NECK: 5,
  DUST: 6,
} as const;

export type FlowFamily =
  (typeof FLOW_FAMILY)[keyof typeof FLOW_FAMILY];
