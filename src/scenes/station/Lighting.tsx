import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, DirectionalLight, Object3D, SpotLight } from 'three';
import { palette } from '../../config/palette';
import { mulberry32 } from '../../core/math';
import { materials } from '../../materials/materials';
import { CONCOURSE, DOOR_Z, HALL_CX, MAST_X, MAST_Z, TRACKS } from './layout';
import { FLICKER_MAST, SHADOW_MASTS } from './lighting-config';

const MAST_INTENSITY = 150;

/**
 * Night lighting for the hall. Real light sources do the work: one spotlight per
 * platform mast (pools of light along the platform), a few shadow casters near
 * the visitor, a cold skylight through the glazing, a faint bounce from below
 * so the roof trusses stay readable, and the bright concourse at the head.
 */
export function Lighting({ active = true }: { active?: boolean }) {
  const spots = useRef<(SpotLight | null)[]>([]);
  const up = useRef<DirectionalLight>(null);
  const flickerColor = useMemo(() => materials().lampLensFlicker.color.clone(), []);

  // Spot targets must live in the scene graph for their matrices to update.
  const targets = useMemo(() => MAST_Z.map((z) => {
    const o = new Object3D();
    o.position.set(MAST_X, 0, z);
    return o;
  }), []);

  useLayoutEffect(() => {
    spots.current.forEach((s, i) => s && (s.target = targets[i]));
    if (up.current) up.current.target.position.set(HALL_CX, 30, -20);
  }, [targets]);

  // A tube near the far end hesitates every few seconds. Rare, irregular, brief.
  const flick = useMemo(() => ({ next: 3, until: 0, rnd: mulberry32(5) }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let k = 1;
    if (t > flick.next) {
      flick.until = t + 0.25 + flick.rnd() * 0.5;
      flick.next = t + 4 + flick.rnd() * 9;
    }
    if (t < flick.until) k = flick.rnd() < 0.5 ? 0.25 : 0.9;
    const s = spots.current[FLICKER_MAST];
    if (s) s.intensity = MAST_INTENSITY * k;
    materials().lampLensFlicker.color.copy(flickerColor).multiplyScalar(k);
  });

  const lamp = new Color(palette.lampWhite);

  return (
    <>
      {/* scene-wide background and fog belong to whichever episode is on screen */}
      {active && <color attach="background" args={[palette.sky]} />}
      {active && <fogExp2 attach="fog" args={[palette.fog, 0.0068]} />}
      <hemisphereLight args={['#3a3f47', '#1a1a1a', 0.55]} />
      {/* cold sky through the glazing */}
      <directionalLight position={[-20, 60, 30]} intensity={0.16} color="#9aa6b8" />
      {/* faint bounce from below: keeps truss undersides from going black */}
      <directionalLight ref={up} position={[HALL_CX, -10, 10]} intensity={0.22} color="#8d9096" />

      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
      {MAST_Z.map((z, i) => {
        const shadow = SHADOW_MASTS.includes(i);
        return (
          <spotLight
            key={z}
            ref={(s) => (spots.current[i] = s)}
            position={[MAST_X, 5.3, z]}
            color={lamp}
            intensity={MAST_INTENSITY}
            angle={1.32}
            penumbra={0.55}
            decay={2}
            distance={26}
            castShadow={shadow}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
            shadow-camera-near={0.5}
            shadow-camera-far={26}
          />
        );
      })}

      {/* the open vestibule we start in */}
      <pointLight position={[TRACKS.a + 0.7, 2.3, DOOR_Z]} intensity={0.7} distance={4} decay={2} color={palette.interiorWhite} />

      {/* concourse: the bright end of the vanishing point */}
      {[-2, HALL_CX, 23].map((x) => (
        <pointLight
          key={x}
          position={[x, 9, (CONCOURSE.z0 + CONCOURSE.z1) / 2]}
          intensity={480}
          distance={60}
          decay={2}
          color="#f3f1ea"
        />
      ))}
    </>
  );
}
