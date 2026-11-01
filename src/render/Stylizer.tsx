import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, HalfFloatType, Material, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { applyComic } from './comic';
import { INK_LAYER, INK_SILHOUETTE_LAYER, InkEffect, OCCLUDER_LAYER, createInkBufferMaterial, createInkTarget } from './ink';

/**
 * 0 … 1: how far the print treatment (ink lines, paper, vignette) is lifted
 * off the frame. Episode 4 lifts it as the camera arrives on the screen, so
 * the screen's picture matches the plain image laid over the page after it.
 */
export const postFx = { clean: 0 };

/**
 * Prints a part of the scene: comic bands on its lit materials, its opaque meshes sorted into the
 * ink and occluder layers. Each material is patched once; doing it again changes nothing, so a
 * world can be stylised ahead of time (to compile its shaders before it is shown, App.tsx).
 */
export function stylize(root: Object3D, dpr: number) {
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    mats.forEach((m) => applyComic(m, dpr));
    const transparent = mats.some((m) => m.transparent || (m as MeshBasicMaterial).blending > 1);
    if (transparent || o.userData.ink === 'none') return;
    // Each opaque mesh is drawn into the ink buffer exactly once: as ink, or as an occluder.
    const glow = mats.every((m) => m instanceof MeshBasicMaterial);
    if (!glow && o.userData.ink === 'silhouette') inkWeight(o, INK_SILHOUETTE_LAYER, 0.5);
    else if (!glow && o.userData.ink !== false) inkWeight(o, INK_LAYER, 1);
    else inkWeight(o, OCCLUDER_LAYER, 0);
  });
}

/** The ink buffer's one material; each object sets its own line weight on it just before it is drawn. */
const INK_BUFFER = createInkBufferMaterial(1);
const WEIGHTED = new WeakSet<Object3D>();

/**
 * Puts a mesh in its ink layer and has it set its line weight (ink 1, silhouette 0.5, occluder 0)
 * on the ink buffer's material as it is drawn into that buffer, so the whole buffer is one pass
 * over the scene instead of three.
 */
function inkWeight(o: Object3D, layer: number, w: number) {
  o.layers.enable(layer);
  o.userData.inkWeight = w;
  if (WEIGHTED.has(o)) return;
  WEIGHTED.add(o);
  const before = o.onBeforeRender;
  o.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    if (material === INK_BUFFER) {
      INK_BUFFER.uniforms.uWeight.value = this.userData.inkWeight;
      INK_BUFFER.uniformsNeedUpdate = true;
    }
    before.call(this, renderer, scene, camera, geometry, material, group);
  };
}

/**
 * Turns the lit scene into a printed page:
 *  1. every lit material gets comic tonal bands with halftone transitions;
 *  2. opaque meshes are sorted into ink / occluder layers;
 *  3. each frame a normal+depth buffer is rendered for those layers;
 *  4. the composer draws ink lines from it, then a little bloom, vignette and paper grain.
 *
 * Objects opt out of lines with `userData.ink = false`; materials opt out of
 * banding with `material.userData.comic = false`.
 */
export function Stylizer({ version }: { version: unknown }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const target = useMemo(createInkTarget, []);
  const effect = useMemo(() => new InkEffect(target.texture), [target]);
  const vignette = useRef<{ darkness: number } | null>(null);
  const [msaa] = useState(() => (viewport.dpr > 1.2 ? 0 : 2));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__ink = effect;
    (window as unknown as Record<string, unknown>).__scene = scene;
  }, [effect, scene]);

  // Classify the scene once it is mounted (and whenever the episode changes).
  useEffect(() => stylize(scene, viewport.dpr), [scene, viewport.dpr, version]);

  useEffect(() => {
    const w = Math.floor(size.width * viewport.dpr);
    const h = Math.floor(size.height * viewport.dpr);
    target.setSize(w, h);
    effect.setSize(w, h);
    effect.uniforms.get('uWidth')!.value = Math.max(1, viewport.dpr);
  }, [size, viewport.dpr, target, effect]);

  // Render the ink buffer just before the composer (priority 1) draws the frame.
  const clear = useMemo(() => new Color(0, 0, 0), []);
  useFrame(({ clock }) => {
    effect.uniforms.get('uTime')!.value = clock.elapsedTime;
    effect.uniforms.get('uClean')!.value = postFx.clean;
    if (vignette.current) vignette.current.darkness = 0.6 * (1 - postFx.clean);
    const bg = scene.background;
    const fog = scene.fog;
    const mask = camera.layers.mask;
    const shadowAuto = gl.shadowMap.autoUpdate;
    const prevClear = gl.getClearColor(new Color());
    const prevAlpha = gl.getClearAlpha();
    scene.background = null;
    scene.fog = null;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(target);
    gl.setClearColor(clear, 1);
    gl.clear(true, true, true);
    // one pass: the occluders, the ink and the silhouettes together, each with its own weight (inkWeight)
    camera.layers.set(OCCLUDER_LAYER);
    camera.layers.enable(INK_LAYER);
    camera.layers.enable(INK_SILHOUETTE_LAYER);
    scene.overrideMaterial = INK_BUFFER;
    gl.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.mask = mask;
    gl.setRenderTarget(null);
    gl.setClearColor(prevClear, prevAlpha);
    gl.shadowMap.autoUpdate = shadowAuto;
    scene.background = bg;
    scene.fog = fog;
  }, 0.5);

  return (
    // (multisampling only on a coarse screen: at 1.25× and over, the ink lines already cover the edges it would smooth;
    // decided once, as the page starts: changing it later would rebuild the composer)
    <EffectComposer multisampling={msaa} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <primitive object={effect} />
      <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.1} intensity={0.35} radius={0.55} />
      <Vignette ref={vignette as never} offset={0.32} darkness={0.6} />
    </EffectComposer>
  );
}
