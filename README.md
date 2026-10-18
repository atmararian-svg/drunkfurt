# Drunkfurt

A first-person, cinematic interactive experience set in Frankfurt am Main at night.
This repository currently contains **Scene 1 — Arrival**: Frankfurt (Main) Hbf, Gleis 7, a few minutes before midnight.

![Arrival](docs/screens/01-arrival.png)

## Run

Requires Node 18+ (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck
```

Controls: **click** (or Enter/Space) to step out of the train. After that, click to capture
the mouse, **mouse** to look, **W A S D** / arrows to walk, **Shift** to hurry. Esc releases the
mouse. If the browser refuses pointer lock, hold the left button and drag to look.

## What is in Scene 1

- **Station**: a barrel-vaulted train shed modelled on the Hbf's 19th-century halls: lattice arch
  ribs on masonry piers, purlins, glazed vault, glazed gable apron at the open end, three halls
  side by side. It is a terminus (Kopfbahnhof): tracks end at buffer stops in front of a
  transverse concourse with shopfronts, a glazed gable and the main departure board, which is
  the bright focal point at the vanishing point.
- **Platform**: 76 cm above rail, paving, coping stones, white safety line, tactile strip,
  catenary over every track, lighting masts with linear luminaires, hanging destination displays
  (Zugzielanzeiger) with scrolling tickers, platform numbers, yellow section letters, the station
  name sign, a ticking platform clock, yellow DB departure posters, benches, bins, a vending
  machine and a marked smoking area.
- **Trains**: an original intercity design (not a copy of a production train). It has a swept
  car profile with tumblehome, a dark window band with lit interiors, plug doors, gangway bellows,
  bogies, roof equipment, and power cars with a lofted nose, windscreen and headlights. Our train
  on Gleis 7 has a real open vestibule. The train on Gleis 8 waits, partly dark, for a delayed
  departure.
- **Life**: walking, standing, smoking and sitting passengers (some give way to you), people
  crossing the concourse, a pigeon that walks off when you get close, dust in the light, a
  flickering tube far down the platform, scrolling tickers, the clock's second hand.
- **Light**: one spotlight per mast (three near the door cast shadows), a cold skylight, a
  faint bounce light so the trusses stay readable, the concourse lights, the vestibule light,
  and light spilling from train windows onto the platform. Post-processing is restrained: HDR
  bloom only above 1.0 luminance, ACES tone mapping, vignette and fine grain.
- **Interaction**: one prompt, *CLICK TO STEP OUT*. The click is a one-way state change
  (`arrival → stepping-out → platform`). A scripted Catmull-Rom shot leans you out, glances down
  at the gap, steps down 40 cm with a small landing dip and lifts the gaze down the platform.
  Free look is enabled only when the shot ends. The shot player refuses overlapping shots.

## Structure

```
src/
  App.tsx                 Canvas, post FX, UI overlay
  config/palette.ts       colour palette (red reserved for narrative beats)
  core/
    store.ts              narrative state (scene + phase), no per-frame React updates
    sequence.ts           ShotPlayer: scripted camera shots (keyframes, Catmull-Rom)
    geometry.ts           profile sweeps, clipping, GeoBatch (merge static parts per material)
    math.ts               damping, easing, seeded RNG
  player/
    FirstPersonRig.tsx    camera modes: anchored (parallax) / free (look + walk) / locked;
                          scripted shots take over via `cameraDirector`
    input.ts              keyboard, pointer lock, drag fallback
    playerState.ts        read-only visitor position for NPCs
  audio/AudioDirector.ts  audio graph and cue registry (no assets yet, see below)
  materials/
    materials.ts          shared material library
    textures.ts           all textures, generated procedurally on canvas
  effects/PostFX.tsx
  ui/Overlay.tsx          fade, letterbox, title card, prompt, hints
  scenes/station/         Scene 1: layout constants, hall, platform, tracks, train,
                          furniture, concourse, outside, passengers, pigeon, dust,
                          lighting, shots
```

To add a scene, create `scenes/<id>/` with its own layout, a scene component and its shots,
then extend `SceneId` and the phases in `core/store.ts`. Scripted beats (the confrontation,
time dilation, the car) should run on `cameraDirector`, so the rig's free mode never has to
handle them.

## Assets and placeholders

- **No external assets.** All geometry is procedural and every texture (paving, ballast,
  glazing, signage, displays, posters, window interiors, shopfronts) is drawn on a canvas at
  runtime, so there are no licensing questions. Fonts are system sans-serif.
- **Audio**: no sound is implemented or audible. `AudioDirector` builds the graph after the
  first click (autoplay-safe) and declares the planned cues (`stationAmbience`, `trainIdleHum`,
  `footstepPlatform`, `stepDown`) with `src: null`. Add licensed or recorded files to
  `public/audio/` and set `src`. It already has a world low-pass for the time-dilation scene,
  and a separate "body" bus for breathing and heartbeat that bypasses it.
- **Placeholders**: passengers are simple volumetric silhouettes. The buildings and road bridge
  beyond the open end are blocks. Train interiors are a painted texture, not geometry (except
  the open vestibule). Shopfront names are generic.
- Train numbers, times and destinations on the displays are fictional.

## Dev inspection hook

In dev builds `window.__drunkfurt` exposes `{ story, rigPose, input, requestTeleport, scene }`
so you can drive the camera from automated screenshots, for example
`__drunkfurt.story.setState({phase:'platform'}); __drunkfurt.requestTeleport(x, z, yaw, pitch)`.
It is not present in production builds.
