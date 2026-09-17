export const humanoidVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform float uCycleDuration;
  uniform float uFormationDuration;
  uniform float uSettleDuration;
  uniform float uTurbulenceStrength;
  uniform float uLoopAnimation;
  uniform vec3 uEmitterPosition;

  attribute vec3 aTargetPosition;
  attribute vec3 aStartPosition;
  attribute vec3 aControl1;
  attribute vec3 aControl2;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aGroup;
  attribute float aFlowFamily;
  attribute float aDelay;
  attribute float aDuration;

  varying vec3 vColor;
  varying float vBrightness;
  varying float vGroup;
  varying float vAlpha;
  varying float vTravel;
  varying float vSpark;

  vec3 cubicBezier(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    float oneMinusT = 1.0 - t;
    return
      oneMinusT * oneMinusT * oneMinusT * p0 +
      3.0 * oneMinusT * oneMinusT * t * p1 +
      3.0 * oneMinusT * t * t * p2 +
      t * t * t * p3;
  }

  float hash(float value) {
    return fract(sin(value * 91.3458) * 47453.5453);
  }

  void main() {
    float cycleTime = uLoopAnimation > 0.5
      ? mod(uTime, uCycleDuration)
      : min(uTime, uCycleDuration);
    float rawProgress = (cycleTime - aDelay) / max(0.001, aDuration);
    float progress = clamp(rawProgress, 0.0, 1.0);
    float easedProgress = 1.0 - pow(1.0 - progress, 3.0);
    float spawned = step(0.0, rawProgress);
    float travelEnvelope = sin(3.14159265 * progress);

    vec3 position = cubicBezier(
      aStartPosition,
      aControl1,
      aControl2,
      aTargetPosition,
      easedProgress
    );

    float familyPhase = aFlowFamily * 0.83 + aSeed * 13.7;
    vec3 organicFlow = vec3(
      sin(uTime * 2.15 + familyPhase + position.y * 2.7),
      cos(uTime * 1.72 + familyPhase * 1.31 + position.x * 2.1),
      sin(uTime * 1.43 + familyPhase * 0.77)
    );
    organicFlow *= uTurbulenceStrength * travelEnvelope * (0.38 + aSeed * 0.62);
    position += organicFlow;

    float arrivalTime = aDelay + aDuration;
    float settleProgress = clamp(
      (cycleTime - arrivalTime) / max(0.001, uSettleDuration),
      0.0,
      1.0
    );
    float settleEnvelope = step(1.0, rawProgress) * (1.0 - settleProgress);
    vec3 settleOffset = vec3(
      sin(uTime * 16.0 + aPhase * 17.0),
      cos(uTime * 13.0 + aPhase * 11.0),
      0.0
    ) * 0.0035 * settleEnvelope;
    position += settleOffset;

    // Exact lock: once settling is complete, no positional offset remains.
    if (settleProgress >= 1.0) position = aTargetPosition;
    if (rawProgress < 0.0) position = aStartPosition;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float travelSize = mix(0.58, 1.0, easedProgress);
    float spark = step(0.965, hash(aSeed + floor(aPhase * 31.0)));
    float sparkEnvelope = spark * travelEnvelope;
    gl_PointSize =
      aSize * uPixelRatio * uPointScale * (travelSize + sparkEnvelope * 0.72);

    float spawnAlpha = smoothstep(0.0, 0.055, progress) * spawned;
    float stablePulse = 0.97 + 0.03 * sin(uTime * 1.4 + aPhase * 6.28318);
    vAlpha = spawnAlpha * stablePulse;
    vColor = aColor;
    vBrightness = aBrightness;
    vGroup = aGroup;
    vTravel = travelEnvelope;
    vSpark = sparkEnvelope;
  }
`;

export const humanoidFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;
  varying float vGroup;
  varying float vAlpha;
  varying float vTravel;
  varying float vSpark;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(center);
    if (distanceToCenter > 0.5) discard;

    float core = smoothstep(0.18, 0.0, distanceToCenter);
    float halo = smoothstep(0.5, 0.08, distanceToCenter);
    float cyan = 1.0 - step(0.45, abs(vGroup - 0.0));
    float orange = 1.0 - step(0.45, abs(vGroup - 1.0));
    float gold = 1.0 - step(0.45, abs(vGroup - 2.0));
    float dust = step(2.5, vGroup);
    float weak = smoothstep(0.04, 0.3, vBrightness);
    float groupAlpha = mix(1.0, 0.28, dust);
    float haloStrength =
      0.26 + cyan * 0.035 + gold * 0.045 - orange * 0.1 - dust * 0.15;
    float alpha = (core + halo * haloStrength)
      * mix(0.3, 1.0, weak)
      * groupAlpha
      * vAlpha
      * 1.52;
    float groupEmission =
      1.18 + cyan * 1.48 + orange * 2.3 + gold * 0.5 - dust * 0.5;
    vec3 color = vColor * mix(0.95, 2.05, weak) * groupEmission;
    color += vColor * (vTravel * 0.12 + vSpark * 0.9);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const emitterVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uEmitterSize;
  uniform float uCycleDuration;
  varying float vPulse;

  void main() {
    float cycleTime = mod(uTime, uCycleDuration);
    float ignition = 1.0;
    vPulse = ignition * (0.88 + 0.12 * sin(uTime * 4.2));
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uEmitterSize * uPixelRatio * (0.92 + 0.08 * sin(uTime * 3.7));
  }
`;

export const emitterFragmentShader = /* glsl */ `
  uniform float uEmitterGlow;
  varying float vPulse;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(center);
    if (distanceToCenter > 0.5) discard;
    float whiteCore = smoothstep(0.115, 0.0, distanceToCenter);
    float cyanCore = smoothstep(0.24, 0.055, distanceToCenter);
    float halo = smoothstep(0.5, 0.12, distanceToCenter);
    vec3 color =
      vec3(1.0) * whiteCore * 1.5 +
      vec3(0.0, 0.78, 1.0) * cyanCore * 1.25 +
      vec3(0.0, 0.32, 1.0) * halo * 0.62;
    float alpha = (whiteCore + cyanCore * 0.86 + halo * 0.34) * vPulse;
    gl_FragColor = vec4(color * uEmitterGlow, alpha);
  }
`;
