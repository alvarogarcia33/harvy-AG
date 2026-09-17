import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  OrthographicCamera,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  FORMATION_CONFIG,
  FORMATION_CYCLE_DURATION,
} from "./formationConfig";
import {
  REFERENCE_IMAGE,
  buildParticleTargets,
  type ParticleTargetData,
  type ReferenceCrop,
} from "./particleTargets";
import {
  emitterFragmentShader,
  emitterVertexShader,
  humanoidFragmentShader,
  humanoidVertexShader,
} from "./shaders/humanoidShaders";

declare global {
  interface Window {
    __FORMATION_TIME__?: number;
  }
}

function resolveAnimationTime(naturalTime: number) {
  if (Number.isFinite(window.__FORMATION_TIME__)) {
    return window.__FORMATION_TIME__!;
  }
  const queryTime = Number(
    new URLSearchParams(window.location.search).get("formationTime"),
  );
  return Number.isFinite(queryTime) && window.location.search.includes("formationTime=")
    ? queryTime
    : naturalTime;
}

export interface ParticleHumanoidProps {
  sourceUrl?: string;
  maxParticles?: number;
  luminanceThreshold?: number;
  maxRgbThreshold?: number;
  crop?: ReferenceCrop;
  debugReferenceMode?: boolean;
  className?: string;
  onReady?: (targets: ParticleTargetData) => void;
}

function CameraFit({ aspect }: { aspect: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const orthographic = camera as OrthographicCamera;
    const planeHeight = 4;
    const planeWidth = planeHeight * aspect;
    orthographic.zoom =
      Math.min(size.width / planeWidth, size.height / planeHeight) * 0.94;
    orthographic.updateProjectionMatrix();
  }, [aspect, camera, size.height, size.width]);
  return null;
}

function ParticleCloud({ targets }: { targets: ParticleTargetData }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const animationStartRef = useRef<number | null>(null);
  const fpsRef = useRef({ frames: 0, start: 0, reported: false });
  const { gl } = useThree();
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(targets.position, 3));
    next.setAttribute(
      "aTargetPosition",
      new BufferAttribute(targets.targetPosition, 3),
    );
    next.setAttribute(
      "aStartPosition",
      new BufferAttribute(targets.startPosition, 3),
    );
    next.setAttribute("aControl1", new BufferAttribute(targets.control1, 3));
    next.setAttribute("aControl2", new BufferAttribute(targets.control2, 3));
    next.setAttribute("aColor", new BufferAttribute(targets.color, 3));
    next.setAttribute("aSize", new BufferAttribute(targets.size, 1));
    next.setAttribute("aSeed", new BufferAttribute(targets.seed, 1));
    next.setAttribute(
      "aBrightness",
      new BufferAttribute(targets.brightness, 1),
    );
    next.setAttribute("aPhase", new BufferAttribute(targets.phase, 1));
    next.setAttribute("aGroup", new BufferAttribute(targets.group, 1));
    next.setAttribute(
      "aFlowFamily",
      new BufferAttribute(targets.flowFamily, 1),
    );
    next.setAttribute("aDelay", new BufferAttribute(targets.delay, 1));
    next.setAttribute("aDuration", new BufferAttribute(targets.duration, 1));
    next.computeBoundingSphere();
    return next;
  }, [targets]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
      uPointScale: { value: FORMATION_CONFIG.particleSize },
      uCycleDuration: { value: FORMATION_CYCLE_DURATION },
      uFormationDuration: { value: FORMATION_CONFIG.formationDuration },
      uSettleDuration: { value: FORMATION_CONFIG.settleDuration },
      uTurbulenceStrength: { value: FORMATION_CONFIG.turbulenceStrength },
      uLoopAnimation: { value: FORMATION_CONFIG.loopAnimation ? 1 : 0 },
      uEmitterPosition: {
        value: new Vector3(...FORMATION_CONFIG.emitterPosition),
      },
    }),
    [gl],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    const elapsed = clock.getElapsedTime();
    if (animationStartRef.current === null) {
      animationStartRef.current = elapsed;
      fpsRef.current.start = performance.now();
    }
    const naturalTime = elapsed - animationStartRef.current;
    materialRef.current.uniforms.uTime.value = resolveAnimationTime(naturalTime);

    if (!fpsRef.current.reported) {
      fpsRef.current.frames += 1;
      if (fpsRef.current.frames >= 240) {
        const measuredSeconds = (performance.now() - fpsRef.current.start) / 1000;
        const fps = fpsRef.current.frames / Math.max(0.001, measuredSeconds);
        console.info(
          `[ParticleHumanoid] approx FPS: ${fps.toFixed(1)} · particles: ${targets.count}`,
        );
        fpsRef.current.reported = true;
      }
    }
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={humanoidVertexShader}
        fragmentShader={humanoidFragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function EmitterGlow() {
  const materialRef = useRef<ShaderMaterial>(null);
  const animationStartRef = useRef<number | null>(null);
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array(FORMATION_CONFIG.emitterPosition),
        3,
      ),
    );
    return next;
  }, []);
  const { gl } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
      uEmitterSize: { value: FORMATION_CONFIG.emitterSize },
      uEmitterGlow: { value: FORMATION_CONFIG.emitterGlow },
      uCycleDuration: { value: FORMATION_CYCLE_DURATION },
    }),
    [gl],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    const elapsed = clock.getElapsedTime();
    if (animationStartRef.current === null) animationStartRef.current = elapsed;
    const naturalTime = elapsed - animationStartRef.current;
    materialRef.current.uniforms.uTime.value = resolveAnimationTime(naturalTime);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={emitterVertexShader}
        fragmentShader={emitterFragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export function ParticleHumanoid({
  sourceUrl = REFERENCE_IMAGE,
  maxParticles = FORMATION_CONFIG.particleCount,
  luminanceThreshold = 0.095,
  maxRgbThreshold = 0.155,
  crop,
  debugReferenceMode = false,
  className,
  onReady,
}: ParticleHumanoidProps) {
  const [targets, setTargets] = useState<ParticleTargetData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTargets(null);
    setError(null);
    buildParticleTargets(sourceUrl, {
      maxParticles,
      luminanceThreshold,
      maxRgbThreshold,
      crop,
    })
      .then((nextTargets) => {
        if (cancelled) return;
        setTargets(nextTargets);
        onReady?.(nextTargets);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message =
          reason instanceof Error ? reason.message : "Error al procesar la referencia.";
        console.error(message);
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, maxParticles, luminanceThreshold, maxRgbThreshold, crop, onReady]);

  return (
    <div className={className} role="img" aria-label="Humanoide formado por partículas GPU desde un emisor inferior">
      {debugReferenceMode ? (
        <img
          src={targets?.debugReferenceUrl ?? sourceUrl}
          alt="Referencia de calibración"
          className="pointer-events-none absolute inset-[3%] size-[94%] object-contain opacity-25"
        />
      ) : null}

      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], near: 0.1, far: 20, zoom: 100 }}
        dpr={0.75}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(new Color("#02070a"), debugReferenceMode ? 0 : 1);
          gl.toneMappingExposure = 1;
        }}
      >
        {targets ? (
          <>
            <CameraFit aspect={targets.aspect} />
            <EmitterGlow />
            <ParticleCloud targets={targets} />
          </>
        ) : null}
      </Canvas>

      {!targets && !error ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[10px] tracking-[0.2em] text-cyan-200/55 uppercase">
          Precalculando targets y flujos…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-[#02070a] p-8 text-center font-mono text-sm text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default ParticleHumanoid;
