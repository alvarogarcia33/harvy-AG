import ParticleHumanoid from "@/components/humanoid/ParticleHumanoid";
import { FORMATION_CONFIG } from "@/components/humanoid/formationConfig";
import {
  REFERENCE_IMAGE,
  type ParticleTargetData,
} from "@/components/humanoid/particleTargets";
import { Eye, EyeOff, SlidersHorizontal, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ParticleHumanoidDemo() {
  const [sourceUrl, setSourceUrl] = useState(REFERENCE_IMAGE);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [maxParticles, setMaxParticles] = useState<number>(
    FORMATION_CONFIG.particleCount,
  );
  const [luminanceThreshold, setLuminanceThreshold] = useState(0.095);
  const [maxRgbThreshold, setMaxRgbThreshold] = useState(0.155);
  const [debugReferenceMode, setDebugReferenceMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState("Procesando píxeles…");
  const crop = useMemo(() => undefined, []);
  const handleReady = useCallback((targets: ParticleTargetData) => {
    setStatus(
      `${targets.count.toLocaleString("es-AR")} puntos · ` +
        `C ${targets.groupCounts[0]} / O ${targets.groupCounts[1]} / ` +
        `G ${targets.groupCounts[2]} / D ${targets.groupCounts[3]}`,
    );
  }, []);

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  return (
    <main className="relative h-screen min-h-[560px] overflow-hidden bg-[#02070a]">
      <ParticleHumanoid
        sourceUrl={sourceUrl}
        maxParticles={maxParticles}
        luminanceThreshold={luminanceThreshold}
        maxRgbThreshold={maxRgbThreshold}
        crop={crop}
        debugReferenceMode={debugReferenceMode}
        className="absolute inset-0"
        onReady={handleReady}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 font-mono text-[9px] tracking-[0.18em] text-cyan-100/45 uppercase sm:p-6">
        <span>Pixel → particle / static fidelity</span>
        <span>{status}</span>
      </div>

      <div className="absolute right-4 bottom-4 flex gap-2 sm:right-6 sm:bottom-6">
        <button
          type="button"
          onClick={() => setDebugReferenceMode((visible) => !visible)}
          className="grid size-10 place-items-center border border-cyan-300/25 bg-[#061117]/90 text-cyan-200 transition hover:border-cyan-300/55 hover:bg-[#09202a]"
          aria-label="Alternar referencia de calibración"
        >
          {debugReferenceMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          className="grid size-10 place-items-center border border-cyan-300/25 bg-[#061117]/90 text-cyan-200 transition hover:border-cyan-300/55 hover:bg-[#09202a]"
          aria-label="Configurar muestreo"
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>

      {settingsOpen ? (
        <aside className="absolute right-4 bottom-16 w-[min(330px,calc(100vw-2rem))] border border-cyan-300/20 bg-[#050d12]/95 p-4 font-mono shadow-2xl backdrop-blur-xl sm:right-6 sm:bottom-18">
          <div className="mb-4 text-[10px] tracking-[0.18em] text-cyan-100/65 uppercase">
            Muestreo literal
          </div>
          <label className="flex cursor-pointer items-center gap-3 border border-cyan-300/20 p-3 text-xs text-cyan-100/80 transition hover:border-cyan-300/50">
            <Upload className="size-4 text-cyan-300" />
            Reemplazar referencia
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                const nextUrl = URL.createObjectURL(file);
                setObjectUrl(nextUrl);
                setSourceUrl(nextUrl);
              }}
            />
          </label>

          <Control
            label="Máximo de puntos"
            value={maxParticles}
            display={maxParticles.toLocaleString("es-AR")}
            min={10000}
            max={40000}
            step={1000}
            onChange={setMaxParticles}
          />
          <Control
            label="Luminancia mínima"
            value={luminanceThreshold}
            display={luminanceThreshold.toFixed(3)}
            min={0.03}
            max={0.55}
            step={0.005}
            onChange={setLuminanceThreshold}
          />
          <Control
            label="Máximo RGB mínimo"
            value={maxRgbThreshold}
            display={maxRgbThreshold.toFixed(3)}
            min={0.08}
            max={0.45}
            step={0.005}
            onChange={setMaxRgbThreshold}
          />

          <button
            type="button"
            onClick={() => {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              setObjectUrl(null);
              setSourceUrl(REFERENCE_IMAGE);
              setMaxParticles(FORMATION_CONFIG.particleCount);
              setLuminanceThreshold(0.095);
              setMaxRgbThreshold(0.155);
            }}
            className="mt-4 text-[9px] tracking-[0.16em] text-cyan-200/45 uppercase hover:text-cyan-200"
          >
            Restaurar valores
          </button>
        </aside>
      ) : null}
    </main>
  );
}

interface ControlProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Control({ label, value, display, min, max, step, onChange }: ControlProps) {
  return (
    <label className="mt-4 block text-[10px] tracking-[0.14em] text-cyan-100/55 uppercase">
      {label} <span className="float-right text-cyan-300">{display}</span>
      <input
        className="mt-3 w-full accent-cyan-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
