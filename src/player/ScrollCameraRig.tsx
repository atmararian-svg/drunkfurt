import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, deg } from '../core/math';
import { CameraPose, ShotPlayer } from '../core/sequence';
import { story } from '../core/store';
import { locate, stepTimeline, timeline } from '../core/timeline';
import { EPISODES, builtEpisodes } from '../episodes';
import { input } from './input';
import { playerState } from './playerState';

/** Time-driven shots can still take the camera for scripted beats (e.g. slow motion). */
export const cameraDirector = new ShotPlayer();
/** Live camera pose, for dev inspection and for starting shots from the current view. */
export const rigPose: CameraPose = { position: new Vector3(), yaw: 0, pitch: 0, roll: 0, fov: 54 };

const LOOK_YAW = deg(7);
const LOOK_PITCH = deg(4);

/**
 * The camera is on rails: the active episode's track, sampled at the scroll
 * position. On top of that the visitor can look around a few degrees with the
 * mouse, and footsteps appear only while the camera is actually travelling.
 */
export function ScrollCameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const st = useMemo(
    () => ({ lookYaw: 0, lookPitch: 0, speed: 0, phase: 0, last: new Vector3(), primed: false, episode: '' }),
    [],
  );

  useEffect(() => {
    input.attach();
    camera.rotation.order = 'YXZ';
    camera.near = 0.05;
    camera.far = 1300;
    return () => input.detach();
  }, [camera]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    stepTimeline(dt);
    const { id, local } = locate(timeline.progress);
    if (id !== st.episode) {
      st.episode = id;
      story.setState({ episode: id });
    }
    const ep = id === 'outro' ? builtEpisodes().slice(-1)[0] : EPISODES[id];
    const pose = rigPose;
    if (!cameraDirector.update(dt, pose) && ep) {
      const l = id === 'outro' ? 1 : local;
      ep.track.sample(l, pose);
      ep.adjustPose?.(l, pose);
    }

    // subtle look-around, eased back to the composed frame when the pointer leaves
    const p = input.pointer;
    st.lookYaw = damp(st.lookYaw, p.active ? -p.x * LOOK_YAW : 0, 2.4, dt);
    st.lookPitch = damp(st.lookPitch, p.active ? -p.y * LOOK_PITCH : 0, 2.4, dt);

    // footsteps from actual travel speed on the ground plane
    const moved = Math.hypot(pose.position.x - st.last.x, pose.position.z - st.last.z);
    st.last.copy(pose.position);
    const v = st.primed ? moved / Math.max(dt, 1e-4) : 0;
    st.primed = true;
    st.speed = damp(st.speed, clamp(v, 0, 3), 5, dt);
    const k = clamp(st.speed / 1.4, 0, 1);
    st.phase += (st.speed / 0.74) * Math.PI * dt;
    const bobY = (Math.cos(st.phase * 2) - 1) * 0.012 * k + Math.sin(clock.elapsedTime * 1.25) * 0.004 * (1 - k);
    const bobX = Math.sin(st.phase) * 0.012 * k;

    const sin = Math.sin(pose.yaw);
    const cos = Math.cos(pose.yaw);
    camera.position.set(pose.position.x + cos * bobX, pose.position.y + bobY, pose.position.z - sin * bobX);
    camera.rotation.set(pose.pitch + st.lookPitch, pose.yaw + st.lookYaw, pose.roll + Math.sin(st.phase) * 0.003 * k);
    const fov = pose.fov ?? 54;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    playerState.position.set(pose.position.x, 0, pose.position.z);
    playerState.yaw = pose.yaw;
    playerState.speed = st.speed;
  });

  return null;
}
