import { useCallback, useEffect, useRef, useState } from "react";

interface MicrophoneLevelController {
  level: number;
  active: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useMicrophoneLevel(): MicrophoneLevelController {
  const [level, setLevel] = useState(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setActive(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);

      streamRef.current = stream;
      contextRef.current = context;
      setActive(true);

      const sample = () => {
        analyser.getByteFrequencyData(values);
        let energy = 0;
        for (let index = 2; index < values.length * 0.55; index += 1) {
          energy += values[index] * values[index];
        }
        const rms = Math.sqrt(energy / (values.length * 0.55 - 2)) / 128;
        setLevel(Math.min(1, Math.max(0, (rms - 0.08) * 1.45)));
        frameRef.current = requestAnimationFrame(sample);
      };
      sample();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo acceder al micrófono.",
      );
      stop();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { level, active, error, start, stop };
}
