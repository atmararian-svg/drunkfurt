# DRUNKFURT

A scroll-driven, first-person 3D comic set in Frankfurt am Main at night.
DRUNKFURT is the name of the experience and its fictional world; Frankfurt am Main is the real
setting, so real places and railway signage keep their real names.
Three chapters are built (four episodes):

- **Chapter 1, The Arrival** (episode 01): Frankfurt (Main) Hbf, platform 7, a few minutes before midnight.
- **Chapter 2, No Welcome** (episodes 02 and 03): out of the station, down the boulevard towards the
  towers, a stranger who wants your bag; then past him to a Mercedes at the kerb, into the
  driver's seat, and away (press D to rev).
- **Chapter 3, The Cave** (episode 04): a back room full of surveillance screens; sit down at the
  big one and click it to go through to the real site, arianatmar.com.

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

### Phones and tablets

**A touch screen gets the desktop-only page first** (`ui/stub.ts`, see Launch below): the story
runs on phones and tablets, but not smoothly. TRY ANYWAY (remembered for the visit, or `?anyway`
in the address) goes in, to all of the following.

The same story on a touch screen (`ui/touch.ts`: no hovering pointer), checked at 390 × 844 and
844 × 390 (a phone) and 820 × 1180 (a tablet):

- **Taps work everywhere.** While the page is held (the preloader, a chapter transition, the
  open letter) only a touch's move is swallowed, never its start: swallowing that also swallowed
  every tap, and the sound choice and the letter's close could not be tapped.
- **Words for touch**: the prompts read [TAP] TO DEFEND and [TAP] TO REV (the red key says TAP;
  the panel is the button, and the rev is a press-and-hold on it, as the D was), the letter's
  close TAP TO CLOSE, the hints "Tap it." and TAP THE SCREEN.
- **Sound choice, upright**: on a page taller than wide the pieces are stacked on a 1080 × 1920
  frame (ENABLE above, SOUND in the middle, DISABLE below) and the page splits into a top and a
  bottom half; a tap on a half chooses it.
- **Wider shots upright**: the camera's vertical field of view opens up on a portrait page
  (its tangent × aspect^-0.6, at most 1.7 ×: about 1.25 × on a tablet, 1.6 × on a phone), so the
  wide shots keep more of their width (`portraitFov`, `ScrollCameraRig.tsx`).
- **The letter**: too small to read whole on a phone, so a tap on the sheet zooms in (2.4 ×) on
  the point tapped, a drag moves over it, another tap zooms out; TAP TO CLOSE closes it (a line
  above it says TAP THE LETTER TO ZOOM). With a mouse nothing changes.
- **The chapter selector on a tablet**: a first tap opens it, then drag or tap; never below 0.8
  of its size (finger-sized tabs and names); the tab strip brings the current chapter's tab into
  view (no pointer to follow).
- **On a phone** (touch, under 600 px on the short side; `is-phone` on `<html>`, either way up):
  - the selector is **only its tabs**, at the bottom centre (no scale, no title): a native
    scroller, a swipe scrolls them (snapping to a tab), a tap on a tab goes to its chapter;
  - they **move in from below when you scroll back** and out again when you scroll on (0.5 s,
    cubic ease in and out); they stay away while something takes the bottom of the page (a
    chapter's title card), while the story asks you to act (ACTION, TAP TO DEFEND / REV, the
    letter, the cave's screen); a chapter turn played by the page neither brings them in nor
    sends them away;
  - while they are out, the subtitles, thoughts, captions and SCROLL cue stand above them and
    come down with them (`--tuner-room`);
  - the sound switch sits **top centre**.
- **Lighter**: the 3D page's pixel density is capped at 1.25 on touch devices (1.75 elsewhere).
- `viewport-fit=cover` (the safe areas are already kept clear), no double-tap zoom, no tap flash.


### Launch: pages around the story

- **In place of the story** (`ui/stub.ts`, styled as the page: ink, halftone, a console in
  JetBrains Mono capitals, an Archivo headline, white tabs). `main.tsx` decides before any of
  the 3D is loaded:
  - no WebGL (none, or the context refused): LIGHTS OUT, how to turn it on, ARIANATMAR.COM;
  - a touch device (phone or tablet): BIGGER SCREEN, COPY LINK (the share sheet where there is
    one), TRY ANYWAY, ARIANATMAR.COM;
  - the story's WebGL lost mid-way and not given back within 2.5 s: BLACKOUT, RELOAD.
- **404** (`public/404.html`, Netlify serves it for unknown paths): WRONG STOP, BACK TO THE
  STATION, in the same manner (its two fonts are copied to `public/fonts/`).
- **Fonts are served with the page** (`src/fonts/`, `src/fonts.css`): JetBrains Mono (variable
  weight; every monospace on the page, set tight as in the design), Archivo (variable weight
  and width; the headlines), Anton (the posters). Latin and Latin Extended subsets, SIL OFL
  (licences alongside). No request goes to Google.
- **Icons and sharing**: `public/favicon.svg` (the selector's frame: the white ◂ and the red
  dash), `apple-touch-icon.png` (180 px), `site.webmanifest`, `og.jpg` (1200 × 630, the station);
  Open Graph and Twitter tags in `index.html` use `VITE_SITE_URL` (set in `.env`; change it to
  the real address, or set it in Netlify's build environment). `robots.txt` allows everything.

### Launch polish in the story

- **The fight**: he goes down instead of cutting to him lying: the first hit knocks the knife
  away and him back a step, the second takes him off his feet backwards onto the pavement over
  0.75 s, gathering speed (`manRig.fall`, `Stranger.tsx`), under the pixels.
- **SKIP DIALOGUE** (bottom right, the key S; TAP TO SKIP on touch) while the invitation is said
  after the letter and while the thoughts in the car are typed: the invitation is taken as said;
  the thoughts end and the car goes on to the rev point.
- **The Mercedes**: its star and lettering (and the steering wheel's star) are dark trim, not
  chrome. The centre screen right of the wheel, which only glowed grey, is a console that types
  itself in with the ignition (`car/carScreen.ts`): the route to Crasigostraße 24 from the
  letter, ETA 00:32, and who is driving.
- **The cave**: the screen about the author is read with a click, as the letter is: CLICK TO
  READ at the pointer over it; a click turns you to it and draws you in (60 % of the way, the
  view 10° narrower), the pointer free to move; CLICK TO CLOSE, any click or Escape, and you lean
  back. (A hover zoom moved the screen out from under the pointer and let go at once.)
- **The attacker stands upright** until he sets off (legs straight, feet together:
  `manRig.stand(…, upright)`); his first steps take him out of it.
- **BAM and POW** are thrown in with each blow (`brush.ts drawHits`): in from their own side
  (BAM from the left, POW from the right), large and tilted, out of 28 px pixels that resolve as
  they land (as ACTION comes in), overshooting, settling, shaking off the impact (0.3 s).
- **The dither trail under the pointer** (`ui/ditherCursor.ts`), after the supplied "ASCII Flow
  Trail" (Floyd–Steinberg glyphs, Bayer thresholds, a screen-blended trail), made denser and
  smoother: the head eases after the pointer at a time-based rate, the trail is laid every 5 px
  along the whole way it moved each frame (a fast flick leaves an unbroken stroke), it ages over
  0.85 s and narrows into a tail; radius 78 px; grey glyphs in `difference` blend, a negative of
  the page. Not on touch, not with reduced motion.
  It keeps off what can be used (the chapter selector, buttons and links, the sound switch, the
  portfolio screen) and stops laying a trail when the pointer rests (0.25 s): what is there melts.
- **The letter** has one close control with a pointer: CLICK TO CLOSE at the pointer. The button
  under the sheet is shown only on touch screens; with a pointer it stays unseen (for assistive
  technology and Enter; Escape closes too).
- **SCROLL** and the captions' labels are JetBrains Mono Bold, set tight, like the rest.

### Text boxes: his thoughts and the system's tips

`ui/textBoxes.ts`, from Figma "Drunkfurt-text-boxes" (frame "text-boxes+person", 1920 × 1080),
drawn at the design's own size. Captions say which box they belong to (`tone`, `episodes/types.ts`):

- **His thoughts** (every caption that is not speech or a tip): his face in the bottom right corner
  (249 × 310, `assets/hero.webp`, the design's background-removed portrait) and beside it a white
  box (JetBrains Mono 12 px capitals, 182 px wide, 10 px padding), its print out of register: blue
  2 px up and left, red 2 px down and right, black in the two corners between. One box for all of
  them: while one follows another (or within 0.9 s) the box stays and its words change by
  decoding; with none for longer, face and box go.
- **The system's tips** (`tone: 'tip'`: pick up the letter, click the screen): bottom left, 20 px
  in, ACTION (Medium) and the tip, and under them a black bar 18 px high filling from nothing in
  5 s; then the tip goes, until it holds again.
- Both come in through pixels (an SVG filter per box, 22 px blocks resolving in 0.55 s) and go out
  the same way (0.4 s); the words start decoding when the box is 80 % of the way sharp and settle
  0.55 s after it is. Both keep out of the way while the page asks you to act (ACTION, defend,
  rev), the letter is open, a chapter turns, during the preloader and the hand-over to the site.
- Speech (ATTACKER:, ME:) is still typed in at the bottom of the page, and the thoughts in the car
  (the monologue) are still typed line by line at the bottom centre.

### Deploying (Netlify)

`netlify.toml` builds with `npm run build` and serves `dist/`. Or build locally and drag the
contents of `dist/` (zipped, `index.html` at the top) onto Netlify's deploy page.
`public/_headers` caches the hashed files in `assets/` for good and keeps `index.html` fresh.
The browser's own scrollbar is hidden (`styles.css`): the page still scrolls, and the chapter
selector shows the progress.

## Chapters, preloader and transitions

Chapters (`src/core/chapters.ts`) are what the visitor sees: what the preloader loads, what the
title cards announce, what going back restarts. Chapter 2 holds two episodes (the encounter and
the getaway play on one street, without a cut). Titles and metadata are the Figma design's
(file "Drunkfurt": Chapter-1…3).

- **Preloader** (`src/ui/Preloader.tsx`, Figma Preloader-Start → Preloader-Final): top left
  LOADING CHAPTERS (then READY); top right the chapters, the one loading at the right edge,
  decoding, then resolving and stepping left when it is really ready; centre "Once upon a time
  in" with its dots counting one, two, three; along the bottom FRANKFURT, revealed letter by
  letter (a staggered, eased reveal with seeded irregularity, each letter rising and fading in
  through a few stand-in glyphs), over which "Drunk" is written in red: the design's Rock Salt
  lettering (Figma "Drunkfurt-2"; the glyph outlines exactly as Figma laid them out, taken from
  the .fig, so no font is loaded, `src/ui/drunkWord.ts`), uncovered by a pen: the letters'
  centre lines (the glyphs rasterised, thinned to one-pixel skeletons, traced into lines, the
  rough edge's spurs pruned, joined in the order a hand writes them, smoothed) drawn on as one
  continuous line (`stroke-dashoffset`) inside an SVG mask over the glyphs, the pen's speed
  eased so it never stops or jumps. The order follows the real loading: the title decodes in with chapter 1;
  chapter 1 resolves when it is ready and chapter 2 decodes in its place; then chapter 3, and
  while it loads "Drunk" is written: at the hand's pace up to 80% of the word, then only a
  slow creep (something always moves) until chapter 3 is really in, when the rest is written
  quickly; word and chapter 3 finish together (if chapter 3 was in first, its label waits for
  the word). Then READY; the preloader leaves in the transition's blocks (`pixelCover` in
  `pixelReveal.ts`), and only then does the sound choice come in; once it is made, the pixel
  reveal brings chapter 1 in over it.
- **Sound choice** (`src/ui/soundChoice.ts`, Figma "Preloader-sound-default / -enable /
  -disable"): ENABLE and DISABLE (the design's slanted lettering as vector outlines, traced
  from its art, `src/ui/soundWords.ts`, filled even-odd) side by side at the top, SOUND along the
  bottom, all coming in through the transition's pixelation (28 px blocks resolving; SOUND drawn
  once into a canvas over its own letters for that). The page is split at the line between the
  two words: the pointer on the left makes ENABLE the choice (SOUND bends into a smile, DISABLE
  breaks into blocks), on the right the other way round (SOUND bent the opposite way); off both,
  SOUND lies straight. The curves are the design's per-letter transforms; the letters glide
  between them eased in and
  out (CSS transitions of the same translate + rotate, 0.9 s, `cubic-bezier(0.65, 0, 0.35, 1)`:
  slow start, quick middle, slow end); the words' blocks ease on the clock; 14 px of give at the line keeps it from
  flickering. SOUND hangs at its height as if on a line across the page: it slides left and right
  after the pointer (eased on the clock, like a weight on a rope), never up or down; its curves
  are centred on it, so it bends where it is; the whole word moves, so this never fights the
  letters' glide into a curve. The word not chosen breaks into fine 6 px blocks and darkens by half (brightness, in step with its blocks; both undone when the pointer leaves). The screen stands on the preloader's own ground:
  its grain and its dot grid (`dotGrid.ts`) stay on under the words. The two halves are real buttons (click, tap, or ← → and Enter); the choice sets the
  page's sound (`story.sound`, `audio.setEnabled`), the same setting as the Sound on/off switch,
  and the click is also the gesture the browser needs before any audio can start.
  No progress is invented. The page is the comic's print: near-black (#070707) with a soft-light
  grain and a fine grid of dots that, around the pointer, leave their places and orbit it, each
  on its own tilted orbit, larger and brighter the nearer they are (the supplied Framer
  "DotGridBackground", ported to a plain canvas in `src/ui/dotGrid.ts`; its frame loop only runs
  while something moves).
- **The chapter selector** (`src/ui/chapterTuner.ts`, Figma "Drunkfurt-selector": Selector-default
  compact, Selector-1/2/3 open; the selector frame 513 × 429): at the right edge, its axis at the
  design's height (45.6 %), scaled with the page (1920 × 1080 = 1, never below 0.62).
  - Geometry, exact, on one centre (298.5, 214.5): the outer circle of long white ticks (r 214.5,
    26 px, 81 ticks, 4.44° apart), the inner ring of grey dots (r 190.5, every 2°), both faded top
    and bottom by the design's gradient, which stays put. Three chapter markers 120° apart (both
    tick counts divide 120°): longer ticks, red for the chapter you are in. The other chapters'
    names (CH.2, CH.3, JetBrains Mono 12, half strength, tilted 23°) ride with their markers on a
    circle at 0.3 of their angle, as the design places them; clicking one goes there.
  - Fixed and horizontal: the selection frame (59 × 58, r 5, 10 % white), its ◂ and red dash, the
    current chapter's title left of it (◂ and JetBrains Mono 12), and, open, the chapter tabs.
  - **Chapter titles**: on every entry into a chapter (after the preloader, forwards, back, a
    jump), CHAPTER ONE / TWO / THREE at once, then after 2 s decoded (decode.ts) to CH.1 / 2 / 3,
    which stays until the next entry. The title sits in a slot it rolls through: when another
    chapter's marker reaches the frame (turning it by hand, or an entry), the old characters
    leave and the new come in, each 45 ms after the one before (320 ms each), the way the scale
    turns (down going forward); let go on the same chapter, it rolls back. The entry is the chapter changing, nothing else (a scroll
    within it, a re-render do not replay it); a new entry before the decode cancels it.
  - **Chapter tabs** (open only): a frosted panel (157 × 50, r 40, white 20 %, a 10 % white edge,
    background blur while open) clipping a strip of three tabs (ARRIVAL, NO WELCOME, THE CAVE;
    42 high, padding 16, JetBrains Mono 14, −3 %). Inactive: white 6 % behind white 30 % text;
    under the pointer: white text (nothing selected); the current chapter: white with near-black
    text. The panel grows in slightly as the selector opens, then stands still; only the strip
    moves, following (eased) the pointer's place across the panel, wherever the pointer is over
    the selector: right → the strip slides left to show THE CAVE, left → back to ARRIVAL. Only
    the middle 70 % of the panel steers it: from its 15 % mark the strip is at one end, from its
    85 % mark at the other (so the ends need no reaching for), never further than its own ends. A click on a tab goes to that chapter.
  - **The turn is the scroll's**: `position(p)` is 1 at chapter 1's opening shot, 2 at chapter 2's,
    3 at chapter 3's, linear through a chapter up to where its transition begins; the scale group
    turns 120° per unit round the centre, the markings moving down past the frame going forward
    (the next chapter comes from above), up going back. A transition is a cut in the progress,
    so the angle shown closes on it over a fraction of a second.
  - **Input** (all through `goToChapter`, the chapter transition; one source of truth, the
    scroll's chapter, read by the scale, the title and the tabs alike): drag up and down on it
    (0.8° per px: a chapter in about 150 px at full size); the wheel or trackpad over it (the page
    does not scroll there): a wheel notch is one chapter, a trackpad's stream turns the scale in
    proportion, never more than one chapter per gesture, and settles on the nearest when it goes
    quiet (300 ms); a click on a chapter's name or tab; the tabs from the keyboard (Tab, ← →,
    Enter). After a drag or a wheel gesture the scale settles on the chosen marker at once, and
    the scene follows 550 ms later, only if no new gesture has begun: the page never changes
    chapter under a hand still turning it. It holds there until the scene changes. The
    current chapter is never restarted; nothing turns it during a transition, a scripted beat,
    the open letter or the flight into the screen.
  - Open (pointer over it, a first tap on a touch screen, keyboard focus): it slides in to the
    open frame and the page behind dims and breaks into pixels, gradually, on its own slower
    curve (in over 0.8 s, out over 0.5 s): the scene's pixel layer grows its blocks, and the SVG
    pixel filter over the printed matter steps up from 2 to 7 px, only after the dimming has
    begun. It stays open while a drag or a wheel gesture runs.
- **The sound switch** (top right, `Overlay.tsx`): its label says what a click does, and its look
  goes with the label: SOUND ON (while the sound is off) is the white tab with near-black text;
  SOUND OFF (while it plays) is the secondary action and steps back: frosted glass, white 14 %,
  a 12 % white edge, background blur, white text; the same size and place, no red. The pointer coming on (and going off) decodes the whole
  word at once (`decodeAll`, decode.ts: every character scrambles together and settles at its
  own scattered moment), and changes nothing else; a click switches the sound.
- **Readiness is real** (`chapterReadiness`): each world has its own Suspense boundary (the
  station no longer waits for the street's models) and a marker after it that reports when
  everything in it has loaded and drawn twice; a world that fails is caught by its own error
  boundary and its chapter reported as failed. Chapter 3's assets (the room and its picture)
  start loading once chapter 2 is in, and are reused by its world. The preloader waits for
  chapter 1 without limit (if it fails, it says so and stays); chapters 2 and 3 get 25 s after
  chapter 1 before the story starts anyway (they go on loading behind it).
- **Transitions between chapters** (`src/ui/chapterTransition.ts`, `src/ui/pixelReveal.ts`),
  after the supplied pixel loader (Framer "ImagePixelLoader"): when the progress reaches the end
  of a chapter, the frame on screen is copied (`render/FrameGrab.tsx`) and laid over the page,
  the next chapter is reset and cut to, and once its world has drawn a few frames it comes in
  over the copy in coarse 28 px blocks, scattered and drifting up the page (down it going
  back), which then grow finer (to ~1.6 px, on the reference's smooth curve) while from 43% the
  sharp page fades in out of a 3 px blur. The "image" is the live 3D canvas itself, copied after
  every drawn frame, shrunk to one pixel per block and drawn back up unsmoothed into an overlay
  canvas. All of its numbers are in `PIXEL_REVEAL`. The preloader leaves into chapter 1 the same
  way. It cannot be interrupted or started twice, every wait in it has a time limit, and clicks
  are ignored while it plays.
- **Going back restarts the chapter**: scrolling back across a chapter's start does not land on
  the previous chapter's last shot but on its beginning, with every episode in it reset
  (`EpisodeDef.reset`: the encounter, the getaway, the screen); entering a chapter forwards
  resets it as well. Within a chapter, scrolling back works as before.
- **Title cards** (`src/ui/titleCards.ts`, Figma Example-chapter-1…3): a frosted glass panel in
  the bottom-left corner, tilted 6°, with the chapter's title and its two label lines. It slides
  in from the left at the chapter's start (after the transition), holds 3.4 s from when it has
  arrived, and slides back out; showing one stops any other.
- **Fonts**: the design's Berthold Akzidenz Grotesk Bold Extended is not available as a web font;
  Archivo at its widest and heaviest (Google Fonts) stands in for it. JetBrains Mono is the
  design's own label face.
- **Narration panels and decoding text** (`src/ui/decode.ts`): captions are printed panels now
  (off-white, or charcoal with a thin yellow rule for the ones that matter, both with the print's
  halftone and grain), no tape. Their text, the title cards' and the preloader's are split once
  into words of grapheme clusters (Intl.Segmenter); moving the pointer over them decodes a small
  zone: the letter nearest the pointer most, its neighbours less, by measured distance (variable
  widths, wrapped lines); off the text everything resolves. Stand-in glyphs are drawn over each
  letter while it stays in place, hidden, so the layout never moves; a hidden copy of the text is
  what assistive technology reads. Touch pointers are ignored.

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
- The walk is motion capture (`walkClip.ts`), from the supplied "Mr Man Walking" model
  (a Mixamo-rigged character with a 1.03 s walk cycle):
  - `tools/bakewalk.mjs` bakes the clip into `walkCycle.json` (40 KB instead of the 18 MB FBX).
    It stores pelvis, chest, head and feet as rotations away from standing, every limb segment
    as a direction in character space, the hip sway, and which foot carries weight.
  - Any of our skeletons is posed by turning each joint so its own segment points the captured
    way, so it works on the drawn people and on the stranger's fitted rig alike, whatever
    their proportions. Only the motion is used; the model itself is not in the scenes.
  - The clip walks in place at 1.64 m/s, 1.70 m per cycle. Slower walkers take
    proportionally shorter steps (down to 55%) rather than the same long steps at a slower
    beat, and the cycle advances by distance walked with the matching stride.
  - The walk blends in over whatever stance a person has when they set off, and out again
    when they stop; it starts with the weight on the foot under the hips.
- Feet are pinned while they carry weight (`feet.ts`):
  - a foot that touches down stays on that spot, and the leg is solved to reach it with
    two-bone IK, knee forwards;
  - the foot keeps its heading while the body turns above it, so turning on the spot is a
    few steps rather than feet rotating on the floor;
  - the pelvis drops just enough for a pinned foot to stay down, and a free foot is never
    pushed through the floor;
  - at lift-off the foot is released and blends back into the swing.

  This holds through starting, stopping, slowing and turning. In a 40 s test (walk, slow,
  stop, turn round, set off again; 2,748 frames with a foot down), planted feet do not
  move at all, against 7.5 m of slip for the captured walk alone. The feet never float,
  and they sink at most 1.2 cm into the floor.
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
| He draws a knife and holds it on you: "Your bag. Give it to me. Now." | 0.74–0.83 |
| He commits: the city drops to a tenth of real speed | 0.822 |
| ACTION; the street breaks into coarse pixels | 0.80– |
| PRESS D TO DEFEND: he stands and threatens in slow motion; the story waits here | 0.83 |
| Black; BAM, POW; the page opens on him lying on the pavement, the pixels resolve | real time, ~2 s |
| A crumpled letter by him: click it, read it, close it; you tell him where to find you | 0.96 (waits) |

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
- **The stranger** (`Stranger.tsx`, body in `characters/manRig.ts`) is the supplied walking
  man ("Mr Man Walking", a Mixamo-rigged character with his own captured walk), dressed down as a
  man who sleeps rough:
  - his clothes are re-made from the fabric of the first attacker scan (`tools/dress_textures.py`):
    a filthy tan canvas jacket, washed-out torn jeans with a ripped knee and frayed hems,
    scuffed shoes, weathered skin, his beard and moustache kept as hair cards;
  - a knit beanie and a scarf are added at load, fitted to his head and neck from his skin's own
    vertices;
  - he walks with his own captured walk (straight legs, an upright gait), its cycle locked to the
    distance he covers on his route: 1.67 m per cycle at his 1.8 m. Measured in a node test, a
    planted foot slides 4.6 mm at most per centimetre walked, and no toe goes below the
    pavement;
  - his stance at the stop is taken from his walk where both feet are down, with the legs eased
    towards standing straight;
  - his head and neck turn to you from the moment he notices you; a key light from the shop
    windows lights his face.
  - He is printed in greys (`mono` in `render/comic.ts`) like everyone in the city, with a
    selective ink silhouette (none on the hair cards).
- **The knife** (`src/assets/knife.glb`, supplied) sits in his right hand, the fingers closed round
  the handle. He draws it as he squares up, then holds it out at chest height, forearm level,
  the blade up and leaning towards you so it reads along its length: two-bone IK on his arm
  places the hand and the wrist turns the blade with about 20° of bend, a hold a real wrist
  takes without strain. As he raises it your eyes drop to it (the camera pitches down and
  widens), and the DEFEND card sits off-centre so his face and the knife stay in view. He does not strike; his words (`tone: 'speech'` captions, typed at the bottom of the page) carry what he
  says: "Your bag. Give it to me. Now."
- **His walk** is sampled straight from the clip's keyframe tracks every frame, not through an
  `AnimationMixer`: the mixer only writes a bone whose value changed since its last write, and
  since his pose is rebuilt from rest every frame, a still scroll left him in his T-shaped bind
  pose. The walk is blended into his stance by pace, so his legs swing at every speed and slow
  into the stop.
- **The encounter** (`encounter.ts`) is drawn as a function of the scroll progress. The
  only thing it remembers is the visitor's decision at the gate. `encounterAt(local)` gives the
  stranger, the camera, the overlay and the soundscape everything they draw
  from. Intervals (local progress, `beats.ts`):

  | Interval | What happens |
  | --- | --- |
  | 0.60–0.735 | he walks up |
  | 0.735–0.80 | he squares up and holds your eye; the knife comes out |
  | 0.80–0.822 | he raises it and holds it on you; he tells you to hand over your bag |
  | 0.822–0.83 | time slows to a tenth |
  | 0.80–0.83 | ACTION; the street pixelates (blocks 1 → 7 px) |
  | 0.83 | PRESS D TO DEFEND: the story waits for D (or a click on the prompt) |
  | 0.83–0.905 | the outcome, spread over this stretch of the scroll |
  | 0.905–1 | the aftermath; the pixels resolve by 0.945; at 0.96 the story waits for the letter |

  - **The prompts** (Figma "Text-placement", `ui/combatPrompt.ts`, placed on the 1920 × 1080
    design frame scaled to fit): ACTION, the design's slanted lettering, top left, from the
    moment he raises the knife (0.80) until the dark has covered the fight; it comes in through
    the scene-transition pixelation (`drawPixelated` from `pixelReveal.ts`, 28 px blocks
    resolving in 0.65 s) with an opacity fade, stamped on: a touch too big and tilted, settling
    flat as it sharpens. PRESS [D] TO DEFEND, bottom right, while the story waits at the gate
    (`PressPrompt.tsx`, the same panel the car uses for PRESS D TO REV): the words decode in
    (`decode.ts`), the D sits exactly in the middle of the page's red square (the line box
    trimmed to the capitals), and the arrow stands over the T of TO DEFEND and nudges inwards,
    towards PRESS D, and back (CSS, only while it shows). D is read by
    the overlay's one keyboard handler; the prompt itself can also be clicked or tapped. (The
    design reads "TO DEFENCE"; the brief's text, TO DEFEND, is used.)
  - **The pixels** (`ui/scenePixels.ts`): the scene-transition effect reused at a steady block
    size: one canvas over the 3D picture, under everything printed, redrawn from the 3D canvas
    after every frame. Its look is a pure function of the scroll and the encounter
    (`combatLook` in `Overlay.tsx`): nothing while he walks up and threatens; only once you
    have pressed D, and ACTION has gone (`BLOCK.veil`, 0.18 s), do the blocks grow coarse
    (to 26 px), blur (the same blocks drawn up smoothed over them) and darken (a dark layer to
    80%), complete at `BLOCK.dark` (0.75 s, before the first hit), which is what hides the fight;
    over the first 0.045 of the aftermath all of it resolves to the plain picture. At rest the
    canvas and its frame watcher are removed. Nothing can leave it stuck: a scrub, a revisit or
    a reset recomputes it. (The earlier spreading "Ignite" dark is gone.)
  - **Defended** (you press D in time): the fight is not shown. The street blurs and darkens in
    its own pixels before anyone moves, and the two hits are printed over it (`drawHits` in `ui/brush.ts`):
    the design's BAM (top left, with the first hit, at 1.0 s) and POW (bottom right, with the
    second, at 1.55 s), each fading up a touch large and settling (no hard snap), with its sound (the existing recordings: no new hit sounds came with the
    design). When the picture clears again he is on his back on the pavement, the knife beside his
    hand, and your bag is still with you.
  - **Knocked out** is switched off for now (`STRIKES` in `encounter.ts`): he never strikes, and
    the story waits at the gate until you defend. Its sequence is kept: with `STRIKES` on, the
    blade reaches you 3.7 s after the prompt, a blow lands, the eyelids close in ragged ink, the
    camera falls to the pavement, and when you come to he is gone and the bag lies next to you.
  - Once you decide, the page plays the outcome by moving the progress itself (`playProgress` in
    `core/timeline.ts`, wall-clock timed). Scrolling yourself takes over at once. Every frame of
    the fight is a position on the scroll, so scrolling back rewinds it: into the middle of the
    fight you see that moment, and before he walks up he is back in his doorway. Scrolling
    forward again replays the same outcome. The prompt does not come back once you have decided.
  - The prompt waits as long as you like. Scroll back before the gate and it closes; the moment
    is postponed, not decided.
  - **The letter** (`scenes/city/letter.ts`, `LetterProp.tsx`, `ui/letterReveal.ts`): after a
    defence, a crumpled sheet lies on the pavement by him (a ball of paper, flat-shaded facets);
    the fight's own playback ends where it can be picked up (from 0.945, no scroll needed; the
    story waits at 0.96, a gate) with "Something fell out of his coat. A letter. Click it."
    The pointer over it lights it a little and shows the hand; a click (or Enter) opens it: the
    page darkens and the sheet is lifted from where it lies (its place and size on the page,
    `letterSpot`): it rises off the pavement, travels to the middle of the page and unfolds from
    a crumpled ball into a flat print that keeps its creases, all on one curve, so it is fully
    open as it arrives (the supplied letter image, `src/assets/letter.webp`, 1592 × 2000, at its
    own aspect ratio, within 90% × 86% of the page), after Framer's "CrumpledPaper Reveal".
    Timing in `LETTER_REVEAL` (1.9 s open, 1.1 s close). That component's code is not published (it is copied into Framer projects), so its
    behaviour is rebuilt in WebGL with three.js: a subdivided sheet whose vertex shader moves each
    point between its place on a lumpy ball and the flat sheet (fine ridged creases and a corner
    curl kept), the middle unfolding first; faceted shading from screen-space normals, light
    leaning towards the pointer, plain paper on the back, a soft drop shadow. While it is open
    the cursor is the design's close control (Figma "cursor-button": CLICK TO CLOSE in JetBrains
    Mono Bold 14 px on a white tab, centred on the pointer), the scroll is held and nothing
    reaches the scene; a click closes it (the sheet crumples back up where it is, then, a ball,
    drops out through the bottom of the page and is gone: it is not put back on the pavement;
    the dark fades out meanwhile), as do Escape and a visible button of the same design (shown on touch
    screens and to the keyboard). Only then does the invitation come. Without WebGL the image
    itself unfolds in CSS.
  - **Spoken words** (his "Your bag…", your invitation) are not balloons: they are typed at the
    bottom of the page like the thoughts in the car (centred, 32 px up, JetBrains Mono 16 px,
    capitals), with the supplied typewriter; the trail is drawn inline (no copy laid over the
    text) and the lines wrap plainly as they grow (no re-balancing per character), so nothing
    shifts or overlaps on a phone. On a narrow page PRESS D TO DEFEND stands above them. Each
    line says who speaks, in a yellow label over it (ATTACKER: for him, ME: for you), and a
    dialogue line is never wider than 600 px.
  - **The invitation**: once the letter is closed, you tell him, typed in with the
    supplied typewriter: "Hey, man. When you wake up, come to Crasigostraße 24." / "You don't have
    to rob people." / "I'll help you fix your website problem." (one sentence per line, so at 600 px
    no word is left alone on a line; on any spoken line the last two words are also held together
    by a no-break space, for narrower pages). It cannot come before the letter is read; when it
    is typed in full and has stood 1.6 s, the gate opens and the scroll goes on to the car. (The
    words are set in capitals; ß is set as ẞ so it survives them.)
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
- **Fight sounds** are the supplied recordings for the defended fight: `hits.mp3` ("Удары": the
  two hits, at 0.925 and 1.165 s of the file) and `exhales.mp3` ("Выдохи": two exhales, at 0.87
  and 1.15 s). Each sound is played as its own slice of its file, started so its transient falls
  30 ms after its cue; each exhale is cued with its hit, so the two land together. The first hit
  is recorded much quieter and is raised to sit with the second (2.3 ×; the second at 0.7 ×), each
  slice fading in over 14 ms so its start never clicks; nothing is sped up. The knockout's sounds are still
  synthesised. In detail:
  - in the dark of a defence, a dull, bony knock with BAM!, then a hard crack with a deep thump
    with WHAM!; each exhale is laid over its hit, at the same moment;
  - on a knockout: his exhale, a heavy hit, a ringing ear and the body hitting the ground.

  The knockout's sounds take a recording as `src` on their `fight*` cue in
  `src/audio/AudioDirector.ts`.
- **Looking around** with the mouse also moves your head a few centimetres, sideways and up or
  down, so nearby objects shift against the background. The head stays inside a small invisible
  ellipsoid, and each episode can clamp it further (`clampHead`), so the camera never clips into
  walls, people or the attacker.
- **Sound**: the audio graph starts on the first click or key press.
  - There are no recorded assets, so the city uses synthesized sounds: a distant traffic bed,
    tyre noise from passing cars (panned), two impacts and a slow heartbeat at the climax.
  - The ambience thins and muffles (a low-pass sweep) as the stranger approaches.
  - A "Sound on/off" switch sits top right.
- **The flicker at the chapter's start**, fixed at its cause: the two corner blocks facing the
  square were placed from the kerb line (x = ±9.5) like the boulevard's blocks, and overlapped
  the first boulevard blocks over z −25…−41, so their fronts, shopfronts and cornices lay in the
  same planes and z-fought, flickering right ahead of the camera as the chapter opened; and every
  block's two cornices overhung its ends, so at each junction two cornices at the same height
  overlapped in the same planes. The corner blocks now stand behind the boulevard blocks (from
  x = ±25.5, with a different roofline from their neighbour), and the cornices stand out only to
  the front and back. Measured frame to frame at the chapter's opening shot, the large solid
  flickering area on the left-hand shopfront is gone; nothing else in the city was changed.

## Episode 03: Getaway

`src/scenes/car/`. It starts exactly where Episode 02's last shot is (you, crouched by the man
on the pavement) and plays on the same street: the episode declares `sharesWorld: 'city'` and
its span is `seamless`, so there is no page turn between them and the city keeps drawing and
running behind it. The thief tried for your bag and failed: it never leaves your shoulder, and
nothing of yours is left on the pavement. He stays where he fell, behind you.

| Beat (local progress, `getaway.ts`) | What happens |
| --- | --- |
| 0–0.06 | the last shot of Episode 02 holds; the EPISODE 03 / GETAWAY title comes up over it |
| 0.06–0.13 | you get up and look on down the street: the Mercedes stands at the kerb ahead |
| 0.13–0.40 | about ten steps: past him (more than a metre from him and his knife), off the kerb and along the car to the driver's door on the road side |
| 0.27–0.31 | as you reach it, its lights come up and the central locking clacks |
| 0.40–0.47 | the driver's door opens |
| 0.47–0.60 | into the car: you duck under the roof line, through the door opening, and sit, turning to face the windscreen |
| 0.60–0.64 | the door shuts |
| 0.642 | the story waits while the thoughts are typed at the bottom of the page (below) |
| 0.645–0.66 | the cluster lights and the engine starts; your eyes drop to the cluster |
| 0.66 | the story waits: ACTION, PRESS D TO REV |
| after 6,000 rpm | by itself, without stopping: the launch through three gear changes (8.6 s, the rush in its last two seconds), the ink closing, the next page |

- **The thoughts** (`scenes/car/thoughts.ts`): once the door has shut, the story waits (a gate
  at 0.642, before the ignition) while four lines are typed at the bottom of the page, centred,
  32 px up, JetBrains Mono 16 px, in capitals, with no box, never wider than 600 px: "This
  can't keep happening." / "Good businesses shouldn't have to struggle because they can't show
  the world what they're worth." / "There
  has to be a better way." / "It's time the world saw what I've built." They
  are typed with the supplied typewriter (`ui/typewriter.ts`, a plain-DOM port of the Framer
  "TypewriterText": its phases, speeds, smart pauses after punctuation, deleting each line
  before the next, the red trail on the last characters that fades into the text when a line
  is complete, the block caret), each line standing for 0.9 s + 24 ms per character before it
  is deleted; the caret blinks every 1,250 ms instead of 500 ms (2.5 × slower), the typing
  speed is the component's own. When the last line is in and has stood 1.3 s, it is erased (the
  typewriter's own deleting), the gate opens and the story carries itself on to the rev point
  (one 1.1 s scripted move; no scroll needed): the engine catches on the way and ACTION /
  PRESS D TO REV comes up there with its entrance, waiting. It only shows: the engine revs when
  you press D. (Once per pass: a reset in between drops a finish already under way.) Scrolling back out of the
  seat, or the chapter starting again, forgets them; they play again next time.

- **The car** is the supplied Mercedes-Benz W206 C220 (`src/assets/mercedes.glb`, 2.2 MB),
  converted from the supplied FBX by `tools/mercedes2glb.mjs`, then welded, simplified and
  quantised with glTF Transform. The conversion keeps the body, the four doors, wheels and
  tyres, lights, glass and the complete cabin (seats, dash, steering wheel, instrument cluster).
  It drops what is never seen (engine, suspension, underbody), the duplicate variants
  (panoramic roof, AMG skirts, a second headlight set), the inner faces of the glass and every
  texture. `scenes/car/carRig.ts` prints it in the city's tones by material name (black paint,
  steel, tinted glass, dark leather) with ink lines on the body.
- **Where it stands**: in the parking lane on the right at z = -41.5, its tail about 3 m beyond
  where the man falls, so you only reach it after the fight. (A plain parked car that stood
  there moved down the street to leave it room to pull out.)
- **What the model has, and how it is driven** (inspected in the FBX, not assumed): its one
  animation is a single static frame of the four door rotations, so nothing in it moves. Each
  door is its own node placed at its hinge, with its panel, glass and mirror as children; the
  driver's door (front left, `w206_door_FL`) opens by turning that node 62° about the vertical
  through the hinge. Each wheel and tyre is its own node at its hub and rolls about the axle by
  distance / 0.325 m. The headlights' lamp materials glow and two spot lights throw the beams.
- **The instrument cluster** (`carCluster.ts`) is drawn in code on a canvas (no third-party
  graphic), in the manner of an AMG cluster, and printed on the car's own cluster screen: the
  model's `w206_gauges` panel, 30.8 × 10.4 cm behind the steering wheel, tilted 15° towards the
  driver. The graphic sits on a plane 3 mm in front of it, so it is seen in perspective through
  the wheel, lit like a screen, and moves with the car.
  - Black glass with a faint lift behind each dial, thin chrome-grey rims, white numerals in
    the wide grotesque of the title cards, red accents. Left the tachometer (0–10 × 1,000/min,
    red from 7, 225° sweep), in the middle the large speedometer (0–300 km/h, ticks every 10,
    labels every 40, 270° sweep), right the oil temperature (an arc filled to 90 °C, red from
    130); along the bottom the odometer, outside temperature and the time over a red hairline.
  - The needles are drawn live: the tachometer from the engine's rpm, the speedometer from the
    car's road speed. Revving on the spot moves only the tachometer; the speedometer stays at 0
    until the car moves, and reaches about 180 km/h in the rush. Under the speedometer's hub the gear shows: P parked, D1–D4
    on the launch, flashing red at each change.
  - The model's own tiny tachometer needle is hidden in favour of the new dials.
- **The walk and the entry** are camera keys on the scroll (`episode.ts`), worked out from the
  car's own frame: they keep clear of the man, stand clear of the door's swing, and pass under
  the door opening's top below the roof line. All of it, door and lights included, is a
  function of the scroll, so scrolling back plays it backwards.
- **The rev** (`getaway.ts`, `REV_SEQUENCE`): once you sit and the engine idles at 800 rpm, the
  page holds at a gate, your eyes drop to the cluster, and the fight's prompt system asks for D:
  ACTION top left, PRESS D TO REV bottom right (`RevPrompt.tsx` on `PressPrompt.tsx`, placed as
  in Figma "Text-placement-car-scene"), its four throttle marks in the page's red. The first
  press starts one four-second sequence on the wall clock, on the key event itself (a tap shorter
  than a frame is not lost): four presses of the throttle, one a second (at 0, 1, 2 and 3 s), the
  pedal going down quickly and most of the way back up each time (the fourth stays down), the
  needle climbing with each (peaks of about 3,000, 3,900 and 4,900, sagging between, eased in and
  out), and at 4 s, at 6,000 rpm, the launch. Once started it plays to the end by itself:
  letting go of D does not stop it, holding or pressing again does not start another (key
  repeats are ignored). The card turns into four marks that light one a second and the pedal's
  travel; the car's own throttle pedal moves, and each blip rocks the car a little on its
  springs. Scrolling back off the seat cancels it. On a touch screen, press the card.
- **The launch** (at 6,000 rpm, once): `launch()` clears `armed` (so it cannot fire again and D
  is ignored from then on), opens the gate, and starts one scripted move of the page, locked,
  from the gate through the page turn to the next page. Everything after the threshold is that
  one timeline: the car pulls out about its rear axle along an S into the driving lane and
  accelerates (about 11 m/s² off the line, easing through the gears, with the gear changes on
  the recording's), then the rush: the speed builds towards 180 km/h, comic speed lines stream
  in from the edges and the view widens; then the chapter transition to chapter 3. The car's place is only ever set from that progress, by one component.
  Checked in a node test along the whole route: it clears the kerb by at least 10 cm and the
  parked cars by 36 cm. The car that would turn into its lane is kept off the street.
- **Why it used to stall**, fixed: (1) the launch's scripted move ended exactly on the first
  frame of the page turn, and a page turn only starts when the progress is inside it, so after
  3.6 s the car stopped and nothing more happened; (2) the scripted move could be cancelled by
  any wheel or touch event, and people keep scrolling (or a trackpad keeps coasting) while the
  story waits at a gate; (3) even when it was not cancelled, the wheel still scrolled the page
  underneath it, so when it ended the story slid back to where the page had been scrolled.
  Now one locked move runs from the gate to the next page; while a locked move plays (this one,
  or a page turn), and for 1 s after it, wheel, touch and scroll keys are swallowed and the
  page is held on its final position, so a trackpad's inertia cannot carry the story back.
- **State, and rewinding**: everything you see is a function of the scroll, except the revs
  while you hold the key. `getaway.launched` is the one remembered fact. Scroll back into the
  launch and the car is where it was at that point; scroll back out of the seat (before
  0.63) and the launch is forgotten: the gate closes, the engine stops and you rev again next
  time. Nothing before the rev reads `launched`, so no earlier position can show a launched car.
- **Sound**: the supplied recordings (`src/assets/audio/`, used as they are):
  - The rev sequence is only `aggressive-supercar-engine.mp3` (9.02 s, 48 kHz, stereo): four
    throttle blips, the revs rising from about 0.62, 1.80, 2.70 and 3.85 s of the file (peaks at
    1.30, 2.25, 3.35 and 4.30 s), then falling back to idle. Each blip is played as its own slice
    of the file, started exactly on its press (0, 1, 2, 3 s) with 80 ms crossfades, so sound,
    pedal and needle keep time; the last runs on into the launch, which fades it out (0.4 s) as
    its own recordings take over. One sequence, never looped. (The earlier accel-1/2/3 recordings
    are no longer used and were removed.)
  - At the launch, once: `wheels.mp3` (2.3 s, the tyres breaking traction) and
    `gear-shift.mp3` (35.5 s) from 3.00 s into the file. Its gear changes (4.30, 7.30 and
    10.45 s in the file) fall 1.30, 4.30 and 7.45 s after the launch, and the launch is timed on
    those (`SHIFT_TIMES` in `getaway.ts`): the cluster changes gear (D1 to D4, the gear flashing
    red), the tachometer drops from 6,300 to about 4,200 and climbs again, all read from the
    one launch clock that also moves the car and the page. The launch lasts 8.6 s (up to 180
    km/h), so all three changes are seen and heard before the ink closes; the recordings fade
    out (0.8 s) when the page has turned.
  - Each recording is decoded in memory from the inlined file (a strict content policy refuses
    to fetch even a data URL). If one is not decoded yet when it is needed, the revs fall back to
    the synthesised engine and the launch's recordings start on a later frame, further into the
    file by the delay, so the gear changes stay on time; if they never decode, the launch and the
    page turn run regardless. No sound call can throw into the scene or hold it up.
  - The driver's door opens to its recording (`door-open.mp3`). At the ignition the engine-start
    recording (`engine-start.mp3`, 2.9 s) plays through; then the engine-default recording
    (`engine-default.mp3`) idles whenever the engine runs and nobody is on the throttle. It is
    looped without a seam (overlapping copies, 80 ms crossfades, scheduled half a second ahead),
    gives way to the rev sequence and the launch and comes back after them, and stops if the
    scroll goes back before the ignition. The synthesised engine is only a stand-in if the idle
    recording cannot be decoded. The central locking and the door shutting are still synthesised
    (`carUnlock`, `carDoorClose` in `src/audio/AudioDirector.ts` take a recording as `src`).
  - Going back from chapter 3 restarts chapter 2 from its beginning (see Chapters above).

## Episode 04: The Cave (chapter 3)

The getaway's page turn opens on a dark back room: a curved wall of monitors on pillars, two
operator chairs, a desk, cables everywhere. You cross the room, sit down in the central chair,
and the one large screen in the middle of the wall shows the portfolio site. Clicking it takes
you into the screen and out of the story, onto the real site.

- **The room** is the supplied "Surveillance room" (Sketchfab, by wa_rouk), converted by
  `tools/room2glb.mjs`:
  - every node transform is baked into the geometry (metres, y up);
  - the six central screens (the middle three columns of the two middle rows), their housings,
    arms and the cables in that block are cut out (a box, x 1.42–3.24, y −1.80…−0.70,
    z −0.15…0.60 in the model's frame); the pillars behind stay. Triangles whose centre lay just
    outside that box survived as thin strips of the old housings along the display's lower
    edge (two bright lines); `trimCut` in `RoomScene.tsx` removes them at build time with a
    slightly taller box (y −1.87…−0.64), on the scene's own copy of the geometry;
  - the model's single screens mesh is split into one mesh per screen (`screen_00`…`screen_21`),
    each with its own planar texture coordinates, so each can dim and glow on its own; the small
    glowing bits become `leds`;
  - the three baked-light atlases are replaced by grey ones (`tools/room_textures.py`: luminance,
    levels stretched, gamma 1.15), and the normals are dropped (computed on load);
  - the cables (whose material also covers the chairs' steel) lose their texture coordinates and
    atlas, so the simplifier can weld and thin them;
  - then `gltf-transform weld`, `simplify --ratio 0.35 --error 0.004` and `quantize`:
    29.2 MB → 3.2 MB (`src/assets/room.glb`). No mesh compression extension, because its decoder
    needs WebAssembly, which a strict content policy may refuse.
- **Printed like the rest**: the baked light drives the comic bands as emission (black base
  colour, the grey atlas as emissive map, mono), so the room keeps the model's own light pools and
  shadows without lights of its own; pillars and equipment hatch their dark transitions. The
  cables and chair frames take a flat steel tone lit by the big screen's glow and a lamp above.
  Nothing is yellow except the tiny LEDs, the REC dots on the camera feeds and the display's
  status lamp.
- **The big display** (`RoomScene.tsx`, `layout.ts`) replaces the six screens on the same
  footprint and centre: 1.68 × 0.945 m (16:9), a dark housing with a 3.5 cm bezel, a VESA plate,
  an arm to the middle pillar and a cross bar to the pillars either side, 4° tipped towards the
  chair. Its picture is a screenshot of the real home page of
  [arianatmar.com](https://www.arianatmar.com/) (`src/assets/portfolio.webp`, 2000 × 1125,
  supplied by the project owner, no browser chrome), shown unlit at 84 % brightness.
- **The other 22 screens** (`roomScreens.ts`) show grey canvas pictures (camera feeds with time
  codes, log text, a scope trace, a floor plan, snow). Each runs its own seeded schedule: every
  2.5–10 s a new level (mostly a dim glow, sometimes bright, sometimes nearly dark), eased in at
  its own slow rate, now and then with a short stutter. Per frame that is one colour per screen,
  in `useFrame`; React never re-renders for it.
- **Camera** (`episode.ts`, local progress): 0–0.12 the ink opens on the way in; to 0.42 across
  the room, right of the chair; 0.5 at its side; 0.5–0.66 turning in and lowering
  (1.65 → 1.155 m); 0.66–0.72 the settle (a 3.5 cm dip, then upright, eyes up to the screen).
  At 0.76 the story waits (a gate that never opens: the story ends here) with one caption,
  "CLICK THE SCREEN." (the cave's captions are set in capitals). One of the wall's terminals, to the right of and
  below the big screen (`screen_13`), shows a few lines about the author (`roomScreens.ts`
  `ABOUT_TEXT`) as console text in capitals, steady and readable from the chair, at twice the
  other screens' resolution.
  No credits are printed anywhere on the page (see Assets).
- **Hover**: each frame the pointer is picked against the picture's own plane (not the bezel or
  the room). Over it, the camera leans 30 cm towards the screen and narrows 3°, and the picture
  comes up to 97 %; away, it eases back (damped, about a second either way). Over a project card
  (or About / All works in the picture's navigation) that link is marked with a faint yellow wash.
- **Links** (`SCREEN_LINKS` in `monitor.ts`) are switched off for now (`PROJECT_LINKS = false`):
  the whole picture leads to the home page, with no mark on a card. Switched back on, the six
  project cards lead to their pages on the
  real site (`/case/razed-mods`, `/case/som-power`, `/case/som`, `/case/the-performance-lab`,
  `/case/kanoi`, `/case/the-luxe-week`, read from the site's own links), About and All works to
  theirs; anywhere else on the picture leads to the home page. The address is taken from the
  click's point on the picture (its texture coordinates), not from the site.
- **Click** (`monitor.ts`): only on the picture (a click on the room does nothing; Enter also
  works). From then on: the page is pinned (`pinScroll`: wheel, touch and scroll keys are
  swallowed, the scroll position is held), the prompt and the printed matter go, the
  look-around and head motion let go (`CameraPose.still`), and the camera moves 1.8 s straight
  into the screen, square to it, to the distance where the picture covers the viewport exactly
  (cover-fit at a 40° field of view: its height fills the frame, or on a viewport wider than
  16:9 its width). Repeated clicks are ignored; once clicked, the hover lean is held, so it
  cannot pull against the move.
- **The screen turns into the page's colour, then the hand-over** (`monitor.ts`,
  `RoomScene.tsx`, `src/ui/siteHandoff.ts`): a plane exactly over the screen's picture fades in
  from 50% of the move and is solid at 80%: white (#ffffff) for the home page (and About, All
  works, which are white pages), exactly #0D0D0D for a project. The print treatment lifts with
  it, so the colour reaches the page unchanged (checked in pixels: 255,255,255 and 13,13,13).
  The room around the screen is untouched; the move goes on until the solid rectangle fills the
  view, and only then, at 100%, is the browser sent, with a page-wide layer of the same colour
  laid over at that instant (nothing visibly changes) and kept while the browser goes. Opened as
  a page of its own, that is a normal navigation in the same tab. Inside a frame that may not
  navigate the window (a sandboxed embed such as the artifact preview), the page opens in a new
  tab at that moment (`window.open`), and this page fades back into the room. Only if the
  browser refuses that as well is a link to the page shown, with "Back to the room". Coming back
  from the browser's history restores the room as before the click. No frame of the site is
  embedded and nothing of it is read.
  After the navigation the browser loads the site, which opens on its own white intro ("Arian —
  Atmar") before the page; that part is the site's.
- **Sound**: the city's rumble, low and muffled, as if through walls.

## What is in Episode 1

- **Sound**: the night station, restrained (`AudioDirector.stationBed`): the air of a big glass
  hall (two bands of soft noise, slowly breathing), the mains hum of its lights (50 Hz and
  harmonics, very quiet), and every 14–30 s, far off and smeared by a 3.5 s hall echo, the
  station gong with an announcement nobody could make out, or a train's air brakes on another
  platform. There is no station recording in the project, so this is synthesised; a recorded,
  seamlessly looping ambience set as `src` on the `stationAmbience` cue replaces it. It rises
  when the chapter is on screen and sound is allowed, thins towards the chapter's end, and is
  released when the chapter is left (`stationStop`), so revisiting never starts a second one.

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
    chapters.ts           the three chapters (episodes, titles, metadata) and their readiness
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
    FrameGrab.tsx         a copy of the frame on screen, for the chapter transition
  ui/Overlay.tsx          title cards, captions, ink, prompts
  ui/chapterTuner.ts      the chapter selector: scroll-driven scale, chapter titles, tabs, drag, wheel
  ui/Preloader.tsx        the preloader (real chapter readiness, decoding, the handwritten Drunk)
  ui/chapterTransition.ts chapter changes: copy, reset, cut, pixel reveal, title card
  ui/pixelReveal.ts       the pixel reveal (after the supplied ImagePixelLoader code)
  ui/titleCards.ts        the glass chapter cards, in and out
  ui/decode.ts            decoding text: reveal, loading loop, pointer zone
  ui/drunkWord.ts         the preloader's "Drunk": glyphs and pen strokes from the Figma file
  ui/dotGrid.ts           the preloader's dot grid around the pointer (supplied DotGridBackground)
  ui/typewriter.ts        typed text (supplied TypewriterText): spoken words and the thoughts in the car
  ui/combatPrompt.ts      ACTION and PRESS D TO DEFEND
  ui/fightArt.ts          ACTION, BAM, POW and the arrow, from the Figma file
  ui/scenePixels.ts       the fight's coarse pixels (the transition effect, held)
  ui/letterReveal.ts      reading the letter: the crumpled-paper reveal, the dark, CLICK TO CLOSE
  ui/RevPrompt.tsx        the getaway's PRESS D TO REV and its four throttle marks
  ui/PressPrompt.tsx      the action prompt panel (PRESS [D] / TO …), shared by fight and car
  ui/soundChoice.ts       the sound choice after the loading (ENABLE / DISABLE / SOUND)
  ui/palette.ts           the page's one red (the red of "Drunk"), also --red in styles.css
  scenes/station/         Episode 1: episode.ts (track, captions, beats) + the world
  scenes/city/            Episode 2: the street, the stranger, the encounter
  scenes/car/             Episode 3: the Mercedes (carRig.ts), its beats, rev and launch (getaway.ts)
  scenes/home/            Episode 4: the room, the big display, the click into the site (monitor.ts)
  ui/siteHandoff.ts       the colour hold and the navigation to the clicked page
tools/                    asset conversion (FBX → GLB, textures) and the walk-cycle bake
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

- **Supplied assets**: the walking man (`src/assets/man.glb`, 1.4 MB), the knife
  (`src/assets/knife.glb`, 0.15 MB), the Mercedes-Benz W206 C220 (`src/assets/mercedes.glb`,
  2.2 MB), all supplied by the project owner (see Episode 03). The instrument cluster is this
  project's own drawing (`carCluster.ts`); the Vecteezy illustration used before is gone.
- **Supplied audio** (`src/assets/audio/`, all from the project owner): `hits.mp3` and
  `exhales.mp3` (the fight), `aggressive-supercar-engine.mp3` (the rev sequence), `wheels.mp3`,
  `gear-shift.mp3` (the launch), `door-open.mp3`, `engine-start.mp3`, `engine-default.mp3` (the
  car). Not supplied: a night-station ambience (synthesised until one is added).
- **Design** (Figma file "Drunkfurt", supplied): the preloader, the chapter cards and the handwritten
  "Drunk" path were taken from it (decoded from the .fig with kiwi-schema). From the second file
  ("Drunkfurt-2"): the Rock Salt "Drunk" (glyph outlines), ACTION, BAM, POW and the arrow
  (vector paths), and the placement of the fight's prompts. From the third ("Drunkfurt-3"): the
  sound choice (ENABLE and DISABLE traced to vector outlines from its images, SOUND's per-letter
  layouts), the car's prompt placement and the close cursor. The letter
  (`src/assets/letter.webp`, 1592 × 2000) is the high-resolution image supplied with that brief,
  used as it is.
- **Episode 04**: the room is "Surveillance room" by wa_rouk
  (https://sketchfab.com/3d-models/surveillance-room-7fd56cd3917443a99966352beefd8304), under
  the Sketchfab Standard licence according to the file's own metadata; it was supplied by the
  project owner. That licence does not ask for a credit, so none is shown (the owner's choice:
  nothing on the page distracts from the story). The screen picture is a screenshot of
  arianatmar.com, also supplied by the owner.
  - `tools/fbx2glb.mjs` converts the FBX (FBXLoader + GLTFExporter in node) without his
    glasses and hair. FBXLoader makes one bone per skin cluster, so a joint shared by several
    meshes arrives as a chain of same-named bones of which only one is animated; the converter
    binds every mesh to one bone per joint, so body and clothes follow the walk together.
  - glTF Transform then welds, simplifies (35%) and prunes it; `tools/dress_textures.py` makes
    his textures (512 px clothes, 1024 px skin), and `tools/dressAttacker.mjs` puts them on
    and slims the knife's maps to 512 px.
  - The first attacker scan (from the "rugged winter traveler" archive) is no longer shipped;
    only its fabric is reused in his clothes' textures. Everything else
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
