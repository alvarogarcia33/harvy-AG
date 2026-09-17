import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Group,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from "three";
import { useEffect, useMemo, useRef } from "react";

export type AvatarState =
  | "assembling"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export interface HolographicAvatarProps {
  state?: AvatarState;
  audioLevel?: number;
  intensity?: number;
  particleCount?: number;
  className?: string;
  transparent?: boolean;
}

const STATE_CODE: Record<AvatarState, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  assembling: 4,
};

const PARTICLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uState;
  uniform float uAudio;
  uniform float uAssemble;
  attribute vec3 aTarget;
  attribute vec3 aScatter;
  attribute float aPhase;
  attribute float aSize;
  attribute float aRegion;
  attribute float aPower;
  varying float vAlpha;
  varying float vPower;

  float stateMask(float code) {
    return 1.0 - step(0.48, abs(uState - code));
  }

  void main() {
    float assembled = smoothstep(0.0, 1.0, uAssemble);
    float speaking = stateMask(3.0);
    float thinking = stateMask(2.0);
    float voice = speaking * (0.15 + uAudio * 0.85);
    vec3 p = mix(aScatter, aTarget, assembled);

    float crown = step(1.5, aRegion);
    float drift = fract(aPhase + uTime * (0.035 + voice * 0.08));
    p.y += crown * drift * (0.28 + voice * 0.55);
    p.x += crown * sin(uTime + aPhase * 31.0) * (0.025 + drift * 0.06);

    float shimmer = sin(uTime * 2.1 + aPhase * 34.0);
    p.xy += normalize(aTarget.xy + vec2(0.001)) * shimmer * 0.006 * assembled;
    p.x += thinking * cos(uTime * 1.1 + aPhase * 11.0) * 0.018;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = clamp(8.0 / -mvPosition.z, 0.7, 1.65);
    gl_PointSize = aSize * perspective * (1.0 + voice * 0.24);
    vAlpha = mix(0.02, 1.0, assembled) * (0.72 + shimmer * 0.28);
    vPower = aPower;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vPower;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.2, 0.0, d);
    float halo = smoothstep(0.5, 0.12, d);
    vec3 blue = mix(vec3(0.0, 0.42, 1.0), vec3(0.0, 0.9, 1.0), core + vPower * 0.25);
    gl_FragColor = vec4(blue * (0.68 + vPower * 0.7 + core), (halo * 0.55 + core * 0.78) * vAlpha);
  }
`;

const HEAD_SHAPE: Array<[number, number]> = [
  [0.1, 0.24],
  [0.18, 0.38],
  [0.36, 0.54],
  [0.61, 0.65],
  [0.84, 0.7],
  [0.96, 0.76],
  [1.08, 0.72],
  [1.3, 0.69],
  [1.5, 0.58],
  [1.67, 0.36],
  [1.75, 0.06],
];

function headWidth(y: number) {
  for (let index = 0; index < HEAD_SHAPE.length - 1; index += 1) {
    const [y0, width0] = HEAD_SHAPE[index];
    const [y1, width1] = HEAD_SHAPE[index + 1];
    if (y >= y0 && y <= y1) {
      return MathUtils.lerp(width0, width1, (y - y0) / (y1 - y0));
    }
  }
  return 0.05;
}

function headOutline() {
  return [
    new Vector3(0, 1.75, 0.02),
    new Vector3(-0.38, 1.66, 0.02),
    new Vector3(-0.62, 1.48, 0.02),
    new Vector3(-0.7, 1.26, 0.02),
    new Vector3(-0.72, 1.09, 0.02),
    new Vector3(-0.77, 0.98, 0.02),
    new Vector3(-0.71, 0.86, 0.02),
    new Vector3(-0.66, 0.62, 0.02),
    new Vector3(-0.53, 0.37, 0.02),
    new Vector3(-0.38, 0.19, 0.02),
    new Vector3(-0.22, 0.1, 0.02),
    new Vector3(0, 0.07, 0.02),
    new Vector3(0.22, 0.1, 0.02),
    new Vector3(0.38, 0.19, 0.02),
    new Vector3(0.53, 0.37, 0.02),
    new Vector3(0.66, 0.62, 0.02),
    new Vector3(0.71, 0.86, 0.02),
    new Vector3(0.77, 0.98, 0.02),
    new Vector3(0.72, 1.09, 0.02),
    new Vector3(0.7, 1.26, 0.02),
    new Vector3(0.62, 1.48, 0.02),
    new Vector3(0.38, 1.66, 0.02),
  ];
}

function tubeFrom(points: Vector3[], radius: number, closed = false) {
  return new TubeGeometry(
    new CatmullRomCurve3(points, closed, "centripetal", 0.45),
    Math.max(120, points.length * 12),
    radius,
    5,
    closed,
  );
}

interface DynamicLines {
  geometry: BufferGeometry;
  base: Float32Array;
  phase: Float32Array;
  warm: Float32Array;
}

function makeHeadTopology(): DynamicLines {
  const rows = 57;
  const segments = 76;
  const vertexCount = rows * segments * 2;
  const positions = new Float32Array(vertexCount * 3);
  const base = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const phase = new Float32Array(vertexCount);
  const warm = new Float32Array(vertexCount);
  const blue = new Color("#007fcf");
  const cyan = new Color("#12cfff");
  const orange = new Color("#ff5a00");
  const gold = new Color("#ffc42d");
  let vertex = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = 0.105 + (row / (rows - 1)) * 1.62;
    const width = headWidth(y) * 0.975;
    for (let segment = 0; segment < segments; segment += 1) {
      for (const endpoint of [segment / segments, (segment + 1) / segments]) {
        const normalizedX = -1 + endpoint * 2;
        const x = normalizedX * width;
        const edge = Math.pow(Math.abs(normalizedX), 5.0);
        const ellipse = Math.sqrt(
          Math.pow(x / 0.58, 2) + Math.pow((y - 0.78) / 0.58, 2),
        );
        const warmFactor = MathUtils.smoothstep(1 - ellipse, 0, 0.5);
        const hotFactor = MathUtils.smoothstep(1 - ellipse, 0.4, 0.9);
        const cool = new Color().lerpColors(blue, cyan, edge * 0.66);
        const warmColor = new Color().lerpColors(orange, gold, hotFactor);
        const color = cool.clone().lerp(warmColor, warmFactor);
        const p = vertex * 3;
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = 0.16;
        base[p] = x;
        base[p + 1] = y;
        base[p + 2] = 0.16;
        colors[p] = color.r;
        colors[p + 1] = color.g;
        colors[p + 2] = color.b;
        phase[vertex] = row * 0.34 + normalizedX * 4.6;
        warm[vertex] = warmFactor;
        vertex += 1;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return { geometry, base, phase, warm };
}

function lineGeometry(paths: Vector3[][], colorBuilder?: (point: Vector3) => Color) {
  const vertices: number[] = [];
  const colors: number[] = [];
  paths.forEach((path) => {
    for (let index = 0; index < path.length - 1; index += 1) {
      for (const point of [path[index], path[index + 1]]) {
        vertices.push(point.x, point.y, point.z);
        const color = colorBuilder?.(point) ?? new Color("#0084d8");
        colors.push(color.r, color.g, color.b);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

function makeNeckTopology() {
  const paths: Vector3[][] = [];
  for (let row = 0; row < 19; row += 1) {
    const t = row / 18;
    const y = 0.02 - t * 0.52;
    const width = 0.23 + t * 0.2;
    const path: Vector3[] = [];
    for (let segment = 0; segment <= 52; segment += 1) {
      const xNorm = -1 + (segment / 52) * 2;
      path.push(
        new Vector3(
          xNorm * width,
          y + (1 - xNorm * xNorm) * 0.022,
          0.11,
        ),
      );
    }
    paths.push(path);
  }
  return lineGeometry(paths);
}

function makeShoulderTopology() {
  const paths: Vector3[][] = [];
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 31; layer += 1) {
      const d = layer / 30;
      const start = new Vector3(
        side * (0.045 + d * 0.17),
        -1.34 + d * 0.62,
        0.06,
      );
      const control = new Vector3(
        side * (0.57 + d * 0.42),
        -0.63 + d * 0.25,
        0.06,
      );
      const end = new Vector3(
        side * (1.15 + d * 1.15),
        -0.78 - d * 0.23,
        0.04,
      );
      paths.push(new QuadraticBezierCurve3(start, control, end).getPoints(70));
    }
  }
  return lineGeometry(paths);
}

function makeShoulderOutlines() {
  const left = [
    new Vector3(-0.23, 0.08, 0.02),
    new Vector3(-0.24, -0.08, 0.02),
    new Vector3(-0.31, -0.26, 0.02),
    new Vector3(-0.5, -0.42, 0.02),
    new Vector3(-0.84, -0.53, 0.02),
    new Vector3(-1.24, -0.6, 0.02),
    new Vector3(-1.68, -0.72, 0.02),
    new Vector3(-2.12, -0.94, 0.02),
  ];
  const right = left.map((point) => new Vector3(-point.x, point.y, point.z));
  return {
    left: tubeFrom(left, 0.012),
    right: tubeFrom(right, 0.012),
    leftHalo: tubeFrom(left, 0.033),
    rightHalo: tubeFrom(right, 0.033),
    leftPoints: left,
    rightPoints: right,
  };
}

interface Filaments {
  geometry: BufferGeometry;
  base: Float32Array;
  phase: Float32Array;
}

function makeFilaments(): Filaments {
  const paths: Vector3[][] = [];
  const branches = [
    [-0.02, -0.13, -0.25],
    [-0.015, -0.08, -0.15],
    [0, 0, 0],
    [0.015, 0.08, 0.15],
    [0.02, 0.13, 0.25],
  ];
  branches.forEach(([bottom, middle, top]) => {
    const curve = new CatmullRomCurve3(
      [
        new Vector3(bottom, -1.31, 0.2),
        new Vector3(middle * 0.28, -1.07, 0.2),
        new Vector3(middle, -0.83, 0.19),
        new Vector3(top * 0.72, -0.57, 0.18),
        new Vector3(top, -0.32, 0.17),
        new Vector3(top * 0.82, -0.07, 0.16),
      ],
      false,
      "centripetal",
      0.5,
    );
    paths.push(curve.getPoints(54));
  });

  const vertices: number[] = [];
  const colors: number[] = [];
  const phases: number[] = [];
  const orange = new Color("#ff7b00");
  const gold = new Color("#ffd34d");
  paths.forEach((path, pathIndex) => {
    for (let index = 0; index < path.length - 1; index += 1) {
      for (const point of [path[index], path[index + 1]]) {
        vertices.push(point.x, point.y, point.z);
        const t = MathUtils.clamp((point.y + 1.31) / 1.24, 0, 1);
        const color = new Color().lerpColors(orange, gold, t);
        colors.push(color.r, color.g, color.b);
        phases.push(pathIndex * 0.8 + index * 0.16);
      }
    }
  });
  const base = new Float32Array(vertices);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  return { geometry, base, phase: new Float32Array(phases) };
}

function samplePolyline(points: Vector3[], t: number) {
  const scaled = t * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return points[index].clone().lerp(points[index + 1], scaled - index);
}

function makeParticles(count: number, shoulders: ReturnType<typeof makeShoulderOutlines>) {
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const regions = new Float32Array(count);
  const powers = new Float32Array(count);
  const head = headOutline();

  for (let index = 0; index < count; index += 1) {
    const p = index * 3;
    const roll = Math.random();
    let point: Vector3;
    let region = 0;

    if (roll < 0.56) {
      point = samplePolyline(head, Math.random());
      point.x += MathUtils.randFloatSpread(0.055);
      point.y += MathUtils.randFloatSpread(0.045);
      point.z += MathUtils.randFloatSpread(0.09);
    } else if (roll < 0.87) {
      const source = Math.random() > 0.5 ? shoulders.leftPoints : shoulders.rightPoints;
      point = samplePolyline(source, Math.random());
      point.x += MathUtils.randFloatSpread(0.06);
      point.y += MathUtils.randFloatSpread(0.055);
      point.z += MathUtils.randFloatSpread(0.08);
      region = 1;
    } else {
      point = new Vector3(
        MathUtils.randFloatSpread(0.9),
        MathUtils.randFloat(1.53, 2.05),
        MathUtils.randFloatSpread(0.25),
      );
      region = 2;
    }

    targets[p] = point.x;
    targets[p + 1] = point.y;
    targets[p + 2] = point.z;
    positions[p] = point.x;
    positions[p + 1] = point.y;
    positions[p + 2] = point.z;
    const angle = MathUtils.randFloat(0, Math.PI * 2);
    const radius = MathUtils.randFloat(1.5, 4.8);
    scatter[p] = Math.cos(angle) * radius;
    scatter[p + 1] = Math.sin(angle) * radius * 0.62;
    scatter[p + 2] = MathUtils.randFloat(-1.8, 1.1);
    phases[index] = Math.random();
    sizes[index] = MathUtils.randFloat(0.9, 2.25);
    regions[index] = region;
    powers[index] = MathUtils.randFloat(0.45, 1.15);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aTarget", new BufferAttribute(targets, 3));
  geometry.setAttribute("aScatter", new BufferAttribute(scatter, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aRegion", new BufferAttribute(regions, 1));
  geometry.setAttribute("aPower", new BufferAttribute(powers, 1));
  return geometry;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.08, "rgba(255,255,255,.95)");
  gradient.addColorStop(0.24, "rgba(255,180,35,.62)");
  gradient.addColorStop(0.52, "rgba(255,70,0,.2)");
  gradient.addColorStop(1, "rgba(255,40,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new CanvasTexture(canvas);
}

function AvatarScene({
  state,
  audioLevel,
  intensity,
  particleCount,
}: Required<Pick<HolographicAvatarProps, "state" | "audioLevel" | "intensity" | "particleCount">>) {
  const root = useRef<Group>(null);
  const particlesMaterial = useRef<ShaderMaterial>(null);
  const topologyMaterial = useRef<LineBasicMaterial>(null);
  const shoulderMaterial = useRef<LineBasicMaterial>(null);
  const outlineMaterial = useRef<MeshBasicMaterial>(null);
  const filamentMaterial = useRef<LineBasicMaterial>(null);
  const coreGroup = useRef<Group>(null);
  const chestGroup = useRef<Group>(null);
  const assembly = useRef(state === "assembling" ? 0 : 1);
  const audio = useRef(0);

  const head = useMemo(makeHeadTopology, []);
  const neck = useMemo(makeNeckTopology, []);
  const shoulderLines = useMemo(makeShoulderTopology, []);
  const shoulders = useMemo(makeShoulderOutlines, []);
  const headTube = useMemo(() => tubeFrom(headOutline(), 0.011, true), []);
  const headHalo = useMemo(() => tubeFrom(headOutline(), 0.031, true), []);
  const filaments = useMemo(makeFilaments, []);
  const particles = useMemo(
    () => makeParticles(particleCount, shoulders),
    [particleCount, shoulders],
  );
  const glow = useMemo(glowTexture, []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uState: { value: STATE_CODE[state] },
      uAudio: { value: 0 },
      uAssemble: { value: state === "assembling" ? 0 : 1 },
    }),
    [],
  );

  useEffect(() => {
    if (state === "assembling") assembly.current = 0;
  }, [state]);

  useEffect(
    () => () => {
      head.geometry.dispose();
      neck.dispose();
      shoulderLines.dispose();
      shoulders.left.dispose();
      shoulders.right.dispose();
      shoulders.leftHalo.dispose();
      shoulders.rightHalo.dispose();
      headTube.dispose();
      headHalo.dispose();
      filaments.geometry.dispose();
      particles.dispose();
      glow.dispose();
    }, [head, neck, shoulderLines, shoulders, headTube, headHalo, filaments, particles, glow],
  );

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    const fallback =
      state === "speaking"
        ? 0.3 + Math.pow(Math.max(0, Math.sin(time * 7.3)), 3) * 0.62
        : 0;
    audio.current = MathUtils.damp(
      audio.current,
      Math.max(audioLevel, fallback),
      10,
      delta,
    );
    if (state === "assembling") assembly.current = Math.min(1, assembly.current + delta * 0.42);
    else assembly.current = MathUtils.damp(assembly.current, 1, 10, delta);
    const reveal = MathUtils.smoothstep(assembly.current, 0.05, 0.95);

    if (particlesMaterial.current) {
      particlesMaterial.current.uniforms.uTime.value = time;
      particlesMaterial.current.uniforms.uState.value = MathUtils.damp(
        particlesMaterial.current.uniforms.uState.value,
        STATE_CODE[state],
        10,
        delta,
      );
      particlesMaterial.current.uniforms.uAudio.value = audio.current;
      particlesMaterial.current.uniforms.uAssemble.value = assembly.current;
    }

    const positions = head.geometry.attributes.position as BufferAttribute;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const p = vertex * 3;
      const baseX = head.base[p];
      const baseY = head.base[p + 1];
      const warm = head.warm[vertex];
      const phase = head.phase[vertex];
      const wave =
        Math.sin(time * (2.2 + audio.current * 5.0) + baseX * 12.0 + phase) *
        warm *
        (0.005 + audio.current * 0.018);
      positions.setX(vertex, baseX);
      positions.setY(vertex, baseY + wave);
      positions.setZ(vertex, 0.16);
    }
    positions.needsUpdate = true;

    const filamentPositions = filaments.geometry.attributes.position as BufferAttribute;
    for (let vertex = 0; vertex < filamentPositions.count; vertex += 1) {
      const p = vertex * 3;
      const baseX = filaments.base[p];
      const baseY = filaments.base[p + 1];
      const phase = filaments.phase[vertex];
      filamentPositions.setX(
        vertex,
        baseX + Math.sin(time * (2.2 + audio.current * 1.7) + phase) * 0.008,
      );
      filamentPositions.setY(vertex, baseY);
      filamentPositions.setZ(vertex, filaments.base[p + 2]);
    }
    filamentPositions.needsUpdate = true;

    if (root.current) {
      root.current.position.y = Math.sin(time * 0.6) * 0.008;
    }
    if (topologyMaterial.current) topologyMaterial.current.opacity = reveal * 0.74;
    if (shoulderMaterial.current) shoulderMaterial.current.opacity = reveal * 0.38;
    if (outlineMaterial.current) outlineMaterial.current.opacity = reveal * 0.92;
    if (filamentMaterial.current) filamentMaterial.current.opacity = reveal * 0.82;
    if (coreGroup.current) {
      const pulse = 1 + Math.sin(time * 3.2) * 0.025 + audio.current * 0.08;
      coreGroup.current.scale.setScalar(pulse * reveal);
    }
    if (chestGroup.current) {
      chestGroup.current.scale.setScalar((1 + Math.sin(time * 4.1) * 0.05) * reveal);
    }
  });

  const haloMaterial = {
    color: "#006eff",
    transparent: true,
    opacity: 0.14,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  } as const;

  return (
    <group ref={root} position={[0, 0.06, 0]}>
      <mesh geometry={headHalo}>
        <meshBasicMaterial {...haloMaterial} />
      </mesh>
      <mesh geometry={shoulders.leftHalo}>
        <meshBasicMaterial {...haloMaterial} />
      </mesh>
      <mesh geometry={shoulders.rightHalo}>
        <meshBasicMaterial {...haloMaterial} />
      </mesh>

      <mesh geometry={headTube}>
        <meshBasicMaterial
          ref={outlineMaterial}
          color="#00caff"
          transparent
          opacity={0.92}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={shoulders.left}>
        <meshBasicMaterial
          color="#00caff"
          transparent
          opacity={0.86}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={shoulders.right}>
        <meshBasicMaterial
          color="#00caff"
          transparent
          opacity={0.86}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <lineSegments geometry={head.geometry}>
        <lineBasicMaterial
          ref={topologyMaterial}
          vertexColors
          transparent
          opacity={0.74}
          blending={AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments geometry={neck}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.46}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments geometry={shoulderLines}>
        <lineBasicMaterial
          ref={shoulderMaterial}
          vertexColors
          transparent
          opacity={0.38}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      <points geometry={particles} frustumCulled={false}>
        <shaderMaterial
          ref={particlesMaterial}
          uniforms={uniforms}
          vertexShader={PARTICLE_VERTEX}
          fragmentShader={PARTICLE_FRAGMENT}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>

      <group ref={coreGroup}>
        <sprite position={[0, 0.78, 0.14]} scale={[1.3, 1.24, 1]}>
          <spriteMaterial
            map={glow}
            color="#ff5a00"
            transparent
            opacity={0.28}
            blending={AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </sprite>
        <sprite position={[0, 0.78, 0.145]} scale={[0.62, 0.58, 1]}>
          <spriteMaterial
            map={glow}
            color="#ffc12a"
            transparent
            opacity={0.34}
            blending={AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </sprite>
      </group>

      <lineSegments geometry={filaments.geometry}>
        <lineBasicMaterial
          ref={filamentMaterial}
          vertexColors
          transparent
          opacity={0.82}
          blending={AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>

      <group ref={chestGroup} position={[0, -1.31, 0.19]}>
        <sprite scale={[0.42, 0.42, 1]}>
          <spriteMaterial
            map={glow}
            color="#0078ff"
            transparent
            opacity={0.55}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshBasicMaterial color="#eaffff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function HolographicAvatar({
  state = "idle",
  audioLevel = 0,
  intensity = 1,
  particleCount = 6200,
  className,
  transparent = true,
}: HolographicAvatarProps) {
  return (
    <div className={className} role="img" aria-label={`Avatar holográfico en estado ${state}`}>
      <Canvas
        camera={{ position: [0, 0.04, 7.0], fov: 36, near: 0.1, far: 30 }}
        dpr={[1, 1.6]}
        gl={{ alpha: transparent, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(new Color("#02070b"), transparent ? 0 : 1);
          gl.toneMappingExposure = 0.96;
        }}
      >
        <AvatarScene
          state={state}
          audioLevel={audioLevel}
          intensity={intensity}
          particleCount={particleCount}
        />
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom
            mipmapBlur
            intensity={0.92 * intensity}
            luminanceThreshold={0.3}
            luminanceSmoothing={0.42}
            radius={0.65}
          />
          <Vignette eskil={false} offset={0.12} darkness={0.42} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default HolographicAvatar;
