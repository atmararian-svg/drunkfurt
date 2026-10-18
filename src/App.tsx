import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { NoToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { PostFX } from './effects/PostFX';
import { StationScene } from './scenes/station/StationScene';
import { Overlay } from './ui/Overlay';

export function App() {
  return (
    <>
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.75]}
        gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
        camera={{ fov: 54, near: 0.05, far: 1300 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NoToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <StationScene />
          <PostFX />
        </Suspense>
      </Canvas>
      <Overlay />
    </>
  );
}
