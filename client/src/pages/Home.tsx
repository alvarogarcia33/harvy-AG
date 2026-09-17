import HolographicAvatar, {
  type AvatarState,
} from "@/components/HolographicAvatar";
import { useMicrophoneLevel } from "@/hooks/useMicrophoneLevel";
import {
  AudioLines,
  BrainCircuit,
  CircleDot,
  Code2,
  Mic,
  MicOff,
  Orbit,
  Play,
  Radio,
  Sparkles,
  Volume2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const stateOptions: Array<{
  value: AvatarState;
  label: string;
  icon: typeof CircleDot;
  description: string;
}> = [
  {
    value: "assembling",
    label: "Assembling",
    icon: Sparkles,
    description: "Materialización inicial",
  },
  {
    value: "idle",
    label: "Idle",
    icon: CircleDot,
    description: "Respiración ambiental",
  },
  {
    value: "listening",
    label: "Listening",
    icon: Radio,
    description: "Ondas de recepción",
  },
  {
    value: "thinking",
    label: "Thinking",
    icon: BrainCircuit,
    description: "Órbita de procesamiento",
  },
  {
    value: "speaking",
    label: "Speaking",
    icon: AudioLines,
    description: "Respuesta a la voz",
  },
];

const stateCopy: Record<AvatarState, { eyebrow: string; message: string }> = {
  assembling: {
    eyebrow: "BOOT SEQUENCE",
    message: "Reconstructing neural shell",
  },
  idle: { eyebrow: "SYSTEM READY", message: "Awaiting input" },
  listening: { eyebrow: "CHANNEL OPEN", message: "Listening" },
  thinking: { eyebrow: "NEURAL PROCESS", message: "Synthesizing response" },
  speaking: { eyebrow: "VOICE OUTPUT", message: "Speaking" },
};

function SignalBars({ level }: { level: number }) {
  return (
    <div className="signal-bars" aria-label={`Nivel de señal ${Math.round(level * 100)}%`}>
      {Array.from({ length: 18 }, (_, index) => {
        const threshold = index / 18;
        return (
          <span
            key={index}
            className={level + 0.08 >= threshold ? "is-active" : ""}
            style={{ height: `${7 + Math.sin(index * 1.7) * 4 + index * 0.7}px` }}
          />
        );
      })}
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<AvatarState>("assembling");
  const [intensity, setIntensity] = useState(0.92);
  const [autoSequence, setAutoSequence] = useState(true);
  const [assemblyProgress, setAssemblyProgress] = useState(0);
  const microphone = useMicrophoneLevel();

  useEffect(() => {
    if (state !== "assembling") {
      setAssemblyProgress(100);
      return;
    }
    setAssemblyProgress(0);
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(100, ((now - startedAt) / 2350) * 100);
      setAssemblyProgress(progress);
      if (progress < 100) {
        frame = requestAnimationFrame(tick);
      } else if (autoSequence) {
        window.setTimeout(() => setState("listening"), 260);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, autoSequence]);

  useEffect(() => {
    if (!autoSequence || state === "assembling") return;
    const sequence: AvatarState[] = ["listening", "thinking", "speaking", "idle"];
    const delays: Record<AvatarState, number> = {
      assembling: 2600,
      listening: 4100,
      thinking: 2600,
      speaking: 5200,
      idle: 3000,
    };
    const timer = window.setTimeout(() => {
      const current = sequence.indexOf(state);
      setState(sequence[(current + 1) % sequence.length]);
    }, delays[state]);
    return () => window.clearTimeout(timer);
  }, [state, autoSequence]);

  const liveLevel = useMemo(() => {
    if (microphone.active) return microphone.level;
    return state === "speaking" ? 0.58 : 0.12;
  }, [microphone.active, microphone.level, state]);

  const selectState = (nextState: AvatarState) => {
    setAutoSequence(false);
    setState(nextState);
  };

  const toggleMicrophone = async () => {
    if (microphone.active) {
      microphone.stop();
      return;
    }
    await microphone.start();
    setState("speaking");
    setAutoSequence(false);
  };

  const copy = stateCopy[state];

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Orbit size={18} strokeWidth={1.5} />
          </div>
          <div>
            <p className="brand-name">ECHO / CORE</p>
            <p className="brand-subtitle">Holographic interface prototype</p>
          </div>
        </div>
        <div className="runtime-status">
          <span className="runtime-dot" />
          WEBGL RUNTIME
          <span className="runtime-divider" />
          60 FPS TARGET
        </div>
      </header>

      <section className="workspace">
        <div className="visual-stage">
          <div className="stage-grid" />
          <div className="stage-vignette" />
          <div className="stage-corner corner-tl" />
          <div className="stage-corner corner-tr" />
          <div className="stage-corner corner-bl" />
          <div className="stage-corner corner-br" />

          <div className="stage-readout stage-readout-top">
            <span>{copy.eyebrow}</span>
            <span>SYNC 98.7%</span>
          </div>

          <HolographicAvatar
            state={state}
            audioLevel={microphone.active ? microphone.level : 0}
            intensity={intensity}
            particleCount={6500}
            className="avatar-canvas"
          />

          <div className="avatar-status" aria-live="polite">
            <div className="status-kicker">
              <span className="status-pulse" /> STATUS / 0{STATE_CODE_FOR_UI[state]}
            </div>
            <h1>{copy.message}</h1>
            <p>
              {state === "assembling"
                ? `${Math.round(assemblyProgress).toString().padStart(2, "0")}% COMPLETE`
                : "NEURAL LINK STABLE"}
            </p>
          </div>

          <div className="stage-footer">
            <div>
              <span>VOICE ENERGY</span>
              <SignalBars level={liveLevel} />
            </div>
            <div className="coordinate-readout">
              <span>X 00.142</span>
              <span>Y 01.806</span>
              <span>Z 00.524</span>
            </div>
          </div>
        </div>

        <aside className="control-rail">
          <div className="panel-heading">
            <div>
              <span className="section-index">01</span>
              <p>STATE MACHINE</p>
            </div>
            <button
              type="button"
              className={`auto-button ${autoSequence ? "is-active" : ""}`}
              onClick={() => setAutoSequence((value) => !value)}
              aria-pressed={autoSequence}
            >
              <Play size={12} fill="currentColor" /> AUTO
            </button>
          </div>

          <div className="state-list">
            {stateOptions.map((option, index) => {
              const Icon = option.icon;
              const selected = state === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`state-button ${selected ? "is-selected" : ""}`}
                  onClick={() => selectState(option.value)}
                  aria-pressed={selected}
                >
                  <span className="state-number">0{index + 1}</span>
                  <span className="state-icon">
                    <Icon size={17} strokeWidth={1.6} />
                  </span>
                  <span className="state-label">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="state-indicator" />
                </button>
              );
            })}
          </div>

          <div className="control-section">
            <div className="panel-heading compact">
              <div>
                <span className="section-index">02</span>
                <p>ENERGY PROFILE</p>
              </div>
              <span className="value-readout">{Math.round(intensity * 100)}%</span>
            </div>
            <label className="energy-slider">
              <span className="sr-only">Intensidad visual</span>
              <input
                type="range"
                min="0.5"
                max="1.35"
                step="0.01"
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </label>
            <div className="energy-labels">
              <span>LOW POWER</span>
              <span>OVERDRIVE</span>
            </div>
          </div>

          <div className="control-section audio-section">
            <div className="panel-heading compact">
              <div>
                <span className="section-index">03</span>
                <p>AUDIO INPUT</p>
              </div>
              <Volume2 size={15} />
            </div>
            <button
              type="button"
              className={`microphone-button ${microphone.active ? "is-live" : ""}`}
              onClick={toggleMicrophone}
            >
              <span>
                {microphone.active ? <MicOff size={18} /> : <Mic size={18} />}
              </span>
              <span>
                <strong>{microphone.active ? "DISCONNECT MIC" : "CONNECT MIC"}</strong>
                <small>
                  {microphone.active
                    ? "Driving live amplitude"
                    : "Use voice as animation signal"}
                </small>
              </span>
              <span className="mic-level">{Math.round(microphone.level * 100)}</span>
            </button>
            {microphone.error && (
              <p className="microphone-error">{microphone.error}</p>
            )}
          </div>

          <div className="api-preview">
            <div className="api-title">
              <Code2 size={14} /> COMPONENT API
            </div>
            <code>
              <span className="code-muted">&lt;</span>
              <span className="code-cyan">HolographicAvatar</span>
              <br />
              &nbsp;&nbsp;state=<span className="code-orange">"{state}"</span>
              <br />
              &nbsp;&nbsp;audioLevel=<span className="code-orange">&#123;level&#125;</span>
              <br />
              <span className="code-muted">/&gt;</span>
            </code>
          </div>
        </aside>
      </section>

      <footer className="page-footer">
        <span>
          <Zap size={12} fill="currentColor" /> PROCEDURAL GEOMETRY
        </span>
        <span>REACT THREE FIBER / GLSL</span>
        <span>NO EXTERNAL 3D ASSETS</span>
      </footer>
    </main>
  );
}

const STATE_CODE_FOR_UI: Record<AvatarState, number> = {
  assembling: 1,
  idle: 2,
  listening: 3,
  thinking: 4,
  speaking: 5,
};
