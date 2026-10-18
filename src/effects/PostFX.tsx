import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { HalfFloatType } from 'three';

/**
 * Restrained grade: HDR bloom only on genuinely bright sources (lamp lenses,
 * displays, the concourse), filmic tone mapping, a soft vignette, fine grain.
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={4} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={0.55} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.72} />
      <Noise premultiply opacity={0.32} blendFunction={BlendFunction.SOFT_LIGHT} />
    </EffectComposer>
  );
}
