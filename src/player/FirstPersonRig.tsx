import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, deg } from '../core/math';
import { CameraPose, ShotPlayer } from '../core/sequence';
import { input } from './input';
import { playerState } from './playerState';

/**
 * First-person camera. Three modes, one owner at a time:
 *  - 'anchored': the visitor stands still; the view follows the pointer a few
 *    degrees for parallax (used before the first interaction).
 *  - 'free': mouse-look (pointer lock) and walking.
 *  - 'locked': input ignored, pose held.
 * Whenever a scripted shot is playing on `cameraDirector`, it owns the camera
 * regardless of mode, and the rig continues seamlessly from the shot's last pose.
 */
export type RigMode = 'anchored' | 'free' | 'locked';

export interface Anchor {
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface Collider {
  kind: 'circle' | 'box';
  x: number;
  z: number;
  r?: number;
  hx?: number;
  hz?: number;
}

interface Props {
  mode: RigMode;
  anchor: Anchor;
  eyeHeight: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  colliders: Collider[];
  fov?: number;
}

export const cameraDirector = new ShotPlayer();
/** Live pose of the rig; scenes read it to start shots from where the visitor is looking. */
export const rigPose: CameraPose = { position: new Vector3(), yaw: 0, pitch: 0, roll: 0 };

/** Dev/inspection only: jump the free-mode visitor to a pose on the next frame. */
let teleport: { x: number; z: number; yaw: number; pitch: number } | null = null;
export const requestTeleport = (x: number, z: number, yaw: number, pitch: number) => {
  teleport = { x, z, yaw, pitch };
};

const SENSITIVITY = 0.0021;
const PITCH_MIN = deg(-62);
const PITCH_MAX = deg(70);
const WALK = 1.45;
const BRISK = 2.5;
const BODY_RADIUS = 0.28;

export function FirstPersonRig({ mode, anchor, eyeHeight, bounds, colliders, fov = 54 }: Props) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const st = useMemo(
    () => ({
      targetYaw: anchor.yaw,
      targetPitch: anchor.pitch,
      vel: new Vector3(),
      bobPhase: 0,
      bobAmount: 0,
      wasShot: false,
      breathe: 0,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    input.attach();
    camera.rotation.order = 'YXZ';
    camera.fov = fov;
    camera.near = 0.05;
    camera.far = 1300;
    camera.updateProjectionMatrix();
    rigPose.position.set(...anchor.position);
    rigPose.yaw = anchor.yaw;
    rigPose.pitch = anchor.pitch;
    rigPose.roll = 0;
    return () => input.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = clock.elapsedTime;
    const look = input.consumeLook();
    const pose = rigPose;
    let bobY = 0;
    let bobX = 0;
    let bobRoll = 0;

    if (cameraDirector.update(dt, pose)) {
      st.wasShot = true;
    } else {
      if (st.wasShot) {
        // hand-over from the shot: continue from its final pose
        st.wasShot = false;
        st.targetYaw = pose.yaw;
        st.targetPitch = pose.pitch;
        st.vel.set(0, 0, 0);
      }
      pose.roll = damp(pose.roll, 0, 4, dt);

      if (mode === 'anchored') {
        // slow, floaty parallax: a few degrees following the pointer, plus breathing
        const yaw = anchor.yaw - input.pointer.x * deg(7);
        const pitch = anchor.pitch - input.pointer.y * deg(4);
        pose.yaw = damp(pose.yaw, yaw, 2.2, dt);
        pose.pitch = damp(pose.pitch, pitch, 2.2, dt);
        const [ax, ay, az] = anchor.position;
        pose.position.set(
          damp(pose.position.x, ax + input.pointer.x * 0.035, 2, dt),
          ay + Math.sin(t * 1.25) * 0.0045,
          damp(pose.position.z, az, 2, dt),
        );
      } else if (mode === 'free') {
        if (teleport) {
          pose.position.set(teleport.x, eyeHeight, teleport.z);
          pose.yaw = st.targetYaw = teleport.yaw;
          pose.pitch = st.targetPitch = teleport.pitch;
          teleport = null;
        }
        st.targetYaw -= look.x * SENSITIVITY;
        st.targetPitch = clamp(st.targetPitch - look.y * SENSITIVITY, PITCH_MIN, PITCH_MAX);
        pose.yaw = damp(pose.yaw, st.targetYaw, 24, dt);
        pose.pitch = damp(pose.pitch, st.targetPitch, 24, dt);

        const f = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
        const r = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
        const speed = input.isDown('ShiftLeft', 'ShiftRight') ? BRISK : WALK;
        const sin = Math.sin(pose.yaw);
        const cos = Math.cos(pose.yaw);
        let wx = -sin * f + cos * r;
        let wz = -cos * f - sin * r;
        const wl = Math.hypot(wx, wz);
        if (wl > 0) {
          wx = (wx / wl) * speed;
          wz = (wz / wl) * speed;
        }
        const accel = wl > 0 ? 6 : 9;
        st.vel.x = damp(st.vel.x, wx, accel, dt);
        st.vel.z = damp(st.vel.z, wz, accel, dt);
        const p = pose.position;
        p.x += st.vel.x * dt;
        p.z += st.vel.z * dt;
        resolveCollisions(p, bounds, colliders);
        p.y = damp(p.y, eyeHeight, 6, dt);

        // walking bob, only while moving; fades in and out with speed
        const v = Math.hypot(st.vel.x, st.vel.z);
        st.bobAmount = damp(st.bobAmount, clamp(v / WALK, 0, 1.4), 6, dt);
        st.bobPhase += (v / 0.74) * Math.PI * dt;
        bobY = (Math.cos(st.bobPhase * 2) - 1) * 0.011 * st.bobAmount;
        bobX = Math.sin(st.bobPhase) * 0.012 * st.bobAmount;
        bobRoll = Math.sin(st.bobPhase) * 0.0035 * st.bobAmount;
        // idle breathing when standing
        bobY += Math.sin(t * 1.25) * 0.004 * (1 - clamp(st.bobAmount, 0, 1));
      }
    }

    const sin = Math.sin(pose.yaw);
    const cos = Math.cos(pose.yaw);
    camera.position.set(pose.position.x + cos * bobX, pose.position.y + bobY, pose.position.z - sin * bobX);
    camera.rotation.set(pose.pitch, pose.yaw, pose.roll + bobRoll);

    playerState.position.set(pose.position.x, 0, pose.position.z);
    playerState.yaw = pose.yaw;
    playerState.speed = Math.hypot(st.vel.x, st.vel.z);
  });

  return null;
}

function resolveCollisions(p: Vector3, b: Props['bounds'], colliders: Collider[]) {
  for (const c of colliders) {
    if (c.kind === 'circle') {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const min = (c.r ?? 0.3) + BODY_RADIUS;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-5) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    } else {
      const hx = (c.hx ?? 0.5) + BODY_RADIUS;
      const hz = (c.hz ?? 0.5) + BODY_RADIUS;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        // push out along the axis of least penetration
        const ox = hx - Math.abs(dx);
        const oz = hz - Math.abs(dz);
        if (ox < oz) p.x = c.x + Math.sign(dx || 1) * hx;
        else p.z = c.z + Math.sign(dz || 1) * hz;
      }
    }
  }
  p.x = clamp(p.x, b.x0, b.x1);
  p.z = clamp(p.z, b.z0, b.z1);
}
