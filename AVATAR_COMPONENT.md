# Holographic Avatar Component

`HolographicAvatar` is a reusable React Three Fiber component that procedurally renders a particle-and-contour humanoid. It does not require a GLB model or external textures.

## Install

```bash
pnpm add three @react-three/fiber @react-three/postprocessing postprocessing
pnpm add -D @types/three
```

Copy `client/src/components/HolographicAvatar.tsx` into the target project, then give its parent element an explicit width and height.

## Basic usage

```tsx
import { HolographicAvatar } from "./components/HolographicAvatar";

export function AssistantView() {
  return (
    <div style={{ width: "100%", height: 620 }}>
      <HolographicAvatar
        state="listening"
        intensity={0.92}
        particleCount={9500}
      />
    </div>
  );
}
```

## Audio-reactive usage

`audioLevel` expects a normalized amplitude between `0` and `1`. It can come from the microphone, a playing HTML audio element, a TTS stream, or any application state.

```tsx
<HolographicAvatar
  state={isSpeaking ? "speaking" : "listening"}
  audioLevel={voiceAmplitude}
  intensity={1}
/>
```

## Props

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `state` | `"assembling" \| "idle" \| "listening" \| "thinking" \| "speaking"` | `"idle"` | Selects the animation state. |
| `audioLevel` | `number` | `0` | Drives face energy and particle release during speech. |
| `intensity` | `number` | `1` | Multiplies glow and particle energy. A practical range is `0.35–1.3`. |
| `particleCount` | `number` | `6200` | Controls perimeter particle density. Use approximately `3500–5000` for low-power mobile devices and `6000–9500` on desktop. |
| `className` | `string` | — | Styles the component wrapper. The wrapper must have a measurable height. |
| `transparent` | `boolean` | `true` | Keeps the WebGL canvas background transparent for UI composition. |

## Architecture

The avatar is generated from a frontal anatomical topology designed around the supplied reference: a human head with crown, temples, small ear projections, cheeks, jaw and chin; a long neck; naturally sloping shoulder outlines; horizontal head scans whose color transitions directly from blue into the orange-gold facial nucleus; concentric shoulder arcs; five warm neural branches; and a deliberately small blue chest node. Particles are sampled only from the perimeter and crown, while selective bloom preserves the blue/orange separation.

`useMicrophoneLevel.ts` is an optional reference hook. In a production assistant, feed the component an amplitude derived from the TTS output rather than the microphone whenever the avatar is speaking.
