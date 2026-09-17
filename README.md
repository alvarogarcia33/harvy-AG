# HARVY AG — Holographic Particle Avatar

Complete React, TypeScript, Three.js, and React Three Fiber source code for the **ECHO / CORE** holographic avatar interface.

This export corresponds to the published Manus WebDev checkpoint **`c350d2e6`** and includes the image-driven particle target generator, GPU formation animation, GLSL shaders, calibration interface, UI components, and a local copy of the supplied reference image.

## Requirements

- Node.js 22+
- pnpm 10+

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Production build

```bash
pnpm check
pnpm build
pnpm start
```

The Vite frontend is emitted to `dist/public`, and the production Express entrypoint is emitted to `dist/index.js`.

## Main implementation

| File | Purpose |
|---|---|
| `client/src/components/humanoid/ParticleHumanoid.tsx` | React Three Fiber scene, GPU geometry, uniforms, emitter, and lifecycle |
| `client/src/components/humanoid/particleTargets.ts` | Canvas pixel analysis, particle groups, target sampling, and precomputed formation attributes |
| `client/src/components/humanoid/formationConfig.ts` | Formation timing and visual configuration |
| `client/src/components/humanoid/shaders/humanoidShaders.ts` | GLSL formation, particle, and emitter shaders |
| `client/src/pages/ParticleHumanoidDemo.tsx` | Full-screen avatar preview and calibration controls |
| `client/public/assets/humanoid-reference-real.jpeg` | Local reference image used to generate particle targets |

## Rendering architecture

The final avatar uses one `THREE.Points` draw call for the humanoid and one for the lower emitter. Target positions and source-derived RGB attributes are calculated once from the bundled reference image. Start positions, Bézier control points, flow families, delays, and durations are also precomputed once. Per-frame animation runs in the vertex shader through a time uniform; React does not update particle positions frame by frame.

## Published version

The corresponding public deployment is available at:

https://holoavatar-f2dhi8ds.manus.space

## License and assets

The project source is exported to the repository owner. The bundled reference image is the user-supplied project asset and should be redistributed only with the owner's permission.
