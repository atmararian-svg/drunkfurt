# DRUNKFURT

A scroll-driven, first-person 3D comic set in Frankfurt am Main at night.
DRUNKFURT is the name of the experience and its fictional world; Frankfurt am Main is the real
setting, so real places and railway signage keep their real names.
Two episodes are built:

- **Episode 01, Arrival**: Frankfurt (Main) Hbf, platform 7, a few minutes before midnight.
- **Episode 02, City**: out of the station, down the boulevard towards the towers, and a stranger who wants your bag.

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

**Scroll** to move through the story (wheel, trackpad, touch, keyboard). **Click** or **Enter**
jumps to the next composed beat. Moving the mouse lets you look around a few degrees; the
camera always returns to the composed frame.

## Interaction model

There is no walking. The camera is on rails: each episode owns a span of the page's scroll
and a camera track (keyframes with position, yaw, pitch, roll and field of view, sampled with
Catmull-Rom). Scroll position → global progress → episode + local progress → camera pose.
Progress is damped so scrolling feels like moving a dolly. Footstep bob appears only while
the camera is travelling. Scroll also drives events: in Episode 1 a traveller crosses in
front of you and the train door slides shut behind you, both scrubbing backwards when you
scroll up. Ambient life (pigeon, dust, tickers, the clock, one flickering tube) runs on time.

## People in the station

**Figures** (`src/characters/`) are illustrated people, not capsule mannequins:

- `shapes.ts` lofts the body through cross-sections taken where anatomy changes:
  - the torso runs from the waist and ribcage through the chest and armpits, then the
    shoulders slope through the trapezius into the neck;
  - the deltoids are domes over the shoulder joints, below the trapezius line;
  - limbs swell at the thigh, the calf and the forearm, and trousers fall straight;
  - the head (`anatomy.ts`) runs from the chin through the jaw, cheekbones and brow to the
    crown, with the back of the skull behind the face;
  - hands have a palm, a thumb and four fingers of three phalanges each. An open hand and a
    fist come from the same generator, with different finger curl;
  - shoes have a heel counter, an instep rising to an ankle collar, laces, a rounded toe box,
    a sole slightly wider than the upper and a little toe spring.
- Outfits change the silhouette: coat, parka, jacket, hoodie, dress. Props include a
  backpack, shoulder bag, tote, rolling suitcase and phone. Builds vary from slim to broad
  and soft, and heights from 1.62 m to 1.86 m.
- `figure.ts` builds a skeleton (hips → spine → head and shoulders → elbows → wrists, plus
  hips → knees → ankles). Each person is one skinned mesh with vertex colours:
  - each part is weighted to its bone, blending into the neighbouring bone around every
    joint, so elbows, knees, hips and shoulders bend instead of opening a gap;
  - coat skirts and hems hang from the hips and follow the legs part of the way;
  - hands are separate meshes on the wrists (open or a fist).
- `pose.ts` poses figures by activity:
  - waiting, hands in pockets, a phone in hand, a phone at the ear;
  - talking and listening (arms folded, nodding), looking up at the board;
  - smoking, adjusting a backpack, sitting, resting a hand on a suitcase.
- Standing figures shift their weight between legs, breathe, and glance around. Gestures
  come from a deterministic event scheduler, so two people never move in sync.
- The walk is built from a gait cycle:
  - heel strike, a flexed knee in swing, a flat foot in stance and a push-off;
  - pelvis rotation and drop, with shoulders counter-rotating and arms swinging softly;
  - the hips are placed so the stance foot stays on the floor, and the cycle advances by
    distance walked, solved for each figure's actual leg lengths;
  - a walk from standing starts with the weight on the foot under the hips.
- Feet are pinned while they carry weight (`feet.ts`):
  - a foot that touches down stays on that spot, and the leg is solved to reach it with
    two-bone IK, knee forwards;
  - the foot keeps its heading while the body turns above it, so turning on the spot is a
    few steps rather than feet rotating on the floor;
  - the pelvis drops just enough for a pinned foot to stay down, and a free foot is never
    pushed through the floor;
  - at lift-off the foot is released and blends back into the swing.

  This holds through starting, stopping, slowing and turning. In a 40 s test (walk,
  slow, stop, turn round, set off again), feet in contact slip 17 cm in total, against
  8.5 m for the gait alone. The worst single-frame slip is under 1 cm, and the
  feet never float.
- People draw only silhouette ink lines (contour and overlaps), so figures read as clean
  shapes.

**The cast** (`src/scenes/station/crowd.ts`) is mostly stationary:

- two colleagues talking, someone looking up at the destination display, a smoker, someone
  on a call, someone on their phone;
- two people on a bench, a traveller adjusting a backpack, someone waiting with a suitcase;
- two people under the concourse board;
- only a few walk: the traveller who crosses in front of you (driven by scroll), one person
  with a rolling suitcase, a commuter, and two people in the concourse.

**Paths and obstacles**: `nav.ts` builds the walkable areas (the platform behind the white
lines, the concourse) and obstacle footprints from the same placement data the furniture is
built from.

- Every spot and route is validated against the obstacle map, with a console warning in dev
  builds.
- Walkers keep to their own strip of floor and slow down or wait for anyone in their way.
  After a while they step aside to a free spot.
- The scroll-driven traveller's position and gait phase are pure functions of scroll
  position, so scrubbing back replays them exactly.

## Rendering: an illustrated world with real depth

- **Tonal bands** (`src/render/comic.ts`): every lit material keeps three's lighting and
  shadows. Its final colour is quantised into five printed tones: ink, charcoal, mid, light
  and paper. Band edges resolve as narrow screen-space halftone transitions, so dots sit where
  light turns into shadow rather than across whole surfaces. Hue is kept, so yellow stays
  yellow in every band. Each material chooses how it prints (`PRINT` in
  `src/materials/materials.ts`, or `material.userData.comic`):
  - clean band edges (`halftone: 0`) for the roof glazing, window glass, trim, yellow paint
    and safety lines;
  - narrower dots (`halftone` < 1) for the train bodies, trusses and passengers;
  - hatching (`hatch: true`) only on masonry, the platform walls and undercarriage;
  - `false` for signage, so it stays legible.
- **Selective ink** (`src/render/ink.ts`, `Stylizer.tsx`): every opaque mesh is drawn once
  into a normal/depth buffer, either as *ink* geometry or as a line-free *occluder*. Lines come
  only from ink geometry. Silhouettes are heavy, creases are lighter, and both thin and fade
  with distance. Glows, displays, light spill, dust and sky never get outlines. Objects opt out
  with `userData.ink = false`.
- **Hand-drawn quality**: band edges wander with low-frequency world-space noise, like a brush.
  Lighter transitions have a soft charcoal grain, and shadow transitions use coarse halftone
  dots with slight jitter. Ink lines change width like pen pressure, redraw their wobble four
  times a second, and break now and then like dry ink.
- **Paper**: fibre and tooth over the whole frame, with highlights tinted towards paper.
- **Grade**: no filmic tone mapping, so paper white stays white. A little bloom on light
  sources only, and a vignette.
- **Simplified world**: roof ribs are two clean chords (no lattice), with fewer purlins and no
  catenary droppers. The floor has large slabs with soft joints. Textures print as flat fills.
- **Captions** are cut-paper strips held down with yellow tape.

## Episode 02: City

`src/scenes/city/`. The episode's beats, by local scroll progress, are listed in `track.ts`:

| Beat | Local progress |
| --- | --- |
| Under the station portal, behind the ink wipe and the EPISODE 02 / CITY title | 0–0.10 |
| Out onto the square: the boulevard, the houses and the skyline | 0.10–0.22 |
| A look around: the kiosk, the tram stop | 0.22–0.40 |
| Across the zebra crossing and down the right sidewalk | 0.40–0.60 |
| He notices you, leaves a doorway ahead and walks at you, eyes on you | 0.56–0.735 |
| He stops square in front of you; his face hardens; he shifts his weight | 0.735–0.80 |
| He winds up: right shoulder back, weight on the back foot | 0.80–0.822 |
| He commits: the city drops to a tenth of real speed | 0.822 |
| DEFEND, CLICK TO BLOCK: the punch keeps coming in slow motion; the story waits here | 0.83 |
| Your guard takes the fist, your counter lands, ink | real time, ~2 s |

- **The world**:
  - the station's head building with its arched portal;
  - a square with a kiosk, a tram stop (with a DRUNKFURT poster) and tram tracks, and a zebra
    crossing;
  - a long boulevard of 19th-century blocks. Their facades are line drawings (procedural canvas
    textures with wobbly ink) and they have shopfronts, mansard roofs and chimneys;
  - bare trees, curved street lamps, blinking amber traffic lights, parked cars, and three moving
    cars with headlight beams and reflections in the wet road;
  - the skyline as silhouettes: a triangular tower with a lit crown, a cylinder with an antenna,
    the twin towers, a feather crown and an inverted pyramid. These shapes evoke Frankfurt's
    banking district and are not surveyed.
- **Wet asphalt is selective**: low roughness only in puddles and patches (a roughness map),
  plus soft light streaks under lamps and headlights.
- **People**: the same character system as Episode 1, with its own cast and nav (`cast.ts`,
  `nav.ts`):
  - two friends at the kiosk, someone on their phone at the tram stop, a traveller just off the
    train, someone looking up at the towers;
  - a smoker outside a bar, someone on a call, two people talking further down;
  - two walkers, each on their own validated strip of sidewalk.
- **The stranger** (`Stranger.tsx`) is built on the supplied 3D model (`src/assets/attacker.glb`,
  from the "rugged winter traveler" archive): a man in a beanie, a scarf, a worn tan jacket over a
  green hoodie, torn jeans and trainers, with a full beard.
  - The model came as a static scan, so `characters/meshRig.ts` rigs it at load. It bakes the
    mesh to his height, places bones at measured landmarks (same joint names as the procedural
    figures, so the gait, poses and IK all work on it), and skins it with capsule weights. The
    whole head above the neck is bound rigidly to the head bone.
  - The scan stands with his head bowed. A correction measured from side and top views
    (`faceTilt`) lifts and turns it, so he can look at you.
  - It is printed in greys (`mono` in `render/comic.ts`): the model's own colour and normal maps
    drive the tonal bands and halftone, and he gets a selective ink silhouette like everyone
    else.
  - His expression (`characters/face.ts`, `lines` style) is drawn as ink over his own face with
    a decal: brows, lids, nose and mouth lines are redrawn as he changes. He is wary when he
    notices you, hard when he stops, sneers as he winds up, shouts as he swings, and shows shock
    when he is blocked.
  - His fists are modelled and replace the scanned hands when he clenches.
  - A key light from the shop windows lights his face from the moment he notices you.
- **The punch** uses two-bone IK (`characters/ik.ts`), so the arm never stretches.
  - The fist follows a curved path from the cocked position to your face.
  - The punch accelerates, so most of its distance is covered late.
  - His torso and hips rotate into it and his weight drives onto the front foot.
  - If he is out of reach, he steps further in.
  - Slow motion starts only when he commits. The punch then keeps coming at a tenth of real
    speed.
- **The encounter** (`encounter.ts`) is drawn as a function of the scroll progress. The
  only thing it remembers is the visitor's decision at the gate. `encounterAt(local)` gives the
  stranger, the camera, your arms, the bag, the overlay and the soundscape everything they draw
  from. Intervals (local progress, `beats.ts`):

  | Interval | What happens |
  | --- | --- |
  | 0.60–0.735 | he walks up |
  | 0.735–0.80 | he squares up and holds your eye |
  | 0.80–0.822 | he winds up |
  | 0.822–0.83 | he commits; time slows to a tenth |
  | 0.83 | DEFEND: the story waits for your click ("Click to block") |
  | 0.83–0.905 | the outcome, spread over this stretch of the scroll |
  | 0.905–1 | the aftermath |

  - **Blocked** (you click in time): your left forearm comes up and takes his fist, he recoils,
    and your right counter lands (`PlayerArms.tsx`). Then come a paper flash, speed lines,
    heavy ink strokes, a small red burst (the only red in the experience), and black. In the
    aftermath he is on the pavement and your bag is still with you.
  - **Knocked out** (you never click): the fist lands, the picture snaps, the eyelids close in
    ragged ink, and the camera falls sideways to the pavement. When you come to, he is gone and
    the bag lies next to you.
  - Once you decide, the page plays the outcome by moving the progress itself (`playProgress` in
    `core/timeline.ts`, wall-clock timed). Scrolling yourself takes over at once. Every frame of
    the fight is a position on the scroll, so scrolling back rewinds it: into the middle of the
    fight you see that moment, and before he walks up he is back in his doorway. Scrolling
    forward again replays the same outcome. The prompt does not come back once you have decided.
  - The only part that runs on real time is the DEFEND window: his fist keeps coming for
    3.7 s while the story waits. Scroll back before the gate and the window closes; the moment
    is postponed, not decided.
  - Sounds are cues fired as the playback crosses them, forwards only. They never feed back
    into what is drawn, and scrubbing never repeats them.
- **Time**: everything in the city (people, cars, the stranger) runs on a time scale that eases
  to 10% as he closes in.
- **Traffic** (`traffic.ts`, plan in `trafficPlan.ts`) is a few scripted cars on fixed lanes,
  deterministic and pure (fixed sub-steps, no randomness):
  - Each car is an oriented box over its body and tyres. Lanes are polylines with arcs at the
    corners, sampled by arc length, so heading never jumps.
  - The driving lanes run at ±1.75 m from the middle of the boulevard, clear of the parked cars
    (0.36 m to spare). Before this, a lane ran at 2.3 m and the passing car's tyres cut
    through the parked cars.
  - Each step a car sweeps its box along its lane as far as it needs to stop, plus a following
    gap. It slows to stop 1.6 m short of the first parked car, visitor or car it would touch.
  - Where lanes cross or merge, the car that would arrive later yields; ties go to the
    priority lane. A move that would make two boxes overlap is never made, and spawning
    waits until the entry is clear.
  - A third car comes up the boulevard and turns into the cross street, crossing one car's lane
    and merging into another's, so the junction gets real give-way traffic.
- **Fight sounds** are distinct sounds, each timed to its contact:
  - a short, sharp boxer's exhale as your guard comes up;
  - a dull, bony knock when his fist meets your forearm;
  - a heavier, lower exhale behind your counter;
  - a hard crack with a deep thump when it lands;
  - on a knockout: his exhale, a heavy hit, a ringing ear and the body hitting the ground.

  Each is synthesised unless a recording is supplied: add files to `public/audio/` and set
  `src` on the `fight*` cues in `src/audio/AudioDirector.ts`.
- **Looking around** with the mouse also moves your head a few centimetres, sideways and up or
  down, so nearby objects shift against the background. The head stays inside a small invisible
  ellipsoid, and each episode can clamp it further (`clampHead`), so the camera never clips into
  walls, people or the attacker.
- **Sound**: the audio graph starts on the first click or key press.
  - There are no recorded assets, so the city uses synthesized sounds: a distant traffic bed,
    tyre noise from passing cars (panned), two impacts and a slow heartbeat at the climax.
  - The ambience thins and muffles (a low-pass sweep) as the stranger approaches.
  - A "Sound on/off" switch sits top right.
- **Transitions**: brush-stroke wipes are drawn on a canvas (`ui/brush.ts`). They are ragged
  black strokes with bristle tips, not a fade, and they close an episode, carry its title and
  open the next one.

## What is in Episode 1

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
  and light spilling from train windows onto the platform. These become the graphic pools of
  light once printed.
- **Shots, by scroll**: title in the doorway; lean out and glance at the gap; step down 40 cm;
  a few paces while a traveller crosses; look up at the display ("Zug endet hier"); a low angle
  under the name sign, clock and vault; a long lens down the platform to the concourse; then an
  ink wipe to the Episode 2 card. Comic caption boxes carry the narration.

## Structure

```
src/
  App.tsx                 fixed canvas + tall scroll track, episode mounting
  core/
    timeline.ts           scroll → progress → episode/local progress; episode spans
    cameraTrack.ts        keyframed camera path (scroll- or time-driven)
    sequence.ts           camera key types, ShotPlayer for time-driven beats
    store.ts              coarse UI state (loading/ready, active episode)
    geometry.ts, math.ts  sweeps, batching, damping, easing, RNG
  episodes/
    types.ts              EpisodeDef: World, track, captions, beats
    index.ts              registry + planned episode list
  player/
    ScrollCameraRig.tsx   camera on the active track + subtle look-around + footstep bob
    input.ts              pointer position for look-around
  render/
    comic.ts              tonal bands, halftone, hatching (material patch)
    ink.ts                ink buffer material + ink line effect
    Stylizer.tsx          classifies meshes, renders the ink buffer, composer
  ui/Overlay.tsx          title panel, captions, episode rail, wipe, outro
  scenes/station/         Episode 1: episode.ts (track, captions, beats) + the world
```

### Adding an episode

Episode 02 is the worked example: `src/scenes/city/` has its world, `track.ts` (camera),
`episode.ts` (title, captions, beats, `adjustPose`) and `encounter.ts` (a gated interaction).
Shared pieces live in `src/characters/` (figures, poses, crowd simulation, nav).


1. Build the world in `src/scenes/<id>/` and write `episode.ts`. It exports an `EpisodeDef`
   with the world component, a `CameraTrack`, captions and beats.
2. Register it in `src/episodes/index.ts` and give it a span in `EPISODE_SPANS`
   (`src/core/timeline.ts`).
3. Read `localProgress('<id>')` inside the world for scroll-driven events. Use
   `cameraDirector` (a `ShotPlayer`) for beats that must play in real time, such as the
   slow-motion sequence.

The host mounts the active episode and the next one, so the next world is ready before the
wipe opens.

## Assets and placeholders

- **One external asset**: the attacker model, supplied with the project brief. It was
  reduced with glTF Transform (weld, simplify to 18%), with emissive and metal/roughness maps
  dropped and the colour and normal maps resized to 1024 px as JPEG (1.9 MB). Everything else
  is procedural: every texture (paving, ballast, glazing, signage, displays, posters, window
  interiors, shopfronts) is drawn on a canvas at runtime. Fonts are system sans-serif.
- Character references named in the brief (three Sketchfab pages and two images) were used
  for general direction only. No third-party model was downloaded or included.
- **Audio**: there are no recordings. The city and the fight use synthesised sounds, and the
  station cues (`stationAmbience`, `trainIdleHum`, `footstepPlatform`, `stepDown`) are declared
  with `src: null`. `AudioDirector` builds the graph after the first click (autoplay-safe). Add
  licensed or recorded files to `public/audio/` and set `src`. It already has a world low-pass for the time-dilation scene,
  and a separate "body" bus for breathing and heartbeat that bypasses it.
- **Placeholders**: the buildings and road bridge beyond the open end are blocks. Train interiors are a painted texture, not geometry (except
  the open vestibule). Shopfront names are generic.
- Train numbers, times and destinations on the displays are fictional.

## Dev inspection hook

In dev builds, the following hooks exist for automated screenshots and checks. None of them
exist in production builds.

- `window.__drunkfurt.setProgress(p)` jumps to a global progress value (0..1) without
  smoothing.
- `window.__drunkfurt.encounterAt(local)` returns what the encounter shows at a local
  progress.
- `window.__traffic.step(seconds)` fast-forwards the cars.
- `window.__ink.uniforms.get('uDebug').value = 1` shows the ink buffer.

**Character lab** (`/lab.html` on the dev server, `src/lab/`): the city's people on a measured
floor under the same comic rendering, a walker at any gait phase, and a gallery of hands
(open, half-closed, fist) and shoes, for close inspection. `window.__lab.cam(pos, target,
fov)` frames a view, and `window.__lab.walk(phase)` poses the walker. It is a separate page
and is not part of the production build.
