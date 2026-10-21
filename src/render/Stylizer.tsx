import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
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
  const occMat = useMemo(() => createInkBufferMaterial(0), []);
  const inkMat = useMemo(() => createInkBufferMaterial(1), []);
  const silMat = useMemo(() => createInkBufferMaterial(0.5), []);
  const effect = useMemo(() => new InkEffect(target.texture), [target]);
  const vignette = useRef<{ darkness: number } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__ink = effect;
    (window as unknown as Record<string, unknown>).__scene = scene;
  }, [effect, scene]);

  // Classify the scene once it is mounted (and whenever the episode changes).
  useEffect(() => {
    const dpr = viewport.dpr;
    scene.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      mats.forEach((m) => applyComic(m, dpr));
      const transparent = mats.some((m) => m.transparent || (m as MeshBasicMaterial).blending > 1);
      if (transparent || o.userData.ink === 'none') return;
      // Each opaque mesh is drawn into the ink buffer exactly once: as ink, or as an occluder.
      const glow = mats.every((m) => m instanceof MeshBasicMaterial);
      if (!glow && o.userData.ink === 'silhouette') o.layers.enable(INK_SILHOUETTE_LAYER);
      else o.layers.enable(!glow && o.userData.ink !== false ? INK_LAYER : OCCLUDER_LAYER);
    });
  }, [scene, viewport.dpr, version]);

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
    camera.layers.set(OCCLUDER_LAYER);
    scene.overrideMaterial = occMat;
    gl.render(scene, camera);
    camera.layers.set(INK_LAYER);
    scene.overrideMaterial = inkMat;
    gl.render(scene, camera);
    camera.layers.set(INK_SILHOUETTE_LAYER);
    scene.overrideMaterial = silMat;
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
    <EffectComposer multisampling={4} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <primitive object={effect} />
      <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.1} intensity={0.35} radius={0.55} />
      <Vignette ref={vignette as never} offset={0.32} darkness={0.6} />
    </EffectComposer>
  );
}
